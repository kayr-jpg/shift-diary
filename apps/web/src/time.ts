import { isValidDate, localDateOf } from "@shift/core";

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * "HH:mm" of an ISO instant in Kazakhstan time (+05:00). The instant is taken from the
 * string's own offset and shifted by a fixed +5h, so the device timezone never matters.
 */
export function formatTime(iso: string): string {
  const d = new Date(Date.parse(iso) + OFFSET_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** "08:10–08:32" (en dash). */
export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** Today's calendar date in Kazakhstan. */
export function todayKz(): string {
  return localDateOf(Date.now());
}

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** Calendar arithmetic on YYYY-MM-DD strings (timezone-free). */
export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${String(t.getUTCFullYear()).padStart(4, "0")}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function dayOfMonth(date: string): number {
  return parts(date).d;
}

export function monthOf(date: string): number {
  return parts(date).m;
}

/** A valid date from a location hash like "#2026-10-01", else null. */
export function dateFromHash(hash: string): string | null {
  const v = hash.replace(/^#/, "");
  return isValidDate(v) ? v : null;
}
