import { trips } from "./db/schema";
import type { StoredTrip } from "./repo";

/** touchSandbox writes lastSeen at most once per this interval (sandboxes expire after 7 days). */
export const TOUCH_INTERVAL_MS = 3_600_000;

/** The StoredTrip projection of a `trips` row. */
export const storedColumns = {
  id: trips.id,
  startUtc: trips.startUtc,
  endUtc: trips.endUtc,
  startOffset: trips.startOffset,
  endOffset: trips.endOffset,
  amount: trips.amount,
  commission: trips.commission,
  payment: trips.payment,
};

/** A full `trips` row for `t` in sandbox `sandboxId`. */
export const tripRow = (sandboxId: string, t: StoredTrip, now: number) => ({
  sandboxId,
  id: t.id,
  startUtc: t.startUtc,
  endUtc: t.endUtc,
  startOffset: t.startOffset,
  endOffset: t.endOffset,
  amount: t.amount,
  commission: t.commission,
  payment: t.payment,
  createdAt: now,
});
