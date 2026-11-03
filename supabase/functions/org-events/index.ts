import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // Public org events feed — embedded by third-party sites via
  // public/embed.js. Must allow any origin.
  const corsHeaders = buildCorsHeaders(req, {
    allowAny: true,
    methods: "GET, OPTIONS",
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // Use anon key for public data — organizations and published events
    // are readable without service role. This avoids dependency on the
    // SUPABASE_SERVICE_ROLE_KEY secret which can get out of sync.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, anonKey);
    // Accept workspace handle (subdomain), legacy slug, or UUID.
    const handle = (orgSlug || subdomain || "").toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
    // Handles are slugs / subdomains. Anything else (commas, dots, brackets)
    // could add conditions to the filter, so it never reaches the query.
    if (!isUuid && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(handle)) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgColumns = "id, name, slug, subdomain, custom_domain, logo_url, landing_published";
    let org: { id: string } & Record<string, unknown> | null = null;
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    let query = supabase
      .from("events")
      .select("id, slug, title, description, date, end_date, location, venue, image_url, banner_landscape_url, price, status")
      .eq("org_id", org.id)
      .eq("status", "published")
      .limit(limit);

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
          logo_url: org.logo_url,
        },
        filter,
        events: events || [],
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});