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
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 50);

    if (!orgSlug && !subdomain) {
      return new Response(JSON.stringify({ error: "Missing 'org' or 'subdomain' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);
    // or the raw org UUID under the `org` param so embed snippets keep
    // working regardless of which identifier the user pasted.
    const handle = (orgSlug || subdomain || "").toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, subdomain, custom_domain, logo_url, landing_published")
      .or(isUuid
        ? `id.eq.${handle}`
        : `subdomain.eq.${handle},slug.eq.${handle}`)
      .limit(1)
      .maybeSingle();

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