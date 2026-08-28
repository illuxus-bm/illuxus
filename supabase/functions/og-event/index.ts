// deno-lint-ignore-file no-console
/* eslint-disable no-console */
/**
 * og-event — dynamic OG / Twitter share-card generator
 *
 * Renders a 1200×630 PNG share card per-event with:
 *   - the event's `banner_landscape_url` (fallback `image_url`, then a
 *     procedural brand gradient) cropped/resized cover-style
 *   - a dark gradient overlay (0% at the top → 60% at the bottom) so the
 *     foreground text always stays legible
 *   - the event title (wrapped to 2 lines) + date/location at top-left
 *   - the illuxus logo + "illuxus" wordmark in the bottom-right corner
 *
 * Powered by ImageScript (pure Deno — no native deps), so it deploys cleanly
 * on Supabase Edge Runtime.
 *
 * Inputs (query params): `?id=<uuid>` OR `?slug=<event-slug>` (optionally
 * combined with `&orgSlug=<org>`). Returns a 200 PNG always — on any error
 * we render a generic illuxus-branded card rather than fail the crawler.
 *
 * Caching: `Cache-Control: public, max-age=86400, immutable` (1 day).
 * `verify_jwt = false` in supabase/config.toml so social crawlers can hit
 * it anonymously.
 *
 * The function intentionally uses `console.*` because it runs on Deno Edge,
 * not in the browser app where the project's `logger` is mandated.
 */

import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const W = 1200;
const H = 630;

const PAD = 64; // outer padding for title block
const WATERMARK_PAD = 32; // padding for the bottom-right watermark
const LOGO_SIZE = 36; // px
const WORDMARK_SIZE = 28; // px

// Brand palette (used for the procedural fallback gradient).
const BRAND_TOP = { r: 124, g: 58, b: 237 }; // violet-600
const BRAND_BOTTOM = { r: 17, g: 24, b: 39 }; // gray-900

// CDN-hosted Inter SemiBold. We try a few sources in order — the first one
// that responds wins, then the bytes get pinned to module scope.
const FONT_URLS = [
  // Google Fonts static TTF mirror (most stable).
  "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.ttf",
  // GitHub raw fallback (rsms/inter is the upstream repo).
  "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-SemiBold.ttf",
  // jsDelivr mirror of the same.
  "https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-SemiBold.ttf",
];

// Brand logo — fetched once per cold-start.
const LOGO_URLS = [
  "https://illuxus.com/favicon-192.png",
  "https://www.illuxus.com/favicon-192.png",
];

// ---------------------------------------------------------------------------
// Module-scope caches (warm between invocations in the same isolate)
// ---------------------------------------------------------------------------

let fontCache: Uint8Array | null = null;
let logoCache: Image | null = null;
let fallbackCache: Uint8Array | null = null;

async function loadFont(): Promise<Uint8Array | null> {
  if (fontCache) return fontCache;
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength < 1000) continue; // too small to be a real font
      fontCache = buf;
      return buf;
    } catch (_) {
      // try next mirror
    }
  }
  console.warn("og-event: failed to load font from all mirrors");
  return null;
}

async function loadLogo(): Promise<Image | null> {
  if (logoCache) return logoCache;
  for (const url of LOGO_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      const img = await Image.decode(buf);
      logoCache = img.resize(LOGO_SIZE, LOGO_SIZE);
      return logoCache;
    } catch (_) {
      // try next mirror
    }
  }
  console.warn("og-event: failed to load brand logo");
  return null;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Pack four 0–255 channel values into ImageScript's 0xRRGGBBAA color. */
const rgba = (r: number, g: number, b: number, a: number): number =>
  ((r & 0xff) << 24 | (g & 0xff) << 16 | (b & 0xff) << 8 | (a & 0xff)) >>> 0;

const WHITE = rgba(255, 255, 255, 255);
const WHITE_80 = rgba(255, 255, 255, 204);

/** Resize `src` to `cover` the target rect — crop the overflowing axis. */
function coverCrop(src: Image, targetW: number, targetH: number): Image {
  const sw = src.width;
  const sh = src.height;
  if (sw === 0 || sh === 0) return new Image(targetW, targetH);
  const srcAspect = sw / sh;
  const dstAspect = targetW / targetH;
  let cropW = sw;
  let cropH = sh;
  let cropX = 0;
  let cropY = 0;
  if (srcAspect > dstAspect) {
    // Source is wider than target — crop sides.
    cropW = Math.round(sh * dstAspect);
    cropX = Math.floor((sw - cropW) / 2);
  } else {
    // Source is taller than target — crop top/bottom.
    cropH = Math.round(sw / dstAspect);
    cropY = Math.floor((sh - cropH) / 2);
  }
  // ImageScript mutates in place + returns this.
  return src.crop(cropX, cropY, cropW, cropH).resize(targetW, targetH);
}

