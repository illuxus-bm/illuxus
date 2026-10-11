/**
 * Building blocks for the art-directed designs in `directions.ts`.
 *
 * A design is laid out by dividing the canvas into rectangles and placing one
 * element in each: text is fitted to its box by the renderer, pictures are
 * clipped to theirs, so elements cannot run into one another however long a
 * name is. Sizes are expressed in `u` — one percent of the canvas's shorter
 * side (a touch more on wide and tall canvases, so type stays readable).
 *
 * Everything here produces plain scene nodes, which is what makes each
 * element of a finished design individually editable in the studio.
 */
import { alpha, mix, readableOn, type Fill, type ImageNode, type Radius, type Scene, type SceneNode, type TextNode } from "./scene";
import type { BuildInput, StudioContent, StudioPalette, StudioSpeaker, StudioSponsor } from "./templates";

export interface Box { x: number; y: number; w: number; h: number }
export type TextStyle = Partial<Omit<TextNode, "kind" | "text" | "x" | "y" | "w" | "h" | "family" | "weight" | "size" | "color">>;

export const inset = (b: Box, dx: number, dy = dx): Box => ({ x: b.x + dx, y: b.y + dy, w: Math.max(0, b.w - dx * 2), h: Math.max(0, b.h - dy * 2) });

/** Divide `b` into rows whose heights are proportional to `weights`. */
export function rows(b: Box, weights: number[], gap = 0): Box[] {
  const total = weights.reduce((n, w) => n + w, 0) || 1;
  const usable = Math.max(0, b.h - gap * (weights.length - 1));
  let y = b.y;
  return weights.map((w) => {
    const h = (usable * w) / total;
    const box = { x: b.x, y, w: b.w, h };
    y += h + gap;
    return box;
  });
}

/** Divide `b` into columns whose widths are proportional to `weights`. */
export function cols(b: Box, weights: number[], gap = 0): Box[] {
  const total = weights.reduce((n, w) => n + w, 0) || 1;
  const usable = Math.max(0, b.w - gap * (weights.length - 1));
  let x = b.x;
  return weights.map((w) => {
    const width = (usable * w) / total;
    const box = { x, y: b.y, w: width, h: b.h };
    x += width + gap;
    return box;
  });
}

/** The largest box of the given aspect ratio (w / h) inside `b`, aligned 0–1 on each axis. */
export function fit(b: Box, aspect: number, ax = 0.5, ay = 0.5): Box {
  let w = b.w, h = b.w / aspect;
  if (h > b.h) { h = b.h; w = b.h * aspect; }
  return { x: b.x + (b.w - w) * ax, y: b.y + (b.h - h) * ay, w, h };
}

/** `n` cells in a grid of `perRow` columns; a short last row is centred. */
export function grid(b: Box, n: number, perRow: number, gap: number): Box[] {
  const count = Math.max(1, n), per = Math.max(1, Math.min(perRow, count));
  const rowCount = Math.ceil(count / per);
  const cw = (b.w - gap * (per - 1)) / per, ch = (b.h - gap * (rowCount - 1)) / rowCount;
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / per), col = i % per;
    const inRow = row === rowCount - 1 ? count - per * (rowCount - 1) : per;
    const offset = ((per - inRow) * (cw + gap)) / 2;
    return { x: b.x + offset + col * (cw + gap), y: b.y + row * (ch + gap), w: cw, h: ch };
  });
}

