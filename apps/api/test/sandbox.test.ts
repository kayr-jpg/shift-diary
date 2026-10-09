import { describe, expect, it } from "vitest";
import { SEED, makeTestApp, trip } from "./helpers";

type TripsBody = { trips: Array<{ id: string }> };
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("sandbox middleware", () => {
  it("no cookie/header → seeded sandbox, X-Sandbox-Id header and HttpOnly SameSite=Lax cookie", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const res = await req("/api/trips?date=2026-10-01", { sandbox: null });
    expect(res.status).toBe(200);
    const id = res.headers.get("X-Sandbox-Id");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`sid=${id}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=604800");
    expect(setCookie).not.toContain("Secure");
    expect(((await res.json()) as TripsBody).trips).toHaveLength(2);
  });

  it("adds Secure on https requests", async () => {
    const { app } = await makeTestApp();
    const res = await app.request("https://example.com/api/days");
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("cookie round-trip keeps the same sandbox and its data", async () => {
    const { app } = await makeTestApp({ seed: SEED });
    const first = await app.request("/api/days");
    const id = first.headers.get("X-Sandbox-Id") as string;
    const post = await app.request("/api/trips", {
      method: "POST",
      headers: { Cookie: cookieOf(first), "Content-Type": "application/json" },
      body: JSON.stringify(trip({ id: "mine" })),
    });
    expect(post.status).toBe(201);
    expect(post.headers.get("X-Sandbox-Id")).toBe(id);
    const again = await app.request("/api/trips?date=2026-10-01", { headers: { Cookie: `sid=${id}` } });
    expect(again.headers.get("X-Sandbox-Id")).toBe(id);
    expect(((await again.json()) as TripsBody).trips.map((t) => t.id)).toContain("mine");
  });

  it("header takes precedence over cookie", async () => {
    const { app, repo } = await makeTestApp();
    await repo.createSandbox("a".repeat(32), [], 1);
    await repo.createSandbox("b".repeat(32), [], 1);
    const res = await app.request("/api/days", {
      headers: { "X-Sandbox-Id": "a".repeat(32), Cookie: `sid=${"b".repeat(32)}` },
    });
    expect(res.headers.get("X-Sandbox-Id")).toBe("a".repeat(32));
  });

  it("garbage and well-formed-unknown ids → new sandbox with own seed only", async () => {
    const { req, repo } = await makeTestApp({ seed: SEED });
    const other = "c".repeat(32);
    await repo.createSandbox(other, [], 1);
    for (const sent of ["garbage", "d".repeat(32)]) {
      const res = await req("/api/trips?date=2026-10-01", { sandbox: sent });
      expect(res.status).toBe(200);
      const id = res.headers.get("X-Sandbox-Id");
      expect(id).not.toBe(sent);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(((await res.json()) as TripsBody).trips.map((t) => t.id)).toEqual(["t1", "t2"]);
      expect(await repo.sandboxExists(sent)).toBe(false);
    }
  });

  it("two sandboxes are isolated on GET", async () => {
    const { app, post, sandboxId } = await makeTestApp();
    await post(trip({ id: "only-a" }));
    const other = await app.request("/api/trips?date=2026-10-01");
    expect(((await other.json()) as TripsBody).trips).toEqual([]);
    const mine = await app.request("/api/trips?date=2026-10-01", { headers: { "X-Sandbox-Id": sandboxId } });
    expect(((await mine.json()) as TripsBody).trips).toHaveLength(1);
  });
});

describe("POST /api/sandbox/reset", () => {
  it("→ 204, removes added trips and restores the seed", async () => {
    const { req, post, repo, sandboxId } = await makeTestApp({ seed: SEED });
    await repo.resetSandbox(sandboxId, [], 1);
    await post(trip({ id: "added", start: "2026-10-01T10:00:00+05:00", end: "2026-10-01T10:10:00+05:00" }));
    const res = await req("/api/sandbox/reset", { method: "POST" });
    expect(res.status).toBe(204);
    const all = await repo.listAll(sandboxId);
    expect(all.map((t) => t.id)).not.toContain("added");
    expect(all).toHaveLength(SEED.length);
  });

  it("without a sandbox creates one (seeded) and still returns 204", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const res = await req("/api/sandbox/reset", { method: "POST", sandbox: null });
    expect(res.status).toBe(204);
    expect(res.headers.get("X-Sandbox-Id")).toMatch(/^[0-9a-f]{32}$/);
  });
});
