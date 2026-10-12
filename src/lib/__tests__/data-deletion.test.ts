// Unit tests for src/lib/data-deletion.ts
import { describe, expect, it } from "vitest";

import { buildDeletionTicket, DELETION_SCOPES, validateDeletionRequest, type DeletionRequest } from "../data-deletion";

const request = (overrides: Partial<DeletionRequest> = {}): DeletionRequest => ({
  name: "Asha Rao",
  email: "asha@example.com",
  scope: "account",
  details: "",
  signedIn: false,
  ...overrides,
});

describe("validateDeletionRequest", () => {
  it("accepts a complete, confirmed request", () => {
    expect(validateDeletionRequest(request(), true)).toBeNull();
  });

  it("requires a name and a plausible email", () => {
    expect(validateDeletionRequest(request({ name: "  " }), true)).toMatch(/name/i);
    for (const email of ["", "asha", "asha@", "asha@example", "a b@example.com"]) {
      expect(validateDeletionRequest(request({ email }), true)).toMatch(/email/i);
    }
  });

  it("needs to be told which events, or what else, to delete", () => {
    expect(validateDeletionRequest(request({ scope: "registrations" }), true)).toMatch(/which events/i);
    expect(validateDeletionRequest(request({ scope: "other" }), true)).toMatch(/describe/i);
    expect(validateDeletionRequest(request({ scope: "registrations", details: "DevOps Connect 2026" }), true)).toBeNull();
    // A whole-account or marketing request is clear without further detail.
    expect(validateDeletionRequest(request({ scope: "marketing" }), true)).toBeNull();
  });

  it("is refused until the requester confirms deletion is permanent", () => {
    expect(validateDeletionRequest(request(), false)).toMatch(/confirm/i);
  });
});

describe("buildDeletionTicket", () => {
  it("files the request with the privacy team, naming what was asked for", () => {
    const ticket = buildDeletionTicket(request({ scope: "registrations", details: "DevOps Connect 2026" }));
    expect(ticket.category).toBe("privacy");
    expect(ticket.source).toBe("data_deletion_request");
    expect(ticket.subject).toContain("Delete my registration for specific events");
    expect(ticket.message).toContain("asha@example.com");
    expect(ticket.message).toContain("DevOps Connect 2026");
  });

  it("tells the handler whether the requester's identity is already established", () => {
    expect(buildDeletionTicket(request({ signedIn: true })).message).toContain("submitted while signed in");
    expect(buildDeletionTicket(request({ signedIn: false })).message).toContain("verify ownership");
  });

  it("stays within the ticket subject limit for every scope", () => {
    for (const scope of DELETION_SCOPES) {
      expect(buildDeletionTicket(request({ scope: scope.value })).subject.length).toBeLessThanOrEqual(200);
    }
  });

  it("says so when no details were given", () => {
    expect(buildDeletionTicket(request()).message).toContain("(none given)");
  });
});