/** Up to two initials, for the placeholder drawn when a photo is missing. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** The drawing context a design works with. */
export interface D {
  W: number;
  H: number;
  /** 1% of the shorter side, scaled a little on wide / tall canvases. */
  u: number;
  /** Outer margin. */
  m: number;
  wide: boolean;
  tall: boolean;
  /** The canvas inside the outer margin. */
  safe: Box;
  full: Box;
  c: StudioContent;
  p: StudioPalette;
  input: BuildInput;
  speaker: StudioSpeaker | undefined;
  people: StudioSpeaker[];
  sponsor: StudioSponsor | undefined;
  add: (node: SceneNode) => void;
  /** Add text fitted to `box`. Blank text is skipped (its id is still burned). */
  t: (value: string, box: Box, family: string, weight: number, sizeU: number, color: Fill, style?: TextStyle) => void;
  rect: (box: Box, fill: Fill | undefined, extra?: { radius?: Radius; stroke?: string; strokeWidth?: number; rotation?: number; opacity?: number; shadow?: { color: string; blur: number; offsetX: number; offsetY: number } }) => void;
  disc: (cx: number, cy: number, r: number, fill: Fill | undefined, extra?: { stroke?: string; strokeWidth?: number; opacity?: number; ry?: number }) => void;
  line: (x1: number, y1: number, x2: number, y2: number, color: string, width: number, extra?: { dash?: number[]; round?: boolean; opacity?: number }) => void;
  /** Burn `n` ids for nodes a branch chose not to draw, keeping later ids stable. */
  skip: (n?: number) => void;
  done: () => Scene;
}

export function open(input: BuildInput, background: string): D {
  const { format, content, palette } = input;
  const W = format.width, H = format.height;
  const wide = W / H >= 1.25, tall = H / W >= 1.5;
  const u = (Math.min(W, H) / 100) * (wide ? 1.18 : tall ? 1.08 : 1);
  const m = u * 6.5;
  const nodes: SceneNode[] = [];
  // Ids count every call — including text skipped for being blank — so
  // clearing one line doesn't renumber the nodes after it and detach the
  // organiser's canvas edits from them.
  let count = 0;
  const nextId = (): string => `n${(count += 1)}`;
  const add = (node: SceneNode): void => { nodes.push({ ...node, id: nextId() }); };
  return {
    W, H, u, m, wide, tall,
    safe: { x: m, y: m, w: W - m * 2, h: H - m * 2 },
    full: { x: 0, y: 0, w: W, h: H },
    c: content, p: palette, input,
    speaker: input.speakers[0],
    people: input.speakers,
    sponsor: input.sponsors[0],
    add,
    t: (value, box, family, weight, sizeU, color, style = {}) => {
      const id = nextId();
      if (!value || !value.trim() || box.w <= 0 || box.h <= 0) return;
      nodes.push({
        kind: "text", text: value, x: box.x, y: box.y, w: box.w, h: box.h,
        family, weight, size: sizeU * u, minSize: Math.max(u * 1.5, sizeU * u * 0.5), color,
        lineHeight: 1.12, valign: "top", ...style, id,
      });
    },
    rect: (box, fill, extra = {}) => add({ kind: "rect", x: box.x, y: box.y, w: box.w, h: box.h, fill, ...extra }),
    disc: (cx, cy, r, fill, extra = {}) => { const { ry, ...rest } = extra; add({ kind: "ellipse", cx, cy, rx: r, ry: ry ?? r, fill, ...rest }); },
    line: (x1, y1, x2, y2, color, width, extra = {}) => add({ kind: "line", x1, y1, x2, y2, color, width, ...extra }),
    skip: (n = 1) => { count += n; },
    done: () => ({ width: W, height: H, background, nodes }),
  };
}

/* ── Elements ──────────────────────────────────────────────────────────── */

export interface PhotoStyle {
  circle?: boolean;
  radius?: Radius;
  grayscale?: boolean;
  rotation?: number;
  /** Placeholder colours when the speaker has no photo. */
  bg: Fill;
  fg: string;
  family: string;
}

/** A speaker's portrait (initials on a tint when there is no photo). */
export function photo(d: D, box: Box, speaker: StudioSpeaker | undefined, style: PhotoStyle): void {
  const node: ImageNode = {
    kind: "image", ...box,
    src: speaker?.photoUrl ?? null,
    fit: "cover", focalY: 0.18, role: "speaker-photo",
    circle: style.circle, radius: style.radius, grayscale: style.grayscale, rotation: style.rotation,
    fallback: { initials: initials(speaker?.name ?? ""), background: style.bg, color: style.fg, family: style.family },
  };
  d.add(node);
}

/** The event's cover image, cropped to `box` (nothing is drawn when there is none). */
export function cover(d: D, box: Box, extra: Partial<ImageNode> = {}): boolean {
  if (!d.input.coverImageUrl) { d.skip(); return false; }
  d.add({ kind: "image", ...box, src: d.input.coverImageUrl, fit: "cover", role: "event-cover", ...extra });
  return true;
}

