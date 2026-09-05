import QRCode from "qrcode";
import { badgeSizeMm, bgTransformToCss, frontBgStyleToCss, fontsUsedInDesign, googleFontsUrl, type BadgeDesign, type NameDesignId, NAME_DESIGNS } from "./badge-design";
import {
  computeCenteringPadding,
  fitText,
  FLOOR_PT_BY_ROLE,
  MIN_PAD_MM,
  QR_MIN_MM,
  type FitResult,
  type FitWarning,
  type FontSpec,
  type Role,
} from "./fit-engine";

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
  /**
   * Per-printer hardware-margin compensation, in millimeters. Applied only
   * when `thermalMode` (or a `thermal-*` size preset) is active — laser /
   * inkjet paths ignore this field. Populated by the organizer after
   * printing the calibration sheet: `topMm` shifts the content DOWN by
   * that many mm; `leftMm` shifts it RIGHT. Persisted per browser under
   * `lovable.print-badges.v2` by `PrintBadgesDialog`.
   *
   * Requirement: bugfix.md 2.11.
   */
  thermalOffset?: { topMm: number; leftMm: number };
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
 *
 * Returns `{ html, warnings }`. `warnings` is empty on all short-fit
 * inputs; downstream renderer tasks push `FitWarning`s here when the
 * auto-fit engine had to shrink or hard-break a value (bugfix.md 2.4).
 */
