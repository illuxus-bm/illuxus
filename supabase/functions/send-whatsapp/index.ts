/**
 * send-whatsapp
 *
 * Reads `whatsapp_status='pending'` recipient rows for a communication and
 * pushes each through Meta's WhatsApp Cloud API as a template message.
 *
 * Required env (Supabase secrets):
 *   WHATSAPP_PHONE_NUMBER_ID  — the registered phone number's ID (numeric, ~15 digits)
 *   WHATSAPP_TOKEN            — long-lived system-user access token
 *   WHATSAPP_API_VERSION      — optional, defaults to 'v20.0'
 *
 * Request body:
 *   { communication_id: string }
 *
 * Returns:
 *   { sent: number, failed: number, errors: Array<{ recipient_id, error }> }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RecipientRow {
  id: string;
  phone: string | null;
  name: string | null;
}

interface CommunicationRow {
  id: string;
  org_id: string;
  whatsapp_template_name: string | null;
  whatsapp_template_language: string | null;
  whatsapp_template_variables: Record<string, unknown> | null;
}

/**
 * Convert our normalised phone string ("+91 99887 76655" / "919988776655")
 * into the digit-only E.164 form Meta expects (e.g. "919988776655").
 * Returns null when nothing usable can be extracted.
 */
function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let step = "init";
  try {
    step = "read-secrets";
    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const token   = Deno.env.get("WHATSAPP_TOKEN");
    const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";

    if (!phoneId || !token) {
      console.error("[send-whatsapp] missing secrets",
        { hasPhoneId: !!phoneId, hasToken: !!token });
      return json({
        error: "WhatsApp not configured: set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN secrets first.",
        step,
      }, 500);
    }

    step = "parse-body";
    const body = await req.json() as { communication_id?: string };
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }

    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", step }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    step = "read-comm";
    const { data: commRaw, error: commErr } = await supabase
      .from("communications")
      .select("id, org_id, whatsapp_template_name, whatsapp_template_language, whatsapp_template_variables")
      .eq("id", communication_id)
      .maybeSingle();

    if (commErr) {
      console.error("[send-whatsapp] read-comm failed", commErr);
      return json({ error: `Read comm failed: ${commErr.message}`, step }, 500);
    }
    if (!commRaw) return json({ error: "Communication not found", step }, 404);

    const comm = commRaw as unknown as CommunicationRow;
    if (!comm.whatsapp_template_name) {
      return json({ error: "This communication has no WhatsApp template configured", step }, 400);
    }

    step = "read-pending-rows";
    const { data: rowsRaw, error: rowsErr } = await supabase
      .from("communication_recipients")
      .select("id, phone, name")
      .eq("communication_id", communication_id)
      .eq("whatsapp_status", "pending");

    if (rowsErr) {
      console.error("[send-whatsapp] read-pending-rows failed", rowsErr);
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = (rowsRaw ?? []) as RecipientRow[];
    console.log(`[send-whatsapp] found ${rows.length} pending rows for ${communication_id}`);

    if (rows.length === 0) {
      return json({ sent: 0, failed: 0, errors: [] });
    }

    step = "build-components";
    // Shape persisted by the UI: { body: ["v1", "v2"], header: ["v1"] }
    const vars = comm.whatsapp_template_variables ?? {};
    const buildComponents = () => {
      const components: Array<Record<string, unknown>> = [];
      const headerVars = Array.isArray((vars as Record<string, unknown>).header)
        ? ((vars as { header: unknown[] }).header as string[])
        : [];
      if (headerVars.length > 0) {
        components.push({
          type: "header",
          parameters: headerVars.map((v) => ({ type: "text", text: String(v) })),
        });
      }
      const bodyVars = Array.isArray((vars as Record<string, unknown>).body)
        ? ((vars as { body: unknown[] }).body as string[])
        : [];
      if (bodyVars.length > 0) {
        components.push({
          type: "body",
          parameters: bodyVars.map((v) => ({ type: "text", text: String(v) })),
        });
      }
      return components;
    };

    step = "send-loop";
    let sent = 0;
    let failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];

    for (const row of rows) {
      const to = normalisePhone(row.phone);
      if (!to) {
        await supabase.rpc("_whatsapp_recipient_update" as never, {
          _recipient_id: row.id, _status: "failed", _error: "Invalid phone number",
        } as never);
        failed += 1;
        errors.push({ recipient_id: row.id, error: "Invalid phone number" });
        continue;
      }

      // Mark sending so a second invocation won't double-send.
      await supabase.rpc("_whatsapp_recipient_update" as never, {
        _recipient_id: row.id, _status: "sending",
      } as never);

      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: comm.whatsapp_template_name,
          language: { code: comm.whatsapp_template_language || "en" },
          components: buildComponents(),
        },
      };

      try {
        const resp = await fetch(
          `https://graph.facebook.com/${version}/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const respText = await resp.text();
        if (!resp.ok) {
          console.error(`[send-whatsapp] Meta ${resp.status}: ${respText.slice(0, 300)}`);
          await supabase.rpc("_whatsapp_recipient_update" as never, {
            _recipient_id: row.id,
            _status: "failed",
            _error: `Meta ${resp.status}: ${respText.slice(0, 400)}`,
          } as never);
          failed += 1;
          errors.push({ recipient_id: row.id, error: `${resp.status} ${respText.slice(0, 200)}` });
          continue;
        }

        await supabase.rpc("_whatsapp_recipient_update" as never, {
          _recipient_id: row.id, _status: "sent",
        } as never);
        sent += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[send-whatsapp] fetch threw for recipient ${row.id}:`, msg);
        await supabase.rpc("_whatsapp_recipient_update" as never, {
          _recipient_id: row.id, _status: "failed", _error: msg.slice(0, 500),
        } as never);
        failed += 1;
        errors.push({ recipient_id: row.id, error: msg });
      }
    }

    return json({ sent, failed, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[send-whatsapp] unhandled error at step="${step}":`, msg, stack);
    return json({ error: msg, step }, 500);
  }
});
