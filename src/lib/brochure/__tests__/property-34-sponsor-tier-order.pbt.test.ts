// Feature: event-brochure-generator, Property 34: Sponsor tier groups are ordered by fixed tier rank
//
// Validates: Requirements 5.2
//
// For any subset of Sponsor_Tier values present among an event's sponsors,
// the rendered tier-group order follows the fixed rank
// `platinum > gold > silver > bronze > custom`, restricted to only the
// tiers actually present, regardless of the input sponsors' original list
// order.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { groupSponsorsByTierOrdered, type SponsorInput } from "../brochure-sections";
import { TIER_RANK } from "../brochure-templates";

const arbTierString = fc.constantFrom("platinum", "gold", "silver", "bronze", "custom", "some-unknown-tier");

const arbSponsor: fc.Arbitrary<SponsorInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: arbTierString,
  display_order: fc.integer({ min: 0, max: 100 }),
});

describe("Property 34: Sponsor tier groups are ordered by fixed tier rank", () => {
  it("orders groups by TIER_RANK regardless of input order", () => {
    fc.assert(
      fc.property(fc.array(arbSponsor, { minLength: 1, maxLength: 30 }), (sponsors) => {
        const groups = groupSponsorsByTierOrdered(sponsors);

        const ranks = groups.map((g) => TIER_RANK[g.tier]);
        const sortedRanks = [...ranks].sort((a, b) => a - b);
        expect(ranks).toEqual(sortedRanks);
      }),
      { numRuns: 100 }
    );
  });

  it("is invariant to shuffling the input sponsor order", () => {
    fc.assert(
      fc.property(fc.array(arbSponsor, { minLength: 1, maxLength: 20 }), fc.integer(), (sponsors, seed) => {
        const shuffled = [...sponsors].sort(() => (seed % 2 === 0 ? 1 : -1));

        const groupsA = groupSponsorsByTierOrdered(sponsors).map((g) => g.tier);
        const groupsB = groupSponsorsByTierOrdered(shuffled).map((g) => g.tier);

        expect(groupsB).toEqual(groupsA);
      }),
      { numRuns: 50 }
    );
  });
});
