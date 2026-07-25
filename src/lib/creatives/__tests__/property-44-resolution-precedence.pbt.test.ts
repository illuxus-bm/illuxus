// Feature: creative-customization, Property 44: Resolution_Precedence is a strict, transitive per-field ordering
//
// Validates: Requirements 2.6, 6.2, 9.4, 9.5, 10.3
//
// Property 44: For any combination of (Entity_Template_Override,
// Customization_Config, applied Brand_Kit, `EventTheme`, `orgLogoUrl`),
// `resolveEffective` returns per-field values in the strict precedence:
//
//   Template:     snapshotTemplate > entityOverrideTemplate > baseTemplate
//                                                             (Requirement 10.3)
//   Theme:        baseTheme values win per field; Brand_Kit fills undefined
//                 slots (Requirement 9.4, 9.5)
//   Effective font family:
//                 brandKit.fontFamily ?? "Poppins" (Requirement 9.4, 4.1)
//   Watermark logo URL:
//                 config.watermark.uploadedLogoUrl > orgLogoUrl > undefined
//                 (Requirement 6.2)

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  type CreativeTemplate,
  type EventTheme,
} from "../creative-templates";
import {
  resolveEffective,
  type AppliedBrandKit,
  type CustomCreativeTemplate,
  type CustomizationConfig,
  type WatermarkConfig,
} from "../creative-customization";

// ─── Generators ────────────────────────────────────────────────────────────

const ALL_TEMPLATES: CreativeTemplate[] = [
  ...SPEAKER_TEMPLATES,
  ...SPONSOR_TEMPLATES,
  ...COMBO_TEMPLATES,
];

const arbBaseTemplate = fc.constantFrom(...ALL_TEMPLATES);

const arbCustomCreativeTemplate: fc.Arbitrary<CustomCreativeTemplate> = arbBaseTemplate.map(
  (base) => ({
    ...base,
    id: `custom-${base.id}`,
    name: `Custom ${base.name}`,
    basedOn: base.id,
  }),
);

const arbTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#111111", "#222222"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#aaaaaa", "#bbbbbb"), { nil: undefined }),
  orgLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

const arbBrandKit: fc.Arbitrary<AppliedBrandKit> = fc.record({
  id: fc.uuid(),
  primaryColor: fc.option(fc.constantFrom("#333333", "#444444"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#cccccc", "#dddddd"), { nil: undefined }),
  fontFamily: fc.option(fc.constantFrom("Inter", "Roboto", "Lato"), { nil: undefined }),
  logoUrl: fc.option(fc.webUrl(), { nil: undefined }),
  preferredTemplateIds: fc.constant(undefined),
  preferredFormats: fc.constant(undefined),
});

const arbWatermark: fc.Arbitrary<WatermarkConfig> = fc.record({
  position: fc.constant("bottom-right") as fc.Arbitrary<WatermarkConfig["position"]>,
  opacity: fc.constant(80),
  sizePct: fc.constant(10),
  uploadedLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 44: Resolution_Precedence — snapshotTemplate > entityOverride > baseTemplate", () => {
  it("returns snapshotTemplate when set, regardless of entityOverride/baseTemplate", () => {
    fc.assert(
      fc.property(
        arbBaseTemplate,
        arbCustomCreativeTemplate,
        fc.option(arbBaseTemplate, { nil: undefined }),
        arbTheme,
        (baseTemplate, snapshotTemplate, entityOverrideTemplate, baseTheme) => {
          const config: CustomizationConfig = { snapshotTemplate };
          const result = resolveEffective({
            baseTemplate,
            baseTheme,
            config,
            entityOverrideTemplate,
          });
          expect(result.template).toBe(snapshotTemplate);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns entityOverrideTemplate when no snapshotTemplate is set", () => {
    fc.assert(
      fc.property(
        arbBaseTemplate,
        arbBaseTemplate,
        arbTheme,
        (baseTemplate, entityOverrideTemplate, baseTheme) => {
          const result = resolveEffective({
            baseTemplate,
            baseTheme,
            config: {},
            entityOverrideTemplate,
          });
          expect(result.template).toBe(entityOverrideTemplate);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns baseTemplate when neither snapshotTemplate nor entityOverrideTemplate is set", () => {
    fc.assert(
      fc.property(arbBaseTemplate, arbTheme, (baseTemplate, baseTheme) => {
        const result = resolveEffective({ baseTemplate, baseTheme, config: {} });
        expect(result.template).toBe(baseTemplate);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 44: Resolution_Precedence — theme (baseTheme > brandKit per field)", () => {
  it("baseTheme.primaryColor wins over brandKit.primaryColor when defined; brandKit fills undefined slots", () => {
    fc.assert(
      fc.property(
        arbBaseTemplate,
        arbTheme,
        arbBrandKit,
        (baseTemplate, baseTheme, brandKit) => {
          const result = resolveEffective({
            baseTemplate,
            baseTheme,
            config: {},
            brandKit,
          });
          const expectedPrimary = baseTheme.primaryColor ?? brandKit.primaryColor;
          const expectedAccent = baseTheme.accentColor ?? brandKit.accentColor;
          const expectedLogo = baseTheme.orgLogoUrl ?? brandKit.logoUrl;
          expect(result.theme.primaryColor).toBe(expectedPrimary);
          expect(result.theme.accentColor).toBe(expectedAccent);
          expect(result.theme.orgLogoUrl).toBe(expectedLogo);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 44: Resolution_Precedence — effectiveFontFamily", () => {
  it("returns brandKit.fontFamily when set, else 'Poppins'", () => {
    fc.assert(
      fc.property(arbBaseTemplate, arbTheme, arbBrandKit, (baseTemplate, baseTheme, brandKit) => {
        const result = resolveEffective({ baseTemplate, baseTheme, config: {}, brandKit });
        const expected = brandKit.fontFamily ?? "Poppins";
        expect(result.effectiveFontFamily).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("returns 'Poppins' when no brandKit is provided", () => {
    fc.assert(
      fc.property(arbBaseTemplate, arbTheme, (baseTemplate, baseTheme) => {
        const result = resolveEffective({ baseTemplate, baseTheme, config: {} });
        expect(result.effectiveFontFamily).toBe("Poppins");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 44: Resolution_Precedence — watermark URL", () => {
  it("config.watermark.uploadedLogoUrl wins over orgLogoUrl; falls back to orgLogoUrl; else undefined", () => {
    fc.assert(
      fc.property(
        arbBaseTemplate,
        arbTheme,
        fc.option(arbWatermark, { nil: undefined }),
        fc.option(fc.webUrl(), { nil: undefined }),
        (baseTemplate, baseTheme, watermark, orgLogoUrl) => {
          const config: CustomizationConfig = watermark ? { watermark } : {};
          const result = resolveEffective({ baseTemplate, baseTheme, config, orgLogoUrl });
          const expected = watermark?.uploadedLogoUrl ?? orgLogoUrl ?? undefined;
          expect(result.effectiveWatermarkLogoUrl).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
