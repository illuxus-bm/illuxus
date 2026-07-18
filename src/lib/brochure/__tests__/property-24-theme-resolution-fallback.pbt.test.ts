// Feature: event-brochure-generator, Property 24: Brochure theme resolution with fallback, non-mutating
//
// Validates: Requirements 1.2, 1.3, 1.4
//
// For any Brochure_Theme and any Event_Theme (with any subset of
// `primaryColor` / `accentColor` / `fontFamily` defined or undefined, and
// with any optional per-field override supplied by the organizer), the
// theme-resolution function returns the override when supplied, else the
// Event_Theme's value when defined, else the Brochure_Theme's own built-in
// default — and the input Event_Theme object passed in is never mutated by
// this resolution (deep-equal to itself before and after the call).

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { BROCHURE_THEMES, resolveBrochureTheme, type BrochureThemeOverride, type EventThemeInput } from "../brochure-templates";

const arbOptionalString = fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined });

const arbEventTheme: fc.Arbitrary<EventThemeInput> = fc.record({
  primaryColor: arbOptionalString,
  accentColor: arbOptionalString,
  fontFamily: arbOptionalString,
});

const arbOverride: fc.Arbitrary<BrochureThemeOverride | undefined> = fc.option(
  fc.record({
    primaryColor: arbOptionalString,
    accentColor: arbOptionalString,
    fontFamily: arbOptionalString,
  }),
  { nil: undefined }
);

const arbTheme = fc.constantFrom(...BROCHURE_THEMES);

describe("Property 24: Brochure theme resolution with fallback, non-mutating", () => {
  it("resolves override ?? eventTheme ?? theme default per field, without mutating eventTheme", () => {
    fc.assert(
      fc.property(arbTheme, arbEventTheme, arbOverride, (theme, eventTheme, override) => {
        const eventThemeBefore = structuredClone(eventTheme);

        const resolved = resolveBrochureTheme(theme, eventTheme, override);

        // Precedence: override ?? eventTheme value ?? theme's own default.
        const expectedPrimary = override?.primaryColor ?? eventTheme.primaryColor ?? theme.defaultColors.primaryColor;
        const expectedAccent = override?.accentColor ?? eventTheme.accentColor ?? theme.defaultColors.accentColor;
        const expectedFont = override?.fontFamily ?? eventTheme.fontFamily ?? theme.defaultColors.fontFamily;

        expect(resolved.primaryColor).toBe(expectedPrimary);
        expect(resolved.accentColor).toBe(expectedAccent);
        expect(resolved.fontFamily).toBe(expectedFont);

        // Non-mutation: eventTheme must be deep-equal to itself before/after.
        expect(eventTheme).toStrictEqual(eventThemeBefore);
      }),
      { numRuns: 100 }
    );
  });
});
