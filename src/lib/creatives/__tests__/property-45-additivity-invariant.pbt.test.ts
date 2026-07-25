// Feature: creative-customization, Property 45: Additivity_Invariant against base spec
//
// Validates: Requirements 1.6, 2.6, 3.5, 4.4, 5.5, 6.6, 7.4, 10.6, 14.1, 14.3, 14.4
//
// Property 45: For any Creative rendered where every Creative_Customization
// condition is false (customization = {}, no Custom_Template, no Brand_Kit,
// no Entity_Template_Override that applies), the resulting `RenderPlan`
// SHALL be structurally equal (deep-equal) to the base spec's plan for the
// same (entity, template, format, theme) tuple.
//
// This test targets the pure `creative-customization.ts` module: it verifies
//
//   1. `isEmptyCustomization({})` is `true`.
//   2. `decoratePlanWithCustomization(basePlan, {}, ctx)` returns the same
//      reference as `basePlan` — the strongest form of structural equality.
//   3. Even when `ctx.effectiveWatermarkLogoUrl` is set, an empty config
//      still short-circuits (a watermark URL doesn't force a watermark
//      element without a matching `config.watermark`).
//   4. `resolveEffective` with no snapshotTemplate / entityOverride / brandKit
//      returns the base template and base theme unchanged.
//   5. `isEmptyCustomization` also returns `true` for configs containing
//      only `appliedBrandKitId` or `snapshotTemplate` — those fields are
//      resolved before the decorator runs (see design.md note in
//      `isEmptyCustomization` docstring).

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  type SpeakerLike,
  type SponsorLike,
  type RenderPlan,
} from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  type CreativeTemplate,
  type EventTheme,
} from "../creative-templates";
import {
  decoratePlanWithCustomization,
  isEmptyCustomization,
  resolveEffective,
  type CustomCreativeTemplate,
  type CustomizationConfig,
  type DecorateContext,
} from "../creative-customization";

// ─── Generators ────────────────────────────────────────────────────────────

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#123456", "#abcdef"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#010203", "#fedcba"), { nil: undefined }),
  orgLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  designation: fc.constant(undefined),
  company: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  tier_label: fc.constant(undefined),
});

const arbBasePlan: fc.Arbitrary<RenderPlan> = fc.oneof(
  fc
    .record({
      entity: arbSpeaker,
      template: fc.constantFrom(...SPEAKER_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ entity, template, format, theme }) => buildSpeakerPlan(entity, template, format, theme)),
  fc
    .record({
      entity: arbSponsor,
      template: fc.constantFrom(...SPONSOR_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ entity, template, format, theme }) => buildSponsorPlan(entity, template, format, theme)),
  fc
    .record({
      speaker: arbSpeaker,
      sponsor: arbSponsor,
      template: fc.constantFrom(...COMBO_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ speaker, sponsor, template, format, theme }) =>
      buildComboPlan(speaker, sponsor, template, format, theme),
    ),
);

const ALL_TEMPLATES: CreativeTemplate[] = [
  ...SPEAKER_TEMPLATES,
  ...SPONSOR_TEMPLATES,
  ...COMBO_TEMPLATES,
];

const arbSnapshotTemplate: fc.Arbitrary<CustomCreativeTemplate> = fc
  .constantFrom(...ALL_TEMPLATES)
  .map((base) => ({ ...base, id: `custom-${base.id}`, name: `Custom ${base.name}`, basedOn: base.id }));

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 45: Additivity_Invariant against base spec", () => {
  it("isEmptyCustomization({}) is true", () => {
    expect(isEmptyCustomization({})).toBe(true);
    expect(isEmptyCustomization(undefined)).toBe(true);
    expect(isEmptyCustomization(null)).toBe(true);
  });

  it("isEmptyCustomization returns true for a config with only appliedBrandKitId or snapshotTemplate", () => {
    fc.assert(
      fc.property(fc.uuid(), arbSnapshotTemplate, (brandKitId, snapshot) => {
        expect(isEmptyCustomization({ appliedBrandKitId: brandKitId })).toBe(true);
        expect(isEmptyCustomization({ snapshotTemplate: snapshot })).toBe(true);
        expect(isEmptyCustomization({ appliedBrandKitId: brandKitId, snapshotTemplate: snapshot })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("decoratePlanWithCustomization(plan, {}, ctx) returns the input plan reference (byte-level equality)", () => {
    fc.assert(
      fc.property(
        arbBasePlan,
        fc.option(fc.webUrl(), { nil: undefined }),
        (basePlan, watermarkUrl) => {
          const ctx: DecorateContext = {
            effectiveFontFamily: "Poppins",
            effectiveWatermarkLogoUrl: watermarkUrl,
          };
          const decorated = decoratePlanWithCustomization(basePlan, {}, ctx);
          // Reference equality — strongest form of structural equality.
          expect(decorated).toBe(basePlan);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("decoratePlanWithCustomization with only appliedBrandKitId still returns the base plan reference", () => {
    fc.assert(
      fc.property(arbBasePlan, fc.uuid(), (basePlan, brandKitId) => {
        const config: CustomizationConfig = { appliedBrandKitId: brandKitId };
        const decorated = decoratePlanWithCustomization(basePlan, config, {
          effectiveFontFamily: "Poppins",
        });
        expect(decorated).toBe(basePlan);
      }),
      { numRuns: 100 },
    );
  });

  it("resolveEffective with no snapshotTemplate/entityOverride/brandKit returns baseTemplate and baseTheme verbatim", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_TEMPLATES), arbTheme, (baseTemplate, baseTheme) => {
        const result = resolveEffective({ baseTemplate, baseTheme, config: {} });
        // Template is exactly baseTemplate (reference-equal).
        expect(result.template).toBe(baseTemplate);
        // Theme fields all equal baseTheme's per-field values (since no
        // brandKit is provided, undefined stays undefined).
        expect(result.theme.primaryColor).toBe(baseTheme.primaryColor);
        expect(result.theme.accentColor).toBe(baseTheme.accentColor);
        expect(result.theme.orgLogoUrl).toBe(baseTheme.orgLogoUrl);
        // No brandKit ⇒ effectiveFontFamily falls back to "Poppins".
        expect(result.effectiveFontFamily).toBe("Poppins");
        // No config.watermark.uploadedLogoUrl ⇒ effectiveWatermarkLogoUrl
        // is undefined (Requirement 6.3 — omit rather than render placeholder).
        expect(result.effectiveWatermarkLogoUrl).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it("decorated plan is deep-equal to base plan under empty customization (no reordering, no additions)", () => {
    fc.assert(
      fc.property(arbBasePlan, (basePlan) => {
        const decorated = decoratePlanWithCustomization(basePlan, {}, {
          effectiveFontFamily: "Poppins",
        });
        // Same reference (strongest form of deep-equal), but also verify
        // structural deep-equal for good measure.
        expect(decorated).toEqual(basePlan);
      }),
      { numRuns: 100 },
    );
  });
});
