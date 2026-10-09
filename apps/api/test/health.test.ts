import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers";

describe("GET /api/health", () => {
  it("returns ok, version, commit and creates no sandbox", async () => {
    const { app } = await makeTestApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "test", commit: "test" });
    expect(res.headers.get("X-Sandbox-Id")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
