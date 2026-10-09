import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { CountUp } from "../src/components/CountUp";
import i18n from "../src/i18n";
import { formatMoney } from "../src/money";

// Motion reads prefers-reduced-motion once per module instance, so this file always runs
// with motion allowed; the reduced path lives in CountUp.reduced.test.tsx.
beforeEach(async () => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
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

const animated = (testId: string) => screen.getByTestId(testId).parentElement!.querySelector('[aria-hidden="true"]')!;

describe("CountUp (motion allowed)", () => {
  it("exposes the final value synchronously on the testid element; frames live in an aria-hidden sibling", () => {
    render(<CountUp value={3315} testId="net" />);
    const final = screen.getByTestId("net");
    expect(final.textContent).toBe(formatMoney(3315, "ru"));
    expect(final.getAttribute("aria-hidden")).toBeNull();
    const frames = animated("net");
    expect(frames).toBeTruthy();
    expect(frames.contains(final)).toBe(false);
    // First paint starts from 0, not from the final value.
    expect(frames.textContent).not.toBe(formatMoney(3315, "ru"));
  });

  it("ends on the exact formatted integer within ~300 ms, and every frame is an integer", async () => {
    const seen = new Set<string>();
    const format = (n: number) => {
      seen.add(String(n));
      return formatMoney(n, "ru");
    };
    const start = performance.now();
    render(<CountUp value={3315} format={format} testId="net" />);
    await waitFor(() => expect(animated("net").textContent).toBe(formatMoney(3315, "ru")), { timeout: 1000 });
    expect(performance.now() - start).toBeLessThan(700); // 300 ms animation + jsdom frame slack
    for (const n of seen) expect(Number.isInteger(Number(n))).toBe(true);
  });

  it("animates from the previously shown value on change", async () => {
    const seen: number[] = [];
    const format = (n: number) => {
      seen.push(n);
      return String(n);
    };
    const { rerender } = render(<CountUp value={1000} format={format} testId="net" />);
    await waitFor(() => expect(animated("net").textContent).toBe("1000"), { timeout: 1000 });
    seen.length = 0;
    rerender(<CountUp value={1200} format={format} testId="net" />);
    expect(screen.getByTestId("net").textContent).toBe("1200");
    await waitFor(() => expect(animated("net").textContent).toBe("1200"), { timeout: 1000 });
    // Frames stay between the old and the new value (no restart from 0).
    expect(seen.filter((n) => n !== 1200).every((n) => n >= 1000 && n <= 1200)).toBe(true);
  });
});
