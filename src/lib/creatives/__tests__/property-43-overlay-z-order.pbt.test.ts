// Feature: creative-customization, Property 43: Background_Overlay z-order
//
// Validates: Requirements 5.1, 5.5, 5.6
//
// Property 43: For any Creative with any Background_Overlay + Watermark +
// Border configuration, the decorated `RenderPlan.elements` sequence
// follows the fixed z-order:
//
//   1. exactly one `background` element (from the base plan)
//   2. zero or more overlay elements (dim, gradient, blur-region), in that
//      canonical order (Requirement 5.1)
//   3. every image and text `PlanElement` from the base plan (in order)
//   4. custom-prompt text elements (in author order)
//   5. base divider (if present)
//   6. optionally the watermark image `PlanElement`
//   7. optionally the border element (last)
//
// No overlay element appears before the background or after any base image/
// text element (Requirement 5.1 / Overlay_Z_Order).

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
  PLATFORM_FORMATS,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  type EventTheme,
} from "../creative-templates";
import {
  decoratePlanWithCustomization,
  type BackgroundOverlay,
  type BorderStyle,
  type CustomizationConfig,
  type DecorateContext,
  type ExtendedPlanElement,
  type WatermarkConfig,
} from "../creative-customization";

// ─── Generators ────────────────────────────────────────────────────────────

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  photo_url: fc.constant(undefined),
  title: fc.constant(undefined),
  designation: fc.constant(undefined),
  company: fc.constant(undefined),
});
const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  logo_url: fc.constant(undefined),
  tier: fc.constantFrom("platinum", "gold", "silver"),
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

const arbOverlayDim = fc.record({
  color: fc.constant("#000000"),
  opacity: fc.integer({ min: 0, max: 100 }),
});
const arbOverlayGradient = fc.record({
  from: fc.constant("#000000"),
  to: fc.constant("#ffffff"),
  direction: fc.integer({ min: 0, max: 360 }),
  opacity: fc.integer({ min: 0, max: 100 }),
});
const arbOverlayBlurRegion = fc.record({
  boxPct: fc
    .tuple(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 5, max: 100 }),
      fc.integer({ min: 5, max: 100 }),
    )
    .map(([x, y, w, h]) => [x, y, w, h] as [number, number, number, number]),
  blurRadiusPx: fc.integer({ min: 0, max: 50 }),
});

const arbOverlay: fc.Arbitrary<BackgroundOverlay> = fc
  .record({
    dim: fc.option(arbOverlayDim, { nil: undefined }),
    gradient: fc.option(arbOverlayGradient, { nil: undefined }),
    blurRegion: fc.option(arbOverlayBlurRegion, { nil: undefined }),
  })
  .filter((v) => v.dim !== undefined || v.gradient !== undefined || v.blurRegion !== undefined);

const arbWatermark: fc.Arbitrary<WatermarkConfig> = fc.record({
  position: fc.constantFrom("top-left", "top-right", "bottom-left", "bottom-right") as fc.Arbitrary<
    WatermarkConfig["position"]
  >,
  opacity: fc.integer({ min: 0, max: 100 }),
  sizePct: fc.integer({ min: 5, max: 30 }),
  uploadedLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

const arbBorder: fc.Arbitrary<BorderStyle> = fc.record({
  color: fc.constant("#000000"),
  thicknessPx: fc.integer({ min: 0, max: 40 }),
  cornerRadiusPx: fc.integer({ min: 0, max: 40 }),
  dropShadow: fc.constant(undefined),
});

const ctxWithLogo: DecorateContext = {
  effectiveFontFamily: "Poppins",
  effectiveWatermarkLogoUrl: "https://example.test/logo.png",
};

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 43: Background_Overlay z-order", () => {
  it("decorated plan follows [background → overlays → images+texts → custom-prompt-texts → divider → watermark → border]", () => {
    fc.assert(
      fc.property(
        arbBasePlan,
        fc.option(arbOverlay, { nil: undefined }),
        fc.option(arbWatermark, { nil: undefined }),
        fc.option(arbBorder, { nil: undefined }),
        (basePlan, overlay, watermark, border) => {
          const config: CustomizationConfig = {};
          if (overlay) config.backgroundOverlay = overlay;
          if (watermark) config.watermark = watermark;
          if (border) config.border = border;

          // Ensure the config is non-empty so we actually decorate.
          if (!overlay && !watermark && !border) return;

          const decorated = decoratePlanWithCustomization(basePlan, config, ctxWithLogo);
          const els = decorated.elements;

          // Track index of first element of each type/tag.
          const isOverlay = (e: ExtendedPlanElement) =>
            e.kind === "overlay-dim" ||
            e.kind === "overlay-gradient" ||
            e.kind === "overlay-blur-region";
          const isBaseImgOrText = (e: ExtendedPlanElement): e is PlanElement =>
            e.kind === "image" || e.kind === "text";

          const firstBackgroundIdx = els.findIndex((e) => e.kind === "background");
          expect(firstBackgroundIdx).toBe(0);
          // Exactly one background element.
          const bgCount = els.filter((e) => e.kind === "background").length;
          expect(bgCount).toBe(1);

          const firstOverlayIdx = els.findIndex(isOverlay);
          const firstImgOrTextIdx = els.findIndex(isBaseImgOrText);
          const lastImgOrTextIdx = els
            .map((e, i) => (isBaseImgOrText(e) ? i : -1))
            .reduce((max, i) => Math.max(max, i), -1);

          // Every overlay must be between background (idx 0) and the first
          // base image/text/divider.
          if (firstOverlayIdx !== -1) {
            expect(firstOverlayIdx).toBeGreaterThan(firstBackgroundIdx);
            if (firstImgOrTextIdx !== -1) {
              const lastOverlayIdx = els
                .map((e, i) => (isOverlay(e) ? i : -1))
                .reduce((max, i) => Math.max(max, i), -1);
              expect(lastOverlayIdx).toBeLessThan(firstImgOrTextIdx);
            }
          }

          // Overlay canonical order (dim → gradient → blur-region) when present.
          const overlayKinds = els
            .filter(isOverlay)
            .map((e) => e.kind);
          const canonicalOrder = ["overlay-dim", "overlay-gradient", "overlay-blur-region"];
          const canonicalIndex = (k: string) => canonicalOrder.indexOf(k);
          for (let i = 1; i < overlayKinds.length; i++) {
            expect(canonicalIndex(overlayKinds[i])).toBeGreaterThan(canonicalIndex(overlayKinds[i - 1]));
          }

          // Watermark, if present, is after every base image/text element.
          const watermarkIdx = els.findIndex((e) => e.kind === "watermark");
          if (watermarkIdx !== -1) {
            expect(watermarkIdx).toBeGreaterThan(lastImgOrTextIdx);
          }

          // Border, if present, is the last element.
          const borderIdx = els.findIndex((e) => e.kind === "border");
          if (borderIdx !== -1) {
            expect(borderIdx).toBe(els.length - 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
