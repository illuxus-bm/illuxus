/**
 * Creative studio templates.
 *
 * Three poster designs, each a pure function from event data to a `Scene`:
 *
 *   - Spotlight — one speaker's portrait bleeding into a tinted panel beside
 *     the event details, under a white organiser header and over a dark
 *     footer carrying the organiser's address and the sponsor.
 *   - Lineup    — the event title over a gradient oval, a row of circular
 *     speaker portraits, then date and venue either side of a divider.
 *   - Webinar   — a heavy condensed headline, accent ribbon, checklist and
 *     date on the left; the speaker in an arched frame with a name plate on
 *     the right.
 *
 * Everything on a creative comes from the event's own data (see `data.ts`);
 * the organiser can then edit any line. Layouts are expressed as fractions
 * of the canvas so one template serves square, portrait, story and
 * landscape sizes.
 */
import {
  alpha,
  darken,
  lighten,
  mix,
  readableOn,
  type Fill,
  type ImageNode,
  type Scene,
  type SceneNode,
  type TextNode,
} from "./scene";

// ─── Formats ─────────────────────────────────────────────────────────────────

export interface StudioFormat {
  /** Stored in `event_creatives.platform_format`. */
  id: string;
  label: string;
  hint: string;
  width: number;
  height: number;
}

export const STUDIO_FORMATS: StudioFormat[] = [
  { id: "instagram-portrait", label: "Portrait", hint: "1080 × 1350 · Instagram, LinkedIn feed", width: 1080, height: 1350 },
  { id: "instagram-post", label: "Square", hint: "1080 × 1080 · Instagram, Facebook", width: 1080, height: 1080 },
  { id: "instagram-story", label: "Story", hint: "1080 × 1920 · Stories, Reels, WhatsApp status", width: 1080, height: 1920 },
  { id: "linkedin-post", label: "Landscape", hint: "1200 × 627 · LinkedIn, X, link previews", width: 1200, height: 627 },
];

// ─── Data ────────────────────────────────────────────────────────────────────

export interface StudioSpeaker {
  id: string;
  name: string;
  /** Job title and company, already joined ("CEO, Salford & Co."). */
  role: string;
  photoUrl: string | null;
  bio?: string;
}

export interface StudioSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** Every editable line on a creative. All start from the event's data. */
export interface StudioContent {
  organizerName: string;
  organizerTagline: string;
  kicker: string;
  eventTitle: string;
  subtitle: string;
  dateLine: string;
  timeLine: string;
  venueName: string;
  venueAddress: string;
  infoLabel: string;
  website: string;
  phone: string;
  ctaLabel: string;
  description: string;
  /** One talking point per line. */
  bullets: string;
  badge: string;
  formatLabel: string;
  speakersLabel: string;
  sponsorLabel: string;
  linkLabel: string;
  /** The label set up the side of the Speaker Card ("Speaker"). */
  sideLabel: string;
  /** The handwritten line on the Session and Training designs. */
  scriptLine: string;
}

export type StudioContentKey = keyof StudioContent;

export interface StudioPalette {
  primary: string;
  accent: string;
  ground: string;
}

export interface BuildInput {
  format: StudioFormat;
  content: StudioContent;
  /** The speakers to feature, in order. Single-speaker templates use the first. */
  speakers: StudioSpeaker[];
  sponsors: StudioSponsor[];
  organizerLogoUrl: string | null;
  /** The event's cover image — stands in when there is no speaker photo. */
  coverImageUrl: string | null;
  /** Used when the title carries no year of its own. */
  year: string;
  palette: StudioPalette;
}

export interface StudioField {
  key: StudioContentKey;
  label: string;
  multiline?: boolean;
}

