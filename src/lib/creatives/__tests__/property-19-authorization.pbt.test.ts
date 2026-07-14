// Feature: social-creative-generator, Property 19: Authorization matches the owner-or-admin rule
//
// Validates: Requirements 9.1, 9.2
//
// Property 19: For any event owner id, requester id, and admin boolean
// flag, the authorization predicate used to gate creative generation,
// batch generation, and library access returns `true` if and only if the
// requester id equals the owner id or the admin flag is `true`, and
// returns `false` for every other combination.

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isAuthorizedForEventCreatives } from "../creative-storage";

// ─── Generators ────────────────────────────────────────────────────────────

// Draw requesterId from a `oneof` of "equal to ownerId" and "independent
// uuid" so the requesterId === ownerId branch is exercised with meaningful
// frequency rather than relying on two independently-sampled uuids to
// collide by chance.
const arbCase = fc.uuid().chain((ownerId) =>
  fc.record({
    ownerId: fc.constant(ownerId),
    requesterId: fc.oneof(fc.constant(ownerId), fc.uuid()),
    isAdmin: fc.boolean(),
  })
);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 19: Authorization matches the owner-or-admin rule", () => {
  it("returns true iff requesterId === ownerId or isAdmin is true", () => {
    fc.assert(
      fc.property(arbCase, ({ ownerId, requesterId, isAdmin }) => {
        const result = isAuthorizedForEventCreatives(ownerId, requesterId, isAdmin);

        return result === (requesterId === ownerId || isAdmin);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Unit tests ────────────────────────────────────────────────────────────

describe("isAuthorizedForEventCreatives (examples)", () => {
  it("owner, not admin -> authorized", () => {
    expect(isAuthorizedForEventCreatives("owner-1", "owner-1", false)).toBe(true);
  });

  it("not owner, admin -> authorized", () => {
    expect(isAuthorizedForEventCreatives("owner-1", "other-user", true)).toBe(true);
  });

  it("not owner, not admin -> unauthorized", () => {
    expect(isAuthorizedForEventCreatives("owner-1", "other-user", false)).toBe(false);
  });

  it("owner and admin -> authorized", () => {
    expect(isAuthorizedForEventCreatives("owner-1", "owner-1", true)).toBe(true);
  });
});
