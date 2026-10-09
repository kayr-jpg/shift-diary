import { describe, expect, it } from "vitest";
import { formatMoney } from "../src/money";

const NBSP = " ";
const MINUS = "−";

describe("formatMoney", () => {
  it("groups thousands with U+00A0 and suffixes ₸ after U+00A0", () => {
    expect(formatMoney(3315, "ru")).toBe(`3${NBSP}315${NBSP}₸`);
  });

  it("is identical in every language", () => {
    expect(formatMoney(3315, "kk")).toBe(`3${NBSP}315${NBSP}₸`);
    expect(formatMoney(3315, "en")).toBe(`3${NBSP}315${NBSP}₸`);
  });

  it("formats zero and small numbers without grouping", () => {
    expect(formatMoney(0, "ru")).toBe(`0${NBSP}₸`);
    expect(formatMoney(585, "ru")).toBe(`585${NBSP}₸`);
  });

  it("groups millions", () => {
    expect(formatMoney(1000000, "ru")).toBe(`1${NBSP}000${NBSP}000${NBSP}₸`);
  });

  it("prefixes negatives with U+2212", () => {
    expect(formatMoney(-3315, "ru")).toBe(`${MINUS}3${NBSP}315${NBSP}₸`);
  });

  it("never emits a regular space", () => {
    expect(formatMoney(1234567, "en")).not.toContain(" ");
  });
});
