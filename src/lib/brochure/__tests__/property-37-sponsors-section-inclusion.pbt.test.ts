// Feature: event-brochure-generator, Property 37: Sponsors section renders whenever at least one sponsor exists
//
// Validates: Requirements 5.7, 5.8
//
// For any list of sponsors (including sponsors with and without a
// `logo_url`), the Sponsors_Section inclusion decision returns "render" if
// and only if the list is non-empty — logo presence/absence never affects
// the inclusion decision.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { shouldRenderSponsorsSection, type SponsorInput } from "../brochure-sections";

const arbSponsor: fc.Arbitrary<SponsorInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  display_order: fc.integer({ min: 0, max: 100 }),
});

describe("Property 37: Sponsors section renders whenever at least one sponsor exists", () => {
  it("returns render iff the sponsor list is non-empty, regardless of logo presence", () => {
    fc.assert(
      fc.property(fc.array(arbSponsor, { maxLength: 30 }), (sponsors) => {
        expect(shouldRenderSponsorsSection(sponsors)).toBe(sponsors.length > 0);
      }),
      { numRuns: 100 }
    );
  });

  it("returns false for an empty list", () => {
    expect(shouldRenderSponsorsSection([])).toBe(false);
  });

  it("returns true even when every sponsor lacks a logo_url", () => {
    fc.assert(
      fc.property(fc.array(arbSponsor, { minLength: 1, maxLength: 10 }), (sponsors) => {
        const noLogoSponsors = sponsors.map((s) => ({ ...s, logo_url: undefined }));
        expect(shouldRenderSponsorsSection(noLogoSponsors)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});
