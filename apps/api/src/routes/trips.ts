import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "../env";
import { diffCanonical, findOverlaps, validateTrip, type Trip } from "@shift/core";
import type { StoredTrip, TripRepository } from "../repo";
import { renderInstant, renderTrip, toStoredTrip } from "../render";

const DAY_MS = 86_400_000;

export type TripRoutesDeps = { repo: TripRepository; now: () => number; sandbox: MiddlewareHandler<Env> };

/** Parsed JSON body, or `undefined` when the body is not valid JSON (validation then reports every field). */
async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Field diff for a 409; times are shown as ISO strings (stored offset vs. the string sent). */
function conflictDiff(stored: StoredTrip, sent: Trip, sentStored: StoredTrip) {
  const diff = diffCanonical(stored, sentStored);
  if (diff.start) diff.start = [renderInstant(stored.startUtc, stored.startOffset), sent.start];
  if (diff.end) diff.end = [renderInstant(stored.endUtc, stored.endOffset), sent.end];
  return diff;
}

const MAX_BODY_BYTES = 16 * 1024;

export function tripRoutes({ repo, now, sandbox }: TripRoutesDeps): Hono<Env> {
  const app = new Hono<Env>();

  app.post(
    "/",
    // Reject oversize bodies before the sandbox middleware can create (and seed) a sandbox.
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ code: "BODY_TOO_LARGE" }, 413) }),
    sandbox,
    async (c) => {
    const sandboxId = c.var.sandboxId;

    const result = validateTrip(await readJson(c));
    if (!result.ok) return c.json({ errors: result.errors }, 422);

    const sent = toStoredTrip(result.trip);
    const { created, stored } = await repo.insertIfAbsent(sandboxId, sent, now());

    if (!created) {
      const diff = conflictDiff(stored, result.trip, sent);
      if (Object.keys(diff).length > 0) return c.json({ code: "ID_CONFLICT", diff }, 409);
      c.header("Idempotent-Replay", "true");
      return c.json(renderTrip(stored), 200);
    }

    // Trips last at most 12h, so anything overlapping must start within a day before this one.
    const nearby = await repo.listRange(sandboxId, stored.startUtc - DAY_MS, stored.endUtc);
    const overlaps = findOverlaps(stored, nearby);
    const body =
      overlaps.length > 0
        ? { ...renderTrip(stored), warnings: overlaps.map((id) => ({ code: "OVERLAP", with: id })) }
        : renderTrip(stored);
    return c.json(body, 201);
    },
  );

  return app;
}
