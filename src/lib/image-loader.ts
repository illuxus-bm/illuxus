/**
 * Image loading for canvas rendering, with fallbacks.
 *
 * Anything drawn on a canvas that will later be exported has to be loaded
 * with CORS, or the browser marks the canvas "tainted" and refuses to read it
 * back. The obvious loader — `crossOrigin = "anonymous"`, give up on error —
 * loses images in two ordinary situations:
 *
 *   1. The same URL was shown earlier in a plain `<img>` (an avatar in a
 *      list, say). The browser cached that response without CORS headers and
 *      answers the CORS request from the cache, which then fails even though
 *      the server would have allowed it.
 *   2. The image is hosted somewhere that sends no CORS headers at all.
 *
 * In both cases the image simply vanished from brochures and creatives. Here
 * a failed CORS load is retried past the cache, and if that fails too the
 * image is loaded without CORS so it can at least be *shown*; `exportable`
 * says whether it is safe to draw on a canvas that will be exported.
 */
export interface LoadedImage {
  image: HTMLImageElement;
  /** `false` when the host blocks cross-origin reads: fine to display, but
   *  drawing it taints a canvas so it cannot be exported. */
  exportable: boolean;
}

function attempt(url: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** `url` with a parameter that makes it a different cache entry. Pure. */
export function cacheBustedUrl(url: string): string {
  const [base, hash = ""] = url.split("#");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}cors=1${hash ? `#${hash}` : ""}`;
}

/** `true` for URLs that are same-origin by construction and never need CORS. */
export function isInlineImageUrl(url: string): boolean {
  return url.startsWith("data:") || url.startsWith("blob:");
}

const cache = new Map<string, Promise<LoadedImage | null>>();

async function load(url: string): Promise<LoadedImage | null> {
  if (isInlineImageUrl(url)) {
    const image = await attempt(url, false);
    return image ? { image, exportable: true } : null;
  }
  const direct = await attempt(url, true);
  if (direct) return { image: direct, exportable: true };
  const pastCache = await attempt(cacheBustedUrl(url), true);
  if (pastCache) return { image: pastCache, exportable: true };
  const displayOnly = await attempt(url, false);
  return displayOnly ? { image: displayOnly, exportable: false } : null;
}

/**
 * Loads `url` for drawing. Never rejects: resolves `null` only when the image
 * cannot be loaded at all. Results are shared between callers; a failure is
 * not cached, so a later attempt (the network came back) starts afresh.
 */
export function loadCanvasImage(url: string): Promise<LoadedImage | null> {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return cached;
  const promise = load(url).then((result) => {
    if (!result) cache.delete(url);
    return result;
  });
  cache.set(url, promise);
  return promise;
}

/** Test seam — forgets every cached image. */
export function __resetCanvasImageCacheForTests(): void {
  cache.clear();
}
