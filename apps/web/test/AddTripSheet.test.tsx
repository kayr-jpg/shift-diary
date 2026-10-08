import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { AddTripSheet } from "../src/components/AddTripSheet";
import { Toasts } from "../src/components/Toasts";
import { useDay, useDays } from "../src/hooks";
import { createQueryClient } from "../src/queryClient";
import i18n from "../src/i18n";
import ru from "../src/locales/ru.json";

const DATE = "2026-10-01";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const emptyDay = {
  date: DATE,
  timezone: "+05:00",
  summary: { tripCount: 0, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 },
  trips: [],
};

type Post = { id: string; start: string; end: string; amount: number; commission: number; payment: string };
let requested: string[] = [];
let posts: Post[] = [];
let postHandler: (n: number) => Response | Promise<Response>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T12:00:00+05:00"));
  window.history.replaceState(null, "", "/");
  await act(() => i18n.changeLanguage("ru"));
  requested = [];
  posts = [];
  postHandler = () => json({ ok: true }, 201);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/trips" && init?.method === "POST") {
        posts.push(JSON.parse(init.body as string) as Post);
        return postHandler(posts.length);
      }
      requested.push(url);
      if (url === "/api/days") return json({ days: [] });
      if (url.startsWith("/api/trips?date=")) return json(emptyDay);
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  // Toasts live in a module-level store: dismiss leftovers so tests stay independent.
  screen.queryAllByRole("button", { name: ru.toast.dismiss }).forEach((b) => fireEvent.click(b));
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Host() {
  const [open, setOpen] = useState(false);
  useDay(DATE);
  useDays();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        trigger
      </button>
      <AddTripSheet open={open} date={DATE} onClose={() => setOpen(false)} />
      <Toasts />
    </>
  );
}

