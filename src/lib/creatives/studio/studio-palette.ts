/**
 * Colour for the Creative Studio.
 *
 * A palette is a small, complete colour system — background pair, text,
 * accent, card surface — so a design never has to guess whether two of its
 * colours are readable together. Palettes come from three places:
 *
 *   • the event's own banner (dominant colours are extracted in the browser),
 *   • the event's brand colours, when set,
 *   • a curated set that works with any content.
 *
 * Everything here is pure (no DOM) except `extractImageColors`, which reads
 * pixels from an already-loaded image.
 */

export interface StudioPalette {
  id: string;
  name: string;
  /** Main background and its gradient partner. */
  bg: string;
  bg2: string;
  /** Text on the background, and a quieter variant for secondary lines. */
  ink: string;
  muted: string;
  /** Highlight colour and the text colour that reads on top of it. */
  accent: string;
  onAccent: string;
  /** Surface for logos / framed blocks, and text on it. */
  card: string;
  onCard: string;
  /** True when the background is dark (decorations pick tints accordingly). */
  dark: boolean;
}

/* ── Colour maths ──────────────────────────────────────────────────────── */

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const toHex = ([r, g, b]: Rgb): string =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h /= 6;
  return [h * 360, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let T = t;
    if (T < 0) T += 1;
    if (T > 1) T -= 1;
    if (T < 1 / 6) return p + (q - p) * 6 * T;
    if (T < 1 / 2) return q;
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6;
    return p;
  };
  return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
}

const hsl = (h: number, s: number, l: number) => toHex(hslToRgb(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))));

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Near-black or white, whichever reads better on `bg`. */
export const readableOn = (bg: string): string => (contrast(bg, "#ffffff") >= contrast(bg, "#0b0f19") ? "#ffffff" : "#0b0f19");

/** `hex` with an alpha channel, as a CSS rgba() string. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a) ?? [0, 0, 0], B = parseHex(b) ?? [0, 0, 0];
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/* ── Building palettes ─────────────────────────────────────────────────── */

function finish(p: Omit<StudioPalette, "muted" | "onAccent" | "onCard" | "dark"> & Partial<StudioPalette>): StudioPalette {
  const dark = luminance(p.bg) < 0.4;
  return {
    ...p,
    dark,
    muted: p.muted ?? alpha(p.ink, dark ? 0.72 : 0.66),
    onAccent: p.onAccent ?? readableOn(p.accent),
    onCard: p.onCard ?? readableOn(p.card),
  };
}

/** Raise an accent's lightness until it stands out on a dark background. */
function accentFor(bg: string, hue: number, sat: number): string {
  for (let l = 0.6; l <= 0.86; l += 0.04) {
    const c = hsl(hue, Math.max(0.55, sat), l);
    if (contrast(c, bg) >= 4.5) return c;
  }
  return hsl(hue, 0.7, 0.86);
}

/**
 * A dark, rich palette built around a brand colour: the brand hue carries the
 * background, and the accent is either the supplied second colour or a warm
 * complement, lightened until it clearly reads.
 */
export function darkPaletteFrom(primary: string, accent?: string | null, id = "brand-dark", name = "Brand"): StudioPalette {
  const [h, s] = rgbToHsl(parseHex(primary) ?? [79, 70, 229]);
  const sat = Math.min(0.78, Math.max(0.35, s));
  const bg = hsl(h, sat * 0.85, 0.09);
  const bg2 = hsl(h, sat, 0.26);
  let acc: string;
  if (accent && parseHex(accent)) {
    const [ah, as] = rgbToHsl(parseHex(accent)!);
    // A second colour too close to the background hue would vanish.
    const far = Math.min(Math.abs(ah - h), 360 - Math.abs(ah - h)) > 25 || as < 0.15;
    acc = far ? accentFor(bg, ah, as) : accentFor(bg, h + 40, 0.8);
  } else {
    acc = accentFor(bg, h + 165, 0.85);
  }
  return finish({ id, name, bg, bg2, ink: "#ffffff", accent: acc, card: "#ffffff" });
}

/** A light palette: tinted paper background, the brand colour as the accent. */
export function lightPaletteFrom(primary: string, id = "brand-light", name = "Brand light"): StudioPalette {
  const [h, s] = rgbToHsl(parseHex(primary) ?? [79, 70, 229]);
  const sat = Math.min(0.85, Math.max(0.4, s));
  let accent = hsl(h, sat, 0.42);
  const bg = hsl(h, 0.35, 0.975);
  for (let l = 0.42; l >= 0.2 && contrast(accent, bg) < 4.5; l -= 0.04) accent = hsl(h, sat, l);
  return finish({ id, name, bg, bg2: hsl(h, 0.45, 0.92), ink: hsl(h, 0.45, 0.12), accent, card: "#ffffff" });
}

