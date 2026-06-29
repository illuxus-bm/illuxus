/**
 * notifyOrganiserOfApplication — fire-and-forget email to the event
 * organiser when an attendee submits a speaker or sponsor application.
 *
 * Why
 * ───
 * The applications dialogs (`SpeakerApplicationDialog`, `SponsorApplicationDialog`)
 * persist a row into `speaker_applications` / `sponsor_applications` and then
 * show the applicant a "Submitted" toast. Until this helper existed, the
 * organiser had no idea — they only found out by happening to scroll into
 * the Applications tab and noticing a new badge. Most missed applications
 * for days or weeks.
 *
 * This helper:
 *   1. Resolves every email that should know about the new application
 *      (event creator + workspace owner + any org_members with role
 *      owner/admin), de-duplicated and format-validated.
 *   2. Pulls event identity (title, slug, org name) so the email body has
 *      enough context that the organiser doesn't have to dig.
 *   3. Calls the existing `send-event-email` edge function in system-mail
 *      mode (`event_id: "invite"`) — no migrations, no new functions.
 *
 * Failures are non-fatal. The application row already exists; a missed
 * notification doesn't lose data.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { isValidEmailFormat, normalizeEmail } from "@/lib/email-format";
import { uuid } from "@/lib/uuid";
import { publicOrigin } from "@/lib/publicUrl";

export type ApplicationKind = "speaker" | "sponsor";

export interface ApplicationNotifyInput {
  eventId: string;
  kind: ApplicationKind;
  applicantName: string;
  applicantEmail: string;
  /** Speaker: session title. Sponsor: company name. Surfaced in the email. */
  headline?: string | null;
  /** Optional one-line summary (session description / sponsorship objective). */
  summary?: string | null;
}

interface EventLookup {
  id: string;
  title: string | null;
  slug: string | null;
  user_id: string | null;
  organizations: { name: string | null; owner_id: string | null; slug: string | null } | null;
}

/** Resolve every email address that should get the heads-up. */
async function resolveRecipients(eventId: string): Promise<{
  emails: string[];
  event: EventLookup | null;
}> {
  const { data: ev } = await supabase
    .from("events")
    .select("id, title, slug, user_id, organizations(name, owner_id, slug)")
    .eq("id", eventId)
    .maybeSingle();
  const event = ev as unknown as EventLookup | null;
  if (!event) return { emails: [], event: null };

  // Collect user_ids worth notifying:
  //  • event creator
  //  • org owner (canonical)
  //  • every org_members row with role owner/admin
  const userIds = new Set<string>();
  if (event.user_id) userIds.add(event.user_id);
  if (event.organizations?.owner_id) userIds.add(event.organizations.owner_id);

  // Pull privileged org_members. RLS allows authenticated org members to
  // read their own org's member list, which is exactly what we need —
  // applicants are signed-in users by the time this runs.
  if (event.organizations) {
    const { data: orgRow } = await supabase
      .from("events")
      .select("org_id")
      .eq("id", eventId)
      .maybeSingle();
    const orgId = (orgRow as { org_id?: string | null } | null)?.org_id ?? null;
    if (orgId) {
      const { data: ownersAndAdmins } = await supabase
        .from("org_members")
        .select("user_id, role")
        .eq("org_id", orgId)
        .in("role", ["owner", "admin"]);
      for (const m of ownersAndAdmins ?? []) {
        if (m.user_id) userIds.add(m.user_id);
      }
    }
  }

  if (userIds.size === 0) return { emails: [], event };

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("user_id, email")
    .in("user_id", Array.from(userIds));
  const emails = Array.from(
    new Set(
      (profileRows ?? [])
        .map((p: { email?: string | null }) => normalizeEmail(p.email))
        .filter((e: string) => isValidEmailFormat(e)),
    ),
  );

  return { emails, event };
}

function escapeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function buildBody(args: {
  kind: ApplicationKind;
  applicantName: string;
  applicantEmail: string;
  headline: string | null;
  summary: string | null;
  eventTitle: string;
  orgName: string;
  reviewUrl: string;
}): string {
  const roleLabel = args.kind === "speaker" ? "speaker" : "sponsor";
  const lines = [
    `Hi,`,
    "",
    `A new ${roleLabel} application has just landed for "${args.eventTitle}".`,
    "",
    `Applicant: ${args.applicantName} <${args.applicantEmail}>`,
  ];
  if (args.headline) {
    lines.push(
      args.kind === "speaker"
        ? `Session title: ${escapeText(args.headline)}`
        : `Company: ${escapeText(args.headline)}`,
    );
  }
  if (args.summary) {
    lines.push("", escapeText(args.summary));
  }
  lines.push(
    "",
    `Review and respond from the dashboard: ${args.reviewUrl}`,
    "",
    `— ${args.orgName}`,
  );
  return lines.join("\n");
}

export async function notifyOrganiserOfApplication(
  input: ApplicationNotifyInput,
): Promise<{ ok: true; notified: number } | { ok: false; error: string }> {
  try {
    const { emails, event } = await resolveRecipients(input.eventId);
    if (!event) return { ok: false, error: "Event not found" };
    if (emails.length === 0) {
      logger.warn("application notify — no organiser recipients resolved", {
        event_id: input.eventId,
        kind: input.kind,
      });
      return { ok: false, error: "No organiser emails on file" };
    }

    const eventTitle = event.title || "your event";
    const orgName = event.organizations?.name || "The organising team";
    // Deep link to the event's Applications tab so the organiser jumps
    // straight to the queue. The dashboard supports `?tab=` so we use
    // the slug when available for a stable URL.
    const eventIdentifier = event.slug || event.id;
    const reviewUrl = `${publicOrigin()}/dashboard/events/${eventIdentifier}?tab=applications`;

    const subject =
      input.kind === "speaker"
        ? `New speaker application for ${eventTitle}`
        : `New sponsor application for ${eventTitle}`;

    const body = buildBody({
      kind: input.kind,
      applicantName: input.applicantName,
      applicantEmail: input.applicantEmail,
      headline: input.headline ?? null,
      summary: input.summary ?? null,
      eventTitle,
      orgName,
      reviewUrl,
    });

    const { data, error } = await supabase.functions.invoke("send-event-email", {
      body: {
        event_id: "invite",
        email_id: uuid(),
        subject,
        body,
        recipient_emails: emails,
      },
    });
    if (error) {
      logger.warn("application notify edge function error", {
        event_id: input.eventId,
        kind: input.kind,
        error_message: error.message,
      });
      return { ok: false, error: error.message };
    }
    type SendResult = { success?: boolean; sent?: number; error?: string };
    const result = (data ?? null) as SendResult | null;
    if (result?.error) return { ok: false, error: result.error };
    return { ok: true, notified: result?.sent ?? emails.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("application notify threw", {
      event_id: input.eventId,
      kind: input.kind,
      error_message: msg,
    });
    return { ok: false, error: msg };
  }
}
