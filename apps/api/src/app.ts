import { Hono } from "hono";
import type { Trip } from "@shift/core";
import type { TripRepository } from "./repo";
import { tripRoutes } from "./routes/trips";

export type AppDeps = {
  repo: TripRepository;
  seed: Trip[];
  version: string;
  commit: string;
  now?: () => number;
};

export function createApp(deps: AppDeps): Hono {
  const now = deps.now ?? Date.now;
  const app = new Hono();

  app.route("/api/trips", tripRoutes({ repo: deps.repo, now }));

  app.onError((err, c) => {
    // One structured log line; the HTTP body never carries the message or stack.
    console.error(
      JSON.stringify({
        level: "error",
        code: "INTERNAL",
        method: c.req.method,
        path: c.req.path,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return c.json({ code: "INTERNAL" }, 500);
  });

  return app;
}
