// Feature: creative-customization, Property 50: Font_Choices consistency across UI and renderer
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.4
//
// Property 50 (three parts):
//
//   1. Every font family selectable in the Creative_Generator UI
//      (`FONT_OPTIONS` in `page-form/presets.ts`) is a non-empty string
//      (Requirement 4.1 — the UI's font-family picker never exposes an
//      unusable option).
//
//   2. `collectUniqueFontPairs(plan)` returns exactly the set of
//      `(fontFamily, fontWeight)` pairs present in `plan.elements`'s
//      `text` variants — no duplicates, no missing pairs. This is the
//      pure predicate that `ensureFontsLoadedForPlan` uses to decide
//      which `document.fonts.load(...)` calls to make (Requirement 4.4):
//      once the set is right, the DOM-touching wrapper is
//      trivially-correct plumbing.
//
//   3. Every font family declared in the base spec's `SPEAKER_TEMPLATES`,
//      `SPONSOR_TEMPLATES`, and `COMBO_TEMPLATES` is present in
//      `FONT_OPTIONS`, so the UI's dropdown covers every family the
//      renderer will actually try to load (Requirement 4.2 — the UI
//      picker is a superset of what the renderer ships with).
//
// The property test targets the pure `collectUniqueFontPairs` helper
// exported from `creative-renderer.ts` (Task 5.6). A DOM-touching test
// on `ensureFontsLoadedForPlan` itself is unnecessary — its DOM
// interaction is a `Promise.all` over the pairs returned by
// `collectUniqueFontPairs`, so property-testing the pair extraction is
// sufficient to cover the whole function's core behavior.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { FONT_OPTIONS } from "@/components/event/page-form/presets";
import {
  buildComboPlan,
  buildSpeakerPlan,
  buildSponsorPlan,
  collectUniqueFontPairs,
  type PlanElement,
  type RenderPlan,
  type SpeakerLike,
  type SponsorLike,
} from "../creative-renderer";
import {
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  type EventTheme,
} from "../creative-templates";

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

const arbBasePlan: fc.Arbitrary<RenderPlan> = fc.oneof(
  fc.record({ speaker: arbSpeaker, format: arbFormat, theme: arbTheme, template: fc.constantFrom(...SPEAKER_TEMPLATES) }).map(
    ({ speaker, format, theme, template }) => buildSpeakerPlan(speaker, template, format, theme),
  ),
  fc.record({ sponsor: arbSponsor, format: arbFormat, theme: arbTheme, template: fc.constantFrom(...SPONSOR_TEMPLATES) }).map(
    ({ sponsor, format, theme, template }) => buildSponsorPlan(sponsor, template, format, theme),
  ),
  fc.record({
    speaker: arbSpeaker,
    sponsor: arbSponsor,
    format: arbFormat,
    theme: arbTheme,
    template: fc.constantFrom(...COMBO_TEMPLATES),
  }).map(({ speaker, sponsor, format, theme, template }) => buildComboPlan(speaker, sponsor, template, format, theme)),
);

// Synthetic plan with arbitrary font pairs — lets us exercise
// `collectUniqueFontPairs` beyond the fonts baked into the base spec's
// preset templates.
const arbFontFamily = fc.constantFrom(...FONT_OPTIONS);
const arbFontWeight = fc.constantFrom(400, 500, 600, 700);

const arbSyntheticTextElement: fc.Arbitrary<Extract<PlanElement, { kind: "text" }>> = fc.record({
  kind: fc.constant("text" as const),
  key: fc.constantFrom("name", "title", "company", "sponsorName", "tierBadge", "presentedBy") as fc.Arbitrary<
    Extract<PlanElement, { kind: "text" }>["key"]
  >,
  text: fc.string({ minLength: 1, maxLength: 20 }),
  box: fc.record({
    x: fc.integer({ min: 0, max: 100 }),
    y: fc.integer({ min: 0, max: 100 }),
    width: fc.integer({ min: 10, max: 200 }),
    height: fc.integer({ min: 10, max: 200 }),
  }),
  fontFamily: arbFontFamily,
  fontWeight: arbFontWeight,
  baseSizePx: fc.integer({ min: 10, max: 96 }),
  color: fc.constantFrom("#000000", "#ffffff"),
  align: fc.constantFrom("left", "center", "right") as fc.Arbitrary<
    Extract<PlanElement, { kind: "text" }>["align"]
  >,
});

const arbSyntheticPlan: fc.Arbitrary<RenderPlan> = fc.record({
  format: arbFormat,
  texts: fc.array(arbSyntheticTextElement, { minLength: 0, maxLength: 8 }),
}).map(({ format, texts }) => ({ format, elements: texts satisfies PlanElement[] }));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Property 50: Font_Choices consistency across UI and renderer", () => {
  // Part 1 (example test — `FONT_OPTIONS` is a fixed constant, exhaustive
  // enumeration is the right tool).
  it("every font in FONT_OPTIONS is a non-empty string (Requirement 4.1)", () => {
    expect(FONT_OPTIONS.length).toBeGreaterThan(0);
    for (const font of FONT_OPTIONS) {
      expect(typeof font).toBe("string");
      expect(font.length).toBeGreaterThan(0);
      expect(font.trim()).toBe(font);
    }
  });

  // Part 2 (property test — the pair extractor is the pure core of
  // `ensureFontsLoadedForPlan`).
  it("collectUniqueFontPairs returns exactly the unique (family, weight) pairs in the plan's text elements (Requirement 4.4)", () => {
    fc.assert(
      fc.property(fc.oneof(arbBasePlan, arbSyntheticPlan), (plan) => {
        const pairs = collectUniqueFontPairs(plan);

        // Compute the expected set independently.
        const expected = new Set<string>();
        for (const el of plan.elements) {
          if (el.kind === "text") {
            expected.add(`${el.fontWeight}::${el.fontFamily}`);
          }
        }

        // Pair extractor returns one entry per unique pair (no duplicates).
        const actual = new Set(pairs.map((p) => `${p.weight}::${p.family}`));
        expect(actual.size).toBe(pairs.length);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  // Part 3 (example test — the base spec's template registry is a fixed
  // set, exhaustive coverage is again the right tool).
  it("every font family declared in the base spec's preset templates is present in FONT_OPTIONS (Requirement 4.2)", () => {
    const fontOptionSet = new Set(FONT_OPTIONS);
    const templateFamilies = new Set<string>();
    for (const template of [...SPEAKER_TEMPLATES, ...SPONSOR_TEMPLATES, ...COMBO_TEMPLATES]) {
      for (const slot of template.textSlots) {
        templateFamilies.add(slot.fontFamily);
      }
    }
    expect(templateFamilies.size).toBeGreaterThan(0);
    for (const family of templateFamilies) {
      expect(fontOptionSet.has(family)).toBe(true);
    }
  });
});
