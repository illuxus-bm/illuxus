/**
 * Canvas building blocks for the Creative Studio designs: text that fits its
 * box, vertical stacks, image fitting, and the textures (glows, grain, rings)
 * that keep a design from looking flat.
 *
 * Designs describe WHAT goes where; everything about measuring, shrinking and
 * wrapping text lives here so no design can produce overlapping or clipped
 * lines — the failure the old templates had.
 */
import { alpha, type StudioPalette } from "./studio-palette";

export interface FontPair {
  id: string;
  name: string;
  display: string;
  displayWeight: number;
  body: string;
  /** Set headlines in capitals (condensed / geometric display faces). */
  upper?: boolean;
  /** Extra tracking for headlines, in em. */
  tracking?: number;
}

export const FONT_PAIRS: FontPair[] = [
  { id: "modern", name: "Modern", display: "Poppins", displayWeight: 700, body: "Inter", tracking: -0.02 },
  { id: "editorial", name: "Editorial", display: "Playfair Display", displayWeight: 700, body: "Inter", tracking: -0.01 },
  { id: "grotesk", name: "Tech", display: "Space Grotesk", displayWeight: 700, body: "DM Sans", tracking: -0.03 },
  { id: "bold", name: "Bold", display: "Montserrat", displayWeight: 800, body: "Montserrat", upper: true, tracking: 0.01 },
];

export interface StudioContent {
  eventTitle: string;
  tagline: string;
  dateLabel: string;
  venueLabel: string;
  cta: string;
  /** Small label above the headline, e.g. "Speaker", "You're invited". */
  eyebrow: string;
  orgName: string;
  speaker?: { name: string; role: string; company: string } | null;
  speakers?: { name: string; role: string }[];
  sponsor?: { name: string; tier: string } | null;
}

export type Img = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export interface StudioAssets {
  banner?: Img | null;
  orgLogo?: Img | null;
  photo?: Img | null;
  photos?: (Img | null)[];
  sponsorLogo?: Img | null;
}

export type Shape = "wide" | "square" | "tall";

/** Everything a design needs to draw itself. */
export interface Scene {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** 1% of the shorter side — the unit every size is expressed in. */
  u: number;
  shape: Shape;
  /** Outer margin. */
  m: number;
  p: StudioPalette;
  f: FontPair;
  t: StudioContent;
  a: StudioAssets;
}

export function shapeOf(w: number, h: number): Shape {
  const r = w / h;
  return r >= 1.25 ? "wide" : r <= 0.7 ? "tall" : "square";
}

/* ── Text ──────────────────────────────────────────────────────────────── */

export interface TextOpts {
  font?: "display" | "body";
  weight?: number;
  /** Largest size to try; shrinks towards `minSize` until the text fits. */
  size: number;
  minSize?: number;
  color: string;
  maxWidth: number;
  maxLines?: number;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  upper?: boolean;
  /** Tracking in em. */
  tracking?: number;
}

export interface TextBlock {
  kind: "text";
  lines: string[];
  size: number;
  height: number;
  width: number;
  o: TextOpts;
  fontCss: string;
  trackingPx: number;
}

const quote = (family: string) => `"${family}", "Inter", system-ui, sans-serif`;

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  // Supported in Chromium and Safari 17+; elsewhere it is simply ignored.
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* noop */ }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; }
      else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Measure `text`, shrinking it until it fits `maxWidth` × `maxLines`. */
export function layoutText(s: Scene, raw: string, o: TextOpts): TextBlock {
  const { ctx } = s;
  const isDisplay = (o.font ?? "body") === "display";
  const family = isDisplay ? s.f.display : s.f.body;
  const weight = o.weight ?? (isDisplay ? s.f.displayWeight : 500);
  const upper = o.upper ?? (isDisplay && !!s.f.upper);
  const text = (upper ? raw.toUpperCase() : raw).trim();
  const tracking = o.tracking ?? (isDisplay ? s.f.tracking ?? 0 : 0);
  const maxLines = o.maxLines ?? 1;
  const min = o.minSize ?? o.size * 0.5;
  const lh = o.lineHeight ?? (isDisplay ? 1.08 : 1.3);

  let size = o.size;
  let lines: string[] = [];
  let fontCss = "";
  for (;;) {
    fontCss = `${weight} ${size}px ${quote(family)}`;
    ctx.font = fontCss;
    setTracking(ctx, tracking * size);
    lines = wrap(ctx, text, o.maxWidth);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= o.maxWidth) || size <= min) break;
    size = Math.max(min, size * 0.94);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > o.maxWidth) last = last.slice(0, -1).trimEnd();
    lines[maxLines - 1] = `${last}…`;
  }
  // A single unbreakable word wider than the box: trim it rather than overflow.
  lines = lines.map((l) => {
    let v = l;
    while (v.length > 1 && ctx.measureText(v).width > o.maxWidth) v = v.slice(0, -2).trimEnd() + "…";
    return v;
  });
  const width = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  setTracking(ctx, 0);
  return { kind: "text", lines, size, height: lines.length ? lines.length * size * lh : 0, width, o: { ...o, lineHeight: lh }, fontCss, trackingPx: tracking * size };
}

