import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption, Kicker } from "./Caption";
import { Fade } from "./Fade";
import { C, MONO, SANS, useLayout } from "./theme";

type Req = {
  enter: number;
  stampAt: number;
  tag: string;
  amount: string;
  stamp: string;
  color: string;
  note?: string;
};

/** Three POSTs with the same id: created, replayed, conflicting. Frames are scene-local. */
const REQUESTS: Req[] = [
  { enter: 20, stampAt: 55, tag: "#1", amount: "1000", stamp: "201 · Created", color: C.green },
  { enter: 130, stampAt: 165, tag: "#2 · повтор", amount: "1000", stamp: "replay · 200 · Idempotent-Replay: true", color: C.blue },
  {
    enter: 250,
    stampAt: 285,
    tag: "#3 · другая сумма",
    amount: "1100",
    stamp: "409 · ID_CONFLICT",
    color: C.red,
    note: "diff: amount [1000, 1100]",
  },
];

function RequestCard({ req, width, height, unit, fromX }: { req: Req; width: number; height: number; unit: number; fromX: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - req.enter, fps, config: { damping: 18, stiffness: 120 } });
  const stamp = spring({ frame: frame - req.stampAt, fps, config: { damping: 12, stiffness: 160 } });
  const mono = { fontFamily: MONO, fontSize: 30 * unit, lineHeight: 1.45 };
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        boxSizing: "border-box",
        background: C.panel,
        border: `${2 * unit}px solid ${C.panelLine}`,
        borderRadius: 28 * unit,
        padding: `${24 * unit}px ${30 * unit}px`,
        opacity: interpolate(enter, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }),
        translate: `${interpolate(enter, [0, 1], [fromX, 0])}px 0`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontWeight: 800, fontSize: 32 * unit }}>
        <span>POST /api/trips</span>
        <span style={{ color: C.muted, fontWeight: 600 }}>{req.tag}</span>
      </div>
      <div style={{ ...mono, color: C.muted, marginTop: 10 * unit }}>
        X-Sandbox-Id: 9f3c…
        <br />
        {"{ "}
        <span style={{ color: C.text }}>&quot;id&quot;: &quot;t_7Kq2&quot;</span>, <span style={{ color: req.amount === "1000" ? C.text : C.amber }}>&quot;amount&quot;: {req.amount}</span>
        {" }"}
      </div>
      <div
        style={{
          position: "absolute",
          right: 26 * unit,
          bottom: 22 * unit,
          maxWidth: width * 0.8,
          border: `${4 * unit}px solid ${req.color}`,
          color: req.color,
          borderRadius: 12 * unit,
          padding: `${6 * unit}px ${16 * unit}px`,
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 28 * unit,
          textAlign: "right",
          background: "rgba(11,18,17,.85)",
          rotate: "-4deg",
          opacity: interpolate(stamp, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          scale: String(interpolate(stamp, [0, 1], [2.2, 1])),
        }}
      >
        {req.stamp}
        {req.note ? <div style={{ fontWeight: 400, fontSize: 24 * unit }}>{req.note}</div> : null}
      </div>
    </div>
  );
}

function Counter({ unit }: { unit: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = frame >= REQUESTS[0]!.stampAt ? 1 : 0;
  const pulse = REQUESTS.reduce((acc, r) => {
    const p = spring({ frame: frame - r.stampAt, fps, config: { damping: 10, stiffness: 200 } });
    return acc + interpolate(p, [0, 0.5, 1], [0, 1, 0], { extrapolateRight: "clamp" });
  }, 0);
  const still = frame >= REQUESTS[1]!.stampAt;
  return (
    <div
      style={{
        background: C.panel,
        border: `${2 * unit}px solid ${C.panelLine}`,
        borderRadius: 32 * unit,
        padding: `${28 * unit}px ${40 * unit}px`,
        display: "flex",
        alignItems: "center",
        gap: 36 * unit,
      }}
    >
      <div style={{ fontSize: 150 * unit, fontWeight: 800, color: C.green, lineHeight: 1, scale: String(1 + 0.18 * pulse), minWidth: 90 * unit }}>
        {count}
      </div>
      <div>
        <div style={{ fontSize: 34 * unit, fontWeight: 800 }}>Поездок в базе</div>
        <div style={{ fontSize: 30 * unit, color: C.muted, marginTop: 6 * unit }}>
          {still ? "всё ещё одна — дубля нет" : count ? "создана" : "пусто"}
        </div>
      </div>
    </div>
  );
}

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 8, to: 125, text: "Приложение отправляет поездку с её id" },
  { from: 125, to: 245, text: "Сеть моргнула, запрос пришёл ещё раз — сервер вернул сохранённый ответ" },
  { from: 245, to: 360, text: "Тот же id, другая сумма — конфликт, а не тихая перезапись" },
  { from: 360, to: 450, text: "Повторять безопасно: одна поездка, сколько бы раз ни нажали" },
];

export function Idempotency() {
  const { unit, wide } = useLayout();
  const captions = CAPTIONS.map((c) => (
    <Caption key={c.from} from={c.from} to={c.to} size={wide ? 50 : 56} style={{ position: "absolute", inset: 0 }}>
      {c.text}
    </Caption>
  ));

  if (wide) {
    const w = 980 * unit;
    return (
      <Fade>
        <AbsoluteFill style={{ fontFamily: SANS, color: C.text }}>
          <div style={{ position: "absolute", left: 90 * unit, top: 100 * unit, display: "flex", flexDirection: "column", gap: 30 * unit }}>
            {REQUESTS.map((r) => (
              <RequestCard key={r.tag} req={r} width={w} height={280 * unit} unit={unit} fromX={-1300 * unit} />
            ))}
          </div>
          <div style={{ position: "absolute", left: 1170 * unit, right: 90 * unit, top: 120 * unit, bottom: 120 * unit, display: "flex", flexDirection: "column", gap: 30 * unit }}>
            <Kicker>Идемпотентность</Kicker>
            <div style={{ position: "relative", flex: 1 }}>{captions}</div>
            <Counter unit={unit} />
          </div>
        </AbsoluteFill>
      </Fade>
    );
  }

  return (
    <Fade>
      <AbsoluteFill style={{ fontFamily: SANS, color: C.text, padding: `${100 * unit}px ${70 * unit}px`, flexDirection: "column", gap: 34 * unit }}>
        <Kicker>Идемпотентность</Kicker>
        <div style={{ position: "relative", height: 270 * unit }}>{captions}</div>
        {REQUESTS.map((r) => (
          <RequestCard key={r.tag} req={r} width={940 * unit} height={290 * unit} unit={unit} fromX={-1200 * unit} />
        ))}
        <div style={{ marginTop: 20 * unit }}>
          <Counter unit={unit} />
        </div>
      </AbsoluteFill>
    </Fade>
  );
}
