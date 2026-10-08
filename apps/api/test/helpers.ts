import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Trip } from "@shift/core";
import { createApp } from "../src/app";
import { createSqliteRepo } from "../src/repo.sqlite";
import type { TripRepository } from "../src/repo";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

/** Fresh in-memory SQLite with migrations applied. */
export function makeTestRepo(): TripRepository {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  return createSqliteRepo(db);
}

export async function makeTestApp(opts: { repo?: TripRepository } = {}) {
  const repo = opts.repo ?? makeTestRepo();
  const sandboxId = randomUUID();
  if (!opts.repo) await repo.createSandbox(sandboxId, [], NOW);
  const app = createApp({ repo, seed: [], version: "test", commit: "test", now: () => NOW });

  /** POSTs a JSON value (or a raw string body when `raw` is set) to /api/trips. */
  const post = (body: unknown, o: { sandbox?: string | null; raw?: boolean } = {}) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const sb = o.sandbox === undefined ? sandboxId : o.sandbox;
    if (sb !== null) headers["X-Sandbox-Id"] = sb;
    return app.request("/api/trips", {
      method: "POST",
      headers,
      body: o.raw ? (body as string) : JSON.stringify(body),
    });
  };

  return { app, repo, sandboxId, post };
}

export const trip = (over: Partial<Record<keyof Trip, unknown>> = {}): Record<string, unknown> => ({
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  commission: 360,
  payment: "card",
  ...over,
});
