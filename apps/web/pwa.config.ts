import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";

/** App palette: zinc-50 surface (matches the light header and <meta name="theme-color">). */
export const BRAND = "#047857"; // emerald-700, icon background
export const SURFACE = "#fafafa"; // zinc-50

export const manifest: Partial<ManifestOptions> = {
  name: "Дневник смен водителя",
  short_name: "Смены",
  description: "Итоги смены водителя такси: выручка, комиссия, на руки.",
  lang: "ru",
  dir: "ltr",
  display: "standalone",
  start_url: "/",
  scope: "/",
  theme_color: SURFACE,
  background_color: SURFACE,
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

/**
 * Precache the built shell only. The API is never cached: no runtime caching at all, and
 * /api navigations never fall back to index.html.
 */
export const workbox: NonNullable<VitePWAOptions["workbox"]> = {
  // Icons, the manifest and includeAssets are added by the plugin itself.
  globPatterns: ["**/*.{js,css,html}"],
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api/],
  runtimeCaching: [],
  cleanupOutdatedCaches: true,
};

export const pwa: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  injectRegister: false, // registered from src/registerSw.ts, production only
  includeAssets: ["icons/apple-touch-icon.png"],
  manifest,
  workbox,
  devOptions: { enabled: false },
};
