/**
 * Scene model for the creative studio.
 *
 * A creative is a flat, ordered list of drawable nodes positioned in output
 * pixels. Templates (`templates.ts`) are pure functions from event data to a
 * `Scene`; the renderer (`render.ts`) is the only place that touches a
 * canvas. Keeping the two apart means every layout can be unit-tested without
 * a DOM, and the on-screen preview and the downloaded PNG are the same scene
 * drawn at two sizes — they cannot drift.
 */

/** Gradient coordinates are relative to the node's own box (0–1). */
export type Fill =
  | string
  | { type: "linear"; from: [number, number]; to: [number, number]; stops: Array<[number, string]> }
  | { type: "radial"; center: [number, number]; radius: number; stops: Array<[number, string]> };

/** One radius for every corner, or `[topLeft, topRight, bottomRight, bottomLeft]`. */
export type Radius = number | [number, number, number, number];

export interface Shadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

/** Fields every node carries. */
interface NodeBase {
  /** Stable within a template + format, so the organiser's edits can be
   *  stored as patches against it (see `edits.ts`). */
  id?: string;
  /** 0–1; omitted means fully opaque. */
  opacity?: number;
  /** Degrees clockwise about the node's centre. */
  rotation?: number;
}

interface Box extends NodeBase {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RectNode extends Box {
  kind: "rect";
  fill?: Fill;
  radius?: Radius;
  stroke?: string;
  strokeWidth?: number;
  shadow?: Shadow;
}

export interface EllipseNode extends NodeBase {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill?: Fill;
  stroke?: string;
  strokeWidth?: number;
}

export interface ImageNode extends Box {
  kind: "image";
  /** `null` (or a URL that fails to load) draws `fallback` instead. */
  src: string | null;
  fit: "cover" | "contain";
  radius?: Radius;
  circle?: boolean;
  /** Vertical anchor for `cover` crops, 0 (top) – 1 (bottom). Portraits keep
   *  the face in frame with a value near the top. */
  focalY?: number;
  /** Draw the photo in black and white. */
  grayscale?: boolean;
  /** What a missing photo is replaced with. Omit to draw nothing. */
  fallback?: { initials: string; background: Fill; color: string; family: string };
  /** What the node shows, for tests and the editor ("speaker-photo", "logo"…). */
  role?: string;
}

export interface TextNode extends Box {
  kind: "text";
  text: string;
  family: string;
  weight: number;
  /** Preferred size in px. The renderer shrinks towards `minSize` until the
   *  text fits the box, then truncates with an ellipsis. */
  size: number;
  minSize?: number;
  color: Fill;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  maxLines?: number;
  shadow?: Shadow;
  role?: string;
}

export interface LineNode extends NodeBase {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  /** Dash pattern in px. With a round cap and a zero-length dash this draws
   *  the dotted rules the reference posters use. */
  dash?: number[];
  round?: boolean;
}

export interface DotsNode extends NodeBase {
  kind: "dots";
  x: number;
  y: number;
  cols: number;
  rows: number;
  gap: number;
  r: number;
  color: string;
}

export type IconName = "pin" | "check-circle" | "play-circle" | "link" | "chevron-up" | "calendar" | "clock" | "phone" | "globe";

export interface IconNode extends NodeBase {
  kind: "icon";
  name: IconName;
  x: number;
  y: number;
  size: number;
  color: string;
  /** Second colour, for two-tone icons (the play triangle). */
  color2?: string;
}

export type SceneNode = RectNode | EllipseNode | ImageNode | TextNode | LineNode | DotsNode | IconNode;

export interface Scene {
  width: number;
  height: number;
  background: string;
  nodes: SceneNode[];
}

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The axis-aligned box a node occupies before rotation. Pure. */
export function nodeBounds(node: SceneNode): Bounds {
  switch (node.kind) {
    case "ellipse":
      return { x: node.cx - node.rx, y: node.cy - node.ry, w: node.rx * 2, h: node.ry * 2 };
    case "line": {
      const pad = node.width / 2;
      const x = Math.min(node.x1, node.x2) - pad;
      const y = Math.min(node.y1, node.y2) - pad;
      return { x, y, w: Math.abs(node.x2 - node.x1) + pad * 2, h: Math.abs(node.y2 - node.y1) + pad * 2 };
    }
    case "dots":
      return {
        x: node.x - node.r,
        y: node.y - node.r,
        w: (node.cols - 1) * node.gap + node.r * 2,
        h: (node.rows - 1) * node.gap + node.r * 2,
      };
    case "icon":
      return { x: node.x, y: node.y, w: node.size, h: node.size };
    default:
      return { x: node.x, y: node.y, w: node.w, h: node.h };
  }
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (h.length < 6 || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

/** `true` for a `#rgb` / `#rrggbb` string. */
export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Blend `a` towards `b` by `t` (0–1). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

export const lighten = (color: string, t: number): string => mix(color, "#ffffff", t);
export const darken = (color: string, t: number): string => mix(color, "#000000", t);

/** `color` with an alpha channel, as an `rgba()` string. */
export function alpha(color: string, a: number): string {
  const [r, g, b] = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(color: string): number {
  const [r, g, b] = parseHex(color).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whichever of `dark` / `light` reads better on `background`. */
export function readableOn(background: string, dark = "#111827", light = "#ffffff"): string {
  return luminance(background) > 0.42 ? dark : light;
}