export async function buildPrintHtml(
  badges: BadgeData[],
  opts: PrintOptions = {},
): Promise<{ html: string; warnings: FitWarning[] }> {
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

  // Collect fit warnings across every rendered card. Empty on short-fit
  // inputs; populated by `renderDefaultBadge` / `renderName` when the fit
  // engine had to shrink or hard-break a value (bugfix.md 2.4).
  const warnings: FitWarning[] = [];

  // Thermal-offset compensation is only applied on thermal / full-bleed
  // paths — laser / inkjet paths ignore the field entirely so their
  // preservation baseline is unaffected.
  const thermalOffset = thermalMode ? opts.thermalOffset : undefined;

  const cards = await Promise.all(
    expanded.map(async (b) => {
      if (isDesigned) return await renderDesigned(b, opts.design!, dims, fullBleed, thermalDpi, warnings);
      if (mode === "name") return renderName(b, dims, eventTitle, opts.nameDesign, opts.font, warnings);
      return await renderDefaultBadge(b, dims, eventTitle, opts.font, thermalDpi, thermalOffset, warnings);
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

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Print ${mode === "name" ? "Names" : "Badges"}</title>
  ${fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : ""}
  <style>
    ${pageCss}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:Poppins,system-ui,sans-serif}
    ${fullBleed ? `
    /* Center each label within the ACTUAL physical page the printer
     * feeds, not just the CSS @page box we requested. Many thermal /
     * label drivers silently substitute their own default page size
     * (or round the requested mm size) when the exact @page size
     * isn't a recognized preset — otherwise every label prints pinned
     * to the top-left corner of that larger substituted page, which is
     * the "off-center, uneven padding" symptom reported on thermal
     * name-tag / badge prints. Scoped to full-bleed (thermal/custom/
     * designed-full-bleed) mode only — multi-row sheet layouts
     * (Avery, A4-2up) keep their normal top-anchored grid flow since
     * centering a taller-than-one-page grid vertically would overflow
     * both above and below the first page and lose content.
     * html/body are sized to 100% so the flex centering below
     * resolves against whatever the printer's actual page turns out
     * to be, not just our requested @page box. */
    html,body{width:100%;height:100%}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh}
    ` : ""}
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

  return { html, warnings };
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
  const { html } = await buildPrintHtml(badges, opts);
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
  thermalDpi: number | undefined,
  warnings?: FitWarning[],
): Promise<string> {
  const front = await renderDesignedFace(b, d, true, dims, false, thermalDpi, warnings);
  if (d.back === "none") return front;
  const backHtml = d.back === "same"
    ? await renderDesignedFace(b, d, true, dims, true, thermalDpi, warnings)
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
  dims: { w: number; h: number },
  asBack = false,
  thermalDpi?: number,
  warnings?: FitWarning[],
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

  // Map a designer element key to a fit-engine Role. The role determines
  // the legibility floor via `FLOOR_PT_BY_ROLE` (bugfix.md 2.3).
  const roleFor = (k: keyof typeof e): Role => {
    switch (k) {
      case "name":       return "name";
      case "company":    return "company";
      case "email":      return "customText";
      case "title":      return "title";
      case "ticket":     return "ticket";
      case "eventTitle": return "event";
      case "eventDate":  return "eventDate";
      case "orgName":    return "org";
      case "customText": return "customText";
      default:           return "customText";
    }
  };

  // Safe area for the designer face. Elements are placed as
  // `translate(-50%, -50%)` around their `left:x%`/`top:y%` anchor, so
  // the width box an element gets is determined by which edge is nearer:
  // for a centered element (align:center) the box is
  // `2 × min(x, 100 - x)` percent of the safe width.
  const safeW = dims.w - 2 * MIN_PAD_MM;

  function maxWidthFor(el: import("./badge-design").ElementPlacement): number {
    const xPct = Math.max(0, Math.min(100, el.x));
    const align = el.align ?? "center";
    let boxPct: number;
    if (align === "center") boxPct = 2 * Math.min(xPct, 100 - xPct);
    else if (align === "left") boxPct = 100 - xPct;
    else boxPct = xPct; // right
    return Math.max(4, (boxPct / 100) * safeW);
  }

  // Render every text element with its font styling
  const textKeys: (keyof typeof e)[] = ["orgName", "eventTitle", "eventDate", "ticket", "name", "title", "company", "email", "customText"];
  for (const k of textKeys) {
    const el = e[k];
    if (!el?.enabled) continue;
    const text = valueFor(k);
    if (!text) continue;

    // Run the fit engine for this element. Fast-path (short-fit) returns
    // the requested pt and a single-line `lines[0].text === text`, so the
    // emitted HTML stays byte-identical to the current implementation
    // for every fitting value (bugfix.md 3.1, 3.7).
    const maxWidthMm = maxWidthFor(el);
    const spec: FontSpec = {
      family: el.fontFamily ?? "system-ui",
      weightCss: el.fontWeight ?? 400,
      italic: !!el.italic,
      sizePt: el.size,
    };
    const role = roleFor(k);
    const fit = fitTextRole({
      role,
      text,
      spec,
      safeWmm: maxWidthMm,
      // Designer faces have no explicit vertical budget per element (elements
      // are absolutely positioned), so use the full safe height as an upper
      // bound. Reflow that consumes >1 line still fits so long as the
      // element's anchor leaves room.
      maxHeightMm: dims.h - 2 * MIN_PAD_MM,
      warnings,
    });

    const reflowed = fit.sizePt !== el.size || fit.lines.length > 1;
    if (!reflowed) {
      // Byte-identical to today's output.
      els.push(renderTextElement(el, text));
    } else {
      // Fit-adjusted output: use the shrunk pt via a shadow element, and
      // emit the escaped, `<br/>`-joined lines as pre-escaped body so
      // wrapping is preserved.
      const adjustedEl: import("./badge-design").ElementPlacement = { ...el, size: fit.sizePt };
      const lineHtml = fit.lines.map((l) => escapeHtml(l.text)).join("<br/>");
      els.push(renderTextElement(adjustedEl, lineHtml, maxWidthMm, true));
    }
  }

  // QR last so it sits on top. Source pixel size matches the thermal
  // head DPI when configured (see `qrPixelSizeForMm`) so the printer
  // renders modules dot-for-dot without downsampling artifacts that
  // some scanners refuse to decode. Post-clamp the mm side to
  // `QR_MIN_MM` before pixel derivation so shrunk designer QRs stay
  // scannable (bugfix.md 2.7).
  if (e.qr?.enabled) {
    const qrMm = Math.max(QR_MIN_MM, e.qr.size);
    const qrPx = qrPixelSizeForMm(qrMm, thermalDpi);
    const qr = await QRCode.toDataURL(b.qr_payload, { width: qrPx, margin: 1 });
    els.push(`<div class="el qr" style="left:${e.qr.x}%;top:${e.qr.y}%"><img src="${qr}" style="width:${qrMm}mm;height:${qrMm}mm" alt="QR" /></div>`);
  }
  const pageBreak = asBack && d.fullBleed ? " page-break" : "";
  return `<div class="card${pageBreak}">${bgEl}${els.join("")}</div>`;
}

/**
 * Serialize one text element placement into a positioned <div> with inline
 * font styling.
 *
 * @param el          - Element placement (position, size, font styling).
 * @param text        - Rendered text; may contain `<br/>` between wrapped lines
 *                      already inserted by the caller.
 * @param maxWidthMm  - Optional width constraint in millimeters. When
 *                      `Number.isFinite(maxWidthMm)` is true, emits
 *                      `max-width; word-break; overflow-wrap` so long values
 *                      wrap inside the element box. When omitted or infinite,
 *                      emits today's exact CSS byte-for-byte — preserving
 *                      designer-anchor snapshots for short-fit inputs
 *                      (bugfix.md 3.1, 3.7).
 * @param preEscaped  - When true, `text` is treated as already-safe HTML
 *                      (typically `<br/>`-joined lines from `fitText`);
 *                      otherwise it is escaped. Defaults to false.
 */
function renderTextElement(
  el: import("./badge-design").ElementPlacement,
  text: string,
  maxWidthMm?: number,
  preEscaped = false,
): string {
  const fontFamily = el.fontFamily ? `${el.fontFamily}, system-ui, sans-serif` : "system-ui, sans-serif";
  const weight = el.fontWeight ?? 400;
  const italic = el.italic ? "italic" : "normal";
  const align = el.align ?? "center";
  const transformMap: Record<string, string> = { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "none" };
  const transform = transformMap[el.transform ?? "none"] || "none";
  const letter = (el.letterSpacing ?? 0).toFixed(3) + "em";
  const lh = el.lineHeight ?? 1.1;
  // Only emit `max-width` when the caller has computed a real bound. This
  // keeps designer-anchor short-fit snapshots byte-identical until Task 16
  // wires per-element widths through `renderDesignedFace`.
  const widthConstraint =
    typeof maxWidthMm === "number" && Number.isFinite(maxWidthMm) && maxWidthMm > 0
      ? [
          `max-width:${maxWidthMm}mm`,
          `white-space:normal`,
          `word-break:break-word`,
          `overflow-wrap:anywhere`,
        ]
      : [];
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
    ...widthConstraint,
  ].join(";");
  const body = preEscaped ? text : escapeHtml(text);
  return `<div class="el text" style="${style}">${body}</div>`;
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

function renderName(b: BadgeData, dims: { w: number; h: number }, eventTitle: string, nameDesignId?: NameDesignId, fontOverride?: PrintOptions["font"], warnings?: FitWarning[]): string {
  const company = (b.company || "").trim();
  const nd = NAME_DESIGNS.find((d) => d.id === nameDesignId) ?? NAME_DESIGNS[0];

  const fontSizeMultiplier = nd.fontSize === "3xl" ? 1.8 : nd.fontSize === "2xl" ? 1.4 : 1.0;
  const basePt = fontOverride?.sizePt ?? Math.round(18 * fontSizeMultiplier);
  const namePtRequested = basePt;
  // companySizePt can be set independently; falls back to 55% of namePt.
  const companyPtRequested = fontOverride?.companySizePt ?? Math.round(namePtRequested * 0.55);
  const eventPt = Math.round(namePtRequested * 0.4);

  // Safe width for the name-only layouts. Every preset shell has its own
  // horizontal padding (see the preset render blocks below), which is
  // subtracted alongside `MIN_PAD_MM` so the fit engine constrains text
  // to what will actually be visible on the physical label.
  const shellPadMm = nd.id === "monogram" ? 5 : nd.id === "ticket-stub" ? 4 : 6;
  const safeWmm = Math.max(10, dims.w - 2 * MIN_PAD_MM - 2 * shellPadMm);
  // Height budget is generous — name-only labels have vertical slack — so
  // most reflow is width-driven. Cap at the safe height to prevent runaway.
  const safeHmm = dims.h - 2 * MIN_PAD_MM;

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

  // ─── Fit engine dispatch ───────────────────────────────────────────────
  // The name and company lines each pass through `fitText`. The preset
  // shell (monogram / ticket-stub / event-card / default) is left
  // untouched — only the point size and the emitted text of these two
  // lines can change (bugfix.md 3.9).
  const nameFit = fitTextRole({
    role: "nameLabel",
    text: b.name,
    spec: { family: fontFamily, weightCss: fontWeight, italic: fontItalic, sizePt: namePtRequested },
    safeWmm,
    maxHeightMm: safeHmm,
    warnings,
  });
  const companyFit = company
    ? fitTextRole({
        role: "companyLabel",
        text: company,
        spec: { family: fontFamily, weightCss: fontWeight, italic: fontItalic, sizePt: companyPtRequested },
        safeWmm,
        maxHeightMm: safeHmm,
        warnings,
      })
    : null;

  const namePt = nameFit.sizePt;
  const companyPt = companyFit ? companyFit.sizePt : companyPtRequested;
  const nameHtml = nameFit.lines.map((l) => escapeHtml(l.text)).join("<br/>");
  const companyHtml = companyFit ? companyFit.lines.map((l) => escapeHtml(l.text)).join("<br/>") : "";
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
          <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111">${nameHtml}</div>
          ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:${companyColor};margin-top:2mm">${companyHtml}</div>` : ""}
        </div>
      </div>
    `;
  }

  if (nd.id === "ticket-stub") {
    return `
      <div class="card name-only" style="padding:4mm;gap:2mm;border:${borderCss}">
        ${accentBand}
        <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111;text-align:${textAlign}">${nameHtml}</div>
        ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:#555;text-align:${textAlign}">${companyHtml}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="card name-only" style="border:${borderCss}">
      ${accentBand}
      ${nd.showEvent && (eventTitle || b.event_title) && nd.id !== "event-card" ? `<div style="font-size:${eventPt}pt;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:3mm;text-align:${textAlign}">${escapeHtml(eventTitle || b.event_title || "")}</div>` : ""}
      <div style="font-size:${namePt}pt;${fontStyle}${nameTransform}line-height:1.05;color:#111;text-align:${textAlign}">${nameHtml}</div>
      ${company ? `<div style="font-size:${companyPt}pt;${fontStyle}color:#444;margin-top:3mm;text-align:${textAlign}">${companyHtml}</div>` : ""}
    </div>
  `;
}

async function renderDefaultBadge(
  b: BadgeData,
  dims: { w: number; h: number },
  eventTitle: string,
  fontOverride?: PrintOptions["font"],
  thermalDpi?: number,
  thermalOffset?: { topMm: number; leftMm: number },
  warnings?: FitWarning[],
): Promise<string> {
  // Compute layout sizes proportional to the badge dimensions so the same
  // template scales cleanly from a 63×34mm Avery cell up to A6 / A4-2up.
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const padMm = clamp(2.5, dims.w * 0.05, 6);
  const bannerHeightMm = clamp(14, dims.h * 0.36, 60);
  const qrMm = clamp(QR_MIN_MM, Math.min(dims.w * 0.42, dims.h * 0.34), 36);
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

  // Safe content area — the axis-aligned rectangle the fit engine constrains
  // every text run within (bugfix.md 2.5).
  const safeW = dims.w - 2 * MIN_PAD_MM;
  const safeH = dims.h - 2 * MIN_PAD_MM;

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

  // ─── Fit engine dispatch ───────────────────────────────────────────────
  // For each text role, ask the fit engine whether the value fits at the
  // requested point size. Short-fit inputs return unchanged from the fast
  // path (`sizePt === requested`, `lines.length === 1`), so the emitted
  // HTML below stays byte-identical to the current implementation. Long
  // values return a shrunk `sizePt` and/or a wrapped `lines[]`, which the
  // emit step joins with `<br/>` and the centering path picks up.
  //
  // Fit-engine calls are pure and synchronous; no I/O beyond the shared
  // canvas measurement.
  const nameFit = fitTextRole({
    role: "name",
    text: b.name,
    spec: { family, weightCss: weight, italic: italic === "italic", sizePt: namePt },
    safeWmm: safeW,
    maxHeightMm: safeH,
    warnings,
  });
  const orgFit = org
    ? fitTextRole({
        role: "org",
        text: org,
        spec: { family: "Poppins", weightCss: 600, italic: false, sizePt: orgPt },
        safeWmm: safeW,
        maxHeightMm: safeH,
        warnings,
      })
    : null;
  const eventFit = title
    ? fitTextRole({
        role: "event",
        text: title,
        spec: { family: "Poppins", weightCss: 700, italic: false, sizePt: eventPt },
        safeWmm: safeW,
        maxHeightMm: safeH,
        warnings,
      })
    : null;
  // Meta line contains one or two independent spans joined by a dot. We
  // never wrap or shrink the meta line — it's short by construction — but
  // we do measure it to catch pathological overflow (dateText + locText
  // longer than safeW). If it overflows, fitText re-emits the combined
  // string at a smaller pt.
  const metaCombined = [dateText, locText].filter(Boolean).join(" · ");
  const metaFit = metaCombined
    ? fitTextRole({
        role: "meta",
        text: metaCombined,
        spec: { family: "Poppins", weightCss: 400, italic: false, sizePt: metaPt },
        safeWmm: safeW,
        maxHeightMm: safeH,
        warnings,
      })
    : null;

  // Detect whether any role was reflowed. When nothing was, we emit the
  // same HTML today produces — preservation for bugfix.md 3.1.
  const reflowHappened =
    nameFit.sizePt !== namePt ||
    nameFit.lines.length > 1 ||
    (orgFit ? orgFit.sizePt !== orgPt || orgFit.lines.length > 1 : false) ||
    (eventFit ? eventFit.sizePt !== eventPt || eventFit.lines.length > 1 : false) ||
    (metaFit ? metaFit.sizePt !== metaPt || metaFit.lines.length > 1 : false);

  // Bytes emitted for name / org / event / meta content. When the fast
  // path took, the joined output equals `escapeHtml(text)` for each role,
  // so preservation snapshots hold.
  const nameContent = nameFit.lines.map((l) => escapeHtml(l.text)).join("<br/>");
  const nameSizePt = nameFit.sizePt;
  const orgContent = orgFit ? orgFit.lines.map((l) => escapeHtml(l.text)).join("<br/>") : "";
  const orgSizePt = orgFit ? orgFit.sizePt : orgPt;
  const eventContent = eventFit ? eventFit.lines.map((l) => escapeHtml(l.text)).join("<br/>") : "";
  const eventSizePt = eventFit ? eventFit.sizePt : eventPt;
  const metaSizePt = metaFit ? metaFit.sizePt : metaPt;

  // Meta line: preserve the dot-separated span shape when the fit engine
  // did NOT reflow (fast path == today's output). When reflow ran, emit
  // the combined single-line text at the fitted pt.
  const metaEl = (() => {
    if (!metaFit) return "";
    const metaReflowed = metaFit.sizePt !== metaPt || metaFit.lines.length > 1;
    if (!metaReflowed) {
      const parts: string[] = [];
      if (dateText) parts.push(`<span>${escapeHtml(dateText)}</span>`);
      if (locText) parts.push(`<span>${escapeHtml(locText)}</span>`);
      return `<div class="meta" style="font-size:${metaPt}pt;margin-top:${gapMm}mm">${parts.join(`<span class="dot">·</span>`)}</div>`;
    }
    const joinedLines = metaFit.lines.map((l) => escapeHtml(l.text)).join("<br/>");
    return `<div class="meta" style="font-size:${metaSizePt}pt;margin-top:${gapMm}mm">${joinedLines}</div>`;
  })();

  // Name style — computed from the fitted point size. In the fast path
  // this equals today's `font-size:${namePt}pt` byte-for-byte.
  const nameStyle = [
    `font-size:${nameSizePt}pt`,
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

  // ─── Body style resolution ─────────────────────────────────────────────
  // Fast path: emit today's exact string (`padding: N * 1.2mm Mmm; gap: Kmm;
  // align-items: ...; text-align: ...`).
  // Reflow path: compute optical centering padding and switch
  // `justify-content` to `center` so the shrunk / wrapped content stack is
  // rebalanced within the safe area (bugfix.md 2.6). When `thermalOffset`
  // is set, the padding also shifts content by the printer's hardware
  // margin (bugfix.md 2.11).
  let bodyStyle: string;
  let dividerStyle: string;
  if (!reflowHappened && !thermalOffset) {
    bodyStyle = `padding:${padMm * 1.2}mm ${padMm}mm;gap:${gapMm}mm;align-items:${itemsAlign};text-align:${bodyAlign}`;
    dividerStyle = `margin:${gapMm * 1.4}mm 0`;
  } else {
    // Content-height estimate for the centering calc: sum every role's
    // fitted heightMm + qr side + banner height + inter-block gaps.
    const contentH =
      bannerHeightMm +
      (orgFit?.heightMm ?? 0) +
      (eventFit?.heightMm ?? 0) +
      (metaFit?.heightMm ?? 0) +
      nameFit.heightMm +
      qrMm +
      gapMm * 4; // dividers/margins between the six blocks
    const padding = computeCenteringPadding(
      safeH,
      contentH,
      padMm * 1.2,
      thermalOffset ?? { topMm: 0, leftMm: 0 },
    );
    bodyStyle =
      `padding:${padding.topMm.toFixed(3)}mm ${padding.rightMm.toFixed(3)}mm ${padding.botMm.toFixed(3)}mm ${padding.leftMm.toFixed(3)}mm;` +
      `gap:${gapMm}mm;justify-content:center;align-items:${itemsAlign};text-align:${bodyAlign}`;
    dividerStyle = `margin:${gapMm * 1.4}mm 0`;
  }

  return `
    <div class="card basic">
      ${bannerEl}
      <div class="body" style="${bodyStyle}">
        ${org ? `<div class="org" style="font-size:${orgSizePt}pt">${orgContent}</div>` : ""}
        ${title ? `<div class="event" style="font-size:${eventSizePt}pt;margin-top:${gapMm * 0.6}mm">${eventContent}</div>` : ""}
        ${metaEl}
        <div class="divider" style="${dividerStyle}"></div>
        <div class="name" style="${nameStyle}">${nameContent}</div>
        <div class="qr-wrap" style="width:${qrMm}mm;height:${qrMm}mm;margin-top:${gapMm * 1.2}mm">
          <img src="${qr}" alt="QR" />
        </div>
      </div>
    </div>
  `;
}

/**
 * Fit-engine dispatch wrapper. Runs `fitText` and pushes a `FitWarning`
 * onto `warnings` when the result was shrunk to the floor or hard-broken.
 * Never throws — a bug in the fit engine cannot break the print pipeline.
 */
function fitTextRole(args: {
  role: Role;
  text: string;
  spec: FontSpec;
  safeWmm: number;
  maxHeightMm: number;
  warnings?: FitWarning[];
}): FitResult {
  const floor = FLOOR_PT_BY_ROLE[args.role] ?? 6;
  const result = fitText(args.text, args.spec, args.safeWmm, args.maxHeightMm, floor);
  if (args.warnings) {
    if (result.overflow) {
      args.warnings.push({ role: args.role, text: args.text, reason: "hardBreak" });
    } else if (result.atFloor && result.sizePt < args.spec.sizePt) {
      args.warnings.push({ role: args.role, text: args.text, reason: "atFloor" });
    }
  }
  return result;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}