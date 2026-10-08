/**
 * Records the "real app" footage for the Remotion demo video (spec §11, scene 2).
 *
 *   pnpm build          # the Node server serves apps/web/dist
 *   pnpm demo:record    # → video/public/footage.webm + video/public/footage-meta.json
 *
 * With BASE_URL set, the script records against that URL. Without it, it starts the Node server
 * on :8787 with a fresh temporary SQLite database (see ./server.ts) and stops it at the end.
 *
 * The pauses are deliberate: the footage is meant to be watched by a human. footage-meta.json holds
 * the duration and the time of each beat (seconds from the start of the video) so the Remotion
 * scene can sync its captions.
 *
 * Run directly with Node (type stripping): `node demo/record.ts` from e2e/.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { repoRoot, sleep, startServer, stopServer } from "./server.ts";

const outDir = join(repoRoot, "video/public");
const rawDir = join(tmpdir(), `shift-demo-${process.pid}-${Date.now()}`);
/**
 * iPhone 14 (390×844 CSS px) at 2×. Chromium's screencast — what Playwright's recordVideo captures —
 * is always 1 frame pixel per CSS pixel, whatever deviceScaleFactor says (a 390×844 viewport at DPR 2
 * records a 390×844 picture in the corner of a 780×1688 video). To get a sharp 2× recording the
 * browser window is 780×1688 and the page is laid out at 390 CSS px with `zoom: 2` on <html>.
 */
const PHONE = { width: 390, height: 844 };
const SCALE = 2;
const VIDEO_SIZE = { width: PHONE.width * SCALE, height: PHONE.height * SCALE };

type BeatId = "summary" | "nextDay" | "backDay" | "addTrip" | "newTotals" | "hood" | "replay" | "conflict" | "kz" | "ru" | "receipt";

/** Lays the page out at phone width (see PHONE above) and keeps the phone-size type scale. */
function phoneZoom(scale: number): void {
  const style = document.createElement("style");
  // The window is wider than a phone, so Tailwind's `sm:` (min-width: 640px) would apply; the one
  // `sm:` rule in the app is the net amount's size, pinned back to its phone value here.
  style.textContent = `html { zoom: ${scale} } [data-testid="net"] { font-size: 3rem; line-height: 1 }`;
  const add = () => document.head.appendChild(style);
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add);
}

/** A translucent circle wherever the pointer goes down, so taps are visible in the footage. */
function tapIndicator(): void {
  const style = document.createElement("style");
  style.textContent = `
    .__demo-tap { position: fixed; z-index: 2147483647; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(56, 132, 255, .35);
      border: 2px solid rgba(56, 132, 255, .8); animation: __demo-tap .6s ease-out forwards; }
    @keyframes __demo-tap { from { transform: scale(.5); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }`;
  const add = () => document.head.appendChild(style);
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add);
  document.addEventListener(
    "pointerdown",
    (e) => {
      const dot = document.createElement("div");
      dot.className = "__demo-tap";
      // Event coordinates are window pixels; the dot lives inside the zoomed <html>, so convert.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      dot.style.left = `${e.clientX / zoom}px`;
      dot.style.top = `${e.clientY / zoom}px`;
      document.documentElement.appendChild(dot);
      setTimeout(() => dot.remove(), 700);
    },
    true,
  );
}

async function main(): Promise<void> {
  const external = process.env.BASE_URL;
  const server = external ? undefined : await startServer("demo:record");
  const baseURL = external ?? server!.url;
  console.log(`demo:record → ${baseURL}`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL,
      viewport: VIDEO_SIZE,
      deviceScaleFactor: 1,
      hasTouch: true,
      locale: "ru-RU",
      timezoneId: "Asia/Almaty",
      reducedMotion: "no-preference",
      recordVideo: { dir: rawDir, size: VIDEO_SIZE },
    });
    await context.addInitScript(phoneZoom, SCALE);
    await context.addInitScript(tapIndicator);
    const page = await context.newPage();
    const t0 = Date.now();
    const beats: { id: BeatId; t: number }[] = [];
    const beat = (id: BeatId) => {
      beats.push({ id, t: Math.round((Date.now() - t0) / 100) / 10 });
      console.log(`  ${id} @ ${beats.at(-1)!.t}s`);
    };
    await run(page, beat);
    const durationSec = Math.round((Date.now() - t0) / 100) / 10;
    const video = page.video();
    await context.close(); // flushes the video file
    if (!video) throw new Error("no video was recorded");
    mkdirSync(outDir, { recursive: true });
    const target = join(outDir, "footage.webm");
    renameSync(await video.path(), target);
    const meta = { width: VIDEO_SIZE.width, height: VIDEO_SIZE.height, durationSec, beats };
    writeFileSync(join(outDir, "footage-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`wrote ${target} (${durationSec}s) and footage-meta.json`);
  } finally {
    await browser.close();
    rmSync(rawDir, { recursive: true, force: true });
    if (server) await stopServer(server);
  }
}

