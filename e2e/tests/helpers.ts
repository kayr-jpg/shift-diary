import { expect, type Locator, type Page } from "@playwright/test";

const NBSP = " ";

/** Tenge exactly as the app renders it: "3 315 ₸" with U+00A0 group and currency separators. */
export function money(n: number): string {
  const digits = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "−" : ""}${digits}${NBSP}₸`;
}

/** Today's date in Kazakhstan (+05:00), same rule as the app's todayKz(). */
export function todayKz(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** Seed facts for 2026-10-01 (data/trips.json: t1 card 2400/360, t2 cash 1500/225). */
export const SEED_DAY = "2026-10-01";
export const SEED = { trips: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 } as const;

/** Opens a day by deep link and waits until its data (summary or empty state) is on screen. */
export async function gotoDay(page: Page, date: string): Promise<void> {
  await page.goto(`/#${date}`);
  await expect(page.getByTestId("net")).toBeVisible();
}

/** The "Поездок: N" line of the summary card. */
export const tripCount = (page: Page): Locator => page.getByText(/^Поездок: \d+$/);

export type NewTrip = { start: string; end: string; amount: number; payment?: "cash" | "card" };

/** Adds a trip on the currently viewed day through the "Добавить поездку" sheet. */
export async function addTripViaSheet(page: Page, trip: NewTrip): Promise<void> {
  await page.getByRole("button", { name: "Добавить поездку" }).click();
  const sheet = page.getByRole("dialog", { name: "Новая поездка" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Начало").fill(trip.start);
  await sheet.getByLabel("Окончание").fill(trip.end);
  await sheet.getByLabel("Сумма").fill(String(trip.amount));
  await expect(sheet.getByLabel("Комиссия")).toHaveValue(String(Math.floor(trip.amount * 0.15)));
  const name = trip.payment === "card" ? "Карта" : "Наличные";
  const payment = sheet.getByRole("radio", { name });
  // The radio is visually hidden (sr-only) inside its styled label: tap the label like a user would.
  await sheet.locator("label").filter({ hasText: new RegExp(`^${name}$`) }).click();
  await expect(payment).toBeChecked();
  await sheet.getByRole("button", { name: "Сохранить" }).click();
  await expect(sheet).toBeHidden();
}
