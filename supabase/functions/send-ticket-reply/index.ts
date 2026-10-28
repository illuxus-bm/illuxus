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
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

/** Two-factor on: a password-only (aal1) session doesn't count. Same rule as _shared/auth.ts. */
function sessionMeetsTwoFactor(user: { factors?: { status: string }[] }, token: string): boolean {
  if (!(user.factors ?? []).some((f) => f.status === "verified")) return true;
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(p.padEnd(p.length + ((4 - (p.length % 4)) % 4), "="))) as { aal?: string }).aal === "aal2";
  } catch {
    return false;
  }
}


// ─── Email, CORS + logging helpers ────────────────────────────────────
// Inlined on purpose instead of importing ../_shared/smtp.ts,
// ../_shared/cors.ts and ../_shared/edge-logger.ts: this function is
// deployed by pasting index.ts into the Supabase dashboard editor, which
// uploads only this one file, so any ../_shared import fails to bundle.
// Keep in step with those _shared files when they change.

function smtpConfigured(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

function defaultFromAddress(displayName = "Illuxus"): string {
  const explicit =
    Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const from = explicit || Deno.env.get("SMTP_USERNAME") || `${displayName} <noreply@example.com>`;
  return from.includes("<") ? from : `${displayName} <${from}>`;
}

async function sendViaSmtp(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST")!,
      port,
      // 465 → implicit TLS. 587 / 25 → STARTTLS after EHLO.
      tls: port === 465,
      auth: {
        username: Deno.env.get("SMTP_USERNAME")!,
        password: Deno.env.get("SMTP_PASSWORD")!,
      },
    },
  });
  try {
    await client.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      content: stripTrailingWhitespace(payload.text),
      html: stripTrailingWhitespace(payload.html),
      ...(payload.reply_to ? { replyTo: payload.reply_to } : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

/** denomailer turns a line-final space into a literal "=20" in the
 *  delivered email, so strip trailing spaces (LF or CRLF lines). */
function stripTrailingWhitespace(body: string): string {
  return body.replace(/[ \t]+(?=\r?$)/gm, "");
}

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081", // illuxus-venue dev server
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  const strip = (s: string) => s.trim().replace(/\/$/, "");
  const allowed = new Set(DEV_ORIGINS);
  for (const o of (Deno.env.get("ALLOWED_ORIGINS") || "").split(",")) {
    if (o.trim()) allowed.add(strip(o));
  }
  for (const host of [
    Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN"),
    Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST"),
  ]) {
    if (!host?.trim()) continue;
    const h = strip(host);
    allowed.add(/^https?:\/\//.test(h) ? h : `https://${h}`);
  }
  const origin = req.headers.get("Origin") ?? "";
  const ok =
    allowed.has(strip(origin)) ||
    /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  headers["Access-Control-Allow-Origin"] = origin && ok ? origin : "null";
  if (origin && ok) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  return req.method === "OPTIONS" ? new Response(null, { status: 204, headers: cors }) : null;
}

/** One JSON line per log call, with secret-looking keys redacted. */
function createEdgeLogger(fnName: string) {
  const SECRET_KEYS = /^(password|passwd|secret|api_?key|access_token|refresh_token|service_role_key|token|authorization|cookie|otp|otp_code|private_key)$/i;
  const redact = (fields?: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fields ?? {}).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : v]),
    );
  const emit = (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, fn: fnName, msg, ...redact(fields) });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  };
  return {
    info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
  };
}

function toErrorFields(err: unknown): Record<string, unknown> {
  return err instanceof Error
    ? { error_name: err.name, error_message: err.message, error_stack: err.stack }
    : { error_message: String(err) };
}

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
    if (!sessionMeetsTwoFactor(userData.user, accessToken)) {
      return json({ success: false, error: "two_factor_required" }, 401);
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
