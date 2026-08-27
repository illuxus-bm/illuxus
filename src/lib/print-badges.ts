import QRCode from "qrcode";
import { badgeSizeMm, bgTransformToCss, frontBgStyleToCss, fontsUsedInDesign, googleFontsUrl, type BadgeDesign, type NameDesignId, NAME_DESIGNS } from "./badge-design";

export type BadgeData = {
  name: string;
  email?: string | null;
  company?: string | null;
  /** Designation / job title displayed under the name. */
  title?: string | null;
  ticket_type?: string | null;
  qr_payload: string;
  /** Event banner image URL. Rendered at the top of the default badge. */
  banner_url?: string | null;
  event_title?: string;
  /** Organizer / organization name shown as a small uppercase tag. */
  org_name?: string | null;
  /** Pre-formatted event date/time string (e.g. "Sat, Jul 4 · 1:23 AM GMT+5:30"). */
  event_date_text?: string | null;
  /** Pre-formatted venue/location string. */
  event_location_text?: string | null;
};

export type PrintSize =
  | "a6"
  | "a4-2up"
  | "avery-3x8"
  | "thermal-50"
  | "thermal-58"
  | "thermal-80"
  | "thermal-100"
  | "thermal-4x6"
  | "custom";
export type PrintMode = "badge" | "name";
export type PrintUnit = "in" | "cm" | "mm";

export type PrintOptions = {
  mode?: PrintMode;
  size?: PrintSize;
  copies?: number;
  eventTitle?: string;
  custom?: { width: number; height: number; unit: PrintUnit };
  design?: BadgeDesign;
  /** When true, strip background images/colours so a black-and-white thermal printer renders cleanly. */
  thermalMode?: boolean;
  /**
   * Thermal print head resolution in dots-per-inch. Common values are
   * 203 (8 dots/mm — most affordable 4×6 label printers including the
   * helett H30C, Dymo LabelWriter, Zebra ZP450) and 300 (11.8 dots/mm —
   * higher-end Zebra ZD421, TSC TX300).
   *
   * When set, QR codes are generated at the EXACT pixel count the print
   * head needs — `mm × dpi / 25.4` pixels per side — so the printer
   * renders each dot 1-to-1 instead of the browser resampling from a
   * fixed 320px source down to whatever the head requires. Resampling
   * causes visible aliasing on the QR modules that some scanners
   * refuse to read; matching the head resolution eliminates it.
   *
   * Only applied when `thermalMode` is also true (or the size is one of
   * the thermal-* presets). Default: not set — QR falls back to the
   * previous fixed 320px generation.
   */
  thermalDpi?: 203 | 300;
  /** Name-only design variant to apply when mode === "name". */
  nameDesign?: NameDesignId;
  /** Custom font style applied to name-only labels. Overrides the preset typography. */
  font?: {
    family?: string;
    sizePt?: number;
    companySizePt?: number;  // separate size for the company/subtitle line
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    align?: "left" | "center" | "right" | "justify";
    wordSpacingPt?: number;
    scalePct?: number;
    color?: string;
  };
};

const SHEET_CSS: Record<Exclude<PrintSize, "custom">, { page: string; cols: number; gap: string; pad: string }> = {
  "a6":          { page: "@page { size: A6 landscape; margin: 4mm }", cols: 1, gap: "0",   pad: "0" },
  // Two landscape badges stacked on a portrait A4. The badge itself is
  // 186×134mm, so a single column fits the 190mm usable width.
  "a4-2up":      { page: "@page { size: A4 portrait; margin: 10mm }", cols: 1, gap: "6mm", pad: "0" },
  "avery-3x8":   { page: "@page { size: A4; margin: 8mm }",           cols: 3, gap: "3mm", pad: "0" },
  // Thermal printer roll sizes — one badge per page, edge-to-edge.
  // Margin is 0 because thermal printers don't have side margins; any
  // CSS margin shifts the print off the label.
  "thermal-50":  { page: "@page { size: 50mm 80mm; margin: 0 }",        cols: 1, gap: "0",   pad: "0" },
  "thermal-58":  { page: "@page { size: 58mm 80mm; margin: 0 }",        cols: 1, gap: "0",   pad: "0" },
  "thermal-80":  { page: "@page { size: 80mm 100mm; margin: 0 }",       cols: 1, gap: "0",   pad: "0" },
  "thermal-100": { page: "@page { size: 100mm 150mm; margin: 0 }",      cols: 1, gap: "0",   pad: "0" },
  // 4×6 inch label — matches helett H30C Lite, Dymo 4XL, Zebra ZP450 and
  // other common USB direct-thermal shipping/badge label printers.
  "thermal-4x6": { page: "@page { size: 101.6mm 152.4mm; margin: 0 }", cols: 1, gap: "0",   pad: "0" },
};

