/**
 * Built-in certificate backgrounds.
 *
 * Each is a page colour or gradient plus decoration drawn with the editor's
 * own shapes — vector, so it is sharp at any print size, and editable like
 * anything else once placed. Decoration is sized from the page, so every
 * background works in landscape and portrait.
 */
import { newShapeElement, type BrochureElement, type ShapeElement } from "@/lib/brochure/editor/editor-document";
import type { BackgroundPreset } from "./certificate-design";

type ShapeSeed = Parameters<typeof newShapeElement>[0];
const shape = (seed: ShapeSeed): ShapeElement => newShapeElement({ fill: "transparent", stroke: "transparent", strokeWidth: 0, ...seed });

/** A rectangular frame `inset` mm in from the page edge. */
export const frame = (w: number, h: number, inset: number, stroke: string, strokeWidth: number, extra: Partial<ShapeElement> = {}): ShapeElement =>
  ({ ...shape({ x: inset, y: inset, width: w - inset * 2, height: h - inset * 2, stroke, strokeWidth }), ...extra });

/** Small square ornaments rotated 45° at the four corners of a frame. */
function cornerDiamonds(w: number, h: number, inset: number, size: number, fill: string): ShapeElement[] {
  const pts = [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]];
  return pts.map(([cx, cy]) => shape({ shape: "diamond", x: cx - size / 2, y: cy - size / 2, width: size, height: size, fill }));
}

/** L-shaped brackets in each corner. */
function cornerBrackets(w: number, h: number, inset: number, len: number, color: string, weight = 0.8): ShapeElement[] {
  const t = weight;
  const out: ShapeElement[] = [];
  for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]] as const) {
    out.push(shape({ x: sx > 0 ? x : x - len, y: sy > 0 ? y : y - t, width: len, height: t, fill: color }));
    out.push(shape({ x: sx > 0 ? x : x - t, y: sy > 0 ? y : y - len, width: t, height: len, fill: color }));
  }
  return out;
}

export const BACKGROUND_CATEGORIES = [
  "Clean white & minimal",
  "Ivory & cream",
  "Navy & executive",
  "Black & gold",
  "Blue corporate",
  "Geometric patterns",
  "Abstract gradients",
  "Borders & ornamental frames",
  "Technology",
] as const;

