import type { CanonicalTrip } from "@shift/core";

/** A canonical trip plus the offsets the client originally wrote, e.g. "+05:00" or "Z". */
export type StoredTrip = CanonicalTrip & { startOffset: string; endOffset: string };

/** Storage port. Every method is async so a D1 implementation can satisfy it unchanged. */
export interface TripRepository {
  createSandbox(id: string, seed: StoredTrip[], now: number): Promise<void>;
  sandboxExists(id: string): Promise<boolean>;
  touchSandbox(id: string, now: number): Promise<void>;
  /** Atomic: inserts unless (sandboxId, trip.id) exists; returns the row now stored. */
  insertIfAbsent(
    sandboxId: string,
    trip: StoredTrip,
    now: number,
  ): Promise<{ created: boolean; stored: StoredTrip }>;
  /** Trips whose start is in the half-open range [from, to), sorted by start. */
  listRange(sandboxId: string, from: number, to: number): Promise<StoredTrip[]>;
  /** All trips of a sandbox, sorted by start. */
  listAll(sandboxId: string): Promise<StoredTrip[]>;
  resetSandbox(id: string, seed: StoredTrip[], now: number): Promise<void>;
  /** Deletes sandboxes (and their trips) last seen before `olderThan`; returns how many. */
  deleteStale(olderThan: number): Promise<number>;
}
