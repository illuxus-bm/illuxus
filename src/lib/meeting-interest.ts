/**
 * Meetings between sponsors and event participants (migrations 050–054):
 * the shared types, labels and rules used by the sponsor dashboard, the
 * organiser's Registrations tab and the Sponsors section. Pure functions, so
 * they're tested on their own.
 *
 * A person is an attendee (by registration) or a speaker (by speaker profile).
 * A speaker can show on the Registrations tab either as a speaker-only row or,
 * if they also registered, as a registration row — so speaker interests are
 * found by speaker id and by the speaker's email.
 *
 * Each meeting moves interested → arranged (optional) → met / not_met
 * ("Didn't happen") / cancelled. The rules that keep the record trustworthy
 * (migration 054) are mirrored in `sponsorActions` / `organiserActions`; the
 * database enforces them either way:
 *   • the organiser has the final say — an outcome the organiser set can't be
 *     changed by the sponsor, who files a dispute instead;
 *   • a sponsor can change its own outcome for 15 minutes, then it locks;
 *   • after the event a sponsor only records outcomes;
 *   • a meeting that ever progressed is cancelled, never deleted;
 *   • organiser changes to an outcome after the event need a reason.
 */

export type MeetingStatus = "interested" | "arranged" | "met" | "not_met" | "cancelled";

export const MEETING_STATUSES: MeetingStatus[] = ["interested", "arranged", "met", "not_met", "cancelled"];

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  interested: "Interested",
  arranged: "Arranged",
  met: "Met",
  not_met: "Didn't happen",
  cancelled: "Cancelled",
};

/** Outcomes: what happened in the end. */
export const MEETING_OUTCOMES: MeetingStatus[] = ["met", "not_met", "cancelled"];
export const isOutcome = (s: MeetingStatus | null | undefined) => !!s && MEETING_OUTCOMES.includes(s);

export type MeetingCause = "attendee_no_show" | "sponsor_unavailable" | "rescheduled" | "other";

export const MEETING_CAUSES: MeetingCause[] = ["attendee_no_show", "sponsor_unavailable", "rescheduled", "other"];

export const MEETING_CAUSE_LABEL: Record<MeetingCause, string> = {
  attendee_no_show: "Attendee no-show",
  sponsor_unavailable: "Sponsor couldn't make it",
  rescheduled: "Rescheduled",
  other: "Other",
};

/** Minutes a sponsor can still change its own outcome. */
export const SPONSOR_GRACE_MINUTES = 15;

/** Pill colours per status, shared by both dashboards. */
export const MEETING_PILL_CLASS: Record<MeetingStatus, string> = {
  interested: "border-border bg-muted text-muted-foreground",
  arranged: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  met: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-400",
  not_met: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400",
  cancelled: "border-border bg-muted/60 text-muted-foreground line-through decoration-muted-foreground/50",
};

