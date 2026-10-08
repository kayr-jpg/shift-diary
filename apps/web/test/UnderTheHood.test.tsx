import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { UnderTheHood } from "../src/components/UnderTheHood";
import { formatExchange, type DayTrip } from "../src/api";
import { createQueryClient } from "../src/queryClient";
import i18n from "../src/i18n";
import ru from "../src/locales/ru.json";

const DATE = "2026-10-01";
const STORED = {
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  commission: 360,
  payment: "card",
};
const LAST: DayTrip = { ...STORED, payment: "card", durationMinutes: 22, warnings: [] };

type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];
let stored: Record<string, typeof STORED>;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

function dayBody() {
  const trips = Object.values(stored);
  return {
    date: DATE,
    timezone: "+05:00",
    summary: { tripCount: trips.length, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 },
    trips: trips.map((t) => ({ ...t, durationMinutes: 22 })),
  };
}

function stubApi() {
  calls = [];
  stored = { t1: { ...STORED } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      if (method === "GET" && url.startsWith("/api/trips?date=")) return json(dayBody());
      if (method === "GET" && url === "/api/days") return json({ days: [{ date: DATE, tripCount: Object.keys(stored).length }] });
      if (method === "POST" && url === "/api/trips") {
        if (body.id === "bad id") {
          return json(
            {
              errors: [
                { code: "ID_INVALID" },
                { code: "AMOUNT_INVALID" },
                { code: "END_BEFORE_START" },
                { code: "COMMISSION_INVALID" },
                { code: "PAYMENT_INVALID" },
              ],
            },
            422,
          );
        }
        const prev = stored[body.id];
        if (!prev) {
          stored[body.id] = body;
          return json(body, 201);
        }
        if (prev.amount === body.amount) return json(prev, 200, { "Idempotent-Replay": "true" });
        return json({ code: "ID_CONFLICT", diff: { amount: [prev.amount, body.amount] } }, 409);
      }
      if (method === "POST" && url === "/api/sandbox/reset") {
        stored = {};
        return new Response(null, { status: 204 });
      }
      return json({ error: "not found" }, 404);
    }),
  );
}

function renderPanel(lastTrip: DayTrip | null = LAST) {
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <UnderTheHood date={DATE} lastTrip={lastTrip ?? undefined} />
    </QueryClientProvider>,
  );
}

