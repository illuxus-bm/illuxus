/**
 * Visual styles ("kits") for the Creative Studio.
 *
 * A kit decides how a design LOOKS — its background, the shape and framing of
 * photos, how labels and dividers are drawn, and the finishing texture —
 * while a layout decides where things GO. Every layout is drawn through a
 * kit, so each layout exists in six clearly different styles.
 *
 * A kit's picture frame keeps all of its decoration (rings, offset blocks,
 * borders) inside the box it was given, so layouts can reserve space for a
 * picture and know nothing will spill onto neighbouring text.
 */
import { alpha, mix } from "./studio-palette";
import {
  drawCover, glow, grain, layoutText, muted, note, paintBackdrop, paintText, pill, rings, roundRect,
  type Block, type CustomBlock, type Rect, type Scene, type StyleKit,
} from "./studio-draw";

/* ── Frame shapes ──────────────────────────────────────────────────────── */

type ShapeFn = (ctx: CanvasRenderingContext2D, r: Rect) => void;

/** Fully rounded ends — a circle when the box is square. */
const stadium: ShapeFn = (ctx, r) => roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) / 2);
const rounded = (frac: number): ShapeFn => (ctx, r) => roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * frac);
/** Round top, squared-off base. */
const arch: ShapeFn = (ctx, r) => {
  const rad = r.w > r.h * 1.25 ? r.h * 0.3 : Math.min(r.w / 2, r.h * 0.6), base = Math.min(r.w, r.h) * 0.05;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + rad);
  ctx.arcTo(r.x, r.y, r.x + rad, r.y, rad);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + rad, rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - base);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - base, r.y + r.h, base);
  ctx.lineTo(r.x + base, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - base, base);
  ctx.closePath();
};

const SOFT = rounded(0.07);

const shrink = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: Math.max(1, r.w - d * 2), h: Math.max(1, r.h - d * 2) });

/** Clip to `shape` over `inner`, paint the picture, and record the whole frame as one element. */
function framed(s: Scene, box: Rect, inner: Rect, shape: ShapeFn, paint: (inner: Rect) => void, label: string) {
  const { ctx } = s;
  note(s, "media", box.x, box.y, box.w, box.h, label);
  ctx.save();
  shape(ctx, inner);
  ctx.clip();
  muted(s, () => paint(inner));
  ctx.restore();
}

