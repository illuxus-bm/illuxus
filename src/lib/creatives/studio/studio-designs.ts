/**
 * The Creative Studio's designs.
 *
 * A design = a LAYOUT (where things go) drawn in a KIT (how things look).
 * There are eight layouts for each kind of graphic — event, speaker, line-up,
 * partner — and six kits, giving 48 designs per kind.
 *
 * How overlaps are prevented: a layout first divides the canvas into
 * rectangles — one for each picture, one for each group of text — that do not
 * intersect. Pictures are painted through the kit's frame, which keeps its
 * decoration inside the rectangle it was given; text is painted as a stack
 * that wraps to its rectangle's width and shrinks to its height. Nothing is
 * positioned relative to the size of some other element's content, so long
 * names or missing photos can't push one thing onto another. The audit in
 * `studio-audit.ts` renders every design at every size and verifies this.
 */
import { alpha, contrast, mix } from "./studio-palette";
import {
  ctaButton, drawContain, drawCover, drawPortrait, fitRect, gap, inset, layoutText, metaLine, muted, note, orgMark,
  orgMarkWidth, paintStackRect, paintText, rings, roundRect, splitH, splitV, stackHeight, compact,
  type Block, type CustomBlock, type Img, type Rect, type Scene, type StyleKit,
} from "./studio-draw";
import { STUDIO_KITS } from "./studio-kits";

export type StudioKind = "event" | "speaker" | "lineup" | "sponsor";

export interface StudioLayout {
  id: string;
  name: string;
  kind: StudioKind;
  blurb: string;
  draw: (s: Scene) => void;
}

export interface StudioDesign {
  id: string;
  name: string;
  kind: StudioKind;
  blurb: string;
  layout: StudioLayout;
  kit: StyleKit;
  draw: (s: Scene) => void;
}

/* ── Shared building blocks ────────────────────────────────────────────── */

const MARK = 6.5; // organiser mark height, in units
type Align = "left" | "center" | "right";

const inner = (s: Scene): Rect => ({ x: s.m, y: s.m, w: s.w - s.m * 2, h: s.h - s.m * 2 });
const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tone = (s: Scene) => s.k.tone(s);

/**
 * Paint the organiser's mark in a strip along the top of `r` and return what
 * is left below it. With no mark to show, all of `r` is returned.
 */
function header(s: Scene, r: Rect, align: Align = "left"): Rect {
  if (orgMarkWidth(s, s.u * MARK) <= 0) return r;
  const { ink } = tone(s);
  const x = align === "left" ? r.x : align === "center" ? r.x + r.w / 2 : r.x + r.w;
  orgMark(s, x, r.y, s.u * MARK, align, ink === "#ffffff");
  return splitV(r, s.u * MARK, s.u * 3)[1];
}

const titleText = (s: Scene, text: string, size: number, maxWidth: number, maxLines: number, color = tone(s).ink) =>
  layoutText(s, text, { font: "display", size: s.u * size, minSize: s.u * Math.max(3.4, size * 0.5), color, maxWidth, maxLines });

const bodyText = (s: Scene, text: string, size: number, maxWidth: number, maxLines: number, color: string, weight = 500) =>
  layoutText(s, text, { font: "body", weight, size: s.u * size, minSize: s.u * Math.max(1.7, size * 0.74), color, maxWidth, maxLines, lineHeight: 1.3 });

/** Event name + date / venue: the sign-off on speaker and partner designs. */
function signoff(s: Scene, maxWidth: number, colors = tone(s), scale = 1): Block[] {
  return [
    bodyText(s, s.t.eventTitle, 2.9 * scale, maxWidth, 2, colors.ink, 700),
    gap(s.u * 0.7),
    metaLine(s, s.u * 2.35 * scale, maxWidth, colors.muted, 500),
  ];
}

/** Label, name, role, company. */
function who(s: Scene, maxWidth: number, nameSize: number, nameLines: number, colors = tone(s), withLabel = true): Block[] {
  const sp = s.t.speaker ?? { name: "Speaker name", role: "", company: "" };
  return [
    withLabel ? s.k.label(s, s.t.eyebrow, maxWidth) : null,
    gap(s.u * 2.2),
    titleText(s, sp.name, nameSize, maxWidth, nameLines, colors.ink),
    gap(s.u * 1.6),
    bodyText(s, sp.role, 3.1, maxWidth, 2, colors.ink, 600),
    gap(s.u * 0.5),
    bodyText(s, sp.company, 2.8, maxWidth, 1, colors.muted),
  ].filter(Boolean) as Block[];
}

/** The standard event copy: label, title, tagline, date / venue, button. */
function eventCopy(s: Scene, maxWidth: number, titleSize: number, titleLines: number, withRule = false): Block[] {
  const { ink, muted: soft } = tone(s);
  return [
    s.k.label(s, s.t.eyebrow, maxWidth),
    gap(s.u * 2.4),
    titleText(s, s.t.eventTitle, titleSize, maxWidth, titleLines),
    withRule ? gap(s.u * 2.6) : null,
    withRule ? s.k.rule(s, s.u * 10) : null,
    gap(s.u * 2.2),
    bodyText(s, s.t.tagline, 3.2, maxWidth * 0.96, 2, soft),
    gap(s.u * 2.8),
    metaLine(s, s.u * 2.7, maxWidth, ink),
    gap(s.u * 3.2),
    ctaButton(s, s.u * 2.6, maxWidth),
  ].filter(Boolean) as Block[];
}

/** A person's photo in the kit's frame. */
function portrait(s: Scene, img: Img | null | undefined, name: string, box: Rect) {
  s.k.media(s, box, (r) => drawPortrait(s, img, name, () => { s.ctx.beginPath(); s.ctx.rect(r.x, r.y, r.w, r.h); }, r), name);
}

/**
 * The event banner in the kit's frame (a composed placeholder when there is
 * none). Banners carry their own lettering, so the frame takes the banner's
 * proportions rather than cropping it, with soft corners.
 */
function bannerPicture(s: Scene, area: Rect, alignX = 0.5, alignY = 0.5) {
  const b = s.a.banner;
  const bw = b ? ((b as HTMLImageElement).naturalWidth || (b as HTMLCanvasElement).width) : 0;
  const bh = b ? ((b as HTMLImageElement).naturalHeight || (b as HTMLCanvasElement).height) : 0;
  const box = bw && bh ? fitRect(area, bw / bh, alignX, alignY) : area;
  s.k.media(s, box, (r) => {
    const { ctx, p, a, u } = s;
    if (a.banner) { drawCover(ctx, a.banner, r.x, r.y, r.w, r.h); return; }
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, p.bg2); g.addColorStop(1, mix(p.bg2, p.accent, 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    rings(ctx, r.x + r.w * 0.7, r.y + r.h * 0.4, Math.min(r.w, r.h) * 0.45, "#ffffff", 5, u * 0.25);
  }, "event banner", true);
}

/** A colour that reads on the palette's card surface (the accent when it does). */
const onCardAccent = (s: Scene) => [s.p.accent, s.p.bg2, s.p.bg, "#111827"].find((c) => contrast(c, s.p.card) >= 3.5) ?? "#111827";
const cardTone = (s: Scene) => ({ ink: s.p.onCard, muted: alpha(s.p.onCard, 0.64) });

/** A raised card on the palette's card surface. */
function card(s: Scene, r: Rect, radius = s.u * 3.4) {
  const { ctx, u, p } = s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.26)"; ctx.shadowBlur = u * 4.5; ctx.shadowOffsetY = u * 1.4;
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = p.card;
  ctx.fill();
  ctx.restore();
}

/** Tracked small capitals for use on a card (kit labels are tuned for the backdrop). */
const cardLabel = (s: Scene, text: string, maxWidth: number) =>
  layoutText(s, text, { font: "body", weight: 700, size: s.u * 2.2, minSize: s.u * 1.7, color: onCardAccent(s), maxWidth, upper: true, tracking: 0.2, lineHeight: 1.4 });

/** Height a stack will need. */
const heightOf = (blocks: (Block | null | false | undefined)[]) => stackHeight(compact(blocks));

