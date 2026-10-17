/**
 * Speaker, sponsor or delegate — how a registration is classified in the
 * event report export. The same rule as the Registrations tab's role badge:
 * the ticket type first, then the email (a speaker or sponsor team member who
 * registered with a regular ticket is still a speaker or sponsor).
 */

export type ParticipantType = "speaker" | "sponsor" | "delegate";

export const PARTICIPANT_TYPE_LABEL: Record<ParticipantType, string> = {
  speaker: "Speaker",
  sponsor: "Sponsor",
  delegate: "Delegate",
};

/** Export order: speakers, then sponsors, then delegates. */
export const PARTICIPANT_TYPE_ORDER: Record<ParticipantType, number> = { speaker: 0, sponsor: 1, delegate: 2 };

export function participantType(
  ticketType: string | null | undefined,
  email: string | null | undefined,
  speakerEmails: Set<string>,
  sponsorEmails: Set<string>,
): ParticipantType {
  if (ticketType === "speaker") return "speaker";
  if (ticketType === "sponsor") return "sponsor";
  const key = (email ?? "").trim().toLowerCase();
  if (key && speakerEmails.has(key)) return "speaker";
  if (key && sponsorEmails.has(key)) return "sponsor";
  return "delegate";
}

/** Lower-cased, trimmed, non-empty emails. */
export function emailSet(emails: (string | null | undefined)[]): Set<string> {
  return new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean));
}
