import { Composition, Folder } from "remotion";
import { EndCard } from "./EndCard";
import { Footage } from "./Footage";
import { Hook } from "./Hook";
import { Idempotency } from "./Idempotency";
import { Proof } from "./Proof";
import { ShiftDiary } from "./ShiftDiary";
import { FPS, SCENES, TOTAL_FRAMES } from "./theme";

export function RemotionRoot() {
  return (
    <>
      <Composition id="PhoneCut" component={ShiftDiary} width={1080} height={1920} fps={FPS} durationInFrames={TOTAL_FRAMES} />
      <Composition id="WideCut" component={ShiftDiary} width={1920} height={1080} fps={FPS} durationInFrames={TOTAL_FRAMES} />
      <Folder name="Scenes">
        <Composition id="Hook" component={Hook} width={1080} height={1920} fps={FPS} durationInFrames={SCENES.hook} />
        <Composition id="Footage" component={Footage} width={1080} height={1920} fps={FPS} durationInFrames={SCENES.footage} />
        <Composition id="Idempotency" component={Idempotency} width={1080} height={1920} fps={FPS} durationInFrames={SCENES.idempotency} />
        <Composition id="Proof" component={Proof} width={1080} height={1920} fps={FPS} durationInFrames={SCENES.proof} />
        <Composition id="EndCard" component={EndCard} width={1080} height={1920} fps={FPS} durationInFrames={SCENES.endCard} />
      </Folder>
    </>
  );
}
