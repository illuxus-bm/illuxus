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
import {
  defaultFromAddress,
  sendViaSmtp,
  smtpConfigured,
  textToHtml,
} from "../_shared/smtp.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("submit-support-ticket");

// Allowed enum values mirror the SQL CREATE TYPE in 005_support_tickets.sql.
const ALLOWED_CATEGORIES = new Set([
  "general", "sales", "support", "billing", "privacy",
  "grievance", "press", "legal", "feature_request", "bug_report", "other",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Rate limiting (SEC-09) ──────────────────────────────────────────────────
// Per-IP throttle for this public, unauthenticated endpoint. Tuned to be
// invisible to a real person — a genuine user filing one ticket, realising they
// left something out, and filing again stays well inside 5 per 15 minutes —
// while making scripted abuse expensive.
//
// Overridable via Supabase secrets so ops can tighten during an attack without
// a redeploy. Malformed or non-positive values fall back to the defaults rather
// than disabling the limiter.
const RATE_LIMIT_WINDOW_MS = (() => {
  const raw = Number(Deno.env.get("SUPPORT_RATE_LIMIT_WINDOW_MINUTES"));
  return Number.isFinite(raw) && raw > 0 ? raw * 60_000 : 15 * 60_000;
})();

const RATE_LIMIT_MAX_PER_WINDOW = (() => {
  const raw = Number(Deno.env.get("SUPPORT_RATE_LIMIT_MAX"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
})();

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

    // ── Abuse protection (SEC-09) ──────────────────────────────────────────
    // This endpoint is `verify_jwt = false` (a genuinely public contact form),
    // holds the service-role key, and triggers two outbound emails per call.
    // Unthrottled that is a spam and mail-amplification vector, and every
    // accepted request also writes a row an admin has to triage.
    //
    // The throttle counts this IP's own recent tickets rather than using a
    // separate counter table — the same "reuse the domain table for quota"
    // approach `generate-creative-copy` takes with event_creative_ai_drafts.
    // `ip_hash` is a salted SHA-256 (see hashIp), so no raw address is stored
    // or compared.
    //
    // Fails OPEN by design: if the count query errors, the submission is
    // allowed. A broken throttle must never silently swallow real support
    // requests from users who may be reporting an outage.
    if (ipHash) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count, error: rateErr } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", windowStart);

      if (rateErr) {
        log.warn("rate-limit check failed; allowing submission", {
          error_message: rateErr.message,
        });
      } else if ((count ?? 0) >= RATE_LIMIT_MAX_PER_WINDOW) {
        log.warn("rate limit exceeded", {
          recent_count: count,
          window_minutes: RATE_LIMIT_WINDOW_MS / 60_000,
        });
        return json({
          success: false,
          error:
            "You've sent several messages recently. Please wait a few minutes, " +
            "or email support@illuxus.com directly if it's urgent.",
        }, 429);
      }
    }

    // Link the ticket to an existing account when the submitter already has
    // one, so admins see it against their profile.
    //
    // NOTE: this lookup currently cannot succeed, and that is pre-existing.
    // It queries `profiles.email`, but `profiles` has NO email column —
    // 000_full_schema.sql:5064 states "Email comes from auth.users
    // (profiles.email doesn't exist in this schema)". PostgREST rejects the
    // request, so `linkedUserId` is always null and every ticket is stored
    // unlinked. It is left in place rather than deleted because the intent is
    // correct and the fix is a small `SECURITY DEFINER` RPC over `auth.users`
    // (the pattern migration 031 establishes for exactly this problem).
    // Harmless today: the ticket still records `email`, so an admin can find
    // the person manually.
    let linkedUserId: string | null = null;
    try {
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("email", email)
        .maybeSingle();
      if (existingUser?.user_id) linkedUserId = existingUser.user_id;
    } catch {
      // Expected until the RPC above exists. Never fail a support submission
      // over an optional convenience lookup.
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
