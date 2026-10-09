import { useRef, useState, type CSSProperties, type ReactNode, type PointerEvent } from "react";
import { useReducedMotion } from "motion/react";

/** Minimum horizontal travel for a swipe, in CSS px. */
export const SWIPE_MIN_PX = 60;
/** Horizontal travel must dominate vertical travel by this factor. */
export const SWIPE_RATIO = 1.5;

type Props = {
  /** Identity of the panel; a change slides the new panel in. */
  date: string;
  /** -1 = previous day, +1 = next day. */
  onSwipe: (step: -1 | 1) => void;
  children: ReactNode;
};

/**
 * Day panel that changes day on a horizontal swipe (left → next, right → previous).
 * `touch-action: pan-y` keeps vertical scrolling native; if the browser takes the gesture
 * for scrolling it sends pointercancel and we drop it. Arrow buttons remain the accessible path.
 */
export function DaySwipe({ date, onSwipe, children }: Props) {
  const reduced = useReducedMotion();
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  // Slide direction follows the date change, whatever caused it (swipe, arrows, strip).
  const [last, setLast] = useState({ date, dir: 1 });
  const dir = date === last.date ? last.dir : date > last.date ? 1 : -1;
  if (date !== last.date) setLast({ date, dir });

  const onPointerDown = (e: PointerEvent) => {
    swallowClick.current = false;
    // Touch and pen only: a mouse drag is text selection, not navigation. A second finger
    // is never the primary pointer, so it (pinch, two-finger scroll) cancels the gesture.
    // A new primary pointer always starts fresh, even if an earlier pointerup was missed.
    if (e.pointerType === "mouse" || !e.isPrimary) {
      start.current = null;
      return;
    }
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return;
    // The drag must not also press a button it ended on. The browser dispatches that click
    // right after pointerup, so the guard expires on the next task and can never swallow a
    // later (e.g. keyboard) click.
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    onSwipe(dx < 0 ? 1 : -1);
  };
  const cancel = () => {
    start.current = null;
  };

  return (
    <div
      data-testid="day-swipe"
      className="relative touch-pan-y overflow-x-clip pointer-coarse:select-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* Keyed by date: each new day slides in from the side it came from (200 ms, CSS
          keyframes in index.css, so Motion's animation engine stays out of the main chunk). */}
      <div
        key={date}
        className={reduced ? undefined : "day-slide-in"}
        style={{ "--day-dir": dir } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
