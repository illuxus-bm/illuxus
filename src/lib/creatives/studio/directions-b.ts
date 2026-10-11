/**
 * Design directions 7–12. See `directions.ts` for what a direction is.
 */
import {
  alpha, button, cols, cover, dateParts, fit, grid, inset, logoPlate, mix, open, organiser, photo, readableOn, rows, up, whenWhere,
  type Box, type D,
} from "./direction-kit";
import type { DirectionBuild } from "./directions-a";

const partnerLine = (d: D): string => d.c.partnerLine || "Proud to partner with";
const sponsorName = (d: D): string => d.sponsor?.name ?? "Partner";

/* ══ 7. TERMINAL — the console: mono type, brackets, a neon on black ════════ */

export const terminal: DirectionBuild = (input, cat) => {
  const MONO = "JetBrains Mono", HEAD = "Space Grotesk";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const neon = p.primary, hi = p.accent, dim = alpha(hi, 0.6);
  const step = u * 10;
  for (let x = step; x < W; x += step) d.line(x, 0, x, H, alpha(neon, 0.07), Math.max(1, u * 0.1));
  for (let y = step; y < H; y += step) d.line(0, y, W, y, alpha(neon, 0.07), Math.max(1, u * 0.1));
  const S = d.safe;
  /** Corner brackets around a box. */
  const brackets = (b: Box, len = u * 3, color = neon, w = u * 0.35): void => {
    const x2 = b.x + b.w, y2 = b.y + b.h;
    ([[b.x, b.y, 1, 1], [x2, b.y, -1, 1], [b.x, y2, 1, -1], [x2, y2, -1, -1]] as const).forEach(([x, y, sx, sy]) => {
      d.line(x, y, x + len * sx, y, color, w);
      d.line(x, y, x, y + len * sy, color, w);
    });
  };
  brackets(inset(d.full, u * 3), u * 4);
  const [bar, body] = rows(S, [0.5, 9.5], u * 2.6);
  const [bl, br] = cols(bar, [1.5, 1]);
  d.disc(bl.x + u * 0.8, bl.y + bl.h / 2, u * 0.7, neon);
  d.t(up(c.organizerName), { ...bl, x: bl.x + u * 2.6, w: bl.w - u * 2.6 }, MONO, 500, 1.8, hi, { valign: "middle", letterSpacing: u * 0.16, maxLines: 1 });
  d.t(up(c.dateLine), br, MONO, 500, 1.8, neon, { align: "right", valign: "middle", maxLines: 1 });
  d.line(S.x, body.y - u * 1.3, S.x + S.w, body.y - u * 1.3, alpha(neon, 0.5), u * 0.12);
  /** `key ....... value` lines. */
  const kv = (b: Box, pairs: [string, string][]): void => {
    const list = pairs.filter(([, v]) => v.trim());
    rows(b, list.map(() => 1), u * 0.6).forEach((r, i) => {
      const [k, v] = cols(r, [1, 3.4], u * 1.6);
      d.t(`${list[i][0]}:`, k, MONO, 500, 2, neon, { valign: "middle", maxLines: 1 });
      d.t(list[i][1], v, MONO, 400, 2, hi, { valign: "middle", maxLines: 1 });
    });
  };
  const eventKv: [string, string][] = [["event", c.eventTitle], ["date", c.dateLine], ["venue", c.venueName], ["url", c.website]];
  const squarePhoto = (b: Box, who = d.speaker): void => {
    photo(d, inset(b, u * 1.4), who, { grayscale: true, bg: mix(p.ground, neon, 0.18), fg: neon, family: MONO });
    brackets(b, u * 3.2);
  };

  if (cat === "event") {
    const [prompt, title, sub, table, cta] = rows(body, wide ? [0.6, 3, 1, 1.6, 0.9] : [0.6, 4, 1.3, 2, 1], u * 1.8);
    d.t(`> ${c.formatLabel.toLowerCase()}_`, prompt, MONO, 500, 2.4, neon, { valign: "middle", maxLines: 1 });
    d.t(c.eventTitle, title, HEAD, 700, wide ? 8.4 : 10, hi, { valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.04, letterSpacing: -u * 0.12 });
    d.t(c.subtitle, sub, MONO, 400, 2.3, dim, { valign: "top", maxLines: 3, lineHeight: 1.4 });
    kv(table, [["date", c.dateLine], ["time", c.timeLine], ["venue", c.venueName], ["url", c.website]]);
    button(d, cta, c.ctaLabel ? `[ ${c.ctaLabel} ]` : "", { fill: "rgba(0,0,0,0)", stroke: neon, ink: neon, family: MONO, weight: 700, radius: 0, upper: true, size: 2.1 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const [main, table] = rows(body, [5.2, 2], u * 2.4);
    const [pic, text] = wide ? cols(main, [1, 1.5], u * 5) : cols(main, [1, 1.1], u * 3.5);
    squarePhoto(fit(pic, wide ? 1 : 0.84, 0, 0));
    const [tag, nm, role] = rows(text, [0.7, 3, 1.8], u * 1.4);
    d.t(`// ${c.sideLabel.toLowerCase().replace(/\s+/g, "_")}_01`, tag, MONO, 500, 2.1, neon, { valign: "middle", maxLines: 1 });
    d.t(sp?.name ?? "Speaker", nm, HEAD, 700, wide ? 8 : 7.6, hi, { valign: "top", maxLines: 3, lineHeight: 1.04, letterSpacing: -u * 0.1 });
    d.t(sp?.role ?? "", role, MONO, 400, 2.2, dim, { valign: "top", maxLines: 4, lineHeight: 1.4 });
    kv(table, eventKv.slice(0, 3));
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [prompt, title, list, foot] = rows(body, [0.5, 1.5, 6, 0.6], u * 1.8);
    d.t(`> ${c.speakersLabel.toLowerCase()} --all`, prompt, MONO, 500, 2.2, neon, { valign: "middle", maxLines: 1 });
    d.t(c.eventTitle, title, HEAD, 700, 5.8, hi, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    const two = wide || people.length > 3;
    const perCol = two ? Math.ceil(people.length / 2) : people.length;
    cols(list, two ? [1, 1] : [1], u * 4).forEach((col, ci) => {
      rows(col, Array.from({ length: perCol }, () => 1), u * 1.2).forEach((r, ri) => {
        const person = people[ci * perCol + ri];
        if (!person) { d.skip(4); return; }
        d.rect(r, alpha(neon, 0.06), { stroke: alpha(neon, 0.4), strokeWidth: u * 0.12 });
        const [pic, txt] = cols(inset(r, u * 1.2), [1, 3.4], u * 1.8);
        photo(d, fit(pic, 1, 0, 0.5), person, { grayscale: true, bg: mix(p.ground, neon, 0.18), fg: neon, family: MONO });
        const [nm, role] = rows(txt, [1.2, 1]);
        d.t(`${String(ci * perCol + ri + 1).padStart(2, "0")}  ${person.name}`, nm, HEAD, 700, 2.6, hi, { valign: "bottom", maxLines: 1 });
        d.t(person.role, role, MONO, 400, 1.7, dim, { valign: "top", maxLines: 1 });
      });
    });
    d.t(up(whenWhere(c, "  //  ")), foot, MONO, 500, 2, neon, { valign: "middle", maxLines: 1 });
  } else {
    const [prompt, headline, mid, table] = rows(body, [0.6, 2, 3.6, 2], u * 2);
    d.t(`// ${c.sponsorLabel.toLowerCase().replace(/\s+/g, "_")}`, prompt, MONO, 500, 2.2, neon, { valign: "middle", maxLines: 1 });
    d.t(partnerLine(d), headline, HEAD, 700, wide ? 6.4 : 7.6, hi, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    const [plate, side] = cols(mid, [1.5, 1], u * 4);
    logoPlate(d, inset(plate, u * 1.4), d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", family: HEAD, ink: "#0a0a0a" });
    brackets(plate, u * 3.2);
    d.t(sponsorName(d), side, HEAD, 700, 4.4, hi, { valign: "bottom", maxLines: 3, lineHeight: 1.05 });
    kv(table, eventKv.slice(0, 3));
  }
  return d.done();
};

/* ══ 8. BLOCK — colour-block: one saturated slab, condensed capitals ════════ */

export const block: DirectionBuild = (input, cat) => {
  const SLAB = "Bebas Neue", TEXT = "Inter";
  const d = open(input, input.palette.ground);
  const { W, H, u, m, wide, c, p } = d;
  const vivid = p.primary, ink = p.accent, on = readableOn(vivid);
  // The slab: left on wide canvases, top otherwise.
  const slab: Box = wide ? { x: 0, y: 0, w: W * 0.5, h: H } : { x: 0, y: 0, w: W, h: H * (cat === "speaker" ? 0.56 : 0.5) };
  const rest: Box = wide ? { x: slab.w, y: 0, w: W - slab.w, h: H } : { x: 0, y: slab.h, w: W, h: H - slab.h };
  d.rect(slab, vivid);
  if (cat === "speaker" && !wide) d.disc(W * 0.86, slab.h, u * 9, undefined, { stroke: ink, strokeWidth: u * 0.5 });
  const A = inset(slab, m), R = inset(rest, m);
  const small = { valign: "middle", letterSpacing: u * 0.3, maxLines: 1 } as const;
  /** A black-and-white photo washed in the slab colour. */
  const tinted = (b: Box, who = d.speaker): void => {
    photo(d, b, who, { grayscale: true, bg: mix(vivid, "#000000", 0.25), fg: on, family: SLAB });
    d.rect(b, alpha(vivid, 0.42));
  };

  if (cat === "event") {
    const [day, restDate] = dateParts(c.dateLine);
    const [org, title, lab] = rows(A, [0.7, 5, 0.6], u * 2);
    d.t(up(c.organizerName), org, TEXT, 700, 2, on, small);
    d.t(up(c.eventTitle), title, SLAB, 400, wide ? 13 : 15, on, { valign: "middle", maxLines: 4, lineHeight: 0.95 });
    d.t(up(c.formatLabel), lab, TEXT, 700, 1.9, alpha(on, 0.8), small);
    const [date, sub, meta, cta] = rows(R, [2.2, 1.2, 0.8, 1], u * 1.6);
    const [num, month] = cols(date, [1, 1.6], u * 2.5);
    d.t(day || "—", num, SLAB, 400, 20, vivid, { valign: "middle", lineHeight: 0.9, maxLines: 1 });
    d.t(up(restDate), month, SLAB, 400, 6, ink, { valign: "middle", maxLines: 2, lineHeight: 0.98 });
    d.t(c.subtitle, sub, TEXT, 500, 2.6, alpha(ink, 0.75), { valign: "top", maxLines: 3, lineHeight: 1.35 });
    d.t(up(c.venueName), meta, TEXT, 700, 2.1, ink, small);
    button(d, cta, c.ctaLabel, { fill: ink, ink: readableOn(ink), family: SLAB, weight: 400, radius: 0, upper: true, size: 3 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    tinted(slab);
    const [lab, nm, role, ev] = rows(R, wide ? [0.6, 3, 1.2, 1.4] : [0.5, 2.2, 1, 1.2], u * 1.4);
    d.t(up(c.sideLabel), lab, TEXT, 700, 2, vivid, small);
    d.t(up(sp?.name ?? "Speaker"), nm, SLAB, 400, wide ? 12 : 13, ink, { valign: "middle", maxLines: 2, lineHeight: 0.95 });
    d.t(sp?.role ?? "", role, TEXT, 500, 2.6, alpha(ink, 0.75), { valign: "top", maxLines: 2, lineHeight: 1.3 });
    d.line(R.x, ev.y, R.x + R.w, ev.y, ink, u * 0.3);
    const [t1, t2] = rows({ ...ev, y: ev.y + u * 1.4, h: ev.h - u * 1.4 }, [1.2, 1]);
    d.t(up(c.eventTitle), t1, SLAB, 400, 3.6, ink, { valign: "middle", maxLines: 1 });
    d.t(up(whenWhere(c)), t2, TEXT, 700, 1.9, alpha(ink, 0.75), small);
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, meta] = rows(A, [0.6, 4, 1], u * 2);
    d.t(up(c.speakersLabel), lab, TEXT, 700, 2, alpha(on, 0.85), small);
    d.t(up(c.eventTitle), title, SLAB, 400, wide ? 11 : 12, on, { valign: "middle", maxLines: wide ? 4 : 3, lineHeight: 0.95 });
    d.t(up(whenWhere(c)), meta, TEXT, 700, 2, on, { ...small, maxLines: 2 });
    grid(R, people.length, wide ? (people.length <= 4 ? 2 : 3) : people.length <= 3 ? 3 : Math.ceil(people.length / 2), u * 2.2).forEach((cell, i) => {
      const [pic, nm] = rows(cell, [4, 1], u * 0.8);
      const frame = fit(pic, 1);
      tinted(frame, people[i]);
      d.t(up(people[i].name), { x: frame.x, y: nm.y, w: frame.w, h: nm.h }, SLAB, 400, 2.6, ink, { valign: "middle", maxLines: 1 });
    });
  } else {
    const [lab, headline, ev] = rows(A, [0.6, 4, 1.2], u * 2);
    d.t(up(c.sponsorLabel), lab, TEXT, 700, 2, alpha(on, 0.85), small);
    d.t(up(partnerLine(d)), headline, SLAB, 400, wide ? 11 : 12, on, { valign: "middle", maxLines: 4, lineHeight: 0.95 });
    d.t(up(`${c.eventTitle}  ·  ${whenWhere(c)}`), ev, TEXT, 700, 1.9, on, { valign: "middle", letterSpacing: u * 0.2, maxLines: 3, lineHeight: 1.3 });
    const [plate, nm] = rows(R, [3.4, 1], u * 2);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", stroke: ink, strokeWidth: u * 0.5, family: SLAB, weight: 400, ink: "#111111" });
    d.t(up(sponsorName(d)), nm, SLAB, 400, 5, ink, { valign: "middle", maxLines: 1 });
  }
  return d.done();
};

/* ══ 9. SOFT — gentle: pastel gradient, white rounded cards, soft serif ═════ */

export const soft: DirectionBuild = (input, cat) => {
  const SERIF = "Fraunces", TEXT = "DM Sans";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const ink = p.accent, tint = p.primary, quiet = alpha(ink, 0.68);
  d.rect(d.full, { type: "linear", from: [0, 0], to: [1, 1], stops: [[0, p.ground], [1, tint]] });
  d.disc(W * 0.9, H * 0.12, Math.min(W, H) * 0.28, "rgba(255,255,255,0.45)");
  d.disc(W * 0.08, H * 0.9, Math.min(W, H) * 0.22, "rgba(255,255,255,0.35)");
  const shadow = { color: alpha(ink, 0.16), blur: u * 5, offsetX: 0, offsetY: u * 1.6 };
  const cardBox = (b: Box, radius = u * 5): void => d.rect(b, "#ffffff", { radius, shadow });
  const chip = (b: Box, text: string, align: "left" | "center" = "center"): void => {
    if (!text.trim()) { d.skip(2); return; }
    const w = Math.min(b.w, u * (text.length * 1.35 + 6));
    const r = { x: align === "center" ? b.x + (b.w - w) / 2 : b.x, y: b.y, w, h: b.h };
    d.rect(r, "rgba(255,255,255,0.8)", { radius: b.h / 2 });
    d.t(text, inset(r, u * 1.6, 0), TEXT, 700, 2, ink, { align: "center", valign: "middle", maxLines: 1 });
  };
  const softPhoto = (b: Box, who = d.speaker): void => {
    d.rect(b, "#ffffff", { radius: b.w * 0.3, shadow });
    photo(d, inset(b, b.w * 0.045), who, { radius: b.w * 0.27, bg: tint, fg: ink, family: SERIF });
  };
  const S = d.safe;

  if (cat === "event") {
    const [org, lab, title, sub, chips, cta] = rows(S, wide ? [1, 0.7, 3, 1, 0.8, 1.1] : [1, 0.6, 4, 1.4, 0.8, 1.2], u * 1.8);
    organiser(d, org, TEXT, ink, "center", "#ffffff");
    chip({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.formatLabel);
    d.t(c.eventTitle, title, SERIF, 600, wide ? 8 : 9.6, ink, { align: "center", valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.06 });
    d.t(c.subtitle, sub, TEXT, 400, 3, quiet, { align: "center", valign: "top", maxLines: 2, lineHeight: 1.4 });
    const [c1, c2] = cols(inset(chips, chips.w * 0.06, 0), [1, 1], u * 2);
    chip({ ...c1, h: Math.min(c1.h, u * 5) }, c.dateLine);
    chip({ ...c2, h: Math.min(c2.h, u * 5) }, c.venueName);
    button(d, cta, c.ctaLabel, { fill: ink, ink: readableOn(ink), family: TEXT, weight: 700, align: "center", size: 2.5 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const text = (b: Box, align: "left" | "center"): void => {
      const [lab, nm, role, ev, meta] = rows(b, [0.8, 2.2, 1.2, 1, 0.7], u * 1.3);
      chip({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.sideLabel, align);
      d.t(sp?.name ?? "Speaker", nm, SERIF, 600, 7.4, ink, { align, valign: "middle", maxLines: 2, lineHeight: 1.06 });
      d.t(sp?.role ?? "", role, TEXT, 400, 2.7, quiet, { align, valign: "top", maxLines: 2, lineHeight: 1.35 });
      d.t(c.eventTitle, ev, SERIF, 600, 3, ink, { align, valign: "middle", maxLines: 2 });
      d.t(whenWhere(c), meta, TEXT, 500, 2.1, quiet, { align, valign: "middle", maxLines: 1 });
    };
    if (wide) {
      const [pic, panel] = cols(S, [1, 1.45], u * 5);
      softPhoto(fit(pic, 1));
      cardBox(panel);
      text(inset(panel, u * 5, u * 4), "left");
    } else {
      const [pic, panel] = rows(S, [1, 1.05], u * 3.5);
      softPhoto(fit(pic, 1));
      cardBox(panel);
      text(inset(panel, u * 4.5, u * 4), "center");
    }
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, area, meta] = rows(S, [0.6, 1.5, wide ? 3.6 : 6, 0.7], u * 1.8);
    chip({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.speakersLabel);
    d.t(c.eventTitle, title, SERIF, 600, 5.8, ink, { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.06 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.4).forEach((cell, i) => {
      cardBox(cell, u * 3.4);
      const [pic, nm, role] = rows(inset(cell, u * 2), [4, 1, 0.8], u * 0.7);
      const f = fit(pic, 1);
      photo(d, f, people[i], { radius: f.w * 0.3, bg: tint, fg: ink, family: SERIF });
      d.t(people[i].name, nm, SERIF, 600, 2.5, ink, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, TEXT, 400, 1.7, quiet, { align: "center", valign: "middle", maxLines: 1 });
    });
    chip({ ...meta, h: Math.min(meta.h, u * 5) }, whenWhere(c));
  } else {
    const [org, lab, headline, panel, ev] = rows(S, wide ? [0.9, 0.6, 1.4, 3, 0.9] : [0.9, 0.6, 2, 4, 1.1], u * 1.8);
    organiser(d, org, TEXT, ink, "center", "#ffffff");
    chip({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.sponsorLabel);
    d.t(partnerLine(d), headline, SERIF, 600, wide ? 6 : 7.4, ink, { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.06 });
    const box = fit(panel, 1.9);
    cardBox(box);
    logoPlate(d, inset(box, u * 2), d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", family: SERIF, weight: 600, ink });
    d.t(`${c.eventTitle}  ·  ${whenWhere(c)}`, ev, TEXT, 500, 2.3, quiet, { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.3 });
  }
  return d.done();
};

/* ══ 10. RETRO — seventies: rainbow arcs, stripes, round warm lettering ═════ */

export const retro: DirectionBuild = (input, cat) => {
  const HEAD = "Righteous", TEXT = "Poppins";
  const d = open(input, input.palette.ground);
  const { W, H, u, m, wide, c, p } = d;
  const warm = p.primary, deep = p.accent, cream = p.ground;
  const bands = [deep, mix(warm, deep, 0.45), warm, mix(warm, cream, 0.5)];
  /** Width of each arc, as a share of the outer radius. */
  const STEP = 0.1;
  /** Concentric arcs (a sunrise) centred on a point. */
  const arcs = (cx: number, cy: number, r: number, hole: string | null = cream): void => {
    bands.forEach((color, i) => d.disc(cx, cy, r * (1 - i * STEP), color));
    if (hole) d.disc(cx, cy, r * (1 - bands.length * STEP), hole);
    else d.skip();
  };
  // Stripes along the foot.
  const stripeH = u * 2.2;
  bands.forEach((color, i) => d.rect({ x: 0, y: H - stripeH * (bands.length - i), w: W, h: stripeH }, color));
  const S: Box = { x: m, y: m, w: W - m * 2, h: H - m * 2 - stripeH * bands.length };
  const ink = deep, quiet = alpha(deep, 0.72);
  const pillTag = (b: Box, text: string, align: "left" | "center" = "left"): void => {
    if (!text.trim()) { d.skip(2); return; }
    const w = Math.min(b.w, u * (text.length * 1.5 + 6));
    const r = { x: align === "center" ? b.x + (b.w - w) / 2 : b.x, y: b.y, w, h: b.h };
    d.rect(r, deep, { radius: b.h / 2 });
    d.t(up(text), inset(r, u * 1.6, 0), TEXT, 700, 1.9, readableOn(deep), { align: "center", valign: "middle", letterSpacing: u * 0.2, maxLines: 1 });
  };
  const sunPhoto = (b: Box, who = d.speaker): void => {
    const r = Math.min(b.w, b.h) / 2, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    arcs(cx, cy, r, null);
    const pr = r * (1 - bands.length * STEP) * 1.01;
    photo(d, { x: cx - pr, y: cy - pr, w: pr * 2, h: pr * 2 }, who, { circle: true, bg: cream, fg: deep, family: HEAD });
  };

  if (cat === "event") {
    // Arcs sit beside the copy on wide canvases and above it otherwise.
    const topBand = S.h * 0.34;
    if (wide) arcs(W * 0.84, S.y + S.h * 0.5, Math.min(S.h * 0.48, W * 0.16));
    else arcs(S.x + S.w - topBand * 0.5, S.y + topBand * 0.5, topBand * 0.5);
    const T: Box = wide ? { ...S, w: S.w * 0.6 } : { ...S, y: S.y + topBand + u * 3, h: S.h - topBand - u * 3 };
    organiser(d, { x: S.x, y: S.y, w: S.w * 0.5, h: u * 6.5 }, TEXT, ink, "left", "#ffffff");
    const [lab, title, sub, meta, cta] = rows(wide ? { ...T, y: T.y + u * 10, h: T.h - u * 10 } : T, [0.7, 3.4, 1.1, 0.7, 1.1], u * 1.6);
    pillTag({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.formatLabel);
    d.t(c.eventTitle, title, HEAD, 400, wide ? 8 : 9.4, ink, { valign: "middle", maxLines: wide ? 3 : 4, lineHeight: 1.04 });
    d.t(c.subtitle, sub, TEXT, 400, 2.8, quiet, { valign: "top", maxLines: 2, lineHeight: 1.35 });
    d.t(whenWhere(c), meta, TEXT, 700, 2.5, ink, { valign: "middle", maxLines: 1 });
    button(d, cta, c.ctaLabel, { fill: warm, ink: readableOn(warm), family: HEAD, weight: 400, size: 2.6 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const text = (b: Box, align: "left" | "center"): void => {
      const [lab, nm, role, ev, meta] = rows(b, [0.8, 2.2, 1.2, 1, 0.7], u * 1.3);
      pillTag({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.sideLabel, align);
      d.t(sp?.name ?? "Speaker", nm, HEAD, 400, 7.4, ink, { align, valign: "middle", maxLines: 2, lineHeight: 1.04 });
      d.t(sp?.role ?? "", role, TEXT, 400, 2.7, quiet, { align, valign: "top", maxLines: 2, lineHeight: 1.35 });
      d.t(c.eventTitle, ev, HEAD, 400, 3, warm === cream ? ink : mix(warm, deep, 0.3), { align, valign: "middle", maxLines: 2 });
      d.t(whenWhere(c), meta, TEXT, 600, 2.1, ink, { align, valign: "middle", maxLines: 1 });
    };
    if (wide) {
      const [pic, t] = cols(S, [1, 1.3], u * 5);
      sunPhoto(fit(pic, 1));
      text(inset(t, 0, u * 2), "left");
    } else {
      const [pic, t] = rows(S, [1.15, 1], u * 2.5);
      sunPhoto(fit(pic, 1));
      text(t, "center");
    }
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, area, meta] = rows(S, [0.6, 1.5, wide ? 3.6 : 6, 0.7], u * 1.8);
    pillTag({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.speakersLabel);
    d.t(c.eventTitle, title, HEAD, 400, 5.8, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.2).forEach((cell, i) => {
      const [pic, nm, role] = rows(cell, [4, 1, 0.8], u * 0.6);
      const f = fit(pic, 1), r = f.w / 2;
      d.disc(f.x + r, f.y + r, r, bands[i % bands.length]);
      photo(d, inset(f, r * 0.12), people[i], { circle: true, bg: cream, fg: deep, family: HEAD });
      d.t(people[i].name, nm, HEAD, 400, 2.5, ink, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, TEXT, 400, 1.7, quiet, { align: "center", valign: "middle", maxLines: 1 });
    });
    d.t(whenWhere(c), meta, TEXT, 700, 2.4, ink, { valign: "middle", maxLines: 1 });
  } else {
    const [lab, headline, mid, ev] = rows(S, wide ? [0.6, 1.4, 3.2, 0.9] : [0.6, 2, 4.4, 1.1], u * 2);
    pillTag({ ...lab, h: Math.min(lab.h, u * 4.8) }, c.sponsorLabel, "center");
    d.t(partnerLine(d), headline, HEAD, 400, wide ? 6 : 7.4, ink, { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.04 });
    const box = fit(mid, 1);
    const r = box.w / 2, cx = box.x + r, cy = box.y + r;
    arcs(cx, cy, r, "#ffffff");
    const pr = r * (1 - bands.length * STEP);
    const sq = pr * 1.3;
    logoPlate(d, { x: cx - sq / 2, y: cy - sq / 2, w: sq, h: sq }, d.sponsor?.logoUrl, sponsorName(d), { fill: "rgba(255,255,255,0)", family: HEAD, weight: 400, ink: deep, pad: 0.04 });
    d.t(`${c.eventTitle}  ·  ${whenWhere(c)}`, ev, TEXT, 600, 2.3, ink, { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.3 });
  }
  return d.done();
};

/* ══ 11. CORPORATE — the boardroom: white space, navy, one bright accent ════ */

export const corporate: DirectionBuild = (input, cat) => {
  const HEAD = "Montserrat";
  const d = open(input, input.palette.ground);
  const { W, H, u, m, wide, c, p } = d;
  const navy = p.primary, bright = p.accent, grey = alpha(navy, 0.62);
  // Diagonal stripes in the top-right corner.
  const sw = u * 5;
  [0, 1, 2].forEach((i) => d.rect({ x: W - u * 24 + i * sw * 1.7, y: -u * 11, w: sw, h: u * 26 }, i === 1 ? bright : navy, { rotation: 32, opacity: i === 2 ? 0.25 : 1 }));
  const footH = u * 11;
  const foot: Box = { x: 0, y: H - footH, w: W, h: footH };
  d.rect(foot, navy);
  d.rect({ x: 0, y: foot.y, w: W, h: u * 0.6 }, bright);
  const F = inset(foot, m, u * 2.2);
  const S: Box = { x: m, y: m, w: W - m * 2, h: foot.y - m * 2 };
  // The header row is as tall as the corner stripes, so nothing shares their space.
  const [org, body] = rows(S, [u * 9, S.h - u * 9 - u * 2.6], u * 2.6);
  organiser(d, { ...org, w: org.w * 0.5, h: u * 6.5 }, HEAD, navy, "left");
  /** An icon and a line of text. */
  const iconRow = (b: Box, icon: "calendar" | "pin" | "clock" | "globe", text: string): void => {
    if (!text.trim()) { d.skip(2); return; }
    const size = Math.min(b.h, u * 3.4);
    d.add({ kind: "icon", name: icon, x: b.x, y: b.y + (b.h - size) / 2, size, color: bright });
    d.t(text, { x: b.x + size + u * 1.6, y: b.y, w: b.w - size - u * 1.6, h: b.h }, HEAD, 600, 2.5, navy, { valign: "middle", maxLines: 1 });
  };
  const offsetPhoto = (b: Box, who = d.speaker): void => {
    const off = u * 1.8;
    const box: Box = { x: b.x, y: b.y, w: b.w - off, h: b.h - off };
    d.rect({ x: box.x + off, y: box.y + off, w: box.w, h: box.h }, bright, { radius: u * 2.4 });
    photo(d, box, who, { radius: u * 2.4, bg: mix(p.ground, navy, 0.12), fg: navy, family: HEAD });
  };
  const footer = (): void => {
    const [web, cta] = cols(F, [1.6, 1], u * 3);
    d.t(c.website, web, HEAD, 600, 2.3, readableOn(navy), { valign: "middle", maxLines: 1 });
    button(d, cta, c.ctaLabel, { fill: bright, ink: readableOn(bright), family: HEAD, weight: 700, radius: u * 1, align: "right", size: 2.2 });
  };

  if (cat === "event") {
    const hasCover = wide && !!input.coverImageUrl;
    const [text, pic] = hasCover ? cols(body, [1.25, 1], u * 5) : [wide ? { ...body, w: body.w * 0.66 } : body, null];
    const [lab, title, sub, r1, r2, r3] = rows(text, wide ? [0.6, 3, 1.1, 0.7, 0.7, 0.7] : [0.5, 3.6, 1.3, 0.7, 0.7, 0.7], u * 1.5);
    d.t(up(c.formatLabel), lab, HEAD, 700, 2, bright, { valign: "middle", letterSpacing: u * 0.3, maxLines: 1 });
    d.t(c.eventTitle, title, HEAD, 800, wide ? 7.4 : 8.8, navy, { valign: "middle", maxLines: wide ? 3 : 4, lineHeight: 1.06, letterSpacing: -u * 0.08 });
    d.t(c.subtitle, sub, HEAD, 500, 2.8, grey, { valign: "top", maxLines: 2, lineHeight: 1.35 });
    iconRow(r1, "calendar", c.dateLine);
    iconRow(r2, "clock", c.timeLine);
    iconRow(r3, "pin", c.venueName);
    if (pic) { const f = fit(pic, 16 / 9, 1, 0.55); d.rect({ x: f.x + u * 1.8, y: f.y + u * 1.8, w: f.w, h: f.h }, bright, { radius: u * 2.4 }); cover(d, f, { radius: u * 2.4 }); } else d.skip(2);
    footer();
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const [pic, text] = cols(body, wide ? [1, 1.5] : [1, 1.15], u * 5);
    offsetPhoto(fit(pic, wide ? 0.9 : 0.74, 0, 0.3));
    const [lab, nm, role, r1, r2, r3] = rows(text, [0.6, 2.6, 1.6, 0.7, 0.7, 0.7], u * 1.4);
    d.t(up(c.sideLabel), lab, HEAD, 700, 2, bright, { valign: "middle", letterSpacing: u * 0.3, maxLines: 1 });
    d.t(sp?.name ?? "Speaker", nm, HEAD, 800, wide ? 7 : 6.6, navy, { valign: "middle", maxLines: 3, lineHeight: 1.06 });
    d.t(sp?.role ?? "", role, HEAD, 500, 2.5, grey, { valign: "top", maxLines: 3, lineHeight: 1.35 });
    iconRow(r1, "globe", c.eventTitle);
    iconRow(r2, "calendar", c.dateLine);
    iconRow(r3, "pin", c.venueName);
    footer();
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, area] = rows({ ...body, w: body.w }, [0.5, 1.4, wide ? 3.6 : 6], u * 1.8);
    d.t(up(c.speakersLabel), lab, HEAD, 700, 2, bright, { valign: "middle", letterSpacing: u * 0.3, maxLines: 1 });
    d.t(c.eventTitle, { ...title, w: title.w * 0.72 }, HEAD, 800, 5.4, navy, { valign: "middle", maxLines: 2, lineHeight: 1.06 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.4).forEach((cell, i) => {
      d.rect(cell, "#ffffff", { radius: u * 2.4, stroke: alpha(navy, 0.14), strokeWidth: u * 0.14 });
      const [pic, nm, role] = rows(inset(cell, u * 1.8), [4, 1, 0.8], u * 0.7);
      photo(d, fit(pic, 1), people[i], { radius: u * 1.8, bg: mix(p.ground, navy, 0.12), fg: navy, family: HEAD });
      d.t(people[i].name, nm, HEAD, 700, 2.3, navy, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, HEAD, 500, 1.6, grey, { align: "center", valign: "middle", maxLines: 1 });
    });
    const [meta, cta] = cols(F, [1.6, 1], u * 3);
    d.t(whenWhere(c), meta, HEAD, 600, 2.3, readableOn(navy), { valign: "middle", maxLines: 1 });
    button(d, cta, c.ctaLabel, { fill: bright, ink: readableOn(bright), family: HEAD, weight: 700, radius: u * 1, align: "right", size: 2.2 });
  } else {
    const [lab, headline, mid, r1, r2] = rows(body, wide ? [0.5, 1.5, 3, 0.6, 0.6] : [0.5, 2, 3.8, 0.7, 0.7], u * 1.8);
    d.t(up(c.sponsorLabel), lab, HEAD, 700, 2, bright, { valign: "middle", letterSpacing: u * 0.3, maxLines: 1 });
    d.t(partnerLine(d), { ...headline, w: headline.w * (wide ? 0.66 : 0.9) }, HEAD, 800, wide ? 6 : 7, navy, { valign: "middle", maxLines: 2, lineHeight: 1.06 });
    const [plate, side] = cols(mid, [1.5, 1], u * 4);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", radius: u * 2.4, stroke: alpha(navy, 0.18), strokeWidth: u * 0.2, family: HEAD, weight: 800, ink: navy });
    d.rect({ x: side.x, y: side.y, w: u * 1, h: side.h }, bright);
    d.t(sponsorName(d), { ...side, x: side.x + u * 3.4, w: side.w - u * 3.4 }, HEAD, 800, 4.2, navy, { valign: "middle", maxLines: 3, lineHeight: 1.08 });
    iconRow(r1, "globe", c.eventTitle);
    iconRow(r2, "calendar", whenWhere(c));
    const [web] = cols(F, [1]);
    d.t(c.website, web, HEAD, 600, 2.3, readableOn(navy), { valign: "middle", maxLines: 1 });
  }
  return d.done();
};

/* ══ 12. COLLAGE — the scrapbook: taped paper, polaroids, handwriting ═══════ */

export const collage: DirectionBuild = (input, cat) => {
  const HAND = "Caveat", TEXT = "Archivo";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const ink = p.primary, pen = p.accent, quiet = alpha(ink, 0.7);
  const shadow = { color: "rgba(0,0,0,0.22)", blur: u * 3, offsetX: u * 0.5, offsetY: u * 1.2 };
  /** A sheet of paper, slightly askew, with a strip of tape. */
  const sheet = (b: Box, angle: number): void => {
    d.rect(b, "#fffdf8", { rotation: angle, shadow });
    d.rect({ x: b.x + b.w * 0.5 - u * 7, y: b.y - u * 1.6, w: u * 14, h: u * 3.6 }, alpha(pen, 0.55), { rotation: angle - 4 });
  };
  /** A photo in a white frame, tilted. */
  const polaroid = (b: Box, who: typeof d.speaker, angle: number): void => {
    d.rect(b, "#ffffff", { rotation: angle, shadow });
    photo(d, inset(b, b.w * 0.07), who, { rotation: angle, bg: mix(p.ground, ink, 0.18), fg: ink, family: TEXT });
  };
  /** A round rubber stamp. */
  const stamp = (cx: number, cy: number, r: number, top: string, bottom: string): void => {
    d.disc(cx, cy, r, undefined, { stroke: pen, strokeWidth: u * 0.5 });
    d.disc(cx, cy, r * 0.84, undefined, { stroke: pen, strokeWidth: u * 0.2 });
    const b = { x: cx - r * 0.72, y: cy - r * 0.5, w: r * 1.44, h: r };
    const [t1, t2] = rows(b, [1.3, 1]);
    d.t(up(top), t1, TEXT, 800, (r / u) * 0.34, pen, { align: "center", valign: "middle", rotation: -12, maxLines: 1 });
    d.t(up(bottom), t2, TEXT, 700, (r / u) * 0.2, pen, { align: "center", valign: "middle", rotation: -12, letterSpacing: u * 0.1, maxLines: 1 });
  };
  const S = d.safe;
  const [day, restDate] = dateParts(c.dateLine);

  if (cat === "event") {
    const paper = inset(S, u * 2, u * 3);
    sheet(paper, -1.5);
    const P = inset(paper, u * 6, u * 6.5);
    const [note, title, sub, foot] = rows(P, wide ? [0.9, 3, 1, 1.4] : [0.9, 4, 1.2, 1.8], u * 1.8);
    d.t(c.formatLabel, note, HAND, 700, 4.6, pen, { valign: "middle", maxLines: 1 });
    d.t(c.eventTitle, title, TEXT, 800, wide ? 7.6 : 9, ink, { valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.04, letterSpacing: -u * 0.08 });
    d.t(c.subtitle, sub, TEXT, 500, 2.7, quiet, { valign: "top", maxLines: 2, lineHeight: 1.35 });
    const [info, st] = cols(foot, [1.8, 1], u * 3);
    const [v, cta] = rows(info, [1, 1.2], u * 1.2);
    d.t(c.venueName, v, HAND, 700, 4, ink, { valign: "middle", maxLines: 1 });
    button(d, cta, c.ctaLabel, { fill: ink, ink: readableOn(ink), family: TEXT, weight: 700, radius: u * 0.6, upper: true, size: 2 });
    const r = Math.min(st.w, st.h) / 2;
    stamp(st.x + st.w - r, st.y + st.h / 2, r, day || "•", restDate.split(/s+/)[0] ?? "");
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const [picArea, textArea] = wide ? cols(S, [1, 1.35], u * 6) : rows(S, [1.25, 1], u * 3);
    polaroid(fit(inset(picArea, u * 2), 0.86), sp, 3);
    const paper = inset(textArea, wide ? 0 : u * 1, u * 1.5);
    sheet(paper, -1.5);
    const [note, nm, role, ev, meta] = rows(inset(paper, u * 4.5, u * 4), [0.9, 2.2, 1.2, 1, 0.7], u * 1.2);
    d.t(c.introLine, note, HAND, 700, 4.2, pen, { valign: "middle", maxLines: 1 });
    d.t(sp?.name ?? "Speaker", nm, TEXT, 800, 6.8, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    d.t(sp?.role ?? "", role, TEXT, 500, 2.5, quiet, { valign: "top", maxLines: 2, lineHeight: 1.3 });
    d.t(c.eventTitle, ev, HAND, 700, 3.8, ink, { valign: "middle", maxLines: 1 });
    d.t(up(whenWhere(c)), meta, TEXT, 700, 1.8, pen, { valign: "middle", letterSpacing: u * 0.16, maxLines: 1 });
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [note, title, area, meta] = rows(S, [0.7, 1.5, wide ? 3.6 : 6, 0.7], u * 1.8);
    d.t(c.speakersLabel, note, HAND, 700, 4.6, pen, { valign: "middle", maxLines: 1 });
    d.t(c.eventTitle, title, TEXT, 800, 5.8, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 3).forEach((cell, i) => {
      const [pic, nm] = rows(cell, [4, 1], u * 1);
      polaroid(fit(inset(pic, u * 1.2), 0.9), people[i], i % 2 ? 3 : -3);
      d.t(people[i].name, nm, HAND, 700, 3.4, ink, { align: "center", valign: "middle", maxLines: 1 });
    });
    d.t(up(whenWhere(c)), meta, TEXT, 700, 2, ink, { valign: "middle", letterSpacing: u * 0.16, maxLines: 1 });
  } else {
    const paper = inset(S, u * 2, u * 3);
    sheet(paper, 1.5);
    const P = inset(paper, u * 6, u * 6.5);
    const [note, headline, mid, foot] = rows(P, wide ? [0.8, 1.4, 3, 0.9] : [0.8, 2, 4, 1.1], u * 1.8);
    d.t(c.sponsorLabel, note, HAND, 700, 4.6, pen, { valign: "middle", maxLines: 1 });
    d.t(partnerLine(d), headline, TEXT, 800, wide ? 5.8 : 7, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    const [plate, st] = cols(mid, [1.7, 1], u * 3);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", stroke: alpha(ink, 0.25), strokeWidth: u * 0.2, family: TEXT, weight: 800, ink });
    const r = Math.min(st.w, st.h) / 2;
    stamp(st.x + st.w / 2, st.y + st.h / 2, r, "Official", "partner");
    d.t(`${c.eventTitle}  ·  ${whenWhere(c)}`, foot, HAND, 700, 3.4, ink, { valign: "middle", maxLines: 2, lineHeight: 1.1 });
  }
  void W; void H;
  return d.done();
};