/* ══ EVENT ═════════════════════════════════════════════════════════════════ */

/** Headline-led; needs no photograph. */
function eventType(s: Scene) {
  const { w, h, shape } = s;
  s.k.backdrop(s, { x: w * 0.9, y: h * 0.08 });
  const body = header(s, inner(s));
  const text = shape === "wide" ? splitH(body, 0.68)[0] : body;
  paintStackRect(s, eventCopy(s, text.w, shape === "tall" ? 11.5 : 10.5, shape === "wide" ? 3 : 5, true), text);
  s.k.finish(s);
}

/** The banner, untouched, in a band of its own; the copy beside or below it. */
function eventHero(s: Scene) {
  const { ctx, w, h, u, m, a, p, shape } = s;
  if (!a.banner) { eventType(s); return; }
  const bw = (a.banner as HTMLImageElement).naturalWidth || (a.banner as HTMLCanvasElement).width;
  const bh = (a.banner as HTMLImageElement).naturalHeight || (a.banner as HTMLCanvasElement).height;
  const band: Rect = shape === "wide"
    ? { x: w * 0.5, y: 0, w: w * 0.5, h }
    : { x: 0, y: 0, w, h: Math.min(h * (shape === "tall" ? 0.42 : 0.47), Math.max(h * 0.3, (w * bh) / Math.max(1, bw))) };
  const text: Rect = shape === "wide"
    ? { x: m, y: m, w: band.x - m * 2, h: h - m * 2 }
    : { x: m, y: band.h + u * 3.5, w: w - m * 2, h: h - band.h - u * 3.5 - m };
  s.k.backdrop(s, mid(text));
  drawCover(ctx, a.banner, band.x, band.y, band.w, band.h, 0.5, 0.35);
  note(s, "media", band.x, band.y, band.w, band.h, "event banner");
  // A crisp accent edge where the banner meets the ground.
  ctx.fillStyle = p.accent;
  if (shape === "wide") ctx.fillRect(band.x - u * 0.3, 0, u * 0.6, h);
  else ctx.fillRect(0, band.h - u * 0.3, w, u * 0.6);
  const body = shape === "wide" ? header(s, text) : text;
  paintStackRect(s, eventCopy(s, body.w, shape === "wide" ? 7.6 : 6.8, shape === "wide" ? 4 : 2), body);
  s.k.finish(s);
}

/** The banner as a framed picture. */
function eventFramed(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.1, y: h * 0.9 } : { x: w * 0.9, y: h * 0.95 });
  const all = inner(s);
  if (shape === "wide") {
    const [left, right] = splitH(all, 0.5, u * 5);
    bannerPicture(s, right);
    const body = header(s, left);
    paintStackRect(s, eventCopy(s, body.w, 8, 4), body);
  } else {
    const [top, bottom] = splitV(all, shape === "tall" ? 0.4 : 0.42, u * 3.5);
    bannerPicture(s, top);
    paintStackRect(s, eventCopy(s, bottom.w, 7.4, 3), bottom);
  }
  s.k.finish(s);
}

/** Everything on the centre line. */
function eventCentered(s: Scene) {
  const { w, h } = s;
  s.k.backdrop(s, { x: w / 2, y: h * 0.42 });
  const body = header(s, inner(s), "center");
  const text = inset(body, body.w * 0.04, 0);
  paintStackRect(s, eventCopy(s, text.w, s.shape === "wide" ? 8.4 : 9.6, s.shape === "wide" ? 3 : 4, true), text, "center");
  s.k.finish(s);
}

/** A big date block leads; the title follows. */
function eventDate(s: Scene) {
  const { ctx, w, h, u, p, shape } = s;
  const parts = s.t.dateLabel.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) { eventType(s); return; }
  s.k.backdrop(s, { x: w * 0.12, y: h * 0.3 });
  const body = header(s, inner(s));
  const { ink, muted: soft } = tone(s);

  const dateBlock = (box: Rect) => {
    roundRect(ctx, box.x, box.y, box.w, box.h, u * 3);
    ctx.fillStyle = p.accent;
    ctx.fill();
    note(s, "text", box.x, box.y, box.w, box.h, "date");
    muted(s, () => {
      const pad = box.w * 0.12;
      paintStackRect(s, [
        layoutText(s, parts[0], { font: "display", size: box.h * 0.5, minSize: box.h * 0.2, color: p.onAccent, maxWidth: box.w - pad * 2, lineHeight: 1 }),
        gap(box.h * 0.03),
        layoutText(s, parts.slice(1).join(" "), { font: "body", weight: 700, size: box.h * 0.13, minSize: box.h * 0.07, color: p.onAccent, maxWidth: box.w - pad * 2, upper: true, tracking: 0.14 }),
      ], inset(box, pad), "center");
    });
  };
  const rest = (maxWidth: number): Block[] => [
    s.k.rule(s, u * 10),
    gap(u * 2.4),
    bodyText(s, s.t.tagline, 3.2, maxWidth, 3, soft),
    gap(u * 2.4),
    bodyText(s, s.t.venueLabel, 2.9, maxWidth, 2, ink, 600),
    gap(u * 3.2),
    ctaButton(s, u * 2.6, maxWidth),
  ];

  if (shape === "wide") {
    const side = Math.min(body.h * 0.74, body.w * 0.26);
    const [left, right] = splitH(body, side, u * 6);
    dateBlock(fitRect(left, 1));
    paintStackRect(s, [s.k.label(s, s.t.eyebrow, right.w), gap(u * 2.2), titleText(s, s.t.eventTitle, 7.6, right.w, 3), gap(u * 2.6), ...rest(right.w)], right);
  } else {
    const side = u * (shape === "tall" ? 30 : 27);
    const [top, bottom] = splitV(body, side, u * 4);
    const [badge, titleBox] = splitH(top, side, u * 4.5);
    dateBlock(badge);
    paintStackRect(s, [s.k.label(s, s.t.eyebrow, titleBox.w), gap(u * 2), titleText(s, s.t.eventTitle, 6.6, titleBox.w, 4)], titleBox);
    paintStackRect(s, rest(bottom.w), bottom, "left", "top");
  }
  s.k.finish(s);
}

/** A poster: label up top, the title large at the foot, details in a bar. */
function eventPoster(s: Scene) {
  const { ctx, w, h, u, m, p, shape } = s;
  s.k.backdrop(s, { x: w * 0.85, y: h * 0.2 });
  const barH = u * (shape === "wide" ? 15 : 16);
  const area: Rect = { x: m, y: m, w: w - m * 2, h: h - m - barH - u * 4 };
  const body = header(s, area);
  const { muted: soft } = tone(s);
  const top = paintStackRect(s, [s.k.label(s, s.t.eyebrow, body.w)], body, "left", "top");
  const main: Rect = { x: body.x, y: top.bottom + u * 2, w: body.w, h: body.y + body.h - top.bottom - u * 2 };
  paintStackRect(s, [
    bodyText(s, s.t.tagline, 3.3, main.w * 0.9, 2, soft),
    gap(u * 2.2),
    titleText(s, s.t.eventTitle, shape === "wide" ? 10 : 12, main.w, shape === "wide" ? 2 : 4),
  ], main, "left", "bottom");

  // Details bar across the foot.
  ctx.fillStyle = p.card;
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = p.accent;
  ctx.fillRect(0, h - barH, w, Math.max(2, u * 0.5));
  const bar: Rect = { x: m, y: h - barH + u * 2.2, w: w - m * 2, h: barH - u * 4.4 };
  const cta = ctaButton(s, u * 2.5, bar.w * 0.5);
  const [left, right] = cta.height ? splitH(bar, bar.w - cta.width - u * 4, u * 4) : [bar, null];
  paintStackRect(s, [metaLine(s, u * 2.7, left.w, p.onCard, 700)], left);
  if (right) paintStackRect(s, [cta], right, "right");
  s.k.finish(s);
}

