/**
 * whatsapp-sync-templates
 *
 * Pulls the org's approved message templates from Meta's WhatsApp Business
 * Account and upserts them into `public.whatsapp_templates` so the compose
 * UI can render the picker without hitting Meta on every keystroke.
 *
 * Required env (Supabase secrets):
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — the WABA id (numeric)
 *   WHATSAPP_TOKEN               — system-user access token with whatsapp_business_messaging
 *   WHATSAPP_API_VERSION         — optional, defaults to 'v20.0'
 *
 * Request body:
 *   { org_id: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: Array<{
    type: string;
    text?: string;
    example?: { body_text?: string[][]; header_text?: string[] };
  }>;
}

/**
 * Count the number of `{{n}}` placeholders in the body component to drive
 * the variable inputs in the compose UI.
 */
function deriveVariableCount(template: MetaTemplate): number {
  const body = template.components.find((c) => c.type === "BODY" || c.type === "body");
  const text = body?.text ?? "";
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const wabaId  = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID");
    const token   = Deno.env.get("WHATSAPP_TOKEN");
    const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";

    if (!wabaId || !token) {
      return json({
        error: "WhatsApp not configured: set WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_TOKEN secrets first.",
      }, 500);
    }

    const { org_id } = await req.json() as { org_id: string };
    if (!org_id) return json({ error: "org_id is required" }, 400);

    // Verify caller is an org member (use anon-keyed client + JWT).
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: ud } = await userClient.auth.getUser();
    if (!ud.user) return json({ error: "not signed in" }, 401);

    const { data: membership } = await userClient
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("user_id", ud.user.id)
      .maybeSingle();
    if (!membership) return json({ error: "not an org member" }, 403);

    // Service role for the upsert.
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch templates from Meta (paginated, but the first page is usually enough).
    const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/message_templates`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("fields", "id,name,language,category,status,components");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: `Meta fetch failed: ${resp.status} ${txt.slice(0, 300)}` }, 502);
    }

    const body = await resp.json() as { data?: MetaTemplate[] };
    const templates = body.data ?? [];

    let upserted = 0;
    for (const t of templates) {
      const variableCount = deriveVariableCount(t);
      const { error: upErr } = await service
        .from("whatsapp_templates")
        .upsert({
          org_id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: t.components,
          variable_count: variableCount,
          synced_at: new Date().toISOString(),
        } as never, { onConflict: "org_id,name,language" });
      if (!upErr) upserted += 1;
    }

    return json({ synced: upserted, total: templates.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
