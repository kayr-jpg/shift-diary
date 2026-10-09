import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../money";
import { currentLang } from "../i18n";

/** Count-up never runs longer than this (spec §7: no UI motion over 300 ms). */
export const COUNT_UP_MS = 300;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

type Props = {
  value: number;
  /** Formats an integer for display; defaults to tenge in the current language. */
  format?: (n: number) => string;
  className?: string;
  /** Lands on the element holding the final value, which is what assistive tech reads. */
  testId?: string;
};

/**
 * Animates an amount from the previously shown value (0 on first mount) to `value`.
 * The final value is always in the DOM for screen readers and tests; the animated frames
 * sit in an aria-hidden sibling so nobody hears intermediate numbers. Under
 * prefers-reduced-motion the final value is shown immediately.
 *
 * A tiny rAF loop rather than Motion's `animate`, so the main chunk only pays for
 * `useReducedMotion`.
 */
export function CountUp({ value, format, className, testId }: Props) {
  useTranslation(); // re-render on language change
  const reduced = useReducedMotion();
  const target = Math.round(value);
  const [shown, setShown] = useState(() => (reduced ? target : 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    if (reduced || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const p = Math.min(1, (now - t0) / COUNT_UP_MS);
      shownRef.current = p === 1 ? target : Math.round(from + (target - from) * easeOutCubic(p));
      setShown(shownRef.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  const fmt = format ?? ((n: number) => formatMoney(n, currentLang()));
  return (
    <span className={`tabular-nums whitespace-nowrap ${className ?? ""}`}>
      <span className="sr-only" data-testid={testId}>
        {fmt(target)}
      </span>
      <span aria-hidden="true">{fmt(reduced ? target : shown)}</span>
    </span>
  );
}
