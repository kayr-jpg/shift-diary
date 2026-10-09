import { expect, test } from "@playwright/test";
import { SEED, SEED_DAY, gotoDay, money } from "./helpers";

test.describe("PWA shell", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Service worker and Cache Storage checks run on chromium only");

  test("manifest is linked and served, sw.js is served", async ({ page, request }) => {
    await gotoDay(page, SEED_DAY);
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");

    const manifest = await request.get(href!);
    expect(manifest.ok()).toBe(true);
    expect(await manifest.json()).toMatchObject({ short_name: "Смены", display: "standalone", start_url: "/" });

    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["content-type"]).toContain("javascript");
  });

  test("API responses never come from the service worker or its caches", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    // Reload so the now-active worker controls the page, then load a day through it.
    const apiResponses: { url: string; fromSw: boolean }[] = [];
    page.on("response", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) apiResponses.push({ url: r.url(), fromSw: r.fromServiceWorker() });
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));
    await page.getByRole("button", { name: "Следующий день" }).click();
    await expect(page.getByTestId("net")).toHaveText(money(2380));

    expect(apiResponses.length).toBeGreaterThan(0);
    expect(apiResponses.filter((r) => r.fromSw)).toEqual([]);

    const cachedUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      }
      return urls;
    });
    expect(cachedUrls.length).toBeGreaterThan(0); // the precached shell
    expect(cachedUrls.filter((u) => new URL(u).pathname.startsWith("/api"))).toEqual([]);
  });
});
