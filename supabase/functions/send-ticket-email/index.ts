/**
 * send-ticket-email
 *
 * Sends a rich HTML ticket-confirmation email to an attendee immediately
 * after they register for an event. Called from the frontend (EventRsvpCard)
 * as a fire-and-forget after a successful registration insert.
 *
 * ── Request body (JSON) ────────────────────────────────────────────────────
 *   {
 *     registration_id: string   (uuid — the newly-created registrations row)
 *   }
 *
 * ── What the email contains ─────────────────────────────────────────────────
 *   • Event banner (banner_landscape_url → image_url fallback)
 *   • Event title (exactly as stored)
 *   • "Organised by  <org logo>  <org name>" line
 *   • Date + time in the event's timezone
 *   • Venue / location
 *   • QR code PNG (rendered via qrcode.run API — no npm dependency needed)
 *   • Ticket ID for reference
 *   • "View your ticket" CTA button
 *
 * ── Required Supabase secrets ──────────────────────────────────────────────
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM (optional)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("send-ticket-email");

// ── SMTP helpers (inlined so this function has no _shared dependency issue) ──

function smtpConfigured(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

function defaultFromAddress(): string {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || "Illuxus <noreply@example.com>";
  return from.includes("<") ? from : `Illuxus <${from}>`;
}

async function sendViaSmtp(opts: {
  from: string; to: string; subject: string; html: string; text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: SMTPClient | null = null;
  try {
    const host = Deno.env.get("SMTP_HOST")!;
    const port = Number(Deno.env.get("SMTP_PORT") || "465");
    const username = Deno.env.get("SMTP_USERNAME")!;
    const password = Deno.env.get("SMTP_PASSWORD")!;
    client = new SMTPClient({
      connection: { hostname: host, port, tls: port === 465, auth: { username, password } },
    });
    await client.send({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      content: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    if (client) { try { await client.close(); } catch { /* noop */ } }
  }
}

// ── Date formatting helper ─────────────────────────────────────────────────

