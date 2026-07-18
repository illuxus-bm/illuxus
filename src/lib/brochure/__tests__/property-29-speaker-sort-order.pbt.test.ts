// Feature: event-brochure-generator, Property 29: Speakers are sorted by display order
//
// Validates: Requirements 4.1
//
// For any list of speakers linked to an event with arbitrary
// `display_order` values, the speaker row-builder produces rows ordered by
// `display_order` ascending.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildSpeakerRows, type SpeakerInput } from "../brochure-sections";

const arbSpeaker: fc.Arbitrary<SpeakerInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  designation: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  display_order: fc.integer({ min: -1000, max: 1000 }),
});

describe("Property 29: Speakers are sorted by display order", () => {
  it("produces rows ordered by display_order ascending", () => {
    fc.assert(
      fc.property(fc.array(arbSpeaker, { maxLength: 30 }), (speakers) => {
        const rows = buildSpeakerRows(speakers);

        expect(rows.length).toBe(speakers.length);

        const expectedNameOrder = [...speakers]
          .sort((a, b) => a.display_order - b.display_order)
          .map((s) => s.name);

        expect(rows.map((r) => r.name)).toEqual(expectedNameOrder);
      }),
      { numRuns: 100 }
    );
  });
});
