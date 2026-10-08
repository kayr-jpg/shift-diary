import { Hono, type NotFoundHandler } from "hono";
import type { Trip } from "@shift/core";
import type { TripRepository } from "./repo";
import type { Env } from "./env";
import { sandboxMiddleware, seedToStored } from "./middleware/sandbox";
import { healthRoutes } from "./routes/health";
import { readRoutes } from "./routes/read";
import { sandboxRoutes } from "./routes/sandbox";
import { tripRoutes } from "./routes/trips";

export type AppDeps = {
  repo: TripRepository;
  seed: Trip[];
  version: string;
  commit: string;
  now?: () => number;
};

/** JSON 404 for any request no route serves. Hosts that mount the app must install it too. */
export const notFoundJson: NotFoundHandler = (c) => c.json({ code: "NOT_FOUND" }, 404);

export function createApp(deps: AppDeps): Hono<Env> {
  const now = deps.now ?? Date.now;
  const app = new Hono<Env>();

  app.route("/api/health", healthRoutes({ version: deps.version, commit: deps.commit }));

  // The sandbox middleware is attached per handler (never as a /api/* wildcard) so that only a
  // request a real route will serve can create a sandbox: unknown paths, unsupported methods and
  // oversize bodies are rejected without a single database write.
  const sandbox = sandboxMiddleware({ repo: deps.repo, seed: deps.seed, now });
  const read = readRoutes({ repo: deps.repo, sandbox });
  app.route("/api/trips", read.trips);
  app.route("/api/days", read.days);
  app.route("/api/sandbox", sandboxRoutes({ repo: deps.repo, seed: seedToStored(deps.seed), now, sandbox }));
  app.route("/api/trips", tripRoutes({ repo: deps.repo, now, sandbox }));

  app.notFound(notFoundJson);

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
