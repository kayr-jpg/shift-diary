import { afterEach, describe, expect, it, vi } from "vitest";
import type { TripRepository } from "../src/repo";
import { makeTestApp, NOW, trip } from "./helpers";

const ALL_FIELDS = ["id", "start", "end", "amount", "commission", "payment"];

afterEach(() => {
  vi.restoreAllMocks();
});

const OTHER = "e".repeat(32);

describe("POST /api/trips — idempotency", () => {
  it("creates a new trip: 201 with the trip, original offsets preserved", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    const res = await post(trip());
    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotent-Replay")).toBeNull();
    expect(await res.json()).toEqual(trip());
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
  });

  it("replays an identical payload: 200 + Idempotent-Replay, still one row", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    await post(trip());
    const res = await post(trip());
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotent-Replay")).toBe("true");
    expect(await res.json()).toEqual(trip());
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
  });

  it("treats an equal instant in another offset as a replay and returns the FIRST stored form", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    await post(trip());
    const res = await post(trip({ start: "2026-10-01T03:10:00Z", end: "2026-10-01T03:32:00Z" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Idempotent-Replay")).toBe("true");
    expect(await res.json()).toEqual(trip());
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
  });

  it("keeps a 'Z' offset as given (no normalisation) on create and on replay", async () => {
    const { post } = await makeTestApp();
    const zulu = trip({ start: "2026-10-01T03:10:00Z", end: "2026-10-01T03:32:00Z" });
    const created = await post(zulu);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(zulu);
    const replay = await post(trip());
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(zulu);
  });

  it("rejects the same id with a different amount: 409 with a field diff", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    await post(trip());
    const res = await post(trip({ amount: 2500 }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "ID_CONFLICT", diff: { amount: [2400, 2500] } });
    const rows = await repo.listAll(sandboxId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(2400);
  });

  it("renders start/end diffs as ISO strings: stored offset vs the string sent", async () => {
    const { post } = await makeTestApp();
    await post(trip());
    const res = await post(
      trip({ start: "2026-10-01T03:15:00Z", end: "2026-10-01T08:32:00+05:00", payment: "cash" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "ID_CONFLICT",
      diff: {
        start: ["2026-10-01T08:10:00+05:00", "2026-10-01T03:15:00Z"],
        payment: ["card", "cash"],
      },
    });
  });
});

describe("POST /api/trips — validation (422)", () => {
  const cases: [string, string, string, Record<string, unknown>][] = [
    ["empty id", "id", "ID_INVALID", trip({ id: "" })],
    ["id with a space", "id", "ID_INVALID", trip({ id: "t 1" })],
    ["id over 64 chars", "id", "ID_INVALID", trip({ id: "a".repeat(65) })],
    ["start without offset", "start", "TIME_INVALID", trip({ start: "2026-10-01T08:10:00" })],
    ["end not a date", "end", "TIME_INVALID", trip({ end: "yesterday" })],
    ["start as number", "start", "TIME_INVALID", trip({ start: 1 })],
    ["end before start", "end", "END_BEFORE_START", trip({ end: "2026-10-01T08:00:00+05:00" })],
    ["end equals start", "end", "END_BEFORE_START", trip({ end: "2026-10-01T08:10:00+05:00" })],
    ["duration over 12h", "end", "DURATION_TOO_LONG", trip({ end: "2026-10-01T20:10:01+05:00" })],
    ["amount zero", "amount", "AMOUNT_INVALID", trip({ amount: 0 })],
    ["amount fractional", "amount", "AMOUNT_INVALID", trip({ amount: 10.5 })],
    ["amount as string", "amount", "AMOUNT_INVALID", trip({ amount: "2400" })],
    ["commission negative", "commission", "COMMISSION_INVALID", trip({ commission: -1 })],
    ["commission > amount", "commission", "COMMISSION_INVALID", trip({ commission: 2401 })],
    ["commission fractional", "commission", "COMMISSION_INVALID", trip({ commission: 1.5 })],
    ["payment unknown", "payment", "PAYMENT_INVALID", trip({ payment: "crypto" })],
    ["payment missing", "payment", "PAYMENT_INVALID", trip({ payment: undefined })],
  ];

  it.each(cases)("%s → 422 %s/%s", async (_name, field, code, body) => {
    const { post, repo, sandboxId } = await makeTestApp();
    const res = await post(body);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { errors: { field: string; code: string }[] };
    expect(json.errors).toContainEqual({ field, code });
    expect(await repo.listAll(sandboxId)).toHaveLength(0);
  });

  it.each(["not json", "", "null", "[]", "42", '"str"', "{"])(
    "malformed body %j → 422 reporting every field, never 500",
    async (raw) => {
      const { post } = await makeTestApp();
      const res = await post(raw, { raw: true });
      expect(res.status).toBe(422);
      const json = (await res.json()) as { errors: { field: string; code: string }[] };
      expect(new Set(json.errors.map((e) => e.field))).toEqual(new Set(ALL_FIELDS));
    },
  );
});

describe("POST /api/trips — overlap warnings", () => {
  it("accepts an overlapping trip with an OVERLAP warning", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    await post(trip());
    const res = await post(
      trip({ id: "t2", start: "2026-10-01T08:20:00+05:00", end: "2026-10-01T08:40:00+05:00" }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ...trip({ id: "t2", start: "2026-10-01T08:20:00+05:00", end: "2026-10-01T08:40:00+05:00" }),
      warnings: [{ code: "OVERLAP", with: "t1" }],
    });
    expect(await repo.listAll(sandboxId)).toHaveLength(2);
  });

  it("omits the warnings key for back-to-back trips", async () => {
    const { post } = await makeTestApp();
    await post(trip());
    const res = await post(
      trip({ id: "t2", start: "2026-10-01T08:32:00+05:00", end: "2026-10-01T08:50:00+05:00" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty("warnings");
  });

  it("detects overlap with a trip that started on the previous day", async () => {
    const { post } = await makeTestApp();
    await post(trip({ start: "2026-09-30T23:50:00+05:00", end: "2026-10-01T00:20:00+05:00" }));
    const res = await post(
      trip({ id: "t2", start: "2026-10-01T00:10:00+05:00", end: "2026-10-01T00:30:00+05:00" }),
    );
    expect(res.status).toBe(201);
    expect(((await res.json()) as { warnings: unknown }).warnings).toEqual([
      { code: "OVERLAP", with: "t1" },
    ]);
  });

  it("does not add warnings to a replay", async () => {
    const { post } = await makeTestApp();
    await post(trip());
    const t2 = trip({ id: "t2", start: "2026-10-01T08:20:00+05:00", end: "2026-10-01T08:40:00+05:00" });
    await post(t2);
    const res = await post(t2);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(t2);
  });
});

describe("POST /api/trips — sandboxes", () => {
  it("isolates the same id across sandboxes: both 201, one row each", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    await repo.createSandbox(OTHER, [], NOW);
    const a = await post(trip());
    const b = await post(trip({ amount: 9999 }), { sandbox: OTHER });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
    const other = await repo.listAll(OTHER);
    expect(other).toHaveLength(1);
    expect(other[0]?.amount).toBe(9999);
  });

  it("does not warn about overlaps with trips of another sandbox", async () => {
    const { post, repo } = await makeTestApp();
    await repo.createSandbox(OTHER, [], NOW);
    await post(trip(), { sandbox: OTHER });
    const res = await post(trip({ id: "t2" }));
    expect(res.status).toBe(201);
    expect(await res.json()).not.toHaveProperty("warnings");
  });

  it("missing X-Sandbox-Id → creates a fresh sandbox and stores the trip there", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    const res = await post(trip(), { sandbox: null });
    expect(res.status).toBe(201);
    const id = res.headers.get("X-Sandbox-Id");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await repo.listAll(id as string)).toHaveLength(1);
    expect(await repo.listAll(sandboxId)).toHaveLength(0);
  });

  it("unknown X-Sandbox-Id → fresh sandbox, nothing stored under the sent id", async () => {
    const { post, repo } = await makeTestApp();
    const res = await post(trip(), { sandbox: "nope" });
    expect(res.status).toBe(201);
    expect(res.headers.get("X-Sandbox-Id")).not.toBe("nope");
    expect(await repo.listAll("nope")).toHaveLength(0);
  });

  it("body over 16 KB → 413 BODY_TOO_LARGE", async () => {
    const { post } = await makeTestApp();
    const res = await post(trip({ id: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ code: "BODY_TOO_LARGE" });
  });
});

describe("POST /api/trips — concurrency", () => {
  it("20 concurrent identical POSTs → exactly one 201, nineteen 200, one row", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    const responses = await Promise.all(Array.from({ length: 20 }, () => post(trip())));
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
    for (const r of responses.filter((x) => x.status === 200)) {
      expect(r.headers.get("Idempotent-Replay")).toBe("true");
    }
    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const b of bodies) expect(b).toEqual(trip());
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
  });

  it("20 concurrent POSTs of one id with mixed payloads → one 201, the rest 200 or 409", async () => {
    const { post, repo, sandboxId } = await makeTestApp();
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(trip({ amount: i % 2 === 0 ? 2400 : 2500 }))),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(9);
    expect(statuses.filter((s) => s === 409)).toHaveLength(10);
    expect(await repo.listAll(sandboxId)).toHaveLength(1);
  });
});

describe("POST /api/trips — internal errors", () => {
  it("a throwing repo → 500 {code:INTERNAL}, no stack in the body, one JSON log line", async () => {
    const boom = () => Promise.reject(new Error("db exploded: secret detail"));
    const repo: TripRepository = {
      createSandbox: boom,
      sandboxExists: () => Promise.resolve(true),
      touchSandbox: () => Promise.resolve(),
      insertIfAbsent: boom,
      listRange: boom,
      listAll: boom,
      resetSandbox: boom,
      deleteStale: boom,
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { post } = await makeTestApp({ repo });
    const res = await post(trip());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code: "INTERNAL" });
    expect(text).not.toContain("secret detail");
    expect(text).not.toContain("at ");
    expect(errSpy).toHaveBeenCalledTimes(1);
    const [line] = errSpy.mock.calls[0] as [string];
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({ level: "error", code: "INTERNAL", path: "/api/trips" });
  });
});
