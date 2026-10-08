// Generates the PWA icons into public/icons using only Node built-ins.
// Glyph: a white diary page with a taxi checker band and ledger lines, on the brand emerald.
// Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public/icons/", import.meta.url));

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BRAND = hex("#047857"); // emerald-700
const PAGE = hex("#ffffff");
const INK = hex("#18181b"); // zinc-900
const TAXI = hex("#fbbf24"); // amber-400
const LINE = hex("#a7f3d0"); // emerald-200

/** Signed-distance-ish test: is (x, y) inside a rounded rect? */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Colour at normalized (u, v) in [0,1]², or null for transparent. */
function shade(u, v, { fullBleed, scale }) {
  if (!fullBleed && !inRoundRect(u, v, 0, 0, 1, 1, 0.22)) return null;
  // Glyph coordinates, scaled about the centre (maskable icons keep it inside the safe zone).
  const x = 0.5 + (u - 0.5) / scale;
  const y = 0.5 + (v - 0.5) / scale;
  if (!inRoundRect(x, y, 0.27, 0.22, 0.73, 0.78, 0.05)) return BRAND;
  // Taxi checker band: 6 columns × 2 rows.
  if (x >= 0.32 && x < 0.68 && y >= 0.29 && y < 0.41) {
    const col = Math.floor((x - 0.32) / 0.06);
    const row = Math.floor((y - 0.29) / 0.06);
    return (col + row) % 2 === 0 ? INK : TAXI;
  }
  // Ledger lines.
  for (const [ly, lx1] of [[0.5, 0.68], [0.58, 0.68], [0.66, 0.56]]) {
    if (inRoundRect(x, y, 0.32, ly, lx1, ly + 0.035, 0.0175)) return LINE;
  }
  return PAGE;
}

function render(size, opts) {
  const SS = 4; // 4×4 supersampling for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const c = shade((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size, opts);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const o = (j * size + i) * 4;
      if (a > 0) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ["icon-192.png", 192, { fullBleed: false, scale: 1 }],
  ["icon-512.png", 512, { fullBleed: false, scale: 1 }],
  // Maskable: full-bleed background, glyph shrunk into the central 80 % safe zone.
  ["icon-maskable-512.png", 512, { fullBleed: true, scale: 0.8 }],
  // iOS rounds the corners itself and dislikes transparency.
  ["apple-touch-icon.png", 180, { fullBleed: true, scale: 0.9 }],
];
for (const [name, size, opts] of icons) {
  writeFileSync(OUT + name, render(size, opts));
  console.log(`wrote public/icons/${name} (${size}×${size})`);
}