const openPanel = () => fireEvent.click(screen.getByText(ru.hood.title));
const btn = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage("ru");
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnderTheHood", () => {
  it("repeat last trip: sends the exact stored fields, shows 200 + Idempotent-Replay, count unchanged", async () => {
    renderPanel();
    openPanel();
    fireEvent.click(btn(ru.hood.repeat.label));
    await waitFor(() => expect(within(screen.getByTestId("hood-repeat")).getByText(/HTTP 200/)).toBeTruthy());
    const post = calls.find((c) => c.method === "POST" && c.url === "/api/trips");
    expect(post?.body).toEqual(STORED);
    const block = screen.getByTestId("hood-repeat").textContent ?? "";
    expect(block).toContain("Idempotent-Replay: true");
    expect(block).toContain('"id": "t1"');
    await waitFor(() => expect(screen.getByTestId("hood-repeat").textContent).toContain("1 → 1"));
    expect(Object.keys(stored)).toHaveLength(1);
  });

  it("same id, different amount: shows 409 and the diff", async () => {
    renderPanel();
    openPanel();
    fireEvent.click(btn(ru.hood.conflict.label));
    await waitFor(() => expect(screen.getByTestId("hood-conflict").textContent).toContain("HTTP 409"));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ ...STORED, amount: 2500 });
    const text = screen.getByTestId("hood-conflict").textContent ?? "";
    expect(text).toContain("ID_CONFLICT");
    expect(text).toMatch(/"amount": \[\s*2400,\s*2500\s*\]/);
  });

  it("invalid trip: shows 422, every error code raw and translated", async () => {
    renderPanel();
    openPanel();
    fireEvent.click(btn(ru.hood.invalid.label));
    await waitFor(() => expect(screen.getByTestId("hood-invalid").textContent).toContain("HTTP 422"));
    const text = screen.getByTestId("hood-invalid").textContent ?? "";
    for (const code of ["ID_INVALID", "AMOUNT_INVALID", "END_BEFORE_START", "COMMISSION_INVALID", "PAYMENT_INVALID"]) {
      expect(text).toContain(code);
      expect(text).toContain(ru.errors[code as keyof typeof ru.errors]);
    }
  });

  it("reset: needs a confirming second click, then resets and refetches", async () => {
    renderPanel();
    openPanel();
    fireEvent.click(btn(ru.hood.reset.label));
    expect(calls.some((c) => c.url === "/api/sandbox/reset")).toBe(false);
    fireEvent.click(btn(ru.hood.reset.confirm));
    await waitFor(() => expect(screen.getByTestId("hood-reset").textContent).toContain("HTTP 204"));
    expect(calls.filter((c) => c.url === "/api/sandbox/reset")).toHaveLength(1);
    const resetAt = calls.findIndex((c) => c.url === "/api/sandbox/reset");
    await waitFor(() => expect(calls.slice(resetAt).some((c) => c.url.startsWith("/api/trips?date="))).toBe(true));
  });

  it("reset confirmation expires after 4 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPanel();
      openPanel();
      fireEvent.click(btn(ru.hood.reset.label));
      expect(screen.getByRole("button", { name: new RegExp(ru.hood.reset.confirm) })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(4100);
      });
      expect(screen.queryByRole("button", { name: new RegExp(ru.hood.reset.confirm) })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("repeat and conflict are disabled without trips, invalid and reset stay enabled", () => {
    renderPanel(null);
    openPanel();
    expect((btn(ru.hood.repeat.label) as HTMLButtonElement).disabled).toBe(true);
    expect((btn(ru.hood.conflict.label) as HTMLButtonElement).disabled).toBe(true);
    expect((btn(ru.hood.invalid.label) as HTMLButtonElement).disabled).toBe(false);
    expect((btn(ru.hood.reset.label) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getAllByText(ru.hood.noTrips).length).toBeGreaterThan(0);
  });

  it("shows a network error message when the server is unreachable", async () => {
    renderPanel();
    openPanel();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    fireEvent.click(btn(ru.hood.invalid.label));
    await waitFor(() => expect(screen.getByTestId("hood-invalid").textContent).toContain(ru.errors.NETWORK));
  });

  it("the drawer is a details element that toggles open on summary activation", () => {
    const { container } = renderPanel();
    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    openPanel();
    expect(details.hasAttribute("open")).toBe(true);
    openPanel();
    expect(details.hasAttribute("open")).toBe(false);
  });
});

describe("formatExchange", () => {
  it("renders request, blank line, response exactly", () => {
    const text = formatExchange({
      request: {
        method: "POST",
        path: "/api/trips",
        headers: { "Content-Type": "application/json" },
        body: { id: "t1", amount: 2400 },
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json", "idempotent-replay": "true" },
        body: { id: "t1" },
      },
    });
    expect(text).toBe(
      [
        "POST /api/trips",
        "Content-Type: application/json",
        "",
        '{\n  "id": "t1",\n  "amount": 2400\n}',
        "",
        "HTTP 200",
        "Content-Type: application/json",
        "Idempotent-Replay: true",
        "",
        '{\n  "id": "t1"\n}',
      ].join("\n"),
    );
  });

  it("omits the body section when there is no body", () => {
    const text = formatExchange({
      request: { method: "POST", path: "/api/sandbox/reset", headers: {}, body: undefined },
      response: { status: 204, statusText: "", headers: {}, body: null },
    });
    expect(text).toBe("POST /api/sandbox/reset\n\nHTTP 204");
  });
});
