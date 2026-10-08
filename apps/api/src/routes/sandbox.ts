import { Hono } from "hono";
import type { Env } from "../env";
import type { StoredTrip, TripRepository } from "../repo";

export function sandboxRoutes(deps: { repo: TripRepository; seed: StoredTrip[]; now: () => number }): Hono<Env> {
  const app = new Hono<Env>();
  app.post("/reset", async (c) => {
    await deps.repo.resetSandbox(c.var.sandboxId, deps.seed, deps.now());
    return c.body(null, 204);
  });
  return app;
}
