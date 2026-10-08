/**
 * Download badges as PDF or JPG.
 *
 * Each badge is rendered from the exact HTML the print path produces
 * (`buildPrintHtml`), so a download looks the same as a print. The card is
 * drawn into a canvas through an SVG `<foreignObject>`; for the browser to
 * allow that, every external resource the card uses (banner image, design
 * backgrounds, web fonts) is first inlined as a data URL.
 */
import jsPDF from "jspdf";
import { zipSync } from "fflate";
import { buildPrintHtml, type BadgeData, type PrintOptions } from "./print-badges";
import { badgeSizeMm } from "./badge-design";

export type BadgeExportFormat = "pdf" | "jpg";

/** Output resolution. 300 DPI is print quality for a badge-sized image. */
const EXPORT_DPI = 300;
const CSS_PX_PER_MM = 96 / 25.4;

const dataUrlCache = new Map<string, Promise<string | null>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Fetch a URL as a data URL (cached). Null when it can't be read, e.g. a
 *  host without CORS headers — the caller drops that resource. */
function fetchAsDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let p = dataUrlCache.get(url);
  if (!p) {
    p = fetch(url, { mode: "cors" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(blobToDataUrl)
      .catch(() => null);
    dataUrlCache.set(url, p);
  }
  return p;
}

const fontCssCache = new Map<string, Promise<string>>();

/** Download a Google Fonts stylesheet and inline every font file it uses. */
function inlineFontCss(href: string): Promise<string> {
  let p = fontCssCache.get(href);
  if (!p) {
    p = (async () => {
      try {
        const css = await (await fetch(href)).text();
        const urls = [...new Set([...css.matchAll(/url\((['"]?)(https:[^'")]+)\1\)/g)].map((m) => m[2]))];
        const inlined = await Promise.all(urls.map(fetchAsDataUrl));
        let out = css;
        urls.forEach((u, i) => {
          if (inlined[i]) out = out.split(u).join(inlined[i]!);
        });
        return out;
      } catch {
        return ""; // fall back to system fonts rather than failing the export
      }
    })();
    fontCssCache.set(href, p);
  }
  return p;
}

/** Replace `url('https://…')` references in an inline style with data URLs. */
async function inlineStyleUrls(style: string): Promise<string> {
  const urls = [...style.matchAll(/url\((['"]?)(https?:[^'")]+)\1\)/g)].map((m) => m[2]);
  let out = style;
  for (const u of urls) {
    const data = await fetchAsDataUrl(u);
    out = out.split(u).join(data ?? "");
  }
  return out;
}

/**
 * Render one badge's print HTML into one canvas per card (a design with a
 * back side produces two cards).
 */
async function renderBadgeCanvases(badge: BadgeData, opts: PrintOptions): Promise<HTMLCanvasElement[]> {
  const { html } = await buildPrintHtml([badge], { ...opts, copies: 1, previewFit: false });
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Inline images and background images so the SVG renderer can use them.
  await Promise.all(
    [...doc.querySelectorAll("img")].map(async (img) => {
      const src = img.getAttribute("src") || "";
      const data = await fetchAsDataUrl(src);
      if (data) img.setAttribute("src", data);
      else img.remove();
    }),
  );
  await Promise.all(
    [...doc.querySelectorAll<HTMLElement>("[style*='url(']")].map(async (el) => {
      el.setAttribute("style", await inlineStyleUrls(el.getAttribute("style") || ""));
    }),
  );

  const fontLink = doc.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  const fontCss = fontLink?.href ? await inlineFontCss(fontLink.getAttribute("href")!) : "";
  const pageCss = [...doc.querySelectorAll("style")].map((s) => s.textContent || "").join("\n");
  const css = escapeXmlText(`${fontCss}\n${pageCss}`);

  const cards = [...doc.querySelectorAll<HTMLElement>(".card")];
  const serializer = new XMLSerializer();
  const { w, h } = badgeSizeMm(opts.size ?? "thermal-4x5", opts.custom);
  const cssW = w * CSS_PX_PER_MM;
  const cssH = h * CSS_PX_PER_MM;
  const outW = Math.round((w / 25.4) * EXPORT_DPI);
  const outH = Math.round((h / 25.4) * EXPORT_DPI);

  const canvases: HTMLCanvasElement[] = [];
  for (const card of cards) {
    card.classList.remove("page-break");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${cssW} ${cssH}">` +
      `<foreignObject x="0" y="0" width="${cssW}" height="${cssH}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${cssW}px;height:${cssH}px;margin:0;background:#fff;color:#111;font-family:Poppins,system-ui,sans-serif">` +
      `<style>${css}</style>${serializer.serializeToString(card)}</div></foreignObject></svg>`;
    const img = new Image();
    img.decoding = "sync";
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    canvases.push(canvas);
  }
  return canvases;
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slug(s: string): string {
  return (
    s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "badge"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))), "image/jpeg", 0.92),
  );
}

/**
 * Render the badges and save them. One badge → `name-badge.pdf|jpg`;
 * several → one multi-page PDF, or a ZIP of JPGs. On the A4 sheet size the
 * PDF lays out four badges per A4 page, ready for an office printer.
 *
 * `onProgress(done, total)` is called after each badge is rendered.
 */
export async function downloadBadges(
  badges: BadgeData[],
  opts: PrintOptions,
  format: BadgeExportFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (badges.length === 0) return;
  const { w, h } = badgeSizeMm(opts.size ?? "thermal-4x5", opts.custom);
  const baseName = badges.length === 1 ? `${slug(badges[0].name)}-badge` : `${slug(badges[0].event_title || "event")}-badges`;

  if (format === "jpg") {
    const files: Record<string, Uint8Array> = {};
    const used = new Map<string, number>();
    for (let i = 0; i < badges.length; i++) {
      const canvases = await renderBadgeCanvases(badges[i], opts);
      for (let side = 0; side < canvases.length; side++) {
        const stem = `${slug(badges[i].name)}${canvases.length > 1 ? (side === 0 ? "-front" : "-back") : ""}`;
        const n = (used.get(stem) ?? 0) + 1;
        used.set(stem, n);
        const blob = await canvasToJpegBlob(canvases[side]);
        files[`${stem}${n > 1 ? `-${n}` : ""}.jpg`] = new Uint8Array(await blob.arrayBuffer());
        if (badges.length === 1 && canvases.length === 1) {
          downloadBlob(blob, `${baseName}.jpg`);
          onProgress?.(1, 1);
          return;
        }
      }
      onProgress?.(i + 1, badges.length);
    }
    const zip = zipSync(files, { level: 0 }); // JPEGs are already compressed
    downloadBlob(new Blob([zip], { type: "application/zip" }), `${baseName}-jpg.zip`);
    return;
  }

  // PDF
  const sheet = opts.size === "a4-4up";
  const pdf = sheet
    ? new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
    : new jsPDF({ unit: "mm", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
  let slot = 0;
  for (let i = 0; i < badges.length; i++) {
    const canvases = await renderBadgeCanvases(badges[i], opts);
    for (const canvas of canvases) {
      const data = canvas.toDataURL("image/jpeg", 0.92);
      if (sheet) {
        const pos = slot % 4;
        if (slot > 0 && pos === 0) pdf.addPage("a4", "portrait");
        pdf.addImage(data, "JPEG", (pos % 2) * w, Math.floor(pos / 2) * h, w, h);
      } else {
        if (slot > 0) pdf.addPage([w, h], w > h ? "landscape" : "portrait");
        pdf.addImage(data, "JPEG", 0, 0, w, h);
      }
      slot++;
    }
    onProgress?.(i + 1, badges.length);
  }
  pdf.save(`${baseName}.pdf`);
}
