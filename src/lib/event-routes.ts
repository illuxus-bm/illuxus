/**
 * Centralized helpers for building public event URLs and detecting routing
 * anomalies (e.g. UUIDs leaking into the URL after a slug edit).
 *
 * Use `eventPublicPath(event)` everywhere a link to an event is rendered so
 * we never accidentally regress to UUID-based URLs.
 */

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
 * The customer-facing host we always want dashboard "Copy URL" / "Open"
 * buttons to point at, regardless of whether the user is currently editing
 * inside the Lovable sandbox (`*.lovableproject.com`) or on a preview host.
 *
 * Priority when building a shareable URL:
 *   1. Custom domain (PROJECT_CUSTOM_DOMAIN)
 *   2. Published lovable.app host (PROJECT_PUBLISHED_HOST)
 *   3. The current browser host (last-resort fallback)
 */
export const PROJECT_CUSTOM_DOMAIN = "www.illuxus.com";
export const PROJECT_PUBLISHED_HOST = "biz-meet.lovable.app";

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

/**
 * Build an absolute, shareable URL for an event using the preferred public
 * host. Always use this in dashboard "Copy URL" / "Open" / "Preview" buttons
 * so what the user copies matches what they'd share publicly.
 */
export function eventPublicUrl(event: EventLike, orgSlug?: string | null): string {
  const host =
    typeof window !== "undefined"
      ? preferredPublicEventHost(window.location.host)
      : preferredPublicEventHost();
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";
  return `${protocol}//${host}${eventPublicPath(event, orgSlug)}`;
}

/**
 * Build an absolute, shareable URL for an organization's public landing
 * page (the "/<handle>" page). Mirrors `eventPublicUrl` so dashboard
 * "Open" / "Copy URL" buttons always advertise the customer-facing host
 * (custom domain → published host → current host) rather than the
 * Lovable sandbox preview URL.
 */
export function orgPublicUrl(handle: string): string {
  const host =
    typeof window !== "undefined"
      ? preferredPublicEventHost(window.location.host)
      : preferredPublicEventHost();
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : "https:";
  const clean = (handle || "").replace(/^\/+|\/+$/g, "");
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
  // eslint-disable-next-line no-console
  console.warn("[event-route-anomaly]", a);
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

/** Detect login-gated Lovable preview hosts (id-preview / preview--*). */
export function isLoginGatedPreviewHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.startsWith("id-preview--") || h.startsWith("preview--");
}

/**
 * Resolve the published host equivalent of a preview host, if recognizable.
 * `preview--biz-meet.lovable.app` -> `biz-meet.lovable.app`.
 * Returns null when no safe mapping exists.
 */
export function publishedHostFor(host: string): string | null {
  const h = host.toLowerCase();
  if (h.startsWith("preview--")) return h.replace(/^preview--/, "");
  // id-preview--<uuid>.lovable.app has no deterministic public mapping
  return null;
}