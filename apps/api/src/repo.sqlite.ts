import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sandboxes, trips } from "./db/schema";
import type { StoredTrip, TripRepository } from "./repo";
import { TOUCH_INTERVAL_MS, storedColumns, tripRow } from "./repo.shared";

export function createSqliteRepo(db: BetterSQLite3Database): TripRepository {
  // Per-connection setting in SQLite; make FK enforcement a property of the repo, not of callers.
  db.run(sql`PRAGMA foreign_keys = ON`);

  const insertSeed = (
    tx: Pick<BetterSQLite3Database, "insert">,
    id: string,
    seed: StoredTrip[],
    now: number,
  ) => {
    for (const t of seed) tx.insert(trips).values(tripRow(id, t, now)).run();
  };

  return {
    async createSandbox(id, seed, now) {
      db.transaction((tx) => {
        tx.insert(sandboxes).values({ id, createdAt: now, lastSeen: now }).run();
        insertSeed(tx, id, seed, now);
      });
    },

    async sandboxExists(id) {
      const found = db
        .select({ id: sandboxes.id })
        .from(sandboxes)
        .where(eq(sandboxes.id, id))
        .get();
      return found !== undefined;
    },

    async touchSandbox(id, now) {
      db.update(sandboxes)
        .set({ lastSeen: now })
        .where(and(eq(sandboxes.id, id), lt(sandboxes.lastSeen, now - TOUCH_INTERVAL_MS)))
        .run();
    },

    async insertIfAbsent(sandboxId, trip, now) {
      // One atomic statement decides the winner: the primary key (sandbox_id, id) makes every
      // concurrent duplicate a no-op, and `changes` tells this caller whether it won.
      const { changes } = db
        .insert(trips)
        .values(tripRow(sandboxId, trip, now))
        .onConflictDoNothing({ target: [trips.sandboxId, trips.id] })
        .run();
      const stored = db
        .select(storedColumns)
        .from(trips)
        .where(and(eq(trips.sandboxId, sandboxId), eq(trips.id, trip.id)))
        .get();
      if (!stored) throw new Error("insertIfAbsent: row missing after insert");
      return { created: changes === 1, stored };
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
      db.transaction((tx) => {
        tx.delete(trips).where(eq(trips.sandboxId, id)).run();
        tx.update(sandboxes).set({ lastSeen: now }).where(eq(sandboxes.id, id)).run();
        insertSeed(tx, id, seed, now);
      });
    },

    async deleteStale(olderThan) {
      return db.transaction((tx) => {
        const stale = tx
          .select({ id: sandboxes.id })
          .from(sandboxes)
          .where(lt(sandboxes.lastSeen, olderThan))
          .all()
          .map((s) => s.id);
        if (stale.length === 0) return 0;
        // Explicit, so cleanup does not depend on the foreign_keys pragma being on.
        tx.delete(trips).where(inArray(trips.sandboxId, stale)).run();
        return tx.delete(sandboxes).where(inArray(sandboxes.id, stale)).run().changes;
      });
    },
  };
}