export interface StudioTemplate {
  id: string;
  name: string;
  description: string;
  /** How many speakers the design features. */
  maxSpeakers: number;
  palette: StudioPalette;
  paletteLabels: Record<keyof StudioPalette, string>;
  /** The content lines this design actually draws, in reading order. */
  fields: StudioField[];
  /** Format ids this design is laid out for; omitted means all of them. */
  formats?: string[];
  build: (input: BuildInput) => Scene;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SANS = "Barlow";
const SERIF = "Merriweather";
const SCRIPT = "Great Vibes";
const DISPLAY = "Anton";
const BODY = "Poppins";

const upper = (value: string): string => value.toUpperCase();

/** Up to two initials, for the placeholder drawn when a photo is missing. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Splits `text` into at most `lineCount` lines at word boundaries, choosing
 * the split whose longest line is shortest, so a headline stacks as an even
 * block. Pure.
 */
export function balanceWords(text: string, lineCount: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const count = Math.max(1, Math.min(lineCount, words.length));
  if (words.length === 0) return [];
  if (count === 1) return [words.join(" ")];
  let best: string[] = [];
  let bestLength = Infinity;
  const visit = (start: number, remaining: number, acc: string[]): void => {
    if (remaining === 1) {
      const lines = [...acc, words.slice(start).join(" ")];
      const longest = Math.max(...lines.map((l) => l.length));
      if (longest < bestLength) {
        bestLength = longest;
        best = lines;
      }
      return;
    }
    for (let end = start + 1; end <= words.length - (remaining - 1); end += 1) {
      visit(end, remaining - 1, [...acc, words.slice(start, end).join(" ")]);
    }
  };
  visit(0, count, []);
  return best;
}

/**
 * Breaks an event title into the three parts the Lineup design sets in
 * different faces: a serif top line, one word in script, and the year.
 * "World Business Conference 2022" → World Business / Conference / 2022.
 */
export function splitLineupTitle(title: string, fallbackYear: string): { top: string; script: string; year: string } {
  const words = title.trim().split(/\s+/).filter(Boolean);
  let year = "";
  const rest: string[] = [];
  for (const word of words) {
    if (!year && /^(19|20)\d{2}$/.test(word)) year = word;
    else rest.push(word);
  }
  const script = rest.pop() ?? "";
  return { top: rest.join(" "), script, year: year || fallbackYear };
}

/** Non-empty bullet lines, trimmed. */
export function bulletLines(bullets: string, max: number): string[] {
  return bullets
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

type TextStyle = Omit<TextNode, "kind" | "text" | "x" | "y" | "w" | "h">;

/** Collects nodes, dropping text that has nothing to say. */
function createScene(format: StudioFormat, background: string) {
  const nodes: SceneNode[] = [];
  // Ids count every call, including text that is skipped for being blank, so
  // clearing one field doesn't renumber the nodes after it and detach the
  // organiser's edits from them.
  let count = 0;
  const nextId = (): string => `n${(count += 1)}`;
  return {
    nodes,
    add: (node: SceneNode): void => {
      nodes.push({ ...node, id: nextId() });
    },
    text: (value: string, x: number, y: number, w: number, h: number, style: TextStyle): void => {
      const id = nextId();
      if (!value.trim()) return;
      nodes.push({ kind: "text", text: value, x, y, w, h, ...style, id });
    },
    /** Burns `n` ids for nodes a branch chose not to draw, keeping later ids stable. */
    skip: (n = 1): void => {
      count += n;
    },
    done: (): Scene => ({ width: format.width, height: format.height, background, nodes }),
  };
}

function portrait(
  box: { x: number; y: number; w: number; h: number },
  speaker: StudioSpeaker | undefined,
  coverImageUrl: string | null,
  fallback: { background: Fill; color: string; family: string; label: string },
  extra: Partial<ImageNode> = {},
): ImageNode {
  return {
    kind: "image",
    ...box,
    src: speaker?.photoUrl ?? (speaker ? null : coverImageUrl),
    fit: "cover",
    focalY: speaker?.photoUrl ? 0.18 : 0.5,
    role: "speaker-photo",
    fallback: {
      initials: initialsOf(speaker?.name ?? fallback.label),
      background: fallback.background,
      color: fallback.color,
      family: fallback.family,
    },
    ...extra,
  };
}

// ─── Spotlight ───────────────────────────────────────────────────────────────

function sponsorTiles(
  scene: ReturnType<typeof createScene>,
  sponsors: StudioSponsor[],
  area: { x: number; y: number; w: number; h: number },
  ink: string,
  s: number,
): void {
  const shown = sponsors.slice(0, 3);
  const gap = 12 * s;
  const tileW = (area.w - gap * (shown.length - 1)) / shown.length;
  shown.forEach((sponsor, i) => {
    const x = area.x + i * (tileW + gap);
    scene.add({ kind: "rect", x, y: area.y, w: tileW, h: area.h, fill: "#ffffff" });
    const padX = tileW * 0.08;
    const padY = area.h * 0.16;
    if (sponsor.logoUrl) {
      scene.add({
        kind: "image",
        role: "sponsor-logo",
        src: sponsor.logoUrl,
        fit: "contain",
        x: x + padX,
        y: area.y + padY,
        w: tileW - padX * 2,
        h: area.h - padY * 2,
      });
    } else {
      scene.text(upper(sponsor.name), x + padX, area.y, tileW - padX * 2, area.h, {
        family: SERIF,
        weight: 700,
        size: 30 * s,
        minSize: 12 * s,
        color: ink,
        align: "center",
        valign: "middle",
        letterSpacing: 2 * s,
        maxLines: 1,
      });
    }
  });
}

function buildSpotlight(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const navy = palette.primary;
  const ground = palette.ground;
  const highlight = palette.accent;
  const speaker = input.speakers[0];
  const scene = createScene(format, ground);
  const band = darken(ground, 0.17);
  const photoFallback = { background: mix(ground, navy, 0.35), color: "#ffffff", family: SANS, label: content.eventTitle };
  const dotted = (x1: number, x2: number, y: number, s: number): void =>
    scene.add({ kind: "line", x1, y1: y, x2, y2: y, color: alpha("#ffffff", 0.9), width: 2.6 * s, dash: [0, 7.5 * s], round: true });
  const headline = upper(speaker?.name || content.eventTitle);
  const contactLines = [content.website, content.phone].filter((l) => l.trim());

  if (W / H > 1.4) {
    const s = H / 900;
    const footerH = Math.round(H * 0.17);
    const bodyH = H - footerH;
    scene.add({
      kind: "rect", x: 0, y: 0, w: W, h: H,
      fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, lighten(ground, 0.7)], [0.5, ground], [1, darken(ground, 0.04)]] },
    });
    scene.add(portrait({ x: 0, y: 0, w: W * 0.4, h: bodyH }, speaker, input.coverImageUrl, photoFallback));
    scene.add({
      kind: "rect", x: W * 0.24, y: 0, w: W * 0.162, h: bodyH,
      fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, alpha(ground, 0)], [1, ground]] },
    });

    const cx = W * 0.43;
    const cw = W * 0.53;
    if (input.organizerLogoUrl) {
      scene.add({ kind: "image", role: "organizer-logo", src: input.organizerLogoUrl, fit: "contain", x: cx + cw * 0.25, y: H * 0.05, w: cw * 0.5, h: H * 0.1 });
    } else {
      scene.text(upper(content.organizerName), cx, H * 0.05, cw, H * 0.1, {
        family: SANS, weight: 600, size: 30 * s, color: navy, align: "center", valign: "middle", letterSpacing: 3 * s, maxLines: 1,
      });
    }
    scene.text(content.kicker, cx, H * 0.175, cw, H * 0.05, { family: SANS, weight: 400, size: 27 * s, color: navy, align: "center", valign: "middle", maxLines: 1 });
    scene.text(headline, cx, H * 0.225, cw, H * 0.135, {
      family: SANS, weight: 800, size: 84 * s, minSize: 40 * s, color: navy, align: "center", valign: "middle", lineHeight: 1.05, maxLines: 2,
    });
    dotted(cx + cw * 0.06, cx + cw * 0.94, H * 0.385, s);
    scene.text(upper([content.dateLine, content.timeLine].filter((l) => l.trim()).join("  ·  ")), cx, H * 0.405, cw, H * 0.06, {
      family: SANS, weight: 700, size: 30 * s, color: navy, align: "center", valign: "middle", maxLines: 1,
    });
    scene.text(upper(speaker ? content.eventTitle : content.subtitle), cx, H * 0.47, cw, H * 0.165, {
      family: SANS, weight: 400, size: 52 * s, minSize: 28 * s, color: highlight, align: "center", valign: "middle", lineHeight: 1.1, maxLines: 2,
    });
    scene.text(upper(content.venueName ? `At ${content.venueName}` : ""), cx, H * 0.645, cw, H * 0.055, {
      family: SANS, weight: 400, size: 27 * s, color: navy, align: "center", valign: "middle", maxLines: 1,
    });
    dotted(cx + cw * 0.06, cx + cw * 0.94, H * 0.735, s);

    scene.add({ kind: "rect", x: 0, y: bodyH, w: W, h: footerH, fill: navy });
    const footerInk = readableOn(navy);
    scene.text(upper(speaker?.role ?? content.organizerName), W * 0.035, bodyH, W * 0.36, footerH, {
      family: SANS, weight: 600, size: 24 * s, minSize: 15 * s, color: footerInk, valign: "middle", lineHeight: 1.25, maxLines: 2,
    });
    const hasSponsor = input.sponsors.length > 0;
    scene.text([upper(content.infoLabel), ...contactLines].join("\n"), cx, bodyH, hasSponsor ? W * 0.3 : cw, footerH, {
      family: SANS, weight: 400, size: 21 * s, minSize: 14 * s, color: footerInk, valign: "middle", lineHeight: 1.35, maxLines: 3,
    });
    if (hasSponsor) {
      scene.text(upper(content.sponsorLabel), W * 0.75, bodyH + footerH * 0.1, W * 0.215, footerH * 0.22, {
        family: SANS, weight: 400, size: 17 * s, color: footerInk, align: "center", valign: "middle", maxLines: 1,
      });
      sponsorTiles(scene, input.sponsors.slice(0, 2), { x: W * 0.75, y: bodyH + footerH * 0.36, w: W * 0.215, h: footerH * 0.46 }, navy, s);
    }
    return scene.done();
  }

  const s = Math.min(W / 1275, H / 1300);
  const headerH = Math.round(H * 0.135);
  const footerH = Math.round(H * (H / W > 1.5 ? 0.12 : 0.148));
  const panelY = headerH;
  const panelH = H - headerH - footerH;
  const at = (fraction: number): number => panelY + panelH * fraction;

  // Header: the organiser's own logo, or their name set as a wordmark.
  scene.add({ kind: "rect", x: 0, y: 0, w: W, h: headerH, fill: "#ffffff" });
  const hasTagline = content.organizerTagline.trim().length > 0;
  if (input.organizerLogoUrl) {
    scene.add({
      kind: "image", role: "organizer-logo", src: input.organizerLogoUrl, fit: "contain",
      x: W * 0.2, y: headerH * 0.16, w: W * 0.6, h: headerH * (hasTagline ? 0.48 : 0.68),
    });
  } else {
    scene.text(upper(content.organizerName || content.eventTitle), W * 0.08, headerH * (hasTagline ? 0.2 : 0.3), W * 0.84, headerH * 0.4, {
      family: SANS, weight: 500, size: 52 * s, minSize: 26 * s, color: navy, align: "center", valign: "middle", letterSpacing: 4 * s, maxLines: 1,
    });
  }
  scene.text(content.organizerTagline, W * 0.1, headerH * 0.63, W * 0.8, headerH * 0.25, {
    family: SERIF, weight: 400, italic: true, size: 26 * s, minSize: 15 * s, color: lighten(navy, 0.22), align: "center", valign: "middle", maxLines: 1,
  });

  // Panel: the portrait fades into the tinted ground on its right edge.
  scene.add({
    kind: "rect", x: 0, y: panelY, w: W, h: panelH,
    fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, lighten(ground, 0.72)], [0.55, ground], [1, darken(ground, 0.04)]] },
  });
  scene.add(portrait({ x: 0, y: panelY, w: W * 0.6, h: panelH }, speaker, input.coverImageUrl, photoFallback));
  scene.add({
    kind: "rect", x: W * 0.34, y: panelY, w: W * 0.262, h: panelH,
    fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, alpha(ground, 0)], [1, ground]] },
  });

  const cx = W * 0.5;
  const cw = W * 0.45;
  const centered = { family: SANS, align: "center" as const, valign: "middle" as const };
  scene.text(content.kicker, cx, at(0.062), cw, 34 * s, { ...centered, weight: 400, size: 23 * s, color: navy, maxLines: 1 });
  scene.text(headline, cx, at(0.095), cw, panelH * 0.09, {
    ...centered, weight: 800, size: 62 * s, minSize: 34 * s, color: navy, lineHeight: 1.04, maxLines: 2,
  });
  dotted(cx + cw * 0.05, cx + cw * 0.95, at(0.203), s);
  scene.text(upper(content.dateLine), cx, at(0.222), cw, 36 * s, { ...centered, weight: 700, size: 25 * s, color: navy, maxLines: 1 });
  scene.text(upper(speaker ? content.eventTitle : content.subtitle), cx, at(0.255), cw, panelH * 0.092, {
    ...centered, weight: 400, size: 43 * s, minSize: 26 * s, color: highlight, lineHeight: 1.1, maxLines: 2,
  });
  scene.text(upper(speaker?.role ?? ""), cx, at(0.362), cw, 34 * s, { ...centered, weight: 700, size: 23 * s, minSize: 15 * s, color: navy, maxLines: 1 });
  scene.text(upper(content.venueName ? `At ${content.venueName}` : ""), cx, at(0.392), cw, 32 * s, {
    ...centered, weight: 400, size: 22 * s, minSize: 15 * s, color: navy, maxLines: 1,
  });
  scene.text(upper(content.timeLine), cx, at(0.424), cw, panelH * 0.062, {
    ...centered, weight: 400, size: 43 * s, minSize: 24 * s, color: highlight, maxLines: 1,
  });
  dotted(cx + cw * 0.05, cx + cw * 0.95, at(0.508), s);

  if (content.infoLabel.trim() || contactLines.length > 0) {
    scene.add({
      kind: "rect", x: W * 0.42, y: at(0.535), w: W * 0.58, h: panelH * 0.148,
      fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, alpha(band, 0)], [0.3, band], [1, band]] },
    });
    scene.text(upper(content.infoLabel), cx, at(0.556), cw, 34 * s, { ...centered, weight: 700, size: 23 * s, minSize: 15 * s, color: navy, maxLines: 1 });
    scene.text(contactLines.join("\n"), cx, at(0.592), cw, panelH * 0.072, {
      ...centered, weight: 400, size: 23 * s, minSize: 15 * s, color: navy, lineHeight: 1.35, maxLines: 2,
    });
  } else {
    scene.skip(3);
  }

  // Footer: organiser on the left, sponsor on the right.
  const footerY = H - footerH;
  const footerInk = readableOn(navy);
  scene.add({ kind: "rect", x: 0, y: footerY, w: W, h: footerH, fill: navy });
  const organizerBlock = [
    upper(content.organizerName),
    content.venueAddress,
    [content.phone, content.website].filter((l) => l.trim()).join("     "),
  ].filter((l) => l.trim());
  scene.text(organizerBlock.join("\n"), W * 0.058, footerY + footerH * 0.14, W * 0.44, footerH * 0.72, {
    family: SANS, weight: 400, size: 21 * s, minSize: 13 * s, color: alpha(footerInk, 0.94), valign: "middle", lineHeight: 1.42, maxLines: 4,
  });
  if (input.sponsors.length > 0) {
    scene.text(upper(content.sponsorLabel), W * 0.555, footerY + footerH * 0.2, W * 0.385, footerH * 0.16, {
      family: SANS, weight: 400, size: 20 * s, color: footerInk, align: "center", valign: "middle", maxLines: 1,
    });
    sponsorTiles(scene, input.sponsors, { x: W * 0.555, y: footerY + footerH * 0.43, w: W * 0.385, h: footerH * 0.3 }, navy, s);
  } else {
    scene.text(upper(content.ctaLabel), W * 0.555, footerY + footerH * 0.2, W * 0.385, footerH * 0.6, {
      family: SANS, weight: 700, size: 34 * s, minSize: 18 * s, color: footerInk, align: "center", valign: "middle", letterSpacing: 2 * s, maxLines: 2,
    });
  }
  return scene.done();
}

