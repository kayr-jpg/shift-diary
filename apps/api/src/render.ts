import { canonicalize, type Trip } from "@shift/core";
import type { StoredTrip } from "./repo";

const OFFSET_RE = /(Z|[+-](\d{2}):(\d{2}))$/;

/**
 * The offset exactly as the client wrote it ("Z" stays "Z", "+05:00" stays "+05:00").
 * Assumes a string that already passed validation (core requires an explicit offset).
 */
export function offsetOf(iso: string): string {
  const m = OFFSET_RE.exec(iso);
  if (!m?.[1]) throw new RangeError(`offsetOf: no offset in ${iso}`);
  return m[1];
}

function offsetMs(offset: string): number {
  const m = OFFSET_RE.exec(offset);
  if (!m) throw new RangeError(`invalid offset: ${offset}`);
  if (m[1] === "Z") return 0;
  const sign = offset.startsWith("-") ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/** ISO-8601 local time in `offset`, e.g. "2026-10-01T08:10:00+05:00"; ms only when non-zero. */
export function renderInstant(utcMs: number, offset: string): string {
  const d = new Date(utcMs + offsetMs(offset));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const ms = d.getUTCMilliseconds();
  return (
    `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` +
    (ms ? `.${p(ms, 3)}` : "") +
    offset
  );
}

/** Assumes an already-valid Trip. */
export function toStoredTrip(trip: Trip): StoredTrip {
  return {
    ...canonicalize(trip),
    startOffset: offsetOf(trip.start),
    endOffset: offsetOf(trip.end),
  };
}

/** The API's view of a stored trip: times rendered in the offsets originally supplied. */
export function renderTrip(stored: StoredTrip): Trip {
  return {
    id: stored.id,
    start: renderInstant(stored.startUtc, stored.startOffset),
    end: renderInstant(stored.endUtc, stored.endOffset),
    amount: stored.amount,
    commission: stored.commission,
    payment: stored.payment,
  };
}
