import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addDays, dayOfMonth, monthOf, weekdayOf } from "../time";

const PAD_DAYS = 3;
const MAX_SPAN = 60;

/** Inclusive date range covering every trip day, the selection and today, plus padding. */
function stripRange(selected: string, today: string, tripDays: string[]): string[] {
  const anchors = [selected, today, ...tripDays].sort();
  let from = addDays(anchors[0]!, -PAD_DAYS);
  let to = addDays(anchors[anchors.length - 1]!, PAD_DAYS);
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= MAX_SPAN; d = addDays(d, 1)) out.push(d);
  if (out.length > MAX_SPAN) {
    // Data spread over months: fall back to a window around the selection.
    from = addDays(selected, -MAX_SPAN / 2);
    to = addDays(selected, MAX_SPAN / 2);
    out.length = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  }
  return out;
}

type Props = {
  selected: string;
  today: string;
  tripDays: ReadonlySet<string>;
  onSelect: (date: string) => void;
};

export function DayStrip({ selected, today, tripDays, onSelect }: Props) {
  const { t } = useTranslation();
  const dates = useMemo(() => stripRange(selected, today, [...tripDays]), [selected, today, tripDays]);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [selected]);

  return (
    <nav aria-label={t("nav.strip")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-1.5 py-1">
        {dates.map((date) => {
          const isSelected = date === selected;
          const hasTrips = tripDays.has(date);
          const label = t("date.long", { day: dayOfMonth(date), month: t(`date.month.${monthOf(date)}`) });
          return (
            <li key={date}>
              <button
                ref={isSelected ? selectedRef : undefined}
                type="button"
                onClick={() => onSelect(date)}
                aria-current={isSelected ? "date" : undefined}
                aria-label={hasTrips ? `${label}, ${t("nav.hasTrips")}` : label}
                className={`flex min-h-16 w-12 flex-col items-center justify-center rounded-2xl text-sm transition-colors ${
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"
                } ${date === today && !isSelected ? "ring-2 ring-emerald-600 dark:ring-emerald-400" : ""}`}
              >
                <span className="text-xs opacity-75">{t(`date.weekday.${weekdayOf(date)}`)}</span>
                <span className="text-lg font-bold tabular-nums">{dayOfMonth(date)}</span>
                <span
                  className={`mt-0.5 size-1.5 rounded-full ${
                    hasTrips ? (isSelected ? "bg-emerald-400" : "bg-emerald-600 dark:bg-emerald-400") : "bg-transparent"
                  }`}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
