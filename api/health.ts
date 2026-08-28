/**
 * api/health — liveness and readiness probe.
 *
 * Why this exists
 * ───────────────
 * Before this route the only signal that the application was up was
 * `@vercel/analytics` (real-user monitoring, not availability monitoring).
 * There was no endpoint an uptime monitor, load balancer, or on-call runbook
 * could poll, which meant an outage was detected by a user complaint rather
 * than by an alert.
 *
 * Two modes, selected by query string, matching the standard
 * liveness-vs-readiness split:
 *
 *   GET /api/health           liveness. Answers "is this process serving
 *                             traffic?" Never touches a dependency, so it
 *                             cannot fail because Supabase is slow. Always
 *                             200 unless the function itself is broken.
 *
 *   GET /api/health?deep=1    readiness. Additionally probes Supabase with a
 *                             short-timeout, unauthenticated request. Returns
 *                             503 when a hard dependency is unreachable.
 *
 * Point uptime monitoring at the shallow form for "is the site up" alerting
 * and at the deep form (less frequently — it costs a Supabase round trip)
 * for "can the site actually serve data" alerting.
 *
 * ## Response shape
 *
 *   {
 *     "status":  "ok" | "degraded",
 *     "uptime":  "live",
 *     "version": "<git sha or 'unknown'>",
 *     "time":    "<ISO 8601>",
 *     "checks":  { "<name>": { "status": "ok"|"fail"|"skipped", "latency_ms"?: n } }
 *   }
 *
 * ## Deliberately NOT included
 *
 * No environment variable values, no key material, no table names, no row
 * counts, no stack traces, no internal hostnames. This endpoint is
 * unauthenticated and world-reachable, so it reports only whether a
 * dependency answered — never anything about what it contains or how it is
 * configured. `configured: false` is the strongest statement it will make
 * about a missing secret, which is a deployment fact rather than a secret.
 */

export const config = { runtime: "edge" };

/** Hard timeout for the deep dependency probe. Kept well under a typical
 *  uptime-monitor timeout so a slow dependency reports as degraded rather
 *  than as a monitor-side timeout with no diagnostic value. */
const DEPENDENCY_TIMEOUT_MS = 3_000;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

/** Build identifier, for correlating an alert with a deploy. Injected by
 *  Vercel; falls back to the value Vite stamps in, then to "unknown". */
const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.VITE_BUILD_SHA ??
  "unknown";

type CheckState = "ok" | "fail" | "skipped";

interface CheckResult {
  status: CheckState;
  latency_ms?: number;
  /** Present only when a required env var is absent. Never carries a value. */
  configured?: boolean;
}

/**
 * Probes Supabase's REST root with the anon key. This is the cheapest call
 * that still proves the full path works: DNS, TLS, the API gateway, and
 * PostgREST auth. It reads no table, so it cannot be affected by RLS and
 * returns no data.
 *
 * Any 2xx/3xx/4xx means the service answered and is therefore reachable — a
 * 401 still proves the gateway is alive. Only a network failure, a timeout,
 * or a 5xx counts as down.
 */
async function checkSupabase(): Promise<CheckResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { status: "skipped", configured: false };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "HEAD",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(DEPENDENCY_TIMEOUT_MS),
    });
    const latency = Date.now() - startedAt;
    // A 5xx means the dependency is unhealthy. Anything else means it
    // answered, which is all this probe is asserting.
    return {
      status: res.status >= 500 ? "fail" : "ok",
      latency_ms: latency,
    };
  } catch {
    // Timeout, DNS failure, TLS failure, connection refused. No error detail
    // is echoed — it can carry internal hostnames.
    return { status: "fail", latency_ms: Date.now() - startedAt };
  }
}

export default async function handler(req: Request): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Never cache a health check — a cached 200 during an outage is worse
    // than no health check at all.
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Robots-Tag": "noindex",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  let deep = false;
  try {
    deep = new URL(req.url).searchParams.get("deep") === "1";
  } catch {
    // Unparseable URL — fall back to the shallow check rather than 500ing.
    deep = false;
  }

  const checks: Record<string, CheckResult> = {};

  if (deep) {
    checks.supabase = await checkSupabase();
  } else {
    checks.supabase = { status: "skipped" };
  }

  // "skipped" is not a failure — a shallow probe skips every dependency by
  // design, and an unconfigured dependency is a deploy problem that the
  // payload already reports via `configured: false`.
  const failed = Object.values(checks).some((c) => c.status === "fail");

  const body = {
    status: failed ? "degraded" : "ok",
    uptime: "live",
    version: VERSION,
    time: new Date().toISOString(),
    checks,
  };

  return new Response(JSON.stringify(body), {
    // 503 so an uptime monitor treats a degraded dependency as an incident.
    status: failed ? 503 : 200,
    headers,
  });
}
