// Feature: social-creative-generator, Property 1: Theme resolution with fallback
//
// Validates: Requirements 1.2, 1.3
//
// Property 1: For any `CreativeTemplate` and any `EventTheme` (with any subset
// of `primaryColor`/`accentColor`/`orgLogoUrl` defined or undefined),
// `resolveBackground` and `resolveAccentColor` return the theme's value when
// it is defined for an overridable field, and the template's own built-in
// default when it is undefined.

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  resolveBackground,
  resolveAccentColor,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  type EventTheme,
  type CreativeTemplate,
} from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const ALL_TEMPLATES: CreativeTemplate[] = [
  ...SPEAKER_TEMPLATES,
  ...SPONSOR_TEMPLATES,
  ...COMBO_TEMPLATES,
];

const arbEventTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#ff0000", "#00ff00", "#0000ff"), {
    nil: undefined,
  }),
  accentColor: fc.option(fc.constantFrom("#ffff00", "#ff00ff"), {
    nil: undefined,
  }),
  orgLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

/**
 * Dependent generator: pick a real template preset, then a text slot key
 * that actually exists on that template, then a theme — all packaged
 * together so the slot key generated is always valid for the template it's
 * paired with.
 */
const arbTemplateSlotTheme: fc.Arbitrary<{
  template: CreativeTemplate;
  slotKey: CreativeTemplate["textSlots"][number]["key"];
  theme: EventTheme;
}> = fc.constantFrom(...ALL_TEMPLATES).chain((template) =>
  fc.record({
    template: fc.constant(template),
    slotKey: fc.constantFrom(...template.textSlots.map((s) => s.key)),
    theme: arbEventTheme,
  })
);

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 1: Theme resolution with fallback", () => {
  it("resolveBackground returns the theme's color when overridable and defined, else the template default", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TEMPLATES),
        arbEventTheme,
        (template, theme) => {
          const result = resolveBackground(template, theme);

          // Image backgrounds are never color-substituted, regardless of theme.
          if (template.background.type === "image") {
            return (
              result.type === "image" &&
              result.url === template.background.url &&
              result.fit === template.background.fit
            );
          }

          const isOverridable = Boolean(template.themeOverridable.background);
          const themeDefinesColor = theme.primaryColor !== undefined;

          if (!isOverridable || !themeDefinesColor) {
            // Fallback: must deep-equal the template's own default exactly.
            return (
              JSON.stringify(result) === JSON.stringify(template.background)
            );
          }

          // Overridden: color-carrying fields must reflect the theme.
          if (template.background.type === "solid") {
            return (
              result.type === "solid" && result.color === theme.primaryColor
            );
          }
          if (template.background.type === "gradient") {
            return (
              result.type === "gradient" &&
              result.from === theme.primaryColor &&
              result.to === (theme.accentColor ?? theme.primaryColor) &&
              result.angle === template.background.angle
            );
          }
          return false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("resolveAccentColor returns the theme's accent color when the slot is overridable and the theme defines it, else the slot's own color", () => {
    fc.assert(
      fc.property(arbTemplateSlotTheme, ({ template, slotKey, theme }) => {
        const result = resolveAccentColor(template, slotKey, theme);
        const slot = template.textSlots.find((s) => s.key === slotKey)!;

        const isOverridable =
          template.themeOverridable.accentTextKeys?.includes(slotKey) ?? false;
        const themeDefinesAccent = theme.accentColor !== undefined;

        if (isOverridable && themeDefinesAccent) {
          return result === theme.accentColor;
        }

        return result === slot.color;
      }),
      { numRuns: 100 }
    );
  });
});
