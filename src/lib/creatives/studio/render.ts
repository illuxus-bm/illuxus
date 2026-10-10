/**
 * Canvas renderer for creative studio scenes.
 *
 * The only module in the studio that touches a canvas. `renderScene` waits
 * for every font and image a scene needs before drawing, so the PNG it
 * produces never contains fallback type or half-loaded photos.
 */
import { ensureWebFont } from "@/lib/webfonts";

import type { Fill, IconNode, ImageNode, Radius, Scene, SceneNode, TextNode } from "./scene";

// ─── Text layout ─────────────────────────────────────────────────────────────

export interface TextLayout {
  size: number;
  lines: string[];
}

/** Width of `text` at the font currently set on the context. */
export type MeasureFn = (text: string) => number;

function wrapLines(text: string, maxWidth: number, measure: MeasureFn): { lines: string[]; overflow: boolean } {
  const lines: string[] = [];
  let overflow = false;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
      if (measure(line) > maxWidth) overflow = true;
    }
    lines.push(line);
  }
  return { lines, overflow };
}

function ellipsize(line: string, maxWidth: number, measure: MeasureFn): string {
  let out = line;
  while (out.length > 1 && measure(`${out}…`) > maxWidth) out = out.slice(0, -1).trimEnd();
  return `${out}…`;
}

/**
 * Finds the largest size (≤ `node.size`, ≥ `node.minSize`) at which the text
 * wraps inside the node's box, and the lines it wraps to. If it still doesn't
 * fit at the minimum, the last visible line is ellipsized — text is never
 * drawn outside its box, which is what keeps a long speaker name or venue
 * from running over its neighbours.
 *
 * `measureAt(size)` returns a measurer for that size; injected so this stays
 * testable without a canvas.
 */
