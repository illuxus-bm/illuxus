/**
 * send-event-email
 *
 * Sends bulk event / system emails via Resend.
 * Reads org context from `events` + `organizations`; honours the singleton
 * `email_settings` row for feature toggles.
 *
 * Expected request body (JSON):
 * {
 *   event_id:         string   — UUID of the event, or "support" / "invite"
 *   email_id:         string   — UUID of the event_emails row (audit/update)
 *   subject:          string
 *   body:             string   — plain-text body
 *   recipient_emails: string[]
 * }
 *
 * Required Supabase secrets:
 *   RESEND_API_KEY       — from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL    — optional, e.g. "Illuxus <noreply@yourdomain.com>"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultFromAddress, sendViaResend, textToHtml } from "../_shared/resend.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("send-event-email");

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const {
      event_id,
      email_id,
      subject,
      body: emailBody,
      recipient_emails,
    } = await req.json() as {
      event_id: string;
      email_id: string;
      subject: string;
      body: string;
      recipient_emails: string[];
    };

    if (!event_id || !email_id || !subject || !emailBody) {
      return json({ error: "Missing required fields: event_id, email_id, subject, body" }, 400);
    }
    if (!Array.isArray(recipient_emails) || recipient_emails.length === 0) {
      return json({ error: "recipient_emails must be a non-empty array" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const isSystem = event_id === "support" || event_id === "invite";

    if (!isSystem) {
      const { data: emailRecord, error: fetchErr } = await supabase
        .from("event_emails")
        .select("id, status")
        .eq("id", email_id)
        .eq("event_id", event_id)
        .maybeSingle();

      if (fetchErr || !emailRecord) {
        return json({ error: "Email record not found or access denied" }, 403);
      }
    }

    // ── email_settings singleton (001_tables.sql) ───────────────────────────
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("domain_configured, send_ticket_emails, send_approval_emails")
      .eq("singleton", true)
      .maybeSingle();

    if (!emailSettings?.domain_configured) {
      log.warn("domain not configured", { hint: "verify your domain in Resend first" });
    }

    // ── Resolve From / Reply-To from org context ────────────────────────────
    let fromName = "Illuxus";
    let replyTo: string | undefined;

    if (!isSystem) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("title, org_id")
        .eq("id", event_id)
        .maybeSingle();

      fromName = eventRow?.title ?? fromName;

      if (eventRow?.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, billing_email")
          .eq("id", eventRow.org_id)
          .maybeSingle();
        if (org?.name) fromName = org.name;
        if (org?.billing_email) replyTo = org.billing_email;
      }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = defaultFromAddress(fromName);
    const htmlContent = textToHtml(emailBody);
    const normalizedRecipients = [
      ...new Set(recipient_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ];

    if (!resendApiKey) {
      log.info("not delivered — no API key", {
        subject,
        recipient_count: normalizedRecipients.length,
        recipient_excerpt: normalizedRecipients.slice(0, 5),
      });

      if (!isSystem) {
        await supabase
          .from("event_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", email_id);
      }

      return json({
        success: true,
        sent: normalizedRecipients.length,
        failed: 0,
        provider: "console",
        note: "RESEND_API_KEY not set — email logged only. Add the secret in Supabase Dashboard → Edge Functions → Secrets.",
      });
    }

    const BATCH_SIZE = 50;
    const failures: string[] = [];

    for (let i = 0; i < normalizedRecipients.length; i += BATCH_SIZE) {
      const batch = normalizedRecipients.slice(i, i + BATCH_SIZE);
      const result = await sendViaResend(resendApiKey, {
        from,
        to: batch,
        subject,
        html: htmlContent,
        text: emailBody,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      if (!result.ok) {
        log.error("resend batch failed", {
          batch_index: i / BATCH_SIZE + 1,
          error_message: result.error,
        });
        failures.push(...batch);
      }
    }

    if (failures.length > 0 && failures.length === normalizedRecipients.length) {
      if (!isSystem) {
        await supabase
          .from("event_emails")
          .update({ status: "draft", sent_at: null })
          .eq("id", email_id);
      }
      return json({
        error: "All email batches failed. Check RESEND_API_KEY and domain verification in Resend.",
        failed_count: failures.length,
      }, 500);
    }

    if (!isSystem) {
      await supabase
        .from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", email_id);
    }

    return json({
      success: true,
      sent: normalizedRecipients.length - failures.length,
      failed: failures.length,
      provider: "resend",
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
