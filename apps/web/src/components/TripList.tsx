import { useTranslation } from "react-i18next";
import type { DayTrip } from "../api";
import { formatTimeRange } from "../time";
import { Money } from "./Money";
import { CardIcon, CashIcon, WarningIcon } from "./Icons";

function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return t("duration.minutes", { m });
    if (m === 0) return t("duration.hours", { h });
    return t("duration.hoursMinutes", { h, m });
  };
}

function TripRow({ trip }: { trip: DayTrip }) {
  const { t } = useTranslation();
  const duration = useDuration();
  const overlaps = trip.warnings?.filter((w) => w.code === "OVERLAP").map((w) => w.with) ?? [];
  const PaymentIcon = trip.payment === "cash" ? CashIcon : CardIcon;
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold tabular-nums" data-testid="trip-time">
          {formatTimeRange(trip.start, trip.end)}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <span>{duration(trip.durationMinutes)}</span>
          <span className="inline-flex items-center gap-1">
            <PaymentIcon className={`size-4 ${trip.payment === "cash" ? "text-amber-600" : "text-sky-600"}`} />
            {t(`payment.${trip.payment}`)}
          </span>
          {overlaps.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              title={t("trips.overlapWith", { ids: overlaps.join(", ") })}
            >
              <WarningIcon className="size-3.5" />
              {t("trips.overlap")}
              <span className="sr-only">: {t("trips.overlapWith", { ids: overlaps.join(", ") })}</span>
            </span>
          )}
        </p>
      </div>
      <Money value={trip.amount} className="text-xl font-bold" />
    </li>
  );
}

export function TripList({ trips }: { trips: DayTrip[] }) {
  const { t } = useTranslation();
  if (trips.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="text-4xl" aria-hidden="true">
          🚕
        </p>
        <p className="mt-3 text-lg font-semibold">{t("empty.title")}</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t("empty.body")}</p>
      </div>
    );
  }
  return (
    <section aria-labelledby="trips-title">
      <h2 id="trips-title" className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {t("trips.title")}
      </h2>
      <ul className="flex flex-col gap-2">
        {trips.map((trip) => (
          <TripRow key={trip.id} trip={trip} />
        ))}
      </ul>
    </section>
  );
}
