/**
 * URLs from people (community posts, event pages, applications, sponsor and
 * vendor profiles, site content) go into href / src attributes. React 18
 * renders a `javascript:` URL there as-is, and clicking it runs script on
 * illuxus.com — where the signed-in session lives. Every such URL passes
 * through these helpers first.
 *
 * Allowed: http(s), mailto:, tel:, same-site paths ("/x") and anchors ("#x").
 * Refused: javascript:, data:, vbscript:, file:, protocol-relative "//host",
 * and anything unparseable.
 */

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function clean(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Browsers ignore leading/trailing whitespace and control characters in
  // URLs, so "  java\tscript:" must be judged the way the browser reads it.
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000- \u007f]+/g, (m, offset) => (offset === 0 ? "" : m)).trim();
  return s || null;
}

/** A URL safe to put in an `href`, or `undefined` (renders no link target). */
export function safeUrl(raw: unknown): string | undefined {
  const s = clean(raw);
  if (!s) return undefined;
  if (s.startsWith("#")) return s;
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) return s;
  try {
    const url = new URL(s);
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A URL safe for an `<iframe src>` / embed: https only. */
export function safeEmbedUrl(raw: unknown): string | undefined {
  const s = clean(raw);
  if (!s) return undefined;
  try {
    const url = new URL(s);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
