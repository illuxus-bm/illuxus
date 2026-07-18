// Feature: event-brochure-generator, Property 30: Speaker row title precedence and missing-field omission
//
// Validates: Requirements 4.2, 4.4
//
// For any speaker with any subset of `title`, `designation`, and `company`
// defined or undefined, building that speaker's row never throws, displays
// `title` when defined, else `designation` when `title` is absent and
// `designation` is defined, else omits the title/designation line
// entirely, and independently omits the company line when `company` is
// absent — with no line rendering empty text.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildSpeakerRows, type SpeakerInput } from "../brochure-sections";

const arbOptionalString = fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined });

const arbSpeaker: fc.Arbitrary<SpeakerInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: arbOptionalString,
  designation: arbOptionalString,
  company: arbOptionalString,
  display_order: fc.integer({ min: 0, max: 100 }),
});

describe("Property 30: Speaker row title precedence and missing-field omission", () => {
  it("never throws, prefers title over designation, and independently omits company", () => {
    fc.assert(
      fc.property(arbSpeaker, (speaker) => {
        expect(() => buildSpeakerRows([speaker])).not.toThrow();

        const [row] = buildSpeakerRows([speaker]);

        if (speaker.title) {
          expect(row.subtitleLine).toBe(speaker.title);
        } else if (speaker.designation) {
          expect(row.subtitleLine).toBe(speaker.designation);
        } else {
          expect(row.subtitleLine).toBeUndefined();
        }

        if (speaker.company) {
          expect(row.companyLine).toBe(speaker.company);
        } else {
          expect(row.companyLine).toBeUndefined();
        }

        expect(row.subtitleLine).not.toBe("");
        expect(row.companyLine).not.toBe("");
      }),
      { numRuns: 100 }
    );
  });
});
