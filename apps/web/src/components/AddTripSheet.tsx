import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { validateTrip, type FieldError, type Trip } from "@shift/core";
import { api, NetworkError } from "../api";
import { dayKey, daysKey } from "../hooks";
import { addDays } from "../time";
import { pushToast } from "../toasts";
import { CloseIcon } from "./Icons";

type Field = keyof Trip;
type FieldErrors = Partial<Record<Field, string>>;
type Payment = Trip["payment"];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const SLOT_FIELDS: readonly Field[] = ["start", "end", "amount", "commission", "payment"];
const COMMISSION_RATE = 0.15;

/** `t_` + base36 timestamp + `_` + 6 random chars: matches [A-Za-z0-9_-]{1,64}. */
export function generateTripId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  // 64 symbols and 256 byte values: `& 63` is unbiased.
  const rand = Array.from(bytes, (b) => ALPHABET[b & 63]).join("");
  return `t_${Date.now().toString(36)}_${rand}`;
}

/** "HH:mm" on the given date at +05:00, or "" while the time is empty (validation reports TIME_INVALID). */
const toIso = (date: string, hhmm: string) => (hhmm ? `${date}T${hhmm}:00+05:00` : "");

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TRIP_MINUTES = 12 * 60;
const minutesOf = (hhmm: string) => {
  const m = HHMM_RE.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * A trip crosses midnight when its end time is not after its start time but rolling the end to
 * the next calendar day keeps it within the 12-hour limit (23:40 → 00:15). Anything else stays on
 * the same day, so a real typo (10:00 → 09:00) still gets END_BEFORE_START from the validator.
 */
export function endsNextDay(start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null || e > s) return false;
  return e + 24 * 60 - s <= MAX_TRIP_MINUTES;
}

const digitsOnly = (v: string) => v.replace(/\D/g, "");

const inputClass =
  "min-h-14 w-full rounded-2xl border-0 bg-zinc-100 px-4 text-xl tabular-nums ring-1 ring-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600 dark:bg-zinc-800 dark:ring-zinc-700";

