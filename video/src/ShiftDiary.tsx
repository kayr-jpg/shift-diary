import { Series, useVideoConfig } from "remotion";
import { EndCard } from "./EndCard";
import { Footage } from "./Footage";
import { Hook } from "./Hook";
import { Idempotency } from "./Idempotency";
import { Proof } from "./Proof";

/** The whole video (spec §11): Hook 5 s → real app 20 s → idempotency 15 s → proof 5 s → end card 7 s. */
export function ShiftDiary() {
  const { fps } = useVideoConfig();
  return (
    <Series>
      <Series.Sequence name="Hook" durationInFrames={5 * fps} premountFor={fps}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence name="Footage" durationInFrames={20 * fps} premountFor={fps}>
        <Footage />
      </Series.Sequence>
      <Series.Sequence name="Idempotency" durationInFrames={15 * fps} premountFor={fps}>
        <Idempotency />
      </Series.Sequence>
      <Series.Sequence name="Proof" durationInFrames={5 * fps} premountFor={fps}>
        <Proof />
      </Series.Sequence>
      <Series.Sequence name="EndCard" durationInFrames={7 * fps} premountFor={fps}>
        <EndCard />
      </Series.Sequence>
    </Series>
  );
}
