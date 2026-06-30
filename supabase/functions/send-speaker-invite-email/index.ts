/**
 * send-speaker-invite-email
 *
 * Rich HTML email to a speaker — fired when the organiser adds them
 * directly (kind="added") or approves a pending application
 * (kind="approved"). Mirrors `send-ticket-email` and
 * `send-sponsor-invite-email`'s visual language.
 *
 * Local-CLI version. Deploy the sibling `dashboard-inline.ts` via the
 * Supabase Dashboard editor (which doesn't follow `../_shared` imports).
 *
 * Request body:
 *   { speaker_id: uuid, event_id: uuid, kind?: "added" | "approved" }
 *
 * Required secrets:
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM (optional)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("send-speaker-invite-email");

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

function formatDateInTz(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: tz || "UTC",
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Kind = "added" | "approved";

function copyFor(kind: Kind, orgName: string, speakerName: string) {
  if (kind === "approved") {
    return {
      pill: "Application approved",
      headline: "Congratulations — you're in!",
      greetingLead: `${orgName} has approved your speaker application. You'll be on stage at the event below.`,
      subject: (t: string) => `Your speaker application is approved — ${t}`,
    };
  }
  return {
    pill: "Speaker invitation",
    headline: "You're on stage!",
    greetingLead: `${orgName} has added ${speakerName} as a speaker for the event below.`,
    subject: (t: string) => `You've been added as a speaker for ${t}`,
  };
}

function buildHtml(ctx: {
  speakerName: string;
  eventTitle: string;
  orgName: string;
  orgLogoUrl: string | null;
  dateText: string;
  venueText: string;
  bannerUrl: string | null;
  portalUrl: string;
  copy: ReturnType<typeof copyFor>;
}): string {
  const orgBlock = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
      <tr>
        ${ctx.orgLogoUrl ? `<td style="padding-right:8px;vertical-align:middle"><img src="${escapeHtml(ctx.orgLogoUrl)}" alt="" width="24" height="24" style="border-radius:4px;display:block;" /></td>` : ""}
        <td style="vertical-align:middle;font-size:13px;color:#6b7280;">Organised by <strong style="color:#374151">${escapeHtml(ctx.orgName)}</strong></td>
      </tr>
    </table>`;

  const bannerBlock = ctx.bannerUrl
    ? `<img src="${escapeHtml(ctx.bannerUrl)}" alt="${escapeHtml(ctx.eventTitle)}" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;" />`
    : `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);height:120px;border-radius:8px 8px 0 0;"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(ctx.copy.subject(ctx.eventTitle))}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td>${bannerBlock}</td></tr>
        <tr><td style="padding:28px 32px 24px;">
          <div style="display:inline-block;background:#2563eb1a;color:#2563eb;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(ctx.copy.pill)}</div>
          <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.copy.headline)}</p>
          <p style="font-size:15px;color:#4b5563;margin:0 0 20px;">
            Hi <strong>${escapeHtml(ctx.speakerName.split(" ")[0] || ctx.speakerName)}</strong>,
            ${escapeHtml(ctx.copy.greetingLead)}
          </p>
          <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">${escapeHtml(ctx.eventTitle)}</p>
          ${orgBlock}
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px;">
            ${ctx.dateText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:20px;vertical-align:top;">📅</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.dateText)}</td></tr>` : ""}
            ${ctx.venueText ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">📍</td><td style="padding:4px 0 4px 8px;font-size:13px;color:#374151;">${escapeHtml(ctx.venueText)}</td></tr>` : ""}
          </table>
          <div style="text-align:center;margin:8px 0 16px;">
            <a href="${escapeHtml(ctx.portalUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:6px;text-decoration:none;">
              Open the speaker portal →
            </a>
          </div>
          <p style="font-size:13px;color:#4b5563;line-height:1.55;margin:0 0 12px;">
            Sign in to update your bio, headshot, session details, and any slides you'd like to share.
            If you don't have an Illuxus account yet, create one using this same email — your speaker access will be linked automatically.
          </p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;text-align:center;">
            Questions? Reply to this email and the organising team will reach you.
          </p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Powered by <strong style="color:#6b7280;">illuxus</strong></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { speaker_id, event_id, kind: rawKind } = await req.json() as {
      speaker_id?: string; event_id?: string; kind?: Kind;
    };
    if (!speaker_id || !event_id) return json({ error: "speaker_id and event_id are required" }, 400);
    const kind: Kind = rawKind === "approved" ? "approved" : "added";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: speaker }, { data: event }] = await Promise.all([
      supabase.from("speakers").select("id, name, email").eq("id", speaker_id).maybeSingle(),
      supabase.from("events")
        .select("id, title, slug, date, timezone, venue, location, image_url, banner_landscape_url, organizations:org_id(name, logo_url)")
        .eq("id", event_id)
        .maybeSingle(),
    ]);

    if (!speaker) { log.error("speaker not found", { speaker_id }); return json({ error: "Speaker not found" }, 404); }
    if (!event)   { log.error("event not found",   { event_id   }); return json({ error: "Event not found"   }, 404); }

    const recipient = (speaker.email || "").trim().toLowerCase();
    if (!recipient) return json({ ok: true, delivered: false, note: "Speaker has no email" });

    type OrgRow = { name?: string | null; logo_url?: string | null } | null;
    const org = event.organizations as OrgRow;
    const orgName = org?.name || "The organising team";
    const orgLogo = org?.logo_url || null;

    const eventTitle = event.title || "the event";
    const bannerUrl = event.banner_landscape_url || event.image_url || null;
    const dateText = event.date ? formatDateInTz(event.date, event.timezone ?? null) : "";
    const venueText = [event.venue, event.location].filter(Boolean).join(" · ");

    const publicOrigin = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN")
      || Deno.env.get("VITE_PUBLIC_ORIGIN") || "https://illuxus.com";
    const base = publicOrigin.startsWith("http") ? publicOrigin.replace(/\/+$/, "") : `https://${publicOrigin}`;
    const portalUrl = `${base}/speaker`;

    const copy = copyFor(kind, orgName, speaker.name || "the speaker");

    const html = buildHtml({
      speakerName: speaker.name || "Speaker",
      eventTitle, orgName, orgLogoUrl: orgLogo,
      dateText, venueText, bannerUrl, portalUrl, copy,
    });

    const textBody = [
      `Hi ${speaker.name || "there"},`,
      "",
      copy.greetingLead,
      "",
      dateText  ? `When:  ${dateText}`  : "",
      venueText ? `Where: ${venueText}` : "",
      "",
      `Open the speaker portal: ${portalUrl}`,
      "",
      "Sign in to update your bio, headshot, session details, and any slides.",
      "If you don't have an Illuxus account yet, create one using this same email — your speaker access will be linked automatically.",
      "",
      `— ${orgName}`,
    ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!smtpConfigured()) {
      log.info("speaker invite skipped — SMTP not configured", { speaker_id, event_id, kind });
      return json({ ok: true, delivered: false, note: "SMTP not configured" });
    }

    const from = defaultFromAddress();
    const result = await sendViaSmtp({ from, to: recipient, subject: copy.subject(eventTitle), html, text: textBody });
    if (!result.ok) {
      log.error("speaker invite send failed", { speaker_id, event_id, kind, error_message: result.error });
      return json({ ok: false, error: result.error }, 500);
    }
    log.info("speaker invite sent", { speaker_id, event_id, kind, recipient });
    return json({ ok: true, delivered: true });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
