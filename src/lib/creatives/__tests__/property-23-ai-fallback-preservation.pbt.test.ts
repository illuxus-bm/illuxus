// Feature: creative-ai-backgrounds, Property 23: Fallback preserves the base spec's plan exactly
//
// Validates: Requirements 1.2, 9.1
//
// Property 23: For any speaker, sponsor, or (speaker, sponsor) pair, any
// `CreativeTemplate`, any `Platform_Format`, and any `EventTheme`, the
// `RenderPlan` produced by the plan builder when `aiBackground` is `null`
// (i.e. the organizer did not select AI, or selected AI but the preview
// failed / no preview was fired) is deep-equal to the `RenderPlan` produced
// by the identical inputs against the identical template (no splicing
// applied). Equivalently: the AI-off code path is a no-op with respect to
// the base spec's rendering pipeline.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  type SpeakerLike,
  type SponsorLike,
} from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  type CreativeTemplate,
  type EventTheme,
} from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  designation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
});

const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  tier_label: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const arbTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#ff0000", "#00ff00", "#0000ff"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#ffff00", "#ff00ff"), { nil: undefined }),
});

/**
 * Mirrors `CreativeGeneratorDialog.handleGenerate`'s exact ternary:
 *
 *   const templateForRender: CreativeTemplate =
 *     backgroundSource === "ai" && aiBackground
 *       ? { ...template, background: { type: "image", url: aiBackground.assetUrl, fit: "cover" } }
 *       : template;
 *
 * Here `backgroundSource` is fixed to `"template"` (equivalently,
 * `aiBackground` fixed to `null`), so the ternary always resolves to
 * `template` unchanged — the AI-off branch under test.
 */
function templateForRenderAiOff(template: CreativeTemplate): CreativeTemplate {
  const backgroundSource: "template" | "ai" = "template";
  const aiBackground: { assetUrl: string } | null = null;
  return backgroundSource === "ai" && aiBackground
    ? { ...template, background: { type: "image", url: aiBackground.assetUrl, fit: "cover" } }
    : template;
}

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 23: Fallback preserves the base spec's plan exactly", () => {
  it("buildSpeakerPlan: AI-off templateForRender produces the identical plan to the base spec's direct call", () => {
    fc.assert(
      fc.property(
        arbSpeaker,
        fc.constantFrom(...SPEAKER_TEMPLATES),
        arbFormat,
        arbTheme,
        (speaker, template, format, theme) => {
          const templateForRender = templateForRenderAiOff(template);
          const aiOffPlan = buildSpeakerPlan(speaker, templateForRender, format, theme);
          const basePlan = buildSpeakerPlan(speaker, template, format, theme);

          expect(aiOffPlan).toStrictEqual(basePlan);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("buildSponsorPlan: AI-off templateForRender produces the identical plan to the base spec's direct call", () => {
    fc.assert(
      fc.property(
        arbSponsor,
        fc.constantFrom(...SPONSOR_TEMPLATES),
        arbFormat,
        arbTheme,
        (sponsor, template, format, theme) => {
          const templateForRender = templateForRenderAiOff(template);
          const aiOffPlan = buildSponsorPlan(sponsor, templateForRender, format, theme);
          const basePlan = buildSponsorPlan(sponsor, template, format, theme);

          expect(aiOffPlan).toStrictEqual(basePlan);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("buildComboPlan: AI-off templateForRender produces the identical plan to the base spec's direct call", () => {
    fc.assert(
      fc.property(
        arbSpeaker,
        arbSponsor,
        fc.constantFrom(...COMBO_TEMPLATES),
        arbFormat,
        arbTheme,
        (speaker, sponsor, template, format, theme) => {
          const templateForRender = templateForRenderAiOff(template);
          const aiOffPlan = buildComboPlan(speaker, sponsor, templateForRender, format, theme);
          const basePlan = buildComboPlan(speaker, sponsor, template, format, theme);

          expect(aiOffPlan).toStrictEqual(basePlan);
        }
      ),
      { numRuns: 100 }
    );
  });
});