// ─── Lineup ──────────────────────────────────────────────────────────────────

const LINEUP_MAX_SPEAKERS = 5;

function buildLineup(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const navy = palette.primary;
  const wide = W / H > 1.4;
  const s = wide ? H / 691 : W / 691;
  const scene = createScene(format, navy);
  const ink = "#ffffff";
  const softShadow = { color: "rgba(0, 0, 0, 0.45)", blur: 5 * s, offsetX: 2 * s, offsetY: 3 * s };
  const serif = { family: SERIF, color: ink, align: "center" as const, valign: "middle" as const };
  const speakers = input.speakers.slice(0, LINEUP_MAX_SPEAKERS);
  const title = splitLineupTitle(content.eventTitle, input.year);
  const topLine = title.top || content.organizerName;

  scene.add({
    kind: "rect", x: 0, y: 0, w: W, h: H,
    fill: { type: "radial", center: [0.92, 0.82], radius: 0.62, stops: [[0, mix(navy, "#1a1aff", 0.55)], [1, alpha(navy, 0)]] },
  });
  const ovalFill: Fill = {
    type: "linear", from: [0, 0], to: [0, 1],
    stops: [[0.05, palette.ground], [0.55, mix(palette.ground, "#0b7a70", 0.6)], [1, mix(darken(palette.ground, 0.5), "#00695c", 0.7)]],
  };
  const scriptFill: Fill = {
    type: "linear", from: [0, 0], to: [1, 1],
    stops: [[0.1, mix(palette.accent, "#ffb300", 0.75)], [0.5, palette.accent], [0.95, mix(palette.accent, "#e60000", 0.7)]],
  };
  const silver: Fill = { type: "linear", from: [0, 0], to: [0, 1], stops: [[0, "#fbfbfb"], [0.55, "#a3a8ae"], [1, "#eeeeee"]] };
  const contact = [content.phone.trim() ? `CALL: ${content.phone.trim()}` : "", content.website.trim()].filter(Boolean).join("  |  ");
  const when = [content.dateLine, content.timeLine].filter((l) => l.trim()).join("\n");

  /** A row of ringed portraits with the name under each. */
  const speakerRow = (left: number, width: number, centerY: number, maxDiameter: number): void => {
    if (speakers.length === 0) return;
    const gap = 10 * s;
    const d = Math.min(maxDiameter, (width - gap * (speakers.length - 1)) / speakers.length);
    const total = speakers.length * d + (speakers.length - 1) * gap;
    speakers.forEach((speaker, i) => {
      const x = left + (width - total) / 2 + i * (d + gap);
      scene.add({ kind: "ellipse", cx: x + d / 2, cy: centerY, rx: d / 2, ry: d / 2, fill: "#ffe3c2" });
      const ring = Math.max(2, 3 * s);
      scene.add(
        portrait(
          { x: x + ring, y: centerY - d / 2 + ring, w: d - ring * 2, h: d - ring * 2 },
          speaker,
          null,
          { background: mix(navy, palette.ground, 0.45), color: "#ffffff", family: SERIF, label: speaker.name },
          { circle: true },
        ),
      );
      scene.text(upper(speaker.name), x - gap / 2 + 2, centerY + d / 2 + 6 * s, d + gap - 4, 46 * s, {
        family: SERIF, weight: 400, size: 17 * s, minSize: 10 * s, color: ink, align: "center", lineHeight: 1.2, maxLines: 2, role: "speaker-name",
      });
    });
  };

  if (wide) {
    scene.add({ kind: "ellipse", cx: W * 0.25, cy: H * 0.4, rx: W * 0.33, ry: H * 0.62, fill: ovalFill });
    const lx = W * 0.02;
    const lw = W * 0.47;
    scene.text(upper(topLine), lx, H * 0.07, lw, H * 0.13, { ...serif, weight: 900, size: 40 * s, minSize: 20 * s, shadow: softShadow, maxLines: 1 });
    scene.text(title.script, lx, H * 0.14, lw, H * 0.3, {
      family: SCRIPT, weight: 400, size: 150 * s, minSize: 60 * s, color: scriptFill, align: "center", valign: "middle", shadow: softShadow, maxLines: 1,
    });
    scene.text(title.year, lx, H * 0.44, lw, H * 0.11, { ...serif, weight: 900, size: 44 * s, shadow: softShadow, maxLines: 1 });
    scene.text(upper(content.subtitle), lx + lw * 0.04, H * 0.57, lw * 0.92, H * 0.18, {
      ...serif, weight: 700, size: 27 * s, minSize: 15 * s, lineHeight: 1.25, maxLines: 2,
    });

    const rx = W * 0.53;
    const rw = W * 0.44;
    if (speakers.length > 0) {
      scene.text(upper(content.speakersLabel), rx, H * 0.05, rw, H * 0.07, { ...serif, weight: 400, size: 21 * s, maxLines: 1 });
      speakerRow(rx, rw, H * 0.3, H * 0.3);
    } else {
      scene.text(content.description, rx, H * 0.08, rw, H * 0.44, { ...serif, weight: 400, size: 22 * s, minSize: 14 * s, lineHeight: 1.5, maxLines: 6 });
    }
    scene.add({ kind: "line", x1: rx + rw / 2, y1: H * 0.61, x2: rx + rw / 2, y2: H * 0.83, color: ink, width: 2 * s });
    scene.text(upper(when), rx, H * 0.6, rw / 2 - 16 * s, H * 0.24, {
      family: SERIF, weight: 400, size: 21 * s, minSize: 12 * s, color: ink, align: "right", valign: "middle", lineHeight: 1.5, letterSpacing: s, maxLines: 4,
    });
    const pin = 40 * s;
    scene.add({ kind: "icon", name: "pin", x: rx + rw * 0.75 - pin / 2, y: H * 0.615, size: pin, color: palette.accent });
    scene.text(upper(content.venueName), rx + rw / 2 + 14 * s, H * 0.615 + pin + 4 * s, rw / 2 - 14 * s, H * 0.14, {
      family: SERIF, weight: 400, size: 20 * s, minSize: 12 * s, color: ink, align: "center", lineHeight: 1.3, maxLines: 2,
    });
    scene.add({ kind: "rect", x: W * 0.04, y: H * 0.875, w: W * 0.92, h: H * 0.09, fill: silver });
    scene.text(contact || upper(content.ctaLabel), W * 0.06, H * 0.875, W * 0.88, H * 0.09, {
      family: SERIF, weight: 900, size: 22 * s, minSize: 13 * s, color: "#0b0b1a", align: "center", valign: "middle", maxLines: 1,
    });
    return scene.done();
  }

  scene.add({ kind: "ellipse", cx: W / 2, cy: H * 0.31, rx: W * 0.56, ry: H * 0.34, fill: ovalFill });
  scene.text(upper(topLine), W * 0.06, H * 0.028, W * 0.88, H * 0.075, { ...serif, weight: 900, size: 46 * s, minSize: 22 * s, shadow: softShadow, maxLines: 1 });
  scene.text(title.script, W * 0.05, H * 0.092, W * 0.9, H * 0.175, {
    family: SCRIPT, weight: 400, size: 138 * s, minSize: 60 * s, color: scriptFill, align: "center", valign: "middle", shadow: softShadow, maxLines: 1,
  });
  scene.text(title.year, W * 0.2, H * 0.252, W * 0.6, H * 0.07, { ...serif, weight: 900, size: 46 * s, shadow: softShadow, maxLines: 1 });
  scene.text(upper(content.subtitle), W * 0.1, H * 0.33, W * 0.8, H * 0.08, {
    ...serif, weight: 700, size: 32 * s, minSize: 17 * s, lineHeight: 1.2, maxLines: 2,
  });
  if (speakers.length > 0) {
    scene.text(upper(content.speakersLabel), W * 0.1, H * 0.433, W * 0.8, H * 0.05, { ...serif, weight: 400, size: 21 * s, maxLines: 1 });
    speakerRow(W * 0.055, W * 0.89, H * 0.578, Math.min(W * 0.2, H * 0.2));
  } else {
    scene.text(content.description, W * 0.12, H * 0.46, W * 0.76, H * 0.22, { ...serif, weight: 400, size: 21 * s, minSize: 14 * s, lineHeight: 1.5, maxLines: 5 });
  }

  scene.add({ kind: "line", x1: W / 2, y1: H * 0.735, x2: W / 2, y2: H * 0.912, color: ink, width: 2 * s });
  scene.text(upper(when), W * 0.07, H * 0.735, W * 0.405, H * 0.177, {
    family: SERIF, weight: 400, size: 24 * s, minSize: 13 * s, color: ink, align: "right", valign: "middle", lineHeight: 1.55, letterSpacing: s, maxLines: 4,
  });
  const pin = 46 * s;
  scene.add({ kind: "icon", name: "pin", x: W * 0.745 - pin / 2, y: H * 0.752, size: pin, color: palette.accent });
  scene.text(upper(content.venueName), W * 0.54, H * 0.752 + pin + 6 * s, W * 0.41, H * 0.09, {
    family: SERIF, weight: 400, size: 24 * s, minSize: 13 * s, color: ink, align: "center", lineHeight: 1.3, maxLines: 2,
  });
  scene.add({ kind: "rect", x: W * 0.065, y: H * 0.93, w: W * 0.9, h: H * 0.058, fill: silver });
  scene.text(contact || upper(content.ctaLabel), W * 0.085, H * 0.93, W * 0.86, H * 0.058, {
    family: SERIF, weight: 900, size: 21 * s, minSize: 12 * s, color: "#0b0b1a", align: "center", valign: "middle", maxLines: 1,
  });
  return scene.done();
}

// ─── Webinar ─────────────────────────────────────────────────────────────────