/** The banner small beside the title, like a thumbnail; details beneath. */
function eventStrip(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.9, y: h * 0.9 });
  const body = header(s, inner(s));
  const { ink, muted: soft } = tone(s);
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.44, u * 5);
    bannerPicture(s, left);
    paintStackRect(s, eventCopy(s, right.w, 7.2, 3), right);
  } else {
    const [top, bottom] = splitV(body, shape === "tall" ? 0.3 : 0.34, u * 4);
    const [pic, titleBox] = splitH(top, 0.5, u * 4);
    bannerPicture(s, pic, 0, 0.5);
    paintStackRect(s, [s.k.label(s, s.t.eyebrow, titleBox.w), gap(u * 2), titleText(s, s.t.eventTitle, 6.4, titleBox.w, 4)], titleBox);
    paintStackRect(s, [
      s.k.rule(s, u * 10),
      gap(u * 2.6),
      bodyText(s, s.t.tagline, 3.6, bottom.w, 3, soft),
      gap(u * 2.8),
      metaLine(s, u * 3, bottom.w, ink),
      gap(u * 3.4),
      ctaButton(s, u * 2.7, bottom.w),
    ], bottom, "left", "top");
  }
  s.k.finish(s);
}

/** An admission ticket. */
function eventTicket(s: Scene) {
  const { ctx, w, h, u, p, shape } = s;
  s.k.backdrop(s, { x: w * 0.5, y: h * 0.5 });
  const r = header(s, inner(s));
  const stubH = u * (shape === "wide" ? 15 : 17);
  const cutY = r.y + r.h - stubH;
  const notch = u * 2.4, radius = u * 3.4;
  // Card with a notch bitten out of each side.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = u * 4.5; ctx.shadowOffsetY = u * 1.4;
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
  ctx.lineTo(r.x + r.w, cutY - notch);
  ctx.arc(r.x + r.w, cutY, notch, -Math.PI / 2, Math.PI / 2, true);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
  ctx.lineTo(r.x, cutY + notch);
  ctx.arc(r.x, cutY, notch, Math.PI / 2, -Math.PI / 2, true);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
  ctx.closePath();
  ctx.fillStyle = p.card;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.setLineDash([u * 1.2, u * 1.2]);
  ctx.lineWidth = Math.max(1.5, u * 0.22);
  ctx.strokeStyle = alpha(p.onCard, 0.28);
  ctx.beginPath(); ctx.moveTo(r.x + notch * 1.8, cutY); ctx.lineTo(r.x + r.w - notch * 1.8, cutY); ctx.stroke();
  ctx.restore();

  const c = cardTone(s);
  const pad = u * 5;
  const main: Rect = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: cutY - r.y - pad * 1.7 };
  paintStackRect(s, [
    cardLabel(s, s.t.eyebrow, main.w),
    gap(u * 2.2),
    titleText(s, s.t.eventTitle, shape === "wide" ? 7.6 : 9, main.w, shape === "wide" ? 3 : 4, c.ink),
    gap(u * 2.2),
    bodyText(s, s.t.tagline, 3.1, main.w * 0.95, 3, c.muted),
  ], main);
  const stub: Rect = { x: r.x + pad, y: cutY + u * 2.4, w: r.w - pad * 2, h: stubH - u * 4.8 };
  const cta = ctaButton(s, u * 2.4, stub.w * 0.5);
  const [left, right] = cta.height ? splitH(stub, stub.w - cta.width - u * 3.5, u * 3.5) : [stub, null];
  paintStackRect(s, [metaLine(s, u * 2.6, left.w, c.ink, 700)], left);
  if (right) paintStackRect(s, [cta], right, "right");
  s.k.finish(s);
}

/* ══ SPEAKER ═══════════════════════════════════════════════════════════════ */

const speakerName = (s: Scene) => s.t.speaker?.name ?? "Speaker";

/** Portrait centred above the name. */
function speakerSpotlight(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.2, y: h * 0.5 } : { x: w * 0.5, y: h * 0.3 });
  const body = header(s, inner(s));
  if (shape === "wide") {
    const [left, right] = splitH(body, Math.min(body.h, body.w * 0.4), u * 6);
    portrait(s, s.a.photo, speakerName(s), fitRect(left, 1));
    paintStackRect(s, [...who(s, right.w, 8.4, 2), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, right.w)], right);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3);
    paintStackRect(s, sign, foot, "center", "bottom");
    const [top, bottom] = splitV(rest, shape === "tall" ? 0.56 : 0.5, u * 3);
    portrait(s, s.a.photo, speakerName(s), fitRect(top, 1));
    paintStackRect(s, who(s, bottom.w * 0.94, shape === "tall" ? 9 : 7.8, 2), bottom, "center");
  }
  s.k.finish(s);
}

/** The photograph runs off the edge; the copy has the other half to itself. */
function speakerBleed(s: Scene) {
  const { ctx, w, h, u, m, p, shape } = s;
  const photo: Rect = shape === "wide" ? { x: w * 0.54, y: 0, w: w * 0.46, h } : { x: 0, y: 0, w, h: h * (shape === "tall" ? 0.54 : 0.5) };
  const text: Rect = shape === "wide"
    ? { x: m, y: m, w: photo.x - m * 2, h: h - m * 2 }
    : { x: m, y: photo.h + u * 3.5, w: w - m * 2, h: h - photo.h - u * 3.5 - m };
  s.k.backdrop(s, mid(text));
  drawPortrait(s, s.a.photo, speakerName(s), () => { ctx.beginPath(); ctx.rect(photo.x, photo.y, photo.w, photo.h); }, photo);
  ctx.fillStyle = p.accent;
  if (shape === "wide") ctx.fillRect(photo.x - u * 0.3, 0, u * 0.6, h);
  else ctx.fillRect(0, photo.h - u * 0.3, w, u * 0.6);

  if (shape === "wide") {
    const body = header(s, text);
    paintStackRect(s, [...who(s, body.w, 8.6, 3), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, body.w)], body);
  } else {
    // The organiser's mark shares the sign-off row, so it never sits on the photo.
    const markW = orgMarkWidth(s, u * MARK);
    const signW = markW ? text.w - markW - u * 4 : text.w;
    const sign = signoff(s, signW);
    const [rest, foot] = splitV(text, text.h - Math.max(heightOf(sign), markW ? u * MARK : 0), u * 2.6);
    paintStackRect(s, sign, { ...foot, w: signW }, "left", "bottom");
    if (markW) orgMark(s, foot.x + foot.w, foot.y + foot.h - u * MARK, u * MARK, "right", tone(s).ink === "#ffffff");
    paintStackRect(s, who(s, rest.w, 8.4, 2), rest);
  }
  s.k.finish(s);
}

/** Magazine layout: a tall framed portrait beside the name. */
function speakerEditorial(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.95, y: h * 0.05 });
  const body = header(s, inner(s));
  if (shape === "tall") {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3);
    paintStackRect(s, sign, foot, "left", "bottom");
    const [top, bottom] = splitV(rest, 0.56, u * 3.5);
    portrait(s, s.a.photo, speakerName(s), top);
    paintStackRect(s, who(s, bottom.w, 8.4, 2), bottom);
  } else if (shape === "wide") {
    const [left, right] = splitH(body, 0.58, u * 5);
    portrait(s, s.a.photo, speakerName(s), fitRect(right, 0.8, 1, 0.5));
    paintStackRect(s, [...who(s, left.w, 8, 3), gap(u * 3), s.k.rule(s, u * 8), gap(u * 2.6), ...signoff(s, left.w)], left);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
    paintStackRect(s, sign, foot, "left", "bottom");
    const [left, right] = splitH(rest, 0.5, u * 5);
    portrait(s, s.a.photo, speakerName(s), fitRect(right, 0.8, 1, 0.5));
    paintStackRect(s, [...who(s, left.w, 7.2, 3), gap(u * 2.4), s.k.rule(s, u * 8)], left);
  }
  s.k.finish(s);
}

