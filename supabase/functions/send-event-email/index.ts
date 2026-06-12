/**
 * send-event-email
 *
 * Records an event email as sent in the database. Provider integration is
 * intentionally absent — wire your provider in the marked block below when
 * ready. Until then, the call still succeeds so the UI flow (record campaign
 * → mark as sent in `event_emails`) keeps working end-to-end.
 *
 * Expected request body (JSON):
 * {
 *   event_id:        string   — UUID of the event (or "support" / "invite" for system mails)
 *   email_id:        string   — UUID of the event_emails row (for audit/update)
 *   subject:         string   — Email subject line
 *   body:            string   — Plain-text email body
 *   recipient_emails: string[] — List of recipient email addresses
 * }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
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

    // ── Supabase service-role client ──────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Verify the email_id belongs to the event_id (security check) ──────────
    // System sends use sentinel event_ids ("support", "invite") that won't
    // have a matching event_emails row — those skip this check.
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

    // ─────────────────────────────────────────────────────────────────────────
    // TODO: integrate your email provider here.
    //
    // Inputs available at this point:
    //   subject, emailBody, recipient_emails  — content + recipients
    //   event_id, email_id                    — DB linkage for status updates
    //
    // Expected behavior:
    //   - Send `emailBody` (plus an HTML version, if you build one) to each
    //     recipient via your provider's transactional API
    //   - On full failure, set event_emails.status='draft' and return 500
    //   - On partial/full success, fall through to the DB update below
    //
    // No provider is wired right now, so we record the campaign as sent in DB
    // and return success. Recipients do not receive an actual email yet.
    // ─────────────────────────────────────────────────────────────────────────
    console.log("[send-event-email] No provider wired. Recording as sent in DB only.");
    console.log(`  Subject: ${subject}`);
    console.log(`  Recipients (${recipient_emails.length}): ${recipient_emails.slice(0, 5).join(", ")}${recipient_emails.length > 5 ? "…" : ""}`);

    if (!isSystem) {
      await supabase
        .from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", email_id);
    }

    return json({
      success: true,
      sent: recipient_emails.length,
      failed: 0,
      provider: "none",
      note: "No email provider configured — campaign recorded in DB only. Wire a provider in send-event-email/index.ts to enable actual delivery.",
    });

  } catch (err) {
    console.error("[send-event-email] Unexpected error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
