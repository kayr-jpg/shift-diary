import { z } from "zod";
import type { ErrorCode } from "./errors";

export type Trip = {
  id: string;
  start: string;
  end: string;
  amount: number;
  commission: number;
  payment: "cash" | "card";
};

export type FieldError = { field: keyof Trip; code: ErrorCode };

const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

/** Parses an ISO 8601 date-time with explicit offset; returns epoch ms or null. */
export function parseIsoInstant(value: string): number | null {
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, , oh, om] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  if (Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)) return null;
  if (oh !== undefined && (Number(oh) > 23 || Number(om) > 59)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

const time = z
  .string({ error: "TIME_INVALID" })
  .refine((v) => parseIsoInstant(v) !== null, { error: "TIME_INVALID" });

const baseShape = {
  id: z.string({ error: "ID_INVALID" }).regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "ID_INVALID" }),
  start: time,
  end: time,
  amount: z
    .number({ error: "AMOUNT_INVALID" })
    .int({ error: "AMOUNT_INVALID" })
    .positive({ error: "AMOUNT_INVALID" }),
  commission: z
    .number({ error: "COMMISSION_INVALID" })
    .int({ error: "COMMISSION_INVALID" })
    .nonnegative({ error: "COMMISSION_INVALID" }),
  payment: z.enum(["cash", "card"], { error: "PAYMENT_INVALID" }),
};

// Unknown keys are ignored (stripped), not rejected: FieldError has no code for them.
const crossFieldCheck = z.superRefine(
  (trip: Partial<Record<keyof Trip, unknown>>, ctx) => {
    const start = typeof trip.start === "string" ? parseIsoInstant(trip.start) : null;
    const end = typeof trip.end === "string" ? parseIsoInstant(trip.end) : null;
    if (start !== null && end !== null) {
      if (end <= start) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "END_BEFORE_START" });
      } else if (end - start > MAX_DURATION_MS) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "DURATION_TOO_LONG" });
      }
    }
    const { amount, commission } = trip;
    const amountOk = typeof amount === "number" && Number.isInteger(amount) && amount > 0;
    const commissionOk = typeof commission === "number" && Number.isInteger(commission) && commission >= 0;
    if (amountOk && commissionOk && commission > amount) {
      ctx.addIssue({ code: "custom", path: ["commission"], message: "COMMISSION_INVALID" });
    }
  },
  // Zod skips checks once an earlier issue exists; `when` makes the cross-field checks run even if an unrelated field failed.
  { when: () => true },
);

export const TripSchema = z.object(baseShape).check(crossFieldCheck);

const FIELDS = Object.keys(baseShape) as (keyof Trip)[];

export function validateTrip(
  input: unknown,
): { ok: true; trip: Trip } | { ok: false; errors: FieldError[] } {
  // Non-objects (null, strings, arrays) report every required field as missing.
  const isRecord = typeof input === "object" && input !== null && !Array.isArray(input);
  const result = TripSchema.safeParse(isRecord ? input : {});
  if (result.success) return { ok: true, trip: result.data };
  const seen = new Set<string>();
  const errors: FieldError[] = [];
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof Trip | undefined;
    if (field === undefined || !FIELDS.includes(field)) continue;
    const key = `${field}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    errors.push({ field, code: issue.message as ErrorCode });
  }
  return { ok: false, errors };
}
