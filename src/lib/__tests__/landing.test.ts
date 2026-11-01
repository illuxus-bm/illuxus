import { describe, expect, it } from "vitest";
import { landingPathFor, type LandingAccess } from "../landing";

const none: LandingAccess = {
  isSuperAdmin: false,
  hasWorkspace: false,
  hasSponsor: false,
  hasSpeaker: false,
  hasPartner: false,
  signedUpAsOrganizer: false,
};
const land = (over: Partial<LandingAccess>) => landingPathFor({ ...none, ...over });

describe("landingPathFor — first stop after sign-in comes from access, not sign-up type", () => {
  it("sends an invited team member to the dashboard although they signed up as an attendee", () => {
    expect(land({ hasWorkspace: true, signedUpAsOrganizer: false })).toBe("/dashboard");
  });

  it("sends a plain attendee to the feed", () => {
    expect(land({})).toBe("/discover");
  });

  it("sends an organiser with no workspace yet to the dashboard (its guard runs onboarding)", () => {
    expect(land({ signedUpAsOrganizer: true })).toBe("/dashboard");
  });

  it("sends portal-only people to their portal", () => {
    expect(land({ hasSponsor: true })).toBe("/sponsor");
    expect(land({ hasSpeaker: true })).toBe("/speaker");
    expect(land({ hasPartner: true })).toBe("/partner");
  });

  it("picks the workspace for someone who is also a speaker, sponsor and partner", () => {
    expect(land({ hasWorkspace: true, hasSpeaker: true, hasSponsor: true, hasPartner: true })).toBe("/dashboard");
  });

  it("prefers a portal over the organiser default for someone with no workspace", () => {
    expect(land({ hasSpeaker: true, signedUpAsOrganizer: true })).toBe("/speaker");
  });

  it("sends Super Admin to the control tower ahead of everything", () => {
    expect(land({ isSuperAdmin: true, hasWorkspace: true })).toBe("/dashboard/admin");
  });
});
