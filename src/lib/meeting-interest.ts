/**
 * Meeting Interest on the organiser side: the meetings of an event (one row
 * per sponsor and person, from `event_meeting_interests`, migrations 050–052)
 * turned into the Registrations tab's "Interested Sponsors" column and
 * "Meeting Interest" filter. Pure functions, so they're tested on their own.
 *
 * A person is an attendee (by registration) or a speaker (by speaker profile).
 * A speaker can show on the Registrations tab either as a speaker-only row or,
 * if they also registered, as a registration row — so speaker interests are
 * found by speaker id and by the speaker's email.
 *
 * Each meeting moves interested → arranged (optional) → met / not_met
 * ("Didn't happen"), migration 052.
 */

export type MeetingStatus = "interested" | "arranged" | "met" | "not_met";

export const MEETING_STATUSES: MeetingStatus[] = ["interested", "arranged", "met", "not_met"];

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  interested: "Interested",
  arranged: "Arranged",
  met: "Met",
  not_met: "Didn't happen",
};

/** Pill colours per status, shared by both dashboards. */
export const MEETING_PILL_CLASS: Record<MeetingStatus, string> = {
  interested: "border-border bg-muted text-muted-foreground",
  arranged: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  met: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400",
  not_met: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400",
};

/** A meeting's state, as both dashboards show it. */
export interface MeetingState {
  status: MeetingStatus;
  scheduled_at?: string | null;
  location?: string | null;
  met_at?: string | null;
  status_reason?: string | null;
  note?: string | null;
  status_by_side?: "sponsor" | "organiser" | null;
  status_changed_at?: string | null;
}

export interface MeetingInterest extends Partial<Omit<MeetingState, "status">> {
  registration_id: string | null;
  /** Set for a speaker (migration 051). */
  speaker_id?: string | null;
  /** The speaker's email, lower-cased. */
  speaker_email?: string | null;
  sponsor_id: string;
  sponsor_name: string;
  created_at?: string | null;
  /** Before migration 052 every row is "interested". */
  status?: MeetingStatus | null;
}

export interface InterestedSponsor extends MeetingState {
  id: string;
  name: string;
  created_at?: string | null;
}

/** "all", "with", "without" or a meeting status — optionally for one sponsor. */
export interface MeetingInterestFilter {
  status: "all" | "with" | "without" | MeetingStatus;
  sponsor: string | null;
}

export const ALL_MEETINGS: MeetingInterestFilter = { status: "all", sponsor: null };

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

function toSponsor(i: MeetingInterest): InterestedSponsor {
  return {
    id: i.sponsor_id,
    name: i.sponsor_name,
    created_at: i.created_at ?? null,
    status: i.status ?? "interested",
    scheduled_at: i.scheduled_at ?? null,
    location: i.location ?? null,
    met_at: i.met_at ?? null,
    status_reason: i.status_reason ?? null,
    note: i.note ?? null,
    status_by_side: i.status_by_side ?? null,
    status_changed_at: i.status_changed_at ?? null,
  };
}

/** The sponsors interested in each person (by key), each sponsor once, by name. */
export function sponsorsByPerson(interests: MeetingInterest[]): Map<string, InterestedSponsor[]> {
  const map = new Map<string, InterestedSponsor[]>();
  for (const i of interests) {
    for (const key of keysOf(i)) {
      const list = map.get(key) ?? [];
      if (!list.some((s) => s.id === i.sponsor_id)) list.push(toSponsor(i));
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
export function interestedSponsorOptions(interests: MeetingInterest[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const i of interests) if (!seen.has(i.sponsor_id)) seen.set(i.sponsor_id, i.sponsor_name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a person passes the filter. With a sponsor chosen, only that
 *  sponsor's meeting counts ("all" then means "marked by that sponsor").
 *  Rows with no keys (sponsor team members) can't be marked, so only the
 *  unfiltered view includes them. */
export function matchesMeetingInterest(
  keys: string[],
  bySponsor: Map<string, InterestedSponsor[]>,
  filter: MeetingInterestFilter,
): boolean {
  if (filter.status === "all" && !filter.sponsor) return true;
  if (!keys.length) return false;
  let sponsors = sponsorsFor(keys, bySponsor);
  if (filter.sponsor) sponsors = sponsors.filter((s) => s.id === filter.sponsor);
  if (filter.status === "without") return sponsors.length === 0;
  if (filter.status === "all" || filter.status === "with") return sponsors.length > 0;
  return sponsors.some((s) => s.status === filter.status);
}

/** Per-sponsor totals: everyone marked, and how many are arranged / met / didn't happen. */
export function meetingTotals(interests: MeetingInterest[]): Map<string, Record<MeetingStatus | "marked", number>> {
  const out = new Map<string, Record<MeetingStatus | "marked", number>>();
  for (const i of interests) {
    const t = out.get(i.sponsor_id) ?? { marked: 0, interested: 0, arranged: 0, met: 0, not_met: 0 };
    t.marked++;
    t[i.status ?? "interested"]++;
    out.set(i.sponsor_id, t);
  }
  return out;
}

/** Where "Undo" takes a finished meeting: back to arranged if it had a time
 *  or place, otherwise back to interested. */
export function undoTarget(m: Pick<MeetingState, "scheduled_at" | "location">): MeetingStatus {
  return m.scheduled_at || m.location ? "arranged" : "interested";
}

const shortTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

/** One line for a meeting: "Arranged · Fri 16 Oct, 2:30 PM · Table 4", "Met 3:05 PM", … */
export function meetingSummary(m: MeetingState): string {
  if (m.status === "arranged") {
    const when = m.scheduled_at ? `${shortDay(m.scheduled_at)}, ${shortTime(m.scheduled_at)}` : "";
    return ["Arranged", when, m.location].filter(Boolean).join(" · ");
  }
  if (m.status === "met") return m.met_at ? `Met ${shortTime(m.met_at)}` : "Met";
  if (m.status === "not_met") return m.status_reason ? `Didn't happen · ${m.status_reason}` : "Didn't happen";
  return "Interested";
}
