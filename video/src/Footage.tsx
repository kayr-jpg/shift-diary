import { AbsoluteFill, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption, Kicker } from "./Caption";
import { Fade } from "./Fade";
import meta from "../public/footage-meta.json";
import { C, SANS, useLayout } from "./theme";

type BeatId = "summary" | "nextDay" | "backDay" | "addTrip" | "newTotals" | "hood" | "replay" | "conflict" | "kz" | "ru" | "receipt";

/** Russian caption per recorded beat (see e2e/demo/record.ts). */
const CAPTIONS: Partial<Record<BeatId, string>> = {
  summary: "Сводка дня: выручка, комиссия, на руки",
  nextDay: "Стрелки — соседние дни",
  addTrip: "Добавляем поездку: 10:00\u2060–\u206010:30, 1\u00a0000\u00a0₸", // word joiners: never break the time range
  newTotals: "Итоги пересчитались сразу",
  hood: "«Под капотом» — живые запросы к API",
  replay: "Повтор запроса → 200, дубля нет",
  conflict: "Тот же id, другая сумма → 409",
  kz: "Қазақша — одним нажатием",
  receipt: "Закрыть смену — чек дня",
};

/** Screen size of the recording in CSS pixels (the recorder captures at 2×). */
const SCREEN = { width: meta.width / 2, height: meta.height / 2 };

function PhoneFrame({ height, rate }: { height: number; rate: number }) {
  const s = height / SCREEN.height;
  const width = SCREEN.width * s;
  const bezel = 14 * s;
  return (
    <div
      style={{
        width: width + bezel * 2,
        height: height + bezel * 2,
        padding: bezel,
        borderRadius: 58 * s,
        background: "#05080a",
        boxShadow: `0 0 0 ${2 * s}px #2b3836, 0 ${40 * s}px ${100 * s}px rgba(0,0,0,.6)`,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div style={{ width, height, borderRadius: 46 * s, overflow: "hidden", background: "#fff" }}>
        <OffthreadVideo src={staticFile("footage.webm")} playbackRate={rate} muted style={{ width, height, display: "block" }} />
      </div>
    </div>
  );
}

export function Footage() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { unit, wide, height } = useLayout();
  // Fit the whole recording into the scene: play it a bit faster than real time if it is longer.
  const rate = Math.max(1, meta.durationSec / (durationInFrames / fps));
  const toFrame = (t: number) => Math.round((t / rate) * fps);

  // Caption windows: each captioned beat until the next captioned beat (or the scene's end).
  const captioned = meta.beats.filter((b) => CAPTIONS[b.id as BeatId]);
  const windows = captioned.map((b, i) => ({
    id: b.id as BeatId,
    from: Math.max(0, toFrame(b.t) - 6),
    to: i + 1 < captioned.length ? Math.max(0, toFrame(captioned[i + 1]!.t) - 6) : durationInFrames,
  }));
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const phoneHeight = wide ? 900 * unit : 1380 * unit;

  const captions = windows.map((w) => (
    <Caption key={w.id} from={w.from} to={w.to} size={wide ? 58 : 60} style={{ position: "absolute", inset: 0 }}>
      {CAPTIONS[w.id]}
    </Caption>
  ));

  return (
    <Fade>
      <AbsoluteFill style={{ fontFamily: SANS, color: C.text }}>
        {wide ? (
          <>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
              <div style={{ translate: `0 ${interpolate(enter, [0, 1], [60, 0])}px` }}>
                <PhoneFrame height={phoneHeight} rate={rate} />
              </div>
            </AbsoluteFill>
            <div style={{ position: "absolute", left: 1290 * unit, right: 90 * unit, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 * unit }}>
              <Kicker>Настоящее приложение</Kicker>
              <div style={{ position: "relative", height: 300 * unit }}>{captions}</div>
            </div>
            <div style={{ position: "absolute", left: 90 * unit, width: 480 * unit, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 * unit }}>
              <Kicker style={{ color: C.muted }}>Запись Playwright</Kicker>
              <div style={{ fontSize: 34 * unit, color: C.muted, lineHeight: 1.35 }}>
                pnpm demo:record — без монтажа, по сценарию
              </div>
            </div>
          </>
        ) : (
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 70 * unit, gap: 40 * unit }}>
            <div style={{ translate: `0 ${interpolate(enter, [0, 1], [60, 0])}px` }}>
              <PhoneFrame height={phoneHeight} rate={rate} />
            </div>
            <div style={{ position: "relative", width: 940 * unit, height: height - phoneHeight - 260 * unit, textAlign: "center" }}>
              {captions}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </Fade>
  );
}
