/**
 * Shared document → Konva property mapping for the brochure editor.
 *
 * ## Why this module exists
 *
 * There are two renderers that must agree exactly: the interactive canvas
 * (`BrochureEditorCanvas.tsx`, react-konva at screen scale) and the PDF exporter
 * (`editor-pdf.ts`, imperative Konva at print scale). They are separate
 * codebases by necessity — one is declarative JSX with hooks, the other builds
 * nodes imperatively inside an async loop — so every styling decision expressed
 * in both places is an opportunity for them to diverge.
 *
 * That is not hypothetical. Image fit maths was previously inlined in both, and
 * both copies had silently degraded `fit: "fill"` into `contain`, so the option
 * did nothing at all in either renderer, with no type error and no failing test
 * to show it. `computeImageDrawBox` in `editor-units.ts` was extracted to fix
 * that; this module is the same idea for everything else.
 *
 * Every function here is pure, unit-tested, and returns a plain object of Konva
 * attributes. Adding a new visual property means touching ONE place, and both
 * renderers get it.
 *
 * ## The `pxPerMm` argument
 *
 * The document stores distances in millimetres. Each renderer supplies its own
 * pixels-per-millimetre factor — the canvas bakes in the viewport zoom, the
 * exporter uses print DPI — so the same document produces a correctly-scaled
 * shadow, outline and dash pattern at any resolution.
 */

import type {
  ElementShadow,
  ShapeElement,
  ShapeGradient,
  StrokeDash,
  TextElement,
} from "./editor-document";

// ─── Shadow ─────────────────────────────────────────────────────────────────

/** Konva shadow attributes, or an empty object when the element has no shadow. */
export interface KonvaShadowProps {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  shadowEnabled?: boolean;
}

/**
 * Maps a document shadow to Konva attributes.
 *
 * Returns `{ shadowEnabled: false }` rather than `{}` for the absent case:
 * the exporter reuses node configs and Konva treats a missing key as "inherit
 * whatever was there", so explicitly disabling is the safer default.
 */
export function shadowProps(
  shadow: ElementShadow | undefined,
  pxPerMm: number,
): KonvaShadowProps {
  if (!shadow) return { shadowEnabled: false };
  return {
    shadowEnabled: true,
    shadowColor: shadow.color,
    shadowBlur: Math.max(0, shadow.blur) * pxPerMm,
    shadowOffsetX: shadow.offsetX * pxPerMm,
    shadowOffsetY: shadow.offsetY * pxPerMm,
    shadowOpacity: clamp01(shadow.opacity),
  };
}

/** Sensible starting shadow when the organizer enables one from the panel. */
export function defaultShadow(): ElementShadow {
  return { color: "#000000", blur: 2, offsetX: 0.5, offsetY: 1, opacity: 0.3 };
}

// ─── Text ───────────────────────────────────────────────────────────────────

/**
 * Applies `textTransform` for rendering.
 *
 * Deliberately a render-time transform rather than a mutation of `content`:
 * switching from `uppercase` back to `none` has to restore the organizer's
 * original casing, which is impossible if the transform was destructive.
 */
