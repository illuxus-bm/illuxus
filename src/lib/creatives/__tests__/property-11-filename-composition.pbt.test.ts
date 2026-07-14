// Feature: social-creative-generator, Property 11: Download filenames are valid and traceable
//
// Validates: Requirements 5.4
//
// Property 11: For any entity name string (including unicode, punctuation,
// path separators, and empty/whitespace-only strings) and any
// `Platform_Format`, `creativeFilename` returns a string ending in `.png`
// that contains no filesystem-unsafe characters (`/ \ : * ? " < > |`) and
// whose non-empty portion is derived from both the sanitized entity name and
// the format's label.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { creativeFilename } from "../creative-renderer";
import { PLATFORM_FORMATS } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

/** Arbitrary unicode/punctuation/empty entity names — fast-check's default
 *  string arbitrary already covers unicode code points. */
const arbEntityName = fc.string({ minLength: 0, maxLength: 100 });

/** Targeted generator that mixes explicit filesystem-unsafe characters and
 *  path separators into an otherwise-arbitrary name, to specifically stress
 *  the sanitization of `/ \ : * ? " < > |`. */
const arbUnsafeEntityName = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s + "/\\:*?\"<>|");

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const UNSAFE_CHARS = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"];

function assertValidFilename(result: string): void {
  // 1. Ends with .png
  expect(result.endsWith(".png")).toBe(true);

  // 2. Contains none of the filesystem-unsafe characters.
  for (const char of UNSAFE_CHARS) {
    expect(result.includes(char)).toBe(false);
  }

  // 3. Non-empty beyond the bare ".png" suffix.
  expect(result.length).toBeGreaterThan(4);

  // 4. Entirely lowercase/digits/hyphens plus the literal .png suffix.
  expect(/^[a-z0-9-]+\.png$/.test(result)).toBe(true);
}

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 11: Download filenames are valid and traceable", () => {
  it("produces a valid, safe filename for arbitrary unicode/empty entity names", () => {
    fc.assert(
      fc.property(arbEntityName, arbFormat, (entityName, format) => {
        const result = creativeFilename(entityName, format);
        assertValidFilename(result);
      }),
      { numRuns: 100 }
    );
  });

  it("produces a valid, safe filename when the entity name contains explicit unsafe characters", () => {
    fc.assert(
      fc.property(arbUnsafeEntityName, arbFormat, (entityName, format) => {
        const result = creativeFilename(entityName, format);
        assertValidFilename(result);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Unit test ─────────────────────────────────────────────────────────────

describe("creativeFilename (unit)", () => {
  it("composes name + format label into a slugified filename", () => {
    const linkedinFormat = PLATFORM_FORMATS.find((f) => f.id === "linkedin-post")!;
    expect(creativeFilename("Jane Doe", linkedinFormat)).toBe("jane-doe-linkedin-post.png");
  });
});
