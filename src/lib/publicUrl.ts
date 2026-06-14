// Canonical public-facing origin for shareable links (attendee/speaker join URLs,
// event landing pages, etc).
//
// Resolution order:
//   1. `import.meta.env.VITE_PUBLIC_ORIGIN` (e.g. `https://illuxus.com`) when set
//      — used to pin every share URL to a fixed canonical domain regardless of
//      which Vercel preview / staging host the dashboard is rendered on.
//   2. The current `window.location.origin` — works correctly on production,
//      preview deploys, and localhost without configuration.
//   3. Hardcoded `https://illuxus.com` for SSR / non-browser contexts only.
//
// We intentionally do NOT prefer a hardcoded production domain over
// `window.location.origin`. If you copy a link while on a Vercel preview
// deployment, you get a preview link — that is the correct behavior. To force
// every link onto the production domain, set `VITE_PUBLIC_ORIGIN` in the
// production env.

const FALLBACK_ORIGIN = "https://illuxus.com";

function envOrigin(): string {
  const raw = import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined;
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export function publicOrigin(): string {
  const env = envOrigin();
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return FALLBACK_ORIGIN;
}

export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${publicOrigin()}${p}`;
}
