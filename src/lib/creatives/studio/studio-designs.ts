/**
 * The Creative Studio's designs.
 *
 * Each design is a function that composes a whole image for a given size —
 * it is not a fixed template with slots. A design reads the canvas shape
 * (wide / square / tall) and lays itself out for it, sizes every line to fit
 * its box, and drops whatever content is missing, so the same design works
 * as a LinkedIn banner, an Instagram post and a story.
 *
 * Colour comes entirely from the palette and type from the font pair, so any
 * design × palette × font combination is on-brand and readable.
 */
import { alpha, mix } from "./studio-palette";
import {
  ctaButton, dotGrid, drawContain, drawCover, drawPortrait, gap, glow, grain, layoutText, metaLine, orgMark,
  paintBackdrop, paintStack, paintStackIn, paintText, pill, rings, roundRect, stackHeight, compact,
  type Block, type CustomBlock, type Scene,
} from "./studio-draw";

export type StudioKind = "event" | "speaker" | "lineup" | "sponsor";

export interface StudioDesign {
  id: string;
  name: string;
  kind: StudioKind;
  /** One line shown under the name in the picker. */
  blurb: string;
  draw: (s: Scene) => void;
}

/* ── Shared pieces ─────────────────────────────────────────────────────── */

/** A short accent bar that can sit in a stack. */
const rule = (s: Scene, width: number, color = s.p.accent, thickness = s.u * 0.55): CustomBlock => ({
  kind: "custom", width, height: thickness,
  paint: (x, y) => { roundRect(s.ctx, x, y, width, thickness, thickness / 2); s.ctx.fillStyle = color; s.ctx.fill(); },
});

/** Small tracked capitals above a headline. */
const eyebrow = (s: Scene, text: string, maxWidth: number, color = s.p.accent, size = s.u * 2.5) =>
  layoutText(s, text, { font: "body", weight: 700, size, minSize: size * 0.75, color, maxWidth, upper: true, tracking: 0.2, lineHeight: 1.4 });

/** Event name + date/venue, used as the sign-off on speaker and sponsor designs. */
function eventSignoff(s: Scene, maxWidth: number, ink = s.p.ink, muted = s.p.muted, scale = 1): Block[] {
  const { u } = s;
  return [
    layoutText(s, s.t.eventTitle, { font: "body", weight: 700, size: u * 3 * scale, minSize: u * 2.2 * scale, color: ink, maxWidth, maxLines: 2, lineHeight: 1.25 }),
    gap(u * 0.7),
    metaLine(s, u * 2.4 * scale, maxWidth, muted, 500),
  ];
}

/** Paint a stack so its bottom edge sits on `yBottom`, never rising above `yLimit`. Returns the top y. */
function paintStackUp(s: Scene, blocks: (Block | null | false | undefined)[], x: number, yBottom: number, align: "left" | "center" | "right" = "left", yLimit = s.m) {
  return paintStackIn(s, blocks, x, yLimit, yBottom, align, "bottom").top;
}

/** Paint a stack centred vertically between two y values (scaled down if it doesn't fit). */
function paintStackMid(s: Scene, blocks: (Block | null | false | undefined)[], x: number, y0: number, y1: number, align: "left" | "center" | "right" = "left") {
  return paintStackIn(s, blocks, x, y0, y1, align, "mid").top;
}

/** Atmosphere shared by the gradient-backed designs. */
function atmosphere(s: Scene, focus: { x: number; y: number }) {
  const { ctx, w, h, p } = s;
  paintBackdrop(s);
  const big = Math.max(w, h);
  glow(ctx, focus.x, focus.y, big * 0.6, p.accent, p.dark ? 0.3 : 0.2);
  glow(ctx, w - focus.x, h - focus.y, big * 0.55, p.dark ? p.bg2 : p.accent, p.dark ? 0.55 : 0.1);
}

/** Text colours for copy that sits on a photograph (always light on a dark scrim). */
const ON_IMAGE = { ink: "#ffffff", muted: "rgba(255,255,255,0.82)" };
const scrimColor = (s: Scene) => (s.p.dark ? s.p.bg : mix(s.p.ink, "#000000", 0.35));

/* ── Event ─────────────────────────────────────────────────────────────── */

