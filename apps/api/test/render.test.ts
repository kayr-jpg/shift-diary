import { describe, expect, it } from "vitest";
import type { Trip } from "@shift/core";
import { offsetOf, renderInstant, renderTrip, toStoredTrip } from "../src/render";

describe("offsetOf", () => {
  it.each([
    ["2026-10-01T08:10:00+05:00", "+05:00"],
    ["2026-10-01T03:10:00Z", "Z"],
    ["2026-10-01T03:10Z", "Z"],
    ["2026-10-01T00:10:00.250-03:30", "-03:30"],
  ])("%s → %s", (iso, offset) => {
    expect(offsetOf(iso)).toBe(offset);
  });
});

describe("renderInstant", () => {
  const instant = Date.UTC(2026, 9, 1, 3, 10, 0);
  it("renders in the given offset", () => {
    expect(renderInstant(instant, "+05:00")).toBe("2026-10-01T08:10:00+05:00");
    expect(renderInstant(instant, "Z")).toBe("2026-10-01T03:10:00Z");
    expect(renderInstant(instant, "-03:30")).toBe("2026-09-30T23:40:00-03:30");
  });
  it("crosses the date line forwards", () => {
    expect(renderInstant(Date.UTC(2026, 11, 31, 20, 0), "+05:00")).toBe(
      "2027-01-01T01:00:00+05:00",
    );
  });
  it("keeps milliseconds only when present", () => {
    expect(renderInstant(instant + 250, "+05:00")).toBe("2026-10-01T08:10:00.250+05:00");
  });
});

describe("renderTrip / toStoredTrip", () => {
  const t: Trip = {
    id: "t1",
    start: "2026-10-01T08:10:00+05:00",
    end: "2026-10-01T03:32:00Z",
    amount: 2400,
    commission: 360,
    payment: "card",
  };
  it("stores canonical instants plus the original offsets", () => {
    expect(toStoredTrip(t)).toEqual({
      id: "t1",
      startUtc: Date.UTC(2026, 9, 1, 3, 10),
      endUtc: Date.UTC(2026, 9, 1, 3, 32),
      startOffset: "+05:00",
      endOffset: "Z",
      amount: 2400,
      commission: 360,
      payment: "card",
    });
  });
  it("round-trips a trip written with seconds", () => {
    expect(renderTrip(toStoredTrip(t))).toEqual(t);
  });
});