/** Brand-coloured procedural gradient used for the fallback canvas. */
function brandGradient(w: number, h: number): Image {
  const img = new Image(w, h);
  const bm = img.bitmap;
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = Math.round(BRAND_TOP.r + (BRAND_BOTTOM.r - BRAND_TOP.r) * t);
    const g = Math.round(BRAND_TOP.g + (BRAND_BOTTOM.g - BRAND_TOP.g) * t);
    const b = Math.round(BRAND_TOP.b + (BRAND_BOTTOM.b - BRAND_TOP.b) * t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      bm[i] = r;
      bm[i + 1] = g;
      bm[i + 2] = b;
      bm[i + 3] = 255;
    }
  }
  return img;
}

/** Black overlay whose alpha ramps from 0 at the top to ~60% at the bottom. */
function bottomGradientOverlay(w: number, h: number): Image {
  const img = new Image(w, h);
  const bm = img.bitmap;
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const alpha = Math.round(t * 0.6 * 255);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      bm[i] = 0;
      bm[i + 1] = 0;
      bm[i + 2] = 0;
      bm[i + 3] = alpha;
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Word-wrap `text` to at most `maxLines` lines of roughly `maxChars` chars.
 * If the text overflows the line budget the last line is truncated with an
 * ellipsis. Pure character-count heuristic — good enough for OG cards.
 */
function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = w;
    } else {
      // Word longer than maxChars — hard-split.
      lines.push(w.slice(0, maxChars));
      current = "";
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  // If we still have words left over, ellipsize the last line.
  const consumed = lines.join(" ");
  if (consumed.length < clean.length && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? `${last.slice(0, Math.max(1, maxChars - 1))}…` : `${last}…`;
  }
  return lines;
}

