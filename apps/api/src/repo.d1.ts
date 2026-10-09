import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { sandboxes, trips } from "./db/schema";
import type { StoredTrip, TripRepository } from "./repo";
import { TOUCH_INTERVAL_MS, storedColumns, tripRow } from "./repo.shared";

/**
 * TripRepository over Cloudflare D1. D1 always enforces foreign keys, and `db.batch` runs its
 * statements as one transaction, so every multi-statement operation is a single batch.
 */
export function createD1Repo(d1: D1Database): TripRepository {
  const db = drizzle(d1);

  // One statement per seed row: D1 caps bound parameters per statement, so no multi-row VALUES.
  const seedInserts = (d: DrizzleD1Database, id: string, seed: StoredTrip[], now: number) =>
    seed.map((t) => d.insert(trips).values(tripRow(id, t, now)));

  return {
    async createSandbox(id, seed, now) {
      await db.batch([
        db.insert(sandboxes).values({ id, createdAt: now, lastSeen: now }),
        ...seedInserts(db, id, seed, now),
      ]);
    },

    async sandboxExists(id) {
      const found = await db
        .select({ id: sandboxes.id })
        .from(sandboxes)
        .where(eq(sandboxes.id, id))
        .get();
      return found !== undefined;
    },

    async touchSandbox(id, now) {
      await db
        .update(sandboxes)
        .set({ lastSeen: now })
        .where(and(eq(sandboxes.id, id), lt(sandboxes.lastSeen, now - TOUCH_INTERVAL_MS)))
        .run();
    },

    async insertIfAbsent(sandboxId, trip, now) {
      // The INSERT alone decides the winner: the (sandbox_id, id) primary key turns every
      // concurrent duplicate into a no-op, and only the winner sees meta.changes === 1.
      const result = await db
        .insert(trips)
        .values(tripRow(sandboxId, trip, now))
        .onConflictDoNothing({ target: [trips.sandboxId, trips.id] })
        .run();
      const stored = await db
        .select(storedColumns)
        .from(trips)
        .where(and(eq(trips.sandboxId, sandboxId), eq(trips.id, trip.id)))
        .get();
      if (!stored) throw new Error("insertIfAbsent: row missing after insert");
      return { created: result.meta.changes === 1, stored };
    },

    async listRange(sandboxId, from, to) {
      return db
        .select(storedColumns)
        .from(trips)
        .where(and(eq(trips.sandboxId, sandboxId), gte(trips.startUtc, from), lt(trips.startUtc, to)))
        .orderBy(asc(trips.startUtc), asc(trips.id))
        .all();
    },

    async listAll(sandboxId) {
      return db
        .select(storedColumns)
        .from(trips)
        .where(eq(trips.sandboxId, sandboxId))
        .orderBy(asc(trips.startUtc), asc(trips.id))
        .all();
    },

    async resetSandbox(id, seed, now) {
      await db.batch([
        db.delete(trips).where(eq(trips.sandboxId, id)),
        db.update(sandboxes).set({ lastSeen: now }).where(eq(sandboxes.id, id)),
        ...seedInserts(db, id, seed, now),
      ]);
    },

    async deleteStale(olderThan) {
      const stale = db
        .select({ id: sandboxes.id })
        .from(sandboxes)
        .where(lt(sandboxes.lastSeen, olderThan));
      // Trips first (explicit, though the FK cascades too), then the sandboxes; one transaction.
      const [, deleted] = await db.batch([
        db.delete(trips).where(inArray(trips.sandboxId, stale)),
        db.delete(sandboxes).where(lt(sandboxes.lastSeen, olderThan)),
      ]);
      return deleted.meta.changes;
    },
  };
}
