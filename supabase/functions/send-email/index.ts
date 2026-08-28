/**
 * send-email
 *
 * Delivers per-recipient emails for the unified `communications` module via
 * SMTP. Call AFTER `communications_dispatch` returns — the dispatch RPC
 * fans out rows into `communication_recipients` with rendered subject/body;
 * this function ships them and updates delivery status on each row.
 *
 * Required env (Supabase secrets):
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       465 (SSL) or 587 (STARTTLS)
 *   SMTP_USERNAME   the SMTP login (full mailbox)
 *   SMTP_PASSWORD   Gmail App Password (16 chars), NOT the account password
 *   SMTP_FROM       optional, e.g. "Illuxus <noreply@yourdomain.com>"
 *
 * Request body:
 *   { communication_id: string }
 *
 * Returns:
 *   { sent: number, failed: number, errors: Array<{ recipient_id, error }> }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultFromAddress, sendViaSmtp, smtpConfigured, textToHtml } from "../_shared/smtp.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { assertCommunicationAccess, requireUser } from "../_shared/auth.ts";

interface RecipientRow {
  id: string;
  email: string | null;
  name: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  email_status: string | null;
  email_sent_at: string | null;
}

interface CommunicationRow {
  id: string;
  org_id: string;
  event_id: string | null;
  community_id: string | null;
  subject: string;
  body_text: string;
  body_html: string | null;
  sent_at: string | null;
  channels: string[];
}

/** Rows stamped by dispatch but not yet delivered via Resend. */
function needsProviderSend(row: RecipientRow, commSentAt: string | null): boolean {
  if (!row.email) return false;
  if (row.email_status === "pending") return true;
  if (row.email_status === "sending") return false;
  if (row.email_status === "failed") return false;
  if (row.email_status === "sent" && commSentAt && row.email_sent_at === commSentAt) return true;
  return false;
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

  try {
    if (!smtpConfigured()) {
      return json({
        error: "Email not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD in Supabase Edge Function secrets first.",
      }, 500);
    }

    const { communication_id } = await req.json() as { communication_id: string };
    if (!communication_id) return json({ error: "communication_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authorization — MUST run before any mail leaves the building ─────────
    // This function holds the service-role key and fans out SMTP mail to every
    // recipient row of the referenced communication. Without an ownership
    // check, any caller could replay another tenant's communication (a
    // cross-tenant mail-bomb) and mutate its delivery state. `verify_jwt` does
    // not help here — the public anon key satisfies it.
    const caller = await requireUser(req, supabase);
    if (!caller.ok) return json({ error: caller.error }, caller.status);

    const access = await assertCommunicationAccess(supabase, caller.user.id, communication_id);
    if (!access.ok) return json({ error: access.error }, access.status);

    const { data: commRaw, error: commErr } = await supabase
      .from("communications")
      .select("id, org_id, event_id, community_id, subject, body_text, body_html, sent_at, channels")
      .eq("id", communication_id)
      .maybeSingle();

    if (commErr || !commRaw) return json({ error: "Communication not found" }, 404);

    const comm = commRaw as unknown as CommunicationRow;
    if (!comm.channels.includes("email")) {
      return json({ error: "This communication does not include the email channel" }, 400);
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name, billing_email")
      .eq("id", comm.org_id)
      .maybeSingle();

    let fromName = org?.name ?? "Illuxus";
    if (comm.event_id) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("title")
        .eq("id", comm.event_id)
        .maybeSingle();
      if (eventRow?.title) fromName = eventRow.title;
    }

    const from = defaultFromAddress(fromName);
    const replyTo = org?.billing_email ?? undefined;

    const { data: rowsRaw } = await supabase
      .from("communication_recipients")
      .select("id, email, name, rendered_subject, rendered_body, email_status, email_sent_at")
      .eq("communication_id", communication_id);

    const rows = ((rowsRaw ?? []) as RecipientRow[]).filter((r) =>
      needsProviderSend(r, comm.sent_at)
    );

    let sent = 0;
    let failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const to = row.email!.trim().toLowerCase();
      const subject = row.rendered_subject ?? comm.subject;
      const bodyText = row.rendered_body ?? comm.body_text;
      const bodyHtml = comm.body_html ?? textToHtml(bodyText);

      await supabase
        .from("communication_recipients")
        .update({ email_status: "sending" })
        .eq("id", row.id);

      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: bodyHtml.includes("<") ? bodyHtml : textToHtml(bodyText),
        text: bodyText,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      if (!result.ok) {
        await supabase
          .from("communication_recipients")
          .update({
            email_status: "failed",
            error_message: result.error.slice(0, 500),
          })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error.slice(0, 200) });
        continue;
      }

      await supabase
        .from("communication_recipients")
        .update({
          email_status: "sent",
          email_sent_at: now,
          error_message: null,
        })
        .eq("id", row.id);
      sent += 1;
    }

    if (sent + failed > 0) {
      await supabase
        .from("communications")
        .update({
          sent_count: sent,
          failed_count: failed,
          updated_at: now,
        })
        .eq("id", communication_id);
    }

    return json({ sent, failed, errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
