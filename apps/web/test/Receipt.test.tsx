import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState } from "react";
import App from "../src/App";
import { Receipt } from "../src/components/Receipt";
import { createQueryClient } from "../src/queryClient";
import i18n from "../src/i18n";
import ru from "../src/locales/ru.json";
import type { DayResponse } from "../src/api";
import { receiptLines } from "../src/lib/receiptImage";

const DAY: DayResponse = {
  date: "2026-10-01",
  timezone: "+05:00",
  summary: { tripCount: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 },
  trips: [],
};
const EMPTY: DayResponse = {
  date: "2026-10-02",
  timezone: "+05:00",
  summary: { tripCount: 0, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 },
  trips: [],
};

const raw = (s: string) => s; // keep U+00A0 intact

// Motion reads prefers-reduced-motion once per module instance, so this file always runs reduced;
// the animated path lives in Receipt.motion.test.tsx.
function mockMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  await act(() => i18n.changeLanguage("ru"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Receipt", () => {
  it("under prefers-reduced-motion everything is there synchronously, un-animated", () => {
    mockMotion(true);
    render(<Receipt day={DAY} open onClose={() => {}} />);
    for (const l of receiptLines(DAY, "ru")) {
      expect(screen.getByText(l.label)).toBeTruthy();
      expect(screen.getByText(l.value, { normalizer: raw })).toBeTruthy();
    }
    const li = screen.getAllByRole("listitem")[0]!;
    expect(li.getAttribute("style") ?? "").not.toContain("opacity");
  });

  it("Escape closes and focus returns to the opener", () => {
    mockMotion(true);
    function Host() {
      const [open, setOpen] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} onClick={() => setOpen(true)}>
            opener
          </button>
          <Receipt day={DAY} open={open} onClose={() => setOpen(false)} openerRef={ref} />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "opener" });
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: ru.receipt.close }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("backdrop click closes", () => {
    mockMotion(true);
    const onClose = vi.fn();
    render(<Receipt day={DAY} open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("receipt-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function renderApp(hash: string, dayBody: DayResponse) {
  window.history.replaceState(null, "", hash);
  mockMotion(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/days") return json({ days: [{ date: "2026-10-01", tripCount: 2 }] });
      if (url.startsWith("/api/trips?date=")) return json(dayBody);
      return json({});
    }),
  );
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <App />
    </QueryClientProvider>,
  );
}

describe("Close shift in the app", () => {
  it("opens the receipt for the day with trips", async () => {
    renderApp("#2026-10-01", DAY);
    const btn = await screen.findByRole("button", { name: ru.receipt.closeShift });
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(receiptLines(DAY, "ru")[3]!.value);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: ru.receipt.close })));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("is not offered for a day with no trips", async () => {
    renderApp("#2026-10-02", EMPTY);
    await screen.findByTestId("net");
    expect(screen.queryByRole("button", { name: ru.receipt.closeShift })).toBeNull();
  });
});
