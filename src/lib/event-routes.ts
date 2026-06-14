/**
 * Centralized helpers for building public event URLs and detecting routing
 * anomalies (e.g. UUIDs leaking into the URL after a slug edit).
 *
 * Use `eventPublicPath(event)` everywhere a link to an event is rendered so
 * we never accidentally regress to UUID-based URLs.
 */

import { logger } from "@/lib/observability";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

export interface EventLike {
  id: string;
  slug?: string | null;
}

/** Build the canonical public path for an event. Always prefers the slug. */
export function eventPublicPath(event: EventLike, orgSlug?: string | null): string {
  const identifier = event.slug && event.slug.length > 0 ? event.slug : event.id;
  // Luma-style path: /org/<orgSlug>/events/<eventSlug>.
  // e.g. illuxus.com/org/averance/events/ai-workshop
  if (orgSlug) return `/org/${orgSlug}/events/${identifier}`;
  return `/events/${identifier}`;
}

/** Build the canonical dashboard path for an event. */
export function eventDashboardPath(event: EventLike): string {
  return `/dashboard/events/${event.slug || event.id}`;
}

// ─── Public absolute URL builder ───────────────────────────────────────────

/**
 * Optional pinned public host. When set (`VITE_PUBLIC_DOMAIN`), every share
 * URL ("Copy URL", "Open", "Preview") points at this host regardless of where
 * the dashboard is currently rendered. When unset, share URLs use the host
 * the user is already on — which is the correct behavior on Vercel preview
 * deploys, on localhost, and on production.
 *
 * Set this in the production environment when you want share links to
 * always advertise a fixed canonical domain (e.g. `illuxus.com`) even when
 * organizers happen to be visiting a preview deployment.
 */
export const PROJECT_CUSTOM_DOMAIN = (
  (import.meta.env.VITE_PUBLIC_DOMAIN as string | undefined) || ""
).trim();

/**
 * Optional secondary public host. Reserved for the case where a project has
 * both a preferred custom domain and a fallback published host (e.g. a
 * branded domain that may not always be reachable). Empty by default.
 */
export const PROJECT_PUBLISHED_HOST = (
  (import.meta.env.VITE_PUBLIC_PUBLISHED_HOST as string | undefined) || ""
).trim();

const SANDBOX_HOST_RE =
  /(\.lovableproject\.com|\.lovable\.dev|^id-preview--|^preview--)/i;

function isSandboxHost(host: string): boolean {
  return !!host && SANDBOX_HOST_RE.test(host);
}

/** Pick the best public host for a shareable URL. */
export function preferredPublicEventHost(currentHost?: string): string {
  if (PROJECT_CUSTOM_DOMAIN) return PROJECT_CUSTOM_DOMAIN;
  if (PROJECT_PUBLISHED_HOST && !isSandboxHost(PROJECT_PUBLISHED_HOST))
    return PROJECT_PUBLISHED_HOST;
  return currentHost || "";
}

function resolveOrigin(): { protocol: string; host: string } {
  if (typeof window !== "undefined" && window.location) {
    const host = preferredPublicEventHost(window.location.host);
    return { protocol: window.location.protocol || "https:", host };
  }
  return { protocol: "https:", host: preferredPublicEventHost() };
}

/**
 * Build an absolute, shareable URL for an event using the preferred public
 * host. Always use this in dashboard "Copy URL" / "Open" / "Preview" buttons
 * so what the user copies matches what they'd share publicly.
 *
 * If no pinned domain is configured, this returns a URL on the same host the
 * user is currently on. That avoids the "Copy URL takes me to a dead domain"
 * footgun when DNS for a hardcoded canonical domain isn't set up yet.
 */
export function eventPublicUrl(event: EventLike, orgSlug?: string | null): string {
  const { protocol, host } = resolveOrigin();
  if (!host) return eventPublicPath(event, orgSlug);
  return `${protocol}//${host}${eventPublicPath(event, orgSlug)}`;
}

/**
 * Build an absolute, shareable URL for an organization's public landing
 * page (the `/<handle>` page). Mirrors `eventPublicUrl` so dashboard
 * "Open" / "Copy URL" buttons always advertise the same host (configured
 * canonical domain → current host).
 */
export function orgPublicUrl(handle: string): string {
  const { protocol, host } = resolveOrigin();
  const clean = (handle || "").replace(/^\/+|\/+$/g, "");
  if (!host) return `/org/${clean}`;
  return `${protocol}//${host}/org/${clean}`;
}

/** Build the canonical relative path for an organization landing page. */
export function orgPublicPath(handle: string): string {
  const clean = (handle || "").replace(/^\/+|\/+$/g, "");
  return `/org/${clean}`;
}

type RouteAnomaly = {
  route: string;
  param: string;
  expected: "slug" | "uuid";
  actual: "slug" | "uuid" | "unknown";
  context?: Record<string, unknown>;
};

/**
 * Client-side logger for route-parameter anomalies.
 * Logs to the console and stores the last 25 anomalies on
 * `window.__eventRouteAnomalies` so they can be inspected during QA.
 */
export function reportRouteAnomaly(a: RouteAnomaly): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & {
    __eventRouteAnomalies?: RouteAnomaly[];
  };
  if (!w.__eventRouteAnomalies) w.__eventRouteAnomalies = [];
  w.__eventRouteAnomalies.push({ ...a, context: { ...a.context, ts: Date.now() } });
  if (w.__eventRouteAnomalies.length > 25) {
    w.__eventRouteAnomalies.splice(0, w.__eventRouteAnomalies.length - 25);
  }
  logger.warn("event route anomaly", { anomaly: a });
}

/** Inspect a route param and report if it doesn't match the expected shape. */
export function checkRouteParam(
  route: string,
  param: string,
  value: string | undefined,
  expected: "slug" | "uuid",
): void {
  if (!value) return;
  const actual: "slug" | "uuid" | "unknown" = isUuid(value)
    ? "uuid"
    : /^[a-z0-9-]+$/i.test(value)
      ? "slug"
      : "unknown";
  if (actual !== expected) {
    reportRouteAnomaly({ route, param, expected, actual, context: { value } });
  }
}

/**
 * Detect login-gated preview hosts (legacy Lovable preview pattern).
 * Returns false for everything that isn't a `preview--*` / `id-preview--*`
 * host, so this is safe to keep on a Vercel deployment.
 */
export function isLoginGatedPreviewHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.startsWith("id-preview--") || h.startsWith("preview--");
}

/**
 * Resolve the published host equivalent of a preview host, if recognizable.
 * Currently handles the legacy `preview--<name>` pattern only.
 * Returns null when no safe mapping exists.
 */
export function publishedHostFor(host: string): string | null {
  const h = host.toLowerCase();
  if (h.startsWith("preview--")) return h.replace(/^preview--/, "");
  return null;
}
