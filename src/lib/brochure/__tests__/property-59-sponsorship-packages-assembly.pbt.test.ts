// Feature: event-brochure-generator, Property 59: Sponsorship packages table assembly and inclusion
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5 (Sponsorship_Packages extension)
//
// For any combination of benefit rows, tiers, and per-cell values (booleans,
// strings, or absent), `buildSponsorshipPackagesContent`:
//  - returns `null` iff there are zero non-empty benefit rows OR zero tiers
//    with a non-empty name;
//  - otherwise returns a table whose `benefits` array is exactly the
//    non-empty (post-trim) input benefit strings, and whose `tiers` array
//    contains exactly the tiers with a non-empty (post-trim) name, each
//    with a `cells` array of EXACTLY `benefits.length` entries — no jagged
//    rows reach the renderer, regardless of how many cells the raw input
//    tier carried;
//  - a `true` cell resolves to `{ kind: "check" }`, a `false` cell to
//    `{ kind: "cross" }`, a non-empty string to `{ kind: "text", value }`,
//    and anything else (null/undefined/empty string) to `{ kind: "empty" }`.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  buildSponsorshipPackagesContent,
  type SponsorshipPackagesInput,
  type SponsorshipTierInput,
} from "../brochure-sections";

/** Arbitrary benefit-row label: may be empty/whitespace-only (dropped) or
 *  a real short string (kept, trimmed). */
const arbBenefitLabel = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 24 })
);

/** Arbitrary raw cell value covering every branch `resolveSponsorshipCell`
 *  must handle. */
const arbCellValue: fc.Arbitrary<string | boolean | null | undefined> = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 20 })
);

const arbTier: fc.Arbitrary<SponsorshipTierInput> = fc.record({
  name: arbBenefitLabel,
  price: fc.option(fc.string({ minLength: 0, maxLength: 15 }), { nil: undefined }),
  cells: fc.array(arbCellValue, { minLength: 0, maxLength: 8 }),
});

const arbInput: fc.Arbitrary<SponsorshipPackagesInput> = fc.record({
  title: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
  benefits: fc.array(arbBenefitLabel, { minLength: 0, maxLength: 8 }),
  tiers: fc.array(arbTier, { minLength: 0, maxLength: 5 }),
});

function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

describe("Property 59: Sponsorship packages table assembly and inclusion", () => {
  it("returns null iff there are zero non-empty benefits or zero named tiers", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const content = buildSponsorshipPackagesContent(input);

        const nonEmptyBenefitCount = (input.benefits ?? []).filter(isNonEmpty).length;
        const namedTierCount = (input.tiers ?? []).filter((t) => isNonEmpty(t?.name)).length;
        const shouldRender = nonEmptyBenefitCount > 0 && namedTierCount > 0;

        if (!shouldRender) {
          expect(content).toBeNull();
        } else {
          expect(content).not.toBeNull();
        }
      }),
      { numRuns: 200 }
    );
  });

  it("resolves benefits/tiers to exactly the non-empty entries, every tier's cells padded to benefits.length, and every cell kind matches its raw value", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const content = buildSponsorshipPackagesContent(input);
        const expectedBenefits = (input.benefits ?? []).filter(isNonEmpty).map((b) => b.trim());
        const expectedTiers = (input.tiers ?? []).filter((t) => isNonEmpty(t?.name));

        if (expectedBenefits.length === 0 || expectedTiers.length === 0) {
          expect(content).toBeNull();
          return;
        }

        expect(content).not.toBeNull();
        const c = content!;

        // Benefits are exactly the non-empty, trimmed input rows, in order.
        expect(c.benefits).toEqual(expectedBenefits);

        // Tiers are exactly the named tiers, in order, each with a name
        // matching the trimmed input.
        expect(c.tiers.length).toBe(expectedTiers.length);
        c.tiers.forEach((tier, i) => {
          expect(tier.name).toBe(expectedTiers[i].name.trim());

          // Every tier's cells array has EXACTLY benefits.length entries —
          // no jagged rows, regardless of how many raw cells were supplied.
          expect(tier.cells.length).toBe(expectedBenefits.length);

          // Each cell's kind matches the raw value at that index.
          const rawCells = expectedTiers[i].cells ?? [];
          tier.cells.forEach((cell, cellIdx) => {
            const raw = rawCells[cellIdx];
            if (raw === true) {
              expect(cell).toEqual({ kind: "check" });
            } else if (raw === false) {
              expect(cell).toEqual({ kind: "cross" });
            } else if (typeof raw === "string" && raw.trim().length > 0) {
              expect(cell).toEqual({ kind: "text", value: raw.trim() });
            } else {
              expect(cell).toEqual({ kind: "empty" });
            }
          });

          // price: present iff the raw price was a non-empty string.
          if (isNonEmpty(expectedTiers[i].price)) {
            expect(tier.price).toBe((expectedTiers[i].price as string).trim());
          } else {
            expect(tier.price).toBeUndefined();
          }
        });
      }),
      { numRuns: 200 }
    );
  });

  it("falls back to the default title when title is absent/empty, and trims a provided title", () => {
    // Non-whitespace alphanumeric generator — a whitespace-only benefit/
    // tier name would legitimately trim to empty and null out the whole
    // table (already covered by the inclusion test above), which isn't
    // what this test is checking.
    const arbNonEmptyLabel = fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")), {
        minLength: 1,
        maxLength: 20,
      })
      .map((chars) => chars.join(""));
    fc.assert(
      fc.property(arbNonEmptyLabel, arbNonEmptyLabel, (benefit, tierName) => {
          const withoutTitle = buildSponsorshipPackagesContent({
            benefits: [benefit],
            tiers: [{ name: tierName }],
          });
          expect(withoutTitle?.title).toBe("Sponsorship Packages");

          const withTitle = buildSponsorshipPackagesContent({
            title: "  Premium Partnership Packages  ",
            benefits: [benefit],
            tiers: [{ name: tierName }],
          });
          expect(withTitle?.title).toBe("Premium Partnership Packages");
        }
      ),
      { numRuns: 30 }
    );
  });
});
