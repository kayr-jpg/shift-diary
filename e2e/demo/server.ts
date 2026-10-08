/**
 * Starts and stops the local Node server (API + built web) for the demo scripts
 * (`demo/record.ts`, `demo/screenshots.ts`).
 *
 * The server is `apps/api/src/node.ts` on :8787 with a fresh temporary SQLite database — the same
 * thing `pnpm --filter @shift/api start:node` runs and the e2e config starts. `apps/web/dist` must
 * exist (`pnpm build`), because the server serves the built client.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const PORT = 8787;
export const repoRoot = resolve(import.meta.dirname, "../..");

export type LocalServer = { url: string; child: ChildProcess; dbPath: string };

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`server at ${url} did not become healthy within ${timeoutMs} ms`);
}

/** `script` names the calling root script, for the error message when the client is not built. */
export async function startServer(script: string): Promise<LocalServer> {
  if (!existsSync(join(repoRoot, "apps/web/dist/index.html"))) {
    throw new Error(`apps/web/dist is missing: run \`pnpm build\` before \`pnpm ${script}\`.`);
  }
  const dbPath = join(tmpdir(), `shift-demo-${process.pid}-${Date.now()}.db`);
  // Same command as `pnpm --filter @shift/api start:node`, minus the pnpm wrapper (which reports
  // the SIGTERM we send at the end as a failed run).
  const child = spawn(join(repoRoot, "apps/api/node_modules/.bin/tsx"), ["src/node.ts"], {
    cwd: join(repoRoot, "apps/api"),
    env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  const url = `http://localhost:${PORT}`;
  await waitForHealth(url, 60_000);
  return { url, child, dbPath };
}

/** Stops the server's whole process group (tsx → node) and removes its database files. */
export async function stopServer(server: LocalServer): Promise<void> {
  const { child } = server;
  if (child.pid !== undefined && child.exitCode === null) {
    const exited = new Promise<void>((r) => child.once("exit", () => r()));
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await Promise.race([exited, sleep(5000)]);
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(server.dbPath + suffix, { force: true });
}
