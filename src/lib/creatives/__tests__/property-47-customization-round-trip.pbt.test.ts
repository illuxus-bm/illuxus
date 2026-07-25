// Feature: creative-customization, Property 47: Customization_Config round-trip
//
// Validates: Requirements 8.10, 9.8, 12.3, 12.4, 12.5
//
// Property 47 has two parts:
//
//   47.1 (JSON round-trip semantic preservation) — for any
//        `CustomizationConfig` `c`, the value returned by
//        `parseCustomization(JSON.parse(JSON.stringify(c)))` is
//        semantically equivalent to what `parseCustomization(c as unknown)`
//        would produce. Every field that survives one round-trip through
//        the write path (`JSON.stringify` → JSONB → `JSON.parse`) and the
//        read path (`parseCustomization`) MUST match the write-side value
//        exactly. Malformed sub-fields are dropped consistently: applying
//        the parse-write-parse cycle twice reaches a fixed point
//        (`parseCustomization` is idempotent). This is the persistence
//        guarantee behind `event_creatives.customization` (Requirement
//        12.3) — a Creative saved with a config renders the same next time
//        it's loaded, even after `snapshotTemplate` embedding and
//        Brand_Kit application bake (Requirements 12.4, 12.5, 8.10, 9.8).
//
//   47.2 (Render-plan determinism) — for any (entity, template, format,
//        theme, customization, ctx) tuple, calling `buildXPlan` +
//        `decoratePlanWithCustomization` twice with the same inputs
//        produces two structurally-equal `RenderPlan`s (`toEqual`). This
//        is the core guarantee behind Property 47 as it applies to the
//        render pipeline: `event_creatives.customization` + the render
//        pipeline is deterministic in its inputs. The same config, the
//        same base spec, produces the same pixels — every time.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildComboPlan,
  buildSpeakerPlan,
  buildSponsorPlan,
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
import {
  decoratePlanWithCustomization,
  parseCustomization,
  BORDER_THICKNESS_MAX_PX,
  MIN_FONT_SIZE_PX,
  NUDGE_MAX_PCT,
  type BorderStyle,
  type CustomPromptSlot,
  type CustomizationConfig,
  type DecorateContext,
  type OverlayBlurRegion,
  type OverlayDim,
  type OverlayGradient,
  type PositionNudge,
  type SlotOverride,
  type WatermarkConfig,
} from "../creative-customization";

// ─── Generators ────────────────────────────────────────────────────────────

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const arbTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#111111", "#222222"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#aaaaaa", "#bbbbbb"), { nil: undefined }),
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

// ─── Customization sub-part generators (values chosen so they survive
// `parseCustomization` validation) ────────────────────────────────────────

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

const arbSlotOverride: fc.Arbitrary<SlotOverride> = fc
  .record(
    {
      color: fc.option(fc.constantFrom("#111111", "#222222", "#333333"), { nil: undefined }),
      fontFamily: fc.option(fc.constantFrom("Poppins", "Inter", "Roboto"), { nil: undefined }),
    },
    { requiredKeys: [] },
  )
  // `parseSlotOverride` drops entries with neither field set, so restrict
  // to overrides that have at least one field to survive the round-trip.
  .filter((o) => o.color !== undefined || o.fontFamily !== undefined);

const arbPositionNudge: fc.Arbitrary<PositionNudge> = fc
  .record(
    {
      dxPct: fc.option(fc.integer({ min: -NUDGE_MAX_PCT, max: NUDGE_MAX_PCT }), { nil: undefined }),
      dyPct: fc.option(fc.integer({ min: -NUDGE_MAX_PCT, max: NUDGE_MAX_PCT }), { nil: undefined }),
      align: fc.option(
        fc.constantFrom("left", "center", "right") as fc.Arbitrary<NonNullable<PositionNudge["align"]>>,
        { nil: undefined },
      ),
    },
    { requiredKeys: [] },
  )
  .filter((n) => n.dxPct !== undefined || n.dyPct !== undefined || n.align !== undefined);

// Slot keys used for override / nudge maps — a small, representative mix
// of built-in slot keys and custom-prefixed keys.
const arbSlotKey = fc.constantFrom("name", "title", "company", "photo", "custom:abc");

