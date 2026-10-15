/**
 * Meeting Interest on the organiser side: the interests of an event (one row
 * per sponsor and person, from `event_meeting_interests`, migrations 050/051)
 * turned into the Registrations tab's "Interested Sponsors" column and
 * "Meeting Interest" filter. Pure functions, so they're tested on their own.
 *
 * A person is an attendee (by registration) or a speaker (by speaker profile).
 * A speaker can show on the Registrations tab either as a speaker-only row or,
 * if they also registered, as a registration row — so speaker interests are
 * found by speaker id and by the speaker's email.
 */

export interface MeetingInterest {
  registration_id: string | null;
  /** Set for a speaker (migration 051). */
  speaker_id?: string | null;
  /** The speaker's email, lower-cased. */
  speaker_email?: string | null;
  sponsor_id: string;
  sponsor_name: string;
}

export interface InterestedSponsor {
  id: string;
  name: string;
}

/** "all", "with", "without", or one sponsor's id. */
export type MeetingInterestFilter = "all" | "with" | "without" | { sponsor: string };

/** The ways a person can be looked up: registration id, speaker id, speaker email. */
export const registrationKey = (id: string) => `reg:${id}`;
export const speakerKey = (id: string) => `speaker:${id}`;
export const speakerEmailKey = (email: string) => `speaker-email:${email.trim().toLowerCase()}`;

/** The keys an interest is filed under. */
function keysOf(i: MeetingInterest): string[] {
  if (i.registration_id) return [registrationKey(i.registration_id)];
  const keys: string[] = [];
  if (i.speaker_id) keys.push(speakerKey(i.speaker_id));
  if (i.speaker_email) keys.push(speakerEmailKey(i.speaker_email));
  return keys;
}

/** The sponsors interested in each person (by key), each sponsor once, by name. */
export function sponsorsByPerson(interests: MeetingInterest[]): Map<string, InterestedSponsor[]> {
  const map = new Map<string, InterestedSponsor[]>();
  for (const i of interests) {
    for (const key of keysOf(i)) {
      const list = map.get(key) ?? [];
      if (!list.some((s) => s.id === i.sponsor_id)) list.push({ id: i.sponsor_id, name: i.sponsor_name });
      map.set(key, list);
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return map;
}

/** The sponsors interested in a person known by any of `keys`, each once, by name. */
export function sponsorsFor(keys: string[], bySponsor: Map<string, InterestedSponsor[]>): InterestedSponsor[] {
  const seen = new Map<string, InterestedSponsor>();
  for (const key of keys) for (const s of bySponsor.get(key) ?? []) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every sponsor that has marked at least one person, by name. */
export function interestedSponsorOptions(interests: MeetingInterest[]): InterestedSponsor[] {
  const seen = new Map<string, string>();
  for (const i of interests) if (!seen.has(i.sponsor_id)) seen.set(i.sponsor_id, i.sponsor_name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a person passes the filter. Rows with no keys (sponsor team
 *  members) can't be marked, so only "all" includes them. */
export function matchesMeetingInterest(
  keys: string[],
  bySponsor: Map<string, InterestedSponsor[]>,
  filter: MeetingInterestFilter,
): boolean {
  if (filter === "all") return true;
  if (!keys.length) return false;
  const sponsors = sponsorsFor(keys, bySponsor);
  if (filter === "with") return sponsors.length > 0;
  if (filter === "without") return sponsors.length === 0;
  return sponsors.some((s) => s.id === filter.sponsor);
}
