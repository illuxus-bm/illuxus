/**
 * Design directions 1–6. See `directions.ts` for what a direction is.
 *
 * Each direction is a complete visual identity — its own colour logic,
 * typefaces, photo treatment and compositional device — applied to the four
 * kinds of graphic (event, speaker, line-up, partner).
 */
import {
  alpha, button, cols, cover, dateParts, fit, grid, inset, logoPlate, mix, open, organiser, photo, readableOn, rows, up, whenWhere,
  type Box, type D, type Fill,
} from "./direction-kit";
import type { BuildInput } from "./templates";
import type { Scene } from "./scene";

export type Cat = "event" | "speaker" | "lineup" | "partner";
export type DirectionBuild = (input: BuildInput, cat: Cat) => Scene;

const partnerLine = (d: D): string => d.c.partnerLine || "Proud to partner with";
const sponsorName = (d: D): string => d.sponsor?.name ?? "Partner";

/* ══ 1. NOIR — black tie: fine gold rules, serif capitals, arched portraits ══ */

export const noir: DirectionBuild = (input, cat) => {
  const SERIF = "Playfair Display", SANS = "Poppins", SCRIPT = "Great Vibes";
  const d = open(input, input.palette.ground);
  const { u, wide, c, p } = d;
  const gold = p.accent, ivory = p.primary;
  d.rect(inset(d.full, u * 3), undefined, { stroke: gold, strokeWidth: u * 0.22 });
  d.rect(inset(d.full, u * 4.3), undefined, { stroke: alpha(gold, 0.45), strokeWidth: u * 0.1 });
  const B = inset(d.full, u * 9.5);
  /** A rule with a diamond at its centre. */
  const ornament = (b: Box): void => {
    const cy = b.y + b.h / 2, cx = b.x + b.w / 2, half = Math.min(b.w * 0.28, u * 16), k = u * 0.75;
    d.line(cx - half, cy, cx - k * 2.2, cy, gold, u * 0.14);
    d.line(cx + k * 2.2, cy, cx + half, cy, gold, u * 0.14);
    d.rect({ x: cx - k, y: cy - k, w: k * 2, h: k * 2 }, gold, { rotation: 45 });
  };
  const caps = { align: "center", valign: "middle", letterSpacing: u * 0.5, maxLines: 1 } as const;
  const arch = (b: Box, who = d.speaker): void => {
    const o = inset(b, -u * 1.1);
    d.rect(o, undefined, { radius: [o.w / 2, o.w / 2, 0, 0], stroke: gold, strokeWidth: u * 0.22 });
    photo(d, b, who, { radius: [b.w / 2, b.w / 2, 0, 0], grayscale: true, bg: mix(p.ground, gold, 0.18), fg: gold, family: SERIF });
  };

  if (cat === "event") {
    const [org, label, title, orn, sub, meta, cta] = rows(B, wide ? [1, 0.7, 3.2, 0.6, 1, 0.8, 1.3] : [1, 0.6, 4.2, 0.6, 1.3, 0.9, 1.4], u * 1.4);
    organiser(d, org, SANS, ivory, "center", "#ffffff");
    d.t(up(c.formatLabel), label, SANS, 500, 2, gold, caps);
    d.t(c.eventTitle, title, SERIF, 600, wide ? 8.4 : 9.6, ivory, { align: "center", valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.1 });
    ornament(orn);
    d.t(c.subtitle, sub, SERIF, 400, 3.4, alpha(ivory, 0.85), { align: "center", valign: "middle", italic: true, maxLines: 2 });
    d.t(up(whenWhere(c)), meta, SANS, 500, 2.2, gold, { ...caps, letterSpacing: u * 0.34 });
    button(d, cta, c.ctaLabel, { fill: "rgba(0,0,0,0)", stroke: gold, ink: gold, family: SANS, weight: 600, radius: 0, align: "center", upper: true, size: 2.1 });
  } else if (cat === "speaker") {
    const name = d.speaker?.name ?? "Speaker";
    const text = (b: Box): void => {
      const [label, nm, role, orn, ev, meta] = rows(b, [0.7, 2.2, 1.2, 0.6, 1, 0.7], u * 1.2);
      d.t(up(c.sideLabel), label, SANS, 500, 2, gold, caps);
      d.t(name, nm, SERIF, 600, 7.6, ivory, { align: "center", valign: "middle", maxLines: 2 });
      d.t(d.speaker?.role ?? "", role, SANS, 400, 2.7, alpha(ivory, 0.82), { align: "center", valign: "middle", maxLines: 2, lineHeight: 1.3 });
      ornament(orn);
      d.t(c.eventTitle, ev, SERIF, 500, 3.1, ivory, { align: "center", valign: "middle", italic: true, maxLines: 2 });
      d.t(up(whenWhere(c)), meta, SANS, 500, 1.9, gold, { ...caps, letterSpacing: u * 0.3 });
    };
    if (wide) {
      const [left, right] = cols(B, [1, 1.35], u * 6);
      arch(fit(left, 0.78));
      text(right);
    } else {
      const [top, bottom] = rows(B, [1.05, 1], u * 3);
      arch(fit(inset(top, 0, u * 1.2), 0.8));
      text(bottom);
    }
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [label, title, orn, area, meta] = rows(B, [0.5, 1.4, 0.4, wide ? 3.6 : 5.6, 0.6], u * 1.4);
    d.t(up(c.speakersLabel), label, SANS, 500, 2, gold, caps);
    d.t(c.eventTitle, title, SERIF, 600, 5.6, ivory, { align: "center", valign: "middle", maxLines: 2 });
    ornament(orn);
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.4).forEach((cell, i) => {
      const [pic, nm, role] = rows(cell, [5, 1, 0.8], u * 0.6);
      arch(fit(inset(pic, u * 1.2), 0.8), people[i]);
      d.t(people[i].name, nm, SERIF, 600, 2.5, ivory, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, SANS, 400, 1.7, alpha(ivory, 0.75), { align: "center", valign: "middle", maxLines: 1 });
    });
    d.t(up(whenWhere(c)), meta, SANS, 500, 2, gold, { ...caps, letterSpacing: u * 0.3 });
  } else {
    const [org, script, orn, plate, nm, orn2, ev, meta] = rows(B, wide ? [0.9, 1.2, 0.4, 3, 0.7, 0.4, 0.8, 0.6] : [0.9, 1.3, 0.4, 3.6, 0.8, 0.4, 1, 0.6], u * 1.3);
    organiser(d, org, SANS, ivory, "center", "#ffffff");
    d.t(partnerLine(d), script, SCRIPT, 400, 6.2, gold, { align: "center", valign: "middle", maxLines: 1 });
    ornament(orn);
    logoPlate(d, fit(plate, 1.9), d.sponsor?.logoUrl, sponsorName(d), { fill: "#fbf7ee", family: SERIF, ink: "#1a1712", stroke: gold, strokeWidth: u * 0.3 });
    d.t(up(c.sponsorLabel), nm, SANS, 500, 2, gold, caps);
    ornament(orn2);
    d.t(c.eventTitle, ev, SERIF, 500, 3.2, ivory, { align: "center", valign: "middle", italic: true, maxLines: 2 });
    d.t(up(whenWhere(c)), meta, SANS, 500, 1.9, gold, { ...caps, letterSpacing: u * 0.3 });
  }
  return d.done();
};

