// Canonical public-facing origin for shareable links (attendee/speaker join URLs,
// event landing pages, etc). Falls back to the current origin in dev/staging so
// localhost still works, but in production we always hand out the branded domain
// instead of a lovable.app preview URL.
const PRODUCTION_ORIGIN = "https://illuxus.com";

export function publicOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return window.location.origin;
  }
  return PRODUCTION_ORIGIN;
}

export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${publicOrigin()}${p}`;
}