const arbOverlayDim: fc.Arbitrary<OverlayDim> = fc.record({
  color: fc.constantFrom("#000000", "#ffffff", "#123456"),
  opacity: fc.integer({ min: 0, max: 100 }),
});

const arbOverlayGradient: fc.Arbitrary<OverlayGradient> = fc.record({
  from: fc.constantFrom("#111111", "#222222"),
  to: fc.constantFrom("#333333", "#444444"),
  direction: fc.integer({ min: 0, max: 360 }),
  opacity: fc.integer({ min: 0, max: 100 }),
});

const arbOverlayBlurRegion: fc.Arbitrary<OverlayBlurRegion> = fc.record({
  boxPct: fc.tuple(
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
  ) as fc.Arbitrary<[number, number, number, number]>,
  blurRadiusPx: fc.integer({ min: 0, max: 40 }),
});

const arbWatermark: fc.Arbitrary<WatermarkConfig> = fc.record(
  {
    position: fc.constantFrom("top-left", "top-right", "bottom-left", "bottom-right") as fc.Arbitrary<
      WatermarkConfig["position"]
    >,
    opacity: fc.integer({ min: 0, max: 100 }),
    sizePct: fc.integer({ min: 5, max: 30 }),
    uploadedLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
  },
  { requiredKeys: ["position", "opacity", "sizePct"] },
);

const arbBorder: fc.Arbitrary<BorderStyle> = fc.record(
  {
    color: fc.constantFrom("#000000", "#ffffff", "#ff0000"),
    thicknessPx: fc.integer({ min: 0, max: BORDER_THICKNESS_MAX_PX }),
    cornerRadiusPx: fc.integer({ min: 0, max: 60 }),
    dropShadow: fc.option(
      fc.record({
        color: fc.constantFrom("#000000", "#555555"),
        offsetX: fc.integer({ min: -20, max: 20 }),
        offsetY: fc.integer({ min: -20, max: 20 }),
        blur: fc.integer({ min: 0, max: 40 }),
      }),
      { nil: undefined },
    ),
  },
  { requiredKeys: ["color", "thicknessPx", "cornerRadiusPx"] },
);

/**
 * Builds a non-empty `Partial<Record<...>>` map from a small set of slot
 * keys → the arbitrary value type. Uses `fc.array` over `[key, value]`
 * tuples to simulate the way `slotOverrides` / `positionNudges` are keyed
 * by `SlotKey` at runtime. Requires `minLength: 1` because
 * `parseCustomization` drops an empty map from its output (only sets the
 * top-level key when the parsed map has at least one entry) — so an
 * empty-map input would fail the round-trip identity.
 */
function arbSlotKeyedMap<T>(arbValue: fc.Arbitrary<T>): fc.Arbitrary<Record<string, T>> {
  return fc
    .array(fc.tuple(arbSlotKey, arbValue), { minLength: 1, maxLength: 5 })
    .map((pairs) => {
      const out: Record<string, T> = {};
      for (const [k, v] of pairs) out[k] = v;
      return out;
    });
}

/**
 * Full `CustomizationConfig` generator. Every sub-field is optional; the
 * generator is biased toward non-trivial configs (uses `fc.option` with
 * `nil: undefined` so absent fields are represented naturally). Every
 * value is chosen so it survives `parseCustomization` validation, so a
 * `parseCustomization(c as unknown)` MUST return `c` unchanged (this is
 * the invariant Property 47.1 relies on).
 */
