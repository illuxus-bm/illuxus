/**
 * Theme contrast utilities.
 *
 * Centralises the colour math used by the public event landing page so the
 * renderer, the preview, and the automated audits all agree on what counts as
 * "readable" and what surface tokens (borders / tinted backgrounds) to use.
 *
 * The contrast math follows the WCAG 2.x relative-luminance formula. We treat
 * a 4.5:1 ratio as the AA bar for body copy and a 3:1 ratio as the AA bar for
 * large text + UI components.
 */

export interface ThemeLike {
  primaryColor: string;
  accentColor?: string;
  backgroundColor: string;
  textColor: string;
}

export interface SurfaceTokens {
  border: string;
  surface: string;
  divider: string;
}

const expand = (hex: string) => {
  const h = (hex || "").trim().replace("#", "");
  if (h.length === 3) return h.split("").map((c) => c + c).join("");
  if (h.length === 6) return h;
  return "ffffff";
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const full = expand(hex);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

/** Perceived (sRGB) luminance in 0..1 — fine for "is this light or dark?" checks. */
export function perceivedLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** WCAG 2.x relative luminance. */
function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function wcagContrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick `#fafafa` or `#0a0a0a` depending on which contrasts better with `bg`. */
export function readableOn(bg: string): string {
  return perceivedLuminance(bg) > 0.55 ? "#0a0a0a" : "#fafafa";
}

/**
 * Contrast-aware surface tokens used for borders, dividers, and soft tints.
 * On a dark bg we lift with white alpha; on a light bg we deepen with black
 * alpha. This keeps hairlines and cards visible across every preset.
 */
export function surfaceTokens(bg: string | undefined): SurfaceTokens {
  const base = perceivedLuminance(bg || "#ffffff") > 0.55 ? "0,0,0" : "255,255,255";
  return {
    border: `rgba(${base}, 0.14)`,
    surface: `rgba(${base}, 0.05)`,
    divider: `rgba(${base}, 0.10)`,
  };
}

/**
 * Validate a preset theme and return a safe version. Falls back to a readable
 * counterpart when an organizer-picked combination would fail WCAG AA.
 *
 * - bg ↔ text must clear 4.5:1; otherwise text is swapped to `readableOn(bg)`.
 * - primary used as a button background must clear 3:1 vs its own foreground
 *   ("#fff"); otherwise we keep the primary hue but flag it so callers can
 *   render a contrast-correct label.
 */
export interface ValidationResult {
  theme: ThemeLike;
  fixes: string[];
}

export function validateTheme(theme: ThemeLike): ValidationResult {
  const fixes: string[] = [];
  const out: ThemeLike = { ...theme };

  const bgTextRatio = wcagContrast(out.backgroundColor, out.textColor);
  if (bgTextRatio < 4.5) {
    const fallback = readableOn(out.backgroundColor);
    fixes.push(
      `text/background contrast was ${bgTextRatio.toFixed(2)}:1 (<4.5) — text swapped to ${fallback}`,
    );
    out.textColor = fallback;
  }

  // Primary on white label — buttons render white text on primary.
  const primaryRatio = wcagContrast(out.primaryColor, "#ffffff");
  if (primaryRatio < 3) {
    fixes.push(
      `primary/white contrast was ${primaryRatio.toFixed(2)}:1 (<3) — button labels may need a darker fg`,
    );
  }
  return { theme: out, fixes };
}