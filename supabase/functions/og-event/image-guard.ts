/**
 * og-event's guard on the images it fetches (QA audit F-12).
 *
 * The banner URL is whatever the organiser saved, and og-event is public, so
 * it must not become a way to make the server fetch anything it is handed.
 * Only images in this project's public Storage, where banner uploads go, are
 * fetched; redirects aren't followed; and an image is read and decoded only if
 * it is small enough to do so safely. Anything else gets the brand gradient.
 */

/** The largest image body read, and the largest image decoded. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 6000;
export const MAX_IMAGE_PIXELS = 24_000_000;

/** True for a public object in this project's Storage (`base` is SUPABASE_URL): the only images fetched. */
export function isOwnStorageUrl(raw: string, base: string | undefined): boolean {
  if (!base) return false;
  let url: URL;
  let own: URL;
  try {
    url = new URL(raw);
    own = new URL(base);
  } catch {
    return false;
  }
  return url.protocol === own.protocol && url.host === own.host && !url.username && !url.password &&
    (url.pathname.startsWith("/storage/v1/object/public/") || url.pathname.startsWith("/storage/v1/render/image/public/"));
}

/** A response body, read no further than `maxBytes`; null when larger. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * An image's width and height from its header, without decoding it: PNG,
 * JPEG, GIF and WebP. Null for anything else, or a header that doesn't parse.
 */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 4) === "PNG" && ascii(12, 16) === "IHDR") {
    return { width: u32be(16), height: u32be(20) };
  }
  if (b.length >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return { width: u16le(6), height: u16le(8) };
  }
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const chunk = ascii(12, 16);
    if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L" && b[20] === 0x2f) {
      return {
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    }
    if (chunk === "VP8X") return { width: 1 + u24le(24), height: 1 + u24le(27) };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; } // fill byte
      // Markers without a length: start of image, restart, TEM.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      // Start of frame (not DHT 0xC4, JPG 0xC8 or DAC 0xCC) holds the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  return null;
}

/** Whether an image of this size is safe to decode here. */
export function decodable(size: { width: number; height: number } | null): boolean {
  return !!size && size.width > 0 && size.height > 0 &&
    size.width <= MAX_IMAGE_SIDE && size.height <= MAX_IMAGE_SIDE &&
    size.width * size.height <= MAX_IMAGE_PIXELS;
}
