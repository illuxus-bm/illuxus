import QRCode from "qrcode";
import { badgeSizeMm, bgTransformToCss, type BadgeDesign } from "./badge-design";

export type BadgeData = {
  name: string;
  email?: string | null;
  company?: string | null;
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

export type PrintSize = "a6" | "a4-2up" | "avery-3x8" | "custom";
export type PrintMode = "badge" | "name";
export type PrintUnit = "in" | "cm" | "mm";

export type PrintOptions = {
  mode?: PrintMode;
  size?: PrintSize;
  copies?: number;
  eventTitle?: string;
  custom?: { width: number; height: number; unit: PrintUnit };
  design?: BadgeDesign;
};

const SHEET_CSS: Record<Exclude<PrintSize, "custom">, { page: string; cols: number; gap: string; pad: string }> = {
  "a6":         { page: "@page { size: A6 landscape; margin: 4mm }", cols: 1, gap: "0",   pad: "0" },
  // Two landscape badges stacked on a portrait A4. The badge itself is
  // 186×134mm, so a single column fits the 190mm usable width.
  "a4-2up":     { page: "@page { size: A4 portrait; margin: 10mm }", cols: 1, gap: "6mm", pad: "0" },
  "avery-3x8":  { page: "@page { size: A4; margin: 8mm }",           cols: 3, gap: "3mm", pad: "0" },
};

function fmtSize(w: number, h: number) { return `${w.toFixed(2)}mm ${h.toFixed(2)}mm`; }

export async function printBadges(badges: BadgeData[], opts: PrintOptions = {}) {
  const mode = opts.mode ?? "badge";
  const size = opts.size ?? "a4-2up";
  const copies = Math.max(1, Math.min(10, opts.copies ?? 1));
  const eventTitle = opts.eventTitle ?? "";
  const dims = badgeSizeMm(size, opts.custom);
  const fullBleed = !!(mode === "badge" && opts.design?.fullBleed);

  // Expand by copies
  const expanded: BadgeData[] = [];
  for (const b of badges) for (let i = 0; i < copies; i++) expanded.push(b);

  const isDesigned = mode === "badge" && opts.design && (opts.design.frontBg || hasAnyEnabled(opts.design));

  const cards = await Promise.all(
    expanded.map(async (b) => {
      if (isDesigned) return await renderDesigned(b, opts.design!, dims, fullBleed);
      if (mode === "name") return renderName(b, dims, eventTitle);
      return await renderDefaultBadge(b, dims, eventTitle);
    })
  );

  let pageCss: string;
  let sheetCss: string;
  if (fullBleed) {
    // One badge per page, edge-to-edge.
    pageCss = `@page { size: ${fmtSize(dims.w, dims.h)}; margin: 0 }`;
    sheetCss = `display:block`;
  } else {
    const cfg = SHEET_CSS[(size === "custom" ? "a4-2up" : size) as Exclude<PrintSize, "custom">];
    pageCss = cfg.page;
    sheetCss = `display:grid;grid-template-columns:repeat(${cfg.cols},${dims.w}mm);gap:${cfg.gap};justify-content:center;padding:${cfg.pad}`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Print ${mode === "name" ? "Names" : "Badges"}</title>
  <style>
    ${pageCss}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111}
    body{font-family:Inter,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .sheet{${sheetCss}}
    .card{
      width:${dims.w}mm;height:${dims.h}mm;position:relative;overflow:hidden;background:#fff;
      ${fullBleed ? "" : "border:1px solid #ddd;border-radius:2mm;"}
      page-break-inside:avoid;break-inside:avoid;
    }
    .card.page-break{page-break-before:always;break-before:page}
    .card .bg{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
    .card .el{position:absolute;transform:translate(-50%,-50%);text-align:center;line-height:1.1}
    .card .el.name{font-weight:700}
    .card .el img{display:block}
    /* default (non-designed) layout — banner / org / event / date / name / QR. All sizes are computed inline per badge so the layout scales with the chosen label dimensions. */
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
    .card.basic .qr-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:2mm;display:inline-flex;align-items:center;justify-content:center;padding:1.5mm}
    .card.basic .qr-wrap img{display:block;width:100%;height:100%}
    .card.name-only{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6mm;text-align:center}
    .card.name-only .name{font-size:26pt;font-weight:700;line-height:1.05}
    .card.name-only .company{font-size:14pt;color:#444;margin-top:3mm}
  </style></head>
  <body><div class="sheet">${cards.join("")}</div>
  <script>
    (function(){
      function waitForImages(){
        var imgs = Array.from(document.images);
        return Promise.all(imgs.map(function(img){
          if(img.complete && img.naturalWidth>0) return Promise.resolve();
          return new Promise(function(res){ img.onload=res; img.onerror=res; });
        }));
      }
      window.addEventListener('load', function(){
        waitForImages().then(function(){ setTimeout(function(){ window.focus(); window.print(); }, 150); });
      });
    })();
  </script>
  </body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    // Toast lives in calling component; surface via thrown error so dialog can react.
    throw new Error("popup-blocked");
  }
  w.document.open(); w.document.write(html); w.document.close();
}

function hasAnyEnabled(d: BadgeDesign) {
  return d.elements.name.enabled || d.elements.company.enabled || d.elements.qr.enabled;
}

async function renderDesigned(
  b: BadgeData,
  d: BadgeDesign,
  dims: { w: number; h: number },
  fullBleed: boolean
): Promise<string> {
  const front = await renderDesignedFace(b, d, true);
  if (d.back === "none") return front;
  const backHtml = d.back === "same"
    ? await renderDesignedFace(b, d, true, true)
    : renderStaticBack(d);
  // separate page when full bleed, or just next cell on the sheet
  return front + backHtml;

  function renderStaticBack(des: BadgeDesign) {
    const bg = des.backBg
      ? `<div class="bg" style="background-image:url('${des.backBg}');${cssBgStyle(des.backBgTransform)}"></div>`
      : "";
    return `<div class="card${fullBleed ? " page-break" : ""}">${bg}</div>`;
  }
}

async function renderDesignedFace(b: BadgeData, d: BadgeDesign, _isFront: boolean, asBack = false): Promise<string> {
  const e = d.elements;
  const bg = d.frontBg
    ? `<div class="bg" style="background-image:url('${d.frontBg}');${cssBgStyle(d.frontBgTransform)}"></div>`
    : "";
  const els: string[] = [];
  if (e.name.enabled) {
    els.push(`<div class="el name" style="left:${e.name.x}%;top:${e.name.y}%;font-size:${e.name.size}pt;color:${e.name.color}">${escapeHtml(b.name)}</div>`);
  }
  if (e.company.enabled && (b.company || "").trim()) {
    els.push(`<div class="el company" style="left:${e.company.x}%;top:${e.company.y}%;font-size:${e.company.size}pt;color:${e.company.color}">${escapeHtml(b.company!.trim())}</div>`);
  }
  if (e.qr.enabled) {
    const qr = await QRCode.toDataURL(b.qr_payload, { width: 320, margin: 1 });
    els.push(`<div class="el qr" style="left:${e.qr.x}%;top:${e.qr.y}%"><img src="${qr}" style="width:${e.qr.size}mm;height:${e.qr.size}mm" alt="QR" /></div>`);
  }
  const pageBreak = asBack && d.fullBleed ? " page-break" : "";
  return `<div class="card${pageBreak}">${bg}${els.join("")}</div>`;
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

function renderName(b: BadgeData, _dims: { w: number; h: number }, eventTitle: string): string {
  const company = (b.company || "").trim();
  return `
    <div class="card name-only">
      ${eventTitle ? `<div class="event" style="font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:3mm">${escapeHtml(eventTitle)}</div>` : ""}
      <div class="name">${escapeHtml(b.name)}</div>
      ${company ? `<div class="company">${escapeHtml(company)}</div>` : ""}
    </div>
  `;
}

async function renderDefaultBadge(b: BadgeData, dims: { w: number; h: number }, eventTitle: string): Promise<string> {
  // Compute layout sizes proportional to the badge dimensions so the same
  // template scales cleanly from a 63×34mm Avery cell up to A6 / A4-2up.
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const padMm = clamp(2.5, dims.w * 0.05, 6);
  const bannerHeightMm = clamp(14, dims.h * 0.36, 60);
  const qrMm = clamp(14, Math.min(dims.w * 0.42, dims.h * 0.34), 36);
  const orgPt = clamp(5, dims.h * 0.045, 10);
  const eventPt = clamp(8, dims.h * 0.095, 16);
  const metaPt = clamp(5, dims.h * 0.04, 9);
  const namePt = clamp(11, dims.h * 0.14, 26);
  const gapMm = clamp(0.8, dims.h * 0.015, 2.5);

  const qrPxTarget = Math.max(160, Math.round(qrMm * 12));
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

  return `
    <div class="card basic">
      ${bannerEl}
      <div class="body" style="padding:${padMm * 1.2}mm ${padMm}mm;gap:${gapMm}mm">
        ${org ? `<div class="org" style="font-size:${orgPt}pt">${escapeHtml(org)}</div>` : ""}
        ${title ? `<div class="event" style="font-size:${eventPt}pt;margin-top:${gapMm * 0.6}mm">${escapeHtml(title)}</div>` : ""}
        ${metaEl}
        <div class="divider" style="margin:${gapMm * 1.4}mm 0"></div>
        <div class="name" style="font-size:${namePt}pt">${escapeHtml(b.name)}</div>
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