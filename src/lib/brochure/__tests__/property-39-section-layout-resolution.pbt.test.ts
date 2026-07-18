// Feature: event-brochure-generator, Property 39: Section layout resolution preserves order and inclusion exactly
//
// Validates: Requirements 7.2, 7.3, 8.2
//
// For any permutation and any subset (inclusion/exclusion combination) of
// the five Brochure_Sections, the layout-resolution function used by both
// the preview and the export pipeline produces a resolved section list
// whose order exactly matches the configured Section_Layout order and
// whose membership exactly matches the set of included sections — no
// section is added, dropped, or reordered relative to the configuration,
// and the preview's resolved list and the export pipeline's resolved list
// are identical for the same Section_Layout input.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { resolveSectionLayout, type BrochureSectionId, type SectionLayout } from "../brochure-templates";

const ALL_SECTION_IDS: BrochureSectionId[] = ["cover", "agenda", "speakers", "sponsors", "venueLogistics"];

/** Arbitrary permutation of the 5 fixed section ids, each with an
 *  arbitrary included flag — a full Section_Layout configuration. */
const arbSectionLayout: fc.Arbitrary<SectionLayout> = fc
  .shuffledSubarray(ALL_SECTION_IDS, { minLength: ALL_SECTION_IDS.length, maxLength: ALL_SECTION_IDS.length })
  .chain((permutation) =>
    fc.tuple(...permutation.map(() => fc.boolean())).map((includedFlags) =>
      permutation.map((id, idx) => ({ id, included: includedFlags[idx] }))
    )
  );

describe("Property 39: Section layout resolution preserves order and inclusion exactly", () => {
  it("resolved list order matches the configured order, restricted to included entries", () => {
    fc.assert(
      fc.property(arbSectionLayout, (layout) => {
        const resolved = resolveSectionLayout(layout);

        const expected = layout.filter((entry) => entry.included).map((entry) => entry.id);
        expect(resolved).toEqual(expected);

        // Membership exactly matches the set of included sections.
        const includedSet = new Set(expected);
        expect(new Set(resolved)).toEqual(includedSet);
        expect(resolved.length).toBe(expected.length);
      }),
      { numRuns: 100 }
    );
  });

  it("is deterministic — calling twice with the same input (preview vs export) gives deep-equal results", () => {
    fc.assert(
      fc.property(arbSectionLayout, (layout) => {
        const first = resolveSectionLayout(layout);
        const second = resolveSectionLayout(layout);
        expect(first).toStrictEqual(second);
      }),
      { numRuns: 100 }
    );
  });
});
