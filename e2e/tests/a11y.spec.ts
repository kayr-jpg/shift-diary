import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SEED, SEED_DAY, gotoDay, money } from "./helpers";

/** Runs axe on the page and fails on any serious or critical violation, listing them readably. */
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

async function openReceipt(page: Page) {
  await page.getByRole("button", { name: "Закрыть смену" }).click();
  const dialog = page.getByRole("dialog", { name: "Чек смены" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("accessibility (axe: no serious/critical violations)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDay(page, SEED_DAY);
    await expect(page.getByTestId("net")).toHaveText(money(SEED.net));
  });

  test("main screen", async ({ page }) => {
    await expectNoSeriousViolations(page);
  });

  test("add-trip sheet open", async ({ page }) => {
    await page.getByRole("button", { name: "Добавить поездку" }).click();
    await expect(page.getByRole("dialog", { name: "Новая поездка" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("receipt open", async ({ page }) => {
    const dialog = await openReceipt(page);
    // Let the line stagger finish so axe measures final colours, not a mid-fade frame.
    for (const li of await dialog.getByRole("listitem").all()) await expect(li).toHaveCSS("opacity", "1");
    await expectNoSeriousViolations(page);
  });

  test("under-the-hood panel open", async ({ page }) => {
    await page.getByText("Под капотом", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Повторить последнюю поездку" })).toBeVisible();
    await page.getByRole("button", { name: "Неверная поездка" }).click();
    await expect(page.getByTestId("hood-invalid").locator("pre").last()).toContainText("HTTP 422");
    await expectNoSeriousViolations(page);
  });

  test("primary tap targets are at least 44x44 px", async ({ page }) => {
    const targets = [
      page.getByRole("button", { name: "Добавить поездку" }),
      page.getByRole("button", { name: "Закрыть смену" }),
      page.getByRole("button", { name: "Предыдущий день" }),
      page.getByRole("button", { name: "Следующий день" }),
      page.getByRole("button", { name: "Сегодня", exact: true }),
      page.getByRole("button", { name: "RU" }),
      page.getByRole("button", { name: "ҚАЗ" }),
      page.getByRole("button", { name: "EN" }),
      page.getByRole("button", { name: "1 октября, есть поездки" }),
      page.getByText("Под капотом", { exact: true }).locator(".."),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, String(target)).not.toBeNull();
      expect(box!.width, `${String(target)} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${String(target)} height`).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("button", { name: "Добавить поездку" }).click();
    const sheet = page.getByRole("dialog", { name: "Новая поездка" });
    for (const target of [
      sheet.getByRole("button", { name: "Сохранить" }),
      sheet.getByRole("button", { name: "Закрыть" }),
      sheet.getByLabel("Сумма"),
    ]) {
      const box = await target.boundingBox();
      expect(box!.height, `${String(target)} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("reduced motion: receipt lines are visible immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await openReceipt(page);
    const lines = dialog.getByRole("listitem");
    await expect(lines).toHaveCount(6);
    // No animation frames to wait for: every line is fully opaque on the first check.
    const opacities = await lines.evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
    expect(opacities).toEqual(Array(6).fill("1"));
  });
});
