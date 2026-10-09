/**
 * send-event-email
 *
 * Sends event and system emails via SMTP. Every request must come from a
 * signed-in user, and the function decides who may be emailed — the caller
 * never gets to send arbitrary content to arbitrary addresses.
 *
 * Request body (JSON):
 * {
 *   event_id:         string   — an event UUID, or one of the system kinds
 *                                "invite" | "support" | "application" | "partner-invite"
 *   email_id:         string   — event_emails row id (event mode), else any id
 *   subject:          string
 *   body:             string   — plain text
 *   recipient_emails: string[] — event + invite modes (ignored otherwise)
 *   target_event_id:  string   — "application" mode: the event applied to
 * }
 *
 * Who may send what:
 *   • event UUID    — a manager of that event (creator, org owner, non-viewer
 *                     org member, platform admin). Recipients are limited to
 *                     the event's registrants and speakers; anything else is
 *                     skipped.
 *   • "invite"      — a workspace owner/admin, only to addresses that have an
 *                     invitation in a workspace they manage (team invites and
 *                     removal notices).
 *   • "support"     — any signed-in user; always delivered to the support
 *                     inbox, whatever recipients were supplied.
 *   • "partner-invite" — an organiser of `target_event_id`, only to
 *                     addresses that event's tracked links are shared with.
 *   • "application" — a user who has a speaker/sponsor application for
 *                     `target_event_id`; delivered to that event's organisers,
 *                     resolved here.
 *
 * Required Supabase secrets:
 *   SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD
 *   SMTP_FROM       optional, e.g. "Illuxus <noreply@yourdomain.com>"
 *   SUPPORT_EMAIL   optional, defaults to support@illuxus.com
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultFromAddress, sendViaSmtp, smtpConfigured, textToHtml } from "../_shared/smtp.ts";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import {
  getCallerUser, getManagedEvent, isUuid, managedOrgIds, normalizeEmails, serviceClient,
} from "../_shared/auth.ts";

const log = createEdgeLogger("send-event-email");

const MAX_SUBJECT = 300;
const MAX_BODY = 50_000;
/** Team invites / removal notices go to one or two people at a time. */
const MAX_INVITE_RECIPIENTS = 5;

type Resolution =
  | { ok: true; recipients: string[]; skipped: number; fromName: string; replyTo?: string; eventEmailId?: string }
  | { ok: false; status: number; error: string };

/** Event mode: caller must manage the event; recipients must belong to it. */
async function resolveEvent(
  admin: SupabaseClient, userId: string, eventId: string, emailId: string, requested: string[],
): Promise<Resolution> {
  const event = await getManagedEvent(admin, userId, eventId);
  if (!event) return { ok: false, status: 403, error: "You don't have access to this event" };

  const { data: emailRecord } = await admin
    .from("event_emails").select("id").eq("id", emailId).eq("event_id", eventId).maybeSingle();
  if (!emailRecord) return { ok: false, status: 403, error: "Email record not found or access denied" };

  // Audience the event's organisers may email: registrants and speakers.
  const allowed = new Set<string>();
  const { data: regs } = await admin.from("registrations").select("email").eq("event_id", eventId);
  for (const r of regs ?? []) {
    const e = (r as { email?: string | null }).email?.trim().toLowerCase();
    if (e) allowed.add(e);
  }
  const { data: rels } = await admin.from("event_speakers").select("speaker_id").eq("event_id", eventId);
  const speakerIds = (rels ?? []).map((r) => (r as { speaker_id: string }).speaker_id);
  if (speakerIds.length) {
    const { data: speakers } = await admin.from("speakers").select("email").in("id", speakerIds);
    for (const s of speakers ?? []) {
      const e = (s as { email?: string | null }).email?.trim().toLowerCase();
      if (e) allowed.add(e);
    }
  }
  const recipients = requested.filter((e) => allowed.has(e));

  let fromName = event.title ?? "Illuxus";
  let replyTo: string | undefined;
  if (event.org_id) {
    const { data: org } = await admin
      .from("organizations").select("name, billing_email").eq("id", event.org_id).maybeSingle();
    const o = org as { name?: string | null; billing_email?: string | null } | null;
    if (o?.name) fromName = o.name;
    if (o?.billing_email) replyTo = o.billing_email;
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName, replyTo, eventEmailId: emailId };
}

