/**
 * Shared validation + URL helpers for workspace handles (Luma-style path slugs).
 *
 * The handle lives at `organizations.subdomain` and is used as the public
 * URL path: `host/<handle>`. Keeping all validation here ensures the
 * onboarding flow, the Domains page, and the admin panel agree on rules.
 */

export const HANDLE_MIN_LEN = 2;
export const HANDLE_MAX_LEN = 40;
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Routes/paths that must never be claimed as a workspace handle. */
export const RESERVED_HANDLES = new Set<string>([
  // App routes
  "o", "org", "events", "login", "reset-password", "onboarding", "dashboard",
  "pricing", "auth", "app", "u", "t", "my",
  // Common platform paths
  "api", "admin", "help", "settings", "billing", "account", "profile",
  "www", "mail", "support", "static", "assets", "public", "embed",
  "about", "contact", "privacy", "terms", "blog", "docs", "status",
]);

export type HandleError =
  | "required"
  | "too-short"
  | "too-long"
  | "starts-or-ends-with-hyphen"
  | "invalid-chars"
  | "reserved";

export interface ValidationResult {
  ok: boolean;
  /** Friendly, user-facing message. Empty string when ok. */
  message: string;
  code?: HandleError;
}

/**
 * Strip + lowercase as the user types so the input only ever contains
 * legal characters. Use in onChange handlers.
 */
export function sanitizeHandleInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, HANDLE_MAX_LEN);
}

/**
 * Validate a handle against length, charset, and reserved-word rules.
 * Returns user-friendly messaging — never raw regex strings.
 */
export function validateHandle(raw: string): ValidationResult {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return { ok: false, code: "required", message: "Workspace handle is required." };
  if (v.length < HANDLE_MIN_LEN)
    return {
      ok: false,
      code: "too-short",
      message: `Handle is too short — use at least ${HANDLE_MIN_LEN} characters.`,
    };
  if (v.length > HANDLE_MAX_LEN)
    return {
      ok: false,
      code: "too-long",
      message: `Handle is too long — keep it under ${HANDLE_MAX_LEN} characters.`,
    };
  if (v.startsWith("-") || v.endsWith("-"))
    return {
      ok: false,
      code: "starts-or-ends-with-hyphen",
      message: "Handle can’t start or end with a hyphen.",
    };
  if (!HANDLE_PATTERN.test(v))
    return {
      ok: false,
      code: "invalid-chars",
      message: "Use lowercase letters, numbers, and hyphens only.",
    };
  if (RESERVED_HANDLES.has(v))
    return {
      ok: false,
      code: "reserved",
      message: `“${v}” is reserved. Try a different name.`,
    };
  return { ok: true, message: "" };
}

export function isHandleReserved(raw: string): boolean {
  return RESERVED_HANDLES.has((raw || "").trim().toLowerCase());
}

// ─── Host helpers ──────────────────────────────────────────────────────────

const SANDBOX_HOST_RE =
  /(\.lovableproject\.com|\.lovable\.dev|^id-preview--|^preview--)/i;

/** True for the temporary in-editor sandbox host. */
export function isSandboxHost(host: string): boolean {
  if (!host) return false;
  return SANDBOX_HOST_RE.test(host);
}

/** True for the published *.lovable.app hostnames. */
export function isLovableAppHost(host: string): boolean {
  return /\.lovable\.app$/i.test(host || "");
}

export interface HostInfo {
  /** The host the browser is currently on. */
  current: string;
  /** Friendly label: "Sandbox preview" / "Published" / "Custom domain". */
  label: "Sandbox preview" | "Published" | "Custom domain";
  /** True when current === sandbox preview (URL is not shareable). */
  isSandbox: boolean;
}

export function describeCurrentHost(host: string): HostInfo {
  if (isSandboxHost(host))
    return { current: host, label: "Sandbox preview", isSandbox: true };
  if (isLovableAppHost(host))
    return { current: host, label: "Published", isSandbox: false };
  return { current: host, label: "Custom domain", isSandbox: false };
}

/**
 * Pick the best public host to advertise to the user, given:
 *  - the sandbox/preview host they are currently viewing
 *  - an optional custom domain attached to the project
 *  - an optional published lovable.app fallback
 *
 * Preference: customDomain → publishedHost → currentHost.
 */
export function preferredPublicHost(opts: {
  currentHost: string;
  customDomain?: string | null;
  publishedHost?: string | null;
}): { host: string; isFallback: boolean } {
  const cd = (opts.customDomain || "").trim().toLowerCase();
  if (cd) return { host: cd, isFallback: false };
  const pub = (opts.publishedHost || "").trim().toLowerCase();
  if (pub && !isSandboxHost(pub)) return { host: pub, isFallback: false };
  return { host: opts.currentHost, isFallback: isSandboxHost(opts.currentHost) };
}

export function publicUrlFor(host: string, handle: string, protocol = "https:"): string {
  const cleanHost = host.replace(/\/+$/, "");
  const cleanHandle = (handle || "").replace(/^\/+|\/+$/g, "");
  return `${protocol}//${cleanHost}/org/${cleanHandle}`;
}
