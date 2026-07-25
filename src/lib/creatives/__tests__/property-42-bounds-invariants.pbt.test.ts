// Feature: creative-customization, Property 42: Bound + floor invariants for nudge / font / watermark / border
//
// Validates: Requirements 1.3, 3.2, 3.3, 6.5, 7.3
//
// Property 42 has four sub-invariants that MUST hold simultaneously for any
// combination of customizations at render time:
//
//   42.1 (Nudge_Bounds) — `applyNudgeToBox` output stays inside
//        `[0, format.width] × [0, format.height]` for any real `dxPct`/
//        `dyPct` (Requirements 3.2, 3.3).
//   42.2 (Font_Size_Floor) — every text `PlanElement` emitted through the
//        customization pipeline has `baseSizePx >= MIN_FONT_SIZE_PX`, even
//        when a Custom_Prompt_Slot's `baseSizePx` is below the floor
//        (Requirement 1.3).
//   42.3 (Watermark_Bounded) — `resolveWatermarkBox` output stays inside
//        `[0, format.width] × [0, format.height]` for every `sizePct` in
//        `(0, 100]` and every corner `position` (Requirement 6.5).
//   42.4 (Border_Bounded) — `clampBorder` output has `thicknessPx` in
//        `[0, 40]` and `cornerRadiusPx` in `[0, min(w, h) / 2]`
//        (Requirement 7.3).

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  PLATFORM_FORMATS,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  type PlatformFormat,
  type ResolvedBox,
  type EventTheme,
} from "../creative-templates";
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
  applyNudgeToBox,
  clampBorder,
  clampNudge,
  decoratePlanWithCustomization,
  MIN_FONT_SIZE_PX,
  NUDGE_MAX_PCT,
  BORDER_THICKNESS_MAX_PX,
  resolveWatermarkBox,
  type BorderStyle,
  type CustomPromptSlot,
  type CustomizationConfig,
  type DecorateContext,
  type PositionNudge,
  type WatermarkConfig,
} from "../creative-customization";

// ─── Shared generators ─────────────────────────────────────────────────────

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const EPSILON = 1e-9;

// Resolved box that fits within the format (used as `applyNudgeToBox` input).
const arbBoxWithinFormat = (format: PlatformFormat): fc.Arbitrary<ResolvedBox> =>
  fc
    .record({
      x: fc.integer({ min: 0, max: format.width - 1 }),
      y: fc.integer({ min: 0, max: format.height - 1 }),
      width: fc.integer({ min: 1, max: format.width }),
      height: fc.integer({ min: 1, max: format.height }),
    })
    .map(({ x, y, width, height }) => {
      const w = Math.min(width, format.width);
      const h = Math.min(height, format.height);
      return {
        x: Math.max(0, Math.min(x, format.width - w)),
        y: Math.max(0, Math.min(y, format.height - h)),
        width: w,
        height: h,
      };
    });

// Any real number (including out-of-range values) for dxPct/dyPct — the
// clamp is exactly what we're testing.
const arbNudgeMagnitude = fc.double({ min: -200, max: 200, noNaN: true });

const arbNudge: fc.Arbitrary<PositionNudge> = fc.record({
  dxPct: fc.option(arbNudgeMagnitude, { nil: undefined }),
  dyPct: fc.option(arbNudgeMagnitude, { nil: undefined }),
  align: fc.option(fc.constantFrom("left", "center", "right") as fc.Arbitrary<PositionNudge["align"]>, {
    nil: undefined,
  }),
});

// ─── 42.1 Nudge_Bounds ─────────────────────────────────────────────────────