/** Invite mode: only to invitees of a workspace the caller owns or administers. */
async function resolveInvite(admin: SupabaseClient, userId: string, requested: string[]): Promise<Resolution> {
  if (requested.length > MAX_INVITE_RECIPIENTS) {
    return { ok: false, status: 400, error: `At most ${MAX_INVITE_RECIPIENTS} recipients per invitation email` };
  }
  const orgIds = await managedOrgIds(admin, userId);
  if (orgIds.length === 0) return { ok: false, status: 403, error: "Only workspace owners and admins can send invitations" };

  const { data: invites } = await admin
    .from("org_invitations").select("email").in("org_id", orgIds).in("email", requested);
  const invited = new Set((invites ?? []).map((i) => (i as { email: string }).email.trim().toLowerCase()));
  const recipients = requested.filter((e) => invited.has(e));
  if (recipients.length === 0) {
    return { ok: false, status: 403, error: "Recipient has no invitation in a workspace you manage" };
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName: "Illuxus" };
}

/** Partner-invite mode: only to partners one of the caller's event links is shared with. */
async function resolvePartnerInvite(
  admin: SupabaseClient, userId: string, targetEventId: unknown, requested: string[],
): Promise<Resolution> {
  if (!isUuid(targetEventId)) return { ok: false, status: 400, error: "target_event_id is required" };
  if (requested.length > MAX_INVITE_RECIPIENTS) {
    return { ok: false, status: 400, error: `At most ${MAX_INVITE_RECIPIENTS} recipients per invitation email` };
  }
  const event = await getManagedEvent(admin, userId, targetEventId);
  if (!event) return { ok: false, status: 403, error: "You don't have access to this event" };

  const { data: shares } = await admin
    .from("utm_partner_access").select("invited_email")
    .eq("event_id", targetEventId).neq("status", "revoked").in("invited_email", requested);
  const invited = new Set((shares ?? []).map((s) => (s as { invited_email: string }).invited_email.trim().toLowerCase()));
  const recipients = requested.filter((e) => invited.has(e));
  if (recipients.length === 0) {
    return { ok: false, status: 403, error: "Recipient has no shared link for this event" };
  }
  return { ok: true, recipients, skipped: requested.length - recipients.length, fromName: "Illuxus" };
}

