import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CountUp } from "../src/components/CountUp";
import i18n from "../src/i18n";
import { formatMoney } from "../src/money";

// Motion reads prefers-reduced-motion once per module instance, so this file always runs reduced;
// the animated path lives in CountUp.test.tsx.
beforeEach(async () => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
  await act(() => i18n.changeLanguage("ru"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CountUp under prefers-reduced-motion", () => {
  it("renders the final value on first paint, in both the testid element and the visible one", () => {
    const seen: number[] = [];
    const format = (n: number) => {
      seen.push(n);
      return formatMoney(n, "ru");
    };
    const { rerender } = render(<CountUp value={3315} format={format} testId="net" />);
    const final = screen.getByTestId("net");
    const frames = final.parentElement!.querySelector('[aria-hidden="true"]')!;
    expect(final.textContent).toBe(formatMoney(3315, "ru"));
    expect(frames.textContent).toBe(formatMoney(3315, "ru"));
    expect(seen.every((n) => n === 3315)).toBe(true);

    rerender(<CountUp value={4000} format={format} testId="net" />);
    expect(screen.getByTestId("net").textContent).toBe(formatMoney(4000, "ru"));
    expect(frames.textContent).toBe(formatMoney(4000, "ru"));
  });
});
