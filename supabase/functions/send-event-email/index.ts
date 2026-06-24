/**
 * send-event-email
 *
 * Sends bulk event / system emails via SMTP (Gmail by default).
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
 *   SMTP_HOST        e.g. smtp.gmail.com
 *   SMTP_PORT        465 (SSL) or 587 (STARTTLS)
 *   SMTP_USERNAME    full mailbox address used to authenticate
 *   SMTP_PASSWORD    Gmail App Password (NOT the account password)
 *   SMTP_FROM        optional, e.g. "Illuxus <noreply@yourdomain.com>"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultFromAddress, sendViaSmtp, smtpConfigured, textToHtml } from "../_shared/smtp.ts";
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

    const from = defaultFromAddress(fromName);
    const htmlContent = textToHtml(emailBody);
    const normalizedRecipients = [
      ...new Set(recipient_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ];

    if (!smtpConfigured()) {
      log.info("not delivered — SMTP not configured", {
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
        note: "SMTP not configured — email logged only. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in Supabase secrets.",
      });
    }

    // SMTP relays expect one envelope per recipient; some providers (Gmail
    // especially) silently rate-limit when batched with many `To:` addrs.
    // Sending one-by-one keeps deliverability predictable and lets us
    // record exactly which addresses failed.
    const failures: string[] = [];
    for (const to of normalizedRecipients) {
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: htmlContent,
        text: emailBody,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });
      if (!result.ok) {
        log.error("smtp send failed", { to, error_message: result.error });
        failures.push(to);
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
        error: "All email sends failed. Check SMTP credentials and that the From address matches your verified sender.",
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
      provider: "smtp",
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
