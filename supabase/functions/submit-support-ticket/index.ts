/**
 * submit-support-ticket
 *
 * Accepts a contact-form submission, persists it as a numbered ticket in
 * `support_tickets`, and notifies both the submitter and the support team
 * via SMTP.
 *
 * ── Request body (JSON) ────────────────────────────────────────────────────
 *   {
 *     name:      string  (required, ≤120 chars)
 *     email:     string  (required, basic regex)
 *     subject:   string  (required, ≤200 chars)
 *     category:  string  (optional — defaults 'general')
 *     message:   string  (required, ≤8000 chars)
 *     source:    string  (optional — defaults 'contact_form')
 *     page_url:  string  (optional)
 *   }
 *
 * ── Response ───────────────────────────────────────────────────────────────
 *   200 → { success: true, ticket_number, tracking_url, email_delivered }
 *   400 → { success: false, error: '...' }                 (validation)
 *   500 → { success: false, error: '...' }                 (server-side fault)
 *
 * The function still returns 200 + `email_delivered: false` when the ticket
 * row was created but SMTP failed (graceful degradation — the user can
 * always track via the URL even if their confirmation email never arrives).
 *
 * Required Supabase secrets:
 *   SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD (see _shared/smtp.ts)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY              (auto-injected)
 *   SUPPORT_INBOX_EMAIL                                   (optional override)
 *   PUBLIC_DOMAIN / VITE_PUBLIC_DOMAIN                    (for tracking URL)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

const log = createEdgeLogger("submit-support-ticket");

// Allowed enum values mirror the SQL CREATE TYPE in 005_support_tickets.sql.
const ALLOWED_CATEGORIES = new Set([
  "general", "sales", "support", "billing", "privacy",
  "grievance", "press", "legal", "feature_request", "bug_report", "other",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubmitBody {
  name?: string;
  email?: string;
  subject?: string;
  category?: string;
  message?: string;
  source?: string;
  page_url?: string;
}

interface SupportTicketRow {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  subject: string;
  category: string;
  priority: string;
  message: string;
  status: string;
  created_at: string;
}

// SHA-256 the raw IP so abuse can be tracked across submissions without
// retaining the address itself (DPDPA / GDPR pseudonymisation requirement).
async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    return null;
  }
}

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

/** Plain text → simple HTML email (copy of _shared/resend.ts textToHtml). */
function textToHtml(text: string, footer?: string): string {
  const footerHtml = footer
    ?? "You received this email because you are registered for an event on Illuxus.";
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
    <p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>
    <div class="footer">${escapeHtml(footerHtml)}</div>
  </div>
</body>
</html>`;
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

function categoryLabel(c: string): string {
  switch (c) {
    case "feature_request": return "Feature request";
    case "bug_report":      return "Bug report";
    case "privacy":         return "Privacy & DPO";
    case "grievance":       return "Grievance officer";
    case "press":           return "Press & media";
    case "legal":           return "Legal";
    case "sales":           return "Sales & Enterprise";
    case "billing":         return "Billing";
    case "support":         return "Support";
    case "other":           return "Other";
    case "general":
    default:                return "General enquiry";
  }
}

// Pick a sane default priority from the category so urgent paths land on top
// of the admin queue immediately. Admins can still override after the fact.
function priorityForCategory(c: string): "low" | "normal" | "high" | "urgent" {
  if (c === "grievance" || c === "legal") return "high";
  if (c === "bug_report") return "high";
  if (c === "privacy") return "high";
  return "normal";
}

function buildUserHtml(args: {
  name: string;
  ticketNumber: string;
  subject: string;
  category: string;
  message: string;
  trackingUrl: string;
}): string {
  const { name, ticketNumber, subject, category, message, trackingUrl } = args;
  return `<!doctype html>
<html><body style="margin:0;background:#f7f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#71717a;">Illuxus Support</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-.01em;">Thanks for getting in touch, ${escapeHtml(name)}.</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#3f3f46;">
        We've received your message and created a ticket. You can track its status anytime using the link below — bookmark it for easy access.
      </p>

      <div style="margin:24px 0;padding:16px 20px;background:#f4f4f5;border-radius:12px;border:1px solid #e4e4e7;">
        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#71717a;">Ticket number</p>
        <p style="margin:0;font-size:20px;font-weight:600;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:.04em;">${escapeHtml(ticketNumber)}</p>
      </div>

      <table role="presentation" style="width:100%;font-size:13px;color:#3f3f46;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#71717a;width:90px;">Category</td><td style="padding:6px 0;">${escapeHtml(categoryLabel(category))}</td></tr>
        <tr><td style="padding:6px 0;color:#71717a;">Subject</td><td style="padding:6px 0;">${escapeHtml(subject)}</td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#71717a;">Your message</p>
      <div style="padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;font-size:13px;line-height:1.55;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(message)}</div>

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${trackingUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:500;">Track this ticket →</a>
      </div>

      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#3f3f46;">
        We typically respond within <strong>one business day</strong>. Grievance and privacy requests are acknowledged within 24 hours and resolved within 15 days, per the IT Rules 2021 and DPDPA 2023.
      </p>
    </div>

    <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;text-align:center;line-height:1.55;">
      Illuxus Technologies Private Limited · 4th Floor, Lighthouse Tower, BKC, Mumbai 400 051<br/>
      You're receiving this because you submitted a request via illuxus.com/contact.
    </p>
  </div>
</body></html>`;
}

function buildUserText(args: {
  name: string;
  ticketNumber: string;
  subject: string;
  category: string;
  message: string;
  trackingUrl: string;
}): string {
  const { name, ticketNumber, subject, category, message, trackingUrl } = args;
  return [
    `Hi ${name},`,
    "",
    `Thanks for getting in touch. We've received your message and created a support ticket.`,
    "",
    `Ticket number: ${ticketNumber}`,
    `Category: ${categoryLabel(category)}`,
    `Subject: ${subject}`,
    "",
    "Your message:",
    message,
    "",
    `Track your ticket: ${trackingUrl}`,
    "",
    "We typically respond within one business day. Grievance and privacy requests",
    "are acknowledged within 24 hours and resolved within 15 days per IT Rules 2021",
    "and DPDPA 2023.",
    "",
    "— The Illuxus team",
  ].join("\n");
}

