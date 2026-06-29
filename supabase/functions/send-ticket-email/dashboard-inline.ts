// send-ticket-email — Dashboard-deployable version (no _shared imports).
// Paste this whole file into the Supabase Dashboard editor for the
// `send-ticket-email` function and click Deploy.
//
// Required edge function secrets:
//   SMTP_HOST       e.g. smtp.gmail.com
//   SMTP_PORT       465 (SSL)  or  587 (STARTTLS)
//   SMTP_USERNAME   full mailbox you authenticate with
//   SMTP_PASSWORD   Gmail App Password (16 chars, NOT regular password)
//   SMTP_FROM       optional: "Illuxus <noreply@yourdomain.com>"
//   PUBLIC_DOMAIN   optional: canonical public origin for the ticket URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-correlation-id";

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin") ?? "";
  const dev = new Set([
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
  ]);
  const extras = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(stripTrailingSlash);
  const allowList = new Set<string>([...dev, ...extras]);
  const isVercel = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  if (origin && (allowList.has(stripTrailingSlash(origin)) || isVercel)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}

function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

// ── SMTP helpers ────────────────────────────────────────────────────────────

interface SmtpInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

function smtpConfigured(): boolean {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USERNAME");
  const pass = Deno.env.get("SMTP_PASSWORD");
  return Boolean(host && user && pass);
}

function defaultFromAddress(): string {
  const explicit =
    Deno.env.get("SMTP_FROM") ??
    Deno.env.get("RESEND_FROM_EMAIL") ??
    Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const value = explicit || username || "Illuxus <noreply@example.com>";
  if (value.indexOf("<") >= 0) return value;
  return "Illuxus <" + value + ">";
}

async function sendViaSmtp(input: SmtpInput): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: SMTPClient | null = null;
  try {
    const host = Deno.env.get("SMTP_HOST") ?? "";
    const portRaw = Deno.env.get("SMTP_PORT") ?? "465";
    const port = Number(portRaw) || 465;
    const username = Deno.env.get("SMTP_USERNAME") ?? "";
    const password = Deno.env.get("SMTP_PASSWORD") ?? "";

    client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: port === 465,
        auth: { username, password },
      },
    });

    await client.send({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      content: input.text,
      html: input.html,
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 500) };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // noop — server may have already closed the socket
      }
    }
  }
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateInTz(iso: string, tz: string | null): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return fmt.format(new Date(iso));
  } catch {
    return iso;
  }
}

function qrCodeUrl(value: string): string {
  const encoded = encodeURIComponent(value);
  return (
    "https://chart.googleapis.com/chart?cht=qr&chs=240x240&chl=" +
    encoded +
    "&choe=UTF-8"
  );
}

// ── HTML template ───────────────────────────────────────────────────────────

interface EmailContext {
  attendeeName: string;
  eventTitle: string;
  orgName: string;
  orgLogoUrl: string | null;
  dateText: string;
  venueText: string;
  bannerUrl: string | null;
  qrValue: string;
  registrationId: string;
  ticketUrl: string;
  approvalStatus: string;
}