function buildWebinar(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const ink = palette.primary;
  const accent = palette.accent;
  const paper = palette.ground;
  const onInk = readableOn(ink);
  const onAccent = readableOn(accent, ink, "#ffffff");
  const wide = W / H > 1.4;
  const s = wide ? H / 900 : Math.min(W / 1280, H / 1600);
  const speaker = input.speakers[0];
  const scene = createScene(format, paper);
  const body = { family: BODY, color: ink };
  const titleLength = content.eventTitle.trim().length;
  const headline = upper(balanceWords(content.eventTitle, titleLength > 26 ? 3 : 2).join("\n"));
  const plateName = speaker?.name || content.organizerName;
  const plateRole = speaker ? speaker.role : content.organizerTagline;

  const livePill = (x: number, y: number): void => {
    const h = 64 * s;
    const w = 150 * s;
    scene.add({ kind: "rect", x, y, w, h, fill: ink, radius: h / 2 });
    const icon = 36 * s;
    scene.add({ kind: "icon", name: "play-circle", x: x + 14 * s, y: y + (h - icon) / 2, size: icon, color: accent, color2: onInk });
    scene.text(upper(content.badge), x + 58 * s, y, w - 70 * s, h, { family: BODY, weight: 700, size: 27 * s, minSize: 14 * s, color: onInk, valign: "middle", maxLines: 1 });
    scene.text(upper(content.formatLabel), x + w + 22 * s, y, W * 0.4, h, { ...body, weight: 500, size: 27 * s, minSize: 16 * s, valign: "middle", maxLines: 1 });
  };

  /** The arched portrait frame with the name plate across its foot. */
  const speakerPanel = (arch: { x: number; y: number; w: number; h: number }, plate: { x: number; y: number; w: number; h: number }): void => {
    const curve = Math.min(arch.w * 0.42, arch.h * 0.5);
    scene.add({ kind: "rect", ...arch, fill: accent, radius: [0, curve, 0, 0] });
    const inset = arch.w * 0.06;
    scene.add(
      portrait(
        { x: arch.x + inset, y: arch.y + inset, w: arch.w - inset, h: arch.h - inset },
        speaker,
        input.coverImageUrl,
        { background: alpha(darken(accent, 0.25), 0.55), color: "#ffffff", family: BODY, label: content.eventTitle },
        { radius: [0, Math.max(0, curve - inset), 0, 0] },
      ),
    );
    scene.add({ kind: "rect", ...plate, fill: ink, radius: [0, 0, 0, Math.min(64 * s, plate.h * 0.45)] });
    const pad = plate.w * 0.07;
    const hasRole = plateRole.trim().length > 0;
    scene.text(plateName, plate.x + pad, plate.y + plate.h * (hasRole ? 0.12 : 0.2), plate.w - pad * 2, plate.h * (hasRole ? 0.5 : 0.6), {
      family: BODY, weight: 600, size: 54 * s, minSize: 24 * s, color: onInk, align: "center", valign: "middle", maxLines: 1, role: "speaker-name",
    });
    scene.text(plateRole, plate.x + pad, plate.y + plate.h * 0.6, plate.w - pad * 2, plate.h * 0.28, {
      family: BODY, weight: 400, size: 24 * s, minSize: 13 * s, color: onInk, align: "center", valign: "middle", maxLines: 1,
    });
  };

  if (wide) {
    scene.add({ kind: "dots", x: W * 0.885, y: H * 0.07, cols: 6, rows: 3, gap: 22 * s, r: 2.6 * s, color: ink });
    livePill(W * 0.05, H * 0.075);
    scene.text(headline, W * 0.05, H * 0.19, W * 0.5, H * 0.35, {
      family: DISPLAY, weight: 400, size: 170 * s, minSize: 50 * s, color: ink, lineHeight: 1.04, valign: "middle", maxLines: 3,
    });
    if (content.subtitle.trim()) {
      scene.add({ kind: "rect", x: W * 0.05, y: H * 0.565, w: W * 0.46, h: H * 0.09, fill: accent });
      scene.text(content.subtitle, W * 0.065, H * 0.565, W * 0.43, H * 0.09, {
        family: BODY, weight: 700, italic: true, size: 40 * s, minSize: 18 * s, color: onAccent, align: "center", valign: "middle", maxLines: 1,
      });
    } else {
      scene.skip(2);
    }
    scene.text([content.dateLine, content.timeLine].filter((l) => l.trim()).join("  ·  "), W * 0.05, H * 0.685, W * 0.5, H * 0.09, {
      ...body, weight: 700, size: 40 * s, minSize: 20 * s, valign: "middle", maxLines: 1,
    });
    const ctaW = W * 0.21;
    const ctaH = H * 0.11;
    scene.add({ kind: "rect", x: W * 0.05, y: H * 0.815, w: ctaW, h: ctaH, fill: ink, radius: ctaH / 2 });
    scene.text(upper(content.ctaLabel), W * 0.05 + ctaW * 0.08, H * 0.815, ctaW * 0.84, ctaH, {
      family: BODY, weight: 700, size: 30 * s, minSize: 14 * s, color: onInk, align: "center", valign: "middle", maxLines: 1,
    });
    scene.text([content.venueName, content.website].filter((l) => l.trim()).join("\n"), W * 0.05 + ctaW + W * 0.02, H * 0.815, W * 0.26, ctaH, {
      ...body, weight: 500, size: 23 * s, minSize: 13 * s, valign: "middle", lineHeight: 1.3, maxLines: 2,
    });
    speakerPanel({ x: W * 0.61, y: H * 0.1, w: W * 0.3, h: H * 0.6 }, { x: W * 0.56, y: H * 0.7, w: W * 0.35, h: H * 0.2 });
    return scene.done();
  }

  scene.add({ kind: "dots", x: W * 0.808, y: H * 0.048, cols: 8, rows: 4, gap: 29 * s, r: 2.7 * s, color: ink });
  livePill(W * 0.382, H * 0.098);
  scene.text(headline, W * 0.1, H * 0.158, W * 0.425, H * 0.212, {
    family: DISPLAY, weight: 400, size: 205 * s, minSize: 54 * s, color: ink, lineHeight: 1.02, valign: "bottom", maxLines: 3,
  });
  if (content.subtitle.trim()) {
    scene.add({ kind: "rect", x: W * 0.1, y: H * 0.38, w: W * 0.41, h: H * 0.043, fill: accent });
    scene.text(content.subtitle, W * 0.115, H * 0.38, W * 0.38, H * 0.043, {
      family: BODY, weight: 700, italic: true, size: 40 * s, minSize: 18 * s, color: onAccent, align: "center", valign: "middle", maxLines: 1,
    });
  } else {
    scene.skip(2);
  }

  const bullets = bulletLines(content.bullets, 4);
  const bulletStep = H * 0.0238;
  bullets.forEach((line, i) => {
    const centerY = H * 0.464 + i * bulletStep;
    const icon = 22 * s;
    scene.add({ kind: "icon", name: "check-circle", x: W * 0.126, y: centerY - icon / 2, size: icon, color: ink });
    scene.text(line, W * 0.151, centerY - bulletStep / 2, W * 0.36, bulletStep, {
      ...body, weight: 400, size: 24 * s, minSize: 15 * s, valign: "middle", maxLines: 1, role: "bullet",
    });
  });
  scene.skip((4 - bullets.length) * 2);

  scene.text(content.dateLine, W * 0.126, H * 0.572, W * 0.34, H * 0.125, {
    ...body, weight: 700, size: 66 * s, minSize: 34 * s, lineHeight: 1.04, valign: "top", maxLines: 3,
  });
  scene.text(content.description, W * 0.126, H * 0.728, W * 0.37, H * 0.075, {
    ...body, weight: 400, size: 25 * s, minSize: 17 * s, lineHeight: 1.4, valign: "middle", maxLines: 3,
  });
  const ctaW = W * 0.275;
  const ctaH = Math.min(H * 0.057, 96 * s);
  scene.add({ kind: "rect", x: W * 0.126, y: H * 0.825, w: ctaW, h: ctaH, fill: ink, radius: ctaH / 2 });
  scene.text(upper(content.ctaLabel), W * 0.126 + ctaW * 0.08, H * 0.825, ctaW * 0.84, ctaH, {
    family: BODY, weight: 700, size: 29 * s, minSize: 14 * s, color: onInk, align: "center", valign: "middle", maxLines: 1,
  });
  [0, 1, 2].forEach((i) =>
    scene.add({ kind: "icon", name: "chevron-up", x: W * 0.048, y: H - (166 - i * 46) * s, size: 54 * s, color: ink }),
  );

  speakerPanel({ x: W * 0.548, y: H * 0.165, w: W * 0.361, h: H * 0.423 }, { x: W * 0.48, y: H * 0.588, w: W * 0.429, h: H * 0.104 });

  if (content.website.trim()) {
    const card = { x: W * 0.548, y: H * 0.716, w: W * 0.353, h: Math.min(H * 0.075, 124 * s) };
    scene.add({ kind: "rect", ...card, stroke: ink, strokeWidth: 2 * s, radius: 14 * s });
    const icon = 58 * s;
    scene.add({ kind: "icon", name: "link", x: card.x + 52 * s, y: card.y + (card.h - icon) / 2, size: icon, color: ink });
    const textX = card.x + 52 * s + icon + 26 * s;
    const textW = card.x + card.w - textX - 16 * s;
    scene.text(content.linkLabel, textX, card.y + card.h * 0.16, textW, card.h * 0.38, { ...body, weight: 700, size: 26 * s, minSize: 13 * s, valign: "middle", maxLines: 1 });
    scene.text(content.website, textX, card.y + card.h * 0.52, textW, card.h * 0.32, { ...body, weight: 400, size: 19 * s, minSize: 11 * s, valign: "middle", maxLines: 1 });
  } else {
    scene.skip(4);
  }
  scene.text(content.venueName, W * 0.548, H * 0.805, W * 0.39, H * 0.036, { ...body, weight: 700, size: 40 * s, minSize: 22 * s, valign: "middle", maxLines: 1 });
  scene.text(content.venueAddress, W * 0.548, H * 0.843, W * 0.39, H * 0.048, {
    ...body, weight: 400, size: 28 * s, minSize: 17 * s, lineHeight: 1.25, valign: "top", maxLines: 2,
  });
  scene.text(content.phone, W * 0.548, H * 0.893, W * 0.39, H * 0.03, { ...body, weight: 500, size: 28 * s, minSize: 17 * s, valign: "middle", maxLines: 1 });
  return scene.done();
}

