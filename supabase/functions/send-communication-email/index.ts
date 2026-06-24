/**
 * send-communication-email
 *
 * Reads `email_status='pending'` recipient rows for a communication and
 * ships them through SMTP (Gmail by default). Updates each row's status to
 * `'sent'` (or `'failed'` with `error_message` populated) and rolls up the
 * counts on the parent `communications` row.
 *
 * Required env (Supabase secrets):
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       465 (SSL) or 587 (STARTTLS)
 *   SMTP_USERNAME   the SMTP login (full mailbox)
 *   SMTP_PASSWORD   Gmail App Password (16 chars), NOT the account password
 *   SMTP_FROM       optional, e.g. "Illuxus <events@yourdomain.com>"
 *
 * Request body:
 *   { communication_id: string, batch_size?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger } from "../_shared/edge-logger.ts";
import { defaultFromAddress, sendViaSmtp, smtpConfigured } from "../_shared/smtp.ts";

const log = createEdgeLogger("send-communication-email");

interface RecipientRow {
  id: string;
  email: string | null;
  name: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
}

const SMTP_CHUNK_LIMIT = 50;

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
    if (!smtpConfigured()) {
      log.error("missing secrets", {
        hasHost: !!Deno.env.get("SMTP_HOST"),
        hasUser: !!Deno.env.get("SMTP_USERNAME"),
        hasPass: !!Deno.env.get("SMTP_PASSWORD"),
      });
      return json({
        error: "SMTP not configured: set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD secrets first.",
        step,
      }, 500);
    }
    const from = defaultFromAddress();

    step = "parse-body";
    const body = await req.json() as { communication_id?: string; batch_size?: number };
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }
    const limit = Math.min(Math.max(1, body.batch_size ?? SMTP_CHUNK_LIMIT), SMTP_CHUNK_LIMIT);

    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing supabase env", { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
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
      log.error("read-pending-rows failed", { error_message: rowsErr.message, error_code: rowsErr.code });
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = (rowsRaw ?? []) as RecipientRow[];
    log.info("read-pending-rows", { count: rows.length, communication_id });

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
      log.error("mark-sending failed", { error_message: markErr.message, error_code: markErr.code });
      return json({ error: `Mark sending failed: ${markErr.message}`, step }, 500);
    }

    step = "smtp-send-loop";
    // SMTP relays don't support batch sends the way Resend's API does — we
    // open one session per recipient. denomailer closes the connection
    // inside `sendViaSmtp`, so this is one TCP roundtrip per recipient.
    // For Gmail this is fine up to a few hundred per minute; if higher
    // throughput is needed, swap the transport for SES / SendGrid.
    let sent = 0;
    let failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const to = (row.email || "").trim().toLowerCase();
      if (!to) {
        await supabase
          .from("communication_recipients")
          .update({ email_status: "failed", error_message: "Recipient has no email" })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: "Recipient has no email" });
        continue;
      }
      const subject  = row.rendered_subject ?? "";
      const bodyText = row.rendered_body ?? "";
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: textToHtml(bodyText),
        text: bodyText,
      });
      if (result.ok) {
        await supabase
          .from("communication_recipients")
          .update({ email_status: "sent", email_sent_at: now })
          .eq("id", row.id);
        sent += 1;
      } else {
        log.error("smtp send failed", { recipient_id: row.id, error_message: result.error });
        await supabase
          .from("communication_recipients")
          .update({ email_status: "failed", error_message: result.error.slice(0, 500) })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error });
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
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
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
