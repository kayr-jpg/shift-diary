import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, SANS, useLayout } from "./theme";

/**
 * A Russian caption that fades and rises in at `from` (frames, scene-local) and fades out at `to`.
 */
export function Caption({
  from,
  to,
  children,
  style,
  size = 52,
}: {
  from: number;
  to: number;
  children: ReactNode;
  style?: CSSProperties;
  size?: number;
}) {
  const frame = useCurrentFrame();
  const { unit } = useLayout();
  const fade = 8;
  // Outside its window the caption stays in the layout (hidden), so nothing around it jumps.
  return (
    <div
      style={{
        visibility: frame < from || frame >= to ? "hidden" : "visible",
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: size * unit,
        lineHeight: 1.18,
        color: C.text,
        textWrap: "balance",
        opacity: interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: `0 ${interpolate(frame, [from, from + fade], [24 * unit, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small uppercase label above a scene. */
export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { unit } = useLayout();
  return (
    <div
      style={{
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: 30 * unit,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.green,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