// ─── Shared pieces for the poster designs below ──────────────────────────────

const CONDENSED = "Bebas Neue";
const HAND = "Dancing Script";
const TALL_FORMATS = ["instagram-portrait", "instagram-post", "instagram-story"];

type SceneBuilder = ReturnType<typeof createScene>;

/** The organiser's logo, or their name set in its place. */
function organizerMark(
  scene: SceneBuilder,
  input: BuildInput,
  box: { x: number; y: number; w: number; h: number },
  style: { color: string; size: number; align: "left" | "center" | "right"; family?: string; weight?: number },
): void {
  if (input.organizerLogoUrl) {
    scene.add({ kind: "image", role: "organizer-logo", src: input.organizerLogoUrl, fit: "contain", ...box });
    scene.skip();
    return;
  }
  scene.skip();
  scene.text(input.content.organizerName, box.x, box.y, box.w, box.h, {
    family: style.family ?? SANS, weight: style.weight ?? 700, size: style.size, minSize: style.size * 0.45,
    color: style.color, align: style.align, valign: "middle", lineHeight: 1.1, maxLines: 2,
  });
}

/** An icon with a line of text beside it, vertically centred on the icon. */
function iconLine(
  scene: SceneBuilder,
  icon: "pin" | "calendar" | "clock",
  value: string,
  x: number,
  y: number,
  w: number,
  size: number,
  style: { family: string; weight: number; color: string; iconColor?: string },
): void {
  if (!value.trim()) {
    scene.skip(2);
    return;
  }
  const iconSize = size * 1.25;
  scene.add({ kind: "icon", name: icon, x, y: y + (size * 1.5 - iconSize) / 2, size: iconSize, color: style.iconColor ?? style.color });
  scene.text(value, x + iconSize + size * 0.5, y, w - iconSize - size * 0.5, size * 1.5, {
    family: style.family, weight: style.weight, size, minSize: size * 0.6, color: style.color, valign: "middle", maxLines: 1,
  });
}

// ─── Speaker Card ────────────────────────────────────────────────────────────

function buildSpeakerCard(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W / 1080, H / 1350);
  const brand = palette.primary;
  const onBrand = readableOn(brand);
  const speaker = input.speakers[0];
  const scene = createScene(format, palette.ground);
  const photoH = Math.round(H * 0.69);
  const bandH = H - photoH;

  scene.add(
    portrait({ x: 0, y: 0, w: W, h: photoH }, speaker, input.coverImageUrl, {
      background: mix(palette.ground, "#000000", 0.35), color: "#ffffff", family: SANS, label: content.eventTitle,
    }, { grayscale: true }),
  );
  // Runs up the left edge, reading bottom to top.
  const sideH = W * 0.15;
  const sideW = photoH * 0.82;
  scene.text(upper(content.sideLabel), W * 0.115 - sideW / 2, photoH * 0.55 - sideH / 2, sideW, sideH, {
    family: SANS, weight: 800, size: W * 0.125, minSize: W * 0.06, color: brand, valign: "middle", letterSpacing: 2 * s, maxLines: 1, rotation: -90,
  });
  scene.add({ kind: "rect", x: W * 0.65, y: H * 0.07, w: W * 0.25, h: H * 0.06, fill: brand });
  organizerMark(scene, input, { x: W * 0.665, y: H * 0.078, w: W * 0.22, h: H * 0.044 }, { color: onBrand, size: 32 * s, align: "center", weight: 500 });

  scene.add({ kind: "rect", x: 0, y: photoH, w: W, h: bandH, fill: brand });
  const lx = W * 0.065;
  const lw = W * 0.4;
  scene.text(speaker?.name || content.eventTitle, lx, photoH + bandH * 0.1, lw, bandH * 0.34, {
    family: SANS, weight: 600, size: 76 * s, minSize: 36 * s, color: onBrand, valign: "middle", lineHeight: 1.08, maxLines: 2, role: "speaker-name",
  });
  const role = speaker?.role ?? content.subtitle;
  if (role.trim()) scene.add({ kind: "rect", x: lx, y: photoH + bandH * 0.48, w: lw, h: bandH * 0.15, fill: palette.accent });
  else scene.skip();
  scene.text(role, lx + lw * 0.05, photoH + bandH * 0.48, lw * 0.9, bandH * 0.15, {
    family: SANS, weight: 500, size: 34 * s, minSize: 17 * s, color: readableOn(palette.accent, brand, "#ffffff"), align: "center", valign: "middle", maxLines: 1,
  });
  scene.text(content.infoLabel, lx, photoH + bandH * 0.7, lw, bandH * 0.07, { family: SANS, weight: 400, size: 20 * s, color: onBrand, valign: "middle", maxLines: 1 });
  scene.text([content.phone, content.website].filter((l) => l.trim()).join("\n"), lx, photoH + bandH * 0.77, lw, bandH * 0.16, {
    family: SANS, weight: 700, size: 23 * s, minSize: 14 * s, color: onBrand, lineHeight: 1.3, maxLines: 2,
  });

  const rx = W * 0.525;
  const rw = W * 0.41;
  scene.text(speaker?.bio?.trim() || content.description, rx, photoH + bandH * 0.1, rw, bandH * 0.52, {
    family: SANS, weight: 400, size: 27 * s, minSize: 16 * s, color: onBrand, lineHeight: 1.38, maxLines: 7,
  });
  scene.add({ kind: "rect", x: rx, y: photoH + bandH * 0.68, w: rw * 0.92, h: bandH * 0.2, stroke: onBrand, strokeWidth: 2 * s });
  scene.text(content.ctaLabel, rx, photoH + bandH * 0.68, rw * 0.92, bandH * 0.2, {
    family: SANS, weight: 800, size: 40 * s, minSize: 18 * s, color: onBrand, align: "center", valign: "middle", maxLines: 1,
  });
  return scene.done();
}

// ─── Session ─────────────────────────────────────────────────────────────────

function buildSession(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W, H) / 1080;
  const brand = palette.primary;
  const onBrand = readableOn(brand);
  const ink = readableOn(palette.ground, "#1f1f1f", "#ffffff");
  const speaker = input.speakers[0];
  const scene = createScene(format, palette.ground);

  const bandY = H * 0.27;
  const bandH = H * 0.46;
  scene.add({ kind: "rect", x: 0, y: bandY, w: W * 0.05, h: bandH, fill: brand });
  scene.add({
    kind: "rect", x: W * 0.26, y: bandY, w: W * 0.74, h: bandH, radius: [bandH * 0.55, 0, 0, 0],
    fill: { type: "linear", from: [0, 0], to: [1, 1], stops: [[0, lighten(brand, 0.08)], [1, darken(brand, 0.22)]] },
  });
  // A faint ring, standing in for the crest watermark on the reference.
  scene.add({ kind: "ellipse", cx: W * 0.86, cy: bandY + bandH * 0.55, rx: W * 0.2, ry: W * 0.2, stroke: alpha(onBrand, 0.12), strokeWidth: 26 * s });

  const frame = { x: W * 0.075, y: H * 0.2, w: W * 0.36, h: H * 0.56 };
  scene.add({ kind: "rect", ...frame, fill: "#ffffff", radius: W * 0.065, shadow: { color: "rgba(0,0,0,0.22)", blur: 30 * s, offsetX: 0, offsetY: 10 * s } });
  const inset = 12 * s;
  scene.add(
    portrait({ x: frame.x + inset, y: frame.y + inset, w: frame.w - inset * 2, h: frame.h - inset * 2 }, speaker, input.coverImageUrl, {
      background: mix(brand, "#ffffff", 0.6), color: "#ffffff", family: SANS, label: content.eventTitle,
    }, { radius: W * 0.065 - inset }),
  );
  organizerMark(scene, input, { x: W * 0.6, y: H * 0.055, w: W * 0.34, h: H * 0.1 }, { color: ink, size: 34 * s, align: "right", weight: 700 });

  const tx = W * 0.475;
  const tw = W * 0.49;
  scene.text(content.scriptLine, tx, bandY + bandH * 0.1, tw, bandH * 0.36, {
    family: HAND, weight: 700, size: 150 * s, minSize: 60 * s, color: onBrand, valign: "middle", maxLines: 1,
    shadow: { color: "rgba(0,0,0,0.25)", blur: 6 * s, offsetX: 2 * s, offsetY: 3 * s },
  });
  scene.text(speaker ? "WITH" : "", tx + 6 * s, bandY + bandH * 0.47, tw, bandH * 0.07, { family: SANS, weight: 700, size: 26 * s, color: "#ffd84d", valign: "middle", letterSpacing: 2 * s, maxLines: 1 });
  scene.text(upper(speaker?.name || content.eventTitle), tx, bandY + bandH * 0.53, tw, bandH * 0.17, {
    family: SANS, weight: 800, size: 78 * s, minSize: 34 * s, color: onBrand, valign: "middle", lineHeight: 1.02, maxLines: 2, role: "speaker-name",
  });
  scene.text(upper(speaker ? speaker.role || content.eventTitle : content.subtitle), tx, bandY + bandH * 0.71, tw, bandH * 0.19, {
    family: SANS, weight: 600, size: 34 * s, minSize: 18 * s, color: onBrand, lineHeight: 1.12, maxLines: 2,
  });

  const pillW = W * 0.22;
  const pillH = 52 * s;
  scene.add({ kind: "rect", x: (W - pillW) / 2, y: H * 0.8, w: pillW, h: pillH, fill: brand, radius: pillH / 2 });
  scene.text("Date", (W - pillW) / 2, H * 0.8, pillW, pillH, { family: SANS, weight: 700, size: 30 * s, color: onBrand, align: "center", valign: "middle", letterSpacing: 3 * s, maxLines: 1 });
  const lineW = W * 0.5;
  const lineStyle = { family: SANS, weight: 600, color: ink, iconColor: brand };
  iconLine(scene, "calendar", content.dateLine, (W - lineW) / 2 + lineW * 0.12, H * 0.8 + pillH + 16 * s, lineW, 28 * s, lineStyle);
  iconLine(scene, "pin", [content.timeLine, content.venueName].filter((l) => l.trim()).join(" @ "), (W - lineW) / 2 + lineW * 0.12, H * 0.8 + pillH + 66 * s, lineW, 28 * s, lineStyle);
  return scene.done();
}