const arbCustomizationConfig: fc.Arbitrary<CustomizationConfig> = fc
  .record(
    {
      customPromptSlots: fc.option(fc.array(arbCustomPromptSlot, { minLength: 1, maxLength: 3 }), {
        nil: undefined,
      }),
      slotOverrides: fc.option(arbSlotKeyedMap(arbSlotOverride), { nil: undefined }),
      positionNudges: fc.option(arbSlotKeyedMap(arbPositionNudge), { nil: undefined }),
      backgroundOverlay: fc.option(
        fc
          .record(
            {
              dim: fc.option(arbOverlayDim, { nil: undefined }),
              gradient: fc.option(arbOverlayGradient, { nil: undefined }),
              blurRegion: fc.option(arbOverlayBlurRegion, { nil: undefined }),
            },
            { requiredKeys: [] },
          )
          .filter(
            (o) => o.dim !== undefined || o.gradient !== undefined || o.blurRegion !== undefined,
          ),
        { nil: undefined },
      ),
      watermark: fc.option(arbWatermark, { nil: undefined }),
      border: fc.option(arbBorder, { nil: undefined }),
      appliedBrandKitId: fc.option(fc.uuid(), { nil: undefined }),
    },
    { requiredKeys: [] },
  )
  .map((raw) => {
    // Strip undefined-valued keys so the config's JSON.stringify output is
    // free of `"key": undefined` entries (which JSON.stringify drops
    // silently but which would create asymmetry between our generated
    // `c` and `parseCustomization(c as unknown)` if we compared them
    // directly). This mimics the shape a UI would actually save.
    const out: CustomizationConfig = {};
    if (raw.customPromptSlots !== undefined) out.customPromptSlots = raw.customPromptSlots;
    if (raw.slotOverrides !== undefined) {
      // Also strip undefined-valued sub-keys in slotOverrides values so
      // parseSlotOverride's "at least one field" check doesn't drop them
      // downstream.
      const cleaned: Record<string, SlotOverride> = {};
      for (const [k, v] of Object.entries(raw.slotOverrides)) {
        const so: SlotOverride = {};
        if (v.color !== undefined) so.color = v.color;
        if (v.fontFamily !== undefined) so.fontFamily = v.fontFamily;
        cleaned[k] = so;
      }
      out.slotOverrides = cleaned;
    }
    if (raw.positionNudges !== undefined) {
      const cleaned: Record<string, PositionNudge> = {};
      for (const [k, v] of Object.entries(raw.positionNudges)) {
        const pn: PositionNudge = {};
        if (v.dxPct !== undefined) pn.dxPct = v.dxPct;
        if (v.dyPct !== undefined) pn.dyPct = v.dyPct;
        if (v.align !== undefined) pn.align = v.align;
        cleaned[k] = pn;
      }
      out.positionNudges = cleaned;
    }
    if (raw.backgroundOverlay !== undefined) {
      const bo: NonNullable<CustomizationConfig["backgroundOverlay"]> = {};
      if (raw.backgroundOverlay.dim !== undefined) bo.dim = raw.backgroundOverlay.dim;
      if (raw.backgroundOverlay.gradient !== undefined) bo.gradient = raw.backgroundOverlay.gradient;
      if (raw.backgroundOverlay.blurRegion !== undefined)
        bo.blurRegion = raw.backgroundOverlay.blurRegion;
      out.backgroundOverlay = bo;
    }
    if (raw.watermark !== undefined) {
      const w: WatermarkConfig = {
        position: raw.watermark.position,
        opacity: raw.watermark.opacity,
        sizePct: raw.watermark.sizePct,
      };
      if (raw.watermark.uploadedLogoUrl !== undefined) {
        w.uploadedLogoUrl = raw.watermark.uploadedLogoUrl;
      }
      out.watermark = w;
    }
    if (raw.border !== undefined) {
      const b: BorderStyle = {
        color: raw.border.color,
        thicknessPx: raw.border.thicknessPx,
        cornerRadiusPx: raw.border.cornerRadiusPx,
      };
      if (raw.border.dropShadow !== undefined) b.dropShadow = raw.border.dropShadow;
      out.border = b;
    }
    if (raw.appliedBrandKitId !== undefined) out.appliedBrandKitId = raw.appliedBrandKitId;
    return out;
  });

// ─── Base-plan generator (pairs entity + template + format + theme) ────────

interface PlanBundle {
  plan: RenderPlan;
}

const arbPlanBundle: fc.Arbitrary<PlanBundle> = fc.oneof(
  fc
    .record({
      entity: arbSpeaker,
      template: fc.constantFrom(...SPEAKER_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ entity, template, format, theme }) => ({
      plan: buildSpeakerPlan(entity, template, format, theme),
    })),
  fc
    .record({
      entity: arbSponsor,
      template: fc.constantFrom(...SPONSOR_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ entity, template, format, theme }) => ({
      plan: buildSponsorPlan(entity, template, format, theme),
    })),
  fc
    .record({
      speaker: arbSpeaker,
      sponsor: arbSponsor,
      template: fc.constantFrom(...COMBO_TEMPLATES),
      format: arbFormat,
      theme: arbTheme,
    })
    .map(({ speaker, sponsor, template, format, theme }) => ({
      plan: buildComboPlan(speaker, sponsor, template, format, theme),
    })),
);