/** Render a string as an Image via ImageScript. Returns null if no font. */
function renderText(font: Uint8Array | null, size: number, text: string, color: number): Image | null {
  if (!font || !text) return null;
  try {
    return Image.renderText(font, size, text, color);
  } catch (err) {
    console.warn("og-event: renderText failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------

/** Stamp the illuxus logo + "illuxus" wordmark into the bottom-right corner. */
async function drawWatermark(canvas: Image, font: Uint8Array | null): Promise<void> {
  const logo = await loadLogo();
  const wordmark = renderText(font, WORDMARK_SIZE, "illuxus", WHITE);

  const logoW = logo ? logo.width : 0;
  const logoH = logo ? logo.height : 0;
  const wmW = wordmark ? wordmark.width : 0;
  const wmH = wordmark ? wordmark.height : 0;
  const gap = logo && wordmark ? 12 : 0;

  const totalW = logoW + gap + wmW;
  const totalH = Math.max(logoH, wmH);
  if (totalW === 0 || totalH === 0) return;

  const xStart = W - WATERMARK_PAD - totalW;
  const yStart = H - WATERMARK_PAD - totalH;

  if (logo) {
    const logoY = yStart + Math.floor((totalH - logoH) / 2);
    canvas.composite(logo, xStart, logoY);
  }
  if (wordmark) {
    const wmY = yStart + Math.floor((totalH - wmH) / 2);
    canvas.composite(wordmark, xStart + logoW + gap, wmY);
  }
}

// ---------------------------------------------------------------------------
// Banner sourcing
// ---------------------------------------------------------------------------

/** Try a list of image URLs in order. First successful decode wins. */
async function tryDecode(urls: (string | null | undefined)[]): Promise<Image | null> {
  for (const url of urls) {
    if (!url) continue;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "illuxus-og-bot/1.0" },
      });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) continue;
      return await Image.decode(buf);
    } catch (_) {
      // try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date / location helpers (Deno-side; no app code reuse)
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateInTZ(iso: string | null, tz: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const zone = tz && isValidTz(tz) ? tz : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const wkday = get("weekday");
    const mo = get("month");
    const day = get("day");
    const hr = get("hour");
    const min = get("minute");
    const dp = get("dayPeriod");
    return `${wkday}, ${mo} ${day} · ${hr}:${min} ${dp}`;
  } catch {
    const mo = MONTHS_SHORT[d.getUTCMonth()];
    return `${mo} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Card composition
// ---------------------------------------------------------------------------

interface EventBits {
  title: string;
  banner: string | null;
  fallbackBanner: string | null;
  dateLine: string;
  locationLine: string;
}

async function composeCard(bits: EventBits): Promise<Uint8Array> {
  const font = await loadFont();

  // 1. Build the base canvas from the event's banner (or fallback gradient).
  const banner = await tryDecode([bits.banner, bits.fallbackBanner]);
  const base = banner ? coverCrop(banner, W, H) : brandGradient(W, H);

  // 2. Darken the bottom half so the text + watermark stay legible.
  const overlay = bottomGradientOverlay(W, H);
  base.composite(overlay, 0, 0);

  // 3. Title block — wrapped to 2 lines, sits in the lower-left of the card.
  const titleLines = wrapText(bits.title || "Event on illuxus", 32, 2);
  const TITLE_SIZE = 72;
  const TITLE_LINE_H = Math.round(TITLE_SIZE * 1.15);
  // Compute y so the whole title + metadata stack ends ~PAD from the bottom.
  const META_SIZE = 28;
  const META_LINE_H = Math.round(META_SIZE * 1.3);
  const metaCount = (bits.dateLine ? 1 : 0) + (bits.locationLine ? 1 : 0);
  const stackHeight = titleLines.length * TITLE_LINE_H + metaCount * META_LINE_H + (metaCount > 0 ? 24 : 0);
  let cursorY = H - PAD - stackHeight;

  for (const line of titleLines) {
    const img = renderText(font, TITLE_SIZE, line, WHITE);
    if (img) base.composite(img, PAD, cursorY);
    cursorY += TITLE_LINE_H;
  }

  if (metaCount > 0) cursorY += 12;
  for (const line of [bits.dateLine, bits.locationLine].filter(Boolean)) {
    const img = renderText(font, META_SIZE, line, WHITE_80);
    if (img) base.composite(img, PAD, cursorY);
    cursorY += META_LINE_H;
  }

  // 4. Bottom-right watermark.
  await drawWatermark(base, font);

  // 5. Encode PNG.
  return await base.encode();
}

async function renderFallbackCard(): Promise<Uint8Array> {
  if (fallbackCache) return fallbackCache;
  const bytes = await composeCard({
    title: "Events on illuxus",
    banner: null,
    fallbackBanner: null,
    dateLine: "Branded event pages, ticketing, check-in, webinars.",
    locationLine: "",
  });
  fallbackCache = bytes;
  return bytes;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const PNG_HEADERS: Record<string, string> = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=86400, immutable",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Accept",
};

function pngResponse(body: Uint8Array, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { ...PNG_HEADERS, ...extraHeaders } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: PNG_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");
    const orgSlug = url.searchParams.get("orgSlug");

    if (!id && !slug) {
      const png = await renderFallbackCard();
      return pngResponse(png, { "X-OG-Reason": "missing-id-or-slug" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Query by id OR slug. When both id and slug are present, id wins.
    let query = supabase
      .from("events")
      .select(
        "id, title, slug, date, end_date, venue, location, banner_landscape_url, image_url, timezone, status, org_id",
      )
      .limit(1);
    if (id) {
      query = query.eq("id", id);
    } else if (slug) {
      query = query.eq("slug", slug);
    }

    const { data: event, error } = await query.maybeSingle();
    if (error || !event) {
      console.warn("og-event: event lookup failed", { id, slug, orgSlug, error: error?.message });
      const png = await renderFallbackCard();
      return pngResponse(png, { "X-OG-Reason": "event-not-found" });
    }

    // This endpoint is deliberately anonymous (`verify_jwt = false`) so social
    // crawlers can render link previews, and it queries with the service-role
    // key, which bypasses the `events` RLS policy that would normally hide
    // unpublished rows. Without this guard, anyone could read a draft event's
    // title, date, venue and banner by guessing or scraping its id/slug.
    // Render the generic fallback card instead of leaking pre-announcement
    // details. `completed` events stay renderable so old shared links keep
    // their preview after the event ends.
    if (event.status !== "published" && event.status !== "completed") {
      console.warn("og-event: refusing to render unpublished event", {
        id: event.id,
        status: event.status,
      });
      const png = await renderFallbackCard();
      return pngResponse(png, { "X-OG-Reason": "event-not-public" });
    }

    // Pull org name (purely cosmetic — failure is fine, falls back to "illuxus").
    let orgName = "illuxus";
    if (event.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", event.org_id)
        .maybeSingle();
      if (org?.name) orgName = org.name;
    }

    const dateLine = formatDateInTZ(event.date, event.timezone);
    const locationLine = [event.venue, event.location]
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .join(" · ");

    const png = await composeCard({
      title: event.title || "Untitled event",
      banner: event.banner_landscape_url ?? null,
      fallbackBanner: event.image_url ?? null,
      dateLine: dateLine ? `${dateLine}` : "",
      locationLine: locationLine || `by ${orgName}`,
    });
    return pngResponse(png, { "X-OG-Event": event.id });
  } catch (err) {
    // The crawler should NEVER see a 5xx — we always serve a branded image.
    console.error("og-event: unexpected failure", err);
    try {
      const png = await renderFallbackCard();
      return pngResponse(png, { "X-OG-Reason": "exception" });
    } catch (innerErr) {
      console.error("og-event: fallback render also failed", innerErr);
      // Last-resort 1x1 transparent PNG so we still return an image.
      const onePx = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
        0x42, 0x60, 0x82,
      ]);
      return pngResponse(onePx, { "X-OG-Reason": "fatal" });
    }
  }
});