/** The speaker on a raised card; the event beside or below. */
function speakerCard(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.5, y: h * 0.45 });
  const body = header(s, inner(s));
  const c = cardTone(s);
  const sp = s.t.speaker ?? { name: "Speaker name", role: "", company: "" };
  const inCard = (r: Rect) => {
    card(s, r);
    const box = inset(r, u * 4);
    const text: Block[] = [
      titleText(s, sp.name, 6.4, box.w, 2, c.ink),
      gap(u * 1.2),
      bodyText(s, sp.role, 2.8, box.w, 2, c.ink, 600),
      gap(u * 0.4),
      bodyText(s, sp.company, 2.6, box.w, 1, c.muted),
    ];
    const [top, bottom] = splitV(box, box.h - heightOf(text), u * 3);
    portrait(s, s.a.photo, sp.name, fitRect(top, 1));
    paintStackRect(s, text, bottom, "center", "bottom");
  };
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.4, u * 6);
    inCard(left);
    const { ink, muted: soft } = tone(s);
    paintStackRect(s, [
      s.k.label(s, s.t.eyebrow, right.w),
      gap(u * 2.4),
      titleText(s, s.t.eventTitle, 6.8, right.w, 3),
      gap(u * 2.4),
      s.k.rule(s, u * 9),
      gap(u * 2.4),
      metaLine(s, u * 2.8, right.w, ink),
      gap(u * 1),
      bodyText(s, s.t.tagline, 2.8, right.w, 2, soft),
    ], right);
  } else {
    const foot: Block[] = [s.k.label(s, s.t.eyebrow, body.w), gap(u * 2), ...signoff(s, body.w)];
    const [top, bottom] = splitV(body, body.h - heightOf(foot), u * 3.5);
    inCard(inset(top, top.w * (shape === "tall" ? 0.02 : 0.1), 0));
    paintStackRect(s, foot, bottom, "center", "bottom");
  }
  s.k.finish(s);
}

/** The name leads, set large; a smaller portrait anchors the corner. */
function speakerNameFirst(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.1, y: h * 0.15 });
  const body = header(s, inner(s));
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.62, u * 5);
    paintStackRect(s, [...who(s, left.w, 9.6, 3), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, left.w)], left);
    portrait(s, s.a.photo, speakerName(s), fitRect(right, 1));
  } else {
    const [top, bottom] = splitV(body, shape === "tall" ? 0.5 : 0.52, u * 3.5);
    paintStackRect(s, who(s, top.w, shape === "tall" ? 11 : 10, 3), top, "left", "top");
    const [left, right] = splitH(bottom, 0.54, u * 4);
    paintStackRect(s, [s.k.rule(s, u * 8), gap(u * 2.4), ...signoff(s, left.w)], left, "left", "bottom");
    portrait(s, s.a.photo, speakerName(s), fitRect(right, 1, 1, 1));
  }
  s.k.finish(s);
}

/** The name on a solid accent band. */
function speakerBand(s: Scene) {
  const { ctx, w, h, u, p, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.25, y: h * 0.5 } : { x: w * 0.5, y: h * 0.3 });
  const body = header(s, inner(s));
  const sp = s.t.speaker ?? { name: "Speaker name", role: "", company: "" };
  const { ink, muted: soft } = tone(s);
  const nameBand = (maxWidth: number, full: boolean): CustomBlock => {
    const padX = u * 3.2, padY = u * 1.8;
    const t = titleText(s, sp.name, 7, maxWidth - padX * 2, 2, p.onAccent);
    const width = full ? maxWidth : t.width + padX * 2, height = t.height + padY * 2;
    return {
      kind: "custom", width, height,
      paint: (x, y) => {
        roundRect(ctx, x, y, width, height, u * 1.6);
        ctx.fillStyle = p.accent;
        ctx.fill();
        note(s, "text", x, y, width, height, sp.name);
        muted(s, () => paintText(s, { ...t, o: { ...t.o, align: full ? "center" : "left" } }, full ? x + width / 2 : x + padX, y + padY));
      },
    };
  };
  const details = (maxWidth: number): Block[] => [
    gap(u * 2.2),
    bodyText(s, sp.role, 3.1, maxWidth, 2, ink, 600),
    gap(u * 0.5),
    bodyText(s, sp.company, 2.8, maxWidth, 1, soft),
  ];
  if (shape === "wide") {
    const [left, right] = splitH(body, Math.min(body.h, body.w * 0.4), u * 6);
    portrait(s, s.a.photo, sp.name, fitRect(left, 1));
    paintStackRect(s, [s.k.label(s, s.t.eyebrow, right.w), gap(u * 2.4), nameBand(right.w, false), ...details(right.w), gap(u * 3.2), ...signoff(s, right.w)], right);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3);
    paintStackRect(s, sign, foot, "center", "bottom");
    const lower: Block[] = [s.k.label(s, s.t.eyebrow, rest.w), gap(u * 2.2), nameBand(rest.w, true), ...details(rest.w * 0.94)];
    const [top, bottom] = splitV(rest, rest.h - heightOf(lower), u * 3);
    portrait(s, s.a.photo, sp.name, fitRect(top, 1));
    paintStackRect(s, lower, bottom, "center", "bottom");
  }
  s.k.finish(s);
}

/** Photo and name side by side, like a profile header. */
function speakerProfile(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.15, y: h * 0.3 });
  const body = header(s, inner(s));
  const sp = s.t.speaker ?? { name: "Speaker name", role: "", company: "" };
  const { ink, muted: soft } = tone(s);
  const side = shape === "wide" ? Math.min(body.h * 0.6, body.w * 0.24) : body.w * (shape === "tall" ? 0.5 : 0.46);
  const [top, bottom] = splitV(body, side, u * 3.5);
  const [pic, nameBox] = splitH(top, side, u * 4.5);
  portrait(s, s.a.photo, sp.name, pic);
  paintStackRect(s, [s.k.label(s, s.t.eyebrow, nameBox.w), gap(u * 2), titleText(s, sp.name, shape === "wide" ? 8 : 7, nameBox.w, 3)], nameBox);
  const details = (maxWidth: number): Block[] => [
    s.k.rule(s, u * 8),
    gap(u * 2.2),
    bodyText(s, sp.role, 3.2, maxWidth, 2, ink, 600),
    gap(u * 0.5),
    bodyText(s, sp.company, 2.9, maxWidth, 1, soft),
  ];
  if (shape === "wide") {
    const [left, right] = splitH(bottom, 0.5, u * 5);
    paintStackRect(s, details(left.w), left, "left", "top");
    paintStackRect(s, signoff(s, right.w), right, "right", "bottom");
  } else {
    const sign = signoff(s, bottom.w);
    const [rest, foot] = splitV(bottom, bottom.h - heightOf(sign), u * 2.6);
    paintStackRect(s, sign, foot, "left", "bottom");
    paintStackRect(s, details(rest.w), rest, "left", "top");
  }
  s.k.finish(s);
}

/** A wide, cinematic photo with the credits beneath. */
function speakerCinema(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.9, y: h * 0.9 });
  const body = header(s, inner(s));
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.52, u * 5.5);
    portrait(s, s.a.photo, speakerName(s), left);
    paintStackRect(s, [...who(s, right.w, 7.6, 3), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, right.w)], right);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3);
    paintStackRect(s, sign, foot, "left", "bottom");
    const [top, bottom] = splitV(rest, shape === "tall" ? 0.5 : 0.48, u * 3.5);
    portrait(s, s.a.photo, speakerName(s), top);
    paintStackRect(s, who(s, bottom.w, 8, 2), bottom, "left", "top");
  }
  s.k.finish(s);
}

/* ══ LINE-UP ═══════════════════════════════════════════════════════════════ */

const peopleOf = (s: Scene) => (s.t.speakers ?? []).slice(0, 8);

