import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Kicker } from "./Caption";
import { AUTHOR, LIVE_URL, REPO_URL } from "./config";
import { Fade } from "./Fade";
import { C, MONO, SANS, useLayout } from "./theme";

function Row({ delay, label, value, unit, width }: { delay: number; label: string; value: string; unit: number; width: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div style={{ opacity: p, translate: `0 ${interpolate(p, [0, 1], [30 * unit, 0])}px` }}>
      <div style={{ fontSize: 30 * unit, color: C.muted, fontWeight: 600 }}>{label}</div>
      {/* One line, shrunk to fit: a URL must never break mid-word. */}
      <div style={{ fontFamily: MONO, fontSize: Math.min(36 * unit, width / (value.length * 0.62)), fontWeight: 700, marginTop: 6 * unit, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

export function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { unit, wide } = useLayout();
  const title = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Fade>
      <AbsoluteFill style={{ fontFamily: SANS, color: C.text, justifyContent: "center", padding: `0 ${(wide ? 260 : 90) * unit}px` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 44 * unit }}>
          <div style={{ opacity: title, scale: String(interpolate(title, [0, 1], [0.94, 1])) }}>
            <Kicker>TypeScript · Hono · Workers · React · PWA</Kicker>
            <div style={{ fontSize: (wide ? 104 : 96) * unit, fontWeight: 800, lineHeight: 1.05, marginTop: 18 * unit, letterSpacing: "-0.02em" }}>
              Дневник смены водителя
            </div>
          </div>
          <Row delay={12} label="Попробовать" value={LIVE_URL} unit={unit} width={(wide ? 1400 : 900) * unit} />
          <Row delay={20} label="Код" value={REPO_URL} unit={unit} width={(wide ? 1400 : 900) * unit} />
          <Row delay={28} label="Автор" value={AUTHOR} unit={unit} width={(wide ? 1400 : 900) * unit} />
        </div>
      </AbsoluteFill>
    </Fade>
  );
}
