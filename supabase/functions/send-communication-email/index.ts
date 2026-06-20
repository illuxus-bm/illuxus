/**
 * send-communication-email
 *
 * Reads `email_status='pending'` recipient rows for a communication and
 * ships them through Resend's batch API. Updates each row's status to
 * `'sent'` (or `'failed'` with `error_message` populated) and rolls up the
 * counts on the parent `communications` row.
 *
 * Required env (Supabase secrets):
 *   RESEND_API_KEY  — your Resend project API key
 *   RESEND_FROM     — verified sender address (e.g. "Illuxus <events@yourdomain.com>")
 *
 * Request body:
 *   { communication_id: string, batch_size?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";

interface RecipientRow {
  id: string;
  email: string | null;
  name: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
}

interface ResendBatchResultItem {
  id?: string;
}

const RESEND_BATCH_LIMIT = 100;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Single top-level catch so any unexpected throw returns a useful error
  // body instead of a generic 500. The `step` field tells us which line
  // broke during debugging.
  let step = "init";
  try {
    step = "read-secrets";
    const apiKey = Deno.env.get("RESEND_API_KEY");
    // Accept either RESEND_FROM (legacy) or RESEND_FROM_EMAIL (matches the
    // other email edge functions in this project). Pick whichever is set.
    const from   = Deno.env.get("RESEND_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL");
    if (!apiKey || !from) {
      console.error("[send-communication-email] missing secrets",
        { hasApiKey: !!apiKey, hasFrom: !!from });
      return json({
        error: "Resend not configured: set RESEND_API_KEY and RESEND_FROM_EMAIL secrets first.",
        step,
      }, 500);
    }

    step = "parse-body";
    const body = await req.json() as { communication_id?: string; batch_size?: number };
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }
    const limit = Math.min(Math.max(1, body.batch_size ?? RESEND_BATCH_LIMIT), RESEND_BATCH_LIMIT);

    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[send-communication-email] missing supabase env",
        { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
      return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", step }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    step = "read-pending-rows";
    const { data: rowsRaw, error: rowsErr } = await supabase
      .from("communication_recipients")
      .select("id, email, name, rendered_subject, rendered_body")
      .eq("communication_id", communication_id)
      .eq("email_status", "pending")
      .not("email", "is", null)
      .limit(limit);

    if (rowsErr) {
      console.error("[send-communication-email] read-pending-rows failed", rowsErr);
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = (rowsRaw ?? []) as RecipientRow[];
    console.log(`[send-communication-email] found ${rows.length} pending rows for ${communication_id}`);

    if (rows.length === 0) {
      // Best-effort: refresh parent counts even when nothing was sent.
      await supabase.rpc(
        "communications_recompute_email_counts" as never,
        { _communication_id: communication_id } as never,
      );
      return json({ sent: 0, failed: 0, remaining: 0, errors: [] });
    }

    step = "mark-sending";
    const ids = rows.map((r) => r.id);
    const { error: markErr } = await supabase
      .from("communication_recipients")
      .update({ email_status: "sending" })
      .in("id", ids);
    if (markErr) {
      console.error("[send-communication-email] mark-sending failed", markErr);
      return json({ error: `Mark sending failed: ${markErr.message}`, step }, 500);
    }

    step = "build-batch";
    // Resend's batch endpoint accepts up to 100 emails. Each entry has its
    // own subject + html + to thanks to per-recipient pre-rendering.
    const items = rows.map((r) => ({
      from,
      to: [r.email!],
      subject: r.rendered_subject ?? "",
      html: textToHtml(r.rendered_body ?? ""),
      text: r.rendered_body ?? "",
      tags: [
        { name: "communication_id", value: communication_id },
        { name: "recipient_id",     value: r.id },
      ],
    }));

    step = "resend-batch";
    let batchOk = false;
    let batchData: { data?: ResendBatchResultItem[] } | null = null;
    let batchError: string | null = null;
    try {
      const resp = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(items),
      });
      const responseText = await resp.text();
      console.log(`[send-communication-email] resend status=${resp.status} bodyLen=${responseText.length}`);
      if (!resp.ok) {
        batchError = `Resend ${resp.status}: ${responseText.slice(0, 500)}`;
        console.error("[send-communication-email] resend non-2xx", batchError);
      } else {
        try {
          batchData = JSON.parse(responseText) as { data?: ResendBatchResultItem[] };
          batchOk = true;
        } catch (parseErr) {
          batchError = `Resend returned non-JSON: ${responseText.slice(0, 200)}`;
          console.error("[send-communication-email] resend body parse failed", parseErr);
        }
      }
    } catch (err) {
      batchError = err instanceof Error ? err.message : String(err);
      console.error("[send-communication-email] resend fetch threw", batchError);
    }

    step = "update-statuses";
    let sent = 0;
    let failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];

    if (batchOk && batchData?.data && batchData.data.length === rows.length) {
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const result = batchData.data[i];
        if (result?.id) {
          await supabase
            .from("communication_recipients")
            .update({ email_status: "sent", email_sent_at: now })
            .eq("id", row.id);
          sent += 1;
        } else {
          await supabase
            .from("communication_recipients")
            .update({ email_status: "failed", error_message: "No id returned by Resend" })
            .eq("id", row.id);
          failed += 1;
          errors.push({ recipient_id: row.id, error: "No id returned by Resend" });
        }
      }
    } else {
      const reason = batchError ?? "Unknown Resend batch failure";
      for (const row of rows) {
        await supabase
          .from("communication_recipients")
          .update({ email_status: "failed", error_message: reason.slice(0, 500) })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: reason });
      }
    }

    step = "recompute-counts";
    await supabase.rpc(
      "communications_recompute_email_counts" as never,
      { _communication_id: communication_id } as never,
    );

    step = "count-remaining";
    const { count: remaining } = await supabase
      .from("communication_recipients")
      .select("id", { count: "exact", head: true })
      .eq("communication_id", communication_id)
      .eq("email_status", "pending");

    return json({ sent, failed, remaining: remaining ?? 0, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[send-communication-email] unhandled error at step="${step}":`, msg, stack);
    return json({ error: msg, step }, 500);
  }
});

/**
 * Minimal plain-text → HTML conversion. Wraps the body in a paragraph and
 * preserves line breaks. Resend renders this as the rich-text version while
 * the `text` field provides the plain-text fallback.
 */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped.split(/\n{2,}/).map((para) =>
    `<p>${para.replace(/\n/g, "<br>")}</p>`
  ).join("\n");
  return `<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6;">${html}</body></html>`;
}
