import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { afterAll } from "vitest";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Every statement of every drizzle migration, in order. */
const migrationStatements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(`${migrationsDir}/${f}`, "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/**
 * An in-memory D1 database (Miniflare/workerd) for the calling test file, migrated once and
 * disposed after the file's tests. `fresh()` empties it and returns it.
 */
export function useD1(): { fresh: () => Promise<D1Database> } {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: { DB: "test" },
  });
  let migrated = false;
  afterAll(() => mf.dispose());

  return {
    async fresh() {
      // Miniflare types its binding with its own copy of workers-types; same runtime object.
      const db = (await mf.getD1Database("DB")) as unknown as D1Database;
      if (!migrated) {
        for (const s of migrationStatements) await db.prepare(s).run();
        migrated = true;
      }
      await db.batch([db.prepare("DELETE FROM trips"), db.prepare("DELETE FROM sandboxes")]);
      return db;
    },
  };
}
