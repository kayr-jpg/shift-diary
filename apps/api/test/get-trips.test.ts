import { describe, expect, it } from "vitest";
import { SEED, makeTestApp } from "./helpers";

type Body = { date: string; timezone: string; summary: Record<string, number>; trips: Array<Record<string, unknown>> };

describe("GET /api/trips", () => {
  it("2026-10-01 → exact brief summary, trips sorted by start", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const body = (await (await req("/api/trips?date=2026-10-01", { sandbox: null })).json()) as Body;
    expect(body.date).toBe("2026-10-01");
    expect(body.timezone).toBe("+05:00");
    expect(body.summary).toEqual({ tripCount: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 });
    expect(body.trips.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(body.trips[0]).toMatchObject({ start: "2026-10-01T08:10:00+05:00", durationMinutes: 22 });
    expect(body.trips[0]).not.toHaveProperty("warnings");
  });

  it("empty day → zero summary and no trips", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const body = (await (await req("/api/trips?date=2026-01-01", { sandbox: null })).json()) as Body;
    expect(body.summary).toEqual({ tripCount: 0, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 });
    expect(body.trips).toEqual([]);
  });

  it("midnight-crossing trip appears on its start day only", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const start = (await (await req("/api/trips?date=2026-09-29", { sandbox: null })).json()) as Body;
    expect(start.trips.map((t) => t.id)).toContain("t6");
    const next = (await (await req("/api/trips?date=2026-09-30", { sandbox: null })).json()) as Body;
    expect(next.trips.map((t) => t.id)).not.toContain("t6");
  });

  it("overlapping seed pair carries OVERLAP warnings on both", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const body = (await (await req("/api/trips?date=2026-09-30", { sandbox: null })).json()) as Body;
    const by = Object.fromEntries(body.trips.map((t) => [t.id as string, t]));
    expect(by.t7?.warnings).toEqual([{ code: "OVERLAP", with: "t8" }]);
    expect(by.t8?.warnings).toEqual([{ code: "OVERLAP", with: "t7" }]);
  });

  it("flags overlap with a trip that started the previous day", async () => {
    const { req, post } = await makeTestApp();
    await post({ id: "late", start: "2026-10-01T23:50:00+05:00", end: "2026-10-02T00:30:00+05:00", amount: 100, commission: 10, payment: "cash" });
    await post({ id: "early", start: "2026-10-02T00:10:00+05:00", end: "2026-10-02T00:20:00+05:00", amount: 100, commission: 10, payment: "cash" });
    const body = (await (await req("/api/trips?date=2026-10-02")).json()) as Body;
    expect(body.trips.map((t) => t.id)).toEqual(["early"]);
    expect(body.trips[0]?.warnings).toEqual([{ code: "OVERLAP", with: "late" }]);
  });

  it("flags overlap with a trip starting the next day, symmetrically; back-to-back is not flagged", async () => {
    const { req, post } = await makeTestApp();
    const t = (id: string, start: string, end: string) => ({ id, start, end, amount: 100, commission: 10, payment: "cash" });
    await post(t("late", "2026-10-01T23:50:00+05:00", "2026-10-02T00:30:00+05:00"));
    await post(t("early", "2026-10-02T00:10:00+05:00", "2026-10-02T00:20:00+05:00"));
    await post(t("touch", "2026-10-02T00:30:00+05:00", "2026-10-02T00:40:00+05:00"));
    const d1 = (await (await req("/api/trips?date=2026-10-01")).json()) as Body;
    expect(d1.trips.map((x) => x.id)).toEqual(["late"]);
    expect(d1.trips[0]?.warnings).toEqual([{ code: "OVERLAP", with: "early" }]);
    expect(d1.summary.tripCount).toBe(1);
    const d2 = (await (await req("/api/trips?date=2026-10-02")).json()) as Body;
    const by = Object.fromEntries(d2.trips.map((x) => [x.id as string, x]));
    expect(by.early?.warnings).toEqual([{ code: "OVERLAP", with: "late" }]);
    expect(by.touch).not.toHaveProperty("warnings");
  });

  it.each([["missing", ""], ["2026-02-30", "?date=2026-02-30"], ["26-10-01", "?date=26-10-01"], ["2026-13-01", "?date=2026-13-01"], ["empty", "?date="]])(
    "invalid date (%s) → 422 DATE_INVALID",
    async (_n, qs) => {
      const { req } = await makeTestApp();
      const res = await req(`/api/trips${qs}`);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ errors: [{ field: "date", code: "DATE_INVALID" }] });
    },
  );
});

describe("GET /api/days", () => {
  it("lists local dates ascending with counts; midnight trip counted on start day", async () => {
    const { req } = await makeTestApp({ seed: SEED });
    const { days } = (await (await req("/api/days", { sandbox: null })).json()) as { days: Array<{ date: string; tripCount: number }> };
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
    expect(days.find((d) => d.date === "2026-10-01")).toEqual({ date: "2026-10-01", tripCount: 2 });
    expect(days.find((d) => d.date === "2026-09-29")?.tripCount).toBe(2);
    expect(days.find((d) => d.date === "2026-09-30")?.tripCount).toBe(2);
    expect(days.reduce((n, d) => n + d.tripCount, 0)).toBe(SEED.length);
  });
});
