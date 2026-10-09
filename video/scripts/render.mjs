#!/usr/bin/env node
/**
 * Renders both cuts of the demo video:
 *   out/shift-diary-1080x1920.mp4 (PhoneCut) and out/shift-diary-1920x1080.mp4 (WideCut), H.264.
 *
 * Prerequisites, prepared first:
 *   - public/footage.webm from `pnpm demo:record` (git-ignored, regenerated in CI);
 *   - src/proof.json, regenerated here by running the real test suites (scripts/collect-proof.mjs).
 *     Pass --skip-proof to reuse the existing proof.json — only right after `pnpm video:proof`: the
 *     committed proof.json may be stale (test counts change), and the Proof scene would then lie.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

if (!existsSync(join(root, "public/footage.webm"))) {
  console.error("video/public/footage.webm is missing: run `pnpm build && pnpm demo:record` first.");
  process.exit(1);
}
if (!process.argv.includes("--skip-proof")) run("node", ["scripts/collect-proof.mjs"]);

const remotion = join(root, "node_modules/.bin/remotion");
for (const [id, size] of [
  ["PhoneCut", "1080x1920"],
  ["WideCut", "1920x1080"],
]) {
  const started = Date.now();
  run(remotion, ["render", "src/index.ts", id, `out/shift-diary-${size}.mp4`, "--codec=h264"]);
  console.log(`${id}: rendered in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