/** Label + event title on the left, the organiser's mark on the right. Returns the rest. */
function lineupHead(s: Scene, r: Rect, align: Align = "left", titleSize = 6): Rect {
  const { u } = s;
  if (align === "center") {
    const body = header(s, r, "center");
    const blocks: Block[] = [s.k.label(s, s.t.eyebrow, body.w), gap(u * 1.6), titleText(s, s.t.eventTitle, titleSize, body.w * 0.9, 2)];
    const [top, rest] = splitV(body, heightOf(blocks), u * 3.5);
    paintStackRect(s, blocks, top, "center", "top");
    return rest;
  }
  const markW = orgMarkWidth(s, u * MARK);
  const textW = markW ? r.w - markW - u * 4 : r.w;
  const blocks: Block[] = [s.k.label(s, s.t.eyebrow, textW), gap(u * 1.6), titleText(s, s.t.eventTitle, titleSize, textW, 2)];
  const headH = Math.max(heightOf(blocks), markW ? u * MARK : 0);
  const [top, rest] = splitV(r, headH, u * 3.5);
  paintStackRect(s, blocks, { ...top, w: textW }, "left", "top");
  if (markW) orgMark(s, r.x + r.w, r.y, u * MARK, "right", tone(s).ink === "#ffffff");
  return rest;
}

/** Date / venue on the left, button on the right. Returns the rest above it. */
function lineupFoot(s: Scene, r: Rect, align: Align = "left"): Rect {
  const { u } = s;
  const { ink } = tone(s);
  const cta = ctaButton(s, u * 2.4, r.w * 0.45);
  if (align === "center") {
    const blocks: Block[] = [metaLine(s, u * 2.6, r.w, ink), gap(u * 2.2), cta];
    if (heightOf(blocks) <= 0) return r;
    const [rest, foot] = splitV(r, r.h - heightOf(blocks), u * 3.2);
    paintStackRect(s, blocks, foot, "center", "bottom");
    return rest;
  }
  const metaW = cta.height ? r.w - cta.width - u * 4 : r.w;
  const meta = metaLine(s, u * 2.6, metaW, ink);
  const footH = Math.max(meta.height, cta.height);
  if (footH <= 0) return r;
  const [rest, foot] = splitV(r, r.h - footH, u * 3.2);
  paintStackRect(s, [meta], { ...foot, w: metaW });
  if (cta.height) paintStackRect(s, [cta], foot, "right");
  return rest;
}

const colsFor = (s: Scene, n: number) =>
  s.shape === "wide" ? (n <= 4 ? n : Math.ceil(n / 2)) : s.shape === "tall" ? (n <= 3 ? 1 : 2) : n <= 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;

/** Split `r` into `n` cells, `cols` per row, with a short last row centred. */
function cells(r: Rect, n: number, cols: number, gapPx: number): Rect[] {
  const rows = Math.ceil(n / cols);
  const cw = (r.w - gapPx * (cols - 1)) / cols, ch = (r.h - gapPx * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const offset = ((cols - inRow) * (cw + gapPx)) / 2;
    return { x: r.x + offset + col * (cw + gapPx), y: r.y + row * (ch + gapPx), w: cw, h: ch };
  });
}

/** One person: photo above, name and role below — all inside `cell`. */
function personCell(s: Scene, cell: Rect, i: number, colors = tone(s)) {
  const { u } = s;
  const person = peopleOf(s)[i];
  const nameSize = Math.max(1.7, Math.min(2.8, (cell.w / u) * 0.1));
  const text: Block[] = [
    bodyText(s, person.name, nameSize, cell.w, 1, colors.ink, 700),
    gap(u * 0.3),
    bodyText(s, person.role, nameSize * 0.78, cell.w, 1, colors.muted),
  ];
  const [top, bottom] = splitV(cell, cell.h - heightOf(text), u * 1.4);
  portrait(s, s.a.photos?.[i], person.name, fitRect(top, 1));
  paintStackRect(s, text, bottom, "center", "bottom");
}

function lineupGridBase(s: Scene, align: Align, stagger = false) {
  const { w, h, u } = s;
  const people = peopleOf(s);
  s.k.backdrop(s, { x: w * 0.85, y: h * 0.05 });
  let area = lineupHead(s, inner(s), align);
  area = lineupFoot(s, area, align);
  const cols = colsFor(s, people.length);
  if (stagger && cols > 1) {
    // Every cell gives up `drop` of its height; alternate columns sit lower by
    // that amount, so the stagger never leaves a cell's own row.
    const rows = Math.ceil(people.length / cols);
    const drop = (area.h / rows) * 0.16;
    cells(area, people.length, cols, u * 2.6)
      .forEach((c, i) => personCell(s, { ...c, h: c.h - drop, y: c.y + (Math.round((c.x - area.x) / (c.w + u * 2.6) * 2) % 4 >= 2 ? drop : 0) }, i));
  } else {
    cells(area, people.length, cols, u * 2.6).forEach((c, i) => personCell(s, c, i));
  }
  s.k.finish(s);
}

const lineupGrid = (s: Scene) => lineupGridBase(s, "left");
const lineupCentered = (s: Scene) => lineupGridBase(s, "center");
const lineupStagger = (s: Scene) => lineupGridBase(s, "left", true);

/** Rows: a small photo (or a number) with the name and role beside it. */
function lineupList(s: Scene, numbered: boolean) {
  const { ctx, w, h, u, p, shape } = s;
  const people = peopleOf(s);
  s.k.backdrop(s, { x: w * 0.1, y: h * 0.9 });
  let area = lineupHead(s, inner(s));
  area = lineupFoot(s, area);
  const { ink, muted: soft } = tone(s);
  const cols = shape === "tall" ? 1 : people.length > (shape === "wide" ? 2 : 4) ? 2 : 1;
  const rows = Math.max(1, Math.ceil(people.length / cols));
  const colGap = u * 5, rowGap = u * 1.8;
  const cw = (area.w - colGap * (cols - 1)) / cols;
  const rh = Math.min((area.h - rowGap * (rows - 1)) / rows, u * 15);
  const usedH = rh * rows + rowGap * (rows - 1);
  const y0 = area.y + (area.h - usedH) / 2;
  people.forEach((person, i) => {
    // Fill column by column so reading order runs downwards.
    const col = Math.floor(i / rows), row = i % rows;
    const r: Rect = { x: area.x + col * (cw + colGap), y: y0 + row * (rh + rowGap), w: cw, h: rh };
    const lead = Math.min(rh, cw * 0.3);
    const [left, right] = splitH(r, lead, u * 2.6);
    if (numbered) {
      const n = layoutText(s, String(i + 1).padStart(2, "0"), { font: "display", size: lead * 0.62, minSize: lead * 0.3, color: p.accent, maxWidth: left.w, lineHeight: 1 });
      paintStackRect(s, [n], left, "left");
      if (row < rows - 1) {
        ctx.fillStyle = alpha(ink, 0.16);
        ctx.fillRect(r.x, r.y + r.h + rowGap / 2, r.w, Math.max(1, u * 0.1));
      }
    } else {
      portrait(s, s.a.photos?.[i], person.name, fitRect(left, 1));
    }
    const size = Math.max(2, Math.min(3.2, (rh / u) * 0.24));
    paintStackRect(s, [
      bodyText(s, person.name, size, right.w, 1, ink, 700),
      gap(u * 0.35),
      bodyText(s, person.role, size * 0.78, right.w, 2, soft),
    ], right);
  });
  s.k.finish(s);
}
const lineupRows = (s: Scene) => lineupList(s, false);
const lineupNumbered = (s: Scene) => lineupList(s, true);

/** One headliner, large; everyone else in a grid. */
function lineupFeatured(s: Scene) {
  const { w, h, u, shape } = s;
  const people = peopleOf(s);
  if (people.length < 2) { lineupGrid(s); return; }
  s.k.backdrop(s, { x: w * 0.15, y: h * 0.4 });
  let area = lineupHead(s, inner(s));
  area = lineupFoot(s, area);
  const [first, rest] = shape === "wide" ? splitH(area, 0.32, u * 5) : splitV(area, shape === "tall" ? 0.42 : 0.46, u * 3.5);
  const others = people.length - 1;
  const cols = shape === "wide" ? Math.ceil(others / (others > 3 ? 2 : 1)) : shape === "tall" ? (others > 3 ? Math.ceil(others / 2) : others) : others > 4 ? Math.ceil(others / 2) : others;
  if (shape === "wide") personCell(s, first, 0);
  else {
    // Headliner: photo left, name large beside it.
    const { muted: soft } = tone(s);
    const [pic, text] = splitH(first, Math.min(first.h, first.w * 0.44), u * 4.5);
    portrait(s, s.a.photos?.[0], people[0].name, fitRect(pic, 1));
    paintStackRect(s, [titleText(s, people[0].name, 6.4, text.w, 3), gap(u * 1.4), bodyText(s, people[0].role, 2.8, text.w, 3, soft), gap(u * 2), s.k.rule(s, u * 7)], text);
  }
  cells(rest, others, Math.max(1, cols), u * 2.6).forEach((c, i) => personCell(s, c, i + 1));
  s.k.finish(s);
}

