/**
 * Unit conversion helpers for the brochure editor.
 *
 * Everything in the document data model (`editor-document.ts`) is stored
 * in millimetres because that's the canonical unit for print — an A4
 * page is exactly 210 × 297 mm regardless of the DPI a given renderer
 * uses. The Konva canvas needs pixels; the jsPDF export needs mm; the
 * font sizing on the canvas needs pixels-per-mm to convert `pt` font
 * sizes into a canvas font size that visually matches the printed PDF.
 *
 * Three constants define the whole pipeline:
 *  - `SCREEN_DPI = 96`  standard browser DPI
 *  - `EXPORT_DPI = 300` PDF export DPI (high-quality print)
 *  - `POINTS_PER_INCH = 72`  typography constant
 *
 * From these we derive:
 *  - `mmToPx(mm, dpi)`  a length in mm rendered at the given DPI
 *  - `ptToPx(pt, dpi)`  a font size in `pt` rendered at the given DPI
 *
 * The canvas engine calls these with `SCREEN_DPI`; the export path
 * calls them with `EXPORT_DPI`, so the same document produces both a
 * fast on-screen render and a print-quality PDF from the same source.
 */

export const SCREEN_DPI = 96;
export const EXPORT_DPI = 300;
export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

/** Converts millimetres to pixels at the given DPI. */
export function mmToPx(mm: number, dpi: number = SCREEN_DPI): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Converts pixels back to millimetres at the given DPI. Used by the
 *  canvas engine when translating mouse/drag events (which are in
 *  screen pixels) back into document mm before writing to the state
 *  tree. */
export function pxToMm(px: number, dpi: number = SCREEN_DPI): number {
  return (px / dpi) * MM_PER_INCH;
}

/** Converts a font `pt` size to pixels at the given DPI. */
export function ptToPx(pt: number, dpi: number = SCREEN_DPI): number {
  return (pt / POINTS_PER_INCH) * dpi;
}

/**
 * Converts a font `pt` size to its millimetre equivalent. DPI-
 * independent (the DPI terms cancel out of `ptToPx(pt, dpi) /
 * mmToPx(1, dpi)`), which is exactly why this is the right building
 * block for the editor canvas: every other element property (position,
 * width, height, stroke width, corner radius) is stored in mm and
 * converted to on-screen pixels via one `pxPerMm` factor that already
 * bakes in the current viewport zoom (`fitPageToViewport`'s `scale`).
 * Converting `fontSize` to mm first, then multiplying by that SAME
 * `pxPerMm` factor, keeps text sized consistently with the rest of the
 * scene at every zoom level — unlike calling `ptToPx(fontSize)` alone,
 * which bakes in a fixed `SCREEN_DPI` conversion and silently ignores
 * the viewport-fit zoom, causing text to overflow or shrink relative to
 * its box whenever the editor's canvas pane isn't exactly the size the
 * layout numbers were authored at.
 */
export function ptToMm(pt: number): number {
  return (pt / POINTS_PER_INCH) * MM_PER_INCH;
}

/**
 * Fits an A4-ish page (`docWidthMm` × `docHeightMm`) inside an available
 * viewport (`vw` × `vh`, both in pixels) leaving `paddingPx` on every
 * side. Returns the scale factor and the resulting page pixel width.
 * The canvas engine uses this to compute the initial zoom level so the
 * whole page fits nicely inside the editor's centre pane.
 */
export function fitPageToViewport(
  docWidthMm: number,
  docHeightMm: number,
  vw: number,
  vh: number,
  paddingPx = 20
): { scale: number; widthPx: number; heightPx: number } {
  const availableW = Math.max(0, vw - paddingPx * 2);
  const availableH = Math.max(0, vh - paddingPx * 2);
  const pageWpxAt1x = mmToPx(docWidthMm);
  const pageHpxAt1x = mmToPx(docHeightMm);
  if (pageWpxAt1x === 0 || pageHpxAt1x === 0) {
    return { scale: 1, widthPx: 0, heightPx: 0 };
  }
  const scale = Math.min(availableW / pageWpxAt1x, availableH / pageHpxAt1x);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    scale: safeScale,
    widthPx: pageWpxAt1x * safeScale,
    heightPx: pageHpxAt1x * safeScale,
  };
}