// ─── Training ────────────────────────────────────────────────────────────────

const GRID_MAX_SPEAKERS = 6;

function buildTraining(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W, H) / 1080;
  const ink = palette.primary;
  const pop = "#e2412b";
  const speakers = input.speakers.slice(0, GRID_MAX_SPEAKERS);
  const scene = createScene(format, palette.ground);
  const centre = { align: "center" as const, valign: "middle" as const };

  scene.add({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: { type: "radial", center: [0.5, 0.45], radius: 0.7, stops: [[0, "#ffffff"], [1, alpha("#ffffff", 0)]] } });
  scene.add({ kind: "dots", x: W * 0.06, y: H * 0.86, cols: 4, rows: 4, gap: 16 * s, r: 2.4 * s, color: alpha(ink, 0.45) });
  scene.add({ kind: "dots", x: W * 0.89, y: H * 0.86, cols: 4, rows: 4, gap: 16 * s, r: 2.4 * s, color: alpha(ink, 0.45) });
  organizerMark(scene, input, { x: W * 0.7, y: H * 0.04, w: W * 0.24, h: H * 0.055 }, { color: ink, size: 28 * s, align: "right", weight: 800 });

  scene.text(upper(content.subtitle), W * 0.1, H * 0.105, W * 0.8, H * 0.03, { family: SANS, weight: 600, size: 22 * s, color: pop, ...centre, letterSpacing: 2 * s, maxLines: 1 });
  scene.text(upper(content.eventTitle), W * 0.07, H * 0.135, W * 0.86, H * 0.11, { family: CONDENSED, weight: 400, size: 132 * s, minSize: 50 * s, color: ink, ...centre, maxLines: 1 });
  scene.text(upper([content.dateLine, content.timeLine].filter((l) => l.trim()).join("  ·  ")), W * 0.1, H * 0.247, W * 0.8, H * 0.03, {
    family: SANS, weight: 600, size: 22 * s, color: pop, ...centre, letterSpacing: 2 * s, maxLines: 1,
  });
  scene.text(content.description, W * 0.14, H * 0.283, W * 0.72, H * 0.055, { family: SANS, weight: 400, size: 19 * s, minSize: 13 * s, color: alpha(ink, 0.8), ...centre, lineHeight: 1.35, maxLines: 2 });

  // A fan of portrait cards, tallest in the middle.
  const n = speakers.length;
  if (n > 0) {
    const gap = 10 * s;
    const cardW = Math.min(W * 0.2, (W * 0.88 - gap * (n - 1)) / n);
    const total = n * cardW + (n - 1) * gap;
    const mid = (n - 1) / 2;
    const centerY = H * 0.535;
    speakers.forEach((speaker, i) => {
      const spread = mid === 0 ? 0 : Math.abs(i - mid) / mid;
      const cardH = Math.min(cardW * 1.9, H * 0.36) * (1 - 0.24 * spread);
      const x = (W - total) / 2 + i * (cardW + gap);
      const y = centerY - cardH / 2;
      const bezel = cardW * 0.045;
      scene.add({ kind: "rect", x, y, w: cardW, h: cardH, fill: "#111111", radius: cardW * 0.11, shadow: { color: "rgba(0,0,0,0.3)", blur: 18 * s, offsetX: 0, offsetY: 8 * s } });
      scene.add({ kind: "rect", x: x + bezel, y: y + bezel, w: cardW - bezel * 2, h: cardH - bezel * 2, fill: palette.accent, radius: cardW * 0.08 });
      const top = cardH * 0.16;
      scene.add(
        portrait({ x: x + bezel, y: y + bezel + top, w: cardW - bezel * 2, h: cardH - bezel * 2 - top }, speaker, null, {
          background: mix(palette.accent, "#000000", 0.3), color: "#ffffff", family: SANS, label: speaker.name,
        }, { grayscale: true, radius: [0, 0, cardW * 0.08, cardW * 0.08] }),
      );
    });
  }
  scene.text(content.scriptLine, W * 0.1, H * 0.635, W * 0.8, H * 0.13, {
    family: HAND, weight: 700, size: 130 * s, minSize: 50 * s, color: pop, ...centre, maxLines: 1, rotation: -4,
  });
  scene.text(upper(content.formatLabel), W * 0.08, H * 0.765, W * 0.84, H * 0.045, { family: SANS, weight: 400, size: 38 * s, minSize: 18 * s, color: ink, ...centre, letterSpacing: 9 * s, maxLines: 1 });
  scene.text(upper(content.venueName), W * 0.1, H * 0.812, W * 0.8, H * 0.03, { family: SANS, weight: 600, size: 21 * s, color: pop, ...centre, letterSpacing: 2 * s, maxLines: 1 });
  const ctaW = W * 0.27;
  const ctaH = 50 * s;
  scene.add({ kind: "rect", x: (W - ctaW) / 2, y: H * 0.86, w: ctaW, h: ctaH, fill: mix(ink, "#ffffff", 0.35), radius: 8 * s });
  scene.text(upper(content.ctaLabel), (W - ctaW) / 2, H * 0.86, ctaW, ctaH, { family: SANS, weight: 700, size: 22 * s, minSize: 12 * s, color: "#ffffff", ...centre, maxLines: 1 });
  scene.text(content.website, W * 0.1, H * 0.925, W * 0.8, H * 0.035, { family: SANS, weight: 700, size: 21 * s, minSize: 13 * s, color: pop, ...centre, letterSpacing: 4 * s, maxLines: 1 });
  return scene.done();
}

// ─── Workshop ────────────────────────────────────────────────────────────────

function buildWorkshop(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W, H) / 1080;
  const ink = palette.primary;
  const pop = "#d8432f";
  const speakers = input.speakers.slice(0, GRID_MAX_SPEAKERS);
  const scene = createScene(format, palette.ground);
  const centre = { align: "center" as const, valign: "middle" as const };

  scene.add({ kind: "dots", x: W * 0.06, y: H * 0.88, cols: 4, rows: 4, gap: 15 * s, r: 2.3 * s, color: alpha(ink, 0.4) });
  scene.add({ kind: "dots", x: W * 0.9, y: H * 0.88, cols: 4, rows: 4, gap: 15 * s, r: 2.3 * s, color: alpha(ink, 0.4) });
  organizerMark(scene, input, { x: W * 0.06, y: H * 0.04, w: W * 0.26, h: H * 0.055 }, { color: ink, size: 28 * s, align: "left", weight: 800 });
  scene.text(content.subtitle, W * 0.1, H * 0.105, W * 0.8, H * 0.03, { family: SANS, weight: 500, size: 22 * s, color: pop, ...centre, maxLines: 1 });
  scene.text(upper(content.eventTitle), W * 0.07, H * 0.135, W * 0.86, H * 0.11, { family: CONDENSED, weight: 400, size: 136 * s, minSize: 50 * s, color: ink, ...centre, maxLines: 1 });
  scene.text(content.formatLabel, W * 0.1, H * 0.245, W * 0.8, H * 0.03, { family: SANS, weight: 500, size: 22 * s, color: pop, ...centre, maxLines: 1 });

  const panel = { x: W * 0.1, y: H * 0.295, w: W * 0.8, h: H * 0.475 };
  scene.add({ kind: "rect", ...panel, fill: mix(ink, "#ffffff", 0.3), radius: W * 0.1, shadow: { color: "rgba(0,0,0,0.25)", blur: 24 * s, offsetX: 0, offsetY: 8 * s } });
  const n = speakers.length;
  if (n > 0) {
    const cols = n <= 3 ? n : n === 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const cellW = (panel.w * 0.9) / cols;
    const cellH = (panel.h * 0.92) / rows;
    const d = Math.min(cellW * 0.74, cellH * 0.66);
    speakers.forEach((speaker, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const cx = panel.x + panel.w / 2 + (i - row * cols - (inRow - 1) / 2) * cellW;
      const top = panel.y + panel.h * 0.04 + row * cellH + (cellH - d - 56 * s) / 2;
      scene.add({ kind: "ellipse", cx: cx + d * 0.03, cy: top + d / 2 - d * 0.02, rx: d / 2, ry: d / 2, stroke: palette.accent, strokeWidth: 3 * s });
      scene.add(
        portrait({ x: cx - d / 2, y: top, w: d, h: d }, speaker, null, {
          background: mix(ink, "#ffffff", 0.12), color: "#ffffff", family: SANS, label: speaker.name,
        }, { circle: true, grayscale: true }),
      );
      scene.text(upper(speaker.name), cx - cellW * 0.47, top + d + 6 * s, cellW * 0.94, 28 * s, {
        family: SANS, weight: 700, size: 21 * s, minSize: 12 * s, color: "#ffffff", ...centre, maxLines: 1, role: "speaker-name",
      });
      scene.text(speaker.role, cx - cellW * 0.47, top + d + 34 * s, cellW * 0.94, 22 * s, {
        family: SANS, weight: 500, size: 15 * s, minSize: 10 * s, color: palette.accent, ...centre, maxLines: 1,
      });
    });
  } else {
    scene.text(content.description, panel.x + panel.w * 0.1, panel.y, panel.w * 0.8, panel.h, { family: SANS, weight: 400, size: 30 * s, minSize: 16 * s, color: "#ffffff", ...centre, lineHeight: 1.45, maxLines: 7 });
  }

  scene.text([content.timeLine, content.dateLine, content.venueName].filter((l) => l.trim()).join("   |   "), W * 0.08, H * 0.795, W * 0.84, H * 0.04, {
    family: SANS, weight: 500, size: 25 * s, minSize: 14 * s, color: alpha(ink, 0.72), ...centre, maxLines: 1,
  });
  const rowY = H * 0.865;
  const rowH = H * 0.07;
  scene.text(content.phone.trim() ? `${content.infoLabel}\n${content.phone}` : "", W * 0.15, rowY, W * 0.25, rowH, {
    family: SANS, weight: 700, size: 22 * s, minSize: 12 * s, color: ink, valign: "middle", lineHeight: 1.25, maxLines: 2,
  });
  const ctaW = W * 0.21;
  const ctaH = 46 * s;
  scene.add({ kind: "rect", x: (W - ctaW) / 2, y: rowY + (rowH - ctaH) / 2, w: ctaW, h: ctaH, stroke: alpha(ink, 0.7), strokeWidth: 1.6 * s, radius: 9 * s });
  scene.text(upper(content.ctaLabel), (W - ctaW) / 2, rowY + (rowH - ctaH) / 2, ctaW, ctaH, { family: SANS, weight: 600, size: 20 * s, minSize: 11 * s, color: ink, ...centre, maxLines: 1 });
  scene.text(content.website, W * 0.63, rowY, W * 0.23, rowH, { family: SANS, weight: 700, size: 20 * s, minSize: 11 * s, color: pop, align: "right", valign: "middle", lineHeight: 1.25, maxLines: 2 });
  return scene.done();
}

