import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { Hono, type MiddlewareHandler } from "hono";
import type { Trip } from "@shift/core";
import seedTrips from "../../../data/trips.json";
import { createApp, notFoundJson } from "./app";
import { createSqliteRepo } from "./repo.sqlite";

// Resolved against this module, not the cwd, so the server starts from anywhere.
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = resolve(process.env.DB_PATH ?? "./data/app.db");
const VERSION = process.env.VERSION ?? "dev";
const COMMIT = process.env.COMMIT ?? "dev";
const STALE_AFTER_MS = 7 * 24 * 3600 * 1000;
const CLEANUP_EVERY_MS = 6 * 3600 * 1000;

const log = (fields: Record<string, unknown>) => console.log(JSON.stringify({ level: "info", ...fields }));

mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);
migrate(db, { migrationsFolder });
const repo = createSqliteRepo(db);

const app = new Hono();
app.route("/", createApp({ repo, seed: seedTrips as Trip[], version: VERSION, commit: COMMIT }));
// A mounted sub-app's notFound is not consulted by the parent, so install the JSON 404 here too.
app.notFound(notFoundJson);

const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
/** Runs `handler` only for non-API paths, so unknown /api routes stay JSON 404s. */
const nonApi =
  (handler: MiddlewareHandler): MiddlewareHandler =>
  (c, next) =>
    isApi(c.req.path) ? next() : handler(c, next);

if (existsSync(webDist)) {
  app.use("*", nonApi(serveStatic({ root: webDist })));
  // SPA fallback: any other non-API GET renders the client shell.
  app.get("*", nonApi(serveStatic({ root: webDist, path: "index.html" })));
} else {
  log({ event: "static_disabled", reason: "web dist not built", path: webDist });
}

const cleanup = async () => {
  try {
    const deleted = await repo.deleteStale(Date.now() - STALE_AFTER_MS);
    log({ event: "cleanup", deleted });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "cleanup", message: String(err) }));
  }
};
setInterval(cleanup, CLEANUP_EVERY_MS).unref();

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  log({ event: "listening", port: info.port, db: DB_PATH, version: VERSION, commit: COMMIT });
});

const shutdown = () => {
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
