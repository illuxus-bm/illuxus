import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Accept either the workspace handle (subdomain) or the legacy slug
    // under the `org` param so embed snippets keep working regardless of
    // which identifier the user pasted.
    const handle = (orgSlug || subdomain || "").toLowerCase();
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, subdomain, custom_domain, logo_url, landing_published")
      .or(`subdomain.eq.${handle},slug.eq.${handle}`)
      .limit(1)
      .maybeSingle();

    if (!org || !org.landing_published) {
      return new Response(JSON.stringify({ error: "Organization not found or not published" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    let query = supabase
      .from("events")
      .select("id, slug, title, description, date, end_date, location, venue, image_url, price, status")
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