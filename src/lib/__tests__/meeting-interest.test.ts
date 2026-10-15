import { describe, expect, it } from "vitest";
import {
  interestedSponsorOptions, matchesMeetingInterest, registrationKey, speakerEmailKey, speakerKey,
  sponsorsByPerson, sponsorsFor, type MeetingInterest,
} from "../meeting-interest";

// Priya: Sponsor A and B. Rahul: B and C. Meera: nobody.
// Speaker Anil: C (by speaker profile, email anil@example.test). Speaker Sana: nobody.
const interests: MeetingInterest[] = [
  { registration_id: "priya", sponsor_id: "a", sponsor_name: "Zaggle" },
  { registration_id: "priya", sponsor_id: "b", sponsor_name: "Keka" },
  { registration_id: "rahul", sponsor_id: "b", sponsor_name: "Keka" },
  { registration_id: "rahul", sponsor_id: "c", sponsor_name: "Sovos" },
  { registration_id: null, speaker_id: "anil", speaker_email: "anil@example.test", sponsor_id: "c", sponsor_name: "Sovos" },
];
const people: Record<string, string[]> = {
  priya: [registrationKey("priya")],
  rahul: [registrationKey("rahul")],
  meera: [registrationKey("meera")],
  anil: [speakerKey("anil")],
  sana: [speakerKey("sana")],
};
const by = sponsorsByPerson(interests);
const pick = (f: Parameters<typeof matchesMeetingInterest>[2]) =>
  Object.keys(people).filter((p) => matchesMeetingInterest(people[p], by, f));

describe("Interested Sponsors", () => {
  it("lists every interested sponsor per person, by name", () => {
    expect(sponsorsFor(people.priya, by)).toEqual([{ id: "b", name: "Keka" }, { id: "a", name: "Zaggle" }]);
    expect(sponsorsFor(people.rahul, by)).toEqual([{ id: "b", name: "Keka" }, { id: "c", name: "Sovos" }]);
    expect(sponsorsFor(people.meera, by)).toEqual([]);
  });

  it("finds a speaker by profile, or by email when they also registered", () => {
    expect(sponsorsFor([speakerKey("anil")], by)).toEqual([{ id: "c", name: "Sovos" }]);
    expect(sponsorsFor([registrationKey("anil-reg"), speakerEmailKey(" Anil@Example.test ")], by)).toEqual([{ id: "c", name: "Sovos" }]);
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
  it("all keeps everyone", () => expect(pick("all")).toEqual(Object.keys(people)));
  it("with keeps attendees and speakers any sponsor marked", () => expect(pick("with")).toEqual(["priya", "rahul", "anil"]));
  it("without keeps attendees and speakers nobody marked", () => expect(pick("without")).toEqual(["meera", "sana"]));

  it("a sponsor keeps what that sponsor marked, even when others marked it too", () => {
    expect(pick({ sponsor: "b" })).toEqual(["priya", "rahul"]);
    expect(pick({ sponsor: "a" })).toEqual(["priya"]);
    expect(pick({ sponsor: "c" })).toEqual(["rahul", "anil"]);
  });

  it("never repeats a person however many sponsors marked them", () => {
    for (const f of ["all", "with", { sponsor: "b" }] as const) {
      const rows = pick(f);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it("rows that can't be marked (sponsor team members) only show under All", () => {
    expect(matchesMeetingInterest([], by, "all")).toBe(true);
    expect(matchesMeetingInterest([], by, "with")).toBe(false);
    expect(matchesMeetingInterest([], by, "without")).toBe(false);
    expect(matchesMeetingInterest([], by, { sponsor: "b" })).toBe(false);
  });
});