// ─── Keynote ─────────────────────────────────────────────────────────────────

function buildKeynote(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W / 1080, H / 1350);
  const glow = palette.accent;
  const soft = mix(palette.ground, "#ffffff", 0.55);
  const speaker = input.speakers[0];
  const scene = createScene(format, palette.primary);
  const centre = { align: "center" as const, valign: "middle" as const };

  const gap = 26 * s;
  scene.add({ kind: "dots", x: gap / 2, y: gap / 2, cols: Math.ceil(W / gap), rows: Math.ceil(H / gap), gap, r: 1.6 * s, color: alpha("#ffffff", 0.07) });
  scene.text(upper(content.formatLabel), W * 0.1, H * 0.045, W * 0.8, H * 0.04, { family: SANS, weight: 700, size: 36 * s, color: soft, ...centre, letterSpacing: 2 * s, maxLines: 1 });
  const lines = balanceWords(content.eventTitle, content.eventTitle.trim().length > 18 ? 2 : 1);
  scene.text(upper(lines[0] ?? ""), W * 0.06, H * 0.095, W * 0.88, H * 0.085, { family: CONDENSED, weight: 400, size: 118 * s, minSize: 44 * s, color: glow, ...centre, maxLines: 1 });
  scene.text(upper(lines[1] ?? ""), W * 0.06, H * 0.175, W * 0.88, H * 0.085, { family: CONDENSED, weight: 400, size: 118 * s, minSize: 44 * s, color: "#ffffff", ...centre, maxLines: 1 });

  const card = { x: W * 0.09, y: H * 0.3, w: W * 0.82, h: H * 0.31 };
  scene.add({ kind: "rect", ...card, fill: palette.ground });
  scene.add(
    portrait({ x: card.x, y: card.y, w: card.w * 0.4, h: card.h }, speaker, input.coverImageUrl, {
      background: mix(palette.ground, "#ffffff", 0.2), color: "#ffffff", family: SANS, label: content.eventTitle,
    }),
  );
  const tx = card.x + card.w * 0.45;
  const tw = card.w * 0.5;
  scene.text(speaker ? "Keynote Speaker:" : "", tx, card.y + card.h * 0.1, tw, card.h * 0.08, { family: SANS, weight: 700, size: 22 * s, color: soft, valign: "middle", maxLines: 1 });
  scene.text(speaker?.name || content.organizerName, tx, card.y + card.h * 0.19, tw, card.h * 0.34, {
    family: SANS, weight: 500, size: 70 * s, minSize: 30 * s, color: glow, valign: "middle", lineHeight: 1.05, maxLines: 2, role: "speaker-name",
  });
  scene.text(speaker?.role ?? content.subtitle, tx, card.y + card.h * 0.54, tw, card.h * 0.09, { family: SANS, weight: 400, size: 24 * s, minSize: 14 * s, color: "#ffffff", valign: "middle", maxLines: 1 });
  scene.add({ kind: "line", x1: tx, y1: card.y + card.h * 0.68, x2: tx + tw, y2: card.y + card.h * 0.68, color: alpha("#ffffff", 0.35), width: 1.5 * s });
  const meta = { family: SANS, weight: 400, color: "#ffffff" };
  iconLine(scene, "clock", content.timeLine, tx, card.y + card.h * 0.73, tw, 21 * s, meta);
  iconLine(scene, "pin", content.venueName, tx, card.y + card.h * 0.85, tw, 21 * s, meta);

  scene.text(content.description, W * 0.09, H * 0.64, W * 0.82, H * 0.15, { family: SANS, weight: 400, size: 26 * s, minSize: 16 * s, color: "#ffffff", ...centre, lineHeight: 1.5, maxLines: 5 });
  const ctaW = W * 0.5;
  const ctaH = Math.min(H * 0.06, 84 * s);
  scene.add({ kind: "rect", x: (W - ctaW) / 2, y: H * 0.825, w: ctaW, h: ctaH, fill: glow });
  scene.text(upper(content.ctaLabel), (W - ctaW) / 2, H * 0.825, ctaW, ctaH, { family: SANS, weight: 700, size: 32 * s, minSize: 15 * s, color: readableOn(glow, palette.primary, "#ffffff"), ...centre, maxLines: 1 });
  scene.text(content.website, W * 0.1, H * 0.91, W * 0.8, H * 0.04, { family: SANS, weight: 400, size: 25 * s, minSize: 14 * s, color: "#ffffff", ...centre, maxLines: 1 });
  return scene.done();
}

// ─── Headliner ───────────────────────────────────────────────────────────────