const arbCtx: fc.Arbitrary<DecorateContext> = fc.record({
  effectiveFontFamily: fc.constantFrom("Poppins", "Inter", "Roboto"),
  effectiveWatermarkLogoUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 47: Customization_Config round-trip", () => {
  it("47.1 JSON round-trip through parseCustomization is a semantic identity for valid configs", () => {
    fc.assert(
      fc.property(arbCustomizationConfig, (config) => {
        const serialized = JSON.parse(JSON.stringify(config)) as unknown;
        const parsed = parseCustomization(serialized);
        // Every field of the original config that survived generator
        // validation must appear on the parsed value with the same shape.
        // `parseCustomization` is defined to accept any `Json`-shaped
        // blob and re-emit the `CustomizationConfig`; for a config whose
        // fields are all valid by construction, the round-trip must be a
        // structural identity.
        expect(parsed).toEqual(config);
      }),
      { numRuns: 100 },
    );
  });

  it("47.1 parseCustomization is idempotent — a second round-trip reaches the same fixed point", () => {
    fc.assert(
      fc.property(arbCustomizationConfig, (config) => {
        const once = parseCustomization(JSON.parse(JSON.stringify(config)) as unknown);
        const twice = parseCustomization(JSON.parse(JSON.stringify(once)) as unknown);
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });

  it("47.1 malformed sub-fields are dropped consistently across the write/read path", () => {
    // Injecting a malformed top-level object (a `watermark` with an
    // invalid position) should be dropped by both a fresh
    // `parseCustomization` call and by a JSON round-trip.
    const malformed = {
      watermark: { position: "middle", opacity: 50, sizePct: 20 },
      border: { color: "#000", thicknessPx: 4, cornerRadiusPx: 10 },
      customPromptSlots: [
        // Missing required fields — must be dropped.
        { id: "s1", type: "headline" },
        // Well-formed — must survive.
        {
          id: "s2",
          type: "headline" as const,
          text: "hello",
          xPct: 50,
          yPct: 50,
          maxWidthPct: 60,
          maxHeightPct: 20,
          fontFamily: "Poppins",
          fontWeight: 600,
          baseSizePx: 32,
          color: "#000000",
          align: "center" as const,
        },
      ],
    };
    const direct = parseCustomization(malformed);
    const roundtripped = parseCustomization(JSON.parse(JSON.stringify(malformed)) as unknown);
    expect(direct).toEqual(roundtripped);
    // Malformed watermark dropped; border preserved; only the well-formed
    // custom prompt slot survived.
    expect(direct.watermark).toBeUndefined();
    expect(direct.border).toBeDefined();
    expect(direct.customPromptSlots).toHaveLength(1);
    expect(direct.customPromptSlots?.[0]?.id).toBe("s2");
  });

  it("47.2 render plan is deterministic — decorate(buildPlan(...), config, ctx) called twice yields structurally equal plans", () => {
    fc.assert(
      fc.property(arbPlanBundle, arbCustomizationConfig, arbCtx, ({ plan }, config, ctx) => {
        const first = decoratePlanWithCustomization(plan, config, ctx);
        const second = decoratePlanWithCustomization(plan, config, ctx);
        expect(first).toEqual(second);
      }),
      { numRuns: 100 },
    );
  });

  it("47.2 decorating with a JSON-round-tripped config produces a structurally equal plan to decorating with the original", () => {
    // The core Property 47 guarantee for the persistence pipeline: saving
    // a config to `event_creatives.customization` and reading it back
    // must not change any pixel — the decorated plan must be structurally
    // equal to the one produced from the original in-memory config.
    fc.assert(
      fc.property(arbPlanBundle, arbCustomizationConfig, arbCtx, ({ plan }, config, ctx) => {
        const original = decoratePlanWithCustomization(plan, config, ctx);
        const restored = decoratePlanWithCustomization(
          plan,
          parseCustomization(JSON.parse(JSON.stringify(config)) as unknown),
          ctx,
        );
        expect(restored).toEqual(original);
      }),
      { numRuns: 100 },
    );
  });
});