/** Paint a measured block with its top-left (or top-centre / top-right) at x, y. */
export function paintText(s: Scene, b: TextBlock, x: number, y: number) {
  const { ctx } = s;
  if (!b.lines.length) return;
  ctx.save();
  ctx.font = b.fontCss;
  setTracking(ctx, b.trackingPx);
  ctx.fillStyle = b.o.color;
  ctx.textAlign = b.o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  const lh = b.size * (b.o.lineHeight ?? 1.1);
  // Centre the glyph box in its line so stacked blocks space evenly.
  const first = y + (lh - b.size) / 2 + b.size * 0.8;
  b.lines.forEach((line, i) => ctx.fillText(line, x, first + i * lh));
  ctx.restore();
}

/* ── Stacks ────────────────────────────────────────────────────────────── */

export interface CustomBlock { kind: "custom"; height: number; width: number; paint: (x: number, y: number) => void }
export type Block = TextBlock | CustomBlock | { kind: "gap"; height: number };

export const gap = (height: number): Block => ({ kind: "gap", height });

export const stackHeight = (blocks: (Block | null | false | undefined)[]) =>
  blocks.reduce((n, b) => n + (b ? b.height : 0), 0);

/**
 * Paint blocks top to bottom. `x` is the left edge, centre or right edge
 * depending on `align`. Empty text blocks (and the gap before them) vanish, so
 * a missing tagline or date never leaves a hole.
 */
export function paintStack(s: Scene, blocksIn: (Block | null | false | undefined)[], x: number, y: number, align: "left" | "center" | "right" = "left"): number {
  const blocks = compact(blocksIn);
  let cy = y;
  for (const b of blocks) {
    if (b.kind === "text") paintText(s, { ...b, o: { ...b.o, align } }, x, cy);
    else if (b.kind === "custom") b.paint(align === "center" ? x - b.width / 2 : align === "right" ? x - b.width : x, cy);
    cy += b.height;
  }
  return cy;
}

/**
 * Paint a stack inside the vertical band y0…y1, anchored to its top, middle or
 * bottom. If the stack is taller than the band it is scaled down as a whole
 * (never below 60%) so copy can't run off the canvas or into another element,
 * however long the organiser's text is.
 */
export function paintStackIn(
  s: Scene, blocksIn: (Block | null | false | undefined)[], x: number, y0: number, y1: number,
  align: "left" | "center" | "right" = "left", anchor: "top" | "mid" | "bottom" = "mid",
): { top: number; bottom: number } {
  const blocks = compact(blocksIn);
  const height = stackHeight(blocks);
  const avail = Math.max(1, y1 - y0);
  const k = height > avail ? Math.max(0.6, avail / height) : 1;
  const used = height * k;
  const top = anchor === "top" ? y0 : anchor === "bottom" ? y1 - used : y0 + Math.max(0, (avail - used) / 2);
  const { ctx } = s;
  ctx.save();
  ctx.translate(x, top);
  ctx.scale(k, k);
  paintStack(s, blocks, 0, 0, align);
  ctx.restore();
  return { top, bottom: top + used };
}

/** Drop empty blocks together with the gap that led into them. */
export function compact(blocksIn: (Block | null | false | undefined)[]): Block[] {
  const out: Block[] = [];
  for (const b of blocksIn) {
    if (!b || b.height <= 0) {
      if (b && b.kind !== "gap" && out.length && out[out.length - 1].kind === "gap") out.pop();
      continue;
    }
    out.push(b);
  }
  while (out.length && out[0].kind === "gap") out.shift();
  while (out.length && out[out.length - 1].kind === "gap") out.pop();
  return out;
}