function buildHtml(ctx: EmailContext): string {
  const isPending = ctx.approvalStatus === "pending";
  const statusColor = isPending ? "#f59e0b" : "#16a34a";
  const statusLabel = isPending ? "Pending Approval" : "Confirmed";
  const statusMsg = isPending
    ? "Your registration is pending approval. We'll notify you once confirmed."
    : "Your registration is confirmed. See you there!";
  const firstName = ctx.attendeeName.split(" ")[0] || ctx.attendeeName;

  const orgLogoCell = ctx.orgLogoUrl
    ? '<td style="padding-right:8px;vertical-align:middle"><img src="' +
      escapeHtml(ctx.orgLogoUrl) +
      '" alt="" width="24" height="24" style="border-radius:4px;display:block;" /></td>'
    : "";

  const orgBlock =
    '<table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;"><tr>' +
    orgLogoCell +
    '<td style="vertical-align:middle;font-size:13px;color:#6b7280;">Organised by <strong style="color:#374151">' +
    escapeHtml(ctx.orgName) +
    "</strong></td></tr></table>";

  const bannerBlock = ctx.bannerUrl
    ? '<img src="' +
      escapeHtml(ctx.bannerUrl) +
      '" alt="' +
      escapeHtml(ctx.eventTitle) +
      '" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;" />'
    : '<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);height:120px;border-radius:8px 8px 0 0;"></div>';

  const qrBlock = isPending
    ? ""
    : '<div style="margin:24px 0;text-align:center;">' +
      '<p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Scan at the venue for check-in</p>' +
      '<img src="' +
      qrCodeUrl(ctx.qrValue) +
      '" alt="QR code" width="160" height="160" style="display:inline-block;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" />' +
      '<p style="font-size:11px;color:#9ca3af;margin:8px 0 0;font-family:monospace;">' +
      escapeHtml(ctx.registrationId.slice(0, 8).toUpperCase()) +
      "</p>" +
      "</div>";

  const dateRow = ctx.dateText
    ? '<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:20px;vertical-align:top;">📅</td>' +
      '<td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">' +
      escapeHtml(ctx.dateText) +
      "</td></tr>"
    : "";

  const venueRow = ctx.venueText
    ? '<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">📍</td>' +
      '<td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">' +
      escapeHtml(ctx.venueText) +
      "</td></tr>"
    : "";

  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    "<title>Your ticket for " +
    escapeHtml(ctx.eventTitle) +
    "</title></head>" +
    '<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">' +
    "<tr><td>" +
    bannerBlock +
    "</td></tr>" +
    '<tr><td style="padding:28px 32px 24px;">' +
    '<div style="display:inline-block;background:' +
    statusColor +
    "1a;color:" +
    statusColor +
    ';font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em;">' +
    escapeHtml(statusLabel) +
    "</div>" +
    '<p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">' +
    (isPending ? "Application Received!" : "You're going!") +
    "</p>" +
    '<p style="font-size:15px;color:#4b5563;margin:0 0 20px;">Hi <strong>' +
    escapeHtml(firstName) +
    "</strong>, " +
    statusMsg +
    "</p>" +
    '<p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">' +
    escapeHtml(ctx.eventTitle) +
    "</p>" +
    orgBlock +
    '<table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px;">' +
    dateRow +
    venueRow +
    "</table>" +
    qrBlock +
    '<div style="text-align:center;margin:8px 0 24px;">' +
    '<a href="' +
    escapeHtml(ctx.ticketUrl) +
    '" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">View your ticket →</a>' +
    "</div>" +
    '<p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">If you have questions, contact the organiser or reply to this email.</p>' +
    "</td></tr>" +
    '<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">' +
    '<p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p>' +
    "</td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const payload = (await req.json()) as { registration_id?: string };
    const registrationId = payload.registration_id;
    if (!registrationId) return json({ error: "registration_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select(
        "id, name, email, qr_code, approval_status, events:event_id(id, title, slug, date, timezone, venue, location, image_url, banner_landscape_url, organizations:org_id(name, logo_url))",
      )
      .eq("id", registrationId)
      .maybeSingle();

    if (regErr || !reg) {
      return json({ error: "Registration not found" }, 404);
    }

    const recipient = String(reg.email ?? "").trim().toLowerCase();
    if (!recipient) return json({ error: "Registration has no email" }, 400);

    type OrgRow = { name?: string | null; logo_url?: string | null } | null;
    type EventRow = {
      id: string;
      title: string;
      slug?: string | null;
      date?: string | null;
      timezone?: string | null;
      venue?: string | null;
      location?: string | null;
      image_url?: string | null;
      banner_landscape_url?: string | null;
      organizations?: OrgRow;
    } | null;

    const ev = reg.events as EventRow;
    const org = (ev && ev.organizations) as OrgRow;

    const eventTitle = (ev && ev.title) ? ev.title : "the event";
    const orgName = (org && org.name) ? org.name : "The organising team";
    const orgLogo = (org && org.logo_url) ? org.logo_url : null;
    const bannerUrl =
      (ev && ev.banner_landscape_url) ? ev.banner_landscape_url :
      (ev && ev.image_url) ? ev.image_url : null;
    const dateText = (ev && ev.date) ? formatDateInTz(ev.date, ev.timezone ?? null) : "";
    const venueText = [ev?.venue, ev?.location].filter(Boolean).join(" · ");
    const qrValue = (reg.qr_code as string | null) || (reg.id as string);
    const regId = reg.id as string;
    const approvalStatus = (reg.approval_status as string | null) || "approved";
    const attendeeName = (reg.name as string | null) || "there";

    const publicOrigin =
      Deno.env.get("PUBLIC_DOMAIN") ||
      Deno.env.get("VITE_PUBLIC_DOMAIN") ||
      Deno.env.get("VITE_PUBLIC_ORIGIN") ||
      "https://illuxus.com";
    const base = publicOrigin.indexOf("http") === 0
      ? stripTrailingSlash(publicOrigin)
      : "https://" + publicOrigin;
    const ticketUrl = base + "/t/" + regId;

    const html = buildHtml({
      attendeeName,
      eventTitle,
      orgName,
      orgLogoUrl: orgLogo,
      dateText,
      venueText,
      bannerUrl,
      qrValue,
      registrationId: regId,
      ticketUrl,
      approvalStatus,
    });

    const isPending = approvalStatus === "pending";
    const subject = isPending
      ? "Application received: " + eventTitle
      : "Your ticket for " + eventTitle;

    const textBodyLines = [
      "Hi " + (attendeeName.split(" ")[0] || attendeeName) + ",",
      isPending
        ? 'Your application for "' + eventTitle + '" is pending approval.'
        : 'Your registration for "' + eventTitle + '" is confirmed!',
    ];
    if (dateText)  textBodyLines.push("When: " + dateText);
    if (venueText) textBodyLines.push("Where: " + venueText);
    textBodyLines.push("View your ticket: " + ticketUrl);
    if (!isPending) textBodyLines.push("QR code: " + qrValue);
    textBodyLines.push("— " + orgName);
    const textBody = textBodyLines.join("\n\n");

    if (!smtpConfigured()) {
      return json({ ok: true, delivered: false, note: "SMTP not configured" });
    }

    const from = defaultFromAddress();
    const result = await sendViaSmtp({
      from,
      to: recipient,
      subject,
      html,
      text: textBody,
    });

    if (result.ok === false) return json({ ok: false, error: result.error }, 500);
    return json({ ok: true, delivered: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
