import { expect, test } from "@playwright/test";
import { SEED, SEED_DAY, addTripViaSheet, gotoDay, money, todayKz, tripCount } from "./helpers";

test.describe("main flow", () => {
  test("shows the seeded day summary and trips", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));
    await expect(page.getByTestId("net")).toHaveText("3 315 ₸");
    await expect(page.getByTestId("revenue")).toHaveText("3 900 ₸");
    await expect(page.getByTestId("commission")).toHaveText("585 ₸");
    await expect(tripCount(page)).toHaveText("Поездок: 2");
    await expect(page.getByTestId("trip-time")).toHaveText(["08:10–08:32", "09:05–09:20"]);
  });

  test("arrows switch to the next day and back", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await page.getByRole("button", { name: "Следующий день" }).click();
    await expect(page).toHaveURL(/#2026-10-02$/);
    await expect(page.getByText("2 октября", { exact: true })).toBeVisible();
    // 2026-10-02: t9, 2800 card with 420 commission.
    await expect(page.getByTestId("net")).toHaveText(money(2380));
    await expect(page.getByTestId("trip-time")).toHaveText(["08:00–08:30"]);

    await page.getByRole("button", { name: "Предыдущий день" }).click();
    await expect(page).toHaveURL(/#2026-10-01$/);
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));
  });

  test("date strip selects a day", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    const strip = page.getByRole("navigation", { name: "Выбор дня" });
    await expect(strip.getByRole("button", { name: "1 октября, есть поездки" })).toHaveAttribute("aria-current", "date");
    await strip.getByRole("button", { name: "28 сентября, есть поездки" }).click();
    await expect(page).toHaveURL(/#2026-09-28$/);
    // 2026-09-28: t3 1800/270 + t4 3200/480.
    await expect(page.getByTestId("net")).toHaveText(money(4250));
    await expect(tripCount(page)).toHaveText("Поездок: 2");
    await expect(strip.getByRole("button", { name: "28 сентября, есть поездки" })).toHaveAttribute("aria-current", "date");
  });

  test("Today button jumps to today and then disables", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    const todayButton = page.getByRole("button", { name: "Сегодня", exact: true });
    await expect(todayButton).toBeEnabled();
    await todayButton.click();
    await expect(page).toHaveURL(new RegExp(`#${todayKz()}$`));
    await expect(todayButton).toBeDisabled();
  });

  test("empty day shows the empty state", async ({ page }) => {
    await gotoDay(page, "2026-01-01");
    await expect(page.getByText("Поездок нет")).toBeVisible();
    await expect(page.getByTestId("net")).toHaveText(money(0));
    await expect(page.getByRole("button", { name: "Закрыть смену" })).toHaveCount(0);
  });

  test("adding a trip updates count and net", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(tripCount(page)).toHaveText("Поездок: 2");
    await addTripViaSheet(page, { start: "10:00", end: "10:30", amount: 1000, payment: "card" });
    await expect(page.getByTestId("toasts")).toContainText("Поездка добавлена");
    await expect(tripCount(page)).toHaveText("Поездок: 3");
    // 1000 with the automatic 15% commission (150): net +850.
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net + 850));
    await expect(page.getByTestId("trip-time")).toHaveText(["08:10–08:32", "09:05–09:20", "10:00–10:30"]);
  });

  test("a trip crossing midnight is saved and listed on its start day only", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await page.getByRole("button", { name: "Добавить поездку" }).click();
    const sheet = page.getByRole("dialog", { name: "Новая поездка" });
    await sheet.getByLabel("Начало").fill("23:40");
    await sheet.getByLabel("Окончание").fill("00:15");
    await expect(sheet.getByTestId("end-next-day")).toHaveText("+1 день");
    await sheet.getByLabel("Сумма").fill("2000");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("toasts")).toContainText("Поездка добавлена");
    await expect(tripCount(page)).toHaveText("Поездок: 3");
    await expect(page.getByTestId("trip-time")).toHaveText(["08:10–08:32", "09:05–09:20", "23:40–00:15"]);
    // 2000 cash with the automatic 15% commission (300): net +1700.
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net + 1700));

    // The next day keeps only its own seed trip (start-day rule).
    await page.getByRole("button", { name: "Следующий день" }).click();
    await expect(page).toHaveURL(/#2026-10-02$/);
    await expect(page.getByTestId("trip-time")).toHaveText(["08:00–08:30"]);
    await expect(page.getByTestId("net")).toHaveText(money(2380));
  });

  test("an overlapping trip shows the overlap badge", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(page.getByText("Пересечение")).toHaveCount(0);
    await addTripViaSheet(page, { start: "08:20", end: "08:40", amount: 500 });
    await expect(tripCount(page)).toHaveText("Поездок: 3");
    await expect(page.getByText("Пересечение").first()).toBeVisible();
  });
});