/** Full-bleed banner with the copy over a colour-matched scrim. */
function eventHero(s: Scene) {
  const { ctx, w, h, u, m, a, p, shape } = s;
  const scrim = scrimColor(s);
  // Event banners usually carry their own lettering, so the banner gets a band
  // of its own and the copy sits on a colour-matched ground beside / below it.
  // On square / tall canvases the band takes the banner's own proportions so
  // nothing is cropped off it.
  const bw = a.banner ? ((a.banner as HTMLImageElement).naturalWidth || (a.banner as HTMLCanvasElement).width) : 16;
  const bh = a.banner ? ((a.banner as HTMLImageElement).naturalHeight || (a.banner as HTMLCanvasElement).height) : 9;
  const band = shape === "wide"
    ? { x: w * 0.47, y: 0, w: w * 0.53, h }
    : { x: 0, y: 0, w, h: Math.min(h * (shape === "tall" ? 0.45 : 0.54), Math.max(h * 0.3, (w * bh) / Math.max(1, bw))) };
  if (a.banner) {
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, shape === "wide" ? 0 : w, h, Math.max(w, h) * 0.6, p.dark ? p.bg2 : p.accent, p.dark ? 0.7 : 0.25);
    drawCover(ctx, a.banner, band.x, band.y, band.w, band.h, 0.5, 0.35);
  } else {
    atmosphere(s, { x: w * 0.85, y: h * 0.1 });
    rings(ctx, w * 0.82, h * 0.26, Math.min(w, h) * 0.34, p.accent, 5, u * 0.25);
  }

  if (a.banner) {
    // Melt the banner's inner edge into the ground.
    const g = shape === "wide"
      ? ctx.createLinearGradient(band.x, 0, band.x + band.w * 0.3, 0)
      : ctx.createLinearGradient(0, band.h, 0, band.h * 0.72);
    g.addColorStop(0, alpha(scrim, 1)); g.addColorStop(1, alpha(scrim, 0));
    ctx.fillStyle = g;
    ctx.fillRect(band.x, band.y, band.w, band.h + 1);
  }

  const onImage = !!a.banner || p.dark;
  const ink = onImage ? ON_IMAGE.ink : p.ink;
  const muted = onImage ? ON_IMAGE.muted : p.muted;
  const cw = shape === "wide" ? (a.banner ? band.x - m * 1.4 : w * 0.56) : w - m * 2;
  const blocks: Block[] = [
    pill(s, s.t.eyebrow, { size: u * 2.1, bg: p.accent, color: p.onAccent, maxWidth: cw }),
    gap(u * 2.6),
    layoutText(s, s.t.eventTitle, { font: "display", size: u * (shape === "wide" ? 8.6 : a.banner ? 7.8 : 9.4), minSize: u * 4.4, color: ink, maxWidth: cw, maxLines: shape === "wide" ? 4 : 3 }),
    gap(u * 2.2),
    layoutText(s, s.t.tagline, { font: "body", weight: 500, size: u * 3.3, minSize: u * 2.5, color: muted, maxWidth: cw * 0.96, maxLines: 2, lineHeight: 1.32 }),
    gap(u * 3),
    metaLine(s, u * 2.8, cw, ink),
    gap(u * 3.6),
    ctaButton(s, u * 2.7, cw),
  ];
  if (shape === "wide") paintStackMid(s, blocks, m, m + u * 9, h - m);
  else if (a.banner) paintStackMid(s, blocks, m, band.h + u * 1.5, h - m);
  else paintStackUp(s, blocks, m, h - m, "left", m + u * 9);
  // Left off the banner band on square / tall so it never covers the banner's own logo.
  if (shape === "wide" || !a.banner) orgMark(s, m, m, u * 7, "left", onImage);
  grain(s, 0.05);
}

