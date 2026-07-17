// Feature: creative-ai-backgrounds, Property 22: Resolved prompt composition includes all required parts
//
// Validates: Requirements 2.2, 2.3, 2.4
//
// Property 22: For any StylePreset, any (possibly-undefined) primaryColor
// and accentColor, any eventTitle string (including empty/whitespace-only),
// and any (possibly-empty or undefined) customPromptText, the result of
// `buildResolvedPrompt(...)`:
//  1. Contains the stylePreset's `descriptiveText` as a substring;
//  2. Contains at least one color reference — the theme value when
//     defined, otherwise the StylePreset's `defaultPrimaryColor` /
//     `defaultAccentColor`;
//  3. When `eventTitle.trim().length > 0`, contains the trimmed event
//     title as a substring;
//  4. When `customPromptText?.trim().length > 0`, contains the trimmed
//     custom prompt as a substring, and the descriptive text from clause 1
//     is still present (never replaced).

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  buildResolvedPrompt,
  STYLE_PRESET_DESCRIPTORS_FOR_TEST,
  STYLE_PRESETS,
  type StylePreset,
} from "../creative-ai";

// ─── Generators ────────────────────────────────────────────────────────────

const arbStylePreset: fc.Arbitrary<StylePreset> = fc.constantFrom(
  ...(STYLE_PRESETS as StylePreset[])
);

const arbOptionalColor = fc.option(
  fc.hexaString({ minLength: 6, maxLength: 6 }).map((h) => `#${h}`),
  { nil: undefined }
);

// Includes empty and whitespace-only strings alongside ordinary text.
const arbEventTitle = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.string({ minLength: 1, maxLength: 80 })
);

// Includes undefined, empty, whitespace-only, and ordinary text.
const arbCustomPromptText = fc.option(
  fc.oneof(
    fc.constant(""),
    fc.constant("   "),
    fc.string({ minLength: 1, maxLength: 120 })
  ),
  { nil: undefined }
);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 22: Resolved prompt composition includes all required parts", () => {
  it("always contains the descriptive text, a color reference, the title when non-empty, and the custom prompt when non-empty", () => {
    fc.assert(
      fc.property(
        arbStylePreset,
        arbOptionalColor,
        arbOptionalColor,
        arbEventTitle,
        arbCustomPromptText,
        (stylePreset, primaryColor, accentColor, eventTitle, customPromptText) => {
          const descriptor = STYLE_PRESET_DESCRIPTORS_FOR_TEST[stylePreset];
          const result = buildResolvedPrompt(
            stylePreset,
            primaryColor,
            accentColor,
            eventTitle,
            customPromptText
          );

          // (1) Descriptive text is always present.
          expect(result).toContain(descriptor.descriptiveText);

          // (2) At least one color reference — the passed color when
          // defined, the preset default otherwise.
          const expectedPrimary = primaryColor ?? descriptor.defaultPrimaryColor;
          const expectedAccent = accentColor ?? descriptor.defaultAccentColor;
          expect(result).toContain(expectedPrimary);
          expect(result).toContain(expectedAccent);

          // (3) Event title present when non-empty (post-trim).
          const trimmedTitle = eventTitle.trim();
          if (trimmedTitle.length > 0) {
            expect(result).toContain(trimmedTitle);
          }

          // (4) Custom prompt present when non-empty (post-trim), AND the
          // descriptive text is still present (never replaced).
          const trimmedCustom = customPromptText?.trim() ?? "";
          if (trimmedCustom.length > 0) {
            expect(result).toContain(trimmedCustom);
            expect(result).toContain(descriptor.descriptiveText);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
