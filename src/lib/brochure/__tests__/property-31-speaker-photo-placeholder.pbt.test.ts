// Feature: event-brochure-generator, Property 31: Missing speaker photo produces a placeholder, never a broken reference
//
// Validates: Requirements 4.3
//
// For any speaker with `photo_url` present or absent, building that
// speaker's row never throws and either includes an image reference to
// `photo_url` (when present) or includes a Missing_Data_Placeholder marker
// (when absent) — never an image element with a null/undefined URL.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildSpeakerRows, type SpeakerInput } from "../brochure-sections";

const arbSpeaker: fc.Arbitrary<SpeakerInput> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 0, maxLength: 30 }),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  designation: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  display_order: fc.integer({ min: 0, max: 100 }),
});

describe("Property 31: Missing speaker photo produces a placeholder, never a broken reference", () => {
  it("never throws and resolves to a url photo or a placeholder marker", () => {
    fc.assert(
      fc.property(arbSpeaker, (speaker) => {
        expect(() => buildSpeakerRows([speaker])).not.toThrow();

        const [row] = buildSpeakerRows([speaker]);

        if (speaker.photo_url) {
          expect(row.photo).toEqual({ type: "url", url: speaker.photo_url });
        } else {
          expect(row.photo.type).toBe("placeholder");
          if (row.photo.type === "placeholder") {
            expect(row.photo.initial).toBeTruthy();
            expect(row.photo.initial.length).toBe(1);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("falls back to '?' when the speaker name is empty or whitespace-only", () => {
    fc.assert(
      fc.property(fc.constantFrom("", " ", "   ", "\t"), (name) => {
        const [row] = buildSpeakerRows([
          { id: "s1", name, display_order: 0 },
        ]);
        expect(row.photo).toEqual({ type: "placeholder", initial: "?" });
      }),
      { numRuns: 20 }
    );
  });
});