/** A meeting's state, as both dashboards show it. */
export interface MeetingState {
  status: MeetingStatus;
  scheduled_at?: string | null;
  location?: string | null;
  met_at?: string | null;
  status_reason?: string | null;
  status_cause?: MeetingCause | null;
  note?: string | null;
  status_by_side?: "sponsor" | "organiser" | null;
  status_changed_at?: string | null;
  /** Ever went past Interested — then it can only be cancelled, never removed. */
  ever_progressed?: boolean | null;
  /** When it first reached an outcome; a sponsor's own outcome locks 15 minutes after. */
  outcome_at?: string | null;
  dispute_status?: "open" | "resolved" | null;
  dispute_reason?: string | null;
  dispute_requested_status?: MeetingStatus | null;
  disputed_at?: string | null;
  dispute_resolution?: "kept" | "changed" | null;
  dispute_note?: string | null;
  resolved_at?: string | null;
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

/** "all", "with", "without", a meeting status or "disputed" — optionally for one sponsor. */
export interface MeetingInterestFilter {
  status: "all" | "with" | "without" | "disputed" | MeetingStatus;
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
  return { ...i, id: i.sponsor_id, name: i.sponsor_name, status: i.status ?? "interested" };
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
  if (filter.status === "disputed") return sponsors.some((s) => s.dispute_status === "open");
  return sponsors.some((s) => s.status === filter.status);
}

export type MeetingTotals = Record<MeetingStatus | "marked" | "disputed", number>;

/** Per-sponsor totals: everyone marked, each status, and open disputes. */
export function meetingTotals(interests: MeetingInterest[]): Map<string, MeetingTotals> {
  const out = new Map<string, MeetingTotals>();
  for (const i of interests) {
    const t = out.get(i.sponsor_id) ?? { marked: 0, interested: 0, arranged: 0, met: 0, not_met: 0, cancelled: 0, disputed: 0 };
    t.marked++;
    t[i.status ?? "interested"]++;
    if (i.dispute_status === "open") t.disputed++;
    out.set(i.sponsor_id, t);
  }
  return out;
}

/** Where "Undo" takes an outcome: back to arranged if it had a time or place,
 *  otherwise back to interested. */
export function undoTarget(m: Pick<MeetingState, "scheduled_at" | "location">): MeetingStatus {
  return m.scheduled_at || m.location ? "arranged" : "interested";
}

/** What the sponsor may do with its meeting right now. */
export interface SponsorActions {
  arrange: boolean;           // arrange, or change time / place
  met: boolean;
  notMet: boolean;
  cancel: boolean;
  backToInterested: boolean;
  undo: MeetingStatus | null; // within the grace period: where Undo goes
  remove: boolean;            // only a meeting that never progressed
  dispute: boolean;           // the record is locked: ask the organiser
  disputePending: boolean;
  /** Why the sponsor can't change it directly, if it can't. */
  locked: "organiser" | "time" | null;
  /** Milliseconds left to change its own outcome. */
  graceLeftMs: number;
}

export function sponsorActions(m: MeetingState, opts: { now: number; eventOver: boolean }): SponsorActions {
  const none: SponsorActions = {
    arrange: false, met: false, notMet: false, cancel: false, backToInterested: false,
    undo: null, remove: false, dispute: false, disputePending: false, locked: null, graceLeftMs: 0,
  };
  if (m.dispute_status === "open") return { ...none, disputePending: true };

  if (isOutcome(m.status)) {
    if (m.status_by_side === "organiser") return { ...none, dispute: true, locked: "organiser" };
    const since = Date.parse(m.outcome_at ?? m.status_changed_at ?? "");
    const left = Number.isFinite(since) ? since + SPONSOR_GRACE_MINUTES * 60_000 - opts.now : SPONSOR_GRACE_MINUTES * 60_000;
    if (left <= 0) return { ...none, dispute: true, locked: "time" };
    return {
      ...none,
      met: m.status !== "met",
      notMet: m.status !== "not_met",
      cancel: m.status !== "cancelled",
      undo: undoTarget(m),
      graceLeftMs: left,
    };
  }

  const before = !opts.eventOver;
  return {
    ...none,
    arrange: before,
    met: true,
    notMet: true,
    cancel: m.status === "arranged" || !!m.ever_progressed,
    backToInterested: before && m.status === "arranged" && m.status_by_side !== "organiser",
    remove: m.status === "interested" && !m.ever_progressed,
  };
}

/** What the organiser may do. Everything — but changing an outcome after the
 *  event needs a reason. */
export function organiserActions(m: MeetingState, opts: { eventOver: boolean }) {
  return {
    reasonRequired: opts.eventOver && isOutcome(m.status),
    disputeOpen: m.dispute_status === "open",
  };
}

/** The database's refusal codes (migration 054), in words. */
export function meetingErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("LOCKED_ORGANISER")) return "The organiser recorded this outcome. Use \"Dispute this…\" if it's wrong.";
  if (m.includes("LOCKED")) return `Outcomes lock ${SPONSOR_GRACE_MINUTES} minutes after they're recorded. Use "Dispute this…" if it's wrong.`;
  if (m.includes("DISPUTE_OPEN")) return "A dispute about this meeting is waiting for the organiser.";
  if (m.includes("EVENT_OVER")) return "The event has ended — you can only record what happened now.";
  if (m.includes("ARRANGED_BY_ORGANISER")) return "The organiser arranged this meeting. Cancel it instead if it won't happen.";
  if (m.includes("CANCEL_INSTEAD")) return "This meeting has a history, so it can't be removed. Cancel it instead.";
  if (m.includes("REASON_REQUIRED")) return "The event has ended — give a reason for changing this outcome.";
  if (m.includes("Choose the sponsor")) return "You organise this event, so its meetings are managed from the event's Registrations tab, not the sponsor dashboard.";
  if (/function .* does not exist|schema cache|Could not find the function/i.test(m)) return "This needs a database update that hasn't been applied yet (migration 054).";
  return m || "Something went wrong.";
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
  if (m.status === "not_met") {
    return ["Didn't happen", m.status_cause && m.status_cause !== "other" ? MEETING_CAUSE_LABEL[m.status_cause] : null, m.status_reason]
      .filter(Boolean).join(" · ");
  }
  if (m.status === "cancelled") return m.status_reason ? `Cancelled · ${m.status_reason}` : "Cancelled";
  return "Interested";
}

/** One history entry, as stored by migration 054. */
export interface MeetingHistoryEntry {
  created_at: string;
  action: string;
  from_status: MeetingStatus | null;
  to_status: MeetingStatus | null;
  side: "sponsor" | "organiser" | null;
  reason?: string | null;
  cause?: MeetingCause | null;
  scheduled_at?: string | null;
  location?: string | null;
  backfilled?: boolean | null;
}

/** "Marked as met", "Disputed — wants Didn't happen", … for one history entry. */
export function historyLabel(e: MeetingHistoryEntry): string {
  const to = e.to_status ? MEETING_STATUS_LABEL[e.to_status] : "";
  switch (e.action) {
    case "interested": return "Marked interest";
    case "removed": return "Removed interest";
    case "arranged": return e.from_status === "arranged" ? "Changed the meeting time or place" : "Arranged the meeting";
    case "met": return "Marked as met";
    case "not_met": return `Marked as didn't happen${e.cause && e.cause !== "other" ? ` (${MEETING_CAUSE_LABEL[e.cause]})` : ""}`;
    case "cancelled": return "Cancelled the meeting";
    case "disputed": return `Disputed the record — asked for "${to}"`;
    case "dispute_kept": return `Kept the record as "${to}" after a dispute`;
    case "dispute_changed": return `Changed the record to "${to}" after a dispute`;
    case "note": return "Updated the private note";
    default: return to ? `Set to ${to}` : e.action;
  }
}
