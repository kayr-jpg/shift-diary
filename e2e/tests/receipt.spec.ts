import { expect, test, type Page } from "@playwright/test";
import { SEED, SEED_DAY, gotoDay, money } from "./helpers";

const EXPECTED_LINES = [
  `Поездок${SEED.trips}`,
  `Выручка${money(SEED.revenue)}`,
  `Комиссия${money(SEED.commission)}`,
  `На руки${money(SEED.net)}`,
  `Наличные${money(SEED.cash)}`,
  `Карта${money(SEED.card)}`,
];

async function openReceipt(page: Page) {
  await gotoDay(page, SEED_DAY);
  await page.getByRole("button", { name: "Закрыть смену" }).click();
  const dialog = page.getByRole("dialog", { name: "Чек смены" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("end-of-shift receipt", () => {
  test("opens with the day's lines and closes on Escape", async ({ page }) => {
    const dialog = await openReceipt(page);
    await expect(dialog.getByRole("listitem")).toHaveText(EXPECTED_LINES);
    await expect(dialog.getByText("Спасибо за смену!")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Закрыть" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Закрыть смену" })).toBeFocused();
  });

  test("Share downloads the receipt PNG", async ({ page, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "WebKit (iPhone) uses the native share sheet path; Playwright cannot observe it, so only the dialog is asserted there",
    );
    const dialog = await openReceipt(page);
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Поделиться" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`shift-${SEED_DAY}.png`);
    await expect(page.getByTestId("toasts")).toContainText("Чек сохранён как картинка");
  });
});