function buildHeadliner(input: BuildInput): Scene {
  const { format, content, palette } = input;
  const W = format.width;
  const H = format.height;
  const s = Math.min(W / 1080, H / 1350);
  const navy = palette.primary;
  const paper = palette.ground;
  const ink = readableOn(paper, navy, "#ffffff");
  const speaker = input.speakers[0];
  const scene = createScene(format, paper);
  const heroH = Math.round(H * 0.685);

  scene.add({ kind: "rect", x: 0, y: 0, w: W, h: heroH, fill: navy });
  const photo = { x: W * 0.2, y: H * 0.06, w: W * 0.6, h: heroH - H * 0.06 };
  scene.add(portrait(photo, speaker, input.coverImageUrl, { background: lighten(navy, 0.12), color: "#ffffff", family: SANS, label: content.eventTitle }));
  // Soften the photo's edges into the backdrop so a rectangular picture
  // doesn't sit on the poster as a hard block.
  const fade = photo.w * 0.22;
  scene.add({ kind: "rect", x: photo.x - 1, y: photo.y, w: fade, h: photo.h, fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, navy], [1, alpha(navy, 0)]] } });
  scene.add({ kind: "rect", x: photo.x + photo.w - fade + 1, y: photo.y, w: fade, h: photo.h, fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, alpha(navy, 0)], [1, navy]] } });
  scene.add({ kind: "rect", x: photo.x - 1, y: photo.y - 1, w: photo.w + 2, h: fade, fill: { type: "linear", from: [0, 0], to: [0, 1], stops: [[0, navy], [1, alpha(navy, 0)]] } });
  scene.add({ kind: "rect", x: 0, y: heroH * 0.55, w: W, h: heroH * 0.45, fill: { type: "linear", from: [0, 0], to: [0, 1], stops: [[0, alpha(navy, 0)], [1, alpha(navy, 0.8)]] } });

  organizerMark(scene, input, { x: W * 0.6, y: H * 0.085, w: W * 0.33, h: H * 0.05 }, { color: palette.accent, size: 40 * s, align: "right", family: CONDENSED, weight: 400 });
  const headlineLines = balanceWords(content.eventTitle, content.eventTitle.trim().length > 12 ? 2 : 1);
  scene.text(upper(headlineLines.join("\n")), W * 0.05, heroH * 0.52, W * 0.9, heroH * 0.38, {
    family: DISPLAY, weight: 400, size: 250 * s, minSize: 60 * s, color: palette.accent, align: "center", valign: "bottom", lineHeight: 1.0, maxLines: Math.max(1, headlineLines.length),
    shadow: { color: "rgba(0,0,0,0.45)", blur: 14 * s, offsetX: 0, offsetY: 6 * s },
  });
  const plate = { x: W * 0.18, y: heroH - 44 * s, w: W * 0.67, h: 104 * s };
  const plateName = speaker?.name || content.subtitle;
  if (plateName.trim()) {
    scene.add({
      kind: "rect", ...plate, radius: 14 * s, rotation: -2,
      fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, darken(navy, 0.25)], [0.6, lighten(navy, 0.12)], [1, darken(navy, 0.1)]] },
    });
  } else {
    scene.skip();
  }
  scene.text(upper(plateName), plate.x + plate.w * 0.05, plate.y, plate.w * 0.9, plate.h, {
    family: "Archivo", weight: 800, size: 62 * s, minSize: 26 * s, color: "#ffffff", align: "center", valign: "middle", letterSpacing: 3 * s, maxLines: 1, rotation: -2, role: "speaker-name",
  });

  const rowY = heroH + (H - heroH) * 0.27;
  const strong = { family: SANS, weight: 700, color: ink };
  const iconSize = 78 * s;
  scene.add({ kind: "icon", name: "calendar", x: W * 0.09, y: rowY, size: iconSize, color: ink });
  scene.text(content.dateLine, W * 0.185, rowY - 4 * s, W * 0.33, 46 * s, { ...strong, size: 38 * s, minSize: 20 * s, valign: "middle", maxLines: 1 });
  scene.text(content.timeLine, W * 0.185, rowY + 42 * s, W * 0.33, 38 * s, { family: SANS, weight: 400, size: 29 * s, minSize: 16 * s, color: ink, valign: "middle", maxLines: 1 });
  scene.add({ kind: "icon", name: "pin", x: W * 0.535, y: rowY, size: iconSize, color: ink });
  scene.text(content.venueName, W * 0.63, rowY - 4 * s, W * 0.32, 46 * s, { ...strong, size: 38 * s, minSize: 20 * s, valign: "middle", maxLines: 1 });
  scene.text(content.venueAddress, W * 0.63, rowY + 42 * s, W * 0.32, 76 * s, { family: SANS, weight: 400, size: 28 * s, minSize: 16 * s, color: ink, lineHeight: 1.2, maxLines: 2 });

  const footY = heroH + (H - heroH) * 0.62;
  scene.text([content.phone.trim() ? `RSVP ${content.phone.trim()}` : "", content.website].filter((l) => l.trim()).join("\n"), W * 0.09, footY, W * 0.42, 96 * s, {
    ...strong, size: 34 * s, minSize: 17 * s, valign: "middle", lineHeight: 1.25, maxLines: 2,
  });
  const cta = { x: W * 0.535, y: footY + 6 * s, w: W * 0.345, h: 84 * s };
  scene.add({ kind: "rect", ...cta, radius: 16 * s, fill: { type: "linear", from: [0, 0], to: [1, 0], stops: [[0, darken(navy, 0.2)], [0.6, lighten(navy, 0.14)], [1, navy]] } });
  scene.text(upper(content.ctaLabel), cta.x + cta.w * 0.06, cta.y, cta.w * 0.88, cta.h, { family: "Archivo", weight: 800, size: 36 * s, minSize: 16 * s, color: "#ffffff", align: "center", valign: "middle", letterSpacing: 2 * s, maxLines: 1 });
  return scene.done();
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: "studio-spotlight",
    name: "Spotlight",
    description: "One speaker's portrait beside the event details, with organiser and sponsor in the footer.",
    maxSpeakers: 1,
    palette: { primary: "#0f1b2d", accent: "#ffffff", ground: "#9fb5ac" },
    paletteLabels: { primary: "Header & footer", accent: "Highlight text", ground: "Panel" },
    fields: [
      { key: "organizerName", label: "Organiser" },
      { key: "organizerTagline", label: "Organiser tagline" },
      { key: "kicker", label: "Intro line" },
      { key: "eventTitle", label: "Event title" },
      { key: "dateLine", label: "Date" },
      { key: "timeLine", label: "Time" },
      { key: "venueName", label: "Venue" },
      { key: "venueAddress", label: "Address", multiline: true },
      { key: "infoLabel", label: "Contact heading" },
      { key: "website", label: "Website" },
      { key: "phone", label: "Phone" },
      { key: "sponsorLabel", label: "Sponsor heading" },
      { key: "ctaLabel", label: "Call to action (no sponsor)" },
    ],
    build: buildSpotlight,
  },
  {
    id: "studio-lineup",
    name: "Lineup",
    description: "The event title over a gradient oval with a row of speaker portraits, date and venue.",
    maxSpeakers: LINEUP_MAX_SPEAKERS,
    palette: { primary: "#03094a", accent: "#ff4a1c", ground: "#5c9df5" },
    paletteLabels: { primary: "Background", accent: "Script & pin", ground: "Oval" },
    fields: [
      { key: "eventTitle", label: "Event title" },
      { key: "organizerName", label: "Top line (single-word titles)" },
      { key: "subtitle", label: "Topic" },
      { key: "speakersLabel", label: "Speakers heading" },
      { key: "dateLine", label: "Date" },
      { key: "timeLine", label: "Time" },
      { key: "venueName", label: "Venue" },
      { key: "phone", label: "Phone" },
      { key: "website", label: "Website" },
      { key: "description", label: "Description (no speakers)", multiline: true },
    ],
    build: buildLineup,
  },
  {
    id: "studio-webinar",
    name: "Webinar",
    description: "A bold headline, talking points and date beside the speaker in an arched frame.",
    maxSpeakers: 1,
    palette: { primary: "#231a22", accent: "#f0592b", ground: "#f6f6ea" },
    paletteLabels: { primary: "Text & buttons", accent: "Accent", ground: "Background" },
    fields: [
      { key: "badge", label: "Badge" },
      { key: "formatLabel", label: "Format" },
      { key: "eventTitle", label: "Headline" },
      { key: "subtitle", label: "Ribbon" },
      { key: "bullets", label: "Talking points (one per line)", multiline: true },
      { key: "dateLine", label: "Date" },
      { key: "description", label: "Description", multiline: true },
      { key: "ctaLabel", label: "Button" },
      { key: "linkLabel", label: "Link heading" },
      { key: "website", label: "Website" },
      { key: "venueName", label: "Venue" },
      { key: "venueAddress", label: "Address", multiline: true },
      { key: "phone", label: "Phone" },
    ],
    build: buildWebinar,
  },
  {
    id: "studio-speaker-card",
    name: "Speaker Card",
    description: "A black-and-white portrait over a colour band with the speaker's name, role and bio.",
    maxSpeakers: 1,
    palette: { primary: "#8e1f63", accent: "#ffffff", ground: "#e9e9e9" },
    paletteLabels: { primary: "Brand colour", accent: "Role chip", ground: "Photo backdrop" },
    formats: TALL_FORMATS,
    fields: [
      { key: "sideLabel", label: "Side label" },
      { key: "organizerName", label: "Organiser" },
      { key: "description", label: "Bio (when the speaker has none)", multiline: true },
      { key: "infoLabel", label: "Contact heading" },
      { key: "phone", label: "Phone" },
      { key: "website", label: "Website" },
      { key: "ctaLabel", label: "Button" },
    ],
    build: buildSpeakerCard,
  },
  {
    id: "studio-session",
    name: "Session",
    description: "A framed portrait beside a bold colour sweep with a handwritten headline.",
    maxSpeakers: 1,
    palette: { primary: "#e01b24", accent: "#ffd84d", ground: "#f5f5f5" },
    paletteLabels: { primary: "Brand colour", accent: "Accent", ground: "Background" },
    formats: TALL_FORMATS,
    fields: [
      { key: "scriptLine", label: "Handwritten line" },
      { key: "organizerName", label: "Organiser" },
      { key: "eventTitle", label: "Event title" },
      { key: "dateLine", label: "Date" },
      { key: "timeLine", label: "Time" },
      { key: "venueName", label: "Venue" },
    ],
    build: buildSession,
  },
  {
    id: "studio-keynote",
    name: "Keynote",
    description: "A dark poster with a two-tone title and a keynote speaker card.",
    maxSpeakers: 1,
    palette: { primary: "#2a2550", accent: "#7ef0f5", ground: "#4a4380" },
    paletteLabels: { primary: "Background", accent: "Highlight", ground: "Card" },
    formats: TALL_FORMATS,
    fields: [
      { key: "formatLabel", label: "Top label" },
      { key: "eventTitle", label: "Title" },
      { key: "timeLine", label: "Time" },
      { key: "venueName", label: "Venue" },
      { key: "description", label: "Description", multiline: true },
      { key: "ctaLabel", label: "Button" },
      { key: "website", label: "Website" },
    ],
    build: buildKeynote,
  },
  {
    id: "studio-headliner",
    name: "Headliner",
    description: "The speaker behind a huge headline, with date, venue and RSVP below.",
    maxSpeakers: 1,
    palette: { primary: "#14203f", accent: "#ffffff", ground: "#ffffff" },
    paletteLabels: { primary: "Brand colour", accent: "Headline", ground: "Lower panel" },
    formats: TALL_FORMATS,
    fields: [
      { key: "eventTitle", label: "Headline" },
      { key: "organizerName", label: "Organiser" },
      { key: "dateLine", label: "Date" },
      { key: "timeLine", label: "Time" },
      { key: "venueName", label: "Venue" },
      { key: "venueAddress", label: "Address", multiline: true },
      { key: "phone", label: "RSVP phone" },
      { key: "website", label: "Website" },
      { key: "ctaLabel", label: "Button" },
    ],
    build: buildHeadliner,
  },
  {
    id: "studio-training",
    name: "Training",
    description: "A fan of up to six speaker cards under a condensed title, with a handwritten overlay.",
    maxSpeakers: GRID_MAX_SPEAKERS,
    palette: { primary: "#1c1c1c", accent: "#f5a800", ground: "#ececec" },
    paletteLabels: { primary: "Text", accent: "Card colour", ground: "Background" },
    formats: TALL_FORMATS,
    fields: [
      { key: "eventTitle", label: "Title" },
      { key: "subtitle", label: "Line above the title" },
      { key: "dateLine", label: "Date" },
      { key: "timeLine", label: "Time" },
      { key: "description", label: "Description", multiline: true },
      { key: "scriptLine", label: "Handwritten line" },
      { key: "formatLabel", label: "Spaced line" },
      { key: "venueName", label: "Venue" },
      { key: "ctaLabel", label: "Button" },
      { key: "website", label: "Website" },
    ],
    build: buildTraining,
  },
  {
    id: "studio-workshop",
    name: "Workshop",
    description: "Up to six speakers in a grid of circles with names and roles.",
    maxSpeakers: GRID_MAX_SPEAKERS,
    palette: { primary: "#2b2b2b", accent: "#e9a100", ground: "#ececec" },
    paletteLabels: { primary: "Text & panel", accent: "Rings & roles", ground: "Background" },
    formats: TALL_FORMATS,
    fields: [
      { key: "eventTitle", label: "Title" },
      { key: "subtitle", label: "Line above the title" },
      { key: "formatLabel", label: "Line below the title" },
      { key: "timeLine", label: "Time" },
      { key: "dateLine", label: "Date" },
      { key: "venueName", label: "Venue" },
      { key: "infoLabel", label: "Phone heading" },
      { key: "phone", label: "Phone" },
      { key: "ctaLabel", label: "Button" },
      { key: "website", label: "Website" },
      { key: "description", label: "Description (no speakers)", multiline: true },
    ],
    build: buildWorkshop,
  },
];

export function findStudioTemplate(id: string): StudioTemplate {
  return STUDIO_TEMPLATES.find((t) => t.id === id) ?? STUDIO_TEMPLATES[0];
}

export function findStudioFormat(id: string): StudioFormat {
  return STUDIO_FORMATS.find((f) => f.id === id) ?? STUDIO_FORMATS[0];
}

/**
 * Download / storage filename for a creative: the subject's name, the
 * template and the format, with anything a filesystem could object to
 * removed. "Maela Agatha" + Spotlight + Portrait → `maela-agatha-spotlight-portrait.png`.
 */
export function studioFilename(subject: string, template: StudioTemplate, format: StudioFormat): string {
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${slug(subject) || "creative"}-${slug(template.name)}-${slug(format.label)}.png`;
}
