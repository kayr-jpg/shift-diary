import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import type { DayResponse } from "../api";
import { currentLang } from "../i18n";
import { receiptDate, receiptFooter, receiptLines, renderReceiptPng, shareReceipt } from "../lib/receiptImage";
import { pushToast } from "../toasts";
import { CloseIcon } from "./Icons";

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
/** Per-line stagger in seconds (<= 120 ms). */
const STAGGER = 0.1;

function Dashed() {
  return <hr aria-hidden="true" className="my-3 border-0 border-t-2 border-dashed border-zinc-300" />;
}

function ReceiptDialog({
  day,
  onClose,
  openerRef,
}: {
  day: DayResponse;
  onClose: () => void;
  openerRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const lang = currentLang();
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const lines = receiptLines(day, lang);

  useEffect(() => {
    // Prefer the explicit opener: Safari/iOS don't focus a button on click, so activeElement can be <body>.
    const trigger = openerRef?.current ?? document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [openerRef]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderReceiptPng(day, lang);
      const result = await shareReceipt(blob, `shift-${day.date}.png`);
      if (result === "downloaded") pushToast("receipt.downloaded");
    } catch {
      pushToast("receipt.shareFailed");
    } finally {
      setBusy(false);
    }
  };

  const rowClass = (emphasis?: boolean) =>
    `flex items-baseline justify-between gap-4 py-1.5 ${emphasis ? "text-2xl font-extrabold text-emerald-800" : "text-base"}`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4">
      <div data-testid="receipt-backdrop" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        onKeyDown={onKeyDown}
        className="relative flex max-h-[92dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto"
      >
        <div className="rounded-sm bg-white p-6 font-mono text-zinc-900 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 text-center">
              <h2 id="receipt-title" className="sr-only">
                {t("receipt.title")}
              </h2>
              <p className="text-xl font-bold">{t("app.title")}</p>
              <p className="mt-1 text-sm text-zinc-600">{receiptDate(day.date, lang)}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t("receipt.close")}
              className="-mr-3 -mt-3 grid size-12 shrink-0 place-items-center rounded-full text-zinc-700 hover:bg-zinc-100"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>
          <Dashed />
          <ul>
            {lines.map((line, i) => {
              const content = (
                <>
                  <span>{line.label}</span>
                  <span className="tabular-nums whitespace-nowrap">{line.value}</span>
                </>
              );
              return reduced ? (
                <li key={line.label} className={rowClass(line.emphasis)}>
                  {content}
                </li>
              ) : (
                <motion.li
                  key={line.label}
                  className={rowClass(line.emphasis)}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * STAGGER, duration: 0.25, ease: "easeOut" }}
                >
                  {content}
                </motion.li>
              );
            })}
          </ul>
          <Dashed />
          <p className="text-center text-sm text-zinc-600">{receiptFooter(lang)}</p>
        </div>
        <button
          type="button"
          onClick={() => void share()}
          disabled={busy}
          className="min-h-14 rounded-full bg-emerald-700 px-6 text-lg font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {t("receipt.share")}
        </button>
      </div>
    </div>
  );
}

export function Receipt({
  day,
  open,
  onClose,
  openerRef,
}: {
  day: DayResponse;
  open: boolean;
  onClose: () => void;
  /** The element that opened the receipt; focus returns to it on close. */
  openerRef?: RefObject<HTMLElement | null>;
}) {
  return open ? <ReceiptDialog day={day} onClose={onClose} openerRef={openerRef} /> : null;
}
