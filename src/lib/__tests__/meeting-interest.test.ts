import { describe, expect, it } from "vitest";
import {
  interestedSponsorOptions, matchesMeetingInterest, sponsorsByRegistration, type MeetingInterest,
} from "../meeting-interest";

// Priya: Sponsor A and B. Rahul: B and C. Meera: nobody.
const interests: MeetingInterest[] = [
  { registration_id: "priya", sponsor_id: "a", sponsor_name: "Zaggle" },
  { registration_id: "priya", sponsor_id: "b", sponsor_name: "Keka" },
  { registration_id: "rahul", sponsor_id: "b", sponsor_name: "Keka" },
  { registration_id: "rahul", sponsor_id: "c", sponsor_name: "Sovos" },
];
const registrations = ["priya", "rahul", "meera"];
const by = sponsorsByRegistration(interests);
const pick = (f: Parameters<typeof matchesMeetingInterest>[2]) => registrations.filter((r) => matchesMeetingInterest(r, by, f));

describe("Interested Sponsors", () => {
  it("lists every interested sponsor per registration, by name", () => {
    expect(by.get("priya")).toEqual([{ id: "b", name: "Keka" }, { id: "a", name: "Zaggle" }]);
    expect(by.get("rahul")).toEqual([{ id: "b", name: "Keka" }, { id: "c", name: "Sovos" }]);
    expect(by.get("meera")).toBeUndefined();
  });

  it("counts a sponsor once even if a record is repeated", () => {
    const twice = sponsorsByRegistration([...interests, interests[0]]);
    expect(twice.get("priya")).toHaveLength(2);
  });

  it("offers each sponsor once in the filter", () => {
    expect(interestedSponsorOptions(interests)).toEqual([
      { id: "b", name: "Keka" }, { id: "c", name: "Sovos" }, { id: "a", name: "Zaggle" },
    ]);
  });
});

describe("Meeting Interest filter", () => {
  it("all keeps every registration", () => expect(pick("all")).toEqual(registrations));
  it("with keeps registrations any sponsor marked", () => expect(pick("with")).toEqual(["priya", "rahul"]));
  it("without keeps registrations nobody marked", () => expect(pick("without")).toEqual(["meera"]));

  it("a sponsor keeps what that sponsor marked, even when others marked it too", () => {
    expect(pick({ sponsor: "b" })).toEqual(["priya", "rahul"]);
    expect(pick({ sponsor: "a" })).toEqual(["priya"]);
    expect(pick({ sponsor: "c" })).toEqual(["rahul"]);
  });

  it("never repeats a registration however many sponsors marked it", () => {
    for (const f of ["all", "with", { sponsor: "b" }] as const) {
      const rows = pick(f);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it("rows without a registration can't be marked, so only All shows them", () => {
    expect(matchesMeetingInterest(null, by, "all")).toBe(true);
    expect(matchesMeetingInterest(null, by, "with")).toBe(false);
    expect(matchesMeetingInterest(null, by, "without")).toBe(false);
    expect(matchesMeetingInterest(null, by, { sponsor: "b" })).toBe(false);
  });
});
