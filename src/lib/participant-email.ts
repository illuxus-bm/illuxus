import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { formatEventDateTime } from "@/lib/datetime";
import { isValidEmailFormat, normalizeEmail } from "@/lib/email-format";

/**
 * Build + send the "you've been added to this event" welcome email used by
 * both `AddParticipantDialog` and the CSV-import path. Lives in a shared
 * library module so the two surfaces stay in lock-step on subject line, body
 * structure, and role copy.
 *
 * Delivery uses the existing `send-event-email` edge function with the
 * `event_id: "invite"` system-mail mode so we don't have to create an
 * `event_emails` audit row for every welcome message.
 *
 * Wrapped in a try/catch and called fire-and-forget by the dialogs — the
 * registration is already in place by the time we get here, so a Resend
 * outage MUST NOT block adding the person.
 */

export type ParticipantEmailRole = "attendee" | "speaker" | "sponsor";

/**
 * Map our internal ticket_type / role values to the labels we want shown in
 * the email body. Kept centralised so the dashboard and the email never
 * disagree on what "speaker" means.
 */
export function roleFromTicketType(ticketType: string | null | undefined, fallback: ParticipantEmailRole = "attendee"): ParticipantEmailRole {
  const v = (ticketType || "").toLowerCase();
  if (v === "speaker") return "speaker";
  if (v === "sponsor") return "sponsor";
  return fallback;
}

const roleLabel: Record<ParticipantEmailRole, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  sponsor: "Sponsor",
};

const roleArticle: Record<ParticipantEmailRole, string> = {
  attendee: "an",
  speaker: "a",
  sponsor: "a",
};

export interface ParticipantEmailInput {
  /** Event we're confirming registration for. */
  eventId: string;
  /** Display name used in the greeting and the subject. */
  recipientName: string;
  /** Recipient inbox; lower-cased before send. */
  recipientEmail: string;
  /** Role to print in the body, e.g. "Attendee" / "Speaker" / "Sponsor". */
  role: ParticipantEmailRole;
  /** Optional mobile number used as the temporary password. Only mentioned
   *  in the body when present. */
  initialPassword?: string | null;
  /** Direct attendee join link if the event is virtual. */
  joinUrl?: string | null;
  /** Public-facing event landing page (used for physical events or as a
   *  fallback link). */
  eventUrl?: string | null;
}

/**
 * Build and send a single welcome email. Returns `{ ok: true }` on a
 * 2xx response from `send-event-email`, otherwise an `{ ok: false, error }`
 * object. Errors are logged but never thrown — the caller fires this and
 * forgets.
 */
export async function sendParticipantWelcomeEmail(
  input: ParticipantEmailInput,
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  // Last-line defence: refuse to call the SMTP function with a malformed
  // address. Without this guard, the function still attempts the send,
  // SMTP rejects it ("5.1.3 Bad recipient address syntax"), and the dashboard
  // user only finds out via a log line. Surfacing it here means the caller's
  // toast tells the organiser exactly which address needs fixing.
  const normalizedRecipient = normalizeEmail(input.recipientEmail);
  if (!isValidEmailFormat(normalizedRecipient)) {
    logger.warn("participant welcome email skipped — invalid recipient", {
      event_id: input.eventId,
      recipient: normalizedRecipient,
    });
    return { ok: false, error: `Invalid recipient email "${input.recipientEmail}"` };
  }

  try {
    // Pull just enough event context to compose a friendly body. One row,
    // one round-trip; the function itself doesn't need this — the dashboard
    // does, because we're not putting the welcome in `event_emails`.
    const { data: ev } = await supabase
      .from("events")
      .select("title, slug, date, timezone, venue, location, organizations(name)")
      .eq("id", input.eventId)
      .maybeSingle();

    const eventTitle = ev?.title || "the event";
    const orgName = (ev as { organizations?: { name?: string | null } | null } | null)?.organizations?.name || "The organising team";
    const dateText = ev?.date ? formatEventDateTime(ev.date, ev.timezone || undefined) : "";
    const venueText = [ev?.venue, ev?.location].filter(Boolean).join(" · ");

    const subject = `You're registered for ${eventTitle} as ${roleLabel[input.role]}`;
    const body = buildBody({
      eventTitle,
      orgName,
      dateText,
      venueText,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      role: input.role,
      initialPassword: input.initialPassword,
      joinUrl: input.joinUrl,
      eventUrl: input.eventUrl,
    });

    const { data, error } = await supabase.functions.invoke("send-event-email", {
      body: {
        event_id: "invite", // system-mail mode: no event_emails row needed
        email_id: crypto.randomUUID(),
        subject,
        body,
        recipient_emails: [normalizedRecipient],
      },
    });

    if (error) {
      logger.warn("participant welcome email failed", {
        error_message: error.message,
        event_id: input.eventId,
        recipient: input.recipientEmail.toLowerCase(),
      });
      return { ok: false, error: error.message };
    }

    type SendResult = { success?: boolean; sent?: number; failed?: number; error?: string };
    const result = (data ?? null) as SendResult | null;
    if (result?.error) return { ok: false, error: result.error };
    return { ok: true, sent: result?.sent ?? 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("participant welcome email threw", {
      error_message: msg,
      event_id: input.eventId,
      recipient: input.recipientEmail.toLowerCase(),
    });
    return { ok: false, error: msg };
  }
}

/**
 * Plain-text body. `send-event-email` wraps it in a minimal HTML shell on
 * the server before handing it to Resend, so a clean plain-text version is
 * all we need. Sections are conditional — we never print empty lines for
 * missing data.
 */
function buildBody(args: {
  eventTitle: string;
  orgName: string;
  dateText: string;
  venueText: string;
  recipientName: string;
  recipientEmail: string;
  role: ParticipantEmailRole;
  initialPassword?: string | null;
  joinUrl?: string | null;
  eventUrl?: string | null;
}): string {
  const greetingName = firstNameFrom(args.recipientName);
  const article = roleArticle[args.role];
  const lines: string[] = [
    `Hi ${greetingName},`,
    "",
    `You've been added to "${args.eventTitle}" as ${article} ${roleLabel[args.role]}.`,
  ];

  // Event details block
  const details: string[] = [];
  if (args.dateText)  details.push(`When: ${args.dateText}`);
  if (args.venueText) details.push(`Where: ${args.venueText}`);
  if (details.length) {
    lines.push("");
    lines.push(...details);
  }

  // Role-specific guidance
  lines.push("");
  if (args.role === "speaker") {
    lines.push("As a speaker, you'll be on stage during the session. Your dedicated speaker access link will be shared closer to the event.");
  } else if (args.role === "sponsor") {
    lines.push("As a sponsor, you'll have access to the sponsor portal for this event. Sign in to manage your booth, contacts, and lead list.");
  } else {
    lines.push("As an attendee, you're all set. Use the link below to join when the event is live.");
  }

  // Primary action link
  const link = args.joinUrl || args.eventUrl;
  if (link) {
    lines.push("");
    lines.push("Your access link:");
    lines.push(link);
  }

  // Login credentials (only if we have an initial password to share)
  if (args.initialPassword) {
    lines.push("");
    lines.push("Sign in to your account at any time:");
    lines.push(`- Email: ${args.recipientEmail}`);
    lines.push(`- Temporary password: ${args.initialPassword} (your phone number)`);
    lines.push("You'll be asked to set a new password on first sign-in.");
  }

  lines.push("");
  lines.push("If you weren't expecting this email or have questions, just reply and we'll help.");
  lines.push("");
  lines.push(`— ${args.orgName}`);

  return lines.join("\n");
}

function firstNameFrom(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first || "there";
}
