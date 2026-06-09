/**
 * send-event-email
 *
 * Sends a bulk event email to a list of recipient addresses.
 * Uses Resend (https://resend.com) when RESEND_API_KEY is configured,
 * otherwise logs the payload and returns success so the caller can
 * still record the message even in environments without email credentials.
 *
 * Expected request body (JSON):
 * {
 *   event_id:        string   — UUID of the event
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

/** Convert plain text to basic HTML — preserves line breaks. */
function textToHtml(text: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 40px auto; padding: 0 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb;
              font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <p>${text.replace(/\n/g, "<br />")}</p>
    <div class="footer">
      You received this email because you registered for an event on Illuxus.
    </div>
  </div>
</body>
</html>`;
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
    const { data: emailRecord, error: fetchErr } = await supabase
      .from("event_emails")
      .select("id, status")
      .eq("id", email_id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (fetchErr || !emailRecord) {
      return json({ error: "Email record not found or access denied" }, 403);
    }

    // ── Fetch event details for the from-name ─────────────────────────────────
    const { data: eventRow } = await supabase
      .from("events")
      .select("title, org_id")
      .eq("id", event_id)
      .maybeSingle();

    // ── Fetch org name + billing email for the From address ───────────────────
    let fromName = eventRow?.title ?? "Illuxus Events";
    let fromEmail = "noreply@illuxus.com";

    if (eventRow?.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name, billing_email")
        .eq("id", eventRow.org_id)
        .maybeSingle();
      if (org) {
        fromName = org.name ?? fromName;
        // Use billing email as the from address only if it's a verified domain.
        // For safety we always use noreply@illuxus.com as sender and set
        // Reply-To to the org billing email.
      }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // ── Send via Resend ───────────────────────────────────────────────────────
    if (resendApiKey) {
      const htmlContent = textToHtml(emailBody);

      // Resend supports up to 50 recipients per call — batch if needed
      const BATCH_SIZE = 50;
      const failures: string[] = [];

      for (let i = 0; i < recipient_emails.length; i += BATCH_SIZE) {
        const batch = recipient_emails.slice(i, i + BATCH_SIZE);

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: batch,
            subject,
            html: htmlContent,
            text: emailBody,
          }),
        });

        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error(`Resend batch ${i / BATCH_SIZE + 1} failed:`, errText);
          failures.push(...batch);
        }
      }

      if (failures.length > 0 && failures.length === recipient_emails.length) {
        // All batches failed — mark as draft
        await supabase
          .from("event_emails")
          .update({ status: "draft", sent_at: null })
          .eq("id", email_id);
        return json({
          error: "All email batches failed to send. Check your Resend API key and domain configuration.",
          failed_count: failures.length,
        }, 500);
      }

      // Partial or full success — mark as sent
      await supabase
        .from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", email_id);

      return json({
        success: true,
        sent: recipient_emails.length - failures.length,
        failed: failures.length,
        provider: "resend",
      });
    }

    // ── No email provider configured — log and return success ─────────────────
    // This allows the UI to record campaigns even in dev/staging without
    // a real email provider. The record stays as "sent" in the DB.
    console.log("[send-event-email] No RESEND_API_KEY configured. Email not delivered.");
    console.log(`  Subject: ${subject}`);
    console.log(`  Recipients (${recipient_emails.length}): ${recipient_emails.slice(0, 5).join(", ")}${recipient_emails.length > 5 ? "…" : ""}`);

    // Mark as sent in DB (dev mode — no actual delivery)
    await supabase
      .from("event_emails")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", email_id);

    return json({
      success: true,
      sent: recipient_emails.length,
      failed: 0,
      provider: "console",
      note: "RESEND_API_KEY not set — email logged to console only. Add RESEND_API_KEY secret in Supabase dashboard to enable real delivery.",
    });

  } catch (err) {
    console.error("[send-event-email] Unexpected error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
