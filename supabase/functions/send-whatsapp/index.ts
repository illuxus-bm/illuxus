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
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("send-whatsapp");

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
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let step = "init";
  try {
    step = "read-secrets";
    const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const token   = Deno.env.get("WHATSAPP_TOKEN");
    const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";

    if (!phoneId || !token) {
      log.error("missing secrets", { hasPhoneId: !!phoneId, hasToken: !!token });
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
      log.error("read-comm failed", { error_message: commErr.message, error_code: commErr.code });
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
      log.error("read-pending-rows failed", { error_message: rowsErr.message, error_code: rowsErr.code });
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = (rowsRaw ?? []) as RecipientRow[];
    log.info("read-pending-rows", { count: rows.length, communication_id });

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
    let skippedAlreadyClaimed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];

    // Per-message timeout for the Meta API call. Without this, a slow
    // Meta endpoint would hang the entire edge function until Supabase
    // kills it (~150s), and every subsequent recipient in the batch
    // gets stranded. 15s per message gives Meta plenty of headroom
    // while capping the worst-case runtime.
    const META_FETCH_TIMEOUT_MS = 15_000;

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

      // ── Atomic claim ──────────────────────────────────────────────
      // Only proceed if this row is STILL 'pending'. The conditional
      // `.eq("whatsapp_status", "pending")` on the update turns the
      // read-then-write into a single atomic transition — a concurrent
      // invocation (e.g. scheduled worker + manual retry firing at the
      // same time) will only see `claimed.length === 0` because the
      // first one already flipped this row to 'sending'. Meta bills
      // per template message; double-sending is a real dollar leak.
      const { data: claimed, error: claimErr } = await supabase
        .from("communication_recipients")
        .update({ whatsapp_status: "sending" })
        .eq("id", row.id)
        .eq("whatsapp_status", "pending")
        .select("id");
      if (claimErr) {
        log.error("claim failed", { recipient_id: row.id, error_message: claimErr.message });
        failed += 1;
        errors.push({ recipient_id: row.id, error: `Claim: ${claimErr.message}` });
        continue;
      }
      if (!claimed || claimed.length === 0) {
        // Another worker got here first. Log at debug so we can see
        // whether this happens often in prod without spamming errors.
        log.debug("recipient already claimed by another worker", { recipient_id: row.id });
        skippedAlreadyClaimed += 1;
        continue;
      }

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
        // AbortSignal.timeout is Deno / modern browser standard and
        // trips the fetch with an `AbortError` after the delay.
        const resp = await fetch(
          `https://graph.facebook.com/${version}/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
          },
        );

        const respText = await resp.text();
        if (!resp.ok) {
          log.error("meta send failed", {
            recipient_id: row.id,
            status: resp.status,
            body_excerpt: respText.slice(0, 300),
          });
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
        // Timeout surfaces as `TimeoutError` (or `AbortError` on older
        // runtimes) — flag it explicitly so operators can distinguish
        // a slow Meta endpoint from an outright rejection.
        const isTimeout =
          err instanceof DOMException &&
          (err.name === "TimeoutError" || err.name === "AbortError");
        const label = isTimeout
          ? `Meta call timed out after ${META_FETCH_TIMEOUT_MS}ms`
          : msg;
        log.error("meta send threw", {
          recipient_id: row.id,
          error_message: msg,
          is_timeout: isTimeout,
        });
        await supabase.rpc("_whatsapp_recipient_update" as never, {
          _recipient_id: row.id, _status: "failed", _error: label.slice(0, 500),
        } as never);
        failed += 1;
        errors.push({ recipient_id: row.id, error: label });
      }
    }

    log.info("send-loop complete", {
      communication_id,
      sent,
      failed,
      skipped_already_claimed: skippedAlreadyClaimed,
    });
    return json({ sent, failed, skipped: skippedAlreadyClaimed, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
    return json({ error: msg, step }, 500);
  }
});
