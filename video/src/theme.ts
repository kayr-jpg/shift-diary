import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { useVideoConfig } from "remotion";

export const FPS = 30;

/** Scene lengths in frames: 5 + 20 + 15 + 5 + 7 = 52 s. */
export const SCENES = {
  hook: 5 * FPS,
  footage: 20 * FPS,
  idempotency: 15 * FPS,
  proof: 5 * FPS,
  endCard: 7 * FPS,
} as const;

export const TOTAL_FRAMES = Object.values(SCENES).reduce((a, b) => a + b, 0);

// Google Fonts are fetched at render (and Studio) time, so rendering needs network access.
export const { fontFamily: SANS } = loadInter("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"], // cyrillic-ext: Kazakh Қ, Ә, Ү…
});
export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "cyrillic"],
});

export const C = {
  bg: "#0b1211",
  panel: "#131d1b",
  panelLine: "#22312e",
  text: "#f4f7f6",
  muted: "#9fb3ae",
  green: "#10b981",
  greenDeep: "#047857",
  blue: "#38bdf8",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

const NBSP = " ";

/** Tenge exactly as the app renders it: "3 315 ₸" with U+00A0 group and currency separators. */
export function money(n: number): string {
  const digits = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "−" : ""}${digits}${NBSP}₸`;
}

/** Layout helper: the same scenes serve the 1080×1920 and the 1920×1080 cut. */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const wide = width > height;
  return { width, height, wide, unit: Math.min(width, height) / 1080 };
}
