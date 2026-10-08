import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, NetworkError, type DayCount } from "./api";
import { useDay, useDays } from "./hooks";
import { addDays, dateFromHash, dayOfMonth, monthOf, todayKz, weekdayOf } from "./time";
import { DayStrip } from "./components/DayStrip";
import { SummaryCard } from "./components/SummaryCard";
import { TripList } from "./components/TripList";
import { LangToggle } from "./components/LangToggle";
import { Toasts } from "./components/Toasts";
import { AddTripSheet } from "./components/AddTripSheet";
import { LazyReceipt, preloadReceipt } from "./components/LazyReceipt";
import { UnderTheHood } from "./components/UnderTheHood";
import { ChevronLeft, ChevronRight } from "./components/Icons";

/** Today if it has trips, else the latest day with trips, else today. */
export function pickInitialDate(days: DayCount[], today: string): string {
  const withTrips = days.filter((d) => d.tripCount > 0).map((d) => d.date).sort();
  if (withTrips.includes(today)) return today;
  return withTrips[withTrips.length - 1] ?? today;
}

/** Selected date lives in the URL hash (#2026-10-01) so reloads and links keep it. */
function useHashDate(): [string | null, (date: string) => void] {
  const [date, setDate] = useState<string | null>(() => dateFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      const d = dateFromHash(window.location.hash);
      if (d) setDate(d);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const select = useCallback((d: string) => {
    window.history.replaceState(null, "", `#${d}`);
    setDate(d);
  }, []);
  return [date, select];
}

function errorKey(error: unknown): string {
  if (error instanceof NetworkError) return "errors.NETWORK";
  if (error instanceof ApiError) {
    const code = (error.body as { errors?: { code?: unknown }[] } | null)?.errors?.[0]?.code;
    if (code === "DATE_INVALID") return "errors.DATE_INVALID";
  }
  return "errors.INTERNAL";
}

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t("state.loading")}</span>
      <div className="h-56 animate-pulse rounded-3xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function DayView({ date }: { date: string }) {
  const { t } = useTranslation();
  const day = useDay(date);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const closeShiftRef = useRef<HTMLButtonElement>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const hasTrips = (day.data?.summary.tripCount ?? 0) > 0;
  // Warm the Receipt chunk when idle so the first tap opens instantly.
  useEffect(() => {
    if (!hasTrips) return;
    const id = window.setTimeout(preloadReceipt, 1500);
    return () => window.clearTimeout(id);
  }, [hasTrips]);
  if (day.isPending) return <Skeleton />;
  if (day.isError) {
    return (
      <div role="alert" className="rounded-3xl bg-red-50 p-6 text-center ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900">
        <p className="text-lg font-semibold text-red-900 dark:text-red-200">{t("state.error")}</p>
        <p className="mt-1 text-red-800 dark:text-red-300">{t(errorKey(day.error))}</p>
        <button
          type="button"
          onClick={() => void day.refetch()}
          className="mt-4 min-h-11 rounded-full bg-red-700 px-6 font-semibold text-white hover:bg-red-800"
        >
          {t("state.retry")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SummaryCard
        summary={day.data.summary}
        onCloseShift={() => setReceiptOpen(true)}
        closeShiftRef={closeShiftRef}
        onPreload={preloadReceipt}
        busy={receiptBusy}
      />
      <TripList trips={day.data.trips} />
      {receiptOpen && (
        <LazyReceipt day={day.data} onClose={() => setReceiptOpen(false)} openerRef={closeShiftRef} onBusy={setReceiptBusy} />
      )}
    </div>
  );
}

const arrowClass =
  "grid size-12 place-items-center rounded-full bg-white ring-1 ring-zinc-200 hover:bg-zinc-100 active:bg-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:bg-zinc-800";

export default function App() {
  const { t } = useTranslation();
  const [hashDate, setDate] = useHashDate();
  const days = useDays();
  const today = todayKz();
  const [sheetOpen, setSheetOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const date = hashDate ?? (days.isSuccess ? pickInitialDate(days.data, today) : days.isError ? today : null);

  // Record the auto-picked date in the URL too.
  useEffect(() => {
    if (date !== null && hashDate === null) window.history.replaceState(null, "", `#${date}`);
  }, [date, hashDate]);

  const dayData = useDay(date);
  const lastTrip = dayData.data?.trips.at(-1);

  const tripDays = useMemo(
    () => new Set((days.data ?? []).filter((d) => d.tripCount > 0).map((d) => d.date)),
    [days.data],
  );

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <h1 className="text-lg font-bold leading-tight">{t("app.title")}</h1>
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-24 pt-4">
        {date === null ? (
          <Skeleton />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button type="button" className={arrowClass} aria-label={t("nav.prev")} onClick={() => setDate(addDays(date, -1))}>
                <ChevronLeft className="size-6" />
              </button>
              <div className="flex-1 text-center">
                <p className="text-xl font-bold" aria-live="polite">
                  {t("date.long", { day: dayOfMonth(date), month: t(`date.month.${monthOf(date)}`) })}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(`date.weekday.${weekdayOf(date)}`)}</p>
              </div>
              <button type="button" className={arrowClass} aria-label={t("nav.next")} onClick={() => setDate(addDays(date, 1))}>
                <ChevronRight className="size-6" />
              </button>
            </div>
            <DayStrip selected={date} today={today} tripDays={tripDays} onSelect={setDate} />
            <button
              type="button"
              onClick={() => setDate(today)}
              disabled={date === today}
              className="min-h-11 self-center rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
            >
              {t("nav.today")}
            </button>
            <DayView date={date} />
            <UnderTheHood date={date} lastTrip={lastTrip} />
          </>
        )}
      </main>
      {date !== null && (
        <>
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => setSheetOpen(true)}
            className="fixed bottom-5 right-4 z-30 min-h-14 rounded-full bg-emerald-700 px-7 text-lg font-bold text-white shadow-lg hover:bg-emerald-800 active:bg-emerald-900"
          >
            {t("form.open")}
          </button>
          <AddTripSheet open={sheetOpen} date={date} openerRef={addButtonRef} onClose={() => setSheetOpen(false)} />
        </>
      )}
      <Toasts />
    </div>
  );
}