function shadowed(s: Scene, shape: ShapeFn, r: Rect, fill: string, strength = 0.3) {
  const { ctx, u } = s;
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${strength})`;
  ctx.shadowBlur = u * 3.2;
  ctx.shadowOffsetY = u * 1;
  shape(ctx, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/* ── Shared bits ───────────────────────────────────────────────────────── */

const LABEL = 2.1; // label text size, in units
const paletteTone = (s: Scene) => ({ ink: s.p.ink, muted: s.p.muted });
const bar = (s: Scene, width: number, thickness: number, color: string, radius = thickness / 2): CustomBlock => ({
  kind: "custom", width, height: thickness,
  paint: (x, y) => { roundRect(s.ctx, x, y, width, thickness, radius); s.ctx.fillStyle = color; s.ctx.fill(); },
});
const eyebrowText = (s: Scene, text: string, maxWidth: number, color: string) =>
  layoutText(s, text, { font: "body", weight: 700, size: s.u * 2.4, minSize: s.u * 1.8, color, maxWidth, upper: true, tracking: 0.2, lineHeight: 1.4 });

/** Colour that copy sits on when the event banner is the backdrop. */
const scrimOf = (s: Scene) => (s.p.dark ? s.p.bg : mix(s.p.ink, "#000000", 0.35));

/** The corner of the canvas furthest from the layout's focus. */
const far = (s: Scene, focus: { x: number; y: number }) => ({ x: focus.x < s.w / 2 ? s.w : 0, y: focus.y < s.h / 2 ? s.h : 0 });

/* ── 1. Glow — soft gradients, round photos with an accent ring ───────── */

const glowKit: StyleKit = {
  id: "glow", name: "Glow",
  backdrop: (s, focus) => {
    const { ctx, w, h, p } = s;
    paintBackdrop(s);
    const big = Math.max(w, h);
    glow(ctx, focus.x, focus.y, big * 0.6, p.accent, p.dark ? 0.3 : 0.2);
    const o = far(s, focus);
    glow(ctx, o.x, o.y, big * 0.55, p.dark ? p.bg2 : p.accent, p.dark ? 0.55 : 0.1);
  },
  tone: paletteTone,
  media: (s, box, paint, label = "", soft = false) => {
    const { ctx, p, u } = s;
    const shape = soft ? SOFT : stadium;
    const pad = Math.min(box.w, box.h) * (soft ? 0.05 : 0.075);
    const inner = shrink(box, pad);
    ctx.save();
    ctx.lineWidth = Math.max(1.5, u * 0.5);
    ctx.strokeStyle = p.accent;
    shape(ctx, shrink(box, pad * 0.5));
    ctx.stroke();
    if (!soft && Math.abs(box.w - box.h) < 2) {
      // A partial outer ring and a bead, only on round frames.
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2, r = box.w / 2 - ctx.lineWidth;
      ctx.lineWidth = Math.max(1, u * 0.25);
      ctx.strokeStyle = alpha(p.accent, 0.55);
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI * 0.2, Math.PI * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 1.3); ctx.stroke();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(cx + Math.cos(-Math.PI * 0.2) * r, cy + Math.sin(-Math.PI * 0.2) * r, Math.max(2, u * 0.75), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    shadowed(s, shape, inner, p.bg2);
    framed(s, box, inner, shape, paint, label);
  },
  label: (s, text, maxWidth) => pill(s, text, { size: s.u * LABEL, bg: alpha(s.p.accent, s.p.dark ? 0.16 : 0.12), color: s.p.accent, outline: alpha(s.p.accent, 0.55), maxWidth }),
  rule: (s, width) => bar(s, width, s.u * 0.55, s.p.accent),
  finish: (s) => grain(s, 0.06),
};

/* ── 2. Blocks — flat colour, bold geometric shapes, offset photo blocks ─ */

const blocksKit: StyleKit = {
  id: "blocks", name: "Blocks",
  backdrop: (s, focus) => {
    const { ctx, w, h, u, p } = s;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const o = far(s, focus);
    ctx.fillStyle = p.dark ? mix(p.bg, p.bg2, 0.8) : p.bg2;
    ctx.beginPath(); ctx.arc(o.x, o.y, Math.min(w, h) * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = alpha(p.accent, p.dark ? 0.9 : 0.85);
    ctx.beginPath(); ctx.arc(w - o.x, h - o.y, u * 11, 0, Math.PI * 2); ctx.fill();
  },
  tone: paletteTone,
  media: (s, box, paint, label = "") => {
    const { ctx, p } = s;
    const min = Math.min(box.w, box.h), off = min * 0.06, r = rounded(0.08);
    const inner: Rect = { x: box.x, y: box.y, w: box.w - off, h: box.h - off };
    r(ctx, { x: inner.x + off, y: inner.y + off, w: inner.w, h: inner.h });
    ctx.fillStyle = p.accent;
    ctx.fill();
    framed(s, box, inner, r, paint, label);
  },
  label: (s, text, maxWidth) => pill(s, text, { size: s.u * LABEL, bg: s.p.accent, color: s.p.onAccent, maxWidth, radius: s.u * 0.7 }),
  rule: (s, width) => bar(s, width * 0.7, s.u * 0.95, s.p.accent, 0),
  finish: (s) => grain(s, 0.03),
};

/* ── 3. Lines — fine grid, thin outlines, arched photos ───────────────── */

const linesKit: StyleKit = {
  id: "lines", name: "Lines",
  backdrop: (s, focus) => {
    const { ctx, w, h, u, p } = s;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, focus.x, focus.y, Math.max(w, h) * 0.55, p.dark ? p.bg2 : p.accent, p.dark ? 0.7 : 0.1);
    ctx.save();
    ctx.lineWidth = Math.max(1, u * 0.1);
    ctx.strokeStyle = alpha(p.ink, p.dark ? 0.07 : 0.06);
    const step = u * 6.2;
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.restore();
    const o = far(s, focus);
    rings(ctx, o.x, o.y, Math.min(w, h) * 0.5, p.accent, 3, Math.max(1, u * 0.18));
  },
  tone: paletteTone,
  media: (s, box, paint, label = "", soft = false) => {
    const { ctx, p, u } = s;
    const shape = soft ? SOFT : arch;
    const pad = Math.min(box.w, box.h) * 0.055;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, u * 0.28);
    ctx.strokeStyle = p.accent;
    shape(ctx, shrink(box, ctx.lineWidth / 2));
    ctx.stroke();
    ctx.restore();
    framed(s, box, shrink(box, pad), shape, paint, label);
  },
  label: (s, text, maxWidth) => {
    const lead = s.u * 4.5, space = s.u * 1.4;
    const t = eyebrowText(s, text, maxWidth - lead - space, s.p.accent);
    if (!t.lines.length) return { kind: "custom", width: 0, height: 0, paint: () => undefined };
    return {
      kind: "custom", width: lead + space + t.width, height: t.height,
      paint: (x, y) => {
        s.ctx.fillStyle = s.p.accent;
        s.ctx.fillRect(x, y + t.height / 2 - s.u * 0.12, lead, Math.max(1.5, s.u * 0.24));
        paintText(s, { ...t, o: { ...t.o, align: "left" } }, x + lead + space, y);
      },
    };
  },
  rule: (s, width) => bar(s, width * 1.5, Math.max(1.5, s.u * 0.2), alpha(s.p.ink, 0.45), 0),
  finish: (s) => grain(s, 0.04),
};

/* ── 4. Split — a diagonal two-tone ground, thick accent photo borders ── */

const splitKit: StyleKit = {
  id: "split", name: "Split",
  backdrop: (s, focus) => {
    const { ctx, w, h, u, p } = s;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    // The darker (or tinted) half sits away from the focus.
    const right = focus.x < w / 2;
    const top = right ? w * 0.6 : w * 0.4, bottom = right ? w * 0.36 : w * 0.64;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, p.dark ? mix(p.bg, p.bg2, 0.9) : p.bg2);
    g.addColorStop(1, p.dark ? mix(p.bg, p.bg2, 0.45) : mix(p.bg2, p.bg, 0.3));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (right) { ctx.moveTo(top, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(bottom, h); }
    else { ctx.moveTo(0, 0); ctx.lineTo(top, 0); ctx.lineTo(bottom, h); ctx.lineTo(0, h); }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(2, u * 0.5);
    ctx.beginPath(); ctx.moveTo(top, 0); ctx.lineTo(bottom, h); ctx.stroke();
  },
  tone: paletteTone,
  media: (s, box, paint, label = "", soft = false) => {
    const { ctx, p } = s;
    const r = soft ? SOFT : rounded(0.26);
    shadowed(s, r, box, p.accent, 0.25);
    r(ctx, box);
    ctx.fillStyle = p.accent;
    ctx.fill();
    framed(s, box, shrink(box, Math.min(box.w, box.h) * 0.035), r, paint, label);
  },
  label: (s, text, maxWidth) => pill(s, text, { size: s.u * LABEL, bg: s.p.accent, color: s.p.onAccent, maxWidth }),
  rule: (s, width) => bar(s, width, s.u * 0.55, s.p.accent),
  finish: (s) => grain(s, 0.05),
};

/* ── 5. Banner — the event banner, blurred, as the ground ─────────────── */

const bannerKit: StyleKit = {
  id: "banner", name: "Banner",
  backdrop: (s, focus) => {
    const { ctx, w, h, u, p, a } = s;
    if (!a.banner) { glowKit.backdrop(s, focus); return; }
    const scrim = scrimOf(s);
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
    const canBlur = typeof ctx.filter === "string";
    ctx.save();
    if (canBlur) ctx.filter = `blur(${Math.round(u * 2.6)}px) saturate(1.15)`;
    const bleed = u * 6; // hide the blurred edge
    drawCover(ctx, a.banner, -bleed, -bleed, w + bleed * 2, h + bleed * 2);
    ctx.restore();
    ctx.fillStyle = alpha(scrim, canBlur ? 0.74 : 0.9);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, focus.x, focus.y, Math.max(w, h) * 0.55, p.accent, 0.16);
  },
  tone: (s) => (s.a.banner ? { ink: "#ffffff", muted: "rgba(255,255,255,0.8)" } : paletteTone(s)),
  media: (s, box, paint, label = "", soft = false) => {
    const shape = soft ? SOFT : stadium;
    shadowed(s, shape, box, "#ffffff", 0.35);
    framed(s, box, shrink(box, Math.min(box.w, box.h) * 0.03), shape, paint, label);
  },
  label: (s, text, maxWidth) => {
    const onImage = !!s.a.banner || s.p.dark;
    return pill(s, text, {
      size: s.u * LABEL, maxWidth,
      bg: onImage ? "rgba(255,255,255,0.16)" : alpha(s.p.ink, 0.07),
      color: onImage ? "#ffffff" : s.p.ink,
      outline: onImage ? "rgba(255,255,255,0.4)" : alpha(s.p.ink, 0.25),
    });
  },
  rule: (s, width) => bar(s, width, s.u * 0.4, s.p.accent),
  finish: (s) => grain(s, 0.05),
};

/* ── 6. Frame — a quiet ground inside a fine printed frame ────────────── */

const frameKit: StyleKit = {
  id: "frame", name: "Frame",
  backdrop: (s, focus) => {
    const { ctx, w, h, p } = s;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, focus.x, focus.y, Math.max(w, h) * 0.7, p.dark ? p.bg2 : p.bg2, p.dark ? 0.75 : 0.9);
  },
  tone: paletteTone,
  media: (s, box, paint, label = "") => {
    const { ctx, p, u } = s;
    const r = rounded(0.05);
    shadowed(s, r, box, p.bg2, 0.32);
    framed(s, box, box, r, paint, label);
    ctx.save();
    ctx.lineWidth = Math.max(1, u * 0.16);
    ctx.strokeStyle = alpha(p.ink, 0.28);
    r(ctx, shrink(box, ctx.lineWidth / 2));
    ctx.stroke();
    ctx.restore();
  },
  label: (s, text, maxWidth) => eyebrowText(s, text, maxWidth, s.p.accent),
  rule: (s, width) => ({
    kind: "custom", width, height: s.u * 0.9,
    paint: (x, y) => {
      s.ctx.fillStyle = s.p.accent;
      s.ctx.fillRect(x, y, width, Math.max(1.5, s.u * 0.22));
      s.ctx.fillRect(x, y + s.u * 0.62, width * 0.55, Math.max(1.5, s.u * 0.22));
    },
  }),
  finish: (s) => {
    const { ctx, w, h, u, p } = s;
    const d = u * 3.1;
    ctx.save();
    ctx.lineWidth = Math.max(1, u * 0.16);
    ctx.strokeStyle = alpha(p.ink, 0.32);
    ctx.strokeRect(d, d, w - d * 2, h - d * 2);
    ctx.fillStyle = p.accent;
    const k = u * 1.1;
    for (const [x, y] of [[d, d], [w - d, d], [d, h - d], [w - d, h - d]]) ctx.fillRect(x - k / 2, y - k / 2, k, k);
    ctx.restore();
    grain(s, 0.04);
  },
};

export const STUDIO_KITS: StyleKit[] = [glowKit, blocksKit, linesKit, splitKit, bannerKit, frameKit];
export const kitById = (id: string) => STUDIO_KITS.find((k) => k.id === id) ?? STUDIO_KITS[0];
