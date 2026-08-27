/**
 * PDF export for the brochure editor.
 *
 * Given a `Brochure_Document`, renders each page to an off-screen
 * Konva `Stage` at print resolution (`EXPORT_DPI`), converts to a
 * data-URL PNG, and stamps into a `jsPDF` document one page at a time.
 * The result is a real print-ready PDF that matches the on-screen
 * editor pixel-for-pixel because both use the same rendering pipeline.
 *
 * The off-screen render is done via a hidden `<div>` container that
 * we mount an unmanaged Konva stage into. This avoids requiring the
 * editor's live stage ref (which is scaled for viewport fit) — we
 * always render at native mm-to-EXPORT_DPI-px scale.
 *
 * Not-throw contract: every image load failure falls back to a gray
 * placeholder identical to what the editor shows; the export always
 * produces a PDF, never blocks on a broken image URL.
 */
import jsPDF from "jspdf";
import Konva from "konva";

import { EXPORT_DPI, mmToPx, ptToPx } from "./editor-units";
import { ensureFontLoaded } from "./editor-fonts";
import {
  collectDocumentFontFamilies,
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
  type ImageElement,
  type PageBackground,
  type PillElement,
  type ShapeElement,
  type TextElement,
} from "./editor-document";

/**
 * Loads an image URL into an HTMLImageElement, respecting CORS so the
 * resulting canvas is not tainted (a tainted canvas throws on
 * `.toDataURL`). Resolves `null` on any failure.
 */
function loadImageForCanvas(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderPageToImage(page: BrochurePage): Promise<HTMLCanvasElement> {
  // Container is off-DOM; Konva mounts into a real element but we
  // never attach it to the document so it stays invisible.
  const container = document.createElement("div");
  const widthPx = mmToPx(page.width, EXPORT_DPI);
  const heightPx = mmToPx(page.height, EXPORT_DPI);
  const pxPerMm = mmToPx(1, EXPORT_DPI);

  const stage = new Konva.Stage({ container, width: widthPx, height: heightPx });

  // Background layer.
  const bgLayer = new Konva.Layer();
  await drawPageBackground(bgLayer, page.background, widthPx, heightPx);
  stage.add(bgLayer);

  // Content layer.
  const contentLayer = new Konva.Layer();
  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    await drawElement(contentLayer, el, pxPerMm);
  }
  stage.add(contentLayer);

  stage.draw();

  // Force a synchronous render before grabbing the canvas.
  const canvas = stage.toCanvas({ pixelRatio: 1 });
  stage.destroy();
  return canvas;
}

async function drawPageBackground(
  layer: Konva.Layer,
  bg: PageBackground,
  widthPx: number,
  heightPx: number
): Promise<void> {
  if (bg.type === "solid") {
    layer.add(new Konva.Rect({ x: 0, y: 0, width: widthPx, height: heightPx, fill: bg.color }));
    return;
  }
  if (bg.type === "gradient") {
    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: widthPx,
        height: heightPx,
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: 0, y: heightPx },
        fillLinearGradientColorStops: [0, bg.top, 1, bg.bottom],
      })
    );
    return;
  }
  // Image background.
  const img = await loadImageForCanvas(bg.src);
  layer.add(new Konva.Rect({ x: 0, y: 0, width: widthPx, height: heightPx, fill: "#f3f4f6" }));
  if (img) {
    const scale = bg.fit === "cover"
      ? Math.max(widthPx / img.width, heightPx / img.height)
      : Math.min(widthPx / img.width, heightPx / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    layer.add(
      new Konva.Image({
        image: img,
        x: (widthPx - drawW) / 2,
        y: (heightPx - drawH) / 2,
        width: drawW,
        height: drawH,
      })
    );
  }
}

async function drawElement(layer: Konva.Layer, el: BrochureElement, pxPerMm: number): Promise<void> {
  const xPx = el.x * pxPerMm;
  const yPx = el.y * pxPerMm;
  const wPx = el.width * pxPerMm;
  const hPx = el.height * pxPerMm;

  const group = new Konva.Group({
    x: xPx,
    y: yPx,
    rotation: el.rotation,
    opacity: el.opacity,
  });

  switch (el.kind) {
    case "text":
      drawTextInto(group, el, wPx, hPx);
      break;
    case "image":
      await drawImageInto(group, el, wPx, hPx);
      break;
    case "shape":
      drawShapeInto(group, el, wPx, hPx);
      break;
    case "pill":
      drawPillInto(group, el, wPx, hPx);
      break;
  }

  layer.add(group);
}

function drawTextInto(group: Konva.Group, el: TextElement, w: number, h: number) {
  const fontStyle =
    el.fontWeight === "bold" && el.fontStyle === "italic"
      ? "italic bold"
      : el.fontWeight === "bold"
        ? "bold"
        : el.fontStyle === "italic"
          ? "italic"
          : "normal";
  group.add(
    new Konva.Text({
      x: 0,
      y: 0,
      width: w,
      height: h,
      text: el.content,
      fontFamily: el.fontFamily,
      fontSize: ptToPx(el.fontSize, EXPORT_DPI),
      fontStyle,
      fill: el.color,
      align: el.align,
      lineHeight: el.lineHeight,
      wrap: "word",
    })
  );
}

