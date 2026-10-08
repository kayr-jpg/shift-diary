import type {
  D1Database,
  ExecutionContext,
  ExportedHandler,
  Fetcher,
  Request as WorkerRequest,
  Response as WorkerResponse,
  ScheduledController,
} from "@cloudflare/workers-types";
import type { Hono } from "hono";
import type { Trip } from "@shift/core";
import seedTrips from "../../../data/trips.json";
import { createApp } from "./app";
import type { Env as AppEnv } from "./env";
import { createD1Repo } from "./repo.d1";

export type Env = { DB: D1Database; ASSETS: Fetcher; VERSION?: string; COMMIT?: string };

const SEED = seedTrips as Trip[];
const STALE_AFTER_MS = 7 * 24 * 3600 * 1000;

// Bindings are fixed for the lifetime of an isolate, so the app is built once per isolate.
let app: Hono<AppEnv> | undefined;

function getApp(env: Env): Hono<AppEnv> {
  app ??= createApp({
    repo: createD1Repo(env.DB),
    seed: SEED,
    version: env.VERSION ?? "dev",
    commit: env.COMMIT ?? "dev",
  });
  return app;
}

export default {
  async fetch(req: WorkerRequest, env: Env, ctx: ExecutionContext): Promise<WorkerResponse> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    // Hono and the Workers runtime share one Request/Response at runtime; only the typings differ.
    const res = await getApp(env).fetch(req as unknown as Request, env, ctx);
    return res as unknown as WorkerResponse;
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const deleted = await createD1Repo(env.DB).deleteStale(Date.now() - STALE_AFTER_MS);
    console.log(JSON.stringify({ level: "info", event: "cleanup", deleted }));
  },
} satisfies ExportedHandler<Env>;
