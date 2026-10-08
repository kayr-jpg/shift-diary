import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Caption } from "./Caption";
import { Fade } from "./Fade";
import proof from "./proof.json";
import { C, MONO, SANS, useLayout } from "./theme";

type Line = { text: string; color: string; bold?: boolean };

/** Terminal lines built from the captured vitest summaries in proof.json (scripts/collect-proof.mjs). */
const LINES: Line[] = [
  { text: `$ ${proof.command}`, color: C.text, bold: true },
  ...proof.packages.flatMap((p): Line[] => [
    { text: `✓ ${p.name}`, color: C.green, bold: true },
    ...p.lines.map((l) => ({ text: `  ${l}`, color: "#86efac" })),
  ]),
];

const testsRu = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "тест";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "теста";
  return "тестов";
};

export function Proof() {
  const frame = useCurrentFrame();
  const { unit, wide } = useLayout();
  const step = 7;
  const shown = Math.floor(interpolate(frame, [4, 4 + LINES.length * step], [0, LINES.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const cursorOn = Math.floor(frame / 10) % 2 === 0;

  return (
    <Fade>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 50 * unit, fontFamily: SANS, color: C.text }}>
        <div
          style={{
            width: (wide ? 1240 : 960) * unit,
            background: "#06090a",
            border: `${2 * unit}px solid ${C.panelLine}`,
            borderRadius: 24 * unit,
            overflow: "hidden",
            boxShadow: `0 ${30 * unit}px ${80 * unit}px rgba(0,0,0,.5)`,
          }}
        >
          <div style={{ display: "flex", gap: 12 * unit, padding: `${18 * unit}px ${22 * unit}px`, background: "#111a18" }}>
            {[C.red, C.amber, C.green].map((c) => (
              <div key={c} style={{ width: 20 * unit, height: 20 * unit, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <div style={{ padding: `${26 * unit}px ${34 * unit}px ${34 * unit}px`, fontFamily: MONO, fontSize: (wide ? 34 : 36) * unit, lineHeight: 1.5, whiteSpace: "pre" }}>
            {LINES.map((l, i) => (
              <div key={i} style={{ color: l.color, fontWeight: l.bold ? 700 : 400, visibility: i < shown ? "visible" : "hidden" }}>
                {l.text}
              </div>
            ))}
            <span style={{ display: "inline-block", width: 18 * unit, height: 36 * unit, background: C.text, opacity: cursorOn ? 1 : 0 }} />
          </div>
        </div>
        <Caption from={4 + LINES.length * step} to={150} size={wide ? 58 : 60} style={{ textAlign: "center" }}>
          {proof.passed} {testsRu(proof.passed)} — все зелёные
        </Caption>
      </AbsoluteFill>
    </Fade>
  );
}
