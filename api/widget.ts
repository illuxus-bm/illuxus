/* eslint-disable no-console */
/**
 * api/widget — public proxy for the embed widget's event feed.
 *
 * Why this exists
 * ───────────────
 * The embed snippet used to point directly at the Supabase Edge Function URL
 * (e.g. https://xhjd....supabase.co/functions/v1/org-events) and also exposed
 * the Supabase anon key in the HTML snippet. That leaks infrastructure details
 * and makes it harder to change the backend.
 *
 * This route proxies all widget requests so:
 *   - The snippet only references illuxus.com — no Supabase URLs or keys
 *   - All credentials stay server-side in Vercel env vars
 *   - We can swap the backend without touching every embed on the web
 *
 * Usage (called by embed.js):
 *   GET https://illuxus.com/api/widget?org=<slug>&filter=upcoming&limit=9
 *
 * Returns: the same JSON shape as the org-events Supabase function.
 */

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/org-events`;

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin") ?? "*";

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const incoming = new URL(req.url);
    const org    = incoming.searchParams.get("org")    ?? "";
    const filter = incoming.searchParams.get("filter") ?? "upcoming";
    const limit  = incoming.searchParams.get("limit")  ?? "9";

    if (!org) {
      return new Response(JSON.stringify({ error: "Missing org parameter" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[widget] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set");
      return new Response(JSON.stringify({ error: "Widget not configured" }), {
        status: 503,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Forward to the Supabase Edge Function using server-side credentials.
    const upstreamUrl =
      `${FUNCTION_URL}?org=${encodeURIComponent(org)}&filter=${encodeURIComponent(filter)}&limit=${encodeURIComponent(limit)}`;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        // Cache at the CDN edge for 60s — same as the Supabase function.
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[widget] proxy error:", msg);
    return new Response(JSON.stringify({ error: "Could not fetch events" }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}
