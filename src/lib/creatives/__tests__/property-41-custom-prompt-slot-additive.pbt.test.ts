// Feature: creative-customization, Property 41: Custom_Prompt_Slot addition is additive to base plan
//
// Validates: Requirements 1.1, 1.4, 1.6, 14.1
//
// Property 41: For any entity, template, format, theme, and list of
// Custom_Prompt_Slots (including empty):
//   - Empty list ⇒ `decoratePlanWithCustomization` returns a plan whose
//     `PlanElement` sequence and coordinates equal the base plan
//     (Additivity_Invariant, Requirement 1.6, 14.1).
//   - Non-empty list ⇒ decorated plan's base-spec `PlanElement` subset
//     (background, image, text-for-built-in-slots, divider) is deep-equal
//     to the base plan's, AND one additional `text` `PlanElement` is
//     appended per Custom_Prompt_Slot in author order (Requirements 1.1,
//     1.4), each with its configured `fontFamily`, `color`, `align`, and
//     `text` (Requirement 1.2).

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  type PlanElement,
  type SpeakerLike,
  type SponsorLike,
  type RenderPlan,
} from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  type EventTheme,
} from "../creative-templates";
import {
  decoratePlanWithCustomization,
  MIN_FONT_SIZE_PX,
  type CustomPromptSlot,
  type CustomizationConfig,
  type DecorateContext,
  type ExtendedPlanElement,
} from "../creative-customization";

// ─── Generators ────────────────────────────────────────────────────────────

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

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

const arbCustomPromptSlot: fc.Arbitrary<CustomPromptSlot> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom("headline", "tagline", "eventDate", "quote", "custom") as fc.Arbitrary<
    CustomPromptSlot["type"]
  >,
  text: fc.string({ minLength: 1, maxLength: 40 }),
  xPct: fc.integer({ min: 0, max: 100 }),
  yPct: fc.integer({ min: 0, max: 100 }),
  maxWidthPct: fc.integer({ min: 5, max: 100 }),
  maxHeightPct: fc.integer({ min: 5, max: 100 }),
  fontFamily: fc.constantFrom("Poppins", "Inter", "Roboto", "Lato"),
  fontWeight: fc.constantFrom(400, 500, 600, 700),
  baseSizePx: fc.integer({ min: MIN_FONT_SIZE_PX, max: 96 }),
  color: fc.constantFrom("#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"),
  align: fc.constantFrom("left", "center", "right") as fc.Arbitrary<CustomPromptSlot["align"]>,
});

/**
 * Generates a base plan (speaker/sponsor/combo) paired with matching
 * entity + template so the plan is always a valid product of the base
 * spec's plan builders.
 */
