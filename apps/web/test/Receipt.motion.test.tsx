import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Receipt } from "../src/components/Receipt";
import i18n from "../src/i18n";
import ru from "../src/locales/ru.json";
import type { DayResponse } from "../src/api";
import { receiptDate, receiptLines } from "../src/lib/receiptImage";

const DAY: DayResponse = {
  date: "2026-10-01",
  timezone: "+05:00",
  summary: { tripCount: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 },
  trips: [],
};
const raw = (s: string) => s; // keep U+00A0 intact

beforeEach(async () => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
  await act(() => i18n.changeLanguage("ru"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Receipt without reduced motion", () => {
  it("renders the header date, every line, the footer and the share button; closed renders nothing", async () => {
    const { rerender } = render(<Receipt day={DAY} open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: ru.app.title })).toBeTruthy();
    expect(screen.getByText(receiptDate(DAY.date, "ru"))).toBeTruthy();
    for (const l of receiptLines(DAY, "ru")) {
      expect(await screen.findByText(l.label)).toBeTruthy();
      expect(await screen.findByText(l.value, { normalizer: raw })).toBeTruthy();
    }
    expect(screen.getByText(ru.receipt.thanks)).toBeTruthy();
    expect(screen.getByRole("button", { name: ru.receipt.share })).toBeTruthy();
    rerender(<Receipt day={DAY} open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts lines hidden so they can unroll", () => {
    render(<Receipt day={DAY} open onClose={() => {}} />);
    expect(screen.getAllByRole("listitem")[0]!.getAttribute("style") ?? "").toContain("opacity: 0");
  });
});
