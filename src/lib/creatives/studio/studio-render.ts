/**
 * Rendering for the Creative Studio: sizes, asset loading and turning a
 * design + palette + content into pixels.
 *
 * The on-screen preview and the downloaded PNG are drawn by the same
 * `renderStudio` call at different pixel sizes, so what you see is what you
 * export.
 */
import { ensureWebFont } from "@/lib/webfonts";
import type { StudioDesign } from "./studio-designs";
import { shapeOf, type AuditBox, type FontPair, type Img, type Scene, type StudioAssets, type StudioContent } from "./studio-draw";
import type { StudioPalette } from "./studio-palette";

export interface StudioSize {
  id: string;
  name: string;
  /** Where this size is typically used. */
  hint: string;
  width: number;
  height: number;
}

export const STUDIO_SIZES: StudioSize[] = [
  { id: "square", name: "Square", hint: "Instagram · LinkedIn · WhatsApp", width: 1080, height: 1080 },
  { id: "portrait", name: "Portrait", hint: "Instagram feed 4:5", width: 1080, height: 1350 },
  { id: "story", name: "Story", hint: "Stories · Reels · Status", width: 1080, height: 1920 },
  { id: "landscape", name: "Landscape", hint: "LinkedIn · X · Facebook", width: 1200, height: 628 },
  { id: "wide", name: "Wide 16:9", hint: "Slides · YouTube · screens", width: 1920, height: 1080 },
];

export const sizeById = (id: string) => STUDIO_SIZES.find((s) => s.id === id) ?? STUDIO_SIZES[0];

export interface StudioSpec {
  design: StudioDesign;
  palette: StudioPalette;
  fonts: FontPair;
  content: StudioContent;
  assets: StudioAssets;
}

const imageCache = new Map<string, Promise<Img | null>>();

/**
 * Load an image for drawing. Requested with CORS so the canvas stays
 * exportable; resolves null (never rejects) when it can't be loaded, and the
 * design falls back to its no-image look.
 */
export function loadStudioImage(url: string | null | undefined): Promise<Img | null> {
  const src = (url ?? "").trim();
  if (!src) return Promise.resolve(null);
  const hit = imageCache.get(src);
  if (hit) return hit;
  const p = new Promise<Img | null>((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

/** Make sure the pair's fonts are ready before measuring any text. */
export async function ensureStudioFonts(fonts: FontPair): Promise<void> {
  try {
    const body = [500, 600, 700];
    // One request per family, carrying every weight the designs use.
    await Promise.all(
      fonts.display === fonts.body
        ? [ensureWebFont(fonts.body, [...body, fonts.displayWeight])]
        : [ensureWebFont(fonts.display, [fonts.displayWeight]), ensureWebFont(fonts.body, body)],
    );
  } catch {
    /* fall back to system fonts rather than block the render */
  }
}

/**
 * Draw `spec` at `width` × `height` design pixels onto `canvas`. `pixelRatio`
 * scales the backing store (use < 1 for a light on-screen preview, 1 for
 * export) without changing the composition.
 */
export function renderStudio(canvas: HTMLCanvasElement, spec: StudioSpec, width: number, height: number, pixelRatio = 1, audit?: AuditBox[]): void {
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  const shape = shapeOf(width, height);
  // The unit follows the shorter side; wide and tall canvases get a little
  // more so type stays comfortably readable in a feed thumbnail.
  const u = (Math.min(width, height) / 100) * (shape === "wide" ? 1.22 : shape === "tall" ? 1.1 : 1);
  const scene: Scene = {
    ctx, w: width, h: height, u, shape,
    m: u * (shape === "wide" ? 7.5 : 7),
    p: spec.palette, f: spec.fonts, t: spec.content, a: spec.assets,
    k: spec.design.kit, audit,
  };
  ctx.save();
  spec.design.draw(scene);
  ctx.restore();
}

/** Render at full size and return a PNG. */
export async function exportStudioPng(spec: StudioSpec, size: StudioSize): Promise<Blob> {
  await ensureStudioFonts(spec.fonts);
  const canvas = document.createElement("canvas");
  renderStudio(canvas, spec, size.width, size.height, 1);
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the image."))), "image/png");
    } catch (e) {
      // A cross-origin image without CORS headers taints the canvas.
      reject(e instanceof Error ? e : new Error("Couldn't create the image."));
    }
  });
}

export const studioFilename = (parts: (string | null | undefined)[], size: StudioSize) =>
  [...parts, size.id]
    .map((p) => (p ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-")
    .slice(0, 90) + ".png";

/** "16 Oct 2026" in the event's timezone. */
export function formatStudioDate(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, ...(timezone ? { timeZone: timezone } : {}) }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", opts).format(d);
  }
}
