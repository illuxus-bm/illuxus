// Feature: event-brochure-generator, Property 40: Brochure filename is filesystem-safe and derived from the event title
//
// Validates: Requirements 9.2
//
// For any event title string (including empty strings, unicode characters,
// and filesystem-unsafe characters such as `/`, `\`, `:`, `*`, `?`), the
// filename-building function returns a string containing no
// filesystem-unsafe characters, ending in `.pdf`, and containing a
// non-empty slugified form of the title as a substring when the title
// contains at least one alphanumeric character.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildBrochureFilename } from "../brochure-templates";

const UNSAFE_CHARS = /[/\\:*?"<>|]/;

describe("Property 40: Brochure filename is filesystem-safe and derived from the event title", () => {
  it("never contains filesystem-unsafe characters and always ends in .pdf", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (title) => {
        const filename = buildBrochureFilename(title);

        expect(filename.endsWith(".pdf")).toBe(true);
        expect(UNSAFE_CHARS.test(filename)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("contains a non-empty slugified substring of the title when it has alphanumeric characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => /[a-zA-Z0-9]/.test(s)),
        (title) => {
          const filename = buildBrochureFilename(title);
          const expectedSlug = title
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "");

          expect(expectedSlug.length).toBeGreaterThan(0);
          expect(filename).toBe(`${expectedSlug}.pdf`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("falls back to brochure.pdf when the title has no alphanumeric characters", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }).filter((s) => !/[a-zA-Z0-9]/.test(s)),
        (title) => {
          expect(buildBrochureFilename(title)).toBe("brochure.pdf");
        }
      ),
      { numRuns: 100 }
    );
  });
});