/** Application mode: to the organisers of an event the caller has applied to. */
async function resolveApplication(admin: SupabaseClient, userId: string, targetEventId: unknown): Promise<Resolution> {
  if (!isUuid(targetEventId)) return { ok: false, status: 400, error: "target_event_id is required" };

  const [{ data: speakerApp }, { data: sponsorApp }] = await Promise.all([
    admin.from("speaker_applications").select("id").eq("event_id", targetEventId).eq("user_id", userId).limit(1),
    admin.from("sponsor_applications").select("id").eq("event_id", targetEventId).eq("user_id", userId).limit(1),
  ]);
  if (!(speakerApp?.length || sponsorApp?.length)) {
    return { ok: false, status: 403, error: "No application found for this event" };
  }

  const { data: ev } = await admin.from("events").select("user_id, org_id").eq("id", targetEventId).maybeSingle();
  const event = ev as { user_id: string | null; org_id: string | null } | null;
  if (!event) return { ok: false, status: 404, error: "Event not found" };

  const organiserIds = new Set<string>();
  if (event.user_id) organiserIds.add(event.user_id);
  if (event.org_id) {
    const [{ data: org }, { data: managers }] = await Promise.all([
      admin.from("organizations").select("owner_id").eq("id", event.org_id).maybeSingle(),
      admin.from("org_members").select("user_id").eq("org_id", event.org_id).in("role", ["owner", "admin"]),
    ]);
    const ownerId = (org as { owner_id?: string | null } | null)?.owner_id;
    if (ownerId) organiserIds.add(ownerId);
    for (const m of managers ?? []) organiserIds.add((m as { user_id: string }).user_id);
  }

  const emails: string[] = [];
  for (const id of organiserIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  const recipients = normalizeEmails(emails);
  if (recipients.length === 0) return { ok: false, status: 404, error: "No organiser emails on file" };
  return { ok: true, recipients, skipped: 0, fromName: "Illuxus" };
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
    const payload = await req.json().catch(() => null) as {
      event_id?: unknown; email_id?: unknown; subject?: unknown; body?: unknown;
      recipient_emails?: unknown; target_event_id?: unknown;
    } | null;

    const eventId = typeof payload?.event_id === "string" ? payload.event_id : "";
    const emailId = typeof payload?.email_id === "string" ? payload.email_id : "";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const emailBody = typeof payload?.body === "string" ? payload.body : "";

    if (!eventId || !emailId || !subject || !emailBody.trim()) {
      return json({ error: "Missing required fields: event_id, email_id, subject, body" }, 400);
    }
    if (subject.length > MAX_SUBJECT || emailBody.length > MAX_BODY) {
      return json({ error: "Subject or body is too long" }, 400);
    }

    const admin = serviceClient();
    const caller = await getCallerUser(req, admin);
    if (!caller) return json({ error: "Sign in required" }, 401);

    const requested = normalizeEmails(payload?.recipient_emails);

    let resolved: Resolution;
    if (eventId === "support") {
      const support = normalizeEmails([Deno.env.get("SUPPORT_EMAIL") || "support@illuxus.com"]);
      resolved = { ok: true, recipients: support, skipped: 0, fromName: "Illuxus Support", replyTo: caller.email ?? undefined };
    } else if (eventId === "invite") {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      resolved = await resolveInvite(admin, caller.id, requested);
    } else if (eventId === "partner-invite") {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      resolved = await resolvePartnerInvite(admin, caller.id, payload?.target_event_id, requested);
    } else if (eventId === "application") {
      resolved = await resolveApplication(admin, caller.id, payload?.target_event_id);
    } else if (isUuid(eventId)) {
      if (requested.length === 0) return json({ error: "recipient_emails must be a non-empty array" }, 400);
      if (!isUuid(emailId)) return json({ error: "email_id must be the event_emails row id" }, 400);
      resolved = await resolveEvent(admin, caller.id, eventId, emailId, requested);
    } else {
      return json({ error: "Unknown event_id" }, 400);
    }

    if (!resolved.ok) {
      log.warn("send refused", { kind: isUuid(eventId) ? "event" : eventId, status: resolved.status, reason: resolved.error });
      return json({ error: resolved.error }, resolved.status);
    }

    const { recipients, skipped, fromName, replyTo, eventEmailId } = resolved;
    if (recipients.length === 0) {
      return json({ error: "None of the recipients belong to this event's registrants or speakers.", skipped }, 400);
    }

    const from = defaultFromAddress(fromName);
    const htmlContent = textToHtml(emailBody);

    if (!smtpConfigured()) {
      log.info("not delivered — SMTP not configured", { subject, recipient_count: recipients.length });
      if (eventEmailId) {
        await admin.from("event_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", eventEmailId);
      }
      return json({
        success: true,
        sent: recipients.length,
        failed: 0,
        skipped,
        provider: "console",
        note: "SMTP not configured — email logged only. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD in Supabase secrets.",
      });
    }

    // SMTP relays expect one envelope per recipient; some providers (Gmail
    // especially) silently rate-limit when batched with many `To:` addrs.
    // Sending one-by-one keeps deliverability predictable and lets us
    // record exactly which addresses failed.
    const failures: string[] = [];
    let firstSmtpError: string | undefined;
    for (const to of recipients) {
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: htmlContent,
        text: emailBody,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });
      if (!result.ok) {
        log.error("smtp send failed", { to, error_message: result.error });
        failures.push(to);
        firstSmtpError ??= result.error;
      }
    }

    if (failures.length === recipients.length) {
      if (eventEmailId) {
        await admin.from("event_emails").update({ status: "draft", sent_at: null }).eq("id", eventEmailId);
      }
      return json({
        error: `All email sends failed (${firstSmtpError?.slice(0, 200) ?? "unknown SMTP error"}). Check SMTP credentials and that the From address matches your verified sender.`,
        failed_count: failures.length,
      }, 500);
    }

    if (eventEmailId) {
      await admin.from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", eventEmailId);
    }

    return json({
      success: true,
      sent: recipients.length - failures.length,
      failed: failures.length,
      skipped,
      provider: "smtp",
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
