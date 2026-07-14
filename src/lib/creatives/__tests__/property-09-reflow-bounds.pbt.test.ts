// Feature: social-creative-generator, Property 9: Reflowed element bounds stay within canvas
//
// Validates: Requirements 5.3
//
// Property 9: For any CreativeTemplate and any Platform_Format (regardless of
// how far its aspect ratio differs from the template's authored aspect
// ratio), every box returned by `reflowTemplate` satisfies `box.x >= 0`,
// `box.y >= 0`, `box.x + box.width <= format.width`, and
// `box.y + box.height <= format.height`.

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  reflowTemplate,
  PLATFORM_FORMATS,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  type PlatformFormat,
} from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbTemplate = fc.constantFrom(
  ...SPEAKER_TEMPLATES,
  ...SPONSOR_TEMPLATES,
  ...COMBO_TEMPLATES
);

const arbRealFormat: fc.Arbitrary<PlatformFormat> = fc.constantFrom(
  ...PLATFORM_FORMATS
);

/**
 * Synthetic, extreme-aspect-ratio formats beyond the 5 built-in Platform_Formats,
 * to stress-test `reflowTemplate`'s safe-area clamp. `reflowTemplate` only reads
 * `width`/`height` off `format`, so a minimal record satisfies the shape used at
 * runtime; cast to `PlatformFormat` for the call site.
 */
const arbSyntheticFormat: fc.Arbitrary<PlatformFormat> = fc.record({
  id: fc.constant("synthetic" as const),
  label: fc.constant("Synthetic"),
  width: fc.integer({ min: 50, max: 3000 }),
  height: fc.integer({ min: 50, max: 3000 }),
}) as unknown as fc.Arbitrary<PlatformFormat>;

const arbFormat: fc.Arbitrary<PlatformFormat> = fc.oneof(
  arbRealFormat,
  arbSyntheticFormat
);

const EPSILON = 1e-9;

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 9: Reflowed element bounds stay within canvas", () => {
  it("every reflowed box stays within [0, width] x [0, height]", () => {
    fc.assert(
      fc.property(arbTemplate, arbFormat, (template, format) => {
        const { imageSlots, textSlots } = reflowTemplate(template, format);
        const allBoxes = [
          ...Object.values(imageSlots),
          ...Object.values(textSlots),
        ];

        for (const box of allBoxes) {
          if (box.x < 0) return false;
          if (box.y < 0) return false;
          if (box.x + box.width > format.width + EPSILON) return false;
          if (box.y + box.height > format.height + EPSILON) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});
