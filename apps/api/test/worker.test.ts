import type { ExecutionContext, Fetcher, ScheduledController } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createD1Repo } from "../src/repo.d1";
import worker, { type Env } from "../src/worker";
import { useD1 } from "./d1";

const d1 = useD1();
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const DAY = 24 * 3600 * 1000;

async function makeEnv() {
  const assets = vi.fn(async (req: Request) => new Response(`asset:${new URL(req.url).pathname}`));
  const env: Env = {
    DB: await d1.fresh(),
    ASSETS: { fetch: assets } as unknown as Fetcher,
    VERSION: "1.2.3",
    COMMIT: "abc",
  };
  return { env, assets };
}

const call = (env: Env, path: string) =>
  worker.fetch(new Request(`https://shift.example${path}`) as never, env, ctx) as unknown as Promise<Response>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker fetch", () => {
  it("serves /api/* from the app with the D1 repo and the shipped seed", async () => {
    const { env, assets } = await makeEnv();
    const health = await call(env, "/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, version: "1.2.3", commit: "abc" });

    const day = await call(env, "/api/trips?date=2026-10-01");
    expect(day.status).toBe(200);
    const body = (await day.json()) as { summary: { tripCount: number; revenue: number; net: number } };
    expect(body.summary).toMatchObject({ tripCount: 2, revenue: 3900, net: 3315 });
    expect(assets).not.toHaveBeenCalled();
  });

  it("hands every non-/api path to the ASSETS binding", async () => {
    const { env, assets } = await makeEnv();
    for (const path of ["/", "/day/2026-10-01", "/api"]) {
      const res = await call(env, path);
      expect(await res.text()).toBe(`asset:${path}`);
    }
    expect(assets).toHaveBeenCalledTimes(3);
  });
});

describe("worker scheduled", () => {
  it("deletes sandboxes idle for over 7 days and logs one JSON line with the count", async () => {
    const { env } = await makeEnv();
    const repo = createD1Repo(env.DB);
    const now = Date.now();
    await repo.createSandbox("stale", [], now - 8 * DAY);
    await repo.createSandbox("recent", [], now - 6 * DAY);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await worker.scheduled({} as ScheduledController, env);

    expect(await repo.sandboxExists("stale")).toBe(false);
    expect(await repo.sandboxExists("recent")).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      level: "info",
      event: "cleanup",
      deleted: 1,
    });
  });
});
