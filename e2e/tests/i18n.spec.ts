import { expect, test } from "@playwright/test";
import { SEED, SEED_DAY, gotoDay, money } from "./helpers";

test.describe("language toggle", () => {
  test("Kazakh: translated UI, html[lang], survives reload, money format unchanged", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    const langs = page.getByRole("group", { name: "Язык" });
    await langs.getByRole("button", { name: "ҚАЗ" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Жүргізушінің ауысым күнделігі");
    await expect(page.getByText("Қақпақ астында", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Тіл" }).getByRole("button", { name: "ҚАЗ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Жүргізушінің ауысым күнделігі");
    await expect(page.getByTestId("net")).toHaveText("3 315 ₸");
  });

  test("English: translated UI, survives reload, money format unchanged", async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await page.getByRole("group", { name: "Язык" }).getByRole("button", { name: "EN" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Driver Shift Diary");
    await expect(page.getByRole("button", { name: "Close shift" })).toBeVisible();
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Under the hood", { exact: true })).toBeVisible();
    await expect(page.getByTestId("revenue")).toHaveText(money(SEED.revenue));
  });
});