function fmtSize(w: number, h: number) { return `${w.toFixed(2)}mm ${h.toFixed(2)}mm`; }

/**
 * Compute the ideal QR-code source pixel dimension for a target mm size.
 *
 * Thermal print heads render one physical dot per source pixel when the
 * source resolution exactly matches the head DPI (203 or 300); anything
 * else forces the browser (or driver) to resample, which introduces
 * anti-aliased edges on the QR's black/white modules that some
 * lower-tolerance scanners refuse to decode. Returning the exact head-
 * resolution pixel count for the requested mm size keeps every module
 * a clean 1×N or N×N dot rectangle.
 *
 * Falls back to a fixed 320px source when `thermalDpi` is unset —
 * matches the previous hardcoded behavior, so laser and inkjet paths
 * are unchanged.
 */
function qrPixelSizeForMm(mm: number, thermalDpi: number | undefined): number {
  if (!thermalDpi) return 320;
  // pixels = mm × (dots/inch) / (mm/inch) = mm × dpi / 25.4
  const px = Math.round(mm * (thermalDpi / 25.4));
  // Never emit less than 120 px — a QR smaller than that on a slow-
  // scanning phone camera is unreliable regardless of dot-perfect
  // alignment.
  return Math.max(120, px);
}

/**
 * Build the complete print HTML for the given badges and options.
 * Exported so the dialog can render it in an iframe for live preview.
 */
