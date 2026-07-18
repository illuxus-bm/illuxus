// Feature: event-brochure-generator, Property 35: Sponsor row logo-missing fallback
//
// Validates: Requirements 5.3, 5.4
//
// For any sponsor with `logo_url` present or absent, building that
// sponsor's row never throws and either includes an image reference to
// `logo_url` (when present) or includes the sponsor's name rendered as
// styled text in place of the logo (when absent).

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildSponsorRow, type SponsorInput } from "../brochure-sections";

const arbSponsor: fc.Arbitrary<SponsorInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  display_order: fc.integer({ min: 0, max: 100 }),
});

describe("Property 35: Sponsor row logo-missing fallback", () => {
  it("never throws and resolves to a url logo or a name-as-text fallback", () => {
    fc.assert(
      fc.property(arbSponsor, (sponsor) => {
        expect(() => buildSponsorRow(sponsor)).not.toThrow();

        const row = buildSponsorRow(sponsor);

        expect(row.name).toBe(sponsor.name);

        if (sponsor.logo_url) {
          expect(row.logo).toEqual({ type: "url", url: sponsor.logo_url });
        } else {
          expect(row.logo).toEqual({ type: "text", text: sponsor.name });
        }
      }),
      { numRuns: 100 }
    );
  });
});
