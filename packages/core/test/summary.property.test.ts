import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/canonical";
import { summarize, type Summary } from "../src/summary";
import { localDateOf } from "../src/time";
import type { Trip } from "../src/trip";

const RUNS = { numRuns: 300 };
const MIN = 60_000;
const START_MIN_MS = Date.UTC(2026, 0, 1);
const START_MAX_MS = Date.UTC(2026, 11, 31, 23, 59);

const OFFSETS = ["+05:00", "Z", "+03:00"] as const;
const OFFSET_MS: Record<(typeof OFFSETS)[number], number> = {
  "+05:00": 5 * 3_600_000,
  Z: 0,
  "+03:00": 3 * 3_600_000,
};

/** Formats an instant as ISO with the given offset (minute precision). */
function format(instantMs: number, offset: (typeof OFFSETS)[number]): string {
  const d = new Date(instantMs + OFFSET_MS[offset]);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00${offset}`
  );
}

const tripsArb = fc
  .array(
    fc.record({
      startMin: fc.integer({
        min: Math.ceil(START_MIN_MS / MIN),
        max: Math.floor(START_MAX_MS / MIN),
      }),
      durationMin: fc.integer({ min: 1, max: 12 * 60 }),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      commissionPct: fc.double({ min: 0, max: 1, noNaN: true }),
      payment: fc.constantFrom("cash" as const, "card" as const),
      offset: fc.constantFrom(...OFFSETS),
    }),
    { maxLength: 40 },
  )
  .map((rows) =>
    rows.map((r, i): { trip: Trip; startMs: number; endMs: number } => {
      const startMs = r.startMin * MIN;
      const endMs = startMs + r.durationMin * MIN;
      return {
        startMs,
        endMs,
        trip: {
          id: `trip-${i}`,
          start: format(startMs, r.offset),
          end: format(endMs, r.offset),
          amount: r.amount,
          commission: Math.min(r.amount, Math.floor(r.amount * r.commissionPct)),
          payment: r.payment,
        },
      };
    }),
  );

const FIELDS: (keyof Summary)[] = ["tripCount", "revenue", "commission", "net", "cash", "card"];

describe("summarize properties", () => {
  it("net === revenue - commission", () => {
    fc.assert(
      fc.property(tripsArb, (items) => {
        const s = summarize(items.map((i) => i.trip));
        expect(s.net).toBe(s.revenue - s.commission);
      }),
      RUNS,
    );
  });

  it("cash + card === revenue", () => {
    fc.assert(
      fc.property(tripsArb, (items) => {
        const s = summarize(items.map((i) => i.trip));
        expect(s.cash + s.card).toBe(s.revenue);
      }),
      RUNS,
    );
  });

  it("sum of per-day summaries equals summarize(all)", () => {
    fc.assert(
      fc.property(tripsArb, (items) => {
        const canon = items.map((i) => canonicalize(i.trip));
        const byDay = new Map<string, typeof canon>();
        for (const c of canon) {
          const day = localDateOf(c.startUtc);
          byDay.set(day, [...(byDay.get(day) ?? []), c]);
        }
        const all = summarize(canon);
        for (const f of FIELDS) {
          let total = 0;
          for (const group of byDay.values()) total += summarize(group)[f];
          expect(total).toBe(all[f]);
        }
      }),
      RUNS,
    );
  });

  it("canonicalize is offset-insensitive", () => {
    fc.assert(
      fc.property(tripsArb, (items) => {
        for (const { trip, startMs, endMs } of items) {
          const inUtc: Trip = { ...trip, start: format(startMs, "Z"), end: format(endMs, "Z") };
          expect(canonicalize(inUtc)).toEqual(canonicalize(trip));
        }
      }),
      RUNS,
    );
  });

  it("canonicalize is idempotent on its own output", () => {
    fc.assert(
      fc.property(tripsArb, (items) => {
        for (const { trip } of items) {
          const once = canonicalize(trip);
          const back: Trip = {
            id: once.id,
            start: format(once.startUtc, "Z"),
            end: format(once.endUtc, "Z"),
            amount: once.amount,
            commission: once.commission,
            payment: once.payment,
          };
          expect(canonicalize(back)).toEqual(once);
        }
      }),
      RUNS,
    );
  });
});