async function openSheet() {
  render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <Host />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(requested).toContain("/api/days"));
  const trigger = screen.getByRole("button", { name: "trigger" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, user: userEvent.setup({ advanceTimers: () => {} }) };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const times = (s: string, e: string) => {
  fireEvent.change(field(ru.form.start), { target: { value: s } });
  fireEvent.change(field(ru.form.end), { target: { value: e } });
};

describe("AddTripSheet", () => {
  it("is an accessible modal dialog with labelled inputs and focus inside", async () => {
    await openSheet();
    const dialog = screen.getByRole("dialog", { name: ru.form.title });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (const l of [ru.form.start, ru.form.end, ru.form.amount, ru.form.commission]) expect(field(l)).toBeTruthy();
    expect(field(ru.form.start).type).toBe("time");
    expect(field(ru.form.amount).inputMode).toBe("numeric");
    expect(screen.getByRole("radio", { name: ru.payment.cash })).toBeTruthy();
    expect(screen.getByRole("radio", { name: ru.payment.card })).toBeTruthy();
  });

  it("shows translated END_BEFORE_START and AMOUNT_INVALID inline once touched", async () => {
    await openSheet();
    expect(screen.queryByText(ru.errors.END_BEFORE_START)).toBeNull();
    times("10:00", "09:00");
    const end = field(ru.form.end);
    expect(await screen.findByText(ru.errors.END_BEFORE_START)).toBeTruthy();
    expect(end.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(end.getAttribute("aria-describedby")!)?.textContent).toBe(ru.errors.END_BEFORE_START);

    fireEvent.blur(field(ru.form.amount));
    expect(await screen.findByText(ru.errors.AMOUNT_INVALID)).toBeTruthy();
    expect(field(ru.form.amount).getAttribute("aria-invalid")).toBe("true");
  });

  it("strips non-digits from amount and rejects 0", async () => {
    const { user } = await openSheet();
    const amount = field(ru.form.amount);
    await user.type(amount, "1500.5");
    expect(amount.value).toBe("15005");
    await user.clear(amount);
    await user.type(amount, "0");
    expect(amount.value).toBe("0");
    expect(await screen.findByText(ru.errors.AMOUNT_INVALID)).toBeTruthy();
    // Nothing is sent while invalid.
    times("09:00", "09:30");
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));
    expect(posts).toHaveLength(0);
  });

  it("prefills commission at 15% (rounded down) until edited by hand", async () => {
    const { user } = await openSheet();
    await user.type(field(ru.form.amount), "1999");
    expect(field(ru.form.commission).value).toBe("299");
    await user.clear(field(ru.form.commission));
    await user.type(field(ru.form.commission), "100");
    await user.type(field(ru.form.amount), "0");
    expect(field(ru.form.commission).value).toBe("100");
  });

  it("submits the exact body, closes, refetches day + days and toasts", async () => {
    const { trigger, user } = await openSheet();
    times("09:05", "09:20");
    await user.type(field(ru.form.amount), "1500");
    fireEvent.click(screen.getByRole("radio", { name: ru.payment.card }));
    const before = requested.length;
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toHaveLength(1);
    const body = posts[0]!;
    expect(Object.keys(body).sort()).toEqual(["amount", "commission", "end", "id", "payment", "start"]);
    expect(body).toMatchObject({
      start: "2026-10-01T09:05:00+05:00",
      end: "2026-10-01T09:20:00+05:00",
      amount: 1500,
      commission: 225,
      payment: "card",
    });
    expect(body.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    await waitFor(() => {
      const after = requested.slice(before);
      expect(after).toContain("/api/days");
      expect(after).toContain(`/api/trips?date=${DATE}`);
    });
    expect(within(screen.getByTestId("toasts")).getByText(ru.toasts.tripAdded)).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders server 422 codes inline, overriding client state", async () => {
    postHandler = () =>
      json({ errors: [{ field: "commission", code: "COMMISSION_INVALID" }, { field: "end", code: "DURATION_TOO_LONG" }] }, 422);
    const { user } = await openSheet();
    times("09:00", "09:30");
    await user.type(field(ru.form.amount), "1000");
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));
    expect(await screen.findByText(ru.errors.COMMISSION_INVALID)).toBeTruthy();
    expect(screen.getByText(ru.errors.DURATION_TOO_LONG)).toBeTruthy();
    expect(field(ru.form.end).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Editing the field clears its server error.
    fireEvent.change(field(ru.form.end), { target: { value: "09:40" } });
    expect(screen.queryByText(ru.errors.DURATION_TOO_LONG)).toBeNull();
  });

  it("maps 409 to a form-level error and 500 to INTERNAL", async () => {
    postHandler = () => json({ errors: [{ field: "id", code: "ID_CONFLICT" }] }, 409);
    const { user } = await openSheet();
    times("09:00", "09:30");
    await user.type(field(ru.form.amount), "1000");
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));
    expect(await within(await screen.findByRole("alert")).findByText(ru.errors.ID_CONFLICT)).toBeTruthy();
    postHandler = () => json({}, 500);
    await waitFor(() => expect((screen.getByRole("button", { name: ru.form.submit }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));
    expect(await screen.findByText(ru.errors.INTERNAL)).toBeTruthy();
  });

  it("keeps the sheet open on network failure; Retry reuses the id and a replay toasts", async () => {
    postHandler = (n) => {
      if (n === 1) throw new TypeError("Failed to fetch");
      return json({ ok: true }, 200, { "Idempotent-Replay": "true" });
    };
    const { user } = await openSheet();
    times("09:00", "09:30");
    await user.type(field(ru.form.amount), "1000");
    fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(ru.errors.NETWORK)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(alert).getByRole("button", { name: ru.form.retry }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toHaveLength(2);
    expect(posts[1]!.id).toBe(posts[0]!.id);
    expect(posts[1]).toEqual(posts[0]);
    expect(within(screen.getByTestId("toasts")).getByText(ru.toasts.replayNoDuplicate)).toBeTruthy();
  });

  it("generates a new id when the sheet is reopened", async () => {
    const { trigger, user } = await openSheet();
    const submitOnce = async () => {
      times("09:00", "09:30");
      await user.type(field(ru.form.amount), "1000");
      fireEvent.click(screen.getByRole("button", { name: ru.form.submit }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    };
    await submitOnce();
    fireEvent.click(trigger);
    await submitOnce();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.id).not.toBe(posts[0]!.id);
  });

  it("Escape closes and returns focus to the trigger; backdrop click closes too", async () => {
    const { trigger } = await openSheet();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe("App integration", () => {
  it("opens the sheet from the main Add trip button", async () => {
    window.history.replaceState(null, "", `/#${DATE}`);
    render(
      <QueryClientProvider client={createQueryClient({ retry: false })}>
        <App />
      </QueryClientProvider>,
    );
    const button = await screen.findByRole("button", { name: ru.form.open });
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: ru.form.title })).toBeTruthy();
  });
});
