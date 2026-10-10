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
 *   1. Pulls event identity (title, slug, org name) so the email body has
 *      enough context that the organiser doesn't have to dig.
 *   2. Calls the `send-event-email` edge function in "application" mode.
 *      The function verifies the caller really has an application for the
 *      event and resolves the organisers' addresses itself (event creator,
 *      workspace owner, org owners/admins). The browser never chooses the
 *      recipients, and never needs to read other users' email addresses —
 *      which it could not do anyway (emails live in auth.users).
 *
 * Failures are non-fatal. The application row already exists; a missed
 * notification doesn't lose data.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
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

/** Event identity used to word the notification. */
async function lookupEvent(eventId: string): Promise<EventLookup | null> {
  const { data: ev } = await supabase
    .from("events")
    .select("id, title, slug, user_id, organizations(name, owner_id, slug)")
    .eq("id", eventId)
    .maybeSingle();
  return ev as unknown as EventLookup | null;
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
    const event = await lookupEvent(input.eventId);
    if (!event) return { ok: false, error: "Event not found" };

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
        // The server checks the caller's application for this event and
        // delivers to the event's organisers.
        event_id: "application",
        target_event_id: event.id,
        email_id: uuid(),
        subject,
        body,
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
    return { ok: true, notified: result?.sent ?? 0 };
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