/** Every speaker on a card of their own. */
function lineupCards(s: Scene) {
  const { w, h, u } = s;
  const people = peopleOf(s);
  s.k.backdrop(s, { x: w * 0.5, y: h * 0.5 });
  let area = lineupHead(s, inner(s));
  area = lineupFoot(s, area);
  const c = cardTone(s);
  cells(area, people.length, colsFor(s, people.length), u * 2.4).forEach((cell, i) => {
    card(s, cell, u * 2.4);
    personCell(s, inset(cell, Math.min(cell.w, cell.h) * 0.09), i, c);
  });
  s.k.finish(s);
}

/** The event details on a panel; the speakers beside it. */
function lineupPanel(s: Scene) {
  const { ctx, w, h, u, p, shape } = s;
  const people = peopleOf(s);
  s.k.backdrop(s, { x: w * 0.85, y: h * 0.5 });
  const all = inner(s);
  const [panel, grid] = shape === "tall" ? splitV(all, 0.3, u * 4) : splitH(all, shape === "wide" ? 0.34 : 0.4, u * 4.5);
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, u * 3);
  ctx.fillStyle = tone(s).ink === "#ffffff" ? "rgba(255,255,255,0.08)" : alpha(p.ink, 0.055);
  ctx.fill();
  ctx.fillStyle = p.accent;
  roundRect(ctx, panel.x, panel.y, Math.max(3, u * 0.7), panel.h, u * 0.35);
  ctx.fill();
  const body = header(s, inset(panel, u * 4, u * 3.6));
  const { ink } = tone(s);
  paintStackRect(s, [
    s.k.label(s, s.t.eyebrow, body.w),
    gap(u * 2),
    titleText(s, s.t.eventTitle, shape === "tall" ? 6.4 : 5.6, body.w, 4),
    gap(u * 2.2),
    metaLine(s, u * 2.4, body.w, ink),
    gap(u * 2.8),
    ctaButton(s, u * 2.3, body.w),
  ], body, "left", shape === "tall" ? "mid" : "bottom");
  const cols = shape === "tall" ? (people.length <= 3 ? people.length : Math.ceil(people.length / 2)) : people.length <= 2 ? 1 : people.length <= 6 ? 2 : 3;
  cells(grid, people.length, Math.max(1, cols), u * 2.4).forEach((c, i) => personCell(s, c, i));
  s.k.finish(s);
}

/* ══ PARTNER ═══════════════════════════════════════════════════════════════ */

const sponsorOf = (s: Scene) => s.t.sponsor ?? { name: "Partner name", tier: "" };

/** A white plate with a soft shadow, recorded as one picture. */
function plate(s: Scene, box: Rect, radius: number, label: string) {
  const { ctx, u } = s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = u * 4.5; ctx.shadowOffsetY = u * 1.4;
  roundRect(ctx, box.x, box.y, box.w, box.h, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  note(s, "media", box.x, box.y, box.w, box.h, label);
}

/** The partner's logo on a light plate (so any logo reads), or their name set large. */
function logoPlate(s: Scene, box: Rect, round = false) {
  const { ctx, u, a } = s;
  const sp = sponsorOf(s);
  plate(s, box, round ? Math.min(box.w, box.h) / 2 : u * 3.6, `${sp.name} logo`);
  const area = inset(box, Math.min(box.w, box.h) * (round ? 0.24 : 0.16));
  if (a.sponsorLogo) drawContain(ctx, a.sponsorLogo, area.x, area.y, area.w, area.h);
  else muted(s, () => paintStackRect(s, [layoutText(s, sp.name, { font: "display", size: area.h * 0.36, minSize: area.h * 0.12, color: "#111827", maxWidth: area.w, maxLines: 2 })], area, "center"));
}

/** Partner name line, shown only when the logo doesn't already spell it out. */
const partnerName = (s: Scene, maxWidth: number) =>
  s.a.sponsorLogo ? bodyText(s, sponsorOf(s).name, 3.3, maxWidth, 1, tone(s).ink === "#ffffff" && !s.p.dark ? "#ffffff" : s.p.accent, 700) : null;

const headline = (s: Scene, size: number, maxWidth: number, lines = 3) => titleText(s, s.t.tagline, size, maxWidth, lines);

/** Headline beside (or above) the logo plate. */
function sponsorCard(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.8, y: h * 0.45 } : { x: w * 0.5, y: h * 0.5 });
  const body = header(s, inner(s));
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.54, u * 6);
    logoPlate(s, fitRect(right, 1.5));
    paintStackRect(s, [s.k.label(s, s.t.eyebrow, left.w), gap(u * 2.6), headline(s, 7.6, left.w), gap(u * 1.8), partnerName(s, left.w), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, left.w)], left);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
    paintStackRect(s, sign, foot, "center", "bottom");
    const top: Block[] = [s.k.label(s, s.t.eyebrow, rest.w), gap(u * 2.6), headline(s, 7.2, rest.w * 0.92)];
    const [head, plateArea] = splitV(rest, heightOf(top), u * 4);
    paintStackRect(s, top, head, "center", "top");
    const name = partnerName(s, rest.w);
    const [plateBox, nameBox] = name ? splitV(plateArea, plateArea.h - name.height, u * 2.4) : [plateArea, null];
    logoPlate(s, fitRect(inset(plateBox, plateBox.w * 0.08, 0), 1.7));
    if (name && nameBox) paintStackRect(s, [name], nameBox, "center", "bottom");
  }
  s.k.finish(s);
}

/** A formal white announcement card. */
function sponsorClean(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = sponsorOf(s);
  s.k.backdrop(s, { x: w, y: 0 });
  // Inset far enough that the kit's backdrop frames the card.
  const sheet = inset({ x: 0, y: 0, w, h }, m * 1.35);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.24)"; ctx.shadowBlur = u * 5; ctx.shadowOffsetY = u * 1.4;
  roundRect(ctx, sheet.x, sheet.y, sheet.w, sheet.h, u * 3.5);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  const accent = [p.accent, p.bg2, p.bg, "#111827"].find((c) => contrast(c, "#ffffff") >= 3.5) ?? "#111827";
  ctx.save();
  roundRect(ctx, sheet.x, sheet.y, sheet.w, sheet.h, u * 3.5);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(sheet.x + sheet.w, sheet.y, u * 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = alpha(accent, 0.13);
  ctx.beginPath(); ctx.arc(sheet.x, sheet.y + sheet.h, u * 18, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const dark = "#111827", soft = "rgba(17,24,39,0.62)";
  const body = inset(sheet, u * 6, u * 5);
  const sign: Block[] = [bodyText(s, s.t.eventTitle, 2.9, body.w, 2, dark, 700), gap(u * 0.7), metaLine(s, u * 2.35, body.w, soft, 500)];
  const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
  paintStackRect(s, sign, foot, "center", "bottom");
  const top: Block[] = [
    layoutText(s, s.t.eyebrow, { font: "body", weight: 700, size: u * 2.3, minSize: u * 1.8, color: accent, maxWidth: rest.w * 0.7, upper: true, tracking: 0.2, lineHeight: 1.4 }),
    gap(u * 1.8),
    titleText(s, s.t.tagline, shape === "wide" ? 5.4 : 6.2, rest.w * 0.74, 2, dark),
  ];
  const [head, logoArea] = splitV(rest, heightOf(top), u * 3);
  paintStackRect(s, top, head, "center", "top");
  const name = a.sponsorLogo ? bodyText(s, sp.name, 3.1, rest.w, 1, accent, 700) : null;
  const [logoBox, nameBox] = name ? splitV(logoArea, logoArea.h - name.height, u * 2) : [logoArea, null];
  const area = inset(logoBox, logoBox.w * 0.16, 0);
  if (a.sponsorLogo) { drawContain(ctx, a.sponsorLogo, area.x, area.y, area.w, area.h); note(s, "media", area.x, area.y, area.w, area.h, `${sp.name} logo`); }
  else paintStackRect(s, [titleText(s, sp.name, Math.min(11, (area.h / u) * 0.4), area.w, 2, dark)], area, "center");
  if (name && nameBox) paintStackRect(s, [name], nameBox, "center", "bottom");
  s.k.finish(s);
}

/** The logo first, large; the words underneath. */
function sponsorPlateFirst(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.25, y: h * 0.5 } : { x: w * 0.5, y: h * 0.3 });
  const body = header(s, inner(s));
  const copy = (maxWidth: number): Block[] => [s.k.label(s, s.t.eyebrow, maxWidth), gap(u * 2.4), headline(s, 6.8, maxWidth), gap(u * 1.6), partnerName(s, maxWidth)].filter(Boolean) as Block[];
  if (shape === "wide") {
    const [left, right] = splitH(body, 0.42, u * 6);
    logoPlate(s, fitRect(left, 1.35));
    paintStackRect(s, [...copy(right.w), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, right.w)], right);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
    paintStackRect(s, sign, foot, "left", "bottom");
    const [top, bottom] = splitV(rest, shape === "tall" ? 0.42 : 0.44, u * 4);
    logoPlate(s, top);
    paintStackRect(s, copy(bottom.w), bottom, "left", "top");
  }
  s.k.finish(s);
}