/** Typography-led: no photograph needed. */
function eventType(s: Scene) {
  const { ctx, w, h, u, m, p, shape } = s;
  atmosphere(s, { x: w * 0.9, y: h * 0.05 });
  const r = Math.min(w, h) * (shape === "wide" ? 0.42 : 0.36);
  rings(ctx, w - m * 0.2, shape === "wide" ? h * 0.5 : h * 0.2, r, p.accent, 5, u * 0.22);
  dotGrid(ctx, w - m - u * 2.6 * 8, h - m - u * 2.6 * 4, 9, 5, u * 2.6, p.ink);

  const cw = shape === "wide" ? w * 0.62 : w - m * 2;
  const blocks: Block[] = [
    eyebrow(s, s.t.eyebrow, cw),
    gap(u * 2.4),
    layoutText(s, s.t.eventTitle, { font: "display", size: u * (shape === "tall" ? 12 : 11), minSize: u * 5.2, color: p.ink, maxWidth: cw, maxLines: shape === "wide" ? 3 : 5 }),
    gap(u * 3),
    rule(s, u * 11),
    gap(u * 3),
    layoutText(s, s.t.tagline, { font: "body", weight: 500, size: u * 3.4, minSize: u * 2.5, color: p.muted, maxWidth: cw * 0.94, maxLines: 3, lineHeight: 1.34 }),
    gap(u * 3.2),
    metaLine(s, u * 2.9, cw, p.ink),
    gap(u * 3.8),
    ctaButton(s, u * 2.7, cw),
  ];
  paintStackMid(s, blocks, m, m + u * 9, h - m);
  orgMark(s, m, m, u * 7);
  grain(s, 0.06);
}

/** The banner as a framed picture with the copy beside or beneath it. */
function eventFramed(s: Scene) {
  const { ctx, w, h, u, m, a, p, shape } = s;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, shape === "wide" ? w * 0.1 : w * 0.9, h * 0.95, Math.max(w, h) * 0.55, p.dark ? p.bg2 : p.accent, p.dark ? 0.6 : 0.12);

  const off = u * 2.2;
  const card = shape === "wide"
    ? { x: w * 0.5, y: m, w: w * 0.5 - m - off, h: h - m * 2 - off }
    : { x: m, y: m, w: w - m * 2 - off, h: h * 0.4 };
  const radius = u * 3.4;
  roundRect(ctx, card.x + off, card.y + off, card.w, card.h, radius);
  ctx.fillStyle = p.accent;
  ctx.fill();
  ctx.save();
  roundRect(ctx, card.x, card.y, card.w, card.h, radius);
  ctx.clip();
  if (a.banner) drawCover(ctx, a.banner, card.x, card.y, card.w, card.h);
  else {
    const g = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y + card.h);
    g.addColorStop(0, p.bg2); g.addColorStop(1, mix(p.bg2, p.accent, 0.45));
    ctx.fillStyle = g; ctx.fillRect(card.x, card.y, card.w, card.h);
    rings(ctx, card.x + card.w * 0.7, card.y + card.h * 0.4, Math.min(card.w, card.h) * 0.45, "#ffffff", 5, u * 0.25);
  }
  ctx.restore();

  const cw = shape === "wide" ? card.x - m * 1.9 : w - m * 2;
  const blocks: Block[] = [
    eyebrow(s, s.t.eyebrow, cw),
    gap(u * 2),
    layoutText(s, s.t.eventTitle, { font: "display", size: u * (shape === "wide" ? 8.6 : 7.8), minSize: u * 4.4, color: p.ink, maxWidth: cw, maxLines: shape === "wide" ? 4 : 3 }),
    gap(u * 2),
    layoutText(s, s.t.tagline, { font: "body", weight: 500, size: u * 3, minSize: u * 2.4, color: p.muted, maxWidth: cw, maxLines: 2, lineHeight: 1.32 }),
    gap(u * 2.6),
    metaLine(s, u * 2.6, cw, p.ink),
    gap(u * 3),
    ctaButton(s, u * 2.5, cw),
  ];
  if (shape === "wide") {
    orgMark(s, m, m, u * 7);
    paintStackMid(s, blocks, m, m + u * 9, h - m);
  } else {
    paintStackMid(s, blocks, m, card.y + card.h + off + u * 2, h - m);
    orgMark(s, card.x + u * 2.4, card.y + u * 2.4, u * 6.4);
  }
  grain(s, 0.04);
}

/* ── Speaker ───────────────────────────────────────────────────────────── */

const speakerOf = (s: Scene) => s.t.speaker ?? { name: "Speaker name", role: "", company: "" };

