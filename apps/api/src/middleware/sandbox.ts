import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Trip } from "@shift/core";
import type { Env } from "../env";
import { toStoredTrip } from "../render";
import type { StoredTrip, TripRepository } from "../repo";

const ID_RE = /^[0-9a-f]{32}$/;
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export type SandboxDeps = { repo: TripRepository; seed: Trip[]; now: () => number };

/** Seed trips in storage form; the single conversion used by sandbox creation and reset. */
export const seedToStored = (seed: Trip[]): StoredTrip[] => seed.map(toStoredTrip);

function newSandboxId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolves the caller's sandbox: `X-Sandbox-Id` header, else `sid` cookie. Anything that is not
 * a well-formed id of an existing sandbox silently yields a brand-new seeded sandbox.
 */
export function sandboxMiddleware({ repo, seed, now }: SandboxDeps) {
  const stored = seedToStored(seed);
  return createMiddleware<Env>(async (c, next) => {
    const claimed = c.req.header("X-Sandbox-Id") ?? getCookie(c, "sid");
    let id: string;
    if (claimed && ID_RE.test(claimed) && (await repo.sandboxExists(claimed))) {
      id = claimed;
      await repo.touchSandbox(id, now());
    } else {
      id = newSandboxId();
      await repo.createSandbox(id, stored, now());
    }
    c.set("sandboxId", id);
    c.header("X-Sandbox-Id", id);
    const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
    c.header("Set-Cookie", `sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure}`);
    await next();
  });
}
