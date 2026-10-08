import { Series, useVideoConfig } from "remotion";
import { EndCard } from "./EndCard";
import { Footage } from "./Footage";
import { Hook } from "./Hook";
import { Idempotency } from "./Idempotency";
import { Proof } from "./Proof";
import { SCENES } from "./theme";

/**
 * The whole video (spec §11): Hook 5 s → real app 20 s → idempotency 15 s → proof 5 s → end card 7 s.
 * Scene lengths come from SCENES (theme.ts), the same source as the compositions' TOTAL_FRAMES.
 */
export function ShiftDiary() {
  const { fps } = useVideoConfig();
  return (
    <Series>
      <Series.Sequence name="Hook" durationInFrames={SCENES.hook} premountFor={fps}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence name="Footage" durationInFrames={SCENES.footage} premountFor={fps}>
        <Footage />
      </Series.Sequence>
      <Series.Sequence name="Idempotency" durationInFrames={SCENES.idempotency} premountFor={fps}>
        <Idempotency />
      </Series.Sequence>
      <Series.Sequence name="Proof" durationInFrames={SCENES.proof} premountFor={fps}>
        <Proof />
      </Series.Sequence>
      <Series.Sequence name="EndCard" durationInFrames={SCENES.endCard} premountFor={fps}>
        <EndCard />
      </Series.Sequence>
    </Series>
  );
}