/** Round portrait with an accent ring. */
function speakerSpotlight(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = speakerOf(s);
  atmosphere(s, shape === "wide" ? { x: w * 0.2, y: h * 0.5 } : { x: w * 0.5, y: h * 0.28 });

  const d = shape === "wide" ? h * 0.64 : shape === "tall" ? w * 0.62 : h * 0.35;
  const cx = shape === "wide" ? m + d / 2 + u * 3 : w / 2;
  const cy = shape === "wide" ? h / 2 : shape === "tall" ? h * 0.3 : m + u * 8 + d / 2;

  // Rings behind the portrait
  ctx.save();
  ctx.lineWidth = u * 0.55;
  ctx.strokeStyle = p.accent;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2 + u * 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = u * 0.3;
  ctx.strokeStyle = alpha(p.accent, 0.55);
  ctx.beginPath(); ctx.arc(cx, cy, d / 2 + u * 4.6, -Math.PI * 0.2, Math.PI * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, d / 2 + u * 4.6, Math.PI * 0.85, Math.PI * 1.35); ctx.stroke();
  ctx.fillStyle = p.accent;
  const da = -Math.PI * 0.2;
  ctx.beginPath(); ctx.arc(cx + Math.cos(da) * (d / 2 + u * 4.6), cy + Math.sin(da) * (d / 2 + u * 4.6), u * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = u * 4; ctx.shadowOffsetY = u * 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fillStyle = p.bg2; ctx.fill();
  ctx.restore();
  drawPortrait(s, a.photo, sp.name, () => { ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); }, { x: cx - d / 2, y: cy - d / 2, w: d, h: d });

  const centred = shape !== "wide";
  const x0 = centred ? w / 2 : cx + d / 2 + u * 9;
  const cw = centred ? w - m * 2 : w - m - x0;
  const align = centred ? "center" : "left";
  const who: Block[] = [
    pill(s, s.t.eyebrow, { size: u * 2, bg: alpha(p.accent, p.dark ? 0.16 : 0.12), color: p.accent, outline: alpha(p.accent, 0.55), maxWidth: cw }),
    gap(u * 2.6),
    layoutText(s, sp.name, { font: "display", size: u * (shape === "wide" ? 9 : 8.4), minSize: u * 4.6, color: p.ink, maxWidth: cw, maxLines: 2 }),
    gap(u * 1.8),
    layoutText(s, sp.role, { font: "body", weight: 600, size: u * 3.3, minSize: u * 2.5, color: p.ink, maxWidth: cw, maxLines: 2, lineHeight: 1.3 }),
    gap(u * 0.6),
    layoutText(s, sp.company, { font: "body", weight: 500, size: u * 3, minSize: u * 2.4, color: p.muted, maxWidth: cw, maxLines: 1 }),
  ];
  const sign = eventSignoff(s, cw);
  if (centred) {
    const signTop = paintStackUp(s, sign, x0, h - m, align);
    ctx.fillStyle = alpha(p.ink, 0.18);
    ctx.fillRect(m, signTop - u * 2.6, w - m * 2, Math.max(1, u * 0.12));
    paintStackMid(s, who, x0, cy + d / 2 + u * 6.4, signTop - u * 4.4, align);
    orgMark(s, m, m, u * 6.5);
  } else {
    paintStackMid(s, [...who, gap(u * 3.2), rule(s, u * 9), gap(u * 2.6), ...sign], x0, m, h - m, align);
    orgMark(s, w - m, m, u * 6.5, "right");
  }
  grain(s, 0.06);
}

