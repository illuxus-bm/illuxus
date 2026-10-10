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
  return {
    nodes,
    add: (node: SceneNode): void => {
      nodes.push(node);
    },
    text: (value: string, x: number, y: number, w: number, h: number, style: TextStyle): void => {
      if (!value.trim()) return;
      nodes.push({ kind: "text", text: value, x, y, w, h, ...style });
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
  }
  scene.text(content.venueName, W * 0.548, H * 0.805, W * 0.39, H * 0.036, { ...body, weight: 700, size: 40 * s, minSize: 22 * s, valign: "middle", maxLines: 1 });
  scene.text(content.venueAddress, W * 0.548, H * 0.843, W * 0.39, H * 0.048, {
    ...body, weight: 400, size: 28 * s, minSize: 17 * s, lineHeight: 1.25, valign: "top", maxLines: 2,
  });
  scene.text(content.phone, W * 0.548, H * 0.893, W * 0.39, H * 0.03, { ...body, weight: 500, size: 28 * s, minSize: 17 * s, valign: "middle", maxLines: 1 });
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