/* ── Shapes and images ─────────────────────────────────────────────────── */

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const dims = (img: Img) => ({
  iw: (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width,
  ih: (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height,
});

/** Fill the box, cropping the overflow. `focusY` 0 = keep the top, 1 = the bottom. */
export function drawCover(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number, focusX = 0.5, focusY = 0.5) {
  const { iw, ih } = dims(img);
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (iw - sw) * focusX, (ih - sh) * focusY, sw, sh, x, y, w, h);
}

/** Fit entirely inside the box, centred. */
export function drawContain(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number) {
  const { iw, ih } = dims(img);
  if (!iw || !ih) return;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "•";

/** A person's photo clipped to a path; a tasteful monogram when there is none. */
export function drawPortrait(s: Scene, img: Img | null | undefined, name: string, path: () => void, box: { x: number; y: number; w: number; h: number }) {
  const { ctx, p } = s;
  ctx.save();
  path();
  ctx.clip();
  if (img) {
    // Faces sit in the upper part of a portrait.
    drawCover(ctx, img, box.x, box.y, box.w, box.h, 0.5, 0.22);
  } else {
    const g = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    g.addColorStop(0, alpha(p.accent, p.dark ? 0.32 : 0.22));
    g.addColorStop(1, alpha(p.accent, p.dark ? 0.1 : 0.08));
    ctx.fillStyle = p.dark ? p.bg2 : p.card;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = g;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const size = Math.min(box.w, box.h) * 0.36;
    ctx.font = `${s.f.displayWeight} ${size}px ${quote(s.f.display)}`;
    ctx.fillStyle = alpha(p.dark ? "#ffffff" : p.accent, p.dark ? 0.9 : 0.85);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(name), box.x + box.w / 2, box.y + box.h / 2 + size * 0.04);
  }
  ctx.restore();
}

/* ── Atmosphere ────────────────────────────────────────────────────────── */

/** The standard backdrop: diagonal gradient between the palette's two tones. */
export function paintBackdrop(s: Scene, angle: "diag" | "down" = "diag") {
  const { ctx, w, h, p } = s;
  const g = angle === "diag" ? ctx.createLinearGradient(0, 0, w, h) : ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.bg);
  g.addColorStop(1, p.dark ? mixTowards(p.bg, p.bg2, 0.55) : p.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function mixTowards(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) + ((((pb >> shift) & 255) - ((pa >> shift) & 255)) * t));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** A soft blurred light. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, strength: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, alpha(color, strength));
  g.addColorStop(0.55, alpha(color, strength * 0.35));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Thin concentric rings — a quiet focal decoration. */
