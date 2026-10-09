/**
 * Regenerates the README screenshots in docs/screenshots/.
 *
 *   pnpm build              # the Node server serves apps/web/dist
 *   pnpm docs:screenshots   # → docs/screenshots/*.png
 *
 * With BASE_URL set, the shots are taken against that URL. Without it, the Node server is started
 * on :8787 with a fresh temporary SQLite database (see ./server.ts) and stopped at the end. Every
 * shot uses its own browser context, so it gets a fresh sandbox (the seed data) and the default
 * language (RU). Motion is reduced so count-ups and the receipt are captured in their final state.
 *
 * Phone shots: iPhone 14 viewport (390×844 CSS px) at 2×. Desktop shots: 1280×800 at 1×.
 * Run directly with Node (type stripping): `node demo/screenshots.ts` from e2e/.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { repoRoot, startServer, stopServer } from "./server.ts";

const outDir = join(repoRoot, "docs/screenshots");
const SEED_DAY = "2026-10-01";

type Device = { viewport: { width: number; height: number }; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean };
const PHONE: Device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP: Device = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

type Shot = { file: string; device: Device; take: (page: Page) => Promise<void>; element?: string };

async function openSeedDay(page: Page): Promise<void> {
  await page.goto(`/#${SEED_DAY}`);
  await expect(page.getByTestId("net")).toHaveText("3 315 ₸");
}

async function openHoodWithReplayAndConflict(page: Page): Promise<void> {
  await openSeedDay(page);
  await page.getByText("Под капотом", { exact: true }).click();
  const repeat = page.getByTestId("hood-repeat");
  await repeat.getByRole("button", { name: "Повторить последнюю поездку" }).click();
  await expect(repeat.locator("pre").last()).toContainText("HTTP 200");
  const conflict = page.getByTestId("hood-conflict");
  await conflict.getByRole("button", { name: "Тот же id, другая сумма" }).click();
  await expect(conflict.locator("pre").last()).toContainText("HTTP 409");
}

async function openAddTripSheet(page: Page): Promise<void> {
  await openSeedDay(page);
  await page.getByRole("button", { name: "Добавить поездку" }).click();
  const sheet = page.getByRole("dialog", { name: "Новая поездка" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Начало").fill("10:00");
  await sheet.getByLabel("Окончание").fill("10:30");
  await sheet.getByLabel("Сумма").fill("1000");
  await expect(sheet.getByLabel("Комиссия")).toHaveValue("150");
  await sheet.locator("label").filter({ hasText: /^Карта$/ }).click();
  await page.locator(":focus").blur();
}

async function openReceipt(page: Page): Promise<void> {
  await openSeedDay(page);
  await page.getByRole("button", { name: "Закрыть смену" }).click();
  const dialog = page.getByRole("dialog", { name: "Чек смены" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Спасибо за смену!")).toBeVisible();
}

async function switchToKazakh(page: Page): Promise<void> {
  await openSeedDay(page);
  await page.getByRole("group", { name: "Язык" }).getByRole("button", { name: "ҚАЗ" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
}

const SHOTS: Shot[] = [
  { file: "phone-main.png", device: PHONE, take: openSeedDay },
  { file: "phone-add-trip.png", device: PHONE, take: openAddTripSheet },
  {
    file: "phone-under-the-hood.png",
    device: PHONE,
    take: async (page) => {
      await openHoodWithReplayAndConflict(page);
      // The replay: "trips on this day: 2 → 2", then the request and the 200 + Idempotent-Replay
      // response, scrolled to just below the sticky header.
      await page
        .getByTestId("hood-repeat")
        .getByText("Поездок за день: 2 → 2")
        .evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 90));
    },
  },
  { file: "phone-kz.png", device: PHONE, take: switchToKazakh },
  { file: "phone-receipt.png", device: PHONE, take: openReceipt },
  { file: "desktop-main.png", device: DESKTOP, take: openSeedDay },
  {
    file: "desktop-under-the-hood.png",
    device: DESKTOP,
    take: openHoodWithReplayAndConflict,
    // The whole open panel: replay (200) and conflict (409) with their requests and responses.
    element: "details",
  },
];

async function capture(browser: Browser, baseURL: string, shot: Shot): Promise<void> {
  const context = await browser.newContext({
    ...shot.device,
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  try {
    const page = await context.newPage();
    await shot.take(page);
    const options = { path: join(outDir, shot.file), animations: "disabled", caret: "hide" } as const;
    if (shot.element) {
      // A full-page capture clipped to the element: an element screenshot would scroll it under
      // the sticky header, which then covers part of it.
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await page.locator(shot.element).boundingBox();
      if (!box) throw new Error(`${shot.file}: ${shot.element} is not visible`);
      await page.screenshot({ ...options, fullPage: true, clip: box });
    } else {
      await page.screenshot(options);
    }
    console.log(`  ${shot.file}`);
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const external = process.env.BASE_URL;
  const server = external ? undefined : await startServer("docs:screenshots");
  const baseURL = external ?? server!.url;
  console.log(`docs:screenshots → ${baseURL}`);
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) await capture(browser, baseURL, shot);
  } finally {
    await browser.close();
    if (server) await stopServer(server);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