export const BACKGROUNDS: BackgroundPreset[] = [
  // ── Clean white & minimal ──
  { id: "white-plain", name: "Plain white", category: "Clean white & minimal", background: { type: "solid", color: "#ffffff" }, decorate: () => [] },
  {
    id: "white-hairline", name: "White, hairline frame", category: "Clean white & minimal", background: { type: "solid", color: "#ffffff" },
    decorate: (w, h) => [frame(w, h, 10, "#d1d5db", 0.3)],
  },
  {
    id: "white-edge-rule", name: "White, side rule", category: "Clean white & minimal", background: { type: "solid", color: "#ffffff" },
    decorate: (_w, h) => [shape({ x: 0, y: 0, width: 4, height: h, fill: "#111827" })],
  },
  // ── Ivory & cream ──
  {
    id: "ivory-double", name: "Ivory, double frame", category: "Ivory & cream", background: { type: "solid", color: "#fbf7ee" },
    decorate: (w, h) => [frame(w, h, 8, "#b08d57", 1.2), frame(w, h, 11, "#b08d57", 0.3), ...cornerDiamonds(w, h, 11, 4, "#b08d57")],
  },
  {
    id: "cream-soft", name: "Cream, soft border", category: "Ivory & cream", background: { type: "solid", color: "#f7f1e3" },
    decorate: (w, h) => [frame(w, h, 6, "#e7dcc4", 3), frame(w, h, 12, "#c4a77d", 0.4)],
  },
  // ── Navy & executive ──
  {
    id: "navy-gold-frame", name: "Navy, gold frame", category: "Navy & executive", background: { type: "solid", color: "#0f1b33" },
    decorate: (w, h) => [frame(w, h, 9, "#c9a646", 0.9), frame(w, h, 12, "#c9a646", 0.3), ...cornerBrackets(w, h, 15, 14, "#c9a646", 0.7)],
  },
  {
    id: "navy-gradient", name: "Midnight gradient", category: "Navy & executive", background: { type: "gradient", top: "#14254a", bottom: "#070d1c" },
    decorate: (w, h) => [shape({ x: 0, y: h - 6, width: w, height: 6, fill: "#c9a646" })],
  },
  // ── Black & gold ──
  {
    id: "black-gold", name: "Black & gold", category: "Black & gold", background: { type: "solid", color: "#0b0b0c" },
    decorate: (w, h) => [frame(w, h, 7, "#d4af37", 1.6), frame(w, h, 10.5, "#d4af37", 0.3), ...cornerDiamonds(w, h, 10.5, 5, "#d4af37")],
  },
  {
    id: "black-gold-deco", name: "Black, art-deco corners", category: "Black & gold", background: { type: "gradient", top: "#151515", bottom: "#050505" },
    decorate: (w, h) => [...cornerBrackets(w, h, 9, 26, "#d4af37", 1), ...cornerBrackets(w, h, 13, 16, "#d4af37", 0.4)],
  },
  // ── Blue corporate ──
  {
    id: "blue-band", name: "Corporate blue band", category: "Blue corporate", background: { type: "solid", color: "#ffffff" },
    decorate: (w, h) => [shape({ x: 0, y: 0, width: w, height: 10, fill: "#1e3a8a" }), shape({ x: 0, y: 10, width: w, height: 1.5, fill: "#3b82f6" }), shape({ x: 0, y: h - 5, width: w, height: 5, fill: "#1e3a8a" })],
  },
  {
    id: "blue-wash", name: "Blue wash", category: "Blue corporate", background: { type: "gradient", top: "#eff6ff", bottom: "#ffffff" },
    decorate: (w, h) => [frame(w, h, 8, "#93c5fd", 0.5)],
  },
  // ── Geometric ──
  {
    id: "geo-triangles", name: "Corner triangles", category: "Geometric patterns", background: { type: "solid", color: "#ffffff" },
    decorate: (w, h) => {
      const s = Math.min(w, h) * 0.32;
      return [
        shape({ shape: "triangle", x: -s * 0.35, y: -s * 0.2, width: s, height: s * 0.8, fill: "#e0e7ff", rotation: 180 }),
        shape({ shape: "triangle", x: w - s * 0.65, y: h - s * 0.6, width: s, height: s * 0.8, fill: "#c7d2fe" }),
        shape({ shape: "triangle", x: w - s * 0.45, y: h - s * 0.4, width: s * 0.6, height: s * 0.5, fill: "#6366f1", opacity: 0.85 }),
      ];
    },
  },
  {
    id: "geo-hex", name: "Hexagon cluster", category: "Geometric patterns", background: { type: "solid", color: "#fafafa" },
    decorate: (w) => {
      const out: BrochureElement[] = [];
      const size = 16;
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4 - r; c += 1) {
        out.push(shape({ shape: "hexagon", x: w - 12 - (c + 1) * size * 0.92 - (r % 2) * size * 0.46, y: 6 + r * size * 0.8, width: size, height: size * 0.9, stroke: "#cbd5e1", strokeWidth: 0.35, fill: r === 0 && c === 1 ? "#e2e8f0" : "transparent" }));
      }
      return out;
    },
  },
  // ── Abstract gradients ──
  {
    id: "grad-indigo", name: "Indigo to violet", category: "Abstract gradients", background: { type: "solid", color: "#ffffff" },
    decorate: (w, h) => [
      shape({ shape: "ellipse", x: -w * 0.18, y: -h * 0.35, width: w * 0.55, height: h * 0.75, fill: "#6366f1", fillGradient: { from: "#6366f1", to: "#a855f7", direction: "diagonal" }, opacity: 0.18 }),
      shape({ shape: "ellipse", x: w * 0.7, y: h * 0.62, width: w * 0.45, height: h * 0.6, fill: "#ec4899", fillGradient: { from: "#a855f7", to: "#ec4899", direction: "diagonal" }, opacity: 0.16 }),
    ],
  },
  {
    id: "grad-sunrise", name: "Sunrise", category: "Abstract gradients", background: { type: "gradient", top: "#fff7ed", bottom: "#ffffff" },
    decorate: (w) => [shape({ x: 0, y: 0, width: w, height: 3, fill: "#f97316", fillGradient: { from: "#f59e0b", to: "#ef4444", direction: "horizontal" } })],
  },
  // ── Borders & ornamental ──
  {
    id: "ornate-classic", name: "Classic ornamental", category: "Borders & ornamental frames", background: { type: "solid", color: "#fffdf7" },
    decorate: (w, h) => [
      frame(w, h, 6, "#7c2d12", 2.2), frame(w, h, 9.5, "#7c2d12", 0.35), frame(w, h, 11, "#7c2d12", 0.35),
      ...cornerDiamonds(w, h, 9.5, 7, "#7c2d12"), ...cornerDiamonds(w, h, 9.5, 3.5, "#fffdf7"),
    ],
  },
  {
    id: "ornate-guilloche", name: "Dotted guilloché", category: "Borders & ornamental frames", background: { type: "solid", color: "#fbfaf6" },
    decorate: (w, h) => [frame(w, h, 7, "#1e3a5f", 0.8, { dash: "dotted" }), frame(w, h, 10, "#1e3a5f", 1.4), frame(w, h, 12.5, "#1e3a5f", 0.3, { dash: "dashed" })],
  },
  // ── Technology ──
  {
    id: "tech-grid", name: "Blueprint grid", category: "Technology", background: { type: "gradient", top: "#0b1220", bottom: "#0f172a" },
    decorate: (w, h) => {
      const out: BrochureElement[] = [];
      // Thin rectangles rather than line shapes: a line shape is always horizontal.
      for (let x = 15; x < w; x += 15) out.push(shape({ x, y: 0, width: 0.25, height: h, fill: "#1e293b" }));
      for (let y = 15; y < h; y += 15) out.push(shape({ x: 0, y, width: w, height: 0.25, fill: "#1e293b" }));
      out.push(shape({ x: 0, y: 0, width: 3, height: h, fill: "#22d3ee", fillGradient: { from: "#22d3ee", to: "#6366f1", direction: "vertical" } }));
      return out;
    },
  },
  {
    id: "tech-circuit", name: "Circuit lines", category: "Technology", background: { type: "solid", color: "#ffffff" },
    decorate: (w, h) => {
      const c = "#0ea5e9";
      return [
        shape({ x: w - 70, y: 18, width: 52, height: 0.6, fill: c }), shape({ x: w - 18, y: 18, width: 0.6, height: 30, fill: c }),
        shape({ shape: "ellipse", x: w - 19.6, y: 46.5, width: 3.2, height: 3.2, fill: c }),
        shape({ x: 18, y: h - 18, width: 60, height: 0.6, fill: c }), shape({ x: 18, y: h - 46, width: 0.6, height: 28, fill: c }),
        shape({ shape: "ellipse", x: 16.4, y: h - 48, width: 3.2, height: 3.2, fill: c }),
        shape({ x: 0, y: 0, width: w, height: 2, fill: c, fillGradient: { from: "#0ea5e9", to: "#8b5cf6", direction: "horizontal" } }),
      ];
    },
  },
];

export const findBackground = (id: string | null | undefined): BackgroundPreset | undefined => BACKGROUNDS.find((b) => b.id === id);