async function drawImageInto(group: Konva.Group, el: ImageElement, w: number, h: number) {
  const img = await loadImageForCanvas(el.src);
  const radiusPx = (el.cornerRadius / 25.4) * EXPORT_DPI;

  // Rounded-corner clip via a Konva.Path wrapping group (simpler:
  // use a Rect with fillPatternImage). We'll use fillPatternImage to
  // fit-cover the image into a rounded rectangle.
  if (!img) {
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: "#e5e7eb",
        cornerRadius: radiusPx,
      })
    );
    return;
  }
  const scale = el.fit === "cover"
    ? Math.max(w / img.width, h / img.height)
    : Math.min(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (w - drawW) / 2;
  const dy = (h - drawH) / 2;

  // clipFunc lets us draw the image inside a rounded rect while
  // preserving image cover/contain semantics.
  const clip = new Konva.Group({
    clipFunc: (ctx: CanvasRenderingContext2D) => {
      const r = Math.min(radiusPx, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(r, h);
      ctx.quadraticCurveTo(0, h, 0, h - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
    },
  });
  clip.add(new Konva.Image({ image: img, x: dx, y: dy, width: drawW, height: drawH }));
  group.add(clip);
}

function drawShapeInto(group: Konva.Group, el: ShapeElement, w: number, h: number) {
  if (el.shape === "ellipse") {
    group.add(
      new Konva.Ellipse({
        x: w / 2,
        y: h / 2,
        radiusX: w / 2,
        radiusY: h / 2,
        fill: el.fill === "transparent" ? undefined : el.fill,
        stroke: el.stroke === "transparent" ? undefined : el.stroke,
        strokeWidth: (el.strokeWidth / 25.4) * EXPORT_DPI,
      })
    );
    return;
  }
  group.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: el.fill === "transparent" ? undefined : el.fill,
      stroke: el.stroke === "transparent" ? undefined : el.stroke,
      strokeWidth: (el.strokeWidth / 25.4) * EXPORT_DPI,
      cornerRadius: (el.cornerRadius / 25.4) * EXPORT_DPI,
    })
  );
}

function drawPillInto(group: Konva.Group, el: PillElement, w: number, h: number) {
  group.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      cornerRadius: h / 2,
      fill: el.fillColor === "transparent" ? undefined : el.fillColor,
      stroke: el.strokeColor === "transparent" ? undefined : el.strokeColor,
      strokeWidth: (el.strokeWidth / 25.4) * EXPORT_DPI,
    })
  );
  group.add(
    new Konva.Text({
      x: 0,
      y: 0,
      width: w,
      height: h,
      text: el.text,
      fontFamily: el.fontFamily,
      fontSize: ptToPx(el.fontSize, EXPORT_DPI),
      fill: el.textColor,
      align: "center",
      verticalAlign: "middle",
    })
  );
}

/**
 * Renders the full document to a jsPDF blob. Each page is rendered to
 * a Konva canvas at EXPORT_DPI, converted to PNG, and stamped as a
 * full-page image into a jsPDF at the corresponding page size in mm.
 *
 * `onProgress(completed, total)` fires once per rendered page for the
 * dialog's progress bar.
 */
export async function exportDocumentToPdf(
  doc: BrochureDocument,
  onProgress?: (completed: number, total: number) => void
): Promise<Blob> {
  // Explicitly request every font family used anywhere in the document
  // BEFORE rendering any page. Previously this function only awaited
  // `document.fonts.ready` per-page, which resolves trivially (with
  // nothing loaded) for any family that was never requested via
  // `ensureFontLoaded` elsewhere — e.g. a font the seed used but the
  // organizer never opened the font dropdown for. That silently
  // exported text in the browser's fallback font instead of the
  // family actually shown on the canvas moments earlier. Awaiting
  // `ensureFontLoaded` per family (idempotent + cached) guarantees the
  // stylesheet is injected and the weights are shaped, then
  // `document.fonts.ready` below is a real synchronization point
  // rather than a no-op.
  const families = collectDocumentFontFamilies(doc);
  await Promise.all(families.map((f) => ensureFontLoaded(f).catch(() => undefined)));
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // fonts.ready is best-effort; failure just means we render with
      // whatever's currently loaded.
    }
  }

  const [firstPage] = doc.pages;
  const pdf = new jsPDF({
    unit: "mm",
    format: [firstPage.width, firstPage.height],
    orientation: firstPage.width > firstPage.height ? "landscape" : "portrait",
  });

  for (let i = 0; i < doc.pages.length; i += 1) {
    const page = doc.pages[i];
    // Add a new page for every page after the first, matching the
    // orientation of that specific page (documents may in future mix
    // portrait and landscape).
    if (i > 0) {
      pdf.addPage([page.width, page.height], page.width > page.height ? "landscape" : "portrait");
    }
    const canvas = await renderPageToImage(page);
    const dataUrl = canvas.toDataURL("image/png");
    pdf.addImage(dataUrl, "PNG", 0, 0, page.width, page.height);
    onProgress?.(i + 1, doc.pages.length);
  }

  return pdf.output("blob");
}

/** Triggers a browser download of the rendered PDF. Mirrors the
 *  existing `downloadBrochurePdf` API for consistency. */
export async function downloadDocumentAsPdf(
  doc: BrochureDocument,
  filename: string,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const blob = await exportDocumentToPdf(doc, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
