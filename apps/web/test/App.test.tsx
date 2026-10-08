import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { createQueryClient } from "../src/queryClient";
import i18n, { readStoredLang } from "../src/i18n";
import { formatTimeRange } from "../src/time";
import ru from "../src/locales/ru.json";
import en from "../src/locales/en.json";

const NBSP = " ";
const money = (s: string) => s.replace(/ /g, NBSP);

const BRIEF_DAY = {
  date: "2026-10-01",
  timezone: "+05:00",
  summary: { tripCount: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 },
  trips: [
    {
      id: "t1",
      start: "2026-10-01T08:10:00+05:00",
      end: "2026-10-01T08:32:00+05:00",
      amount: 2400,
      commission: 360,
      payment: "card",
      durationMinutes: 22,
    },
    {
      id: "t2",
      start: "2026-10-01T09:05:00+05:00",
      end: "2026-10-01T09:20:00+05:00",
      amount: 1500,
      commission: 225,
      payment: "cash",
      durationMinutes: 15,
    },
  ],
};

const emptyDay = (date: string) => ({
  date,
  timezone: "+05:00",
  summary: { tripCount: 0, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 },
  trips: [],
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let requested: string[] = [];

function stubApi(opts: { fail?: boolean } = {}) {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requested.push(url);
      if (opts.fail) throw new TypeError("Failed to fetch");
      if (url === "/api/days") return json({ days: [{ date: "2026-10-01", tripCount: 2 }] });
      const m = /^\/api\/trips\?date=(.+)$/.exec(url);
      if (m) return json(m[1] === "2026-10-01" ? BRIEF_DAY : emptyDay(m[1]!));
      return json({ error: "not found" }, 404);
    }),
  );
}

