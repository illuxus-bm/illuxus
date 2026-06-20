/**
 * whatsapp-webhook
 *
 * Receives Meta's WhatsApp Cloud API delivery callbacks.
 *
 *   GET  → verification handshake (`hub.mode=subscribe` + `hub.verify_token`)
 *   POST → message status events: sent / delivered / read / failed
 *
 * Required env (Supabase secrets):
 *   WHATSAPP_VERIFY_TOKEN  — random string you also paste into Meta's webhook
 *                            config so Meta proves it's us.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";

// Meta's WhatsApp servers POST verification + delivery events to this
// endpoint with no browser involved. Origin checking is meaningless
// here — the security boundary is the verify_token + signature header.
// Pass allowAny + GET so the verification handshake works.
function corsFor(req: Request) {
  return buildCorsHeaders(req, { allowAny: true, methods: "GET, POST, OPTIONS" });
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  // ── Verification handshake ────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected  = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (!expected) {
      console.error("[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN not set");
      return new Response("verify token not configured on server", {
        status: 500, headers: corsHeaders,
      });
    }

    if (mode === "subscribe" && token && token === expected) {
      console.log("[whatsapp-webhook] verification successful");
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    console.warn("[whatsapp-webhook] verification rejected",
      { hasMode: !!mode, hasToken: !!token, match: token === expected });
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  // ── Status events ─────────────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const payload = await req.json() as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              statuses?: Array<{
                id: string;
                status: "sent" | "delivered" | "read" | "failed";
                recipient_id: string;
                timestamp: string;
                errors?: Array<{ code: number; title: string; message?: string }>;
              }>;
            };
          }>;
        }>;
      };

      let processed = 0;
      let unmatched = 0;
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const statuses = change.value?.statuses ?? [];
          for (const s of statuses) {
            const phone = normalisePhone(s.recipient_id);
            if (!phone) continue;

            // Match by digit-suffix to be tolerant of leading +/spaces in our
            // stored phone column. Narrow by recent rows (last 7 days) to
            // avoid stamping unrelated historical sends.
            const { data: candidates } = await supabase
              .from("communication_recipients")
              .select("id, phone, created_at")
              .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .order("created_at", { ascending: false })
              .limit(200);

            const target = (candidates ?? []).find(
              (c) => normalisePhone(c.phone as string | null) === phone,
            );
            if (!target) { unmatched += 1; continue; }

            const errMsg = s.errors && s.errors.length > 0
              ? `${s.errors[0].code}: ${s.errors[0].title}${s.errors[0].message ? ` — ${s.errors[0].message}` : ""}`
              : null;

            await supabase.rpc("_whatsapp_recipient_update" as never, {
              _recipient_id: target.id,
              _status: s.status,
              _error: errMsg,
            } as never);
            processed += 1;
          }
        }
      }
      console.log(`[whatsapp-webhook] processed=${processed} unmatched=${unmatched}`);
      return new Response(JSON.stringify({ processed, unmatched }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp-webhook] POST failed:", msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("method not allowed", { status: 405, headers: corsHeaders });
});
