#!/usr/bin/env node
/**
 * Runs the real unit/API/web test suites and writes their results to src/proof.json for the
 * "Proof" scene. Nothing is hard-coded: the lines shown in the video are vitest's own summary
 * lines, captured from this run. Exits non-zero (and writes nothing) if any test fails, so a
 * render can never show green output for a red suite.
 *
 *   pnpm video:proof
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const outFile = resolve(here, "../src/proof.json");
const PACKAGES = ["@shift/core", "@shift/api", "@shift/web"];

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const stripAnsi = (s) => s.replace(ANSI, "");

const tmp = mkdtempSync(join(tmpdir(), "shift-proof-"));
const packages = [];
let failed = false;
try {
  for (const name of PACKAGES) {
    const jsonFile = join(tmp, `${name.replace(/\W/g, "_")}.json`);
    // Same as the package's `test` script (`vitest run`), plus a JSON report next to the console one.
    const res = spawnSync(
      "pnpm",
      ["--filter", name, "exec", "vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${jsonFile}`],
      { cwd: repoRoot, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0", CI: "1" } },
    );
    const out = stripAnsi(`${res.stdout}\n${res.stderr}`);
    process.stdout.write(`── ${name}\n${out.split("\n").filter((l) => /Test Files|Tests |Duration/.test(l)).join("\n")}\n`);
    const report = JSON.parse(readFileSync(jsonFile, "utf8"));
    // vitest's own summary lines, verbatim (minus the timing, which changes every run).
    const lines = out
      .split("\n")
      .filter((l) => /^\s*(Test Files|Tests)\s+\d/.test(l))
      .map((l) => l.trim().replace(/\s{2,}/g, "  "));
    packages.push({
      name,
      files: report.testResults.length,
      tests: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      lines,
    });
    if (res.status !== 0 || report.numFailedTests > 0 || !report.success) failed = true;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
  console.error("collect-proof: some tests failed — not writing proof.json");
  process.exit(1);
}

const total = packages.reduce((s, p) => s + p.tests, 0);
const passed = packages.reduce((s, p) => s + p.passed, 0);
const proof = { command: "pnpm test", packages, total, passed, failed: 0 };
writeFileSync(outFile, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`collect-proof: ${passed}/${total} tests passed → ${outFile}`);
