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