/** The photograph bleeds off the edge and fades into the palette. */
function speakerPortrait(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = speakerOf(s);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  const box = shape === "wide" ? { x: w * 0.44, y: 0, w: w * 0.56, h } : { x: 0, y: 0, w, h: h * (shape === "tall" ? 0.62 : 0.6) };
  drawPortrait(s, a.photo, sp.name, () => { ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); }, box);
  // Tint, then fade the inner edge into the background.
  ctx.fillStyle = alpha(p.dark ? p.bg : p.accent, p.dark ? 0.16 : 0.06);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const fade = shape === "wide"
    ? ctx.createLinearGradient(box.x, 0, box.x + box.w * 0.55, 0)
    : ctx.createLinearGradient(0, box.y + box.h, 0, box.y + box.h * 0.42);
  fade.addColorStop(0, alpha(p.bg, 1)); fade.addColorStop(0.35, alpha(p.bg, 0.82)); fade.addColorStop(1, alpha(p.bg, 0));
  ctx.fillStyle = fade;
  ctx.fillRect(box.x, box.y, box.w, box.h + 1);
  glow(ctx, shape === "wide" ? 0 : w * 0.1, h, Math.max(w, h) * 0.5, p.dark ? p.bg2 : p.accent, p.dark ? 0.6 : 0.1);

  const cw = shape === "wide" ? w * 0.46 - m : w - m * 2;
  const blocks: Block[] = [
    eyebrow(s, s.t.eyebrow, cw),
    gap(u * 2),
    layoutText(s, sp.name, { font: "display", size: u * (shape === "wide" ? 10 : 9.6), minSize: u * 4.8, color: p.ink, maxWidth: cw, maxLines: shape === "wide" ? 3 : 2 }),
    gap(u * 2),
    layoutText(s, sp.role, { font: "body", weight: 600, size: u * 3.3, minSize: u * 2.5, color: p.ink, maxWidth: cw, maxLines: 2, lineHeight: 1.3 }),
    gap(u * 0.6),
    layoutText(s, sp.company, { font: "body", weight: 500, size: u * 3, minSize: u * 2.4, color: p.muted, maxWidth: cw, maxLines: 1 }),
    gap(u * 3.2),
    rule(s, u * 9),
    gap(u * 2.6),
    ...eventSignoff(s, cw),
  ];
  if (shape === "wide") paintStackMid(s, blocks, m, m + u * 8, h - m);
  else paintStackUp(s, blocks, m, h - m);
  orgMark(s, m, m, u * 6.5, "left", shape !== "wide" && !!a.photo);
  grain(s, 0.05);
}

/** Magazine layout: a framed portrait offset on a colour block. */
function speakerEditorial(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = speakerOf(s);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, w * 0.95, h * 0.05, Math.max(w, h) * 0.5, p.dark ? p.bg2 : p.accent, p.dark ? 0.7 : 0.12);
  if (shape === "square") dotGrid(ctx, w - m - u * 2.6 * 7, h - m - u * 2.6 * 3, 8, 4, u * 2.6, p.ink);

  const off = u * 2.4;
  const sign = eventSignoff(s, shape === "wide" ? w * 0.42 : w - m * 2);
  const signH = stackHeight(sign);
  let photo: { x: number; y: number; w: number; h: number };
  if (shape === "wide") {
    const ph = h - m * 2 - off;
    const pw = Math.min(ph * 0.82, w * 0.36);
    photo = { x: w - m - off - pw, y: m, w: pw, h: ph };
  } else if (shape === "tall") {
    photo = { x: m, y: m + u * 10, w: w - m * 2 - off, h: h * 0.44 };
  } else {
    const pw = w * 0.44;
    photo = { x: w - m - off - pw, y: m + u * 2, w: pw, h: pw * 1.22 };
  }
  roundRect(ctx, photo.x + off, photo.y + off, photo.w, photo.h, u * 3);
  ctx.fillStyle = p.accent;
  ctx.fill();
  drawPortrait(s, a.photo, sp.name, () => roundRect(ctx, photo.x, photo.y, photo.w, photo.h, u * 3), photo);

  const colW = shape === "tall" ? w - m * 2 : photo.x - m - u * 5;
  const who: Block[] = [
    pill(s, s.t.eyebrow, { size: u * 1.9, bg: "rgba(0,0,0,0)", color: p.accent, outline: p.accent, maxWidth: colW }),
    gap(u * 2.8),
    layoutText(s, sp.name, { font: "display", size: u * (shape === "wide" ? 8.4 : 7.8), minSize: u * 4.2, color: p.ink, maxWidth: colW, maxLines: shape === "tall" ? 2 : 3 }),
    gap(u * 2.4),
    rule(s, u * 8),
    gap(u * 2.4),
    layoutText(s, sp.role, { font: "body", weight: 600, size: u * 3.1, minSize: u * 2.4, color: p.ink, maxWidth: colW, maxLines: 3, lineHeight: 1.3 }),
    gap(u * 0.6),
    layoutText(s, sp.company, { font: "body", weight: 500, size: u * 2.9, minSize: u * 2.3, color: p.muted, maxWidth: colW, maxLines: 2 }),
  ];
  const signTop = h - m - signH;
  paintStack(s, sign, m, signTop);
  if (shape === "tall") paintStackMid(s, who, m, photo.y + photo.h + off + u * 3, signTop - u * 3);
  else paintStackMid(s, who, m, m + (shape === "wide" ? u * 9 : u * 10), signTop - u * 3);
  orgMark(s, m, m, u * 6.5);
  grain(s, 0.04);
}

