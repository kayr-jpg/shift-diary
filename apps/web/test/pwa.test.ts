// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { manifest, workbox } from "../pwa.config";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("PWA config", () => {
  it("has the Russian name, short name and standalone display", () => {
    expect(manifest.name).toBe("Дневник смен водителя");
    expect(manifest.short_name).toBe("Смены");
    expect(manifest.lang).toBe("ru");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("lists 192, 512 and a maskable 512 icon, each an existing PNG of that size", () => {
    const icons = manifest.icons ?? [];
    const find = (size: string, purpose?: string) =>
      icons.find((i) => i.sizes === size && (purpose ? i.purpose === purpose : i.purpose !== "maskable"));
    for (const [size, purpose] of [["192x192"], ["512x512"], ["512x512", "maskable"]] as const) {
      const icon = find(size, purpose);
      expect(icon, `${size} ${purpose ?? "any"}`).toBeTruthy();
      const [w, h] = pngSize(publicDir + icon!.src.replace(/^\//, ""));
      expect(`${w}x${h}`).toBe(size);
    }
    expect(pngSize(publicDir + "icons/apple-touch-icon.png")).toEqual([180, 180]);
  });

  it("never caches the API: no runtime caching and /api excluded from the navigation fallback", () => {
    expect(workbox.runtimeCaching).toEqual([]);
    expect(workbox.navigateFallback).toBe("/index.html");
    expect(workbox.navigateFallbackDenylist?.some((r) => r.test("/api/trips"))).toBe(true);
    expect(workbox.navigateFallbackDenylist?.some((r) => r.test("/2026-10-01"))).toBe(false);
  });
});
