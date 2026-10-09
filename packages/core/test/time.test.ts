import { describe, expect, it } from "vitest";
import { dayRange, isValidDate, localDateOf } from "../src/time";

describe("dayRange", () => {
  it("is a half-open 24h range starting at +05:00 midnight", () => {
    const r = dayRange("2026-10-01");
    expect(r.from).toBe(Date.parse("2026-10-01T00:00:00+05:00"));
    expect(r.to - r.from).toBe(86_400_000);
  });
});

describe("localDateOf", () => {
  it("maps boundary instants", () => {
    const mid = Date.parse("2026-10-01T00:00:00+05:00");
    expect(localDateOf(mid)).toBe("2026-10-01");
    expect(localDateOf(mid - 1)).toBe("2026-09-30");
  });
  it("uses local date even when UTC date differs", () => {
    const t = Date.parse("2026-10-01T02:00:00+05:00");
    expect(new Date(t).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(localDateOf(t)).toBe("2026-10-01");
  });
});

describe("isValidDate", () => {
  it.each(["2026-02-30", "2026-13-01", "26-10-01", "", "2026-1-1"])("rejects %j", (d) => {
    expect(isValidDate(d)).toBe(false);
  });
  it("accepts leap day", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
  });
});