export function layoutText(node: TextNode, measureAt: (size: number) => MeasureFn): TextLayout {
  const lineHeight = node.lineHeight ?? 1.2;
  const minSize = Math.min(node.size, node.minSize ?? node.size * 0.5);
  const linesThatFit = (size: number): number => {
    const byHeight = Math.max(1, Math.floor((node.h + size * 0.25) / (size * lineHeight)));
    return node.maxLines ? Math.min(node.maxLines, byHeight) : byHeight;
  };

  let size = node.size;
  for (;;) {
    const measure = measureAt(size);
    const { lines, overflow } = wrapLines(node.text, node.w, measure);
    const allowed = linesThatFit(size);
    if (!overflow && lines.length <= allowed) return { size, lines };
    if (size <= minSize) {
      const kept = lines.slice(0, allowed);
      const last = kept.length - 1;
      if (lines.length > allowed || measure(kept[last]) > node.w) {
        kept[last] = ellipsize(kept[last], node.w, measure);
      }
      return { size, lines: kept };
    }
    size = Math.max(minSize, size * 0.95);
  }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function fontString(node: Pick<TextNode, "family" | "weight" | "italic">, size: number): string {
  return `${node.italic ? "italic " : ""}${node.weight} ${size}px "${node.family}", system-ui, sans-serif`;
}

function resolveFill(ctx: Ctx, fill: Fill, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (typeof fill === "string") return fill;
  const gradient =
    fill.type === "linear"
      ? ctx.createLinearGradient(x + fill.from[0] * w, y + fill.from[1] * h, x + fill.to[0] * w, y + fill.to[1] * h)
      : ctx.createRadialGradient(
          x + fill.center[0] * w,
          y + fill.center[1] * h,
          0,
          x + fill.center[0] * w,
          y + fill.center[1] * h,
          fill.radius * Math.max(w, h),
        );
  for (const [offset, color] of fill.stops) gradient.addColorStop(offset, color);
  return gradient;
}

function tracePath(ctx: Ctx, x: number, y: number, w: number, h: number, radius: Radius | undefined): void {
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (Array.isArray(radius) ? radius : Array(4).fill(radius ?? 0)).map((r: number) =>
    Math.max(0, Math.min(r, limit * 2, w, h)),
  );
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function drawText(ctx: Ctx, node: TextNode): void {
  if (!node.text.trim()) return;
  const spacing = node.letterSpacing ?? 0;
  const spaced = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in spaced) spaced.letterSpacing = `${spacing}px`;

  const { size, lines } = layoutText(node, (s) => {
    ctx.font = fontString(node, s);
    return (text) => ctx.measureText(text).width;
  });
  ctx.font = fontString(node, size);

  const lineHeight = size * (node.lineHeight ?? 1.2);
  const blockHeight = lines.length * lineHeight;
  const valign = node.valign ?? "top";
  const top = valign === "middle" ? node.y + (node.h - blockHeight) / 2 : valign === "bottom" ? node.y + node.h - blockHeight : node.y;

  const align = node.align ?? "left";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  // Letter spacing trails the last glyph, which pulls centred and
  // right-aligned text off by half / all of one gap.
  const anchorX = align === "center" ? node.x + node.w / 2 + spacing / 2 : align === "right" ? node.x + node.w + spacing : node.x;

  if (node.shadow) {
    ctx.shadowColor = node.shadow.color;
    ctx.shadowBlur = node.shadow.blur;
    ctx.shadowOffsetX = node.shadow.offsetX;
    ctx.shadowOffsetY = node.shadow.offsetY;
  }
  ctx.fillStyle = resolveFill(ctx, node.color, node.x, top, node.w, blockHeight);
  lines.forEach((line, i) => ctx.fillText(line, anchorX, top + lineHeight * (i + 0.5)));
  if ("letterSpacing" in spaced) spaced.letterSpacing = "0px";
}

function drawImage(ctx: Ctx, node: ImageNode, image: HTMLImageElement | null): void {
  const clip = (): void => {
    if (node.circle) {
      ctx.beginPath();
      ctx.ellipse(node.x + node.w / 2, node.y + node.h / 2, node.w / 2, node.h / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else {
      tracePath(ctx, node.x, node.y, node.w, node.h, node.radius);
    }
    ctx.clip();
  };

  if (!image) {
    if (!node.fallback) return;
    clip();
    ctx.fillStyle = resolveFill(ctx, node.fallback.background, node.x, node.y, node.w, node.h);
    ctx.fillRect(node.x, node.y, node.w, node.h);
    const size = Math.min(node.w, node.h) * 0.34;
    ctx.font = `600 ${size}px "${node.fallback.family}", system-ui, sans-serif`;
    ctx.fillStyle = node.fallback.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.fallback.initials, node.x + node.w / 2, node.y + node.h / 2);
    return;
  }

  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) return;

  if (node.fit === "contain") {
    const scale = Math.min(node.w / iw, node.h / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(image, node.x + (node.w - w) / 2, node.y + (node.h - h) / 2, w, h);
    return;
  }

  clip();
  const scale = Math.max(node.w / iw, node.h / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(image, node.x + (node.w - w) / 2, node.y + (node.h - h) * (node.focalY ?? 0.5), w, h);
}

/** Icons are authored on a 24-unit grid, like the Lucide set they follow. */
function drawIcon(ctx: Ctx, node: IconNode): void {
  ctx.translate(node.x, node.y);
  ctx.scale(node.size / 24, node.size / 24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = node.color;
  ctx.fillStyle = node.color;

  switch (node.name) {
    case "pin":
      ctx.fill(
        new Path2D(
          "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z",
        ),
        "evenodd",
      );
      break;
    case "check-circle":
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.stroke(new Path2D("M8 12.4l2.8 2.8L16 9.6"));
      break;
    case "play-circle":
      ctx.beginPath();
      ctx.arc(12, 12, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = node.color2 ?? "#ffffff";
      ctx.fill(new Path2D("M9.6 7.4l7.2 4.6-7.2 4.6z"));
      break;
    case "link":
      ctx.lineWidth = 2.6;
      ctx.stroke(new Path2D("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"));
      ctx.stroke(new Path2D("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"));
      break;
    case "chevron-up":
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "miter";
      ctx.stroke(new Path2D("M2 17l10-10 10 10-2.6 2.6L12 12.2l-7.4 7.4z"));
      break;
  }
}

function drawNode(ctx: Ctx, node: SceneNode, images: Map<string, HTMLImageElement | null>): void {
  switch (node.kind) {
    case "rect": {
      tracePath(ctx, node.x, node.y, node.w, node.h, node.radius);
      if (node.fill) {
        if (node.shadow) {
          ctx.shadowColor = node.shadow.color;
          ctx.shadowBlur = node.shadow.blur;
          ctx.shadowOffsetX = node.shadow.offsetX;
          ctx.shadowOffsetY = node.shadow.offsetY;
        }
        ctx.fillStyle = resolveFill(ctx, node.fill, node.x, node.y, node.w, node.h);
        ctx.fill();
        ctx.shadowColor = "transparent";
      }
      if (node.stroke && node.strokeWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(node.cx, node.cy, node.rx, node.ry, 0, 0, Math.PI * 2);
      if (node.fill) {
        ctx.fillStyle = resolveFill(ctx, node.fill, node.cx - node.rx, node.cy - node.ry, node.rx * 2, node.ry * 2);
        ctx.fill();
      }
      if (node.stroke && node.strokeWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case "image":
      drawImage(ctx, node, node.src ? (images.get(node.src) ?? null) : null);
      break;
    case "text":
      drawText(ctx, node);
      break;
    case "line":
      ctx.beginPath();
      ctx.moveTo(node.x1, node.y1);
      ctx.lineTo(node.x2, node.y2);
      ctx.strokeStyle = node.color;
      ctx.lineWidth = node.width;
      ctx.lineCap = node.round ? "round" : "butt";
      ctx.setLineDash(node.dash ?? []);
      ctx.stroke();
      break;
    case "dots":
      ctx.fillStyle = node.color;
      for (let row = 0; row < node.rows; row += 1) {
        for (let col = 0; col < node.cols; col += 1) {
          ctx.beginPath();
          ctx.arc(node.x + col * node.gap, node.y + row * node.gap, node.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "icon":
      drawIcon(ctx, node);
      break;
  }
}

/** Draws `scene` onto `ctx`, which must be at least `scene.width × scene.height`. */
export function drawScene(ctx: Ctx, scene: Scene, images: Map<string, HTMLImageElement | null>): void {
  ctx.save();
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.restore();
  for (const node of scene.nodes) {
    ctx.save();
    drawNode(ctx, node, images);
    ctx.restore();
  }
}

// ─── Asset loading ───────────────────────────────────────────────────────────

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * Loads an image for canvas drawing. `crossOrigin` is set so photos served
 * from Supabase Storage don't taint the canvas (a tainted canvas can't be
 * exported). Never rejects: a photo that fails to load resolves `null` and
 * the node draws its fallback instead.
 */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(url);
      resolve(null);
    };
    img.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

/** Every `(family, weights)` a scene's text needs. Pure. */
export function sceneFonts(scene: Scene): Array<{ family: string; weights: number[] }> {
  const byFamily = new Map<string, Set<number>>();
  const add = (family: string, weight: number): void => {
    byFamily.set(family, (byFamily.get(family) ?? new Set<number>()).add(weight));
  };
  for (const node of scene.nodes) {
    if (node.kind === "text") add(node.family, node.weight);
    if (node.kind === "image" && node.fallback) add(node.fallback.family, 600);
  }
  return [...byFamily.entries()].map(([family, weights]) => ({ family, weights: [...weights].sort((a, b) => a - b) }));
}

/** Every image URL a scene references. Pure. */
export function sceneImageUrls(scene: Scene): string[] {
  const urls = new Set<string>();
  for (const node of scene.nodes) if (node.kind === "image" && node.src) urls.add(node.src);
  return [...urls];
}

/**
 * `ensureWebFont` loads a family once and ignores the weights of later calls,
 * so each family is always requested with every weight any template uses —
 * otherwise whichever scene rendered first would decide which weights exist.
 */
const FAMILY_WEIGHTS: Record<string, number[]> = {
  Barlow: [400, 500, 600, 700, 800],
  Merriweather: [400, 700, 900],
  Poppins: [300, 400, 500, 600, 700, 800],
  "Great Vibes": [400],
  Anton: [400],
};

async function loadSceneAssets(scene: Scene): Promise<Map<string, HTMLImageElement | null>> {
  const urls = sceneImageUrls(scene);
  const [loaded] = await Promise.all([
    Promise.all(urls.map((url) => loadImage(url))),
    Promise.all(sceneFonts(scene).map(({ family, weights }) => ensureWebFont(family, FAMILY_WEIGHTS[family] ?? weights))),
  ]);
  return new Map(urls.map((url, i) => [url, loaded[i]]));
}

/**
 * Renders `scene` into `canvas` (created when omitted) at `scale` × its
 * natural size — 1 for export, less for thumbnails.
 */
export async function renderScene(scene: Scene, canvas?: HTMLCanvasElement, scale = 1): Promise<HTMLCanvasElement> {
  const images = await loadSceneAssets(scene);
  const target = canvas ?? document.createElement("canvas");
  target.width = Math.round(scene.width * scale);
  target.height = Math.round(scene.height * scale);
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawScene(ctx, scene, images);
  return target;
}

/** Renders `scene` at full size and encodes it as a PNG. */
export async function renderSceneToBlob(scene: Scene): Promise<Blob> {
  const canvas = await renderScene(scene);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}
