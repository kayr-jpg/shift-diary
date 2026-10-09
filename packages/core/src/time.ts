export const KZ_OFFSET = "+05:00";

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD, real calendar date. */
export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Local (+05:00) calendar date of an instant. */
export function localDateOf(instantMs: number): string {
  const d = new Date(instantMs + OFFSET_MS);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Half-open [from, to) epoch-ms range of a local (+05:00) day. */
export function dayRange(date: string): { from: number; to: number } {
  const m = DATE_RE.exec(date);
  if (!m || !isValidDate(date)) throw new RangeError(`invalid date: ${date}`);
  const from = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - OFFSET_MS;
  return { from, to: from + DAY_MS };
}
