import { describe, expect, it } from "vitest";
import { canonicalize, diffCanonical, findOverlaps } from "../src/canonical";
import type { Trip } from "../src/trip";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:40:00+05:00",
  amount: 2400,
  commission: 200,
  payment: "cash",
  ...over,
});

describe("canonicalize / diffCanonical", () => {
  it("normalizes equivalent instants", () => {
    const a = canonicalize(trip());
    const b = canonicalize(trip({ start: "2026-10-01T03:10:00Z", end: "2026-10-01T03:40:00Z" }));
    expect(a).toEqual(b);
    expect(diffCanonical(a, b)).toEqual({});
  });
  it("reports differing fields by Trip field name", () => {
    const a = canonicalize(trip());
    const b = canonicalize(trip({ amount: 2500 }));
    expect(diffCanonical(a, b)).toEqual({ amount: [2400, 2500] });
  });
  it("maps startUtc/endUtc to start/end and ignores id", () => {
    const a = canonicalize(trip());
    const b = canonicalize(trip({ id: "other", end: "2026-10-01T08:50:00+05:00" }));
    expect(diffCanonical(a, b)).toEqual({ end: [a.endUtc, b.endUtc] });
  });
});

describe("findOverlaps", () => {
  const c = canonicalize(trip());
  it("returns ids of partially overlapping trips", () => {
    const o = canonicalize(
      trip({ id: "o1", start: "2026-10-01T08:30:00+05:00", end: "2026-10-01T09:00:00+05:00" }),
    );
    expect(findOverlaps(c, [o])).toEqual(["o1"]);
  });
  it("treats touching intervals as non-overlapping", () => {
    const o = canonicalize(
      trip({ id: "o2", start: "2026-10-01T08:40:00+05:00", end: "2026-10-01T09:00:00+05:00" }),
    );
    expect(findOverlaps(c, [o])).toEqual([]);
  });
  it("ignores same id", () => {
    expect(findOverlaps(c, [canonicalize(trip())])).toEqual([]);
  });
});
