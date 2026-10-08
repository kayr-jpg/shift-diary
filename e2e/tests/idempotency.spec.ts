import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { SEED_DAY, addTripViaSheet, gotoDay, tripCount } from "./helpers";

async function openHood(page: Page) {
  await page.getByText("Под капотом", { exact: true }).click();
  await expect(page.getByText("Живые запросы к API", { exact: false })).toBeVisible();
}

const response = (page: Page, action: string) => page.getByTestId(`hood-${action}`).locator("pre").last();

test.describe("under the hood panel", () => {
  test("repeat-last-trip replays with 200 and creates no duplicate", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await openHood(page);
    const section = page.getByTestId("hood-repeat");
    await section.getByRole("button", { name: "Повторить последнюю поездку" }).click();
    await expect(response(page, "repeat")).toContainText("HTTP 200");
    await expect(response(page, "repeat")).toContainText("Idempotent-Replay: true");
    await expect(section.getByText("Поездок за день: 2 → 2")).toBeVisible();
    await expect(tripCount(page)).toHaveText("Поездок: 2");
  });

  test("same id with another amount is a 409 with a diff", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await openHood(page);
    await page.getByTestId("hood-conflict").getByRole("button", { name: "Тот же id, другая сумма" }).click();
    const res = response(page, "conflict");
    await expect(res).toContainText("HTTP 409");
    await expect(res).toContainText('"code": "ID_CONFLICT"');
    await expect(res).toContainText('"diff"');
    // Last trip is t2 (1500): the panel sends 1600.
    await expect(res).toContainText(/"amount": \[\s*1500,\s*1600\s*\]/);
    await expect(tripCount(page)).toHaveText("Поездок: 2");
  });

  test("an invalid trip is a 422 listing every error code", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await openHood(page);
    const section = page.getByTestId("hood-invalid");
    await section.getByRole("button", { name: "Неверная поездка" }).click();
    await expect(response(page, "invalid")).toContainText("HTTP 422");
    for (const code of ["ID_INVALID", "END_BEFORE_START", "AMOUNT_INVALID", "COMMISSION_INVALID", "PAYMENT_INVALID"]) {
      await expect(response(page, "invalid")).toContainText(code);
      await expect(section.locator("li code", { hasText: code })).toBeVisible();
    }
  });

  test("reset needs two clicks and restores the seed", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await addTripViaSheet(page, { start: "11:00", end: "11:20", amount: 700 });
    await expect(tripCount(page)).toHaveText("Поездок: 3");
    await openHood(page);
    const section = page.getByTestId("hood-reset");
    await section.getByRole("button", { name: "Сбросить демо" }).click();
    await expect(tripCount(page)).toHaveText("Поездок: 3");
    await section.getByRole("button", { name: "Точно сбросить?" }).click();
    await expect(section.locator("pre").last()).toContainText("HTTP 204");
    await expect(section.getByText("Поездок за день: 3 → 2")).toBeVisible();
    await expect(tripCount(page)).toHaveText("Поездок: 2");
  });
});

test.describe("POST /api/trips over real HTTP", () => {
  async function sandbox(request: APIRequestContext): Promise<Record<string, string>> {
    const res = await request.get("/api/trips?date=2026-10-04");
    expect(res.status()).toBe(200);
    const id = res.headers()["x-sandbox-id"];
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    return { "X-Sandbox-Id": id!, Accept: "application/json" };
  }

  const trip = (id: string, amount = 2000) => ({
    id,
    start: "2026-10-04T12:00:00+05:00",
    end: "2026-10-04T12:30:00+05:00",
    amount,
    commission: 300,
    payment: "card",
  });

  test("201 → 200 replay → 409 → 422", async ({ request }) => {
    const headers = await sandbox(request);
    const t = trip(`e2e_seq_${Date.now()}`);

    const created = await request.post("/api/trips", { headers, data: t });
    expect(created.status()).toBe(201);
    expect(created.headers()["idempotent-replay"]).toBeUndefined();

    const replay = await request.post("/api/trips", { headers, data: t });
    expect(replay.status()).toBe(200);
    expect(replay.headers()["idempotent-replay"]).toBe("true");
    expect(await replay.json()).toMatchObject({ id: t.id, amount: 2000 });

    const conflict = await request.post("/api/trips", { headers, data: { ...t, amount: 2100 } });
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "ID_CONFLICT", diff: { amount: [2000, 2100] } });

    const invalid = await request.post("/api/trips", { headers, data: { ...t, amount: 0, payment: "crypto" } });
    expect(invalid.status()).toBe(422);
    const codes = ((await invalid.json()) as { errors: { code: string }[] }).errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["AMOUNT_INVALID", "PAYMENT_INVALID"]));
  });

  test("20 concurrent identical POSTs create exactly one trip", async ({ request }) => {
    const headers = await sandbox(request);
    const t = trip(`e2e_race_${Date.now()}`, 2500);

    const responses = await Promise.all(Array.from({ length: 20 }, () => request.post("/api/trips", { headers, data: t })));
    const statuses = responses.map((r) => r.status());
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
    for (const r of responses.filter((r) => r.status() === 200)) {
      expect(r.headers()["idempotent-replay"]).toBe("true");
    }

    const day = await request.get("/api/trips?date=2026-10-04", { headers });
    const body = (await day.json()) as { trips: { id: string }[]; summary: { tripCount: number } };
    expect(body.trips.filter((x) => x.id === t.id)).toHaveLength(1);
    expect(body.summary.tripCount).toBe(1);
  });
});