/* ══ 2. SWISS — the grid: hairlines, one red, numerals as architecture ══════ */

export const swiss: DirectionBuild = (input, cat) => {
  const HEAVY = "Archivo", TEXT = "Inter";
  const d = open(input, input.palette.ground);
  const { u, wide, c, p } = d;
  const ink = p.primary, red = p.accent, soft = alpha(ink, 0.62);
  const S = d.safe;
  const rule = (y: number, w = u * 0.16): void => d.line(S.x, y, S.x + S.w, y, ink, w);
  const [head, body] = rows(S, [0.6, 9.4], u * 2.4);
  rule(S.y, u * 0.5);
  const [hl, hr] = cols({ ...head, y: head.y + u * 1.4, h: head.h - u * 1.4 }, [1, 1]);
  d.t(up(c.organizerName), hl, TEXT, 700, 1.9, ink, { valign: "middle", letterSpacing: u * 0.2, maxLines: 1 });
  d.t(up(cat === "event" ? c.formatLabel : cat === "speaker" ? c.sideLabel : cat === "lineup" ? c.speakersLabel : c.sponsorLabel), hr, TEXT, 700, 1.9, red, { align: "right", valign: "middle", letterSpacing: u * 0.2, maxLines: 1 });
  rule(body.y - u * 1.2);
  /** A two-column fact table with hairlines between the rows. */
  const facts = (b: Box, pairs: [string, string][]): void => {
    const list = pairs.filter(([, v]) => v.trim());
    rows(b, list.map(() => 1)).forEach((r, i) => {
      d.line(r.x, r.y, r.x + r.w, r.y, ink, u * 0.12);
      const [k, v] = cols(r, [1, 3.2], u * 2);
      d.t(up(list[i][0]), k, TEXT, 700, 1.6, soft, { valign: "middle", letterSpacing: u * 0.18, maxLines: 1 });
      d.t(list[i][1], v, TEXT, 500, 2.4, ink, { valign: "middle", maxLines: 1 });
    });
  };
  const eventFacts: [string, string][] = [["Event", c.eventTitle], ["Date", c.dateLine], ["Venue", c.venueName], ["Web", c.website]];

  if (cat === "event") {
    const [day, rest] = dateParts(c.dateLine);
    const [top, title, table, foot] = rows(body, wide ? [2.6, 2.6, 1.6, 0.9] : [3, 3.4, 1.8, 0.9], u * 2);
    const [num, side] = cols(top, wide ? [1, 2.4] : [1.15, 1], u * 3);
    d.t(day || "—", num, HEAVY, 800, wide ? 22 : 27, red, { valign: "bottom", lineHeight: 0.9, letterSpacing: -u * 0.6, maxLines: 1 });
    d.t(up(rest), side, HEAVY, 800, 3.6, ink, { valign: "bottom", maxLines: 2, lineHeight: 1.05 });
    rule(title.y - u);
    d.t(c.eventTitle, title, HEAVY, 800, wide ? 8 : 9.4, ink, { valign: "top", maxLines: wide ? 2 : 4, lineHeight: 1, letterSpacing: -u * 0.12 });
    facts(table, [["Time", c.timeLine], ["Venue", c.venueName], ["Web", c.website]]);
    const [note, cta] = cols(foot, [1.6, 1], u * 3);
    d.t(c.subtitle, note, TEXT, 500, 2.3, soft, { valign: "middle", maxLines: 2, lineHeight: 1.3 });
    button(d, cta, c.ctaLabel, { fill: ink, ink: readableOn(ink), family: TEXT, weight: 700, radius: 0, align: "right", upper: true, size: 2 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const [main, table] = rows(body, [5.4, 2.4], u * 2.4);
    const [text, pic] = cols(main, wide ? [1.4, 1] : [1.05, 1], u * 3.5);
    const [idx, nm, role] = rows(text, [1, 3.2, 1.6], u * 1.4);
    d.t("01", idx, HEAVY, 800, 7, red, { valign: "top", lineHeight: 1, maxLines: 1 });
    d.t(sp?.name ?? "Speaker", nm, HEAVY, 800, wide ? 8 : 8.6, ink, { valign: "top", maxLines: 3, lineHeight: 1, letterSpacing: -u * 0.1 });
    d.t(sp?.role ?? "", role, TEXT, 500, 2.6, soft, { valign: "top", maxLines: 3, lineHeight: 1.3 });
    const frame = fit(pic, 0.82, 1, 0);
    photo(d, frame, sp, { grayscale: true, bg: mix(p.ground, ink, 0.12), fg: ink, family: HEAVY });
    d.rect({ x: frame.x, y: frame.y + frame.h + u * 1.2, w: frame.w, h: u * 1 }, red);
    facts(table, eventFacts.slice(0, 3));
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [title, list, foot] = rows(body, [1.7, 6, 0.7], u * 2);
    d.t(c.eventTitle, title, HEAVY, 800, 6, ink, { valign: "top", maxLines: 2, lineHeight: 1, letterSpacing: -u * 0.1 });
    const two = wide || people.length > 3;
    const perCol = two ? Math.ceil(people.length / 2) : people.length;
    cols(list, two ? [1, 1] : [1], u * 4).forEach((col, ci) => {
      rows(col, Array.from({ length: perCol }, () => 1)).forEach((r, ri) => {
        const person = people[ci * perCol + ri];
        if (!person) { d.skip(5); return; }
        d.line(r.x, r.y, r.x + r.w, r.y, ink, u * 0.12);
        const [n, pic, txt] = cols(inset(r, 0, u * 1), [0.5, 0.9, 3.4], u * 1.6);
        d.t(String(ci * perCol + ri + 1).padStart(2, "0"), n, HEAVY, 800, 3, red, { valign: "middle", maxLines: 1 });
        photo(d, fit(pic, 1), person, { grayscale: true, bg: mix(p.ground, ink, 0.12), fg: ink, family: HEAVY });
        const [nm, role] = rows(txt, [1.2, 1]);
        d.t(person.name, nm, HEAVY, 700, 2.7, ink, { valign: "bottom", maxLines: 1 });
        d.t(person.role, role, TEXT, 500, 1.9, soft, { valign: "top", maxLines: 1 });
      });
    });
    rule(foot.y - u * 0.6);
    d.t(up(whenWhere(c)), foot, TEXT, 700, 2, ink, { valign: "middle", letterSpacing: u * 0.2, maxLines: 1 });
  } else {
    const [headline, mid, table] = rows(body, [2.6, 3.4, 2.2], u * 2.4);
    d.t(partnerLine(d), headline, HEAVY, 800, wide ? 7 : 8.4, ink, { valign: "top", maxLines: 3, lineHeight: 1, letterSpacing: -u * 0.1 });
    const [box, side] = cols(mid, [1.5, 1], u * 3);
    logoPlate(d, box, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", stroke: ink, strokeWidth: u * 0.4, family: HEAVY, ink: "#111111" });
    d.rect({ x: side.x, y: side.y, w: u * 6, h: u * 6 }, red);
    d.t(sponsorName(d), { ...side, y: side.y + u * 8, h: side.h - u * 8 }, HEAVY, 800, 4, ink, { valign: "top", maxLines: 3, lineHeight: 1.05 });
    facts(table, eventFacts.slice(0, 3));
  }
  return d.done();
};

/* ══ 3. BRUTAL — the gig poster: one loud colour, black slabs, stickers ═════ */

export const brutal: DirectionBuild = (input, cat) => {
  const SLAB = "Anton", TEXT = "Archivo";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const ink = p.primary, pop = p.accent, ground = p.ground;
  const edge = u * 2.2;
  d.rect(inset(d.full, edge), undefined, { stroke: ink, strokeWidth: u * 1.1 });
  const barH = u * 12;
  const bar: Box = { x: edge, y: H - edge - barH, w: W - edge * 2, h: barH };
  d.rect(bar, ink);
  const B: Box = { x: edge + u * 4, y: edge + u * 4, w: W - (edge + u * 4) * 2, h: bar.y - edge - u * 7 };
  const barText = inset(bar, u * 4, u * 2.2);
  /** A tilted sticker. */
  const sticker = (b: Box, text: string, angle: number): void => {
    d.rect(b, pop, { rotation: angle, stroke: ink, strokeWidth: u * 0.6 });
    d.t(up(text), inset(b, u * 1.4, u * 0.6), SLAB, 400, 3.6, readableOn(pop), { align: "center", valign: "middle", rotation: angle, maxLines: 2, lineHeight: 1 });
  };
  /** A picture with a hard, offset shadow. */
  const hardPhoto = (b: Box, who = d.speaker): void => {
    const off = u * 1.6;
    const box: Box = { x: b.x, y: b.y, w: b.w - off, h: b.h - off };
    d.rect({ x: box.x + off, y: box.y + off, w: box.w, h: box.h }, ink);
    photo(d, box, who, { grayscale: true, bg: pop, fg: readableOn(pop), family: SLAB });
    d.rect(box, undefined, { stroke: ink, strokeWidth: u * 0.7 });
  };

  if (cat === "event") {
    const [top, title, sub] = rows(B, wide ? [0.9, 3.4, 1] : [0.9, 5, 1.2], u * 2);
    const [org, tag] = cols(top, [1.4, 1], u * 3);
    d.t(up(c.organizerName), org, TEXT, 800, 2.4, ink, { valign: "middle", letterSpacing: u * 0.2, maxLines: 1 });
    sticker({ x: tag.x + tag.w - u * 24, y: tag.y, w: u * 24, h: Math.max(u * 6, tag.h) }, c.formatLabel, -5);
    d.t(up(c.eventTitle), title, SLAB, 400, wide ? 13 : 17, ink, { valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 0.98 });
    d.t(c.subtitle, sub, TEXT, 600, 3, ink, { valign: "top", maxLines: 2, lineHeight: 1.25 });
    const [meta, cta] = cols(barText, [1.7, 1], u * 3);
    d.t(up(whenWhere(c, "  /  ")), meta, SLAB, 400, 3.4, ground, { valign: "middle", maxLines: 2, lineHeight: 1.05 });
    d.t(up(c.ctaLabel ? `${c.ctaLabel} →` : ""), cta, SLAB, 400, 3.4, pop === ink ? ground : pop, { align: "right", valign: "middle", maxLines: 1 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    if (wide) {
      const [pic, text] = cols(B, [1, 1.5], u * 5);
      hardPhoto(fit(pic, 0.86, 0, 0.5));
      const [tag, nm, role] = rows(text, [1, 3, 1.4], u * 1.6);
      sticker({ x: tag.x, y: tag.y, w: u * 22, h: tag.h }, c.sideLabel, -4);
      d.t(up(sp?.name ?? "Speaker"), nm, SLAB, 400, 12, ink, { valign: "middle", maxLines: 2, lineHeight: 0.98 });
      d.t(sp?.role ?? "", role, TEXT, 600, 2.9, ink, { valign: "top", maxLines: 2, lineHeight: 1.25 });
    } else {
      const [pic, nm, role] = rows(B, [4.6, 2.6, 1], u * 2);
      // The sticker has a column of its own beside the photo.
      const [picCol, tagCol] = cols(pic, [2.4, 1], u * 3.5);
      hardPhoto(fit(picCol, 1.05, 0, 0.5));
      sticker({ x: tagCol.x, y: tagCol.y + u * 2, w: tagCol.w, h: Math.min(u * 9, tagCol.h * 0.4) }, c.sideLabel, 6);
      d.t(up(sp?.name ?? "Speaker"), nm, SLAB, 400, 14, ink, { valign: "middle", maxLines: 2, lineHeight: 0.98 });
      d.t(sp?.role ?? "", role, TEXT, 600, 2.9, ink, { valign: "top", maxLines: 2, lineHeight: 1.25 });
    }
    const [ev, meta] = cols(barText, [1.3, 1], u * 3);
    d.t(up(c.eventTitle), ev, SLAB, 400, 3.2, ground, { valign: "middle", maxLines: 2, lineHeight: 1.05 });
    d.t(up(whenWhere(c, " / ")), meta, TEXT, 700, 2.1, pop === ink ? ground : pop, { align: "right", valign: "middle", maxLines: 2, lineHeight: 1.2 });
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [title, area] = rows(B, [1.5, 6], u * 2.4);
    const [big, ev] = cols(title, [1, 1.3], u * 3);
    d.t(up(c.speakersLabel), big, SLAB, 400, 8.6, ink, { valign: "middle", maxLines: 2, lineHeight: 0.98 });
    d.t(up(c.eventTitle), ev, TEXT, 800, 2.6, ink, { align: "right", valign: "middle", maxLines: 3, lineHeight: 1.15 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.6).forEach((cell, i) => {
      const [pic, strip] = rows(cell, [4, 1], u * 1);
      const frame = fit(pic, 1);
      photo(d, frame, people[i], { grayscale: true, bg: pop, fg: readableOn(pop), family: SLAB });
      d.rect(frame, undefined, { stroke: ink, strokeWidth: u * 0.6 });
      const nameBox: Box = { x: frame.x, y: strip.y, w: frame.w, h: strip.h };
      d.rect(nameBox, ink);
      d.t(up(people[i].name), inset(nameBox, u * 0.8, u * 0.3), SLAB, 400, 2.4, ground, { align: "center", valign: "middle", maxLines: 1 });
    });
    const [meta, cta] = cols(barText, [1.7, 1], u * 3);
    d.t(up(whenWhere(c, "  /  ")), meta, SLAB, 400, 3.2, ground, { valign: "middle", maxLines: 2, lineHeight: 1.05 });
    d.t(up(c.ctaLabel ? `${c.ctaLabel} →` : ""), cta, SLAB, 400, 3.2, pop === ink ? ground : pop, { align: "right", valign: "middle", maxLines: 1 });
  } else {
    const [headline, mid] = rows(B, wide ? [1.6, 2.6] : [2.6, 3.8], u * 2.6);
    d.t(up(partnerLine(d)), headline, SLAB, 400, wide ? 10 : 13, ink, { valign: "middle", maxLines: wide ? 2 : 3, lineHeight: 0.98 });
    const [plateArea, side] = cols(mid, [1.7, 1], u * 4);
    const off = u * 1.6;
    const plate: Box = { x: plateArea.x, y: plateArea.y, w: plateArea.w - off, h: plateArea.h - off };
    d.rect({ x: plate.x + off, y: plate.y + off, w: plate.w, h: plate.h }, ink);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", stroke: ink, strokeWidth: u * 0.7, family: SLAB, weight: 400, ink: "#111111" });
    sticker({ x: side.x, y: side.y + side.h * 0.2, w: side.w, h: Math.min(side.h * 0.5, u * 11) }, c.sponsorLabel, 7);
    const [ev, meta] = cols(barText, [1.3, 1], u * 3);
    d.t(up(c.eventTitle), ev, SLAB, 400, 3.2, ground, { valign: "middle", maxLines: 2, lineHeight: 1.05 });
    d.t(up(whenWhere(c, " / ")), meta, TEXT, 700, 2.1, pop === ink ? ground : pop, { align: "right", valign: "middle", maxLines: 2, lineHeight: 1.2 });
  }
  return d.done();
};

/* ══ 4. AURORA — night sky: coloured light, glass panels, gradient type ═════ */

export const aurora: DirectionBuild = (input, cat) => {
  const HEAD = "Space Grotesk", TEXT = "Inter";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const a = p.primary, b = p.accent, white = "#ffffff", soft = "rgba(255,255,255,0.74)";
  const light = (cx: number, cy: number, r: number, color: string, strength: number): void =>
    d.disc(cx, cy, r, { type: "radial", center: [0.5, 0.5], radius: 0.5, stops: [[0, alpha(color, strength)], [0.6, alpha(color, strength * 0.3)], [1, alpha(color, 0)]] });
  const big = Math.max(W, H);
  light(W * 0.88, H * 0.08, big * 0.62, a, 0.85);
  light(W * 0.05, H * 0.92, big * 0.6, b, 0.7);
  light(W * 0.5, H * 0.5, big * 0.4, mix(a, b, 0.5), 0.25);
  const grad: Fill = { type: "linear", from: [0, 0], to: [1, 1], stops: [[0, mix(a, white, 0.35)], [1, mix(b, white, 0.35)]] };
  const glass = (box: Box, radius = u * 4): void => d.rect(box, "rgba(255,255,255,0.09)", { radius, stroke: "rgba(255,255,255,0.28)", strokeWidth: u * 0.14 });
  const chip = (box: Box, text: string): void => {
    const w = Math.min(box.w, u * (text.length * 1.5 + 6));
    const r = { x: box.x, y: box.y, w, h: box.h };
    d.rect(r, "rgba(255,255,255,0.12)", { radius: box.h / 2, stroke: "rgba(255,255,255,0.35)", strokeWidth: u * 0.12 });
    d.t(up(text), inset(r, u * 1.6, 0), TEXT, 600, 1.8, white, { align: "center", valign: "middle", letterSpacing: u * 0.24, maxLines: 1 });
  };
  const ringPhoto = (box: Box, who = d.speaker): void => {
    const r = Math.min(box.w, box.h) / 2, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    d.disc(cx, cy, r, grad);
    photo(d, { x: cx - r * 0.93, y: cy - r * 0.93, w: r * 1.86, h: r * 1.86 }, who, { circle: true, bg: mix(p.ground, a, 0.4), fg: white, family: HEAD });
  };
  const S = d.safe;

  if (cat === "event") {
    const [org, panel] = rows(S, wide ? [1, 6] : [1, 7.5], u * 3);
    organiser(d, org, TEXT, white, "left", "#ffffff");
    glass(panel);
    const [lab, title, sub, meta, cta] = rows(inset(panel, u * 5, u * 4.5), wide ? [0.7, 3, 1, 0.7, 1.1] : [0.6, 3.8, 1.3, 0.7, 1.1], u * 1.6);
    chip({ ...lab, h: Math.min(lab.h, u * 4.6) }, c.formatLabel);
    d.t(c.eventTitle, title, HEAD, 700, wide ? 8.4 : 10, grad, { valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.04, letterSpacing: -u * 0.12 });
    d.t(c.subtitle, sub, TEXT, 400, 3, soft, { valign: "top", maxLines: 2, lineHeight: 1.35 });
    d.t(whenWhere(c), meta, TEXT, 600, 2.5, white, { valign: "middle", maxLines: 1 });
    button(d, cta, c.ctaLabel, { fill: grad, ink: "#0b0b14", family: HEAD, weight: 700, size: 2.4 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const text = (box: Box, align: "left" | "center"): void => {
      const [lab, nm, role, ev, meta] = rows(box, [0.7, 2.4, 1.3, 1, 0.7], u * 1.4);
      const chipBox = { ...lab, h: Math.min(lab.h, u * 4.6) };
      chip(align === "center" ? { ...chipBox, x: chipBox.x + (chipBox.w - Math.min(chipBox.w, u * (c.sideLabel.length * 1.5 + 6))) / 2 } : chipBox, c.sideLabel);
      d.t(sp?.name ?? "Speaker", nm, HEAD, 700, 7.6, white, { align, valign: "middle", maxLines: 2, lineHeight: 1.04, letterSpacing: -u * 0.1 });
      d.t(sp?.role ?? "", role, TEXT, 400, 2.7, soft, { align, valign: "top", maxLines: 2, lineHeight: 1.35 });
      d.t(c.eventTitle, ev, HEAD, 600, 2.9, grad, { align, valign: "middle", maxLines: 2 });
      d.t(whenWhere(c), meta, TEXT, 500, 2.1, soft, { align, valign: "middle", maxLines: 1 });
    };
    if (wide) {
      const [pic, panel] = cols(S, [1, 1.5], u * 5);
      ringPhoto(fit(pic, 1));
      glass(panel);
      text(inset(panel, u * 5, u * 4), "left");
    } else {
      const [pic, panel] = rows(S, [1, 1.05], u * 3.5);
      ringPhoto(fit(pic, 1));
      glass(panel);
      text(inset(panel, u * 4.5, u * 4), "center");
    }
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, area, meta] = rows(S, [0.5, 1.5, wide ? 3.6 : 6, 0.6], u * 1.8);
    chip({ ...lab, h: Math.min(lab.h, u * 4.6) }, c.speakersLabel);
    d.t(c.eventTitle, title, HEAD, 700, 6, grad, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.2).forEach((cell, i) => {
      glass(cell, u * 3);
      const [pic, nm, role] = rows(inset(cell, u * 1.8), [4, 1, 0.8], u * 0.7);
      ringPhoto(fit(pic, 1), people[i]);
      d.t(people[i].name, nm, HEAD, 700, 2.4, white, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, TEXT, 400, 1.7, soft, { align: "center", valign: "middle", maxLines: 1 });
    });
    d.t(whenWhere(c), meta, TEXT, 600, 2.3, white, { valign: "middle", maxLines: 1 });
  } else {
    const [org, headline, panel, ev, meta] = rows(S, wide ? [0.9, 1.4, 3.4, 0.8, 0.6] : [0.9, 2, 4.4, 1, 0.6], u * 2);
    organiser(d, org, TEXT, white, "left", "#ffffff");
    d.t(partnerLine(d), headline, HEAD, 700, wide ? 6 : 7.4, grad, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    glass(panel);
    const [plate, side] = wide ? cols(inset(panel, u * 4), [1.3, 1], u * 4) : rows(inset(panel, u * 4), [2.2, 1], u * 2.5);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", radius: u * 3, family: HEAD, ink: "#0b0b14" });
    const [lab, nm] = rows(side, [1, 1.6], u * 1);
    chip({ ...lab, h: Math.min(lab.h, u * 4.6) }, c.sponsorLabel);
    d.t(sponsorName(d), nm, HEAD, 700, 4.4, white, { valign: "top", maxLines: 2 });
    d.t(c.eventTitle, ev, HEAD, 600, 3, white, { valign: "middle", maxLines: 2 });
    d.t(whenWhere(c), meta, TEXT, 500, 2.1, soft, { valign: "middle", maxLines: 1 });
  }
  return d.done();
};

/* ══ 5. EDITORIAL — the magazine: masthead, serif headline, columns ═════════ */

export const editorial: DirectionBuild = (input, cat) => {
  const SERIF = "DM Serif Display", TEXT = "Inter";
  const d = open(input, input.palette.ground);
  const { u, wide, c, p } = d;
  const ink = p.primary, hot = p.accent, soft = alpha(ink, 0.66);
  const S = d.safe;
  const [mast, body] = rows(S, [0.7, 9.3], u * 3);
  const [ml, mr] = cols(mast, [1.6, 1]);
  d.t(up(c.organizerName), ml, TEXT, 700, 2, ink, { valign: "middle", letterSpacing: u * 0.42, maxLines: 1 });
  d.t(up(`Edition ${input.year}`.trim()), mr, TEXT, 500, 1.8, soft, { align: "right", valign: "middle", letterSpacing: u * 0.3, maxLines: 1 });
  d.line(S.x, mast.y + mast.h + u * 0.9, S.x + S.w, mast.y + mast.h + u * 0.9, ink, u * 0.5);
  d.line(S.x, mast.y + mast.h + u * 1.7, S.x + S.w, mast.y + mast.h + u * 1.7, ink, u * 0.12);
  /** Small-cap label over a value, repeated across columns. */
  const columns = (box: Box, pairs: [string, string][]): void => {
    const list = pairs.filter(([, v]) => v.trim());
    d.line(box.x, box.y, box.x + box.w, box.y, ink, u * 0.12);
    cols({ ...box, y: box.y + u * 1.6, h: box.h - u * 1.6 }, list.map(() => 1), u * 3).forEach((col, i) => {
      const [k, v] = rows(col, [1, 2.2], u * 0.5);
      d.t(up(list[i][0]), k, TEXT, 700, 1.6, hot, { valign: "top", letterSpacing: u * 0.24, maxLines: 1 });
      d.t(list[i][1], v, SERIF, 400, 3, ink, { valign: "top", maxLines: 2, lineHeight: 1.15 });
    });
  };
  const facts: [string, string][] = [["When", c.dateLine], ["Where", c.venueName], ["Online", c.website]];

  if (cat === "event") {
    const [day] = dateParts(c.dateLine);
    const [kick, main, deck, foot] = rows(body, wide ? [0.7, 3.4, 1.2, 1.6] : [0.7, 4.6, 1.6, 1.8], u * 2);
    d.t(c.formatLabel, kick, SERIF, 400, 3, hot, { valign: "middle", italic: true, maxLines: 1 });
    const [title, num] = cols(main, [2.6, 1], u * 3);
    d.t(c.eventTitle, title, SERIF, 400, wide ? 8.6 : 10.4, ink, { valign: "top", maxLines: wide ? 3 : 5, lineHeight: 1.02 });
    d.t(day, num, SERIF, 400, wide ? 22 : 26, hot, { align: "right", valign: "top", lineHeight: 0.9, maxLines: 1 });
    const [text, cta] = cols(deck, [1.9, 1], u * 3);
    d.t(c.subtitle, text, TEXT, 400, 2.7, soft, { valign: "top", maxLines: 3, lineHeight: 1.4 });
    d.t(c.ctaLabel ? `${c.ctaLabel} →` : "", cta, SERIF, 400, 3.4, ink, { align: "right", valign: "top", italic: true, maxLines: 1 });
    columns(foot, [["When", c.dateLine], ["Time", c.timeLine], ["Where", c.venueName]]);
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const [main, foot] = rows(body, [5.6, 1.7], u * 2.4);
    const [text, pic] = cols(main, wide ? [1.5, 1] : [1.1, 1], u * 4);
    const [kick, quote, nm, role] = rows(text, [0.7, 1.3, 3, 1.5], u * 1.2);
    d.t(c.introLine, kick, SERIF, 400, 3, hot, { valign: "middle", italic: true, maxLines: 1 });
    d.t("“", quote, SERIF, 400, 16, hot, { valign: "top", lineHeight: 0.8, maxLines: 1 });
    d.t(sp?.name ?? "Speaker", nm, SERIF, 400, wide ? 8 : 8.4, ink, { valign: "top", maxLines: 3, lineHeight: 1.02 });
    d.t(sp?.role ?? "", role, TEXT, 500, 2.5, soft, { valign: "top", maxLines: 3, lineHeight: 1.35 });
    const frame = fit(pic, 0.76, 1, 0);
    photo(d, frame, sp, { bg: mix(p.ground, ink, 0.14), fg: ink, family: SERIF });
    d.rect(inset(frame, -u * 1), undefined, { stroke: ink, strokeWidth: u * 0.14 });
    columns(foot, [["Event", c.eventTitle], ["When", c.dateLine], ["Where", c.venueName]]);
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [kick, title, list, foot] = rows(body, [0.6, 1.6, 5.6, 1.5], u * 1.8);
    d.t(c.speakersLabel, kick, SERIF, 400, 3, hot, { valign: "middle", italic: true, maxLines: 1 });
    d.t(c.eventTitle, title, SERIF, 400, 6.4, ink, { valign: "top", maxLines: 2, lineHeight: 1.02 });
    const two = wide || people.length > 3;
    const perCol = two ? Math.ceil(people.length / 2) : people.length;
    const columnsBox = cols(list, two ? [1, 1] : [1], u * 5);
    if (two) d.line(list.x + list.w / 2, list.y, list.x + list.w / 2, list.y + list.h, alpha(ink, 0.3), u * 0.12);
    columnsBox.forEach((col, ci) => {
      rows(col, Array.from({ length: perCol }, () => 1), u * 1.2).forEach((r, ri) => {
        const person = people[ci * perCol + ri];
        if (!person) { d.skip(3); return; }
        const [pic, txt] = cols(r, [1, 3.2], u * 2);
        photo(d, fit(pic, 1, 0, 0.5), person, { circle: true, bg: mix(p.ground, ink, 0.14), fg: ink, family: SERIF });
        const [nm, role] = rows(txt, [1.2, 1]);
        d.t(person.name, nm, SERIF, 400, 3.4, ink, { valign: "bottom", maxLines: 1 });
        d.t(person.role, role, TEXT, 500, 1.9, soft, { valign: "top", maxLines: 2, lineHeight: 1.3 });
      });
    });
    columns(foot, facts);
  } else {
    const [kick, headline, mid, foot] = rows(body, [0.7, 2.2, 3.6, 1.7], u * 2);
    d.t(c.sponsorLabel, kick, SERIF, 400, 3, hot, { valign: "middle", italic: true, maxLines: 1 });
    d.t(partnerLine(d), headline, SERIF, 400, wide ? 7 : 8.4, ink, { valign: "top", maxLines: 3, lineHeight: 1.02 });
    const [plate, side] = cols(mid, [1.5, 1], u * 4);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", stroke: ink, strokeWidth: u * 0.14, family: SERIF, weight: 400, ink: "#111111" });
    d.t(sponsorName(d), side, SERIF, 400, 4.6, ink, { valign: "bottom", maxLines: 3, lineHeight: 1.05 });
    columns(foot, [["Event", c.eventTitle], ["When", c.dateLine], ["Where", c.venueName]]);
  }
  return d.done();
};

/* ══ 6. POP — playtime: flat brights, big shapes, cards with hard shadows ═══ */

export const pop: DirectionBuild = (input, cat) => {
  const HEAD = "Poppins";
  const d = open(input, input.palette.ground);
  const { W, H, u, wide, c, p } = d;
  const bold = p.primary, zest = p.accent, ink = "#17171f";
  // Shapes: one big disc in the corner and a few small accents.
  d.disc(W, 0, Math.min(W, H) * 0.19, bold);
  // Small accents kept inside the outer margin, clear of every text box.
  d.disc(0, H * 0.5, u * 5.5, zest);
  d.disc(W * 0.64, u * 5, u * 2.2, zest);
  d.rect({ x: W * 0.69, y: u * 2.4, w: u * 3.6, h: u * 3.6 }, ink, { rotation: 20 });
  /** A white card with an ink outline and a hard shadow. */
  const cardBox = (box: Box, fill = "#ffffff"): void => {
    d.rect({ x: box.x + u * 1.4, y: box.y + u * 1.4, w: box.w, h: box.h }, ink, { radius: u * 3 });
    d.rect(box, fill, { radius: u * 3, stroke: ink, strokeWidth: u * 0.5 });
  };
  const tag = (box: Box, text: string, angle = -4): void => {
    const w = Math.min(box.w, u * (text.length * 1.7 + 6));
    const r = { x: box.x, y: box.y, w, h: box.h };
    d.rect(r, zest, { radius: box.h / 2, stroke: ink, strokeWidth: u * 0.45, rotation: angle });
    d.t(up(text), inset(r, u * 1.4, 0), HEAD, 800, 2, readableOn(zest), { align: "center", valign: "middle", rotation: angle, letterSpacing: u * 0.14, maxLines: 1 });
  };
  const discPhoto = (box: Box, who = d.speaker, color = bold): void => {
    const r = Math.min(box.w, box.h) / 2, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    d.disc(cx + r * 0.1, cy + r * 0.1, r * 0.92, color);
    d.disc(cx - r * 0.04, cy - r * 0.04, r * 0.9, "#ffffff", { stroke: ink, strokeWidth: u * 0.5 });
    photo(d, { x: cx - r * 0.04 - r * 0.82, y: cy - r * 0.04 - r * 0.82, w: r * 1.64, h: r * 1.64 }, who, { circle: true, bg: zest, fg: readableOn(zest), family: HEAD });
  };
  const S = inset(d.safe, u * 1.5);

  if (cat === "event") {
    const [top, panel, foot] = rows(S, wide ? [1, 4.6, 1.2] : [1, 6, 1.3], u * 2.6);
    organiser(d, { ...top, w: top.w * 0.6 }, HEAD, ink, "left", "#ffffff");
    cardBox(panel);
    const [lab, title, sub] = rows(inset(panel, u * 4.5, u * 4), [0.8, 3.6, 1.2], u * 1.6);
    tag({ ...lab, h: Math.min(lab.h, u * 5) }, c.formatLabel);
    d.t(c.eventTitle, title, HEAD, 800, wide ? 8 : 9.6, ink, { valign: "middle", maxLines: wide ? 2 : 4, lineHeight: 1.04, letterSpacing: -u * 0.1 });
    d.t(c.subtitle, sub, HEAD, 500, 2.8, alpha(ink, 0.72), { valign: "top", maxLines: 2, lineHeight: 1.35 });
    const [meta, cta] = cols(foot, [1.6, 1], u * 3);
    d.t(whenWhere(c), meta, HEAD, 700, 2.7, ink, { valign: "middle", maxLines: 2, lineHeight: 1.2 });
    button(d, cta, c.ctaLabel, { fill: ink, ink: "#ffffff", family: HEAD, weight: 700, align: "right", size: 2.4 });
  } else if (cat === "speaker") {
    const sp = d.speaker;
    const body = (box: Box): void => {
      cardBox(box);
      const [lab, nm, role, ev] = rows(inset(box, u * 4, u * 3.4), [0.8, 2.2, 1.2, 1], u * 1.2);
      tag({ ...lab, h: Math.min(lab.h, u * 5) }, c.sideLabel);
      d.t(sp?.name ?? "Speaker", nm, HEAD, 800, 7, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04, letterSpacing: -u * 0.08 });
      d.t(sp?.role ?? "", role, HEAD, 500, 2.6, alpha(ink, 0.72), { valign: "top", maxLines: 2, lineHeight: 1.3 });
      d.t(`${c.eventTitle}${whenWhere(c) ? "  ·  " + c.dateLine : ""}`, ev, HEAD, 700, 2.2, ink, { valign: "middle", maxLines: 2, lineHeight: 1.25 });
    };
    if (wide) {
      const [pic, panel] = cols(S, [1, 1.45], u * 5);
      discPhoto(fit(pic, 1));
      body(inset(panel, 0, u * 2));
    } else {
      const [pic, panel] = rows(S, [1.1, 1], u * 3);
      discPhoto(fit(pic, 1));
      body(panel);
    }
  } else if (cat === "lineup") {
    const people = d.people.slice(0, 6);
    const [lab, title, area, meta] = rows(S, [0.6, 1.5, wide ? 3.6 : 6, 0.7], u * 1.8);
    tag({ ...lab, h: Math.min(lab.h, u * 5) }, c.speakersLabel);
    d.t(c.eventTitle, { ...title, w: title.w * 0.8 }, HEAD, 800, 5.8, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    const tints = [bold, zest, ink];
    grid(area, people.length, wide ? 6 : people.length <= 4 ? 2 : 3, u * 2.2).forEach((cell, i) => {
      const [pic, nm, role] = rows(cell, [4, 1, 0.8], u * 0.6);
      discPhoto(fit(pic, 1), people[i], tints[i % tints.length]);
      d.t(people[i].name, nm, HEAD, 800, 2.4, ink, { align: "center", valign: "middle", maxLines: 1 });
      d.t(people[i].role, role, HEAD, 500, 1.7, alpha(ink, 0.7), { align: "center", valign: "middle", maxLines: 1 });
    });
    d.t(whenWhere(c), meta, HEAD, 700, 2.5, ink, { valign: "middle", maxLines: 1 });
  } else {
    const [top, headline, panel, foot] = rows(S, wide ? [0.9, 1.4, 3.4, 0.9] : [0.9, 2, 4.4, 1.1], u * 2.2);
    organiser(d, { ...top, w: top.w * 0.6 }, HEAD, ink, "left", "#ffffff");
    d.t(partnerLine(d), { ...headline, w: headline.w * 0.84 }, HEAD, 800, wide ? 6 : 7.4, ink, { valign: "middle", maxLines: 2, lineHeight: 1.04 });
    cardBox(panel);
    const [plate, side] = wide ? cols(inset(panel, u * 4), [1.4, 1], u * 4) : rows(inset(panel, u * 4), [2.4, 1], u * 2);
    logoPlate(d, plate, d.sponsor?.logoUrl, sponsorName(d), { fill: "#ffffff", family: HEAD, weight: 800, ink, pad: 0.08 });
    const [lab, nm] = wide ? rows(side, [1, 2], u * 1.4) : cols(side, [1, 1.6], u * 2);
    tag({ ...lab, h: Math.min(lab.h, u * 5) }, c.sponsorLabel, wide ? -4 : 0);
    d.t(sponsorName(d), nm, HEAD, 800, 4, ink, { valign: wide ? "top" : "middle", maxLines: 2 });
    d.t(`${c.eventTitle}  ·  ${whenWhere(c)}`, foot, HEAD, 700, 2.4, ink, { valign: "middle", maxLines: 2, lineHeight: 1.25 });
  }
  void cover;
  return d.done();
};
