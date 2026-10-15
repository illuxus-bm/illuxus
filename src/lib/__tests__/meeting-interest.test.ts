import { describe, expect, it } from "vitest";
import {
  ALL_MEETINGS, interestedSponsorOptions, matchesMeetingInterest, meetingSummary, meetingTotals, registrationKey,
  speakerEmailKey, speakerKey, sponsorsByPerson, sponsorsFor, undoTarget,
  type MeetingInterest, type MeetingInterestFilter,
} from "../meeting-interest";

// Priya: Zaggle (met) and Keka (arranged). Rahul: Keka (interested) and Sovos (didn't happen). Meera: nobody.
// Speaker Anil: Sovos (interested, by speaker profile, email anil@example.test). Speaker Sana: nobody.
const interests: MeetingInterest[] = [
  { registration_id: "priya", sponsor_id: "a", sponsor_name: "Zaggle", status: "met", met_at: "2026-10-16T09:35:00Z" },
  { registration_id: "priya", sponsor_id: "b", sponsor_name: "Keka", status: "arranged", location: "Table 4" },
  { registration_id: "rahul", sponsor_id: "b", sponsor_name: "Keka" },
  { registration_id: "rahul", sponsor_id: "c", sponsor_name: "Sovos", status: "not_met", status_reason: "No-show" },
  { registration_id: null, speaker_id: "anil", speaker_email: "anil@example.test", sponsor_id: "c", sponsor_name: "Sovos", status: "interested" },
];
const people: Record<string, string[]> = {
  priya: [registrationKey("priya")],
  rahul: [registrationKey("rahul")],
  meera: [registrationKey("meera")],
  anil: [speakerKey("anil")],
  sana: [speakerKey("sana")],
};
const by = sponsorsByPerson(interests);
const pick = (status: MeetingInterestFilter["status"], sponsor: string | null = null) =>
  Object.keys(people).filter((p) => matchesMeetingInterest(people[p], by, { status, sponsor }));

describe("Interested Sponsors", () => {
  it("lists every interested sponsor per person, by name, with the meeting status", () => {
    expect(sponsorsFor(people.priya, by).map((s) => [s.name, s.status])).toEqual([["Keka", "arranged"], ["Zaggle", "met"]]);
    expect(sponsorsFor(people.rahul, by).map((s) => [s.name, s.status])).toEqual([["Keka", "interested"], ["Sovos", "not_met"]]);
    expect(sponsorsFor(people.meera, by)).toEqual([]);
  });

  it("treats rows from before migration 052 as interested", () => {
    expect(sponsorsFor(people.rahul, by)[0].status).toBe("interested");
  });

  it("finds a speaker by profile, or by email when they also registered", () => {
    expect(sponsorsFor([speakerKey("anil")], by).map((s) => s.name)).toEqual(["Sovos"]);
    expect(sponsorsFor([registrationKey("anil-reg"), speakerEmailKey(" Anil@Example.test ")], by).map((s) => s.name)).toEqual(["Sovos"]);
  });

  it("counts a sponsor once even if a record is repeated or found two ways", () => {
    const twice = sponsorsByPerson([...interests, interests[0]]);
    expect(sponsorsFor(people.priya, twice)).toHaveLength(2);
    expect(sponsorsFor([speakerKey("anil"), speakerEmailKey("anil@example.test")], by)).toHaveLength(1);
  });

  it("offers each sponsor once in the filter", () => {
    expect(interestedSponsorOptions(interests)).toEqual([
      { id: "b", name: "Keka" }, { id: "c", name: "Sovos" }, { id: "a", name: "Zaggle" },
    ]);
  });
});

describe("Meeting Interest filter", () => {
  it("the default keeps everyone, including rows that can't be marked", () => {
    expect(pick("all")).toEqual(Object.keys(people));
    expect(matchesMeetingInterest([], by, ALL_MEETINGS)).toBe(true);
  });
  it("with keeps attendees and speakers any sponsor marked", () => expect(pick("with")).toEqual(["priya", "rahul", "anil"]));
  it("without keeps attendees and speakers nobody marked", () => expect(pick("without")).toEqual(["meera", "sana"]));

  it("filters by meeting status", () => {
    expect(pick("interested")).toEqual(["rahul", "anil"]);
    expect(pick("arranged")).toEqual(["priya"]);
    expect(pick("met")).toEqual(["priya"]);
    expect(pick("not_met")).toEqual(["rahul"]);
  });

  it("a sponsor alone keeps what that sponsor marked, even when others marked it too", () => {
    expect(pick("all", "b")).toEqual(["priya", "rahul"]);
    expect(pick("all", "a")).toEqual(["priya"]);
    expect(pick("all", "c")).toEqual(["rahul", "anil"]);
  });

  it("status and sponsor combine: only that sponsor's meeting counts", () => {
    expect(pick("met", "a")).toEqual(["priya"]);
    expect(pick("met", "b")).toEqual([]); // Priya is met by Zaggle, but only arranged with Keka
    expect(pick("arranged", "b")).toEqual(["priya"]);
    expect(pick("without", "a")).toEqual(["rahul", "meera", "anil", "sana"]);
  });

  it("never repeats a person however many sponsors marked them", () => {
    for (const [st, sp] of [["all", null], ["with", null], ["all", "b"], ["interested", null]] as const) {
      const rows = pick(st, sp);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it("rows that can't be marked (sponsor team members) only show unfiltered", () => {
    expect(matchesMeetingInterest([], by, { status: "with", sponsor: null })).toBe(false);
    expect(matchesMeetingInterest([], by, { status: "without", sponsor: null })).toBe(false);
    expect(matchesMeetingInterest([], by, { status: "all", sponsor: "b" })).toBe(false);
    expect(matchesMeetingInterest([], by, { status: "met", sponsor: null })).toBe(false);
  });
});

describe("Meetings", () => {
  it("totals each sponsor's meetings by status", () => {
    const t = meetingTotals(interests);
    expect(t.get("b")).toEqual({ marked: 2, interested: 1, arranged: 1, met: 0, not_met: 0 });
    expect(t.get("c")).toEqual({ marked: 2, interested: 1, arranged: 0, met: 0, not_met: 1 });
    expect(t.get("a")).toEqual({ marked: 1, interested: 0, arranged: 0, met: 1, not_met: 0 });
  });

  it("undo goes back to arranged only when a time or place was set", () => {
    expect(undoTarget({ scheduled_at: "2026-10-16T09:00:00Z", location: null })).toBe("arranged");
    expect(undoTarget({ scheduled_at: null, location: "Table 4" })).toBe("arranged");
    expect(undoTarget({ scheduled_at: null, location: null })).toBe("interested");
  });

  it("summarises a meeting in one line", () => {
    expect(meetingSummary({ status: "interested" })).toBe("Interested");
    expect(meetingSummary({ status: "arranged", location: "Table 4" })).toBe("Arranged · Table 4");
    expect(meetingSummary({ status: "arranged" })).toBe("Arranged");
    expect(meetingSummary({ status: "met" })).toBe("Met");
    expect(meetingSummary({ status: "met", met_at: "2026-10-16T09:35:00Z" })).toMatch(/^Met \d/);
    expect(meetingSummary({ status: "not_met", status_reason: "No-show" })).toBe("Didn't happen · No-show");
  });
});
