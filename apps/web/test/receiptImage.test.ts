import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import i18n from "../src/i18n";
import type { DayResponse } from "../src/api";
import {
  receiptDate,
  receiptLines,
  renderReceiptPng,
  shareReceipt,
  type CanvasLike,
} from "../src/lib/receiptImage";

const money = (s: string) => s.replace(/ /g, "\u00a0");

const DAY: DayResponse = {
  date: "2026-10-01",
  timezone: "+05:00",
  summary: { tripCount: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 },
  trips: [],
};

beforeEach(async () => {
  await act(() => i18n.changeLanguage("ru"));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("receiptLines", () => {
  it("gives the brief day's values with net emphasised", () => {
    const lines = receiptLines(DAY, "ru");
    expect(lines.map((l) => l.value)).toEqual([
      "2",
      money("3 900 ₸"),
      money("585 ₸"),
      money("3 315 ₸"),
      money("1 500 ₸"),
      money("2 400 ₸"),
    ]);
    expect(lines.filter((l) => l.emphasis).map((l) => l.value)).toEqual([money("3 315 ₸")]);
    expect(lines[3]!.label).toBe("На руки");
  });

  it("formats the date from YYYY-MM-DD with weekday, per language", () => {
    const ru = receiptDate("2026-10-01", "ru");
    expect(ru).toContain("1 октября");
    expect(ru).toBe(
      new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(2026, 9, 1)),
      ),
    );
    expect(receiptDate("2026-10-01", "en")).toContain("October");
  });
});

function fakeCanvas(blob: Blob | null) {
  const drawn: string[] = [];
  const noop = () => {};
  const ctx = {
    scale: noop, fillRect: noop, save: noop, restore: noop, setLineDash: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop,
    fillText: (text: string) => drawn.push(text),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: BlobCallback) => cb(blob),
  } as unknown as CanvasLike;
  return { canvas, drawn };
}

describe("renderReceiptPng", () => {
  it("draws every receipt value and resolves a Blob at 2x", async () => {
    const png = new Blob(["x"], { type: "image/png" });
    const { canvas, drawn } = fakeCanvas(png);
    const blob = await renderReceiptPng(DAY, "ru", () => canvas);
    expect(blob).toBe(png);
    for (const l of receiptLines(DAY, "ru")) {
      expect(drawn).toContain(l.label);
      expect(drawn).toContain(l.value);
    }
    expect(drawn).toContain(receiptDate(DAY.date, "ru"));
    expect(canvas.width).toBe(720);
  });

  it("rejects when toBlob yields null", async () => {
    const { canvas } = fakeCanvas(null);
    await expect(renderReceiptPng(DAY, "ru", () => canvas)).rejects.toThrow();
  });
});

describe("shareReceipt", () => {
  const blob = new Blob(["x"], { type: "image/png" });

  it("uses navigator.share when files can be shared", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share });
    expect(await shareReceipt(blob, "shift-2026-10-01.png")).toBe("shared");
    const arg = share.mock.calls[0]![0] as { files: File[] };
    expect(arg.files[0]!.name).toBe("shift-2026-10-01.png");
  });

  it("treats AbortError as cancelled and rethrows other errors", async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException("x", "AbortError"));
    vi.stubGlobal("navigator", { canShare: () => true, share });
    expect(await shareReceipt(blob, "a.png")).toBe("cancelled");
    share.mockRejectedValueOnce(new Error("boom"));
    await expect(shareReceipt(blob, "a.png")).rejects.toThrow("boom");
  });

  it("falls back to an anchor download otherwise", async () => {
    vi.stubGlobal("navigator", {});
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    expect(await shareReceipt(blob, "shift-2026-10-01.png")).toBe("downloaded");
    expect(clicked[0]!.getAttribute("download")).toBe("shift-2026-10-01.png");
    expect(clicked[0]!.href).toBe("blob:fake");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });
});
