// GENERATED from ./index.ts by scripts/build-dashboard-functions.mjs — do not edit.
// Paste this whole file into the Supabase Dashboard editor for `org-events` and Deploy.
// Re-generate after changing index.ts or ../_shared: npm run functions:inline

// supabase/functions/org-events/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// supabase/functions/_shared/cors.ts
function previewOriginAllowed(origin) {
  const pattern = Deno.env.get("PREVIEW_ORIGIN_PATTERN")?.trim();
  if (!pattern || !origin) return false;
  try {
    return new RegExp(`^(?:${pattern})$`, "i").test(origin);
  } catch {
    return false;
  }
}
var DEV_ORIGINS = /* @__PURE__ */ new Set([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080"
]);
var NATIVE_APP_ORIGINS = /* @__PURE__ */ new Set([
  "capacitor://localhost",
  // iOS
  "https://localhost"
  // Android
]);
var ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-correlation-id";
var DEFAULT_METHODS = "POST, OPTIONS";
function envAllowedOrigins() {
  const set = /* @__PURE__ */ new Set([...DEV_ORIGINS, ...NATIVE_APP_ORIGINS]);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const o of fromSecret) set.add(stripTrailingSlash(o));
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
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
function stripTrailingSlash(s) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
function buildCorsHeaders(req, opts = {}) {
  const headers = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": opts.methods ?? DEFAULT_METHODS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
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
  } else if (origin && previewOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}
function handlePreflight(req, cors) {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

// supabase/functions/org-events/index.ts
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, {
    allowAny: true,
    methods: "GET, OPTIONS"
  });
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const url = new URL(req.url);
    const orgSlug = url.searchParams.get("org");
    const subdomain = url.searchParams.get("subdomain");
    const filter = (url.searchParams.get("filter") || "upcoming").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);
    if (!orgSlug && !subdomain) {
      return new Response(JSON.stringify({ error: "Missing 'org' or 'subdomain' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, anonKey);
    const handle = (orgSlug || subdomain || "").toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
    if (!isUuid && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(handle)) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const orgColumns = "id, name, slug, subdomain, custom_domain, logo_url, landing_published";
    let org = null;
    if (isUuid) {
      ({ data: org } = await supabase.from("organizations").select(orgColumns).eq("id", handle).maybeSingle());
    } else {
      ({ data: org } = await supabase.from("organizations").select(orgColumns).eq("subdomain", handle).maybeSingle());
      if (!org) {
        ({ data: org } = await supabase.from("organizations").select(orgColumns).eq("slug", handle).maybeSingle());
      }
    }
    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let query = supabase.from("events").select("id, slug, title, description, date, end_date, location, venue, image_url, banner_landscape_url, price, status").eq("org_id", org.id).eq("status", "published").limit(limit);
    if (filter === "past") {
      query = query.lt("date", now).order("date", { ascending: false });
    } else if (filter === "all") {
      query = query.order("date", { ascending: false });
    } else {
      query = query.gte("date", now).order("date", { ascending: true });
    }
    const { data: events, error } = await query;
    if (error) throw error;
    return new Response(
      JSON.stringify({
        org: {
          id: org.id,
          name: org.name,
          // Public path handle. Prefer the user-set workspace handle (subdomain)
          // so embed cards link to /<handle>/events/<slug>; fall back to slug.
          slug: org.subdomain || org.slug,
          logo_url: org.logo_url
        },
        filter,
        events: events || []
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60"
        }
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
