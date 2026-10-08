import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "./Caption";
import { Fade } from "./Fade";
import { C, SANS, money, useLayout } from "./theme";

/** The seeded day 2026-10-01: two trips, card 2400/360 and cash 1500/225. */
const DAY = { trips: 2, revenue: 3900, commission: 585, net: 3315, cash: 1500, card: 2400 } as const;

/** A value that flies in from `from` (px, rotation) and lands in its slot with a spring. */
function Flying({
  delay,
  from,
  children,
  style,
}: {
  delay: number;
  from: [number, number, number];
  children: ReactNode;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.8, stiffness: 110 } });
  return (
    <div
      style={{
        display: "inline-block",
        whiteSpace: "nowrap",
        opacity: interpolate(p, [0, 0.15], [0, 1], { extrapolateRight: "clamp" }),
        translate: `${interpolate(p, [0, 1], [from[0], 0])}px ${interpolate(p, [0, 1], [from[1], 0])}px`,
        rotate: `${interpolate(p, [0, 1], [from[2], 0])}deg`,
        scale: String(interpolate(p, [0, 1], [2.2, 1])),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Tile({ label, children, unit }: { label: string; children: ReactNode; unit: number }) {
  return (
    <div style={{ flex: 1, background: "#1c2a27", borderRadius: 28 * unit, padding: `${22 * unit}px ${26 * unit}px` }}>
      <div style={{ fontSize: 28 * unit, color: C.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 50 * unit, fontWeight: 800, marginTop: 6 * unit }}>{children}</div>
    </div>
  );
}

export function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { unit, wide } = useLayout();
  const card = spring({ frame, fps, config: { damping: 200 } });
  const bar = interpolate(frame, [70, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cashShare = DAY.cash / DAY.revenue;

  return (
    <Fade>
      <AbsoluteFill
        style={{
          fontFamily: SANS,
          color: C.text,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: (wide ? 40 : 70) * unit,
        }}
      >
        <Caption from={0} to={150} size={wide ? 60 : 64} style={{ textAlign: "center", maxWidth: 900 * unit }}>
          Сколько я заработал за смену?
        </Caption>
        <div
          style={{
            width: 860 * unit,
            background: C.panel,
            border: `${2 * unit}px solid ${C.panelLine}`,
            borderRadius: 48 * unit,
            padding: 48 * unit,
            boxShadow: `0 ${30 * unit}px ${80 * unit}px rgba(0,0,0,.45)`,
            opacity: card,
            scale: String(interpolate(card, [0, 1], [0.92, 1])),
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32 * unit, color: C.muted, fontWeight: 600 }}>
            <span>На руки</span>
            <Flying delay={60} from={[300, -500, 20]}>
              Поездок: {DAY.trips}
            </Flying>
          </div>
          <Flying
            delay={12}
            from={[-700, -400, -18]}
            style={{ fontSize: 132 * unit, fontWeight: 800, color: C.green, letterSpacing: "-0.03em", marginTop: 6 * unit }}
          >
            {money(DAY.net)}
          </Flying>
          <div style={{ display: "flex", gap: 24 * unit, marginTop: 30 * unit }}>
            <Tile label="Выручка" unit={unit}>
              <Flying delay={26} from={[-600, 500, 25]}>
                {money(DAY.revenue)}
              </Flying>
            </Tile>
            <Tile label="Комиссия" unit={unit}>
              <Flying delay={34} from={[600, 450, -25]}>
                {money(DAY.commission)}
              </Flying>
            </Tile>
          </div>
          <div style={{ display: "flex", height: 18 * unit, borderRadius: 9 * unit, overflow: "hidden", marginTop: 34 * unit, background: "#1c2a27" }}>
            <div style={{ width: `${cashShare * bar * 100}%`, background: C.amber }} />
            <div style={{ width: `${(1 - cashShare) * bar * 100}%`, background: C.blue }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 * unit, fontSize: 34 * unit, fontWeight: 600 }}>
            <Flying delay={44} from={[-500, 600, 30]}>
              <span style={{ color: C.amber }}>●</span> Наличные {money(DAY.cash)}
            </Flying>
            <Flying delay={52} from={[500, 600, -30]}>
              <span style={{ color: C.blue }}>●</span> Карта {money(DAY.card)}
            </Flying>
          </div>
        </div>
        <Caption from={95} to={150} size={40} style={{ color: C.muted, fontWeight: 600, textAlign: "center" }}>
          Дневник смены водителя · 1 октября
        </Caption>
      </AbsoluteFill>
    </Fade>
  );
}
