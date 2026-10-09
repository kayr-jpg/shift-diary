import { Hono, type MiddlewareHandler } from "hono";
import type { Env } from "../env";
import type { StoredTrip, TripRepository } from "../repo";

export function sandboxRoutes(deps: {
  repo: TripRepository;
  seed: StoredTrip[];
  now: () => number;
  sandbox: MiddlewareHandler<Env>;
}): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/reset", deps.sandbox, async (c) => {
    await deps.repo.resetSandbox(c.var.sandboxId, deps.seed, deps.now());
    return c.body(null, 204);
  });
  return app;
}
