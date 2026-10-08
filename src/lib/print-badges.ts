import QRCode from "qrcode";
import { badgeSizeMm, bgTransformToCss, frontBgStyleToCss, fontsUsedInDesign, googleFontsUrl, type BadgeDesign, type NameDesignId, NAME_DESIGNS } from "./badge-design";
import {
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
  /** Label for the coloured band at the bottom of the badge — e.g.
   *  "Speaker", "Partner", "Attendee". See `participantLabel`. */
  participant_type?: string | null;
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

export type PrintSize = "thermal-4x5" | "thermal-4x6" | "a6" | "a4-4up" | "custom";

export const DEFAULT_PRINT_SIZE: PrintSize = "thermal-4x5";
const PRINT_SIZES: readonly PrintSize[] = ["thermal-4x5", "thermal-4x6", "a6", "a4-4up", "custom"];

/** Narrow an untrusted value (e.g. a persisted preference from an older
 *  version that offered sizes since removed) to a supported size. */
export function normalizePrintSize(v: unknown): PrintSize {
  return PRINT_SIZES.includes(v as PrintSize) ? (v as PrintSize) : DEFAULT_PRINT_SIZE;
}

/** Sizes fed by a label printer: one badge per label, zero page margin. */
function isLabelPrinterSize(size: PrintSize): boolean {
  return size === "thermal-4x5" || size === "thermal-4x6" || size === "custom";
}
export type PrintMode = "badge" | "name";
export type PrintUnit = "in" | "cm" | "mm";

export type PrintOptions = {
  mode?: PrintMode;
  size?: PrintSize;
  copies?: number;
  eventTitle?: string;
  custom?: { width: number; height: number; unit: PrintUnit };
  design?: BadgeDesign;
  /** When true, render in black and white for monochrome thermal printers:
   *  the banner is converted to greyscale and the participant band is black. */
  thermalMode?: boolean;
  /** Add the attendee's check-in QR code under the company name. */
  showQr?: boolean;
  /** Background colours of the participant band. Defaults to DEFAULT_BAND_COLORS. */
  bandColors?: BandColors;
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
  /**
   * Render for an on-screen preview pane rather than for a printer.
   *
   * When true, an `@media screen` block is emitted that scales the badge
   * down to fit whatever viewport it is rendered into (see `screenFitCss`
   * in `buildPrintHtml`). This is what keeps the live preview iframe in
   * `PrintBadgesDialog` showing the WHOLE badge instead of cropping it and
   * exposing scrollbars — a 186mm-wide a4-2up badge is ~703 CSS px, far
   * wider than the preview pane, so at 1:1 the pane would show only the
   * middle slice of the badge.
   *
   * MUST stay false/undefined for real print paths (`printBadges`,
   * `printCalibration`): the print document has to remain 1:1 mm-accurate,
   * and the popup window may legitimately contain many stacked cards that
   * the user needs to scroll through before confirming the print dialog.
   *
   * Assumes a single-card sheet (the preview always renders `copies: 1`
   * with one sample badge), so the fit maths is derived from one card's
   * dimensions.
   */
  previewFit?: boolean;
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

// Only the A4 sheet lays several badges out on one page; every other size
// prints one badge per page edge-to-edge (see `fullBleed` below).
// Four A6 quarters tile the A4 page exactly, so cutting along the halves
// yields four badges. Margin 0 — set Margins to "None" in the print dialog.
const A4_SHEET_CSS = { page: "@page { size: A4 portrait; margin: 0 }", cols: 2, gap: "0", pad: "0" };

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
  const size = normalizePrintSize(opts.size ?? DEFAULT_PRINT_SIZE);
  const copies = Math.max(1, Math.min(10, opts.copies ?? 1));
  const eventTitle = opts.eventTitle ?? "";
  const dims = badgeSizeMm(size, opts.custom);
  // Black-and-white output is an explicit choice (the "Thermal printer
  // mode" checkbox) — picking a label size no longer strips the banner.
  const bwMode = !!opts.thermalMode;
  // Label printers (and explicit thermal mode) get head-DPI-exact QR codes
  // and the measured hardware-margin offset.
  const thermalMode = bwMode || isLabelPrinterSize(size);
  // Everything except the A4 sheet prints one badge per page, edge-to-edge.
  const fullBleed = size !== "a4-4up" || !!(mode === "badge" && opts.design?.fullBleed);
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
      return await renderDefaultBadge(b, dims, eventTitle, opts.font, thermalDpi, thermalOffset, !!opts.showQr, opts.bandColors, warnings);
    })
  );

  let pageCss: string;
  let sheetCss: string;
  if (fullBleed) {
    pageCss = `@page { size: ${fmtSize(dims.w, dims.h)}; margin: 0 }`;
    sheetCss = `display:block`;
  } else {
    const cfg = A4_SHEET_CSS;
    pageCss = cfg.page;
    sheetCss = `display:grid;grid-template-columns:repeat(${cfg.cols},${dims.w}mm);gap:${cfg.gap};justify-content:center;padding:${cfg.pad}`;
  }

  const usedFonts = mode === "badge" && opts.design ? fontsUsedInDesign(opts.design) : [];
  // The default badge sets the participant band (and the name, unless a
  // font is picked) in Poppins, so it must be loaded alongside the choice.
  if (mode === "badge" && !isDesigned) usedFonts.push("Poppins");
  if (opts.font?.family) usedFonts.push(opts.font.family);
  const fontsLink = googleFontsUrl([...new Set(usedFonts)]);

  // On-screen preview fit-to-viewport — emitted ONLY when the caller asks
  // for a preview render (opts.previewFit). See the PrintOptions.previewFit
  // docblock for why this must never leak into a real print document.
  //
  // A badge is sized in physical millimetres, so at 1:1 an a4-2up badge is
  // 186mm ~ 703 CSS px and a thermal-4x6 is 101.6mm ~ 384 px — both wider
  // than the dialog's preview pane. Without scaling, the iframe crops the
  // badge and shows scrollbars, so the visible slice is whatever happens
  // to sit mid-badge (usually the QR), which reads as "the QR is huge and
  // everything else is missing".
  //
  // min(fitW, fitH, 1) scales down to fit both axes and never upscales, so
  // a small thermal-50 label stays crisp at 1:1 rather than being blown up.
  // The sheet is collapsed to a single-card block first. Non-full-bleed
  // sizes lay the sheet out as a multi-column grid (avery-3x8 is
  // `repeat(3, 63mm)` = 195mm ~ 737px wide) and CSS grid reserves every
  // column track even when only one badge is rendered. Left as a grid, the
  // sheet is far wider than the pane, the flex centering centres that
  // oversized box, and the single card ends up in the off-screen left
  // column — the badge appears cropped at the left edge. Forcing
  // `display:block` makes the sheet exactly one card, so the scale maths
  // below (derived from one card's dimensions) is correct for every size.
  const cardPxW = (dims.w * 96 / 25.4).toFixed(2);
  const cardPxH = (dims.h * 96 / 25.4).toFixed(2);
  const screenFitCss = opts.previewFit
    ? "@media screen {" +
      "html,body{width:100vw;height:100vh;overflow:hidden}" +
      "body{display:flex;align-items:center;justify-content:center}" +
      // Grey backdrop + shadow so a white badge's edges are visible.
      "html,body{background:#eef1f5}" +
      ".card{box-shadow:0 1px 2px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.12)}" +
      ".sheet{" +
      "display:block;grid-template-columns:none;gap:0;padding:0;" +
      // 0.92 leaves a margin around the badge so its shadow and edges show.
      `transform:scale(calc(0.92 * min(calc(100vw / ${cardPxW}px), calc(100vh / ${cardPxH}px), 1)));` +
      "transform-origin:center center;" +
      "}" +
      "}"
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Print ${mode === "name" ? "Names" : "Badges"}</title>
  ${fontsLink ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="${fontsLink}" />` : ""}
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
    /* On-screen preview only: fit-to-viewport (see the JS-side comment
     * next to the screenFitCss declaration above for the full rationale). */
    ${screenFitCss}
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
    /* Belt-and-suspenders — see the JS-side rationale next to
     * renderDesignedFace: designer-face QR images have their intended
     * size on an inline style, but if that inline style is missing during
     * a rapid iframe doc.write, the browser would fall back to the img's
     * natural bitmap dimensions (which at 300 DPI reach ~300px, enough to
     * visibly overflow the badge). Capping to the parent .el's box size
     * plus overflow:hidden on the wrapper prevents a huge bitmap from
     * bursting through the layout in any code path. */
    .card .el img{display:block;max-width:100%;max-height:100%;object-fit:contain}
    .card .el.qr{overflow:hidden}
    /* Default badge: banner header (edge-to-edge) → name + company →
     * full-width participant-type band. The .inner wrapper carries the
     * thermal hardware-margin offset so the whole layout shifts together. */
    .card.basic{color:#0f172a}
    .card.basic .inner{position:absolute;inset:0;display:flex;flex-direction:column}
    .card.basic .banner{display:block;width:100%;height:auto;object-fit:cover;object-position:center;flex-shrink:0}
    .card.basic .banner.placeholder{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-align:center;line-height:1.15}
    .card.basic .body{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
    .card.basic .name{font-weight:800;line-height:1.08;letter-spacing:-0.01em;word-break:break-word}
    .card.basic .company{font-weight:500;color:#475569;line-height:1.2;word-break:break-word}
    .card.basic .qr-wrap{align-self:center}
    .card.basic .qr-wrap img{display:block;width:100%;height:100%;object-fit:contain}
    .card.basic .ptype{flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-align:center;line-height:1}
    .card.name-only{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6mm;text-align:center}
    .card.name-only .name{font-size:26pt;font-weight:700;line-height:1.05}
    .card.name-only .company{font-size:14pt;color:#444;margin-top:3mm}
    ${bwMode ? `
      .card { border: none !important; border-radius: 0 !important; background: #fff !important; }
      .card .bg { display: none !important; }
      .card.basic .banner { filter: grayscale(1) contrast(1.15); }
      .card.basic .banner.placeholder { background: #000 !important; }
      .card.basic .name, .card.basic .company { color: #000 !important; }
      .card.basic .ptype { background: #000 !important; color: #fff !important; }
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
  const pageCss = opts.size !== "a4-4up"
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
    // Size the WRAPPER div in mm rather than only the child img. When the
    // container has an explicit CSS-mm box the img can never overflow —
    // `.card .el img { max-width:100%; max-height:100% }` (see the style
    // block above) caps it to the wrapper. Previously only the img itself
    // had an inline mm size; if that inline style was ever missed by the
    // browser (rapid iframe doc.write during preview refresh) the img fell
    // back to its natural bitmap dimensions, which at 300 DPI approaches
    // ~300px — enough to make the QR visually explode out of the badge
    // preview. This makes the fix impossible to bypass.
    els.push(`<div class="el qr" style="left:${e.qr.x}%;top:${e.qr.y}%;width:${qrMm}mm;height:${qrMm}mm"><img src="${qr}" style="width:100%;height:100%;display:block" alt="QR" /></div>`);
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

/** Participant band background per group. Named attendee ticket types
 *  (e.g. "VIP", "Delegate") use the attendee colour. */
export type BandColors = { attendee: string; speaker: string; partner: string };

export const DEFAULT_BAND_COLORS: BandColors = {
  attendee: "#00a5b1",
  speaker: "#6d28d9",
  partner: "#b45309",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Accept only `#rrggbb` — the value lands in an inline style, and it can
 *  come from browser storage. Anything else falls back to the default. */
export function sanitizeBandColors(c: Partial<BandColors> | null | undefined): BandColors {
  const pick = (k: keyof BandColors) => (c && HEX_COLOR.test(c[k] ?? "") ? c[k]!.toLowerCase() : DEFAULT_BAND_COLORS[k]);
  return { attendee: pick("attendee"), speaker: pick("speaker"), partner: pick("partner") };
}

function bandColorFor(ptype: string, colors: BandColors): string {
  const k = ptype.toLowerCase();
  if (k === "speaker") return colors.speaker;
  if (k === "partner" || k === "sponsor") return colors.partner;
  if (k === "organizer" || k === "staff") return "#1f2937";
  return colors.attendee;
}

/** White text on dark bands, near-black on light ones (WCAG relative luminance). */
export function bandTextColor(hex: string): string {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return lum > 0.45 ? "#111111" : "#ffffff";
}

/** Ticket types that just mean "a regular registration" and so print as "Attendee". */
const GENERIC_TICKET_TYPES = new Set(["", "general", "free", "paid", "standard", "regular", "attendee", "ticket"]);

/**
 * Text for the participant band. Speakers and sponsors are identified by the
 * registrations list (`kind`); sponsors print as "Partner". Attendees with a
 * named ticket type (e.g. "VIP", "Delegate") show that, otherwise "Attendee".
 */
export function participantLabel(kind: "attendee" | "speaker" | "sponsor", ticketType?: string | null): string {
  if (kind === "speaker") return "Speaker";
  if (kind === "sponsor") return "Partner";
  const t = (ticketType ?? "").trim();
  if (GENERIC_TICKET_TYPES.has(t.toLowerCase())) return "Attendee";
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MM_TO_PT = 72 / 25.4;

async function renderDefaultBadge(
  b: BadgeData,
  dims: { w: number; h: number },
  eventTitle: string,
  fontOverride?: PrintOptions["font"],
  thermalDpi?: number,
  thermalOffset?: { topMm: number; leftMm: number },
  showQr = false,
  bandColors?: BandColors,
  warnings?: FitWarning[],
): Promise<string> {
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // ── Vertical budget ────────────────────────────────────────────────────
  // Banner: full width at its natural aspect ratio, capped so a very tall
  // image can't push the name off the badge. Band: fixed share of height.
  const bannerMaxMm = dims.h * 0.45;
  const placeholderMm = Math.min(dims.w * 0.42, bannerMaxMm);
  const bandMm = clamp(10, dims.h * 0.13, 24);
  const padXmm = clamp(4, dims.w * 0.06, 8);
  const safeW = dims.w - 2 * padXmm;
  // Height left for name + company (+ QR), using the placeholder height as
  // the banner estimate — real banners are typically wider than 2.4:1.
  const bodyHmm = Math.max(10, dims.h - placeholderMm - bandMm - 6);

  // ── Name + company ─────────────────────────────────────────────────────
  // Sizes scale with badge width; the Font Style panel's sizes act as
  // multipliers (22pt name / 12pt company = the defaults = ×1).
  const baseNamePt = clamp(14, dims.w * 0.27, 40);
  const namePt = clamp(10, baseNamePt * ((fontOverride?.sizePt ?? 22) / 22), 56);
  const baseCompanyPt = clamp(9, dims.w * 0.15, 22);
  const companyPt = clamp(7, baseCompanyPt * ((fontOverride?.companySizePt ?? 12) / 12), 32);

  const family = fontOverride?.family || "Poppins";
  const fontColor = fontOverride?.color || "#0f172a";
  const align = fontOverride?.align === "justify" ? "center" : fontOverride?.align || "center";
  const italic = fontOverride?.italic ? "italic" : "normal";
  const decor = [
    fontOverride?.underline ? "underline" : "",
    fontOverride?.strikethrough ? "line-through" : "",
  ].filter(Boolean).join(" ");
  const wordSpacing = fontOverride?.wordSpacingPt ? `word-spacing:${fontOverride.wordSpacingPt}pt;` : "";
  const scale = fontOverride?.scalePct && fontOverride.scalePct !== 100
    ? `transform:scaleX(${fontOverride.scalePct / 100});transform-origin:${align};`
    : "";

  const company = (b.company || "").trim();
  const qrMm = showQr ? clamp(QR_MIN_MM, dims.w * 0.22, 26) : 0;
  const gapMm = clamp(1.5, dims.h * 0.02, 4);
  const textHmm = Math.max(8, bodyHmm - (showQr ? qrMm + gapMm : 0));

  const nameFit = fitTextRole({
    role: "name",
    text: b.name,
    spec: { family, weightCss: 800, italic: italic === "italic", sizePt: namePt },
    safeWmm: safeW,
    maxHeightMm: company ? textHmm * 0.68 : textHmm,
    warnings,
  });
  const companyFit = company
    ? fitTextRole({
        role: "company",
        text: company,
        spec: { family, weightCss: 500, italic: italic === "italic", sizePt: companyPt },
        safeWmm: safeW,
        maxHeightMm: textHmm * 0.32,
        warnings,
      })
    : null;

  const textStyle = [
    `font-family:'${family}',Poppins,system-ui,sans-serif`,
    `font-style:${italic}`,
    decor ? `text-decoration:${decor}` : "",
    `text-align:${align}`,
  ].filter(Boolean).join(";");
  const nameHtml = nameFit.lines.map((l) => escapeHtml(l.text)).join("<br/>");
  const companyHtml = companyFit ? companyFit.lines.map((l) => escapeHtml(l.text)).join("<br/>") : "";

  // ── Banner ─────────────────────────────────────────────────────────────
  const banner = (b.banner_url || "").trim();
  const title = (eventTitle || b.event_title || "").trim() || "Event";
  const bannerEl = banner
    ? `<img class="banner" src="${escapeHtml(banner)}" alt="" style="max-height:${bannerMaxMm.toFixed(2)}mm" />`
    : `<div class="banner placeholder" style="height:${placeholderMm.toFixed(2)}mm;padding:0 ${padXmm}mm;font-size:${clamp(10, dims.w * 0.16, 24).toFixed(1)}pt">${escapeHtml(title)}</div>`;

  // ── Participant band ───────────────────────────────────────────────────
  const ptype = (b.participant_type || "").trim() || "Attendee";
  const bandColor = bandColorFor(ptype, sanitizeBandColors(bandColors));
  const bandFit = fitTextRole({
    role: "ticket",
    text: ptype.toUpperCase(),
    spec: { family: "Poppins", weightCss: 700, italic: false, sizePt: bandMm * 0.5 * MM_TO_PT },
    safeWmm: safeW,
    maxHeightMm: bandMm * 0.8,
    warnings,
  });

  // ── QR (optional) ──────────────────────────────────────────────────────
  let qrEl = "";
  if (showQr) {
    const qrPx = thermalDpi ? qrPixelSizeForMm(qrMm, thermalDpi) : Math.max(160, Math.round(qrMm * 12));
    const qr = await QRCode.toDataURL(b.qr_payload, { width: qrPx, margin: 1 });
    qrEl = `<div class="qr-wrap" style="width:${qrMm}mm;height:${qrMm}mm;margin-top:${gapMm}mm"><img src="${qr}" alt="QR" /></div>`;
  }

  const offset = thermalOffset && (thermalOffset.topMm || thermalOffset.leftMm)
    ? ` style="transform:translate(${thermalOffset.leftMm}mm,${thermalOffset.topMm}mm)"`
    : "";

  return `
    <div class="card basic">
      <div class="inner"${offset}>
        ${bannerEl}
        <div class="body" style="padding:${gapMm}mm ${padXmm}mm">
          <div class="name" style="font-size:${nameFit.sizePt.toFixed(2)}pt;font-weight:${fontOverride?.bold === false ? 700 : 800};color:${fontColor};${textStyle};${wordSpacing}${scale}">${nameHtml}</div>
          ${company ? `<div class="company" style="font-size:${companyFit!.sizePt.toFixed(2)}pt;margin-top:${(gapMm * 0.6).toFixed(2)}mm;${textStyle};${wordSpacing}${scale}">${companyHtml}</div>` : ""}
          ${qrEl}
        </div>
        <div class="ptype" style="height:${bandMm.toFixed(2)}mm;background:${bandColor};color:${bandTextColor(bandColor)};font-size:${bandFit.sizePt.toFixed(2)}pt;padding:0 ${padXmm}mm">${bandFit.lines.map((l) => escapeHtml(l.text)).join(" ")}</div>
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