/* ── Line-up ───────────────────────────────────────────────────────────── */

function lineupGrid(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const people = (s.t.speakers ?? []).slice(0, 8);
  atmosphere(s, { x: w * 0.85, y: h * 0.05 });

  const cw = w - m * 2;
  const head: Block[] = [
    eyebrow(s, s.t.eyebrow, cw * 0.7),
    gap(u * 1.6),
    layoutText(s, s.t.eventTitle, { font: "display", size: u * (shape === "wide" ? 6.2 : 6.4), minSize: u * 3.6, color: p.ink, maxWidth: cw * 0.76, maxLines: 2 }),
  ];
  const headBottom = paintStack(s, head, m, m);
  orgMark(s, w - m, m, u * 6.5, "right");

  const cta = ctaButton(s, u * 2.4, cw * 0.45);
  const foot: Block[] = [metaLine(s, u * 2.6, cta.height ? cw - cta.width - u * 4 : cw, p.ink)];
  const footH = Math.max(stackHeight(foot), cta.height);
  const footTop = h - m - footH;
  paintStack(s, foot, m, footTop + (footH - stackHeight(foot)) / 2);
  if (cta.height) cta.paint(w - m - cta.width, footTop + (footH - cta.height) / 2);
  const gridBottom = footTop - u * 3.5;
  const gridTop = headBottom + u * 4;

  const n = Math.max(1, people.length);
  const cols = shape === "wide" ? Math.min(n, n <= 4 ? 4 : Math.ceil(n / 2)) : shape === "tall" ? (n <= 3 ? 1 : 2) : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cellW = cw / cols, cellH = (gridBottom - gridTop) / rows;
  const textH = u * 9.6; // name + role + the space above them
  const d = Math.max(u * 6, Math.min(cellW * 0.7, cellH - textH - u * 3.4));
  people.forEach((person, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    // Centre a short last row.
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const rowOffset = ((cols - inRow) * cellW) / 2;
    const cx = m + rowOffset + cellW * (col + 0.5);
    const top = gridTop + cellH * row + u * 1.4 + Math.max(0, (cellH - d - textH - u * 3.4) / 2);
    const cy = top + d / 2;
    ctx.save();
    ctx.lineWidth = u * 0.4; ctx.strokeStyle = p.accent;
    ctx.beginPath(); ctx.arc(cx, cy, d / 2 + u * 1.1, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    drawPortrait(s, a.photos?.[i], person.name, () => { ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); }, { x: cx - d / 2, y: cy - d / 2, w: d, h: d });
    paintStack(s, [
      layoutText(s, person.name, { font: "body", weight: 700, size: u * 2.7, minSize: u * 1.9, color: p.ink, maxWidth: cellW * 0.92, maxLines: 1 }),
      gap(u * 0.3),
      layoutText(s, person.role, { font: "body", weight: 500, size: u * 2.1, minSize: u * 1.6, color: p.muted, maxWidth: cellW * 0.92, maxLines: 1 }),
    ], cx, cy + d / 2 + u * 2.2, "center");
  });
  grain(s, 0.06);
}

/* ── Sponsor ───────────────────────────────────────────────────────────── */

const sponsorOf = (s: Scene) => s.t.sponsor ?? { name: "Partner name", tier: "" };

