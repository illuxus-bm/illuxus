// Canonical public-facing origin for shareable links (attendee/speaker join
// URLs, event landing pages, welcome emails, password reset links, etc).
//
// Resolution order:
//   1. `import.meta.env.VITE_PUBLIC_ORIGIN` (e.g. `https://illuxus.com`) when
//      set — pins every share URL to a fixed canonical domain regardless of
//      where the dashboard is currently rendered.
//   2. `import.meta.env.VITE_PUBLIC_DOMAIN` — same purpose, alias kept for
//      consistency with the env var read by `event-routes.ts` and edge
//      function CORS allow-list.
//   3. Heuristic detection: if the dashboard is loaded from a recognised
//      *preview* host (Vercel branch deploy, Lovable sandbox), share links
//      are rewritten to `FALLBACK_ORIGIN` so emails/tickets always reach a
//      stable address. Production Vercel hosts and custom domains pass
//      through unchanged.
//   4. The current `window.location.origin` for ordinary cases.
//   5. Hardcoded `FALLBACK_ORIGIN` for SSR / non-browser contexts.
//
// To force every link onto a fixed domain (including production Vercel,
// previews, and localhost) set `VITE_PUBLIC_ORIGIN=https://illuxus.com` in
// your Vercel env. Setting it once is the cleanest fix and removes the need
// for the heuristic.

const FALLBACK_ORIGIN = "https://illuxus.com";

function envValue(key: string): string {
  // Cast through `unknown` so TypeScript doesn't whine about string indexing
  // a tightly-typed import.meta.env shape.
  const m = (import.meta as unknown as { env?: Record<string, string | undefined> });
  return (m.env?.[key] ?? "").toString().trim().replace(/\/+$/, "");
}

function envOrigin(): string {
  return envValue("VITE_PUBLIC_ORIGIN") || envValue("VITE_PUBLIC_DOMAIN");
}

/**
 * Detect hosts the organiser would never want a customer-facing share link to
 * point at: Vercel branch/preview deploys, Lovable sandboxes, etc.
 *
 * Vercel previews follow a `<project>-<hash>-<team>.vercel.app` shape with
 * many dashes in the leftmost label. The canonical production deployment is
 * just `<project>.vercel.app` (one or two dashes) or a custom domain.
 * Heuristic: any vercel.app host whose first label has 3+ dashes is a
 * preview, anything else (`illuxus.vercel.app`, `app-prod.vercel.app`) is
 * treated as production and passes through.
 */
function isPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.endsWith("lovableproject.com")) return true;
  if (h.includes("id-preview--"))      return true;
  if (h.endsWith("lovable.app"))       return true;
  if (h.endsWith(".vercel.app")) {
    const firstLabel = h.split(".")[0] || "";
    // `illuxus`, `app-prod` → production. `illuxus-n3neeyvgg-illuxus-projects` → preview.
    if (firstLabel.split("-").length >= 4) return true;
  }
  return false;
}

export function publicOrigin(): string {
  const explicit = envOrigin();
  if (explicit) {
    // Always honour env override — works in production, preview, and SSR.
    return explicit.startsWith("http") ? explicit : `https://${explicit}`;
  }
  if (typeof window === "undefined" || !window.location?.origin) {
    return FALLBACK_ORIGIN;
  }
  if (isPreviewHost(window.location.hostname)) {
    return FALLBACK_ORIGIN;
  }
  return window.location.origin;
}

export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${publicOrigin()}${p}`;
}
