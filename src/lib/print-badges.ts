import QRCode from "qrcode";
import { badgeSizeMm, type BadgeDesign } from "./badge-design";

export type BadgeData = {
  name: string;
  email?: string | null;
  company?: string | null;
  ticket_type?: string | null;
  qr_payload: string;
  event_title?: string;
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
  "a4-2up":     { page: "@page { size: A4; margin: 10mm }",          cols: 2, gap: "6mm", pad: "0" },
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
    /* default (non-designed) layout */
    .card.basic{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6mm;text-align:center}
    .card.basic .event{font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:4mm}
    .card.basic .name{font-size:18pt;font-weight:700;line-height:1.1;margin-bottom:2mm}
    .card.basic .company{font-size:11pt;color:#444;margin-bottom:2mm}
    .card.basic .email{font-size:9pt;color:#666;margin-bottom:2mm}
    .card.basic .ticket{display:inline-block;font-size:8pt;text-transform:uppercase;letter-spacing:.1em;padding:1mm 2.5mm;border:1px solid #ccc;border-radius:99px;margin-top:1mm}
    .card.basic .qr{width:28mm;height:28mm;margin-top:3mm}
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
    const bg = des.backBg ? `<div class="bg" style="background-image:url('${des.backBg}')"></div>` : "";
    return `<div class="card${fullBleed ? " page-break" : ""}">${bg}</div>`;
  }
}

async function renderDesignedFace(b: BadgeData, d: BadgeDesign, _isFront: boolean, asBack = false): Promise<string> {
  const e = d.elements;
  const bg = d.frontBg ? `<div class="bg" style="background-image:url('${d.frontBg}')"></div>` : "";
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

async function renderDefaultBadge(b: BadgeData, _dims: { w: number; h: number }, eventTitle: string): Promise<string> {
  const qr = await QRCode.toDataURL(b.qr_payload, { width: 240, margin: 1 });
  const ticket = (b.ticket_type || "").trim();
  const company = (b.company || "").trim();
  return `
    <div class="card basic">
      ${eventTitle ? `<div class="event">${escapeHtml(eventTitle)}</div>` : ""}
      <div class="name">${escapeHtml(b.name)}</div>
      ${company ? `<div class="company">${escapeHtml(company)}</div>` : ""}
      ${b.email ? `<div class="email">${escapeHtml(b.email)}</div>` : ""}
      ${ticket ? `<div class="ticket">${escapeHtml(ticket)}</div>` : ""}
      <img class="qr" src="${qr}" alt="QR" />
    </div>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}