/** The logo on a light plate (so any logo reads), or the name set large. */
function logoPlate(s: Scene, box: { x: number; y: number; w: number; h: number }, radius: number) {
  const { ctx, u, a } = s;
  const sp = sponsorOf(s);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = u * 5; ctx.shadowOffsetY = u * 1.6;
  roundRect(ctx, box.x, box.y, box.w, box.h, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  const pad = Math.min(box.w, box.h) * 0.16;
  if (a.sponsorLogo) drawContain(ctx, a.sponsorLogo, box.x + pad, box.y + pad, box.w - pad * 2, box.h - pad * 2);
  else {
    const b = layoutText(s, sp.name, { font: "display", size: box.h * 0.26, minSize: box.h * 0.1, color: "#111827", maxWidth: box.w - pad * 2, maxLines: 2 });
    paintText(s, { ...b, o: { ...b.o, align: "center" } }, box.x + box.w / 2, box.y + (box.h - b.height) / 2);
  }
}

function sponsorCard(s: Scene) {
  const { w, h, u, m, p, a, shape } = s;
  const sp = sponsorOf(s);
  atmosphere(s, shape === "wide" ? { x: w * 0.8, y: h * 0.4 } : { x: w * 0.5, y: h * 0.45 });
  rings(s.ctx, shape === "wide" ? w * 0.76 : w * 0.5, shape === "wide" ? h * 0.5 : h * 0.5, Math.min(w, h) * (shape === "wide" ? 0.52 : 0.46), p.accent, 4, u * 0.2);

  if (shape === "wide") {
    const plate = { x: w * 0.56, y: h * 0.2, w: w * 0.44 - m, h: h * 0.6 };
    logoPlate(s, plate, u * 4);
    const cw = plate.x - m * 2;
    paintStackMid(s, [
      pill(s, s.t.eyebrow, { size: u * 2, bg: p.accent, color: p.onAccent, maxWidth: cw }),
      gap(u * 3),
      layoutText(s, s.t.tagline, { font: "display", size: u * 8, minSize: u * 4.2, color: p.ink, maxWidth: cw, maxLines: 3 }),
      gap(u * 2),
      a.sponsorLogo ? layoutText(s, sp.name, { font: "body", weight: 700, size: u * 3.6, minSize: u * 2.6, color: p.accent, maxWidth: cw, maxLines: 1 }) : null,
      gap(u * 3.2),
      rule(s, u * 9),
      gap(u * 2.6),
      ...eventSignoff(s, cw),
    ], m, m + u * 8, h - m);
    orgMark(s, m, m, u * 6.5);
  } else {
    const cw = w - m * 2;
    const sign = eventSignoff(s, cw);
    const signTop = paintStackUp(s, sign, w / 2, h - m, "center");
    const top: Block[] = [
      pill(s, s.t.eyebrow, { size: u * 2, bg: p.accent, color: p.onAccent, maxWidth: cw }),
      gap(u * 3),
      layoutText(s, s.t.tagline, { font: "display", size: u * 7.4, minSize: u * 4, color: p.ink, maxWidth: cw * 0.92, maxLines: 3 }),
    ];
    const topY = m + u * 11;
    const topBottom = paintStack(s, top, w / 2, topY, "center");
    const name = a.sponsorLogo ? layoutText(s, sp.name, { font: "body", weight: 700, size: u * 3.4, minSize: u * 2.6, color: p.accent, maxWidth: cw, maxLines: 1 }) : null;
    const nameH = name ? name.height + u * 3 : 0;
    const avail = signTop - u * 5 - topBottom - u * 5 - nameH;
    const pw = w * (shape === "tall" ? 0.74 : 0.62);
    const ph = Math.max(u * 14, Math.min(avail, pw * 0.62));
    const py = topBottom + u * 5 + Math.max(0, (avail - ph) / 2);
    logoPlate(s, { x: (w - pw) / 2, y: py, w: pw, h: ph }, u * 4);
    if (name) paintText(s, { ...name, o: { ...name.o, align: "center" } }, w / 2, py + ph + u * 3);
    orgMark(s, m, m, u * 6.5);
  }
  grain(s, 0.06);
}

/** White card with an accent frame — a formal announcement. */
function sponsorClean(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = sponsorOf(s);
  ctx.fillStyle = p.dark ? p.bg : p.bg2;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, w, 0, Math.max(w, h) * 0.6, p.accent, p.dark ? 0.3 : 0.18);
  const inset = m * 0.55;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)"; ctx.shadowBlur = u * 5; ctx.shadowOffsetY = u * 1.4;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, u * 3.5);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  // Accent corners
  ctx.save();
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, u * 3.5);
  ctx.clip();
  ctx.fillStyle = p.dark ? p.bg2 : p.accent;
  ctx.beginPath(); ctx.arc(w - inset, inset, u * 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = alpha(p.dark ? p.bg2 : p.accent, 0.14);
  ctx.beginPath(); ctx.arc(inset, h - inset, u * 20, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const dark = "#111827", soft = "rgba(17,24,39,0.62)";
  const accent = p.dark ? p.bg2 : p.accent;
  const cw = w - m * 2.6;
  const sign: Block[] = [
    layoutText(s, s.t.eventTitle, { font: "body", weight: 700, size: u * 3, minSize: u * 2.2, color: dark, maxWidth: cw, maxLines: 2, lineHeight: 1.25 }),
    gap(u * 0.7),
    metaLine(s, u * 2.4, cw, soft, 500),
  ];
  const signTop = paintStackUp(s, sign, w / 2, h - m * 1.5, "center");
  const top: Block[] = [
    eyebrow(s, s.t.eyebrow, cw, accent, u * 2.4),
    gap(u * 2),
    layoutText(s, s.t.tagline, { font: "display", size: u * (shape === "wide" ? 5.6 : 6.4), minSize: u * 3.6, color: dark, maxWidth: cw * 0.86, maxLines: 2 }),
  ];
  const topBottom = paintStack(s, top, w / 2, m * 1.5 + (shape === "wide" ? 0 : u * 4), "center");
  const name = a.sponsorLogo ? layoutText(s, sp.name, { font: "body", weight: 700, size: u * 3.2, minSize: u * 2.4, color: accent, maxWidth: cw, maxLines: 1 }) : null;
  const nameH = name ? name.height + u * 2 : 0;
  const y0 = topBottom + u * 3, y1 = signTop - u * 4 - nameH;
  const box = { x: w * 0.2, y: y0, w: w * 0.6, h: Math.max(u * 10, y1 - y0) };
  if (a.sponsorLogo) drawContain(ctx, a.sponsorLogo, box.x, box.y, box.w, box.h);
  else {
    const b = layoutText(s, sp.name, { font: "display", size: Math.min(box.h * 0.4, u * 11), minSize: u * 4, color: dark, maxWidth: box.w, maxLines: 2 });
    paintText(s, { ...b, o: { ...b.o, align: "center" } }, w / 2, box.y + (box.h - b.height) / 2);
  }
  if (name) paintText(s, { ...name, o: { ...name.o, align: "center" } }, w / 2, box.y + box.h + u * 2);
  ctx.fillStyle = "rgba(17,24,39,0.12)";
  ctx.fillRect(w * 0.3, signTop - u * 2.2, w * 0.4, Math.max(1, u * 0.12));
}

/* ── Registry ──────────────────────────────────────────────────────────── */

export const STUDIO_DESIGNS: StudioDesign[] = [
  { id: "event-hero", name: "Banner hero", kind: "event", blurb: "Your event banner, full bleed", draw: eventHero },
  { id: "event-type", name: "Bold type", kind: "event", blurb: "Headline-led, no photo needed", draw: eventType },
  { id: "event-framed", name: "Framed", kind: "event", blurb: "Banner as a framed picture", draw: eventFramed },
  { id: "speaker-spotlight", name: "Spotlight", kind: "speaker", blurb: "Round portrait with accent ring", draw: speakerSpotlight },
  { id: "speaker-portrait", name: "Portrait", kind: "speaker", blurb: "Photo fades into your colours", draw: speakerPortrait },
  { id: "speaker-editorial", name: "Editorial", kind: "speaker", blurb: "Magazine-style framed photo", draw: speakerEditorial },
  { id: "lineup-grid", name: "Line-up", kind: "lineup", blurb: "Up to 8 speakers together", draw: lineupGrid },
  { id: "sponsor-card", name: "Partner card", kind: "sponsor", blurb: "Logo on a plate, in your colours", draw: sponsorCard },
  { id: "sponsor-clean", name: "Clean", kind: "sponsor", blurb: "Formal white announcement", draw: sponsorClean },
];

export const designsFor = (kind: StudioKind) => STUDIO_DESIGNS.filter((d) => d.kind === kind);
export const designById = (id: string) => STUDIO_DESIGNS.find((d) => d.id === id) ?? null;
