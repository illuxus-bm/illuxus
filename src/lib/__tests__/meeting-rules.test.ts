import { describe, expect, it } from "vitest";
import {
  matchesMeetingInterest, meetingErrorMessage, meetingSummary, meetingTotals, organiserActions,
  registrationKey, sponsorActions, sponsorsByPerson, historyLabel,
  type MeetingState,
} from "../meeting-interest";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const during = { now: NOW, eventOver: false };
const after = { now: NOW, eventOver: true };

describe("Sponsor rules: the organiser has the final say", () => {
  it("an outcome the organiser recorded is locked — the sponsor can only dispute it", () => {
    const m: MeetingState = { status: "met", status_by_side: "organiser", outcome_at: minsAgo(1) };
    const a = sponsorActions(m, during);
    expect(a.locked).toBe("organiser");
    expect(a.dispute).toBe(true);
    expect([a.met, a.notMet, a.cancel, a.undo, a.remove, a.backToInterested]).toEqual([false, false, false, null, false, false]);
  });

  it("the sponsor can change its own outcome for 15 minutes", () => {
    const a = sponsorActions({ status: "met", status_by_side: "sponsor", outcome_at: minsAgo(5), location: "Table 4" }, during);
    expect(a.locked).toBe(null);
    expect(a.undo).toBe("arranged");
    expect(a.notMet).toBe(true);
    expect(a.met).toBe(false);
    expect(Math.round(a.graceLeftMs / 60_000)).toBe(10);
  });

  it("after 15 minutes the sponsor's own outcome locks too", () => {
    const a = sponsorActions({ status: "not_met", status_by_side: "sponsor", outcome_at: minsAgo(16) }, during);
    expect(a.locked).toBe("time");
    expect(a.undo).toBe(null);
    expect(a.dispute).toBe(true);
  });

  it("nothing can be changed while a dispute is waiting", () => {
    const a = sponsorActions({ status: "met", status_by_side: "organiser", dispute_status: "open" }, during);
    expect(a.disputePending).toBe(true);
    expect(a.dispute).toBe(false);
    expect(a.met || a.notMet || a.cancel).toBe(false);
  });
});

describe("Sponsor rules: nothing that progressed disappears", () => {
  it("a fresh interest can be removed", () => {
    const a = sponsorActions({ status: "interested" }, during);
    expect(a.remove).toBe(true);
    expect(a.cancel).toBe(false);
  });

  it("an interest that was once arranged can only be cancelled", () => {
    const a = sponsorActions({ status: "interested", ever_progressed: true }, during);
    expect(a.remove).toBe(false);
    expect(a.cancel).toBe(true);
  });

  it("an arranged meeting can be cancelled, not removed", () => {
    const a = sponsorActions({ status: "arranged", status_by_side: "sponsor", ever_progressed: true }, during);
    expect(a.remove).toBe(false);
    expect(a.cancel).toBe(true);
    expect(a.backToInterested).toBe(true);
  });

  it("the sponsor can't undo an arrangement the organiser made", () => {
    const a = sponsorActions({ status: "arranged", status_by_side: "organiser", ever_progressed: true }, during);
    expect(a.backToInterested).toBe(false);
    expect(a.cancel).toBe(true);
  });
});

describe("Sponsor rules: after the event", () => {
  it("the sponsor only records outcomes", () => {
    const a = sponsorActions({ status: "arranged", status_by_side: "sponsor", ever_progressed: true }, after);
    expect(a.arrange).toBe(false);
    expect(a.backToInterested).toBe(false);
    expect(a.met && a.notMet && a.cancel).toBe(true);
  });

  it("a mis-click can still be undone within 15 minutes", () => {
    const a = sponsorActions({ status: "met", status_by_side: "sponsor", outcome_at: minsAgo(2) }, after);
    expect(a.undo).toBe("interested");
  });
});

describe("Organiser rules", () => {
  it("changing an outcome after the event needs a reason", () => {
    expect(organiserActions({ status: "met" }, { eventOver: true }).reasonRequired).toBe(true);
    expect(organiserActions({ status: "met" }, { eventOver: false }).reasonRequired).toBe(false);
    expect(organiserActions({ status: "arranged" }, { eventOver: true }).reasonRequired).toBe(false);
  });

  it("sees an open dispute", () => {
    expect(organiserActions({ status: "met", dispute_status: "open" }, { eventOver: false }).disputeOpen).toBe(true);
  });
});

describe("Disputes and cancellations in lists", () => {
  const interests = [
    { registration_id: "p", sponsor_id: "a", sponsor_name: "Zaggle", status: "met" as const, dispute_status: "open" as const },
    { registration_id: "q", sponsor_id: "a", sponsor_name: "Zaggle", status: "cancelled" as const },
  ];
  const by = sponsorsByPerson(interests);

  it("the Disputed filter finds open disputes", () => {
    expect(matchesMeetingInterest([registrationKey("p")], by, { status: "disputed", sponsor: null })).toBe(true);
    expect(matchesMeetingInterest([registrationKey("q")], by, { status: "disputed", sponsor: null })).toBe(false);
    expect(matchesMeetingInterest([registrationKey("q")], by, { status: "cancelled", sponsor: "a" })).toBe(true);
  });

  it("totals count cancellations and disputes", () => {
    expect(meetingTotals(interests).get("a")).toMatchObject({ marked: 2, met: 1, cancelled: 1, disputed: 1 });
  });

  it("summaries say why a meeting didn't happen", () => {
    expect(meetingSummary({ status: "not_met", status_cause: "attendee_no_show" })).toBe("Didn't happen · Attendee no-show");
    expect(meetingSummary({ status: "not_met", status_cause: "other", status_reason: "Fire alarm" })).toBe("Didn't happen · Fire alarm");
    expect(meetingSummary({ status: "cancelled", status_reason: "Budget freeze" })).toBe("Cancelled · Budget freeze");
  });

  it("history entries read as sentences", () => {
    expect(historyLabel({ created_at: "", action: "disputed", from_status: "met", to_status: "not_met", side: "sponsor" }))
      .toBe('Disputed the record — asked for "Didn\'t happen"');
    expect(historyLabel({ created_at: "", action: "dispute_kept", from_status: "met", to_status: "met", side: "organiser" }))
      .toBe('Kept the record as "Met" after a dispute');
    expect(historyLabel({ created_at: "", action: "not_met", from_status: "arranged", to_status: "not_met", side: "sponsor", cause: "rescheduled" }))
      .toBe("Marked as didn't happen (Rescheduled)");
  });
});

describe("Refusals from the database, in words", () => {
  it("explains each rule", () => {
    expect(meetingErrorMessage("LOCKED_ORGANISER")).toMatch(/organiser recorded/);
    expect(meetingErrorMessage("LOCKED")).toMatch(/lock 15 minutes/);
    expect(meetingErrorMessage("CANCEL_INSTEAD")).toMatch(/Cancel it instead/);
    expect(meetingErrorMessage("REASON_REQUIRED")).toMatch(/give a reason/);
    expect(meetingErrorMessage("Could not find the function public.dispute_meeting")).toMatch(/migration 054/);
  });
});