export function transformedText(
  content: string,
  transform: TextElement["textTransform"],
): string {
  switch (transform) {
    case "uppercase":
      return content.toUpperCase();
    case "lowercase":
      return content.toLowerCase();
    case "capitalize":
      // Per-word, and only the first letter — `\b\w` would also match after an
      // apostrophe and produce "Organizer'S".
      return content.replace(/(^|\s)(\S)/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
    case "none":
    default:
      return content;
  }
}

/** Konva `fontStyle` string for a weight + slant pair. */
export function fontStyleString(
  fontWeight: "normal" | "bold" | undefined,
  fontStyle: "normal" | "italic" | undefined,
): string {
  const bold = fontWeight === "bold";
  const italic = fontStyle === "italic";
  if (bold && italic) return "italic bold";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

export interface KonvaTextExtras {
  letterSpacing?: number;
  verticalAlign?: "top" | "middle" | "bottom";
  stroke?: string;
  strokeWidth?: number;
  /** Konva paints the stroke UNDER the fill for text unless told otherwise;
   *  without this an outline wider than a hairline eats into the glyph. */
  fillAfterStrokeEnabled?: boolean;
}

/**
 * Letter spacing, vertical alignment and glyph outline for a text element.
 *
 * `letterSpacing` is stored in points (the same unit as `fontSize`) and
 * converted here with the caller's pt→px factor, so tracking scales with the
 * type rather than drifting between preview and export.
 */
export function textExtras(
  el: Pick<TextElement, "letterSpacing" | "verticalAlign" | "strokeColor" | "strokeWidth">,
  ptToPxFactor: number,
  pxPerMm: number,
): KonvaTextExtras {
  const extras: KonvaTextExtras = {};
  if (el.letterSpacing) extras.letterSpacing = el.letterSpacing * ptToPxFactor;
  if (el.verticalAlign && el.verticalAlign !== "top") extras.verticalAlign = el.verticalAlign;
  if (el.strokeColor && el.strokeColor !== "transparent" && (el.strokeWidth ?? 0) > 0) {
    extras.stroke = el.strokeColor;
    extras.strokeWidth = (el.strokeWidth ?? 0) * pxPerMm;
    extras.fillAfterStrokeEnabled = true;
  }
  return extras;
}

// ─── Shape fill / stroke ────────────────────────────────────────────────────

export interface KonvaFillProps {
  fill?: string;
  fillLinearGradientStartPoint?: { x: number; y: number };
  fillLinearGradientEndPoint?: { x: number; y: number };
  fillLinearGradientColorStops?: Array<number | string>;
}

/**
 * Resolves a shape's fill, preferring a gradient when one is set.
 *
 * Gradient endpoints are computed from the shape's pixel box, which is why this
 * takes dimensions: Konva expresses linear gradients in node-local coordinates,
 * so the same document gradient needs different numbers at preview and export
 * scale. Getting that wrong is invisible on screen and only shows up in the
 * downloaded file.
 */
export function shapeFillProps(
  el: Pick<ShapeElement, "fill" | "fillGradient">,
  widthPx: number,
  heightPx: number,
): KonvaFillProps {
  if (el.fillGradient) {
    const { from, to, direction } = el.fillGradient;
    const end =
      direction === "horizontal"
        ? { x: widthPx, y: 0 }
        : direction === "diagonal"
          ? { x: widthPx, y: heightPx }
          : { x: 0, y: heightPx };
    return {
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: [0, from, 1, to],
    };
  }
  return { fill: el.fill === "transparent" ? undefined : el.fill };
}

/** Default gradient offered when the organizer switches a shape to gradient. */
export function defaultGradient(currentFill: string): ShapeGradient {
  const base = /^#([0-9a-fA-F]{6})$/.test(currentFill) ? currentFill : "#3b82f6";
  return { from: base, to: "#ffffff", direction: "vertical" };
}

/**
 * Dash pattern in pixels, or `undefined` for a solid stroke.
 *
 * Lengths are proportional to the stroke width rather than fixed, so a 0.3mm
 * hairline gets a fine dash and a 2mm rule gets a coarse one — a fixed pattern
 * looks like a dotted line on thick strokes and a solid one on thin.
 */
export function dashArray(
  dash: StrokeDash | undefined,
  strokeWidthPx: number,
): number[] | undefined {
  if (!dash || dash === "solid") return undefined;
  const unit = Math.max(strokeWidthPx, 0.5);
  return dash === "dotted" ? [unit, unit * 2] : [unit * 4, unit * 3];
}

// ─── Image mirroring ────────────────────────────────────────────────────────

export interface KonvaMirrorProps {
  scaleX: number;
  scaleY: number;
  /** Compensates for the flip so the image stays inside its box. Mirroring about
   *  the node origin would otherwise move the whole bitmap out of frame. */
  x: number;
  y: number;
}

/**
 * Mirror transform for an image, applied to the bitmap inside the element rather
 * than to the element's own node.
 *
 * `x`/`y` are the already-computed draw offsets from `computeImageDrawBox`; the
 * returned values fold in the reflection so callers can pass them straight
 * through.
 */
export function mirrorProps(
  flipH: boolean | undefined,
  flipV: boolean | undefined,
  drawX: number,
  drawY: number,
  drawWidth: number,
  drawHeight: number,
): KonvaMirrorProps {
  return {
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
    x: flipH ? drawX + drawWidth : drawX,
    y: flipV ? drawY + drawHeight : drawY,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
