import { describe, expect, it } from "vitest";
import { factsFromInput, resolveIdentity, type CandidatePerson } from "../identity-resolution";

const person = (personId: string, input: Parameters<typeof factsFromInput>[0]): CandidatePerson => ({
  personId,
  ...factsFromInput(input),
});

const priya = person("p-priya", {
  email: "priya@acme.com", emailVerified: true,
  phoneCountryCode: "+91", phone: "9876543210", phoneVerified: true,
  name: "Priya Rao", company: "Acme Pvt Ltd",
});

describe("high confidence: only a verified identifier on both sides", () => {
  it("reuses the person when a signed-in, verified address matches theirs", () => {
    const r = resolveIdentity(factsFromInput({ email: "PRIYA@acme.com ", emailVerified: true }), [priya]);
    expect(r).toMatchObject({ outcome: "high", personId: "p-priya" });
  });

  it("reuses the person on a verified phone written another way", () => {
    const r = resolveIdentity(factsFromInput({ phoneCountryCode: "IN", phone: "098765-43210", phoneVerified: true }), [priya]);
    expect(r).toMatchObject({ outcome: "high", personId: "p-priya" });
  });
});

describe("possible: something points at a person but proves nothing", () => {
  it("an address someone else typed is a possible match, never a link", () => {
    const r = resolveIdentity(factsFromInput({ email: "priya@acme.com", emailVerified: false }), [priya]);
    expect(r.outcome).toBe("possible");
  });

  it("a verified address against an unverified record is still only possible", () => {
    const unverified = person("p-2", { email: "sam@acme.com" });
    const r = resolveIdentity(factsFromInput({ email: "sam@acme.com", emailVerified: true }), [unverified]);
    expect(r.outcome).toBe("possible");
  });

  it("a LinkedIn URL is never proof", () => {
    const withLinkedIn = person("p-3", { linkedin: "linkedin.com/in/sam" });
    const r = resolveIdentity(factsFromInput({ linkedin: "https://www.linkedin.com/in/Sam/" }), [withLinkedIn]);
    expect(r.outcome).toBe("possible");
  });

  it("the same name at the same company is possible", () => {
    const r = resolveIdentity(factsFromInput({ name: "Dr. Priya Rao", company: "ACME PRIVATE LIMITED" }), [priya]);
    expect(r).toMatchObject({ outcome: "possible", candidates: [{ personId: "p-priya", reasons: [{ kind: "name_company" }] }] });
  });

  it("identifiers pointing at two people are never resolved automatically", () => {
    const other = person("p-other", { phoneCountryCode: "+91", phone: "9876543210", phoneVerified: true });
    const r = resolveIdentity(
      factsFromInput({ email: "priya@acme.com", emailVerified: true, phoneCountryCode: "+91", phone: "9876543210", phoneVerified: true }),
      [priya, other],
    );
    expect(r.outcome).toBe("possible");
    if (r.outcome === "possible") expect(r.candidates.map((c) => c.personId).sort()).toEqual(["p-other", "p-priya"]);
  });
});

describe("no match", () => {
  it("a name alone is not a match", () => {
    expect(resolveIdentity(factsFromInput({ name: "Priya Rao" }), [priya]).outcome).toBe("none");
  });

  it("a company alone is not a match", () => {
    expect(resolveIdentity(factsFromInput({ name: "Sam Lee", company: "Acme" }), [priya]).outcome).toBe("none");
  });

  it("a Gmail address with dots removed is a different address", () => {
    const dotted = person("p-4", { email: "p.r.iya@gmail.com", emailVerified: true });
    expect(resolveIdentity(factsFromInput({ email: "priya@gmail.com", emailVerified: true }), [dotted]).outcome).toBe("none");
  });

  it("nothing on record", () => {
    expect(resolveIdentity(factsFromInput({ email: "new@x.com" }), []).outcome).toBe("none");
  });
});

describe("ranking", () => {
  it("merges duplicate candidate rows and puts the strongest first", () => {
    const a = person("p-a", { email: "a@x.com" });
    const b1 = person("p-b", { name: "Sam Lee", company: "Acme" });
    const b2 = person("p-b", { phoneCountryCode: "+91", phone: "9000000001" });
    const r = resolveIdentity(factsFromInput({ email: "a@x.com", phoneCountryCode: "+91", phone: "9000000001", name: "Sam Lee", company: "Acme" }), [b1, a, b2]);
    expect(r.outcome).toBe("possible");
    if (r.outcome === "possible") {
      expect(r.candidates.map((c) => c.personId)).toEqual(["p-a", "p-b"]);
      expect(r.candidates[1].reasons.map((x) => x.kind).sort()).toEqual(["name_company", "phone"]);
    }
  });
});