/**
 * A logo on a plate: the plate keeps any logo legible whatever the design's
 * colours. With no logo the name is set in type instead.
 */
export function logoPlate(
  d: D, box: Box, logoUrl: string | null | undefined, name: string,
  style: { fill?: Fill; ink?: string; radius?: Radius; family: string; weight?: number; stroke?: string; strokeWidth?: number; pad?: number; rotation?: number; role?: string },
): void {
  const fill = style.fill ?? "#ffffff";
  d.rect(box, fill, { radius: style.radius, stroke: style.stroke, strokeWidth: style.strokeWidth, rotation: style.rotation });
  const area = inset(box, Math.min(box.w, box.h) * (style.pad ?? 0.16));
  if (logoUrl) {
    d.add({ kind: "image", ...area, src: logoUrl, fit: "contain", role: style.role ?? "sponsor-logo", rotation: style.rotation });
    d.t("", area, style.family, 700, 4, "#000000");
  } else {
    d.skip();
    d.t(name, area, style.family, style.weight ?? 700, Math.min(9, (area.h / d.u) * 0.42), style.ink ?? (typeof fill === "string" ? readableOn(fill) : "#111827"), { align: "center", valign: "middle", maxLines: 2, rotation: style.rotation });
  }
}

/** The organiser: their logo when there is one, otherwise their name. */
export function organiser(d: D, box: Box, family: string, color: string, align: "left" | "center" | "right" = "left", plate?: Fill): void {
  const url = d.input.organizerLogoUrl;
  if (url) {
    const size = fit(box, 1.6, align === "left" ? 0 : align === "center" ? 0.5 : 1, 0.5);
    if (plate) d.rect(size, plate, { radius: d.u * 1.2 });
    else d.skip();
    d.add({ kind: "image", ...inset(size, plate ? d.u * 0.9 : 0), src: url, fit: "contain", role: "organiser-logo" });
    d.t("", box, family, 700, 2.4, color);
  } else {
    d.skip(2);
    d.t(d.c.organizerName.toUpperCase(), box, family, 700, 2.3, color, { align, valign: "middle", letterSpacing: d.u * 0.3, maxLines: 1 });
  }
}

/** A button: a filled rectangle with its label centred. `box` is the area it may use. */
export function button(d: D, box: Box, label: string, style: { fill: Fill; ink: string; family: string; weight?: number; radius?: number; size?: number; align?: "left" | "center" | "right"; stroke?: string; upper?: boolean }): void {
  const size = style.size ?? 2.5;
  const text = style.upper ? label.toUpperCase() : label;
  if (!text.trim()) { d.skip(2); return; }
  const h = Math.min(box.h, d.u * size * 2.5);
  const w = Math.min(box.w, d.u * size * (text.length * 0.62 + 3.4));
  const x = style.align === "center" ? box.x + (box.w - w) / 2 : style.align === "right" ? box.x + box.w - w : box.x;
  const b = { x, y: box.y + (box.h - h) / 2, w, h };
  d.rect(b, style.fill, { radius: style.radius ?? h / 2, stroke: style.stroke, strokeWidth: style.stroke ? d.u * 0.3 : undefined });
  d.t(text, inset(b, d.u * size * 0.7, 0), style.family, style.weight ?? 700, size, style.ink, { align: "center", valign: "middle", maxLines: 1, letterSpacing: style.upper ? d.u * 0.18 : 0 });
}

/** "16 October 2026 · JW Marriott" — whichever parts exist. */
export const whenWhere = (c: StudioContent, sep = "  ·  "): string => [c.dateLine, c.venueName].map((v) => v.trim()).filter(Boolean).join(sep);

/** Day number and the rest of a date line: "16 October 2026" → ["16", "October 2026"]. */
export function dateParts(line: string): [string, string] {
  const m = /^(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+(.*)$/.exec(line.trim());
  return m ? [m[1], m[2]] : ["", line.trim()];
}

export const up = (v: string): string => v.toUpperCase();
export { alpha, mix, readableOn };
export type { Fill, StudioPalette, StudioSpeaker, StudioSponsor };