/** Curated palettes that hold up with any event. */
export const CURATED_PALETTES: StudioPalette[] = [
  finish({ id: "midnight", name: "Midnight", bg: "#0a0f24", bg2: "#1d2b6b", ink: "#ffffff", accent: "#8fb0ff", card: "#ffffff" }),
  finish({ id: "emerald", name: "Emerald", bg: "#04221b", bg2: "#0d5b46", ink: "#ffffff", accent: "#f6c453", card: "#ffffff" }),
  finish({ id: "royal", name: "Royal", bg: "#150a33", bg2: "#4a1d96", ink: "#ffffff", accent: "#f9a8d4", card: "#ffffff" }),
  finish({ id: "ember", name: "Ember", bg: "#190a09", bg2: "#8a2318", ink: "#ffffff", accent: "#fdc27a", card: "#ffffff" }),
  finish({ id: "ocean", name: "Ocean", bg: "#031c28", bg2: "#0c6c84", ink: "#ffffff", accent: "#6ee7d6", card: "#ffffff" }),
  finish({ id: "graphite", name: "Graphite", bg: "#0d0f13", bg2: "#2b303b", ink: "#ffffff", accent: "#e8eaee", card: "#ffffff" }),
  finish({ id: "paper", name: "Paper", bg: "#faf6ef", bg2: "#efe5d3", ink: "#1b1a17", accent: "#b9410f", card: "#ffffff" }),
  finish({ id: "sky", name: "Sky", bg: "#f3f7ff", bg2: "#d9e6ff", ink: "#0a1a3b", accent: "#1d4ed8", card: "#ffffff" }),
  finish({ id: "blush", name: "Blush", bg: "#fff6f6", bg2: "#ffdfe5", ink: "#3a0a1b", accent: "#be123c", card: "#ffffff" }),
];

/** A palette from two colours the organiser picked by hand. */
export function customPalette(primary: string, accent: string, light: boolean): StudioPalette {
  if (light) {
    const p = lightPaletteFrom(primary, "custom", "Custom");
    const acc = parseHex(accent) && contrast(accent, p.bg) >= 3 ? accent : p.accent;
    return finish({ ...p, accent: acc, onAccent: undefined });
  }
  return darkPaletteFrom(primary, accent, "custom", "Custom");
}

/* ── Colours from an image ─────────────────────────────────────────────── */

/**
 * The two most characteristic colours of an image: the dominant vivid colour
 * and the strongest colour of a clearly different hue. Greys, near-white and
 * near-black are ignored — they describe lighting, not branding.
 *
 * Works on raw RGBA data so it can be unit-tested without a canvas.
 */
export function dominantColors(data: ArrayLike<number>): { primary: string; accent: string | null } | null {
  const BUCKETS = 24;
  const score = new Array<number>(BUCKETS).fill(0);
  const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0, 0]); // r, g, b, weight
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb: Rgb = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.22 || l < 0.12 || l > 0.9) continue;
    const w = s * (1 - Math.abs(l - 0.5)); // vivid mid-tones count most
    const b = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
    score[b] += w;
    sum[b][0] += rgb[0] * w; sum[b][1] += rgb[1] * w; sum[b][2] += rgb[2] * w; sum[b][3] += w;
  }
  const order = score.map((v, i) => [v, i] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
  if (order.length === 0) return null;
  const colorOf = (i: number) => toHex([sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]]);
  const first = order[0][1];
  const second = order.find(([v, i]) => {
    const d = Math.min(Math.abs(i - first), BUCKETS - Math.abs(i - first));
    return d >= 3 && v >= order[0][0] * 0.08;
  });
  return { primary: colorOf(first), accent: second ? colorOf(second[1]) : null };
}

/** Browser wrapper around `dominantColors`. Returns null if the image can't be read. */
export function extractImageColors(img: CanvasImageSource & { width: number; height: number }): { primary: string; accent: string | null } | null {
  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    return dominantColors(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return null; // cross-origin image without CORS headers
  }
}

/** Degrees between two colours' hues (0–180). */
export function hueDistance(a: string, b: string): number {
  const ha = rgbToHsl(parseHex(a) ?? [0, 0, 0])[0], hb = rgbToHsl(parseHex(b) ?? [0, 0, 0])[0];
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d);
}

/**
 * Every palette on offer for an event, best matches first: from the banner,
 * from the event's brand colours, then the curated set.
 */
export function buildPaletteSet(input: {
  banner?: { primary: string; accent: string | null } | null;
  brandPrimary?: string | null;
  brandAccent?: string | null;
}): StudioPalette[] {
  const out: StudioPalette[] = [];
  if (input.banner) {
    out.push(darkPaletteFrom(input.banner.primary, input.banner.accent, "banner-dark", "From your banner"));
    out.push(lightPaletteFrom(input.banner.primary, "banner-light", "Banner · light"));
  }
  const brand = input.brandPrimary && parseHex(input.brandPrimary) ? input.brandPrimary : null;
  if (brand && (!input.banner || hueDistance(brand, input.banner.primary) >= 20)) {
    out.push(darkPaletteFrom(brand, input.brandAccent, "brand-dark", "Your brand"));
    out.push(lightPaletteFrom(brand, "brand-light", "Brand · light"));
  }
  return [...out, ...CURATED_PALETTES];
}