function FieldBox({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} data-testid="end-next-day" className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function Sheet({ date, onClose, openerRef }: { date: string; onClose: () => void; openerRef?: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  // Mounted once per open: the id, and so every retry, is stable until the sheet closes.
  const [tripId] = useState(generateTripId);
  
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  // Commission follows 15% of the amount (rounded down) until the driver edits it by hand.
  const [commissionEdited, setCommissionEdited] = useState(false);
  const [payment, setPayment] = useState<Payment>("cash");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const touch = (f: Field) => setTouched((s) => ({ ...s, [f]: true }));
  const edit = (f: Field) => {
    touch(f);
    setServerErrors((s) => (s[f] ? { ...s, [f]: undefined } : s));
    setFormError(null);
  };

  useEffect(() => {
    // Prefer the explicit opener: Safari/iOS don't focus a button on click, so activeElement can be <body>.
    const trigger = openerRef?.current ?? document.activeElement;
    startRef.current?.focus();
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

  const nextDay = endsNextDay(start, end);
  const amountNum = amount === "" ? undefined : Number(amount);
  const payload = {
    id: tripId,
    start: toIso(date, start),
    end: toIso(nextDay ? addDays(date, 1) : date, end),
    amount: amountNum,
    commission: commission === "" ? 0 : Number(commission),
    payment,
  };
  const clientErrors: FieldErrors = {};
  const result = validateTrip(payload);
  if (!result.ok) for (const e of result.errors) clientErrors[e.field] ??= e.code;

  const errorFor = (f: Field): string | undefined => {
    const code = serverErrors[f] ?? (attempted || touched[f] ? clientErrors[f] : undefined);
    return code ? t(`errors.${code}`) : undefined;
  };
  const aria = (f: Field, id: string) =>
    errorFor(f) ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {};

  const onAmount = (v: string) => {
    const digits = digitsOnly(v);
    edit("amount");
    setAmount(digits);
    if (!commissionEdited) {
      const n = Number(digits);
      setCommission(digits !== "" && n > 0 ? String(Math.floor(n * COMMISSION_RATE)) : "");
    }
  };

  const submit = async () => {
    setAttempted(true);
    setFormError(null);
    const checked = validateTrip(payload);
    if (!checked.ok) return;
    setSubmitting(true);
    try {
      const res = await api.postTrip(checked.trip);
      if (res.status === 200 || res.status === 201) {
        void queryClient.invalidateQueries({ queryKey: dayKey(date) });
        void queryClient.invalidateQueries({ queryKey: daysKey });
        pushToast(res.replay ? "toasts.replayNoDuplicate" : "toasts.tripAdded");
        onClose();
        return;
      }
      const errors = (res.body as { errors?: FieldError[] } | null)?.errors;
      if (res.status === 422 && Array.isArray(errors)) {
        const next: FieldErrors = {};
        let orphan: string | null = null;
        for (const e of errors) {
          // Fields without an input (e.g. id) can't show inline: surface them at form level.
          if (SLOT_FIELDS.includes(e.field)) next[e.field] ??= e.code;
          else orphan ??= `errors.${e.code}`;
        }
        setServerErrors(next);
        if (orphan) setFormError(orphan);
      } else if (res.status === 409) {
        setFormError("errors.ID_CONFLICT");
      } else {
        setFormError("errors.INTERNAL");
      }
    } catch (e) {
      setFormError(e instanceof NetworkError ? "errors.NETWORK" : "errors.INTERNAL");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitting) void submit();
  };

  // Keep Tab inside the dialog.
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

  const titleId = `${uid}-title`;
  const ids = { start: `${uid}-start`, end: `${uid}-end`, amount: `${uid}-amount`, commission: `${uid}-commission` };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div data-testid="sheet-backdrop" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">
            {t("form.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("form.close")}
            className="grid size-12 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldBox id={ids.start} label={t("form.start")} error={errorFor("start")}>
              <input
                ref={startRef}
                id={ids.start}
                type="time"
                value={start}
                onChange={(e) => {
                  edit("start");
                  setStart(e.target.value);
                }}
                onBlur={() => touch("start")}
                className={inputClass}
                {...aria("start", ids.start)}
              />
            </FieldBox>
            <FieldBox id={ids.end} label={t("form.end")} error={errorFor("end")} hint={nextDay ? t("form.nextDay") : undefined}>
              <input
                id={ids.end}
                type="time"
                value={end}
                onChange={(e) => {
                  edit("end");
                  setEnd(e.target.value);
                }}
                onBlur={() => touch("end")}
                className={inputClass}
                {...(nextDay && !errorFor("end") && { "aria-describedby": `${ids.end}-hint` })}
                {...aria("end", ids.end)}
              />
            </FieldBox>
          </div>

          <FieldBox id={ids.amount} label={t("form.amount")} error={errorFor("amount")}>
            <input
              id={ids.amount}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
              onBlur={() => touch("amount")}
              className={inputClass}
              {...aria("amount", ids.amount)}
            />
          </FieldBox>

          <FieldBox id={ids.commission} label={t("form.commission")} error={errorFor("commission")}>
            <input
              id={ids.commission}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={commission}
              onChange={(e) => {
                edit("commission");
                setCommissionEdited(true);
                setCommission(digitsOnly(e.target.value));
              }}
              onBlur={() => touch("commission")}
              className={inputClass}
              {...aria("commission", ids.commission)}
            />
          </FieldBox>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("form.payment")}</legend>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
              {(["cash", "card"] as const).map((p) => (
                <label
                  key={p}
                  className="grid min-h-12 cursor-pointer place-items-center rounded-xl text-lg font-semibold has-[:checked]:bg-emerald-700 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600"
                >
                  <input
                    type="radio"
                    name={`${uid}-payment`}
                    value={p}
                    checked={payment === p}
                    onChange={() => setPayment(p)}
                    className="sr-only"
                  />
                  {t(`payment.${p}`)}
                </label>
              ))}
            </div>
            {errorFor("payment") && (
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{errorFor("payment")}</p>
            )}
          </fieldset>

          {formError && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900">
              <p className="font-medium text-red-900 dark:text-red-200">{t(formError)}</p>
              {formError === "errors.NETWORK" && (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="min-h-11 self-start rounded-full bg-red-700 px-6 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {t("form.retry")}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-14 rounded-full bg-emerald-700 px-6 text-lg font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {submitting ? t("form.submitting") : t("form.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AddTripSheet({
  open,
  date,
  onClose,
  openerRef,
}: {
  open: boolean;
  date: string;
  onClose: () => void;
  /** The element that opened the sheet; focus returns to it on close. */
  openerRef?: RefObject<HTMLElement | null>;
}) {
  return open ? <Sheet date={date} onClose={onClose} openerRef={openerRef} /> : null;
}