describe("Property 42.1: Nudge_Bounds — applyNudgeToBox output stays in safe area for any dxPct/dyPct", () => {
  it("applyNudgeToBox always yields a box within [0, width] × [0, height]", () => {
    fc.assert(
      fc.property(
        arbFormat.chain((format) =>
          fc.record({
            format: fc.constant(format),
            box: arbBoxWithinFormat(format),
            nudge: arbNudge,
          }),
        ),
        ({ format, box, nudge }) => {
          const out = applyNudgeToBox(box, nudge, format);
          expect(out.x).toBeGreaterThanOrEqual(0);
          expect(out.y).toBeGreaterThanOrEqual(0);
          expect(out.x + out.width).toBeLessThanOrEqual(format.width + EPSILON);
          expect(out.y + out.height).toBeLessThanOrEqual(format.height + EPSILON);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("clampNudge always produces dxPct/dyPct within [-NUDGE_MAX_PCT, NUDGE_MAX_PCT]", () => {
    fc.assert(
      fc.property(arbNudge, (nudge) => {
        const clamped = clampNudge(nudge);
        if (clamped.dxPct !== undefined) {
          expect(clamped.dxPct).toBeGreaterThanOrEqual(-NUDGE_MAX_PCT);
          expect(clamped.dxPct).toBeLessThanOrEqual(NUDGE_MAX_PCT);
        }
        if (clamped.dyPct !== undefined) {
          expect(clamped.dyPct).toBeGreaterThanOrEqual(-NUDGE_MAX_PCT);
          expect(clamped.dyPct).toBeLessThanOrEqual(NUDGE_MAX_PCT);
        }
        // align passes through unchanged
        expect(clamped.align).toBe(nudge.align);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── 42.2 Font_Size_Floor ──────────────────────────────────────────────────

const arbCustomPromptSlotWithFloor: fc.Arbitrary<CustomPromptSlot> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom("headline", "tagline", "eventDate", "quote", "custom") as fc.Arbitrary<
    CustomPromptSlot["type"]
  >,
  text: fc.string({ minLength: 1, maxLength: 20 }),
  xPct: fc.integer({ min: 0, max: 100 }),
  yPct: fc.integer({ min: 0, max: 100 }),
  maxWidthPct: fc.integer({ min: 5, max: 100 }),
  maxHeightPct: fc.integer({ min: 5, max: 100 }),
  fontFamily: fc.constant("Poppins"),
  fontWeight: fc.constantFrom(400, 500, 600, 700),
  // Deliberately include sizes BELOW the floor to test the clamp.
  baseSizePx: fc.integer({ min: 0, max: 128 }),
  color: fc.constant("#000000"),
  align: fc.constant("center") as fc.Arbitrary<CustomPromptSlot["align"]>,
});

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
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze"),
  tier_label: fc.constant(undefined),
});
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

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

const emptyCtx: DecorateContext = { effectiveFontFamily: "Poppins" };

describe("Property 42.2: Font_Size_Floor — every text PlanElement's baseSizePx is >= MIN_FONT_SIZE_PX", () => {
  it("customization pipeline never emits a text element below the floor, even when a Custom_Prompt_Slot's baseSizePx is < 10", () => {
    fc.assert(
      fc.property(
        arbBasePlan,
        fc.array(arbCustomPromptSlotWithFloor, { minLength: 1, maxLength: 4 }),
        (basePlan, customSlots) => {
          const config: CustomizationConfig = { customPromptSlots: customSlots };
          const decorated = decoratePlanWithCustomization(basePlan, config, emptyCtx);
          const textElements = decorated.elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> => e.kind === "text",
          );
          for (const el of textElements) {
            expect(el.baseSizePx).toBeGreaterThanOrEqual(MIN_FONT_SIZE_PX);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── 42.3 Watermark_Bounded ────────────────────────────────────────────────

const arbWatermarkConfig: fc.Arbitrary<WatermarkConfig> = fc.record({
  position: fc.constantFrom("top-left", "top-right", "bottom-left", "bottom-right") as fc.Arbitrary<
    WatermarkConfig["position"]
  >,
  // opacity is unbounded input to test the clamp path
  opacity: fc.double({ min: -50, max: 150, noNaN: true }),
  // sizePct in (0, 100]
  sizePct: fc.double({ min: 0.01, max: 100, noNaN: true }),
  uploadedLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

describe("Property 42.3: Watermark_Bounded — resolveWatermarkBox output stays in canvas bounds", () => {
  it("for every corner + sizePct in (0, 100] on every PlatformFormat, the resolved box fits", () => {
    fc.assert(
      fc.property(arbFormat, arbWatermarkConfig, (format, wm) => {
        const box = resolveWatermarkBox(wm, format);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(format.width + EPSILON);
        expect(box.y + box.height).toBeLessThanOrEqual(format.height + EPSILON);
        expect(box.width).toBeGreaterThanOrEqual(0);
        expect(box.height).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── 42.4 Border_Bounded ───────────────────────────────────────────────────

const arbBorderStyle: fc.Arbitrary<BorderStyle> = fc.record({
  color: fc.constantFrom("#000000", "#ffffff", "#ff0000"),
  // Deliberately unbounded inputs to test the clamp.
  thicknessPx: fc.double({ min: -50, max: 500, noNaN: true }),
  cornerRadiusPx: fc.double({ min: -50, max: 5000, noNaN: true }),
  dropShadow: fc.option(
    fc.record({
      color: fc.constant("#000000"),
      offsetX: fc.integer({ min: -10, max: 10 }),
      offsetY: fc.integer({ min: -10, max: 10 }),
      blur: fc.integer({ min: 0, max: 20 }),
    }),
    { nil: undefined },
  ),
});

describe("Property 42.4: Border_Bounded — clampBorder yields thickness in [0, 40] and cornerRadius in [0, min/2]", () => {
  it("clampBorder always produces safe thickness and radius for any format", () => {
    fc.assert(
      fc.property(arbFormat, arbBorderStyle, (format, border) => {
        const clamped = clampBorder(border, format);
        expect(clamped.thicknessPx).toBeGreaterThanOrEqual(0);
        expect(clamped.thicknessPx).toBeLessThanOrEqual(BORDER_THICKNESS_MAX_PX);
        expect(clamped.cornerRadiusPx).toBeGreaterThanOrEqual(0);
        expect(clamped.cornerRadiusPx).toBeLessThanOrEqual(Math.min(format.width, format.height) / 2);
        // Other fields pass through.
        expect(clamped.color).toBe(border.color);
        expect(clamped.dropShadow).toEqual(border.dropShadow);
      }),
      { numRuns: 100 },
    );
  });
});