/** Where an image is drawn relative to its element box, in the same unit as
 *  the box dimensions passed in. */
export interface ImageDrawBox {
  /** Offset from the box's left edge. Negative when the image overflows. */
  dx: number;
  /** Offset from the box's top edge. Negative when the image overflows. */
  dy: number;
  width: number;
  height: number;
}

/**
 * Resolves where a bitmap sits inside its element box, honouring fit mode,
 * zoom, and focal point.
 *
 * ## Why this is a shared function and not inlined twice
 *
 * This calculation used to be duplicated in `BrochureEditorCanvas`'s
 * `ImageBody` and in `editor-pdf`'s `drawImageInto`. The two copies had already
 * drifted — both silently treated `fit: "fill"` as `contain`, so the option did
 * nothing, and nothing in the type system or the tests would have caught it if
 * only one of them were fixed. Any change to how images are placed now has
 * exactly one place to happen, which is the only reliable way to keep the
 * canvas and the downloaded PDF showing the same thing.
 *
 * ## Fit modes
 *
 *  - `cover`   scale up until the box is covered; the overflow is cropped
 *  - `contain` scale down until the whole image fits; the remainder letterboxes
 *  - `fill`    scale each axis independently to exactly fill the box,
 *              deliberately breaking aspect ratio
 *
 * ## Focal point
 *
 * `focalX` / `focalY` run 0 → 1 and choose WHICH part of the image survives the
 * crop: `0` keeps the left/top edge, `0.5` centres (the default, and what the
 * old hardcoded behaviour did), `1` keeps the right/bottom edge. The same
 * formula also positions a letterboxed `contain` image, so `0` flushes it left
 * instead of centring.
 *
 * A focal point rather than a pixel crop rectangle: the element box gets
 * resized constantly by dragging, and a crop expressed in source-image pixels
 * would have to be recomputed (and would quietly go out of range) on every
 * resize. Two normalised numbers stay correct at any box size.
 *
 * `zoom` (>= 1) multiplies the fit scale so an organizer can push further into
 * the image than `cover` alone allows.
 */
export function computeImageDrawBox(params: {
  boxWidth: number;
  boxHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  fit: "cover" | "contain" | "fill";
  /** Extra scale on top of the fit scale. Values < 1 are clamped to 1 so an
   *  image can never be shrunk below its own fit mode, which would letterbox a
   *  `cover` image and look like a rendering bug. */
  zoom?: number;
  focalX?: number;
  focalY?: number;
}): ImageDrawBox {
  const { boxWidth, boxHeight, naturalWidth, naturalHeight, fit } = params;
  const zoom = Math.max(1, params.zoom ?? 1);
  const focalX = clamp01(params.focalX ?? 0.5);
  const focalY = clamp01(params.focalY ?? 0.5);

  let width: number;
  let height: number;
  if (fit === "fill" || naturalWidth <= 0 || naturalHeight <= 0) {
    // Degenerate natural dimensions fall back to `fill` rather than dividing by
    // zero and producing NaN geometry that Konva silently refuses to draw.
    width = boxWidth * zoom;
    height = boxHeight * zoom;
  } else {
    const base =
      fit === "cover"
        ? Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight)
        : Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
    const scale = base * zoom;
    width = naturalWidth * scale;
    height = naturalHeight * scale;
  }

  // One expression covers both cases. When the image overflows, `boxWidth -
  // width` is negative and the focal fraction slides the visible window; when
  // it letterboxes, the same term is positive and the fraction positions it in
  // the free space. At the 0.5 default both reduce to centring.
  return {
    dx: normalizeZero((boxWidth - width) * focalX),
    dy: normalizeZero((boxHeight - height) * focalY),
    width,
    height,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Collapses `-0` to `0`.
 *
 * A cropped image has a negative overflow term, so a focal point of exactly 0
 * produces `-0`. It renders identically, but it compares unequal to `0` under
 * `Object.is` (which is what test equality and React's own bail-out checks use)
 * and it's a baffling thing to find in a persisted document. Cheaper to not
 * emit it.
 */
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}
