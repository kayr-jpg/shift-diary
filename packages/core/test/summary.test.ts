import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/canonical";
import { summarize } from "../src/summary";
import { localDateOf } from "../src/time";
import type { Trip } from "../src/trip";

type Row = { amount: number; commission: number; payment: "cash" | "card" };

describe("summarize", () => {
  it("sums the brief example", () => {
    const rows: Row[] = [
      { amount: 1500, commission: 225, payment: "cash" },
      { amount: 2400, commission: 360, payment: "card" },
    ];
    expect(summarize(rows)).toEqual({
      tripCount: 2,
      revenue: 3900,
      commission: 585,
      net: 3315,
      cash: 1500,
      card: 2400,
    });
  });

  it("returns all zeros for no trips", () => {
    expect(summarize([])).toEqual({
      tripCount: 0,
      revenue: 0,
      commission: 0,
      net: 0,
      cash: 0,
      card: 0,
    });
  });

  it("handles cash-only", () => {
    expect(
      summarize([
        { amount: 1000, commission: 100, payment: "cash" },
        { amount: 500, commission: 0, payment: "cash" },
      ]),
    ).toEqual({ tripCount: 2, revenue: 1500, commission: 100, net: 1400, cash: 1500, card: 0 });
  });

  it("handles card-only", () => {
    expect(summarize([{ amount: 700, commission: 70, payment: "card" }])).toEqual({
      tripCount: 1,
      revenue: 700,
      commission: 70,
      net: 630,
      cash: 0,
      card: 700,
    });
  });

  it("counts a midnight-crossing trip on its start day", () => {
    const trip: Trip = {
      id: "m1",
      start: "2026-10-01T23:50:00+05:00",
      end: "2026-10-02T00:20:00+05:00",
      amount: 2000,
      commission: 300,
      payment: "cash",
    };
    const c = canonicalize(trip);
    expect(localDateOf(c.startUtc)).toBe("2026-10-01");
    const byDay = new Map<string, Row[]>();
    for (const t of [c]) {
      const day = localDateOf(t.startUtc);
      byDay.set(day, [...(byDay.get(day) ?? []), t]);
    }
    expect([...byDay.keys()]).toEqual(["2026-10-01"]);
    expect(summarize(byDay.get("2026-10-01") ?? []).tripCount).toBe(1);
    expect(byDay.get("2026-10-02")).toBeUndefined();
  });
});