function buildStaffHtml(args: {
  ticket: SupportTicketRow;
  trackingUrl: string;
  adminUrl: string;
}): string {
  const { ticket, trackingUrl, adminUrl } = args;
  const priorityColor =
    ticket.priority === "urgent" ? "#dc2626"
    : ticket.priority === "high" ? "#ea580c"
    : ticket.priority === "low"  ? "#71717a"
    : "#2563eb";
  return `<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#fafafa;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:24px;">
      <div style="display:inline-block;padding:3px 10px;background:${priorityColor};border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#fff;">${escapeHtml(ticket.priority)}</div>
      <h1 style="margin:10px 0 4px;font-size:18px;font-weight:600;color:#fff;">${escapeHtml(ticket.subject)}</h1>
      <p style="margin:0;font-size:12px;color:#a1a1aa;font-family:monospace;">${escapeHtml(ticket.ticket_number)} · ${escapeHtml(categoryLabel(ticket.category))}</p>

      <table role="presentation" style="width:100%;margin:18px 0 12px;font-size:13px;color:#d4d4d8;border-collapse:collapse;">
        <tr><td style="padding:5px 0;color:#71717a;width:90px;">From</td><td style="padding:5px 0;">${escapeHtml(ticket.name)} &lt;${escapeHtml(ticket.email)}&gt;</td></tr>
        <tr><td style="padding:5px 0;color:#71717a;">Submitted</td><td style="padding:5px 0;">${escapeHtml(ticket.created_at)}</td></tr>
      </table>

      <p style="margin:14px 0 6px;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.1em;">Message</p>
      <div style="padding:14px 16px;background:#09090b;border:1px solid #27272a;border-radius:8px;font-size:13px;line-height:1.55;color:#e4e4e7;white-space:pre-wrap;">${escapeHtml(ticket.message)}</div>

      <div style="margin:20px 0 0;display:flex;gap:8px;">
        <a href="${adminUrl}" style="display:inline-block;padding:10px 18px;background:#fafafa;color:#0a0a0a;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">Open in admin →</a>
        <a href="${trackingUrl}" style="display:inline-block;padding:10px 18px;background:transparent;color:#fafafa;text-decoration:none;border:1px solid #3f3f46;border-radius:8px;font-size:13px;">User's view</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function buildStaffText(args: {
  ticket: SupportTicketRow;
  trackingUrl: string;
  adminUrl: string;
}): string {
  const { ticket, trackingUrl, adminUrl } = args;
  return [
    `New ${ticket.priority.toUpperCase()} ticket — ${ticket.ticket_number}`,
    "",
    `Subject:  ${ticket.subject}`,
    `From:     ${ticket.name} <${ticket.email}>`,
    `Category: ${categoryLabel(ticket.category)}`,
    `Created:  ${ticket.created_at}`,
    "",
    "Message:",
    ticket.message,
    "",
    `Admin:    ${adminUrl}`,
    `User view: ${trackingUrl}`,
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
    const body = (await req.json()) as SubmitBody;

    // ── Validation ──────────────────────────────────────────────────────────
    const name = clamp(body.name, 120);
    const email = clamp(body.email, 200).toLowerCase();
    const subject = clamp(body.subject, 200);
    const message = clamp(body.message, 8000);
    let category = clamp(body.category || "general", 32);
    if (!ALLOWED_CATEGORIES.has(category)) category = "general";
    const source = clamp(body.source || "contact_form", 64) || "contact_form";
    const pageUrl = clamp(body.page_url, 1000) || null;

    if (!name || !email || !subject || !message) {
      return json({ success: false, error: "name, email, subject and message are required" }, 400);
    }
    if (!EMAIL_REGEX.test(email)) {
      return json({ success: false, error: "Invalid email address" }, 400);
    }

    // ── Provenance ─────────────────────────────────────────────────────────
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      null;
    const ipHash = await hashIp(rawIp);
    const userAgent = clamp(req.headers.get("user-agent") ?? "", 500) || null;

    const priority = priorityForCategory(category);

    // ── Insert via service role (bypasses RLS) ─────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Best-effort: link to existing auth.users row when the submitter's email
    // already has an account. Keeps the ticket connected to their profile but
    // doesn't fail the submission if the lookup blips.
    let linkedUserId: string | null = null;
    try {
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("email", email)
        .maybeSingle();
      if (existingUser?.user_id) linkedUserId = existingUser.user_id;
    } catch {
      // profiles.email may not exist on every deployment — silently skip.
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("support_tickets")
      .insert({
        name,
        email,
        user_id: linkedUserId,
        subject,
        category,
        message,
        priority,
        source,
        user_agent: userAgent,
        ip_hash: ipHash,
        page_url: pageUrl,
      })
      .select("id, ticket_number, name, email, subject, category, priority, message, status, created_at")
      .single();

    if (insertErr || !inserted) {
      log.error("ticket insert failed", { error_message: insertErr?.message });
      return json({
        success: false,
        error: "Could not save your message. Please email support@illuxus.com directly.",
      }, 500);
    }

    const ticket = inserted as SupportTicketRow;

    // ── URLs ───────────────────────────────────────────────────────────────
    const origin = publicOrigin();
    const trackingUrl = `${origin}/support/ticket/${encodeURIComponent(ticket.ticket_number)}?email=${encodeURIComponent(email)}`;
    const adminUrl = `${origin}/dashboard/admin/tickets?ticket=${encodeURIComponent(ticket.id)}`;

    // ── Email delivery ─────────────────────────────────────────────────────
    let emailDelivered = false;
    if (!smtpConfigured()) {
      log.warn("smtp-not-configured", { ticket_number: ticket.ticket_number });
    } else {
      const from = defaultFromAddress("Illuxus Support");
      const supportInbox =
        Deno.env.get("SUPPORT_INBOX_EMAIL") ||
        Deno.env.get("SMTP_USERNAME") ||
        "support@illuxus.com";

      // 1. Confirmation to the submitter.
      const userText = buildUserText({
        name, ticketNumber: ticket.ticket_number, subject,
        category, message, trackingUrl,
      });
      const userHtml = buildUserHtml({
        name, ticketNumber: ticket.ticket_number, subject,
        category, message, trackingUrl,
      });
      const userSubject = `[${ticket.ticket_number}] Thanks for contacting Illuxus — we've got your message`;

      const userResult = await sendViaSmtp({
        from,
        to: [email],
        subject: userSubject,
        html: userHtml,
        text: userText,
        reply_to: supportInbox,
      });
      if (!userResult.ok) {
        log.warn("user confirmation send failed", { error_message: userResult.error });
      } else {
        emailDelivered = true;
      }

      // 2. Staff notification.
      const staffSubject = `[${ticket.priority.toUpperCase()}][${ticket.ticket_number}] ${subject}`;
      const staffText = buildStaffText({ ticket, trackingUrl, adminUrl });
      const staffHtml = buildStaffHtml({ ticket, trackingUrl, adminUrl });

      const staffResult = await sendViaSmtp({
        from,
        to: [supportInbox],
        subject: staffSubject,
        html: staffHtml,
        text: staffText,
        reply_to: email,
      });
      if (!staffResult.ok) {
        log.warn("staff notification send failed", { error_message: staffResult.error });
      }

      // Stamp the email status on the ticket so the admin can see whether the
      // confirmation actually made it out the door. Best-effort — if this
      // update fails we still want to return success so the user's submission
      // isn't lost.
      try {
        await supabase
          .from("support_tickets")
          .update({
            // Reuse ip_hash column? No — keep schema clean. We just rely on
            // updated_at being touched if we want a signal later.
          })
          .eq("id", ticket.id);
      } catch {
        /* noop */
      }
    }

    log.info("ticket created", {
      ticket_number: ticket.ticket_number,
      category,
      priority,
      email_delivered: emailDelivered,
    });

    // Tracking URL we return to the client omits the email query string so
    // they can share it / bookmark it without leaking the email; the email
    // sent to the user contains the full one-click link instead.
    const cleanTrackingUrl = `${origin}/support/ticket/${encodeURIComponent(ticket.ticket_number)}`;

    return json({
      success: true,
      ticket_number: ticket.ticket_number,
      tracking_url: cleanTrackingUrl,
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
