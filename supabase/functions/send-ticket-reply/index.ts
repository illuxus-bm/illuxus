/**
 * send-ticket-reply
 *
 * Super admin posts a reply to a support ticket. Inserts a message row,
 * emails the original submitter with the body, and stamps `first_response_at`
 * on the ticket if this is the first staff reply.
 *
 * The function validates the caller's JWT and that they hold the
 * `user_roles.role = 'admin'` row before allowing anything. Direct
 * service-role inserts are used so the message row is recorded even if RLS
 * policies later tighten.
 *
 * ── Request body (JSON) ────────────────────────────────────────────────────
 *   {
 *     ticket_id:    string  (uuid, required)
 *     body:         string  (required, ≤8000 chars)
 *     is_internal:  boolean (optional — if true, no email is sent)
 *   }
 *
 * ── Response ───────────────────────────────────────────────────────────────
 *   200 → { success: true, message_id, email_delivered }
 *   401 → { success: false, error: 'unauthenticated' }
 *   403 → { success: false, error: 'not_admin' }
 *   400 → { success: false, error: '...' }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultFromAddress,
  sendViaSmtp,
  smtpConfigured,
} from "../_shared/smtp.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("send-ticket-reply");

function clamp(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max).trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicOrigin(): string {
  const fromEnv =
    Deno.env.get("PUBLIC_DOMAIN") ||
    Deno.env.get("VITE_PUBLIC_DOMAIN") ||
    Deno.env.get("PUBLIC_PUBLISHED_HOST") ||
    "illuxus.com";
  const trimmed = fromEnv.replace(/\/+$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

interface ReplyBody {
  ticket_id?: string;
  body?: string;
  is_internal?: boolean;
}

interface TicketRow {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  subject: string;
  status: string;
  first_response_at: string | null;
}

function buildReplyHtml(args: {
  name: string;
  ticketNumber: string;
  subject: string;
  body: string;
  trackingUrl: string;
  staffName: string;
}): string {
  const { name, ticketNumber, subject, body, trackingUrl, staffName } = args;
  return `<!doctype html>
<html><body style="margin:0;background:#f7f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#71717a;">Reply on ticket ${escapeHtml(ticketNumber)}</p>
      <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;letter-spacing:-.01em;">${escapeHtml(subject)}</h1>

      <p style="margin:0 0 12px;font-size:14px;color:#3f3f46;">Hi ${escapeHtml(name)},</p>

      <div style="padding:14px 18px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;font-size:14px;line-height:1.55;color:#27272a;white-space:pre-wrap;">${escapeHtml(body)}</div>

      <p style="margin:18px 0 0;font-size:13px;color:#71717a;">— ${escapeHtml(staffName)}, Illuxus Support</p>

      <div style="text-align:center;margin:28px 0 0;">
        <a href="${trackingUrl}" style="display:inline-block;padding:11px 22px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:500;">View ticket →</a>
      </div>
    </div>

    <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.55;">
      Replying to this email will not be tracked against the ticket. To respond, please open the ticket using the link above.
    </p>
  </div>
</body></html>`;
}

function buildReplyText(args: {
  name: string;
  ticketNumber: string;
  subject: string;
  body: string;
  trackingUrl: string;
  staffName: string;
}): string {
  const { name, ticketNumber, subject, body, trackingUrl, staffName } = args;
  return [
    `Hi ${name},`,
    "",
    `Reply on ticket ${ticketNumber} — ${subject}`,
    "",
    body,
    "",
    `— ${staffName}, Illuxus Support`,
    "",
    `View ticket: ${trackingUrl}`,
  ].join("\n");
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

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ success: false, error: "unauthenticated" }, 401);
    }
    const accessToken = authHeader.slice(7).trim();
    if (!accessToken) return json({ success: false, error: "unauthenticated" }, 401);

    // Verify the caller against auth.users using a service client (no JWT).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return json({ success: false, error: "unauthenticated" }, 401);
    }
    const userId = userData.user.id;

    // Admin check via user_roles.role = 'admin'.
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return json({ success: false, error: "not_admin" }, 403);
    }

    const body = (await req.json()) as ReplyBody;
    const ticketId = clamp(body.ticket_id, 100);
    const replyBody = clamp(body.body, 8000);
    const isInternal = !!body.is_internal;

    if (!ticketId || !replyBody) {
      return json({ success: false, error: "ticket_id and body required" }, 400);
    }

    // Fetch ticket so we have submitter details + know whether this is the
    // first staff response.
    const { data: ticketData, error: ticketErr } = await supabaseAdmin
      .from("support_tickets")
      .select("id, ticket_number, name, email, subject, status, first_response_at")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketErr || !ticketData) {
      return json({ success: false, error: "ticket_not_found" }, 404);
    }
    const ticket = ticketData as TicketRow;

    // Load staff profile for author_name on the message + email signature.
    const { data: staffProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const staffName =
      (staffProfile as { display_name?: string } | null)?.display_name ||
      userData.user.email?.split("@")[0] ||
      "Support";
    const staffEmail = userData.user.email ?? "support@illuxus.com";

    // Insert the message row first so we never end up emailing without a
    // recorded message.
    const { data: messageRow, error: msgErr } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        author_type: "staff",
        author_id: userId,
        author_name: staffName,
        author_email: staffEmail,
        body: replyBody,
        is_internal: isInternal,
      })
      .select("id")
      .single();
    if (msgErr || !messageRow) {
      log.error("message insert failed", { error_message: msgErr?.message });
      return json({ success: false, error: "could_not_save_reply" }, 500);
    }

    // Internal messages stop here — no email, no first-response stamp.
    if (isInternal) {
      log.info("internal note saved", { ticket_number: ticket.ticket_number });
      return json({ success: true, message_id: messageRow.id, email_delivered: false });
    }

    // Stamp first_response_at if it hasn't been set, and (optionally) move
    // the ticket out of 'open' so it doesn't keep blocking the queue.
    const updates: Record<string, unknown> = {};
    if (!ticket.first_response_at) updates.first_response_at = new Date().toISOString();
    if (ticket.status === "open") updates.status = "awaiting_user";
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("support_tickets").update(updates).eq("id", ticket.id);
    }

    // Email the submitter.
    let emailDelivered = false;
    if (!smtpConfigured()) {
      log.warn("smtp-not-configured", { ticket_number: ticket.ticket_number });
    } else {
      const origin = publicOrigin();
      const trackingUrl = `${origin}/support/ticket/${encodeURIComponent(ticket.ticket_number)}?email=${encodeURIComponent(ticket.email)}`;
      const from = defaultFromAddress("Illuxus Support");

      const result = await sendViaSmtp({
        from,
        to: [ticket.email],
        subject: `[${ticket.ticket_number}] Re: ${ticket.subject}`,
        html: buildReplyHtml({
          name: ticket.name, ticketNumber: ticket.ticket_number,
          subject: ticket.subject, body: replyBody, trackingUrl, staffName,
        }),
        text: buildReplyText({
          name: ticket.name, ticketNumber: ticket.ticket_number,
          subject: ticket.subject, body: replyBody, trackingUrl, staffName,
        }),
        reply_to: Deno.env.get("SUPPORT_INBOX_EMAIL") || staffEmail,
      });

      if (!result.ok) {
        log.warn("reply email send failed", { error_message: result.error });
        await supabaseAdmin
          .from("support_ticket_messages")
          .update({ email_status: "failed" })
          .eq("id", messageRow.id);
      } else {
        emailDelivered = true;
        await supabaseAdmin
          .from("support_ticket_messages")
          .update({
            email_sent_at: new Date().toISOString(),
            email_status: "sent",
          })
          .eq("id", messageRow.id);
      }
    }

    log.info("reply posted", {
      ticket_number: ticket.ticket_number,
      message_id: messageRow.id,
      email_delivered: emailDelivered,
    });

    return json({
      success: true,
      message_id: messageRow.id,
      email_delivered: emailDelivered,
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
