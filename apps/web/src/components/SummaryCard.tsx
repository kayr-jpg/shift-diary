import type { Summary } from "@shift/core";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../money";
import { currentLang } from "../i18n";
import { Money } from "./Money";

function SplitBar({ cash, card }: { cash: number; card: number }) {
  const { t } = useTranslation();
  const total = cash + card;
  if (total <= 0) return null;
  const cashPct = Math.round((cash / total) * 100);
  const cardPct = 100 - cashPct;
  const lang = currentLang();
  return (
    <div data-testid="split" className="mt-5">
      <h3 className="sr-only">{t("summary.split")}</h3>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
        <div className="bg-amber-500" style={{ width: `${cashPct}%` }} />
        <div className="bg-sky-500" style={{ width: `${cardPct}%` }} />
      </div>
      <dl className="mt-2 flex justify-between gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-amber-500" aria-hidden="true" />
          <dt className="text-zinc-600 dark:text-zinc-400">{t("payment.cash")}</dt>
          <dd className="font-semibold tabular-nums">
            {t("summary.share", { amount: formatMoney(cash, lang), percent: cashPct })}
          </dd>
        </div>
        <div className="flex items-center gap-2 text-right">
          <span className="size-2.5 rounded-full bg-sky-500" aria-hidden="true" />
          <dt className="text-zinc-600 dark:text-zinc-400">{t("payment.card")}</dt>
          <dd className="font-semibold tabular-nums">
            {t("summary.share", { amount: formatMoney(card, lang), percent: cardPct })}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SummaryCard({ summary }: { summary: Summary }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="summary-title"
      className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
    >
      <h2 id="summary-title" className="sr-only">
        {t("summary.title")}
      </h2>
      <div className="flex items-baseline justify-between">
        <p className="text-base font-medium text-zinc-600 dark:text-zinc-400">{t("summary.net")}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("summary.trips", { count: summary.tripCount })}</p>
      </div>
      <Money
        value={summary.net}
        testId="net"
        className="mt-1 block text-5xl font-extrabold tracking-tight text-emerald-700 sm:text-6xl dark:text-emerald-400"
      />
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">{t("summary.revenue")}</dt>
          <dd>
            <Money value={summary.revenue} testId="revenue" className="text-xl font-bold" />
          </dd>
        </div>
        <div className="rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <dt className="text-sm text-zinc-600 dark:text-zinc-400">{t("summary.commission")}</dt>
          <dd>
            <Money value={summary.commission} testId="commission" className="text-xl font-bold" />
          </dd>
        </div>
      </dl>
      <SplitBar cash={summary.cash} card={summary.card} />
    </section>
  );
}
