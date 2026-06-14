/**
 * whatsapp-webhook
 *
 * Receives Meta's WhatsApp Cloud API delivery callbacks. Handles:
 *   - GET (verification handshake from Meta — `hub.verify_token` flow)
 *   - POST (message status events: sent / delivered / read / failed)
 *
 * Required env (Supabase secrets):
 *   WHATSAPP_VERIFY_TOKEN  — random string you also paste into Meta's
 *                            webhook config so Meta proves it's us.
 *
 * Status events arrive shaped like:
 *   {
 *     entry: [{
 *       changes: [{
 *         value: {
 *           statuses: [{
 *             id: "wamid....",
 *             status: "sent" | "delivered" | "read" | "failed",
 *             recipient_id: "919...",
 *             timestamp: "1700000000",
 *             errors?: [{ code, title, message }]
 *           }],
 *           ...
 *         }
 *       }]
 *     }]
 *   }
 *
 * We match each event to a `communication_recipients` row by phone number
 * (normalised) and update its whatsapp_status / timestamp columns.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Verification handshake ────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected  = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
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
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const statuses = change.value?.statuses ?? [];
          for (const s of statuses) {
            const phone = normalisePhone(s.recipient_id);
            if (!phone) continue;

            // Match by digit-suffix to be tolerant of leading +/spaces in our
            // stored phone column. We narrow by recent rows (last 7 days) to
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
            if (!target) continue;

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
      return new Response(JSON.stringify({ processed }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("method not allowed", { status: 405, headers: corsHeaders });
});