export function rings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, count = 4, lineWidth = 2) {
  ctx.save();
  ctx.lineWidth = lineWidth;
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = alpha(color, 0.28 * (1 - i / (count + 1)));
    ctx.beginPath();
    ctx.arc(x, y, r * (1 - i * 0.2), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A grid of small dots, fading towards one corner. */
export function dotGrid(ctx: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number, step: number, color: string) {
  ctx.save();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = alpha(color, 0.1 + 0.35 * ((c + r) / (cols + rows)));
      ctx.beginPath();
      ctx.arc(x + c * step, y + r * step, step * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

let grainTile: HTMLCanvasElement | null = null;

/** Fine film grain over the whole canvas; takes the digital flatness off gradients. */
export function grain(s: Scene, strength = 0.06) {
  const { ctx, w, h } = s;
  if (typeof document === "undefined") return;
  if (!grainTile) {
    const size = 160;
    const tile = document.createElement("canvas");
    tile.width = size; tile.height = size;
    const tctx = tile.getContext("2d");
    if (!tctx) return;
    const img = tctx.createImageData(size, size);
    let seed = 1337;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0; // deterministic: preview and export match
      const v = seed >>> 24;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    grainTile = tile;
  }
  const pattern = ctx.createPattern(grainTile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ── Small components ──────────────────────────────────────────────────── */

/** A rounded label, measured so it can sit in a stack. */
export function pill(s: Scene, raw: string, o: { size: number; bg: string; color: string; maxWidth: number; outline?: string; upper?: boolean; weight?: number }): CustomBlock {
  if (!raw.trim()) return { kind: "custom", height: 0, width: 0, paint: () => undefined };
  const upper = o.upper ?? true;
  const text = layoutText(s, raw, {
    font: "body", weight: o.weight ?? 700, size: o.size, minSize: o.size * 0.7, color: o.color,
    maxWidth: o.maxWidth - o.size * 2, upper, tracking: upper ? 0.14 : 0,
  });
  const padX = o.size * 1.0, padY = o.size * 0.58;
  const width = text.width + padX * 2, height = text.size * 1.3 + padY * 2;
  return {
    kind: "custom", width, height,
    paint: (x, y) => {
      const { ctx } = s;
      roundRect(ctx, x, y, width, height, height / 2);
      ctx.fillStyle = o.bg;
      ctx.fill();
      if (o.outline) { ctx.lineWidth = Math.max(1.5, o.size * 0.08); ctx.strokeStyle = o.outline; ctx.stroke(); }
      paintText(s, { ...text, o: { ...text.o, align: "left" } }, x + padX, y + padY);
    },
  };
}

/** The call-to-action button. */
export function ctaButton(s: Scene, size: number, maxWidth: number): CustomBlock {
  const label = s.t.cta.trim();
  if (!label) return { kind: "custom", height: 0, width: 0, paint: () => undefined };
  const text = layoutText(s, label, { font: "body", weight: 700, size, minSize: size * 0.7, color: s.p.onAccent, maxWidth: maxWidth - size * 4.2 });
  const padX = size * 1.5, padY = size * 0.85, arrow = size * 1.1;
  const width = text.width + padX * 2 + arrow + size * 0.5, height = text.size * 1.3 + padY * 2;
  return {
    kind: "custom", width, height,
    paint: (x, y) => {
      const { ctx, p } = s;
      ctx.save();
      ctx.shadowColor = alpha(p.dark ? "#000000" : p.accent, p.dark ? 0.35 : 0.28);
      ctx.shadowBlur = size * 1.2;
      ctx.shadowOffsetY = size * 0.35;
      roundRect(ctx, x, y, width, height, height / 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.restore();
      paintText(s, { ...text, o: { ...text.o, align: "left" } }, x + padX, y + padY);
      // Arrow
      const ax = x + padX + text.width + size * 0.55, ay = y + height / 2;
      ctx.save();
      ctx.strokeStyle = p.onAccent;
      ctx.lineWidth = Math.max(2, size * 0.13);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax + arrow * 0.8, ay);
      ctx.moveTo(ax + arrow * 0.45, ay - arrow * 0.32); ctx.lineTo(ax + arrow * 0.8, ay); ctx.lineTo(ax + arrow * 0.45, ay + arrow * 0.32);
      ctx.stroke();
      ctx.restore();
    },
  };
}

/** "16 Oct 2026  •  JW Marriott, Pune" as one measured line (wraps to two when narrow). */
export function metaLine(s: Scene, size: number, maxWidth: number, color: string, weight = 600): TextBlock {
  const parts = [s.t.dateLabel.trim(), s.t.venueLabel.trim()].filter(Boolean);
  return layoutText(s, parts.join("   •   "), { font: "body", weight, size, minSize: size * 0.72, color, maxWidth, maxLines: 2, lineHeight: 1.35 });
}

/** Organiser mark for a corner: the logo on a small light plate, or the name. */
export function orgMark(s: Scene, x: number, y: number, height: number, align: "left" | "right" = "left", onImage = false) {
  const { ctx, p, a, t } = s;
  if (a.orgLogo) {
    const { iw, ih } = dims(a.orgLogo);
    const pad = height * 0.18;
    const innerH = height - pad * 2;
    const innerW = Math.min(innerH * (iw / ih), height * 3.2);
    const plateW = innerW + pad * 2;
    const px = align === "left" ? x : x - plateW;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = height * 0.25; ctx.shadowOffsetY = height * 0.06;
    roundRect(ctx, px, y, plateW, height, height * 0.24);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    drawContain(ctx, a.orgLogo, px + pad, y + pad, innerW, innerH);
    return;
  }
  if (!t.orgName.trim()) return;
  const b = layoutText(s, t.orgName, { font: "body", weight: 700, size: height * 0.42, color: onImage ? "#ffffff" : p.ink, maxWidth: s.w * 0.5, upper: true, tracking: 0.16 });
  paintText(s, { ...b, o: { ...b.o, align } }, x, y + (height - b.height) / 2);
}
