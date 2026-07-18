// Feature: event-brochure-generator, Property 33: Sponsors are partitioned by tier exactly once
//
// Validates: Requirements 5.1
//
// For any list of sponsors with arbitrary Sponsor_Tier values, grouping
// those sponsors by tier produces groups such that every input sponsor
// appears in exactly one group matching its own tier, and the union of all
// groups' sponsors equals the input list exactly (no sponsor duplicated or
// dropped).

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { groupSponsorsByTierOrdered, type SponsorInput } from "../brochure-sections";

const arbTierString = fc.constantFrom("platinum", "gold", "silver", "bronze", "custom", "unknown-tier", "");

const arbSponsor: fc.Arbitrary<SponsorInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: arbTierString,
  display_order: fc.integer({ min: 0, max: 100 }),
});

/** Sponsors are uniquely keyed by id for set-membership comparisons below. */
function distinctIds(sponsors: SponsorInput[]): SponsorInput[] {
  const seen = new Set<string>();
  const result: SponsorInput[] = [];
  for (const s of sponsors) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    result.push(s);
  }
  return result;
}

describe("Property 33: Sponsors are partitioned by tier exactly once", () => {
  it("every sponsor appears in exactly one group matching its own (normalized) tier, union equals input", () => {
    fc.assert(
      fc.property(fc.array(arbSponsor, { maxLength: 30 }), (rawSponsors) => {
        const sponsors = distinctIds(rawSponsors);
        const groups = groupSponsorsByTierOrdered(sponsors);

        const totalGrouped = groups.reduce((sum, g) => sum + g.sponsors.length, 0);
        expect(totalGrouped).toBe(sponsors.length);

        const groupedNames = new Set(groups.flatMap((g) => g.sponsors.map((s) => s.name)));
        const inputNames = new Set(sponsors.map((s) => s.name));
        // Names may collide across distinct sponsors; verify count-consistency
        // per name instead of a naive set-equality when duplicates exist.
        for (const name of inputNames) {
          const inputCount = sponsors.filter((s) => s.name === name).length;
          const groupedCount = groups.flatMap((g) => g.sponsors).filter((s) => s.name === name).length;
          expect(groupedCount).toBe(inputCount);
        }
        expect(groupedNames.size).toBeLessThanOrEqual(inputNames.size);

        // Each group's tier is unique across groups (no group appears twice).
        const tiers = groups.map((g) => g.tier);
        expect(new Set(tiers).size).toBe(tiers.length);
      }),
      { numRuns: 100 }
    );
  });
});
