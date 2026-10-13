/**
 * Drawing certificates: the verification QR code, single PDFs, a combined
 * PDF for a whole batch, and gallery thumbnails.
 *
 * Every path goes through `certificateDocument` and the brochure editor's
 * page renderer, so the editor's participant preview, the thumbnails and the
 * PDFs are the same picture at different resolutions.
 */
import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { BrochureDocument } from "@/lib/brochure/editor/editor-document";
import { renderPageToCanvas, type ImagePolicy } from "@/lib/brochure/editor/editor-pdf";
import { ensureFontLoaded } from "@/lib/brochure/editor/editor-fonts";
import { collectDocumentFontFamilies } from "@/lib/brochure/editor/editor-document";
import { publicOrigin } from "@/lib/publicUrl";
import { renderCertificate, type CertificateDesign } from "./certificate-design";
import type { CertificateValues } from "./certificate-fields";

/** Shown in previews, where nothing has been issued yet. */
export const PREVIEW_CODE = "ILX-PREV-IEW0-0000";

export const verificationUrl = (code: string): string => `${publicOrigin()}/certificates/${encodeURIComponent(code)}`;

const qrCache = new Map<string, string>();
/** A crisp, scannable QR code for the certificate's verification page. */
export async function qrDataUrl(code: string): Promise<string> {
  const cached = qrCache.get(code);
  if (cached) return cached;
  const url = await QRCode.toDataURL(verificationUrl(code), { margin: 1, width: 640, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  qrCache.set(code, url);
  return url;
}

/** Exactly what is drawn for one person (or a sample, without a code). */
export async function certificateDocument(design: CertificateDesign, values: CertificateValues, code?: string | null): Promise<BrochureDocument> {
  const qr = design.settings.qr.enabled ? await qrDataUrl(code || PREVIEW_CODE) : null;
  return renderCertificate(design, { ...values, certificate_id: values.certificate_id ?? code ?? undefined }, { qrDataUrl: qr });
}

/** Waits for every web font the document uses — canvas text does not swap fonts in later. */
async function fontsReady(doc: BrochureDocument): Promise<void> {
  await Promise.all(collectDocumentFontFamilies(doc).map((f) => ensureFontLoaded(f).catch(() => undefined)));
  try { await document.fonts?.ready; } catch { /* best effort */ }
}

/** A certificate drawn to a canvas, fonts loaded first. Used by every on-screen preview. */
export async function certificateCanvas(design: CertificateDesign, values: CertificateValues, code: string | null, dpi: number, images: ImagePolicy = { showBlocked: true }): Promise<HTMLCanvasElement> {
  const doc = await certificateDocument(design, values, code);
  await fontsReady(doc);
  return renderPageToCanvas(doc.pages[0], dpi, images);
}

export interface BatchItem { design: CertificateDesign; values: CertificateValues; code: string }

/**
 * Certificates as one PDF, one page each, drawn as high-quality JPEG. A
 * lossless 300 DPI page is ~25 MB; JPEG at quality 0.93 is a few hundred KB
 * and indistinguishable in print. Pages are flattened, so transparency in
 * signatures and logos is already composited over the background.
 */
async function renderPdf(items: BatchItem[], dpi: number, onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; blockedImages: number }> {
  if (items.length === 0) throw new Error("Nothing to render");
  const blocked = new Set<string>();
  let pdf: jsPDF | null = null;
  for (let i = 0; i < items.length; i += 1) {
    const canvas = await certificateCanvas(items[i].design, items[i].values, items[i].code, dpi, { blocked });
    const page = items[i].design.document.pages[0];
    const orientation = page.width > page.height ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: [page.width, page.height], orientation, compress: true });
    else pdf.addPage([page.width, page.height], orientation);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, page.width, page.height, undefined, "FAST");
    onProgress?.(i + 1, items.length);
    // Let the page breathe between certificates.
    await new Promise((r) => setTimeout(r, 0));
  }
  return { blob: pdf!.output("blob"), blockedImages: blocked.size };
}

/** One certificate as a print-quality PDF (300 DPI). */
export function certificatePdf(design: CertificateDesign, values: CertificateValues, code: string, dpi = 300): Promise<{ blob: Blob; blockedImages: number }> {
  return renderPdf([{ design, values, code }], dpi);
}

/** Many certificates in one PDF. 200 DPI keeps a batch of hundreds downloadable. */
export function batchPdf(items: BatchItem[], onProgress?: (done: number, total: number) => void, dpi = 200): Promise<{ blob: Blob; blockedImages: number }> {
  return renderPdf(items, dpi, onProgress);
}

const thumbCache = new Map<string, string>();
/** Thumbnails are drawn one at a time so a gallery doesn't stall the page. */
let thumbQueue: Promise<unknown> = Promise.resolve();

/** A small picture of a design, drawn by the real renderer. */
export function thumbnail(design: CertificateDesign, values: CertificateValues, key: string, dpi = 56): Promise<string> {
  const cached = thumbCache.get(key);
  if (cached) return Promise.resolve(cached);
  const job = thumbQueue.then(() => drawThumbnail(design, values, key, dpi));
  thumbQueue = job.catch(() => undefined);
  return job;
}

export const cachedThumbnail = (key: string): string | undefined => thumbCache.get(key);

async function drawThumbnail(design: CertificateDesign, values: CertificateValues, key: string, dpi: number): Promise<string> {
  const cached = thumbCache.get(key);
  if (cached) return cached;
  const canvas = await certificateCanvas(design, values, null, dpi);
  let url = "";
  try { url = canvas.toDataURL("image/jpeg", 0.85); } catch { url = ""; }
  if (url) thumbCache.set(key, url);
  return url;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const safeFileName = (s: string): string => s.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 80) || "certificate";
