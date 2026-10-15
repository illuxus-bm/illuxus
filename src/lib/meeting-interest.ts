/**
 * Meeting Interest on the organiser side: the interests of an event (one row
 * per sponsor and registration, from `event_meeting_interests`, migration
 * 050) turned into the Registrations tab's "Interested Sponsors" column and
 * "Meeting Interest" filter. Pure functions, so they're tested on their own.
 */

export interface MeetingInterest {
  registration_id: string;
  sponsor_id: string;
  sponsor_name: string;
}

export interface InterestedSponsor {
  id: string;
  name: string;
}

/** "all", "with", "without", or one sponsor's id. */
export type MeetingInterestFilter = "all" | "with" | "without" | { sponsor: string };

/** The sponsors interested in each registration, each sponsor once, by name. */
export function sponsorsByRegistration(interests: MeetingInterest[]): Map<string, InterestedSponsor[]> {
  const map = new Map<string, InterestedSponsor[]>();
  for (const i of interests) {
    const list = map.get(i.registration_id) ?? [];
    if (!list.some((s) => s.id === i.sponsor_id)) list.push({ id: i.sponsor_id, name: i.sponsor_name });
    map.set(i.registration_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

/** Every sponsor that has marked at least one registration, by name. */
export function interestedSponsorOptions(interests: MeetingInterest[]): InterestedSponsor[] {
  const seen = new Map<string, string>();
  for (const i of interests) if (!seen.has(i.sponsor_id)) seen.set(i.sponsor_id, i.sponsor_name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a registration passes the filter. Rows without a registration
 *  (speakers or sponsors listed from elsewhere) can't be marked, so only
 *  "all" includes them. */
export function matchesMeetingInterest(
  registrationId: string | null | undefined,
  bySponsor: Map<string, InterestedSponsor[]>,
  filter: MeetingInterestFilter,
): boolean {
  if (filter === "all") return true;
  if (!registrationId) return false;
  const sponsors = bySponsor.get(registrationId) ?? [];
  if (filter === "with") return sponsors.length > 0;
  if (filter === "without") return sponsors.length === 0;
  return sponsors.some((s) => s.id === filter.sponsor);
}