/** The headline set very large; the logo small in the corner. */
function sponsorBigType(s: Scene) {
  const { w, h, u, shape } = s;
  s.k.backdrop(s, { x: w * 0.1, y: h * 0.15 });
  const body = header(s, inner(s));
  const [top, bottom] = splitV(body, shape === "wide" ? 0.56 : 0.6, u * 3.5);
  paintStackRect(s, [s.k.label(s, s.t.eyebrow, top.w), gap(u * 2.6), headline(s, shape === "wide" ? 9.4 : 11, top.w, shape === "wide" ? 2 : 4), gap(u * 1.8), partnerName(s, top.w)], top, "left", "top");
  const [left, right] = splitH(bottom, 0.52, u * 5);
  paintStackRect(s, [s.k.rule(s, u * 8), gap(u * 2.4), ...signoff(s, left.w)], left, "left", "bottom");
  logoPlate(s, fitRect(right, 1.6, 1, 1));
  s.k.finish(s);
}

/** A round seal. */
function sponsorBadge(s: Scene) {
  const { ctx, w, h, u, p, shape } = s;
  s.k.backdrop(s, shape === "wide" ? { x: w * 0.25, y: h * 0.5 } : { x: w * 0.5, y: h * 0.42 });
  const body = header(s, inner(s));
  const seal = (area: Rect) => {
    const box = fitRect(area, 1);
    ctx.save();
    ctx.lineWidth = Math.max(1.5, u * 0.4);
    ctx.strokeStyle = p.accent;
    ctx.setLineDash([u * 0.9, u * 1.1]);
    ctx.beginPath(); ctx.arc(box.x + box.w / 2, box.y + box.h / 2, box.w / 2 - ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    logoPlate(s, inset(box, box.w * 0.07), true);
  };
  const copy = (maxWidth: number): Block[] => [s.k.label(s, s.t.eyebrow, maxWidth), gap(u * 2.4), headline(s, 6.6, maxWidth), gap(u * 1.6), partnerName(s, maxWidth)].filter(Boolean) as Block[];
  if (shape === "wide") {
    const [left, right] = splitH(body, Math.min(body.h, body.w * 0.38), u * 6);
    seal(left);
    paintStackRect(s, [...copy(right.w), gap(u * 3), s.k.rule(s, u * 9), gap(u * 2.6), ...signoff(s, right.w)], right);
  } else {
    const sign = signoff(s, body.w);
    const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
    paintStackRect(s, sign, foot, "center", "bottom");
    const text = copy(rest.w * 0.94);
    const [top, bottom] = splitV(rest, rest.h - heightOf(text), u * 3.5);
    seal(top);
    paintStackRect(s, text, bottom, "center", "bottom");
  }
  s.k.finish(s);
}

/** Organiser × partner, side by side. */
function sponsorCollab(s: Scene) {
  const { ctx, w, h, u, a, shape } = s;
  s.k.backdrop(s, { x: w * 0.5, y: h * 0.5 });
  const all = inner(s);
  const { ink } = tone(s);
  const sign = signoff(s, all.w);
  const [rest, foot] = splitV(all, all.h - heightOf(sign), u * 3.5);
  paintStackRect(s, sign, foot, "center", "bottom");
  const top: Block[] = [s.k.label(s, s.t.eyebrow, rest.w), gap(u * 2.4), headline(s, shape === "wide" ? 6.4 : 7, rest.w * 0.92, 2)];
  const [head, pair] = splitV(rest, heightOf(top), u * 4);
  paintStackRect(s, top, head, "center", "top");

  const cross = u * 7;
  const row = fitRect(pair, shape === "tall" ? 1.5 : 2.6);
  const plateW = (row.w - cross) / 2;
  const leftBox: Rect = { x: row.x, y: row.y, w: plateW, h: row.h };
  const rightBox: Rect = { x: row.x + plateW + cross, y: row.y, w: plateW, h: row.h };
  plate(s, leftBox, u * 3.6, "organiser plate");
  const padded = inset(leftBox, Math.min(leftBox.w, leftBox.h) * 0.16);
  if (a.orgLogo) drawContain(ctx, a.orgLogo, padded.x, padded.y, padded.w, padded.h);
  else muted(s, () => paintStackRect(s, [layoutText(s, s.t.orgName || s.t.eventTitle, { font: "display", size: padded.h * 0.3, minSize: padded.h * 0.1, color: "#111827", maxWidth: padded.w, maxLines: 3 })], padded, "center"));
  logoPlate(s, rightBox);
  // ×
  const cx = row.x + plateW + cross / 2, cy = row.y + row.h / 2, k = u * 1.5;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, u * 0.5);
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.stroke();
  ctx.restore();
  s.k.finish(s);
}

/** Logo and credit together on one card. */
function sponsorInline(s: Scene) {
  const { ctx, w, h, u, p, a, shape } = s;
  const sp = sponsorOf(s);
  s.k.backdrop(s, { x: w * 0.5, y: h * 0.55 });
  const body = header(s, inner(s));
  const sign = signoff(s, body.w);
  const [rest, foot] = splitV(body, body.h - heightOf(sign), u * 3.5);
  paintStackRect(s, sign, foot, "center", "bottom");
  const top: Block[] = [s.k.label(s, s.t.eyebrow, rest.w), gap(u * 2.4), headline(s, shape === "wide" ? 6.4 : 7, rest.w * 0.92, 2)];
  const [head, area] = splitV(rest, heightOf(top), u * 4);
  paintStackRect(s, top, head, "center", "top");

  const r = fitRect(area, shape === "tall" ? 1.25 : 2.3);
  card(s, r);
  const c = cardTone(s);
  const stacked = shape === "tall";
  const [logoBox, textBox] = stacked ? splitV(inset(r, u * 4), 0.55, u * 3) : splitH(inset(r, u * 4), 0.44, u * 4);
  if (a.sponsorLogo) { drawContain(ctx, a.sponsorLogo, logoBox.x, logoBox.y, logoBox.w, logoBox.h); note(s, "media", logoBox.x, logoBox.y, logoBox.w, logoBox.h, `${sp.name} logo`); }
  else paintStackRect(s, [titleText(s, sp.name.slice(0, 2), Math.min(16, (logoBox.h / u) * 0.6), logoBox.w, 1, onCardAccent(s))], logoBox, "center");
  ctx.fillStyle = alpha(p.onCard, 0.14);
  if (stacked) ctx.fillRect(r.x + u * 4, textBox.y - u * 1.5, r.w - u * 8, Math.max(1, u * 0.14));
  else ctx.fillRect(textBox.x - u * 2, r.y + u * 4, Math.max(1, u * 0.14), r.h - u * 8);
  const tier = sp.tier.trim();
  paintStackRect(s, [
    cardLabel(s, tier ? (/partner|sponsor/i.test(tier) ? tier : `${tier} partner`) : "Partner", textBox.w),
    gap(u * 1.2),
    titleText(s, sp.name, 6, textBox.w, 2, c.ink),
  ], textBox, stacked ? "center" : "left");
  s.k.finish(s);
}

