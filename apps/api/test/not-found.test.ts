import { describe, expect, it } from "vitest";
import { SEED, makeTestApp, makeTestDb, trip } from "./helpers";

/** An app over a counted, initially empty database (no pre-created sandbox). */
async function setup() {
  const { repo, sandboxCount } = makeTestDb();
  const { app } = await makeTestApp({ repo, seed: SEED });
  return { app, sandboxCount };
}

describe("requests no route serves never create a sandbox", () => {
  const cases: [string, string][] = [
    ["GET", "/api/nope"],
    ["POST", "/api/nope"],
    ["DELETE", "/api/nope"],
    ["GET", "/api"],
    ["DELETE", "/api/trips"],
    ["PUT", "/api/trips"],
    ["GET", "/api/sandbox/reset"],
    ["POST", "/api/days"],
  ];
  it.each(cases)("%s %s → 404 JSON NOT_FOUND, no cookie, no sandbox row", async (method, path) => {
    const { app, sandboxCount } = await setup();
    const res = await app.request(path, { method });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ code: "NOT_FOUND" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("X-Sandbox-Id")).toBeNull();
    expect(sandboxCount()).toBe(0);
  });

  it("oversize POST /api/trips without a cookie → 413 and no sandbox row", async () => {
    const { app, sandboxCount } = await setup();
    const res = await app.request("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trip({ id: "x".repeat(20_000) })),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ code: "BODY_TOO_LARGE" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(sandboxCount()).toBe(0);
  });

  it("oversize streamed body (no Content-Length) → 413 and no sandbox row", async () => {
    const { app, sandboxCount } = await setup();
    const chunk = new TextEncoder().encode("x".repeat(4096));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 8) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const res = await app.request("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    });
    expect(res.status).toBe(413);
    expect(sandboxCount()).toBe(0);
  });

  it("a valid cookie-less GET /api/trips still creates exactly one seeded sandbox", async () => {
    const { app, sandboxCount } = await setup();
    const res = await app.request("/api/trips?date=2026-10-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("sid=");
    expect(sandboxCount()).toBe(1);
  });

  it("/api/health creates no sandbox", async () => {
    const { app, sandboxCount } = await setup();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(sandboxCount()).toBe(0);
  });
});
