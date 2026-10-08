/**
 * End-to-end tests for Shift Diary.
 *
 * Local run (from the repo root):
 *   pnpm build                                  # the Node server serves apps/web/dist
 *   pnpm --filter @shift/e2e install-browsers   # once: chromium + webkit
 *   pnpm e2e                                    # or: pnpm e2e --project=desktop
 *
 * With BASE_URL set (e.g. a deployed preview), no server is started and the tests run against it.
 * Without it, Playwright starts `pnpm --filter @shift/api start:node` on :8787 with a fresh
 * temporary SQLite database; it builds nothing, so `pnpm build` must have run first.
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const PORT = 8787;
const repoRoot = resolve(import.meta.dirname, "..");
const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${PORT}`;

if (!externalBaseUrl && !existsSync(join(repoRoot, "apps/web/dist/index.html"))) {
  throw new Error("apps/web/dist is missing: run `pnpm build` before `pnpm e2e` (the e2e server does not build).");
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 14"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm --filter @shift/api start:node",
        cwd: repoRoot,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !CI,
        timeout: 60_000,
        env: {
          PORT: String(PORT),
          DB_PATH: join(tmpdir(), `shift-e2e-${process.pid}-${Date.now()}.db`),
        },
      },
});
