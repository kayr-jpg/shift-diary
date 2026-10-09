import { describe, expect, it } from "vitest";
import type { ErrorCode } from "@shift/core";
import ru from "../src/locales/ru.json";
import kk from "../src/locales/kk.json";
import en from "../src/locales/en.json";

// core exports ErrorCode only as a type, so list the codes here. The `satisfies` check
// fails to compile if a code is added to or removed from the union.
const CODES = {
  ID_INVALID: true,
  TIME_INVALID: true,
  END_BEFORE_START: true,
  DURATION_TOO_LONG: true,
  AMOUNT_INVALID: true,
  COMMISSION_INVALID: true,
  PAYMENT_INVALID: true,
  DATE_INVALID: true,
  ID_CONFLICT: true,
} as const satisfies Record<ErrorCode, true>;
type Exact = keyof typeof CODES extends ErrorCode ? (ErrorCode extends keyof typeof CODES ? true : never) : never;
const exact: Exact = true;

function flatten(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

describe("locales", () => {
  const keys = { ru: flatten(ru).sort(), kk: flatten(kk).sort(), en: flatten(en).sort() };

  it("ru, kk and en have identical key sets", () => {
    expect(keys.kk).toEqual(keys.ru);
    expect(keys.en).toEqual(keys.ru);
  });

  it("has a message for every ErrorCode plus NETWORK and INTERNAL", () => {
    expect(exact).toBe(true);
    for (const code of [...Object.keys(CODES), "NETWORK", "INTERNAL"]) {
      expect(keys.ru).toContain(`errors.${code}`);
    }
  });

  it("has no empty strings", () => {
    for (const [lang, obj] of Object.entries({ ru, kk, en })) {
      const empty = flatten(obj).filter((k) => {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], obj);
        return typeof v !== "string" || v.trim() === "";
      });
      expect(empty, lang).toEqual([]);
    }
  });
});
