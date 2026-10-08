/**
 * Post-deploy smoke test. Run against a live deployment with:
 *   BASE_URL=https://<worker>.workers.dev pnpm smoke
 *
 * Every test starts from a fresh sandbox (new cookie jar / browser context), so it depends only on
 * the seed and is safe to run repeatedly against production. It also runs as part of `pnpm e2e`.
 */
import { expect, test } from "@playwright/test";
import { SEED, SEED_DAY, addTripViaSheet, gotoDay, money, tripCount } from "./helpers";

test.describe("smoke @smoke", () => {
  test("GET /api/health reports ok, version and commit", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: unknown; version: unknown; commit: unknown };
    console.log(`[smoke] deployed version=${String(body.version)} commit=${String(body.commit)}`);
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(body.version).not.toBe("");
    expect(typeof body.commit).toBe("string");
    expect(body.commit).not.toBe("");
  });

  test("a fresh sandbox sees the seeded day and gets a sandbox id + cookie", async ({ request }) => {
    const res = await request.get(`/api/trips?date=${SEED_DAY}`, { headers: { Accept: "application/json" } });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-sandbox-id"]).toMatch(/^[0-9a-f]{32}$/);
    const cookie = res.headers()["set-cookie"] ?? "";
    expect(cookie).toMatch(/(^|\n)sid=[0-9a-f]{32};/);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    const { summary } = (await res.json()) as { summary: Record<string, number> };
    expect(summary).toMatchObject({
      tripCount: SEED.trips,
      revenue: SEED.revenue,
      commission: SEED.commission,
      net: SEED.net,
      cash: SEED.cash,
      card: SEED.card,
    });
  });

  test("POST /api/trips is idempotent over real HTTP: 201 → 200 replay → 409", async ({ request }) => {
    const first = await request.get(`/api/trips?date=${SEED_DAY}`);
    expect(first.status()).toBe(200);
    const sandboxId = first.headers()["x-sandbox-id"];
    expect(sandboxId).toMatch(/^[0-9a-f]{32}$/);
    const headers = { "X-Sandbox-Id": sandboxId!, Accept: "application/json" };

    const trip = {
      id: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      start: `${SEED_DAY}T12:00:00+05:00`,
      end: `${SEED_DAY}T12:30:00+05:00`,
      amount: 2000,
      commission: 300,
      payment: "card",
    };

    const created = await request.post("/api/trips", { headers, data: trip });
    expect(created.status()).toBe(201);

    const replay = await request.post("/api/trips", { headers, data: trip });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotent-replay"]).toBe("true");

    const conflict = await request.post("/api/trips", { headers, data: { ...trip, amount: 2100 } });
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "ID_CONFLICT" });
  });

  test("UI: the seeded day renders and a trip can be added", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));
    await expect(tripCount(page)).toHaveText(`Поездок: ${SEED.trips}`);
    await addTripViaSheet(page, { start: "10:00", end: "10:30", amount: 1000, payment: "card" });
    await expect(tripCount(page)).toHaveText(`Поездок: ${SEED.trips + 1}`);
  });

  test("static shell: index, manifest and service worker are served", async ({ request }) => {
    const index = await request.get("/");
    expect(index.status()).toBe(200);
    expect(index.headers()["content-type"]).toContain("text/html");
    expect((await index.text()).toLowerCase()).toContain("<!doctype html");

    for (const path of ["/manifest.webmanifest", "/sw.js"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });
});