const arbBasePlan: fc.Arbitrary<RenderPlan> = fc.oneof(
  fc.record({
    speaker: arbSpeaker,
    template: fc.constantFrom(...SPEAKER_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
  }).map(({ speaker, template, format, theme }) => buildSpeakerPlan(speaker, template, format, theme)),
  fc.record({
    sponsor: arbSponsor,
    template: fc.constantFrom(...SPONSOR_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
  }).map(({ sponsor, template, format, theme }) => buildSponsorPlan(sponsor, template, format, theme)),
  fc.record({
    speaker: arbSpeaker,
    sponsor: arbSponsor,
    template: fc.constantFrom(...COMBO_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
  }).map(({ speaker, sponsor, template, format, theme }) =>
    buildComboPlan(speaker, sponsor, template, format, theme)
  ),
);

const emptyCtx: DecorateContext = { effectiveFontFamily: "Poppins" };

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 41: Custom_Prompt_Slot addition is additive to base plan", () => {
  it("empty custom prompt list ⇒ decorated plan equals base plan by reference (structural additivity)", () => {
    fc.assert(
      fc.property(arbBasePlan, (basePlan) => {
        const config: CustomizationConfig = {};
        const decorated = decoratePlanWithCustomization(basePlan, config, emptyCtx);
        // Empty config short-circuits via isEmptyCustomization — same reference.
        expect(decorated).toBe(basePlan);
      }),
      { numRuns: 100 },
    );
  });

  it("empty customPromptSlots array in a config that IS otherwise non-empty ⇒ base subset of decorated plan equals base plan", () => {
    // When another field forces a non-empty decoration, the customPromptSlots
    // array being absent/empty must still leave the base plan's elements
    // in place (no removals, no reorderings beyond the specified Property 43
    // z-order).
    fc.assert(
      fc.property(arbBasePlan, (basePlan) => {
        const config: CustomizationConfig = {
          border: { color: "#000000", thicknessPx: 4, cornerRadiusPx: 10 },
        };
        const decorated = decoratePlanWithCustomization(basePlan, config, emptyCtx);

        // Every base element must appear in the decorated plan, in the
        // same relative order.
        const baseKinds = new Set(["background", "image", "text", "divider"]);
        const decoratedBaseSubset = decorated.elements.filter((e): e is PlanElement =>
          baseKinds.has(e.kind),
        );
        expect(decoratedBaseSubset).toEqual(basePlan.elements);
      }),
      { numRuns: 100 },
    );
  });

  it("non-empty customPromptSlots ⇒ base subset unchanged + one text element appended per slot in author order", () => {
    fc.assert(
      fc.property(
        arbBasePlan,
        fc.array(arbCustomPromptSlot, { minLength: 1, maxLength: 5 }),
        (basePlan, customSlots) => {
          const config: CustomizationConfig = { customPromptSlots: customSlots };
          const decorated = decoratePlanWithCustomization(basePlan, config, emptyCtx);

          // Compare per-kind counts. Since custom prompt elements are also
          // `kind: "text"`, we can't distinguish them by kind alone — but
          // every non-text kind (background/image/divider) is preserved
          // one-to-one, and text elements grow by exactly customSlots.length.
          const countByKind = (
            els: readonly ExtendedPlanElement[],
          ): Record<string, number> => {
            const out: Record<string, number> = {};
            for (const e of els) out[e.kind] = (out[e.kind] ?? 0) + 1;
            return out;
          };
          const baseCounts = countByKind(basePlan.elements);
          const decoratedCounts = countByKind(decorated.elements);

          expect(decoratedCounts.background ?? 0).toBe(baseCounts.background ?? 0);
          expect(decoratedCounts.image ?? 0).toBe(baseCounts.image ?? 0);
          expect(decoratedCounts.divider ?? 0).toBe(baseCounts.divider ?? 0);
          expect(decoratedCounts.text ?? 0).toBe((baseCounts.text ?? 0) + customSlots.length);

          // 2. Base plan text elements appear first, deep-equal to the
          //    base plan's originals (no slotOverrides / positionNudges,
          //    so `applyOverridesToTextElement` short-circuits and returns
          //    the same reference).
          const decoratedTexts = decorated.elements.filter(
            (e): e is Extract<ExtendedPlanElement, { kind: "text" }> => e.kind === "text",
          );
          const baseTexts = basePlan.elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> => e.kind === "text",
          );
          for (let i = 0; i < baseTexts.length; i++) {
            expect(decoratedTexts[i]).toEqual(baseTexts[i]);
          }

          // 3. Custom prompt text elements come next, in author order,
          //    each carrying its configured fields (Requirement 1.2).
          for (let i = 0; i < customSlots.length; i++) {
            const el = decoratedTexts[baseTexts.length + i];
            const slot = customSlots[i];
            expect(el.text).toBe(slot.text);
            expect(el.fontFamily).toBe(slot.fontFamily);
            expect(el.fontWeight).toBe(slot.fontWeight);
            expect(el.color).toBe(slot.color);
            expect(el.align).toBe(slot.align);
            // baseSizePx clamped upward to MIN_FONT_SIZE_PX defensively.
            expect(el.baseSizePx).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
          }

          // 4. Base plan non-text elements appear in the decorated plan in
          //    the same relative order (background before divider).
          const baseNonText = basePlan.elements.filter(
            (e) => e.kind !== "text",
          );
          const decoratedNonText = decorated.elements.filter(
            (e) => e.kind !== "text",
          );
          expect(decoratedNonText.length).toBe(baseNonText.length);
          for (let i = 0; i < baseNonText.length; i++) {
            expect(decoratedNonText[i]).toEqual(baseNonText[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
