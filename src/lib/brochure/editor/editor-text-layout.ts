/**
 * Measured text layout for the brochure editor.
 *
 * Text is drawn at its natural height by both renderers (see
 * `textVerticalOffset` in `editor-render-props.ts` for why), which means
 * something has to know how tall a text block actually is. This module asks
 * Konva itself — the same engine that draws it — so the answer always matches
 * what ends up on the canvas and in the PDF, for any font.
 *
 * It also keeps a text element's stored box honest. In Canva a text box is as
 * tall as its text; here the box used to stay whatever height the template
 * gave it, so after an edit the selection outline no longer matched the words
 * and anything laid out below was positioned against a stale height.
 * `fittedTextHeightMm` is the rule for what the box should be.
 */
import Konva from "konva";

import type { TextElement } from "./editor-document";
import { fontStyleString, transformedText } from "./editor-render-props";
import { estimateTextHeightMm } from "./editor-text-metrics";
import { ptToMm } from "./editor-units";

/** Scale used for off-screen measuring. Any value works — the result is
 *  converted straight back to mm — but a generous one keeps sub-pixel
 *  rounding from nudging a line break. */
const MEASURE_PX_PER_MM = 12;

type MeasuredText = Pick<
  TextElement,
  "content" | "textTransform" | "fontFamily" | "fontSize" | "fontWeight" | "fontStyle" | "lineHeight" | "letterSpacing"
>;

/**
 * Height, in px, that `el` wraps to in a box `widthPx` wide at `pxPerMm`.
 *
 * Falls back to the metrics table when there's no canvas to measure with
 * (unit tests), so callers never have to care.
 */
export function measureTextHeightPx(el: MeasuredText, widthPx: number, pxPerMm: number): number {
  try {
    const node = new Konva.Text({
      text: transformedText(el.content, el.textTransform),
      width: widthPx,
      fontFamily: el.fontFamily,
      fontSize: ptToMm(el.fontSize) * pxPerMm,
      fontStyle: fontStyleString(el.fontWeight, el.fontStyle),
      lineHeight: el.lineHeight,
      letterSpacing: el.letterSpacing ? el.letterSpacing * ptToMm(1) * pxPerMm : 0,
      wrap: "word",
    });
    const height = node.height();
    node.destroy();
    if (Number.isFinite(height) && height > 0) return height;
  } catch {
    // No 2D context available — fall through to the estimate.
  }
  return (
    estimateTextHeightMm(
      transformedText(el.content, el.textTransform),
      widthPx / pxPerMm,
      el.fontSize,
      el.lineHeight,
      el.fontWeight === "bold",
    ) * pxPerMm
  );
}

/** Height, in mm, that a text element's content wraps to at its own width. */
export function naturalTextHeightMm(el: MeasuredText & Pick<TextElement, "width">): number {
  return measureTextHeightPx(el, el.width * MEASURE_PX_PER_MM, MEASURE_PX_PER_MM) / MEASURE_PX_PER_MM;
}

/**
 * The height a text element's box should have for its current content.
 *
 *   - Top-aligned text hugs its content: the box grows AND shrinks with it,
 *     like a Canva text box.
 *   - Middle- or bottom-aligned text sits inside a deliberate space (a label
 *     centred in a tile, a title centred in a bar), so the box is kept and
 *     only ever grows — shrinking it would move the text.
 */
export function fittedTextHeightMm(el: TextElement): number {
  const natural = naturalTextHeightMm(el);
  const rounded = Math.ceil(natural * 100) / 100;
  if ((el.verticalAlign ?? "top") === "top") return rounded;
  return Math.max(el.height, rounded);
}

/** Properties whose change can alter how tall a text element's content is. */
const HEIGHT_AFFECTING_KEYS = [
  "content",
  "width",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "verticalAlign",
] as const;

/**
 * Extends a patch for a text element with the refitted height, when the patch
 * touches anything that affects it. A patch that sets `height` itself is left
 * alone — that's the organizer sizing the box by hand.
 */
export function withFittedHeight(el: TextElement, patch: Partial<TextElement>): Partial<TextElement> {
  if ("height" in patch) return patch;
  if (!HEIGHT_AFFECTING_KEYS.some((key) => key in patch)) return patch;
  return { ...patch, height: fittedTextHeightMm({ ...el, ...patch }) };
}
