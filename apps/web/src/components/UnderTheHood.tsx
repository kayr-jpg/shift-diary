import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getDay, NetworkError, formatRequest, formatResponse, rawRequest, type DayTrip, type RawExchange } from "../api";
import { dayKey, daysKey } from "../hooks";

type ActionId = "repeat" | "conflict" | "invalid" | "reset";
type ActionState = {
  status: "idle" | "running" | "done";
  exchange?: RawExchange;
  errorKey?: string;
  counts?: { before: number; after: number };
};

const CONFIRM_MS = 4000;

const BAD_TRIP = {
  id: "bad id",
  start: "2026-10-01T10:00:00+05:00",
  end: "2026-10-01T09:00:00+05:00",
  amount: 0,
  commission: -1,
  payment: "crypto",
};

/** Only the fields the API stores: drops durationMinutes and warnings. */
function storedFields(t: DayTrip) {
  return { id: t.id, start: t.start, end: t.end, amount: t.amount, commission: t.commission, payment: t.payment };
}

function errorCodes(body: unknown): string[] {
  const list = (body as { errors?: { code?: unknown }[] } | null)?.errors;
  return Array.isArray(list) ? list.flatMap((e) => (typeof e.code === "string" ? [e.code] : [])) : [];
}

export function UnderTheHood({ date, lastTrip }: { date: string; lastTrip: DayTrip | undefined }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<ActionId, ActionState>>({
    repeat: { status: "idle" },
    conflict: { status: "idle" },
    invalid: { status: "idle" },
    reset: { status: "idle" },
  });
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(new Set<ActionId>());

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirming]);

  const patch = (id: ActionId, s: ActionState) => setStates((prev) => ({ ...prev, [id]: s }));

  /** Fresh trip count of the viewed day; also refreshes the cache the main screen reads. */
  const countTrips = async () => (await qc.fetchQuery({ queryKey: dayKey(date), queryFn: () => getDay(date), staleTime: 0 })).trips.length;

  async function run(id: ActionId, exec: () => Promise<RawExchange>, withCounts: boolean) {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "running" } }));
    try {
      const before = withCounts ? await countTrips() : 0;
      const exchange = await exec();
      const after = withCounts ? await countTrips() : 0;
      if (id === "reset" || id === "repeat") {
        await Promise.all([qc.invalidateQueries({ queryKey: ["day"] }), qc.invalidateQueries({ queryKey: daysKey })]);
      }
      patch(id, { status: "done", exchange, ...(withCounts ? { counts: { before, after } } : {}) });
    } catch (e) {
      patch(id, { status: "done", errorKey: e instanceof NetworkError ? "errors.NETWORK" : "errors.INTERNAL" });
    } finally {
      busy.current.delete(id);
    }
  }

  const post = (trip: unknown) => () => rawRequest("POST", "/api/trips", trip);
  const actions: {
    id: ActionId;
    needsTrip: boolean;
    start: () => void;
  }[] = [
    {
      id: "repeat",
      needsTrip: true,
      start: () => lastTrip && void run("repeat", post(storedFields(lastTrip)), true),
    },
    {
      id: "conflict",
      needsTrip: true,
      start: () => lastTrip && void run("conflict", post({ ...storedFields(lastTrip), amount: lastTrip.amount + 100 }), false),
    },
    { id: "invalid", needsTrip: false, start: () => void run("invalid", post(BAD_TRIP), false) },
    {
      id: "reset",
      needsTrip: false,
      start: () => {
        if (!confirming) return setConfirming(true);
        setConfirming(false);
        void run("reset", () => rawRequest("POST", "/api/sandbox/reset"), true);
      },
    },
  ];

  return (
    <details className="group rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-semibold">
        <span>{t("hood.title")}</span>
        <span aria-hidden="true" className="text-zinc-500 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("hood.intro")}</p>
        {actions.map(({ id, needsTrip, start }) => {
          const s = states[id];
          const disabled = s.status === "running" || (needsTrip && !lastTrip);
          const label = id === "reset" && confirming ? t("hood.reset.confirm") : t(`hood.${id}.label`);
          return (
            <section key={id} data-testid={`hood-${id}`} className="flex flex-col gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={start}
                aria-describedby={`hood-desc-${id}`}
                className={`min-h-11 rounded-full px-5 font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 ${
                  id === "reset" ? "bg-red-700 hover:bg-red-800" : "bg-emerald-700 hover:bg-emerald-800"
                }`}
              >
                {label}
              </button>
              <p id={`hood-desc-${id}`} className="text-sm text-zinc-600 dark:text-zinc-400">
                {t(`hood.${id}.desc`)}
                {needsTrip && !lastTrip && <span className="block font-medium">{t("hood.noTrips")}</span>}
              </p>
              <div aria-live="polite">
                {s.status === "running" && <p className="text-sm">{t("hood.running")}</p>}
                {s.errorKey && <p className="text-sm font-medium text-red-700 dark:text-red-300">{t(s.errorKey)}</p>}
                {s.exchange && (
                  <div className="flex flex-col gap-2">
                    {s.counts && (
                      <p className="text-sm font-medium tabular-nums">{t("hood.tripsOnDay", s.counts)}</p>
                    )}
                    <Pre title={t("hood.request")} text={formatRequest(s.exchange.request)} />
                    <Pre title={t("hood.response")} text={formatResponse(s.exchange.response)} />
                    {id === "invalid" && <Translated body={s.exchange.response.body} />}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </details>
  );
}

function Pre({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
      <pre
        tabIndex={0}
        className="max-h-56 overflow-auto rounded-xl bg-zinc-100 p-3 font-mono text-xs leading-relaxed select-text dark:bg-zinc-950"
      >
        {text}
      </pre>
    </div>
  );
}

function Translated({ body }: { body: unknown }) {
  const { t } = useTranslation();
  const codes = errorCodes(body);
  if (codes.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t("hood.translated")}</p>
      <ul className="list-inside list-disc text-sm">
        {codes.map((c, i) => (
          <li key={`${c}-${i}`}>
            <code className="font-mono text-xs">{c}</code> — {t(`errors.${c}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