/** Taps like a person: moves to the element, a short beat, then clicks. */
async function tap(locator: Locator, pauseAfter = 700): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await sleep(250);
  await locator.click();
  await sleep(pauseAfter);
}

async function smoothScrollTo(page: Page, locator: Locator): Promise<void> {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(900);
}

async function run(page: Page, beat: (id: BeatId) => void): Promise<void> {
  const net = page.getByTestId("net");

  // 1. The seeded day: the summary card counts up.
  await page.goto("/#2026-10-01");
  await expect(net).toHaveText("3 315 ₸");
  beat("summary");
  await sleep(2200);

  // 2. Next day and back with the arrows.
  await tap(page.getByRole("button", { name: "Следующий день" }), 0);
  await expect(page).toHaveURL(/#2026-10-02$/);
  beat("nextDay");
  await sleep(1600);
  await tap(page.getByRole("button", { name: "Предыдущий день" }), 0);
  await expect(net).toHaveText("3 315 ₸");
  beat("backDay");
  await sleep(1400);

  // 3. Add a trip through the sheet.
  await tap(page.getByRole("button", { name: "Добавить поездку" }), 0);
  const sheet = page.getByRole("dialog", { name: "Новая поездка" });
  await expect(sheet).toBeVisible();
  beat("addTrip");
  await sleep(600);
  await tap(sheet.getByLabel("Начало"), 150);
  await sheet.getByLabel("Начало").fill("10:00");
  await sleep(500);
  await tap(sheet.getByLabel("Окончание"), 150);
  await sheet.getByLabel("Окончание").fill("10:30");
  await sleep(500);
  await tap(sheet.getByLabel("Сумма"), 150);
  await sheet.getByLabel("Сумма").pressSequentially("1000", { delay: 140 });
  await expect(sheet.getByLabel("Комиссия")).toHaveValue("150");
  await sleep(700);
  await tap(sheet.locator("label").filter({ hasText: /^Карта$/ }), 500);
  await tap(sheet.getByRole("button", { name: "Сохранить" }), 0);
  await expect(sheet).toBeHidden();
  await expect(net).toHaveText("4 165 ₸");
  beat("newTotals");
  await sleep(2000);

  // 4. Under the hood: replay (200) and conflict (409).
  const hood = page.getByText("Под капотом", { exact: true });
  await smoothScrollTo(page, hood);
  await tap(hood, 0);
  beat("hood");
  await sleep(900);
  const repeat = page.getByTestId("hood-repeat");
  await smoothScrollTo(page, repeat);
  await tap(repeat.getByRole("button", { name: "Повторить последнюю поездку" }), 0);
  await expect(repeat.locator("pre").last()).toContainText("HTTP 200");
  beat("replay");
  await smoothScrollTo(page, repeat.locator("pre").last());
  await sleep(1800);
  const conflict = page.getByTestId("hood-conflict");
  await smoothScrollTo(page, conflict);
  await tap(conflict.getByRole("button", { name: "Тот же id, другая сумма" }), 0);
  await expect(conflict.locator("pre").last()).toContainText("HTTP 409");
  beat("conflict");
  await smoothScrollTo(page, conflict.locator("pre").last());
  await sleep(1800);

  // 5. Kazakh, then back to Russian.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(900);
  await tap(page.getByRole("group", { name: "Язык" }).getByRole("button", { name: "ҚАЗ" }), 0);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  beat("kz");
  await sleep(1800);
  await tap(page.getByRole("group", { name: "Тіл" }).getByRole("button", { name: "RU" }), 0);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  beat("ru");
  await sleep(900);

  // 6. Close the shift: the receipt unrolls.
  await tap(page.getByRole("button", { name: "Закрыть смену" }), 0);
  await expect(page.getByRole("dialog", { name: "Чек смены" })).toBeVisible();
  beat("receipt");
  await sleep(3200);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