function formatDateInTz(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── QR code via Google Charts API ─────────────────────────────────────────
// Encodes the QR value as a 240×240 PNG URL. No npm package needed.
function qrCodeUrl(value: string): string {
  const encoded = encodeURIComponent(value);
  return `https://chart.googleapis.com/chart?cht=qr&chs=240x240&chl=${encoded}&choe=UTF-8`;
}

// ── HTML email template ─────────────────────────────────────────────────────

function buildHtml(ctx: {
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
}): string {
  const isPending = ctx.approvalStatus === "pending";
  const statusColor = isPending ? "#f59e0b" : "#16a34a";
  const statusLabel = isPending ? "Pending Approval" : "Confirmed";
  const statusMsg = isPending
    ? "Your registration is pending approval. We'll notify you once confirmed."
    : "Your registration is confirmed. See you there!";

  const orgBlock = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
      <tr>
        ${ctx.orgLogoUrl ? `<td style="padding-right:8px;vertical-align:middle"><img src="${escapeHtml(ctx.orgLogoUrl)}" alt="" width="24" height="24" style="border-radius:4px;display:block;" /></td>` : ""}
        <td style="vertical-align:middle;font-size:13px;color:#6b7280;">Organised by <strong style="color:#374151">${escapeHtml(ctx.orgName)}</strong></td>
      </tr>
    </table>`;

  const bannerBlock = ctx.bannerUrl
    ? `<img src="${escapeHtml(ctx.bannerUrl)}" alt="${escapeHtml(ctx.eventTitle)}" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;margin-bottom:0;" />`
    : `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);height:120px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;"></div>`;

  const qrBlock = !isPending ? `
    <div style="margin:24px 0;text-align:center;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">Scan at the venue for check-in</p>
      <img src="${qrCodeUrl(ctx.qrValue)}" alt="Your ticket QR code" width="160" height="160" style="display:inline-block;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" />
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;font-family:monospace;">${escapeHtml(ctx.registrationId.slice(0, 8).toUpperCase())}</p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your ticket for ${escapeHtml(ctx.eventTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

        <!-- Banner -->
        <tr><td>${bannerBlock}</td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px 24px;">

          <!-- Status pill -->
          <div style="display:inline-block;background:${statusColor}1a;color:${statusColor};font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(statusLabel)}</div>

          <!-- Greeting -->
          <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">
            ${isPending ? "Application Received!" : "You're going!"}
          </p>
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;">
            Hi <strong>${escapeHtml(ctx.attendeeName.split(" ")[0] || ctx.attendeeName)}</strong>, ${statusMsg}
          </p>

          <!-- Event title -->
          <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.eventTitle)}</p>

          <!-- Organiser -->
          ${orgBlock}

          <!-- Details table -->
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px;">
            ${ctx.dateText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:20px;vertical-align:top;">📅</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.dateText)}</td></tr>` : ""}
            ${ctx.venueText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">📍</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.venueText)}</td></tr>` : ""}
          </table>

          <!-- QR code -->
          ${qrBlock}

          <!-- CTA button -->
          <div style="text-align:center;margin:8px 0 24px;">
            <a href="${escapeHtml(ctx.ticketUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">
              View your ticket →
            </a>
          </div>

          <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">
            If you have questions, contact the organiser or reply to this email.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { registration_id } = await req.json() as { registration_id?: string };
    if (!registration_id) return json({ error: "registration_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the registration + all event/org fields needed for the email in a
    // single join so there's no N+1 round-trip.
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select(`
        id, name, email, qr_code, approval_status,
        events:event_id(
          id, title, slug, date, timezone,
          venue, location, image_url, banner_landscape_url,
          organizations:org_id(name, logo_url)
        )
      `)
      .eq("id", registration_id)
      .maybeSingle();

    if (regErr || !reg) {
      log.error("registration not found", { registration_id, error_message: regErr?.message });
      return json({ error: "Registration not found" }, 404);
    }

    const email = (reg.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Registration has no email" }, 400);

    type OrgRow = { name?: string | null; logo_url?: string | null } | null;
    type EventRow = {
      id: string; title: string; slug?: string | null;
      date?: string | null; timezone?: string | null;
      venue?: string | null; location?: string | null;
      image_url?: string | null; banner_landscape_url?: string | null;
      organizations?: OrgRow;
    } | null;

    const ev = reg.events as EventRow;
    const org = ev?.organizations as OrgRow;
    const orgName = org?.name || "The organising team";
    const orgLogo = org?.logo_url || null;

    const eventTitle = ev?.title || "the event";
    const bannerUrl = ev?.banner_landscape_url || ev?.image_url || null;
    const dateText = ev?.date ? formatDateInTz(ev.date, ev.timezone ?? null) : "";
    const venueText = [ev?.venue, ev?.location].filter(Boolean).join(" · ");

    const qrValue = reg.qr_code || reg.id;
    const regId = reg.id as string;

    // Build a canonical ticket URL the attendee can use to view their ticket.
    const publicOrigin = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN")
      || Deno.env.get("VITE_PUBLIC_ORIGIN") || "https://illuxus.com";
    const base = publicOrigin.startsWith("http") ? publicOrigin.replace(/\/+$/, "") : `https://${publicOrigin}`;
    const ticketUrl = `${base}/t/${regId}`;

    const attendeeName = (reg.name as string | null) || "there";
    const approvalStatus = (reg.approval_status as string | null) || "approved";

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
      ? `Application received: ${eventTitle}`
      : `Your ticket for ${eventTitle}`;
    const textBody = [
      `Hi ${attendeeName.split(" ")[0] || attendeeName},`,
      "",
      isPending
        ? `Your application for "${eventTitle}" has been received and is pending approval.`
        : `Your registration for "${eventTitle}" is confirmed!`,
      "",
      dateText   ? `When:  ${dateText}`   : "",
      venueText  ? `Where: ${venueText}`  : "",
      orgName    ? `Organised by: ${orgName}` : "",
      "",
      `View your ticket: ${ticketUrl}`,
      "",
      isPending ? "" : `Your QR code (use at check-in): ${qrValue}`,
      "",
      "See you there!",
      `— ${orgName}`,
    ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!smtpConfigured()) {
      log.info("ticket email not sent — SMTP not configured", { registration_id, email });
      return json({ ok: true, delivered: false, note: "SMTP not configured" });
    }

    const from = defaultFromAddress();
    const result = await sendViaSmtp({ from, to: email, subject, html, text: textBody });
    if (!result.ok) {
      log.error("ticket email failed", { registration_id, email, error_message: result.error });
      return json({ ok: false, error: result.error }, 500);
    }

    log.info("ticket email sent", { registration_id, email });
    return json({ ok: true, delivered: true });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
