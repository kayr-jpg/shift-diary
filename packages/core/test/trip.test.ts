import { describe, expect, it } from "vitest";
import { validateTrip } from "../src/index";

const base = {
  id: "t1",
  start: "2026-10-01T03:10:00Z",
  end: "2026-10-01T04:00:00Z",
  amount: 1500,
  commission: 300,
  payment: "cash",
};

const codes = (input: unknown) => {
  const r = validateTrip(input);
  return r.ok ? [] : r.errors.map((e) => `${e.field}:${e.code}`).sort();
};

describe("validateTrip", () => {
  it("accepts a valid trip", () => {
    const r = validateTrip(base);
    expect(r).toEqual({ ok: true, trip: base });
  });

  it.each([
    ["", false],
    ["a b", false],
    ["é", false],
    ["a".repeat(65), false],
    ["a".repeat(64), true],
    ["t_1-A", true],
  ])("id %j valid=%s", (id, valid) => {
    expect(codes({ ...base, id })).toEqual(valid ? [] : ["id:ID_INVALID"]);
  });

  it.each([
    "2026-10-01",
    "2026-10-01T08:10:00",
    "nope",
    "2026-13-01T08:10:00Z",
    "2026-02-30T08:10:00Z",
    "2026-10-01T25:10:00Z",
    "2026-10-01T03:10:00+24:00",
    123,
    null,
  ])("start %j -> TIME_INVALID", (start) => {
    expect(codes({ ...base, start })).toEqual(["start:TIME_INVALID"]);
  });

  it("end invalid -> TIME_INVALID", () => {
    expect(codes({ ...base, end: "2026-10-01T08:10:00" })).toEqual(["end:TIME_INVALID"]);
  });

  it.each([
    "2026-10-01T03:10:00Z",
    "2026-10-01T03:10:00.123Z",
    "2026-10-01T07:10:00+04:00",
    "2026-10-01T03:10Z",
  ])("start %j accepted", (start) => {
    expect(codes({ ...base, start, end: "2026-10-01T05:00:00Z" })).toEqual([]);
  });

  it.each([
    ["equal", "2026-10-01T03:10:00Z"],
    ["earlier", "2026-10-01T03:09:59Z"],
  ])("end %s than start -> END_BEFORE_START", (_n, end) => {
    expect(codes({ ...base, end })).toEqual(["end:END_BEFORE_START"]);
  });

  it("exactly 12h ok; 12h+1s too long", () => {
    expect(codes({ ...base, end: "2026-10-01T15:10:00Z" })).toEqual([]);
    expect(codes({ ...base, end: "2026-10-01T15:10:01Z" })).toEqual(["end:DURATION_TOO_LONG"]);
  });

  it.each([0, -5, 1500.5, "1500", null, NaN, undefined])("amount %j -> AMOUNT_INVALID", (amount) => {
    expect(codes({ ...base, amount })).toEqual(["amount:AMOUNT_INVALID"]);
  });

  it.each([-1, 1.5, 1501, "3", null])("commission %j -> COMMISSION_INVALID", (commission) => {
    expect(codes({ ...base, commission })).toEqual(["commission:COMMISSION_INVALID"]);
  });

  it.each([0, 1500])("commission %j ok", (commission) => {
    expect(codes({ ...base, commission })).toEqual([]);
  });

  it("commission is not compared against an invalid amount", () => {
    expect(codes({ ...base, amount: -5, commission: 10 })).toEqual(["amount:AMOUNT_INVALID"]);
  });

  it.each(["crypto", undefined, 1, null])("payment %j -> PAYMENT_INVALID", (payment) => {
    expect(codes({ ...base, payment })).toEqual(["payment:PAYMENT_INVALID"]);
  });

  it("card payment ok", () => {
    expect(codes({ ...base, payment: "card" })).toEqual([]);
  });

  it.each([null, "x", [], {}, 5, undefined])("non-object input %j never throws", (input) => {
    const r = validateTrip(input);
    expect(r.ok).toBe(false);
    expect(codes(input)).toEqual([
      "amount:AMOUNT_INVALID",
      "commission:COMMISSION_INVALID",
      "end:TIME_INVALID",
      "id:ID_INVALID",
      "payment:PAYMENT_INVALID",
      "start:TIME_INVALID",
    ]);
  });

  it("reports all independent field errors at once", () => {
    expect(codes({ id: "", start: "x", end: "y", amount: 0, commission: -1, payment: "z" })).toEqual([
      "amount:AMOUNT_INVALID",
      "commission:COMMISSION_INVALID",
      "end:TIME_INVALID",
      "id:ID_INVALID",
      "payment:PAYMENT_INVALID",
      "start:TIME_INVALID",
    ]);
  });

  it("cross-field checks still run when unrelated fields are invalid", () => {
    expect(codes({ ...base, id: "", end: "2026-10-01T03:00:00Z" })).toEqual([
      "end:END_BEFORE_START",
      "id:ID_INVALID",
    ]);
  });

  it("cross-field checks skipped when start is invalid", () => {
    expect(codes({ ...base, start: "nope", end: "2026-10-01T03:00:00Z" })).toEqual(["start:TIME_INVALID"]);
  });

  it("ignores unknown keys and strips them from the result", () => {
    const r = validateTrip({ ...base, extra: 1 });
    expect(r).toEqual({ ok: true, trip: base });
  });
});

describe("cross-field checks despite unrelated errors", () => {
  const t = (o: object) => codes({ ...base, ...o });
  it("a: invalid payment + end before start", () => {
    expect(
      codes({ id: "a", start: "2026-10-01T10:00:00+05:00", end: "2026-10-01T09:00:00+05:00", amount: 100, commission: 10, payment: "x" }),
    ).toEqual(["end:END_BEFORE_START", "payment:PAYMENT_INVALID"]);
  });
  it("b: invalid id + too long", () => {
    expect(t({ id: "", end: "2026-10-01T15:10:01Z" })).toEqual(["end:DURATION_TOO_LONG", "id:ID_INVALID"]);
  });
  it("c: amount abc", () => {
    expect(t({ amount: "abc" })).toEqual(["amount:AMOUNT_INVALID"]);
    expect(t({ amount: "abc", end: "2026-10-01T03:00:00Z" })).toEqual(["amount:AMOUNT_INVALID", "end:END_BEFORE_START"]);
  });
  it("d: commission > amount with invalid payment", () => {
    expect(t({ amount: 100, commission: 500, payment: "x" })).toEqual(["commission:COMMISSION_INVALID", "payment:PAYMENT_INVALID"]);
  });
  it("e: commission check skipped when amount or commission invalid", () => {
    expect(t({ amount: 0, commission: 5 })).toEqual(["amount:AMOUNT_INVALID"]);
    expect(t({ amount: 100, commission: 1.5 })).toEqual(["commission:COMMISSION_INVALID"]);
    expect(t({ amount: "abc", commission: 5 })).toEqual(["amount:AMOUNT_INVALID"]);
  });
});
