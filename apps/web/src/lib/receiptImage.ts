import i18n from "../i18n";
import { formatMoney, type Lang } from "../money";
import type { DayResponse } from "../api";

export type ReceiptLine = { label: string; value: string; emphasis?: boolean };

const INTL_LOCALE: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-US" };

/** Single source of truth for the receipt rows: used by the DOM receipt and the canvas image. */
export function receiptLines(day: DayResponse, lang: Lang): ReceiptLine[] {
  const t = i18n.getFixedT(lang);
  const s = day.summary;
  return [
    { label: t("receipt.trips"), value: String(s.tripCount) },
    { label: t("receipt.revenue"), value: formatMoney(s.revenue, lang) },
    { label: t("receipt.commission"), value: formatMoney(s.commission, lang) },
    { label: t("receipt.net"), value: formatMoney(s.net, lang), emphasis: true },
    { label: t("receipt.cash"), value: formatMoney(s.cash, lang) },
    { label: t("receipt.card"), value: formatMoney(s.card, lang) },
  ];
}

/** "четверг, 1 октября 2026 г." from YYYY-MM-DD. Formatted in UTC so the device timezone can't shift the day. */
export function receiptDate(date: string, lang: Lang): string {
  try {
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    // Invalid date string: show it as-is rather than crash a render.
    return date;
  }
}

export const receiptTitle = (lang: Lang): string => i18n.getFixedT(lang)("app.title");
export const receiptFooter = (lang: Lang): string => i18n.getFixedT(lang)("receipt.thanks");

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const REVOKE_DELAY_MS = 1000;
const SCALE = 2;
const WIDTH = 360;
const PAD = 24;
const ROW = 34;

/** Trims `text` with an ellipsis until it fits `maxWidth` in the context's current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export type CanvasLike = Pick<HTMLCanvasElement, "width" | "height" | "getContext" | "toBlob">;

/** Draws the same lines as the DOM receipt onto a canvas (2x) and encodes it as PNG. */
export function renderReceiptPng(
  day: DayResponse,
  lang: Lang,
  createCanvas: () => CanvasLike = () => document.createElement("canvas"),
): Promise<Blob> {
  const lines = receiptLines(day, lang);
  const height = PAD * 2 + 96 + 20 + lines.length * ROW + 20 + 44;
  const canvas = createCanvas();
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas 2d context unavailable"));

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = "#18181b";
  ctx.textBaseline = "alphabetic";

  const dashed = (y: number) => {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#a1a1aa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(WIDTH - PAD, y);
    ctx.stroke();
    ctx.restore();
  };

  let y = PAD + 24;
  ctx.textAlign = "center";
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(fit(ctx, receiptTitle(lang), WIDTH - PAD * 2), WIDTH / 2, y);
  y += 28;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(fit(ctx, receiptDate(day.date, lang), WIDTH - PAD * 2), WIDTH / 2, y);
  y += 24;
  dashed(y);
  y += 20;

  for (const line of lines) {
    y += ROW - 8;
    ctx.font = `${line.emphasis ? 700 : 400} ${line.emphasis ? 20 : 16}px ${FONT}`;
    const valueWidth = ctx.measureText(line.value).width;
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, line.label, WIDTH - PAD * 2 - valueWidth - 12), PAD, y);
    ctx.textAlign = "right";
    ctx.fillText(line.value, WIDTH - PAD, y);
    y += 8;
  }

  y += 4;
  dashed(y);
  y += 30;
  ctx.textAlign = "center";
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(fit(ctx, receiptFooter(lang), WIDTH - PAD * 2), WIDTH / 2, y);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas toBlob returned null"))), "image/png");
  });
}

/** Share via the native sheet when files are supported, else download. A user cancel is not an error. */
export async function shareReceipt(blob: Blob, filename: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download on Safari / older Firefox.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return "downloaded";
}