function renderApp() {
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T12:00:00+05:00"));
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  await act(() => i18n.changeLanguage("ru"));
  stubApi();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("main screen", () => {
  it("opens the latest day with trips and shows the brief's summary and trips", async () => {
    renderApp();
    const hero = await screen.findByTestId("net");
    expect(hero.textContent).toBe(money("3 315 ₸"));
    expect(screen.getByText(ru.summary.net)).toBeTruthy();
    expect(screen.getByTestId("revenue").textContent).toBe(money("3 900 ₸"));
    expect(screen.getByTestId("commission").textContent).toBe(money("585 ₸"));

    const times = screen.getAllByTestId("trip-time").map((el) => el.textContent);
    expect(times).toEqual(["08:10–08:32", "09:05–09:20"]);
    expect(screen.getByText("22 мин")).toBeTruthy();

    // Split bar carries text, not only colour.
    const split = screen.getByTestId("split");
    expect(split.textContent).toContain(money("1 500 ₸"));
    expect(split.textContent).toContain("38%");
    expect(split.textContent).toContain(money("2 400 ₸"));
    expect(split.textContent).toContain("62%");

    expect(requested).toContain("/api/days");
    expect(requested).toContain("/api/trips?date=2026-10-01");
    expect(window.location.hash).toBe("#2026-10-01");
  });

  it("next-day arrow requests the next date and shows the empty state", async () => {
    renderApp();
    await screen.findByTestId("net");
    fireEvent.click(screen.getByRole("button", { name: ru.nav.next }));
    await screen.findByText(ru.empty.title);
    expect(requested).toContain("/api/trips?date=2026-10-02");
    expect(window.location.hash).toBe("#2026-10-02");
  });

  it("deep-links to the date in the URL hash", async () => {
    window.history.replaceState(null, "", "/#2026-10-02");
    renderApp();
    await screen.findByText(ru.empty.title);
    expect(requested).toContain("/api/trips?date=2026-10-02");
    expect(requested).not.toContain("/api/trips?date=2026-10-01");
  });

  it("Today jumps to the KZ date", async () => {
    renderApp();
    await screen.findByTestId("net");
    fireEvent.click(screen.getByRole("button", { name: ru.nav.today }));
    await screen.findByText(ru.empty.title);
    expect(requested).toContain("/api/trips?date=2026-10-08");
  });

  it("shows a network toast and a retryable error state when fetch fails", async () => {
    stubApi({ fail: true });
    window.history.replaceState(null, "", "/#2026-10-01");
    renderApp();
    const toasts = await screen.findByTestId("toasts");
    await within(toasts).findByText(ru.errors.NETWORK);
    expect(screen.getByRole("button", { name: ru.state.retry })).toBeTruthy();

    stubApi();
    fireEvent.click(screen.getByRole("button", { name: ru.state.retry }));
    expect((await screen.findByTestId("net")).textContent).toBe(money("3 315 ₸"));
  });
});

describe("language", () => {
  it("switches to EN, persists it and updates <html lang>", async () => {
    renderApp();
    await screen.findByTestId("net");
    fireEvent.click(screen.getByRole("button", { name: ru.lang.en }));
    await screen.findByText(en.summary.net);
    expect(window.localStorage.getItem("lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(en.app.title);
    expect(readStoredLang()).toBe("en");
  });

  it("works when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStoredLang()).toBeNull();
    renderApp();
    await screen.findByTestId("net");
    fireEvent.click(screen.getByRole("button", { name: ru.lang.en }));
    await screen.findByText(en.summary.net);
  });
});

describe("formatTimeRange", () => {
  it("renders +05:00 wall-clock time regardless of the process timezone", () => {
    const saved = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      // Sanity: the device timezone really differs.
      expect(new Date("2026-10-01T08:10:00+05:00").getHours()).not.toBe(8);
      expect(formatTimeRange("2026-10-01T08:10:00+05:00", "2026-10-01T08:32:00+05:00")).toBe("08:10–08:32");
      // Trips stored with another offset still display in KZ time.
      expect(formatTimeRange("2026-10-01T03:10:00Z", "2026-10-01T03:32:00Z")).toBe("08:10–08:32");
      expect(formatTimeRange("2026-09-30T23:55:00+05:00", "2026-10-01T00:20:00+05:00")).toBe("23:55–00:20");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe("api client", () => {
  it("waits for /api/days before choosing a date", async () => {
    renderApp();
    await waitFor(() => expect(requested[0]).toBe("/api/days"));
  });
});

describe("day swipe", () => {
  function swipe(dx: number, dy: number) {
    const area = screen.getByTestId("day-swipe");
    fireEvent.pointerDown(area, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(area, { pointerId: 1, isPrimary: true, clientX: 200 + dx / 2, clientY: 300 + dy / 2 });
    fireEvent.pointerUp(area, { pointerId: 1, isPrimary: true, clientX: 200 + dx, clientY: 300 + dy });
  }

  it("is restricted to the day panel and lets vertical panning through", async () => {
    renderApp();
    await screen.findByTestId("net");
    const area = screen.getByTestId("day-swipe");
    expect(area.className).toContain("touch-pan-y");
    expect(area.contains(screen.getByRole("navigation", { name: ru.nav.strip }))).toBe(false);
  });

  it("swipe left past 60 px opens the next day", async () => {
    renderApp();
    await screen.findByTestId("net");
    swipe(-120, 10);
    await screen.findByText(ru.empty.title);
    expect(requested).toContain("/api/trips?date=2026-10-02");
    expect(window.location.hash).toBe("#2026-10-02");
  });

  it("swipe right opens the previous day", async () => {
    renderApp();
    await screen.findByTestId("net");
    swipe(120, -5);
    await screen.findByText(ru.empty.title);
    expect(window.location.hash).toBe("#2026-09-30");
  });

  it("a short drag (30 px) does not navigate", async () => {
    renderApp();
    await screen.findByTestId("net");
    swipe(-30, 0);
    await act(async () => {});
    expect(requested).not.toContain("/api/trips?date=2026-10-02");
    expect(window.location.hash).toBe("#2026-10-01");
  });

  it("a mostly vertical drag does not navigate", async () => {
    renderApp();
    await screen.findByTestId("net");
    swipe(-80, 200);
    await act(async () => {});
    expect(requested).not.toContain("/api/trips?date=2026-10-02");
    expect(window.location.hash).toBe("#2026-10-01");
  });

  it("a cancelled pointer (browser took over to scroll) does not navigate", async () => {
    renderApp();
    await screen.findByTestId("net");
    const area = screen.getByTestId("day-swipe");
    fireEvent.pointerDown(area, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 300 });
    fireEvent.pointerCancel(area, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(area, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 300 });
    await act(async () => {});
    expect(window.location.hash).toBe("#2026-10-01");
  });
});

describe("offline", () => {
  let online = true;
  beforeEach(() => {
    online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  });
  const go = (state: boolean) =>
    act(() => {
      online = state;
      window.dispatchEvent(new Event(state ? "online" : "offline"));
    });

  it("shows a status banner and disables Add trip with a hint while offline", async () => {
    renderApp();
    await screen.findByTestId("net");
    const add = screen.getByRole("button", { name: ru.form.open });
    expect(screen.queryByText(ru.offline.banner)).toBeNull();
    expect((add as HTMLButtonElement).disabled).toBe(false);

    go(false);
    const banner = screen.getByText(ru.offline.banner).closest('[role="status"]')!;
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect((add as HTMLButtonElement).disabled).toBe(true);
    const hintId = add.getAttribute("aria-describedby")!;
    expect(document.getElementById(hintId)?.textContent).toBe(ru.offline.addDisabled);

    go(true);
    expect(screen.queryByText(ru.offline.banner)).toBeNull();
    expect((add as HTMLButtonElement).disabled).toBe(false);
    expect(add.getAttribute("aria-describedby")).toBeNull();
  });

  it("starts offline when the browser already is", async () => {
    online = false;
    renderApp();
    expect(await screen.findByText(ru.offline.banner)).toBeTruthy();
  });
});