export async function buildPrintHtml(badges: BadgeData[], opts: PrintOptions = {}): Promise<string> {
  const mode = opts.mode ?? "badge";
  const size = opts.size ?? "a4-2up";
  const copies = Math.max(1, Math.min(10, opts.copies ?? 1));
  const eventTitle = opts.eventTitle ?? "";
  const dims = badgeSizeMm(size, opts.custom);
  const isThermal = size === "thermal-50" || size === "thermal-58" || size === "thermal-80" || size === "thermal-100" || size === "thermal-4x6";
  const thermalMode = !!opts.thermalMode || isThermal || size === "custom";
  // Custom sizes are always treated as full-bleed (edge-to-edge, zero margin)
  // because they target thermal/label printers that have no printable margin.
  // Named thermal sizes already set fullBleed; custom inherits the same rule.
  const fullBleed = isThermal || size === "custom" || !!(mode === "badge" && opts.design?.fullBleed);
  // Only pass the print-head DPI through when we're actually targeting
  // a thermal printer. On laser / inkjet paths, keep the historical
  // 320-px QR source so nothing regresses.
  const thermalDpi = thermalMode ? opts.thermalDpi : undefined;

  const expanded: BadgeData[] = [];
  for (const b of badges) for (let i = 0; i < copies; i++) expanded.push(b);

  const isDesigned = mode === "badge" && opts.design && (opts.design.frontBg || hasAnyEnabled(opts.design));

  const cards = await Promise.all(
    expanded.map(async (b) => {
      if (isDesigned) return await renderDesigned(b, opts.design!, dims, fullBleed, thermalDpi);
      if (mode === "name") return renderName(b, dims, eventTitle, opts.nameDesign, opts.font);
      return await renderDefaultBadge(b, dims, eventTitle, opts.font, thermalDpi);
    })
  );

  let pageCss: string;
  let sheetCss: string;
  if (fullBleed) {
    pageCss = `@page { size: ${fmtSize(dims.w, dims.h)}; margin: 0 }`;
    sheetCss = `display:block`;
  } else {
    const cfg = SHEET_CSS[(size === "custom" ? "a4-2up" : size) as Exclude<PrintSize, "custom">];
    pageCss = cfg.page;
    sheetCss = `display:grid;grid-template-columns:repeat(${cfg.cols},${dims.w}mm);gap:${cfg.gap};justify-content:center;padding:${cfg.pad}`;
  }

  const usedFonts = mode === "badge" && opts.design ? fontsUsedInDesign(opts.design) : [];
  if (opts.font?.family) usedFonts.push(opts.font.family);
  const fontsLink = googleFontsUrl([...new Set(usedFonts)]);

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Print ${mode === "name" ? "Names" : "Badges"}</title>
  ${fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : ""}
  <style>
    ${pageCss}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Poppins,system-ui,sans-serif}
    .sheet{${sheetCss}}
    .card{
      width:${dims.w}mm;height:${dims.h}mm;position:relative;overflow:hidden;background:#fff;
      border:none;
      page-break-inside:avoid;break-inside:avoid;
      /* Force background colors + images to actually print. Chromium
       * inherits this from body, but Firefox and Safari require it
       * declared on every printable block (Safari's WebKit engine
       * ignores inheritance for print-color-adjust). Without this,
       * cards with a colored background print as white on those
       * browsers, which is one of the reported "formatting doesn't
       * work" symptoms on thermal printers. */
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    }
    /* Force one label per page in full-bleed (thermal / custom) mode.
     * Without an explicit page break, some drivers try to squeeze two
     * consecutive labels onto one sheet whenever there is any sub-mm
     * rounding gap between the CSS card size and the physical label
     * size, silently overlapping badges. The break-after rule on
     * every card except the last one keeps each badge on its own
     * label. */
    ${fullBleed ? `.card:not(:last-child){page-break-after:always;break-after:page}` : ""}
    .card.page-break{page-break-before:always;break-before:page}
    .card .bg{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
    .card .el{position:absolute;transform:translate(-50%,-50%);text-align:center;line-height:1.1}
    .card .el.name{font-weight:700}
    .card .el img{display:block}
    .card.basic{display:flex;flex-direction:column;align-items:stretch;text-align:center;color:#0f172a}
    .card.basic .banner{width:100%;background-size:cover;background-position:center;background-repeat:no-repeat;flex-shrink:0}
    .card.basic .banner.placeholder{background:linear-gradient(135deg,#0f172a 0%,#312e81 60%,#581c87 100%);display:flex;align-items:center;justify-content:center;color:#fff;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
    .card.basic .body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:0}
    .card.basic .org{letter-spacing:.16em;text-transform:uppercase;color:#64748b;font-weight:600}
    .card.basic .event{font-weight:700;color:#0f172a;line-height:1.15;word-break:break-word}
    .card.basic .meta{color:#475569;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.5em;line-height:1.2}
    .card.basic .meta .dot{opacity:.45}
    .card.basic .divider{width:60%;height:1px;background:#e2e8f0;margin:auto 0}
    .card.basic .name{font-weight:800;color:#0f172a;line-height:1.1;word-break:break-word;letter-spacing:-0.01em}
    .card.basic .qr-wrap{background:#fff;border-radius:2mm;display:inline-flex;align-items:center;justify-content:center;padding:1.5mm}
    .card.basic .qr-wrap img{display:block;width:100%;height:100%}
    .card.name-only{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6mm;text-align:center}
    .card.name-only .name{font-size:26pt;font-weight:700;line-height:1.05}
    .card.name-only .company{font-size:14pt;color:#444;margin-top:3mm}
    ${thermalMode ? `
      .card { border: none !important; border-radius: 0 !important; background: #fff !important; }
      .card .bg, .card.basic .banner { display: none !important; }
      .card.basic .banner.placeholder { background: #000 !important; color: #fff !important; display: flex !important; }
      .card.basic .org, .card.basic .event, .card.basic .name { color: #000 !important; }
      .card.basic .meta { color: #000 !important; }
      .card.basic .divider { background: #000 !important; height: 2px !important; }
      .card.basic .qr-wrap { border-radius: 0 !important; }
      .card .el.name, .card .el.company { color: #000 !important; text-shadow: none !important; }
    ` : ""}
  </style></head>
  <body><div class="sheet">${cards.join("")}</div></body></html>`;
}

/**
 * Builds a printable calibration sheet: a filled black outer frame the
 * exact size of the configured label, a 50mm horizontal ruler with 10mm
 * ticks, a 25mm × 25mm reference QR, and font-size samples at 8pt /
 * 12pt / 20pt.
 *
 * Use case: the organizer can print this once with their thermal
 * printer, measure the physical output with a ruler, and instantly
 * know whether the printer is:
 *  - Truthfully outputting the requested label size (frame is exactly
 *    the label dimensions — if it prints as e.g. 95mm on a 100mm label,
 *    the driver is scaling to ~95%; set browser print scale to 105.3%
 *    to compensate).
 *  - Missing content on any side (the frame's outer edge should touch
 *    all 4 physical label edges — if there's white space, the printer
 *    has a hardware margin the driver isn't accounting for).
 *  - Rendering the QR sharp enough to scan (the 25mm QR encodes the
 *    literal string "CALIBRATION"; if a scanner reads it, the DPI
 *    settings are OK).
 *
 * Called by `printCalibration()` below.
 */
export async function buildCalibrationHtml(opts: {
  size: PrintSize;
  custom?: { width: number; height: number; unit: PrintUnit };
  thermalDpi?: 203 | 300;
} = { size: "thermal-4x6" }): Promise<string> {
  const dims = badgeSizeMm(opts.size, opts.custom);
  const thermalDpi = opts.thermalDpi;
  const isThermal =
    opts.size === "thermal-50" || opts.size === "thermal-58" ||
    opts.size === "thermal-80" || opts.size === "thermal-100" ||
    opts.size === "thermal-4x6" || opts.size === "custom";
  const pageCss = isThermal
    ? `@page { size: ${dims.w.toFixed(2)}mm ${dims.h.toFixed(2)}mm; margin: 0 }`
    : "@page { size: A4 portrait; margin: 10mm }";

  // 50mm horizontal ruler with 10mm ticks + labels.
  const rulerTicks: string[] = [];
  for (let mm = 0; mm <= 50; mm += 10) {
    const isEnd = mm === 0 || mm === 50;
    rulerTicks.push(
      `<div style="position:absolute;left:${mm}mm;top:0;width:0.3mm;height:${isEnd ? 4 : 2.5}mm;background:#000"></div>`
    );
    rulerTicks.push(
      `<div style="position:absolute;left:${mm}mm;top:4.5mm;transform:translateX(-50%);font-size:6pt;color:#000">${mm}</div>`
    );
  }

  // QR at exactly 25mm × 25mm — sized at head DPI when known so the
  // rendered dot pitch is 1:1 with the printer.
  const qrPx = thermalDpi ? qrPixelSizeForMm(25, thermalDpi) : 200;
  const qr = await QRCode.toDataURL("CALIBRATION", { width: qrPx, margin: 1 });

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Print calibration</title>
<style>
  ${pageCss}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .frame{
    position:relative;
    width:${dims.w}mm;height:${dims.h}mm;
    border:0.5mm solid #000;
    overflow:hidden;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  .frame::before,.frame::after{content:"";position:absolute;background:#000}
  /* Corner marks — 3mm inward on each side so the user can spot any
   * hardware-margin trim (if the corner marks are cut off, the
   * printer has a physical safe-zone). */
  .cmark{position:absolute;width:3mm;height:0.3mm;background:#000}
  .cmark-v{position:absolute;width:0.3mm;height:3mm;background:#000}
</style></head>
<body>
<div class="frame">
  <!-- corner marks -->
  <div class="cmark" style="left:0;top:0"></div>
  <div class="cmark-v" style="left:0;top:0"></div>
  <div class="cmark" style="right:0;top:0"></div>
  <div class="cmark-v" style="right:0;top:0"></div>
  <div class="cmark" style="left:0;bottom:0"></div>
  <div class="cmark-v" style="left:0;bottom:0"></div>
  <div class="cmark" style="right:0;bottom:0"></div>
  <div class="cmark-v" style="right:0;bottom:0"></div>

  <!-- title -->
  <div style="position:absolute;left:4mm;top:4mm;font-size:10pt;font-weight:700">Print calibration</div>
  <div style="position:absolute;left:4mm;top:9mm;font-size:7pt">
    Requested: ${dims.w.toFixed(1)} × ${dims.h.toFixed(1)} mm${thermalDpi ? ` · QR at ${thermalDpi} DPI` : ""}
  </div>
  <div style="position:absolute;left:4mm;top:13mm;font-size:7pt;color:#444">
    Measure the outer frame — the two sides should be exactly the requested dimensions.
  </div>

  <!-- 50mm horizontal ruler -->
  <div style="position:absolute;left:4mm;top:22mm;width:50mm;height:8mm">
    <div style="position:absolute;left:0;top:0;width:50mm;height:0.3mm;background:#000"></div>
    ${rulerTicks.join("")}
    <div style="position:absolute;left:0;top:9mm;font-size:6.5pt;font-weight:600;color:#000">50 mm ruler (each tick = 10 mm)</div>
  </div>

  <!-- font-size samples -->
  <div style="position:absolute;left:4mm;top:40mm;font-size:8pt">Sample text at 8 pt — this should be readable but small.</div>
  <div style="position:absolute;left:4mm;top:48mm;font-size:12pt">Sample text at 12 pt — comfortable body copy.</div>
  <div style="position:absolute;left:4mm;top:58mm;font-size:20pt;font-weight:700">20 pt heading</div>

  <!-- 25mm QR -->
  <div style="position:absolute;left:4mm;top:74mm;width:25mm;height:25mm">
    <img src="${qr}" style="width:25mm;height:25mm;display:block" alt="Calibration QR" />
    <div style="position:absolute;left:27mm;top:2mm;font-size:7pt;width:${Math.max(20, dims.w - 34)}mm">
      <strong>QR test</strong> — 25 × 25 mm, encodes "CALIBRATION". A scanner should
      decode this instantly. If not, lower the DPI or check the label
      surface / ribbon.
    </div>
  </div>
</div>
</body></html>`;
}

/**
 * Opens a print dialog for the calibration sheet. Wraps the same
 * popup-and-print pipeline `printBadges` uses so any pop-up-blocked
 * error surfaces identically.
 */
export async function printCalibration(opts: Parameters<typeof buildCalibrationHtml>[0] = { size: "thermal-4x6" }) {
  const html = await buildCalibrationHtml(opts);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) throw new Error("popup-blocked");
  w.document.open();
  w.document.write(html.replace("</body>", `
  <script>
    (function(){
      window.addEventListener('load', function(){
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function(){
          setTimeout(function(){ window.focus(); window.print(); }, 200);
        });
      });
    })();
  </script>
  </body>`));
  w.document.close();
}

export async function printBadges(badges: BadgeData[], opts: PrintOptions = {}) {
  const html = await buildPrintHtml(badges, opts);
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) throw new Error("popup-blocked");
  w.document.open();
  w.document.write(html.replace("</body>", `
  <script>
    (function(){
      function waitForImages(){
        var imgs = Array.from(document.images);
        return Promise.all(imgs.map(function(img){
          if(img.complete && img.naturalWidth>0) return Promise.resolve();
          return new Promise(function(res){ img.onload=res; img.onerror=res; });
        }));
      }
      function waitForFonts(){
        return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      }
      window.addEventListener('load', function(){
        Promise.all([waitForImages(), waitForFonts()]).then(function(){
          setTimeout(function(){ window.focus(); window.print(); }, 200);
        });
      });
    })();
  </script>
  </body>`));
  w.document.close();
}

function hasAnyEnabled(d: BadgeDesign) {
  return Object.values(d.elements).some((e) => e?.enabled);
}

async function renderDesigned(
  b: BadgeData,
  d: BadgeDesign,
  dims: { w: number; h: number },
  fullBleed: boolean,
  thermalDpi: number | undefined
): Promise<string> {
  void dims;
  const front = await renderDesignedFace(b, d, true, false, thermalDpi);
  if (d.back === "none") return front;
  const backHtml = d.back === "same"
    ? await renderDesignedFace(b, d, true, true, thermalDpi)
    : renderStaticBack(d);
  return front + backHtml;  function renderStaticBack(des: BadgeDesign) {
    const bg = des.backBg
      ? `<div class="bg" style="background-image:url('${des.backBg}');${cssBgStyle(des.backBgTransform)}"></div>`
      : "";
    return `<div class="card${fullBleed ? " page-break" : ""}">${bg}</div>`;
  }
}

async function renderDesignedFace(
  b: BadgeData,
  d: BadgeDesign,
  _isFront: boolean,
  asBack = false,
  thermalDpi?: number
): Promise<string> {
  const e = d.elements;
  let bgEl = "";
  if (d.frontBg) {
    bgEl = `<div class="bg" style="background-image:url('${d.frontBg}');${cssBgStyle(d.frontBgTransform)}"></div>`;
  } else {
    const bgCss = frontBgStyleToCss(d.frontBgStyle);
    if (bgCss) {
      const prop = d.frontBgStyle?.type === "solid" ? "background-color" : "background";
      bgEl = `<div class="bg" style="${prop}:${bgCss};background-size:cover"></div>`;
    }
  }
  const els: string[] = [];

  // Helper: derive the visible text for a given element key + badge data
  const valueFor = (k: keyof typeof e): string | null => {
    const el = e[k];
    if (!el || !el.enabled) return null;
    switch (k) {
      case "name":       return b.name;
      case "company":    return (b.company || "").trim() || null;
      case "email":      return (b.email || "").trim() || null;
      case "title":      return (b.title || "").trim() || null;
      case "ticket":     return el.staticText?.trim() || (b.ticket_type || "").trim() || null;
      case "eventTitle": return (b.event_title || "").trim() || null;
      case "eventDate":  return (b.event_date_text || "").trim() || null;
      case "orgName":    return (b.org_name || "").trim() || null;
      case "customText": return el.staticText?.trim() || null;
      default:           return null;
    }
  };

  // Render every text element with its font styling
  const textKeys: (keyof typeof e)[] = ["orgName", "eventTitle", "eventDate", "ticket", "name", "title", "company", "email", "customText"];
  for (const k of textKeys) {
    const el = e[k];
    if (!el?.enabled) continue;
    const text = valueFor(k);
    if (!text) continue;
    els.push(renderTextElement(el, text));
  }

  // QR last so it sits on top. Source pixel size matches the thermal
  // head DPI when configured (see `qrPixelSizeForMm`) so the printer
  // renders modules dot-for-dot without downsampling artifacts that
  // some scanners refuse to decode.
  if (e.qr?.enabled) {
    const qrPx = qrPixelSizeForMm(e.qr.size, thermalDpi);
    const qr = await QRCode.toDataURL(b.qr_payload, { width: qrPx, margin: 1 });
    els.push(`<div class="el qr" style="left:${e.qr.x}%;top:${e.qr.y}%"><img src="${qr}" style="width:${e.qr.size}mm;height:${e.qr.size}mm" alt="QR" /></div>`);
  }
  const pageBreak = asBack && d.fullBleed ? " page-break" : "";
  return `<div class="card${pageBreak}">${bgEl}${els.join("")}</div>`;
}

/** Serialize one text element placement into a positioned <div> with inline font styling. */
function renderTextElement(el: import("./badge-design").ElementPlacement, text: string): string {
  const fontFamily = el.fontFamily ? `${el.fontFamily}, system-ui, sans-serif` : "system-ui, sans-serif";
  const weight = el.fontWeight ?? 400;
  const italic = el.italic ? "italic" : "normal";
  const align = el.align ?? "center";
  const transformMap: Record<string, string> = { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "none" };
  const transform = transformMap[el.transform ?? "none"] || "none";
  const letter = (el.letterSpacing ?? 0).toFixed(3) + "em";
  const lh = el.lineHeight ?? 1.1;
  const style = [
    `left:${el.x}%`,
    `top:${el.y}%`,
    `font-size:${el.size}pt`,
    `color:${el.color}`,
    `font-family:${fontFamily}`,
    `font-weight:${weight}`,
    `font-style:${italic}`,
    `text-align:${align}`,
    `text-transform:${transform}`,
    `letter-spacing:${letter}`,
    `line-height:${lh}`,
  ].join(";");
  return `<div class="el text" style="${style}">${escapeHtml(text)}</div>`;
}

/** Serialize a `BgTransform` into inline CSS for the print sheet's `.bg` div. */
function cssBgStyle(t: Parameters<typeof bgTransformToCss>[0]): string {
  const css = bgTransformToCss(t);
  const parts = [
    `background-size:${css.backgroundSize}`,
    `background-position:${css.backgroundPosition}`,
    `background-repeat:${css.backgroundRepeat}`,
  ];
  if (css.backgroundColor) parts.push(`background-color:${css.backgroundColor}`);
  return parts.join(";");
}

function renderName(b: BadgeData, _dims: { w: number; h: number }, eventTitle: string, nameDesignId?: NameDesignId, fontOverride?: PrintOptions["font"]): string {
  const company = (b.company || "").trim();
  const nd = NAME_DESIGNS.find((d) => d.id === nameDesignId) ?? NAME_DESIGNS[0];

  const fontSizeMultiplier = nd.fontSize === "3xl" ? 1.8 : nd.fontSize === "2xl" ? 1.4 : 1.0;
  const basePt = fontOverride?.sizePt ?? Math.round(18 * fontSizeMultiplier);
  const namePt = basePt;
  // companySizePt can be set independently; falls back to 55% of namePt
  const companyPt = fontOverride?.companySizePt ?? Math.round(namePt * 0.55);
  const eventPt = Math.round(namePt * 0.4);

  // Font override takes precedence over the preset's typography
  const fontFamily = fontOverride?.family ?? nd.fontFamily;
  const fontWeight = fontOverride?.bold ? 700 : nd.fontWeight;
  const fontItalic = fontOverride?.italic ?? false;
  const fontColor  = fontOverride?.color ?? "#111111";
  const companyColor = fontOverride?.color ? fontColor : "#444444";
  const textAlign  = fontOverride?.align === "left" ? "left"
                   : fontOverride?.align === "right" ? "right"
                   : nd.layout === "left-aligned" ? "left"
                   : "center";
  const wordSpacing = fontOverride?.wordSpacingPt ? `word-spacing:${fontOverride.wordSpacingPt}pt;` : "";
  const scale      = fontOverride?.scalePct && fontOverride.scalePct !== 100
                   ? `transform:scaleX(${fontOverride.scalePct / 100});transform-origin:${textAlign};`
                   : "";
  const textDecor  = [
    fontOverride?.underline ? "underline" : "",
    fontOverride?.strikethrough ? "line-through" : "",
  ].filter(Boolean).join(" ");
  const decor      = textDecor ? `text-decoration:${textDecor};` : "";

  const fontStyle = `font-family:${fontFamily},system-ui,sans-serif;font-weight:${fontWeight};font-style:${fontItalic ? "italic" : "normal"};${decor}${wordSpacing}${scale}`;
  const nameTransform = nd.id === "bold" ? "text-transform:uppercase;" : "";
  const accentBand = nd.id === "event-card" || nd.id === "ticket-stub"
    ? `<div style="background:${nd.accentColor};padding:2mm 4mm;margin-bottom:3mm;color:#fff;font-size:${eventPt}pt;${fontStyle}letter-spacing:.12em;text-transform:uppercase;text-align:${textAlign}">${escapeHtml(eventTitle || b.event_title || "EVENT")}</div>`
    : "";

  // Borders suppressed — user requested no border on prints.
  const borderCss = "none";

  if (nd.id === "monogram") {
    const initial = (b.name || "?")[0].toUpperCase();
    return `
      <div class="card name-only" style="text-align:left;padding:5mm;flex-direction:row;align-items:center;gap:4mm;border:${borderCss}">
        <div style="font-size:${namePt * 1.6}pt;${fontStyle}color:${nd.accentColor};line-height:1;flex-shrink:0">${escapeHtml(initial)}</div>
        <div>
          <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111">${escapeHtml(b.name)}</div>
          ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:${companyColor};margin-top:2mm">${escapeHtml(company)}</div>` : ""}
        </div>
      </div>
    `;
  }

  if (nd.id === "ticket-stub") {
    return `
      <div class="card name-only" style="padding:4mm;gap:2mm;border:${borderCss}">
        ${accentBand}
        <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111;text-align:${textAlign}">${escapeHtml(b.name)}</div>
        ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:#555;text-align:${textAlign}">${escapeHtml(company)}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="card name-only" style="border:${borderCss}">
      ${accentBand}
      ${nd.showEvent && (eventTitle || b.event_title) && nd.id !== "event-card" ? `<div style="font-size:${eventPt}pt;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:3mm;text-align:${textAlign}">${escapeHtml(eventTitle || b.event_title || "")}</div>` : ""}
      <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111;text-align:${textAlign}">${escapeHtml(b.name)}</div>
      ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:#444;margin-top:3mm;text-align:${textAlign}">${escapeHtml(company)}</div>` : ""}
    </div>
  `;
}

async function renderDefaultBadge(
  b: BadgeData,
  dims: { w: number; h: number },
  eventTitle: string,
  fontOverride?: PrintOptions["font"],
  thermalDpi?: number,
): Promise<string> {
  // Compute layout sizes proportional to the badge dimensions so the same
  // template scales cleanly from a 63×34mm Avery cell up to A6 / A4-2up.
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const padMm = clamp(2.5, dims.w * 0.05, 6);
  const bannerHeightMm = clamp(14, dims.h * 0.36, 60);
  const qrMm = clamp(14, Math.min(dims.w * 0.42, dims.h * 0.34), 36);
  const orgPt = clamp(5, dims.h * 0.045, 10);
  const eventPt = clamp(8, dims.h * 0.095, 16);
  const metaPt = clamp(5, dims.h * 0.04, 9);
  // Base name size derived from badge height, allowing the user's chosen
  // font.sizePt (default 22 in FontStylePanel) to scale it proportionally.
  // sizePt = 22 → no change; 44 → double; 11 → half.
  const baseNamePt = clamp(11, dims.h * 0.14, 26);
  const namePt = fontOverride?.sizePt
    ? clamp(8, baseNamePt * (fontOverride.sizePt / 22), 48)
    : baseNamePt;
  const gapMm = clamp(0.8, dims.h * 0.015, 2.5);

  // On a thermal printer with a known DPI, generate the QR at exactly
  // the print-head resolution so modules land dot-for-dot without
  // resampling. On laser / inkjet paths (`thermalDpi` unset), keep the
  // previous derived target so the visual quality is unchanged.
  const qrPxTarget = thermalDpi
    ? qrPixelSizeForMm(qrMm, thermalDpi)
    : Math.max(160, Math.round(qrMm * 12));
  const qr = await QRCode.toDataURL(b.qr_payload, { width: qrPxTarget, margin: 1 });

  const title = (eventTitle || b.event_title || "").trim();
  const org = (b.org_name || "").trim();
  const dateText = (b.event_date_text || "").trim();
  const locText = (b.event_location_text || "").trim();
  const banner = (b.banner_url || "").trim();

  // Placeholder text for the gradient banner falls back to the event title.
  const placeholderText = title || "EVENT";
  const placeholderFontPt = clamp(7, bannerHeightMm * 0.18, 12);

  const bannerEl = banner
    ? `<div class="banner" style="height:${bannerHeightMm}mm;background-image:url('${banner}')"></div>`
    : `<div class="banner placeholder" style="height:${bannerHeightMm}mm;font-size:${placeholderFontPt}pt;padding:0 ${padMm}mm">${escapeHtml(placeholderText)}</div>`;

  const metaParts: string[] = [];
  if (dateText) metaParts.push(`<span>${escapeHtml(dateText)}</span>`);
  if (locText)  metaParts.push(`<span>${escapeHtml(locText)}</span>`);
  const metaEl = metaParts.length
    ? `<div class="meta" style="font-size:${metaPt}pt;margin-top:${gapMm}mm">${metaParts.join(`<span class="dot">·</span>`)}</div>`
    : "";

  // Resolve the FontStylePanel choices into inline CSS applied to the name.
  // Defaults match the global Poppins so unchanged settings produce the same
  // output as before.
  const family    = fontOverride?.family || "Poppins";
  const fontColor = fontOverride?.color  || "#0f172a";
  const align     = fontOverride?.align  || "center";
  const weight    = fontOverride?.bold   ? 800 : 700;
  const italic    = fontOverride?.italic ? "italic" : "normal";
  const decor     = [
    fontOverride?.underline     ? "underline"    : "",
    fontOverride?.strikethrough ? "line-through" : "",
  ].filter(Boolean).join(" ");
  const wordSpacing = fontOverride?.wordSpacingPt ? `word-spacing:${fontOverride.wordSpacingPt}pt;` : "";
  const scale       = fontOverride?.scalePct && fontOverride.scalePct !== 100
                    ? `transform:scaleX(${fontOverride.scalePct / 100});transform-origin:${align};`
                    : "";
  const nameStyle = [
    `font-size:${namePt}pt`,
    `font-family:'${family}',Poppins,system-ui,sans-serif`,
    `font-weight:${weight}`,
    `font-style:${italic}`,
    decor ? `text-decoration:${decor}` : "",
    `color:${fontColor}`,
    `text-align:${align}`,
    wordSpacing,
    scale,
  ].filter(Boolean).join(";");

  // Body alignment follows the user's text-align choice so name + meta + QR
  // visually anchor consistently (left / center / right / justify→left).
  const bodyAlign = align === "justify" ? "left" : align;
  const itemsAlign = bodyAlign === "left" ? "flex-start"
                  : bodyAlign === "right" ? "flex-end"
                  : "center";

  return `
    <div class="card basic">
      ${bannerEl}
      <div class="body" style="padding:${padMm * 1.2}mm ${padMm}mm;gap:${gapMm}mm;align-items:${itemsAlign};text-align:${bodyAlign}">
        ${org ? `<div class="org" style="font-size:${orgPt}pt">${escapeHtml(org)}</div>` : ""}
        ${title ? `<div class="event" style="font-size:${eventPt}pt;margin-top:${gapMm * 0.6}mm">${escapeHtml(title)}</div>` : ""}
        ${metaEl}
        <div class="divider" style="margin:${gapMm * 1.4}mm 0"></div>
        <div class="name" style="${nameStyle}">${escapeHtml(b.name)}</div>
        <div class="qr-wrap" style="width:${qrMm}mm;height:${qrMm}mm;margin-top:${gapMm * 1.2}mm">
          <img src="${qr}" alt="QR" />
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}