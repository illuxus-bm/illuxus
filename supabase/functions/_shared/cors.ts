/**
 * Origin-aware CORS helper for Supabase edge functions.
 *
 * Background
 * ----------
 * Every function in this project used to set
 *
 *     "Access-Control-Allow-Origin": "*"
 *
 * which lets ANY origin call the function with the visitor's Supabase
 * JWT attached. Combined with browser cookie auto-attachment, that
 * makes CSRF trivial against authenticated flows like livekit-promote,
 * agora-token, recording-start, send-whatsapp, etc.
 *
 * This module replaces that pattern. Each function imports
 * `buildCorsHeaders(req)` and gets back a headers object that:
 *   - echoes the request's `Origin` only when it's in the allowlist
 *   - returns "null" otherwise (browsers treat this as "no CORS access")
 *   - sets `Vary: Origin` so caches don't bleed responses across origins
 *
 * Allowlist sources (resolved in order)
 * -------------------------------------
 *   1. `ALLOWED_ORIGINS` Supabase secret (comma-separated). Highest
 *      precedence so ops can flip the allowlist without redeploying.
 *   2. `VITE_PUBLIC_DOMAIN` and `VITE_PUBLIC_PUBLISHED_HOST` —
 *      auto-included (the values the client bundle reads to build URLs).
 *      Both `https://<host>` and `https://<host>/` are accepted to dodge
 *      trailing-slash variations.
 *   3. `localhost:5173`, `localhost:8080`, `127.0.0.1:5173` for dev.
 *
 * Public-callable functions
 * -------------------------
 * Some functions are intentionally callable from anywhere (e.g.
 * `whatsapp-webhook` is hit by Meta's servers). Those pass
 * `{ allowAny: true }` to `buildCorsHeaders` so they keep the wildcard.
 *
 * Usage in a function
 * -------------------
 * ```ts
 * import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
 *
 * Deno.serve(async (req) => {
 *   const cors = buildCorsHeaders(req);
 *   const preflight = handlePreflight(req, cors);
 *   if (preflight) return preflight;
 *
 *   // ...your logic...
 *
 *   return new Response(JSON.stringify(out), {
 *     headers: { ...cors, "Content-Type": "application/json" },
 *   });
 * });
 * ```
 *
 * In dev with no `ALLOWED_ORIGINS` secret set, localhost:5173 / 8080
 * are accepted, so existing local workflows keep working.
 */

const DEV_ORIGINS = new Set<string>([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-correlation-id";

const DEFAULT_METHODS = "POST, OPTIONS";

export interface CorsOpts {
  /**
   * Permit any origin. Use only for functions that are explicitly
   * public webhooks (e.g. WhatsApp / LiveKit / Stripe webhooks) where
   * the caller is a third-party server, never a browser. The function
   * MUST verify the request's signature for those — origin is not a
   * defence on its own.
   */
  allowAny?: boolean;
  /**
   * Comma-separated extra origins to allow on top of the env-derived
   * list. Useful for staging URLs the dashboard owner can't easily
   * push to `ALLOWED_ORIGINS`.
   */
  extraOrigins?: string[];
  /** HTTP methods to advertise. Default `"POST, OPTIONS"`. */
  methods?: string;
}

function envAllowedOrigins(): Set<string> {
  const set = new Set<string>(DEV_ORIGINS);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of fromSecret) set.add(stripTrailingSlash(o));
  // The browser bundle's public domain envs are mirrored as Supabase
  // secrets so the edge function can validate without a separate config.
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN")
    || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST")
    || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
  for (const host of [publicDomain, publishedHost]) {
    if (!host) continue;
    const trimmed = stripTrailingSlash(host).trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      set.add(trimmed);
    } else {
      set.add(`https://${trimmed}`);
    }
  }
  return set;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Build the response CORS headers for a single request.
 *
 * Behaviour
 *   - When `opts.allowAny`: returns `Access-Control-Allow-Origin: *`.
 *   - Otherwise: echoes the request's Origin only when it's in the
 *     allowlist; returns `"null"` (a real string the browser treats as
 *     opaque) when not.
 *   - Always sets `Vary: Origin` so a cache between Supabase and the
 *     browser doesn't accidentally serve a same-URL response across
 *     different origins.
 */
export function buildCorsHeaders(
  req: Request,
  opts: CorsOpts = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? DEFAULT_METHODS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (opts.allowAny) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }

  const origin = req.headers.get("Origin") ?? "";
  const allowed = envAllowedOrigins();
  for (const e of opts.extraOrigins ?? []) allowed.add(stripTrailingSlash(e));

  if (origin && allowed.has(stripTrailingSlash(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}

/**
 * Returns a 204 preflight response when the request is `OPTIONS`,
 * otherwise null. Functions that use this can stop branching on
 * `req.method === "OPTIONS"` themselves.
 */
export function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

/**
 * Convenience helper for a JSON response that carries the CORS headers.
 * Drops a `Content-Type: application/json` if not already set.
 */
export function corsJson(
  body: unknown,
  init: { status?: number; cors: Record<string, string>; extraHeaders?: Record<string, string> },
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init.cors,
    ...(init.extraHeaders ?? {}),
  };
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/**
 * For audit logging only — does not affect the response. Reports
 * which origin made the call so the function's structured logs can
 * carry the field. Returns the trimmed origin or `null`.
 */
export function readOrigin(req: Request): string | null {
  return req.headers.get("Origin");
}