/** The words up top; the logo in a full-width bar along the foot. */
function sponsorFooterBar(s: Scene) {
  const { ctx, w, h, u, m, p, a, shape } = s;
  const sp = sponsorOf(s);
  s.k.backdrop(s, { x: w * 0.85, y: h * 0.2 });
  const barH = u * (shape === "wide" ? 19 : 21);
  const area: Rect = { x: m, y: m, w: w - m * 2, h: h - m - barH - u * 4 };
  const body = header(s, area);
  paintStackRect(s, [
    s.k.label(s, s.t.eyebrow, body.w),
    gap(u * 2.6),
    headline(s, shape === "wide" ? 8 : 9.4, body.w, shape === "wide" ? 2 : 3),
    gap(u * 3),
    s.k.rule(s, u * 9),
    gap(u * 2.6),
    ...signoff(s, body.w),
  ], body);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = p.accent;
  ctx.fillRect(0, h - barH, w, Math.max(2, u * 0.5));
  const bar: Rect = { x: m, y: h - barH + u * 3.4, w: w - m * 2, h: barH - u * 6.8 };
  const dark = "#111827";
  if (a.sponsorLogo) {
    const [left, right] = splitH(bar, 0.5, u * 4);
    paintStackRect(s, [
      layoutText(s, "In partnership with", { font: "body", weight: 600, size: u * 2.1, minSize: u * 1.7, color: "rgba(17,24,39,0.6)", maxWidth: left.w, upper: true, tracking: 0.16, lineHeight: 1.4 }),
      gap(u * 0.6),
      bodyText(s, sp.name, 3.6, left.w, 1, dark, 700),
    ], left);
    const logo = fitRect(right, 2.4, 1, 0.5);
    drawContain(ctx, a.sponsorLogo, logo.x, logo.y, logo.w, logo.h);
    note(s, "media", logo.x, logo.y, logo.w, logo.h, `${sp.name} logo`);
  } else {
    paintStackRect(s, [titleText(s, sp.name, Math.min(8, (bar.h / u) * 0.6), bar.w, 1, dark)], bar, "center");
  }
  s.k.finish(s);
}

/* ══ Registry ══════════════════════════════════════════════════════════════ */

export const STUDIO_LAYOUTS: StudioLayout[] = [
  { id: "event-hero", name: "Banner hero", kind: "event", blurb: "Your banner, with the details beside it", draw: eventHero },
  { id: "event-type", name: "Bold type", kind: "event", blurb: "Headline-led, no photo needed", draw: eventType },
  { id: "event-framed", name: "Framed", kind: "event", blurb: "Banner as a framed picture", draw: eventFramed },
  { id: "event-centered", name: "Centred", kind: "event", blurb: "Everything on the centre line", draw: eventCentered },
  { id: "event-date", name: "Save the date", kind: "event", blurb: "A big date block leads", draw: eventDate },
  { id: "event-poster", name: "Poster", kind: "event", blurb: "Huge title, details in a bar", draw: eventPoster },
  { id: "event-strip", name: "Thumbnail", kind: "event", blurb: "Banner small beside the title", draw: eventStrip },
  { id: "event-ticket", name: "Ticket", kind: "event", blurb: "An admission ticket", draw: eventTicket },

  { id: "speaker-spotlight", name: "Spotlight", kind: "speaker", blurb: "Portrait centred above the name", draw: speakerSpotlight },
  { id: "speaker-bleed", name: "Full bleed", kind: "speaker", blurb: "Photo runs off the edge", draw: speakerBleed },
  { id: "speaker-editorial", name: "Editorial", kind: "speaker", blurb: "Tall framed portrait, magazine style", draw: speakerEditorial },
  { id: "speaker-card", name: "Card", kind: "speaker", blurb: "The speaker on a raised card", draw: speakerCard },
  { id: "speaker-name", name: "Name first", kind: "speaker", blurb: "Name set large, small portrait", draw: speakerNameFirst },
  { id: "speaker-band", name: "Name band", kind: "speaker", blurb: "Name on a solid colour band", draw: speakerBand },
  { id: "speaker-profile", name: "Profile", kind: "speaker", blurb: "Photo and name side by side", draw: speakerProfile },
  { id: "speaker-cinema", name: "Cinema", kind: "speaker", blurb: "Wide photo, credits beneath", draw: speakerCinema },

  { id: "lineup-grid", name: "Grid", kind: "lineup", blurb: "Photos in a tidy grid", draw: lineupGrid },
  { id: "lineup-rows", name: "List", kind: "lineup", blurb: "Photo with name and role beside", draw: lineupRows },
  { id: "lineup-featured", name: "Headliner", kind: "lineup", blurb: "One speaker large, the rest below", draw: lineupFeatured },
  { id: "lineup-cards", name: "Cards", kind: "lineup", blurb: "Each speaker on a card", draw: lineupCards },
  { id: "lineup-centered", name: "Centred", kind: "lineup", blurb: "Centred title and grid", draw: lineupCentered },
  { id: "lineup-numbered", name: "Numbered", kind: "lineup", blurb: "Names only, no photos needed", draw: lineupNumbered },
  { id: "lineup-panel", name: "Panel", kind: "lineup", blurb: "Details on a panel beside the grid", draw: lineupPanel },
  { id: "lineup-stagger", name: "Staggered", kind: "lineup", blurb: "An offset, lively grid", draw: lineupStagger },

  { id: "sponsor-card", name: "Partner card", kind: "sponsor", blurb: "Headline with the logo on a plate", draw: sponsorCard },
  { id: "sponsor-clean", name: "Announcement", kind: "sponsor", blurb: "Formal white card", draw: sponsorClean },
  { id: "sponsor-plate", name: "Logo first", kind: "sponsor", blurb: "The logo large, words beneath", draw: sponsorPlateFirst },
  { id: "sponsor-type", name: "Big type", kind: "sponsor", blurb: "Huge headline, logo in the corner", draw: sponsorBigType },
  { id: "sponsor-badge", name: "Seal", kind: "sponsor", blurb: "Logo in a round seal", draw: sponsorBadge },
  { id: "sponsor-collab", name: "Together", kind: "sponsor", blurb: "Your logo × the partner's", draw: sponsorCollab },
  { id: "sponsor-inline", name: "Credit card", kind: "sponsor", blurb: "Logo and credit on one card", draw: sponsorInline },
  { id: "sponsor-footer", name: "Footer bar", kind: "sponsor", blurb: "Logo in a bar along the foot", draw: sponsorFooterBar },
];

/**
 * Every design: each layout in each kit. Ordered so that scrolling the picker
 * shows variety first — the first eight of a kind are eight different layouts
 * in rotating styles.
 */
export const STUDIO_DESIGNS: StudioDesign[] = (() => {
  const out: StudioDesign[] = [];
  for (const kind of ["event", "speaker", "lineup", "sponsor"] as const) {
    const layouts = STUDIO_LAYOUTS.filter((l) => l.kind === kind);
    for (let round = 0; round < STUDIO_KITS.length; round++) {
      layouts.forEach((layout, i) => {
        const kit = STUDIO_KITS[(i + round) % STUDIO_KITS.length];
        out.push({ id: `${layout.id}@${kit.id}`, name: `${layout.name} · ${kit.name}`, kind, blurb: layout.blurb, layout, kit, draw: layout.draw });
      });
    }
  }
  return out;
})();

export const designsFor = (kind: StudioKind) => STUDIO_DESIGNS.filter((d) => d.kind === kind);
export const designById = (id: string) => STUDIO_DESIGNS.find((d) => d.id === id) ?? null;
