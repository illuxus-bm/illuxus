/**
 * Creative_Customization — pure types, validators, resolution precedence,
 * and plan decorators for the customization pipeline layered on top of the
 * base Social_Creative_Generator (`creative-templates.ts` /
 * `creative-renderer.ts`) and the follow-on Creative_AI_Backgrounds spec.
 *
 * This module is strictly additive to the base spec. Every hook point
 * short-circuits when its `Customization_Config` field is absent, so
 * Property 45 (Additivity_Invariant) is a structural guarantee rather than
 * a best-effort claim.
 *
 * The module owns:
 *  - Public types for `Customization_Config` (Requirement 12.2) and every
 *    sub-config (`CustomPromptSlot`, `SlotOverride`, `PositionNudge`,
 *    `BackgroundOverlay`, `WatermarkConfig`, `BorderStyle`,
 *    `CustomCreativeTemplate`, `AppliedBrandKit`).
 *  - `isEmptyCustomization` — the predicate every hook uses to short-circuit.
 *  - Bounds-clamping helpers (`clampNudge`, `applyNudgeToBox`, `clampBorder`,
 *    `resolveWatermarkBox`) that make Property 42's four sub-invariants a
 *    defense-in-depth guarantee even when inputs are ill-behaved.
 *  - `resolveEffective` — the pure Resolution_Precedence resolver enforcing
 *    Property 44 per-field.
 *  - `decoratePlanWithCustomization` — the plan decorator that walks a
 *    base `RenderPlan`, applies per-slot overrides and nudges to text
 *    elements, appends overlay / custom-prompt / watermark / border
 *    elements at their fixed z-order positions (Property 43), and returns
 *    a new `ExtendedRenderPlan` without mutating the input.
 *  - `parseCustomization` — a defensive validator for JSON blobs read from
 *    `event_creatives.customization`, dropping malformed fields and logging
 *    via `@/lib/observability`.
 *
 * The five new `PlanElement` variants (`overlay-dim`, `overlay-gradient`,
 * `overlay-blur-region`, `watermark`, `border`) live on the base
 * `PlanElement` union in `creative-renderer.ts` since Task 5 landed.
 * `ExtendedPlanElement` / `ExtendedRenderPlan` remain here as
 * `@deprecated` type re-exports (aliases for `PlanElement` / `RenderPlan`)
 * so any caller written before the unification still compiles.
 *
 * PURE MODULE: no DOM, no canvas, no Supabase. Uses `logger` from
 * `@/lib/observability` for the single `parseCustomization` warn path.
 * Never mutates its inputs — every helper returns a new object.
 */

import { logger } from "@/lib/observability";

import type {
  CreativeTemplate,
  EventTheme,
  PlatformFormat,
  ResolvedBox,
  TextSlot,
} from "./creative-templates";
import type { PlanElement, RenderPlan } from "./creative-renderer";

// ─── Public types (Requirement 12) ──────────────────────────────────────────

/**
 * Union of every keyable slot in a render plan: built-in text slots + built-in
 * image slot roles + Custom_Prompt_Slots (identified by their `id`). The
 * `custom:${string}` branch lets `slotOverrides` and `positionNudges` target
 * an organizer-authored Custom_Prompt_Slot by its stable id without
 * ambiguity vs. a built-in slot key.
 */
export type SlotKey =
  | TextSlot["key"]
  | "photo"
  | "logo"
  | "speakerPhoto"
  | "sponsorLogo"
  | "wordmark"
  | "datePill"
  | "ctaButton"
  | `custom:${string}`;

/** One of the five `type` labels a Custom_Prompt_Slot can carry (Requirement 1.2). */
export type CustomPromptSlotType =
  | "headline"
  | "tagline"
  | "eventDate"
  | "quote"
  | "custom";

/**
 * Horizontal text alignment. Matches `TextSlot["align"]` on purpose so a
 * Custom_Prompt_Slot's align value substitutes cleanly into the base plan's
 * text `PlanElement` shape.
 */
export type TextAlign = "left" | "center" | "right";

/**
 * An organizer-authored text overlay added on top of the template's built-in
 * text slots (Requirement 1). All positioning is percent-of-format so a
 * saved slot renders consistently across every `PlatformFormat`
 * (Requirement 9, resolution-independent).
 */
export interface CustomPromptSlot {
  /** Stable id — used for drag-reorder keys and Slot_Override targeting. */
  id: string;
  type: CustomPromptSlotType;
  text: string;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number;
  /** Must be in `FONT_OPTIONS` (Requirement 4.1). */
  fontFamily: string;
  /** Typical values: 400, 500, 600, 700. */
  fontWeight: number;
  baseSizePx: number;
  /** Any valid CSS color string. */
  color: string;
  align: TextAlign;
}

/** Per-slot color / font override (Requirement 2). Both fields optional. */
export interface SlotOverride {
  color?: string;
  fontFamily?: string;
}

/**
 * Per-slot position nudge (Requirement 3). `dxPct` / `dyPct` are clamped to
 * `[-NUDGE_MAX_PCT, NUDGE_MAX_PCT]` at apply time (Property 42.1). `align`
 * is passed through unchanged.
 */
export interface PositionNudge {
  dxPct?: number;
  dyPct?: number;
  align?: TextAlign;
}

/** Full-canvas dim rectangle overlay (Requirement 5.2). */
export interface OverlayDim {
  color: string;
  /** 0..100. */
  opacity: number;
}

/**
 * Linear-gradient overlay (Requirement 5.3). `direction` is in degrees
 * measured clockwise from north (matching the base spec's
 * `CreativeBgStyle`/`drawBackground` convention).
 */
export interface OverlayGradient {
  from: string;
  to: string;
  /** 0..360, degrees clockwise from north. */
  direction: number;
  /** 0..100. */
  opacity: number;
}

/**
 * Rectangular blur-behind-text region (Requirement 5.4). `boxPct` is
 * `[xPct, yPct, wPct, hPct]` measured against the current
 * `PlatformFormat`'s pixel dimensions.
 */
export interface OverlayBlurRegion {
  boxPct: [number, number, number, number];
  blurRadiusPx: number;
}

/** Background_Overlay sub-parts (Requirement 5). Each optional. */
export interface BackgroundOverlay {
  dim?: OverlayDim;
  gradient?: OverlayGradient;
  blurRegion?: OverlayBlurRegion;
}

/** Watermark configuration (Requirement 6). */
export interface WatermarkConfig {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** 0..100. */
  opacity: number;
  /** Percentage of the target format's short side. */
  sizePct: number;
  /** Creative-specific watermark logo override (Requirement 6.4). */
  uploadedLogoUrl?: string;
}

/** Drop shadow for a Border_Style (Requirement 7.2). */
export interface BorderDropShadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

/** Outer-border configuration (Requirement 7). */
export interface BorderStyle {
  color: string;
  /** Clamped to `[0, BORDER_THICKNESS_MAX_PX]` (Property 42.4). */
  thicknessPx: number;
  /** Clamped to `[0, min(w, h) / 2]` (Property 42.4). */
  cornerRadiusPx: number;
  dropShadow?: BorderDropShadow;
}

/**
 * Organizer-authored `CreativeTemplate` — a preset fork stored on
 * `page_config.customCreativeTemplates`, or embedded in a Creative's
 * `Customization_Config.snapshotTemplate` for round-trip fidelity even
 * after the source Custom_Template is deleted (Requirement 8.10, 12.4).
 */
export interface CustomCreativeTemplate extends CreativeTemplate {
  /** Fresh id assigned on first save. */
  id: string;
  /** Display name shown in the template picker. */
  name: string;
  /** Preset id the fork was derived from, or `null` when forked from another Custom_Template. */
  basedOn: string | null;
}

/**
 * The persistence shape stored on `event_creatives.customization` (Requirement
 * 12.2). Every field optional so `{}` is a valid empty configuration and
 * stores as JSONB `'{}'`.
 */
export interface CustomizationConfig {
  customPromptSlots?: CustomPromptSlot[];
  slotOverrides?: Partial<Record<SlotKey, SlotOverride>>;
  positionNudges?: Partial<Record<SlotKey, PositionNudge>>;
  backgroundOverlay?: BackgroundOverlay;
  watermark?: WatermarkConfig;
  border?: BorderStyle;
  /** The Brand_Kit id that was applied at render time (Requirement 9). */
  appliedBrandKitId?: string;
  /** Embedded Custom_Template snapshot (Requirement 8.10, 12.4). */
  snapshotTemplate?: CustomCreativeTemplate;
}

/** The applied Brand_Kit's runtime shape (Requirement 9). */
export interface AppliedBrandKit {
  id: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  preferredTemplateIds?: string[];
  preferredFormats?: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Shared with base spec's `fitText` — matches `creative-renderer.ts`'s internal floor. Property 42.2 (Font_Size_Floor). */
export const MIN_FONT_SIZE_PX = 10;

/** Position_Nudge magnitude cap on each axis (Property 42.1, Nudge_Bounds). */
export const NUDGE_MAX_PCT = 20;

/** Border thickness upper bound in pixels (Property 42.4, Border_Bounded). */
export const BORDER_THICKNESS_MAX_PX = 40;

// ─── Extended PlanElement / RenderPlan aliases ─────────────────────────────
//
// The five new `PlanElement` variants (`overlay-dim`, `overlay-gradient`,
// `overlay-blur-region`, `watermark`, `border`) now live on the base
// `PlanElement` union in `creative-renderer.ts` (Task 5.1). These aliases
// are kept as re-exports so callers importing `ExtendedPlanElement` /
// `ExtendedRenderPlan` from this module continue to compile — every
// alias resolves to the base spec's type. Prefer importing `PlanElement`
// / `RenderPlan` directly from `./creative-renderer` in new code.

/** @deprecated Use `PlanElement` from `./creative-renderer`. Kept as a
 *  type re-export for callers written before Task 5 unified the union. */
export type ExtendedPlanElement = PlanElement;

/** @deprecated Use `RenderPlan` from `./creative-renderer`. Kept as a
 *  type re-export for callers written before Task 5 unified the union. */
export type ExtendedRenderPlan = RenderPlan;

// ─── Purity guard: an empty config produces no additional elements ──────────

/**
 * Returns `true` iff `c` would produce no additional or overriding
 * `PlanElement`s if passed through `decoratePlanWithCustomization`. Used by
 * every hook point to short-circuit, structurally guaranteeing Property 45
 * (Additivity_Invariant).
 *
 * NOTE: `appliedBrandKitId` and `snapshotTemplate` are deliberately NOT
 * considered here — those fields are resolved BEFORE the decorator runs
 * (they alter the effective template / theme via `resolveEffective`, not
 * the decorator's output), so a config containing only those fields is
 * still "empty" from the decorator's point of view.
 *
 * Pure.
 */
export function isEmptyCustomization(c: CustomizationConfig | undefined | null): boolean {
  if (!c) return true;
  if (c.customPromptSlots && c.customPromptSlots.length > 0) return false;
  if (c.slotOverrides && Object.keys(c.slotOverrides).length > 0) return false;
  if (c.positionNudges && Object.keys(c.positionNudges).length > 0) return false;
  const overlay = c.backgroundOverlay;
  if (overlay && (overlay.dim || overlay.gradient || overlay.blurRegion)) return false;
  if (c.watermark) return false;
  if (c.border) return false;
  return true;
}

// ─── Bounds clamping (Property 42) ──────────────────────────────────────────

/**
 * Clamps a Position_Nudge's `dxPct` / `dyPct` to `[-NUDGE_MAX_PCT,
 * NUDGE_MAX_PCT]` (Property 42.1). `align` passes through unchanged.
 * `undefined` values on the input stay `undefined` — the caller uses the
 * un-nudged coordinate in that case.
 *
 * Pure.
 */
export function clampNudge(nudge: PositionNudge): PositionNudge {
  return {
    dxPct:
      nudge.dxPct === undefined
        ? undefined
        : Math.max(-NUDGE_MAX_PCT, Math.min(NUDGE_MAX_PCT, nudge.dxPct)),
    dyPct:
      nudge.dyPct === undefined
        ? undefined
        : Math.max(-NUDGE_MAX_PCT, Math.min(NUDGE_MAX_PCT, nudge.dyPct)),
    align: nudge.align,
  };
}

/**
 * Offsets a `ResolvedBox` by a Position_Nudge, applying the clamp from
 * `clampNudge` first and re-clamping to the format's safe area afterwards
 * so the result satisfies `x >= 0`, `y >= 0`, `x + width <= format.width`,
 * `y + height <= format.height` for every real `dxPct` / `dyPct`
 * (Property 42.1). Boxes larger than the target format are pre-shrunk to
 * the format's dimensions so the safe-area clamp is always satisfiable.
 *
 * Pure.
 */
export function applyNudgeToBox(
  box: ResolvedBox,
  nudge: PositionNudge,
  format: PlatformFormat
): ResolvedBox {
  const clamped = clampNudge(nudge);
  const dx = ((clamped.dxPct ?? 0) / 100) * format.width;
  const dy = ((clamped.dyPct ?? 0) / 100) * format.height;

  let width = box.width;
  let height = box.height;
  if (width > format.width) width = format.width;
  if (height > format.height) height = format.height;

  let x = box.x + dx;
  let y = box.y + dy;

  x = Math.max(0, Math.min(x, format.width - width));
  y = Math.max(0, Math.min(y, format.height - height));

  return { x, y, width, height };
}

/**
 * Clamps a Border_Style's `thicknessPx` to `[0, BORDER_THICKNESS_MAX_PX]`
 * and its `cornerRadiusPx` to `[0, min(format.width, format.height) / 2]`
 * (Property 42.4). Every other field passes through unchanged.
 *
 * Pure.
 */
export function clampBorder(border: BorderStyle, format: PlatformFormat): BorderStyle {
  const maxRadius = Math.min(format.width, format.height) / 2;
  return {
    ...border,
    thicknessPx: Math.max(0, Math.min(BORDER_THICKNESS_MAX_PX, border.thicknessPx)),
    cornerRadiusPx: Math.max(0, Math.min(maxRadius, border.cornerRadiusPx)),
  };
}

/**
 * Resolves a `WatermarkConfig` to a square `ResolvedBox` in the requested
 * corner. Uses a 5%-of-short-side margin from every edge, and clamps the
 * result unconditionally to `[0, w] × [0, h]` so Property 42.3
 * (Watermark_Bounded) holds even at `sizePct = 100` where the raw
 * arithmetic can push the anchor past an edge.
 *
 * Pure.
 */
export function resolveWatermarkBox(
  wm: WatermarkConfig,
  format: PlatformFormat
): ResolvedBox {
  const shortSide = Math.min(format.width, format.height);
  const sizePctClamped = Math.max(0, Math.min(100, wm.sizePct));
  const size = (sizePctClamped / 100) * shortSide;
  const margin = shortSide * 0.05;

  let x = 0;
  let y = 0;
  switch (wm.position) {
    case "top-left":
      x = margin;
      y = margin;
      break;
    case "top-right":
      x = format.width - size - margin;
      y = margin;
      break;
    case "bottom-left":
      x = margin;
      y = format.height - size - margin;
      break;
    case "bottom-right":
      x = format.width - size - margin;
      y = format.height - size - margin;
      break;
  }

  // Defense-in-depth clamp: at 100% size the margin subtraction can push
  // x/y negative, and on non-square formats the short-side sizing means
  // the raw x/y on the long axis is fine but on the short axis it may
  // still overflow slightly. Clamping unconditionally guarantees the
  // Property 42.3 invariant.
  x = Math.max(0, Math.min(x, format.width - size));
  y = Math.max(0, Math.min(y, format.height - size));

  return { x, y, width: size, height: size };
}

// ─── Effective-value resolution (Property 44) ───────────────────────────────

/** Inputs to `resolveEffective`. */
export interface ResolveEffectiveArgs {
  baseTemplate: CreativeTemplate;
  baseTheme: EventTheme;
  config: CustomizationConfig;
  brandKit?: AppliedBrandKit;
  /** Entity template override looked up via
   *  `readEffectiveTemplateId(config, entity.id, creativeType)` in the
   *  caller. Not looked up here because that function lives in Task 4's
   *  extension of `creative-templates.ts`. */
  entityOverrideTemplate?: CreativeTemplate;
  /** The organization row's `logo_url` (Requirement 6.2). */
  orgLogoUrl?: string;
}

/** Result of `resolveEffective`. */
export interface ResolveEffectiveResult {
  template: CreativeTemplate;
  theme: EventTheme;
  /** Fallback for slots without a per-slot font override — Brand_Kit
   *  `fontFamily` if set, else `"Poppins"` (the base spec's default). */
  effectiveFontFamily: string;
  /** Watermark logo URL resolved through Requirement 6.2's precedence,
   *  or `undefined` when no source provides one (Requirement 6.3 — the
   *  decorator omits the watermark element entirely in that case). */
  effectiveWatermarkLogoUrl?: string;
}

/**
 * Resolves the effective `(template, theme, fontFamily, watermarkLogoUrl)`
 * tuple at render time per Property 44's Resolution_Precedence:
 *
 * - **Template**: `config.snapshotTemplate` > `entityOverrideTemplate` >
 *   `baseTemplate`. `snapshotTemplate` wins because Requirement 8.10
 *   requires a Creative rendered from a Custom_Template snapshot to render
 *   identically even after the source Custom_Template is deleted.
 * - **Theme**: `baseTheme` values win per field; `brandKit`'s corresponding
 *   fields fill any `undefined` slot. The base spec's per-slot
 *   `resolveAccentColor` and `resolveBackground` continue to apply
 *   downstream, so this function only fills in the theme's undefined
 *   fields from the Brand_Kit.
 * - **Effective font family**: Brand_Kit's `fontFamily` when defined, else
 *   `"Poppins"` — used by downstream decoration as a fallback for slots
 *   without a per-slot Slot_Override.fontFamily.
 * - **Watermark logo URL**: `config.watermark.uploadedLogoUrl` >
 *   `orgLogoUrl` > `undefined` (Requirement 6.2).
 *
 * Pure — never touches Supabase; every value comes from the args.
 */
export function resolveEffective(args: ResolveEffectiveArgs): ResolveEffectiveResult {
  const { baseTemplate, baseTheme, config, brandKit, entityOverrideTemplate, orgLogoUrl } = args;

  const template: CreativeTemplate = config.snapshotTemplate ?? entityOverrideTemplate ?? baseTemplate;

  const theme: EventTheme = {
    primaryColor: baseTheme.primaryColor ?? brandKit?.primaryColor,
    accentColor: baseTheme.accentColor ?? brandKit?.accentColor,
    orgLogoUrl: baseTheme.orgLogoUrl ?? brandKit?.logoUrl,
  };

  const effectiveFontFamily = brandKit?.fontFamily ?? "Poppins";

  const effectiveWatermarkLogoUrl =
    config.watermark?.uploadedLogoUrl ?? orgLogoUrl ?? undefined;

  return { template, theme, effectiveFontFamily, effectiveWatermarkLogoUrl };
}

// ─── Custom_Prompt_Slot → PlanElement ───────────────────────────────────────

/**
 * Resolves a Custom_Prompt_Slot's percentage-based geometry to a
 * `ResolvedBox` in the target `PlatformFormat`'s pixel dimensions.
 * Uses the same center-anchored convention as the base spec's
 * `reflowTemplate`, and applies the same safe-area clamp so the resulting
 * box stays within `[0, w] × [0, h]`.
 *
 * Pure.
 */
function resolveCustomPromptBox(slot: CustomPromptSlot, format: PlatformFormat): ResolvedBox {
  let width = (slot.maxWidthPct / 100) * format.width;
  let height = (slot.maxHeightPct / 100) * format.height;
  if (width > format.width) width = format.width;
  if (height > format.height) height = format.height;

  let x = (slot.xPct / 100) * format.width - width / 2;
  let y = (slot.yPct / 100) * format.height - height / 2;

  x = Math.max(0, Math.min(x, format.width - width));
  y = Math.max(0, Math.min(y, format.height - height));

  return { x, y, width, height };
}

/**
 * Converts a Custom_Prompt_Slot + optional per-slot nudge + override to a
 * text `PlanElement` compatible with the base spec's `drawTextElement`.
 *
 * The `key` field on the emitted element is `"name"` as a stable label
 * because Custom_Prompt_Slots don't map onto a specific base-spec slot; the
 * `PlanElement.text.key` field is used only for logging/debugging so
 * choosing a stable label here is safe.
 *
 * `baseSizePx` is clamped upward to `MIN_FONT_SIZE_PX` so a text
 * `PlanElement` is never emitted below the Font_Size_Floor
 * (Property 42.2).
 *
 * Pure.
 */
function customPromptToTextElement(
  slot: CustomPromptSlot,
  format: PlatformFormat,
  nudge: PositionNudge | undefined,
  override: SlotOverride | undefined
): Extract<PlanElement, { kind: "text" }> {
  const baseBox = resolveCustomPromptBox(slot, format);
  const box = nudge ? applyNudgeToBox(baseBox, nudge, format) : baseBox;
  return {
    kind: "text",
    key: "name",
    text: slot.text,
    box,
    fontFamily: override?.fontFamily ?? slot.fontFamily,
    fontWeight: slot.fontWeight,
    baseSizePx: Math.max(MIN_FONT_SIZE_PX, slot.baseSizePx),
    color: override?.color ?? slot.color,
    align: nudge?.align ?? slot.align,
  };
}

// ─── Base-plan text-element decoration ─────────────────────────────────────

/**
 * Applies per-slot overrides + nudges to a base-plan text `PlanElement`.
 * When neither an override nor a nudge is set for the slot's key, returns
 * the input element unchanged (structurally — same box + same field values,
 * so Property 45's deep-equal check holds).
 *
 * Pure — returns a new object; never mutates the input.
 */
function applyOverridesToTextElement(
  el: Extract<PlanElement, { kind: "text" }>,
  overrides: Partial<Record<SlotKey, SlotOverride>> | undefined,
  nudges: Partial<Record<SlotKey, PositionNudge>> | undefined,
  format: PlatformFormat
): Extract<PlanElement, { kind: "text" }> {
  const override = overrides?.[el.key];
  const nudge = nudges?.[el.key];
  if (!override && !nudge) return el;

  const box = nudge ? applyNudgeToBox(el.box, nudge, format) : el.box;
  const baseSizePx = Math.max(MIN_FONT_SIZE_PX, el.baseSizePx);
  return {
    ...el,
    box,
    fontFamily: override?.fontFamily ?? el.fontFamily,
    color: override?.color ?? el.color,
    align: nudge?.align ?? el.align,
    baseSizePx,
  };
}

// ─── Overlay-element construction ───────────────────────────────────────────

/**
 * Converts a `BackgroundOverlay` config to zero or more overlay
 * `PlanElement`s in the canonical order (dim, gradient, blurRegion) that
 * Property 43 requires. Returns `[]` when no sub-part is configured.
 *
 * Pure.
 */
function buildOverlayElements(
  overlay: BackgroundOverlay,
  format: PlatformFormat
): ExtendedPlanElement[] {
  const out: ExtendedPlanElement[] = [];

  if (overlay.dim) {
    out.push({
      kind: "overlay-dim",
      color: overlay.dim.color,
      opacity: Math.max(0, Math.min(100, overlay.dim.opacity)) / 100,
    });
  }

  if (overlay.gradient) {
    const g = overlay.gradient;
    out.push({
      kind: "overlay-gradient",
      from: g.from,
      to: g.to,
      // Convert degrees-clockwise-from-north to radians, matching the
      // base spec's `drawBackground` gradient convention.
      direction: ((g.direction - 90) * Math.PI) / 180,
      opacity: Math.max(0, Math.min(100, g.opacity)) / 100,
    });
  }

  if (overlay.blurRegion) {
    const [xPct, yPct, wPct, hPct] = overlay.blurRegion.boxPct;
    let width = (wPct / 100) * format.width;
    let height = (hPct / 100) * format.height;
    if (width < 0) width = 0;
    if (height < 0) height = 0;
    if (width > format.width) width = format.width;
    if (height > format.height) height = format.height;

    let x = (xPct / 100) * format.width;
    let y = (yPct / 100) * format.height;
    x = Math.max(0, Math.min(x, format.width - width));
    y = Math.max(0, Math.min(y, format.height - height));

    out.push({
      kind: "overlay-blur-region",
      box: { x, y, width, height },
      blurRadiusPx: Math.max(0, overlay.blurRegion.blurRadiusPx),
    });
  }

  return out;
}

// ─── Plan decoration (Properties 41, 43, 45) ────────────────────────────────

/** Extra context resolved via `resolveEffective` and threaded into decoration. */
export interface DecorateContext {
  /** From `resolveEffective` — used to gate emission of a watermark element. */
  effectiveWatermarkLogoUrl?: string;
  /** From `resolveEffective` — currently informational; the decorator does
   *  not use it to override base text-element fonts because doing so would
   *  break Property 45 when `config = {}` (the isEmptyCustomization
   *  short-circuit already returns the plan by reference in that case,
   *  and a non-empty config that leaves a slot's font undecorated should
   *  still fall back to the template's built-in). Downstream consumers
   *  are free to use this value. */
  effectiveFontFamily: string;
}

/**
 * Decorates a base `RenderPlan` with a `Customization_Config`, returning a
 * new `ExtendedRenderPlan`. Never mutates the input plan.
 *
 * Element ordering after decoration (Property 43):
 *
 *   1. background            (from the base plan)
 *   2. shapes (base)         (Event_Promo decorative cards/dividers)
 *   3. overlay-dim           (if configured)
 *   4. overlay-gradient      (if configured)
 *   5. overlay-blur-region   (if configured)
 *   6. images (base)         (photo / logo / speakerPhoto / sponsorLogo)
 *   7. texts (base)          (name / title / company / tierBadge / ...
 *                             with slotOverrides + positionNudges applied)
 *   8. custom-prompt texts   (in author order — Property 41)
 *   9. divider (base)        (if the template defines one)
 *  10. pills (base)          (Event_Promo date chip / CTA button)
 *  11. watermark             (if a resolved watermark URL exists)
 *  12. border                (last — Property 42.4)
 *
 * When `config` is empty per `isEmptyCustomization`, returns the input
 * plan reference unchanged. This is the structural anchor for Property 45
 * (Additivity_Invariant) — the same reference test passes and no
 * decoration overhead is paid on the base-spec-only render path.
 *
 * Pure.
 */
export function decoratePlanWithCustomization(
  plan: RenderPlan,
  config: CustomizationConfig,
  ctx: DecorateContext
): ExtendedRenderPlan {
  if (isEmptyCustomization(config)) {
    return plan;
  }

  const format = plan.format;

  const backgrounds: PlanElement[] = [];
  const shapes: PlanElement[] = [];
  const images: PlanElement[] = [];
  const texts: Extract<PlanElement, { kind: "text" }>[] = [];
  const dividers: PlanElement[] = [];
  const pills: PlanElement[] = [];

  for (const el of plan.elements) {
    switch (el.kind) {
      case "background":
        backgrounds.push(el);
        break;
      case "shape":
        shapes.push(el);
        break;
      case "image":
        images.push(el);
        break;
      case "text":
        texts.push(el);
        break;
      case "divider":
        dividers.push(el);
        break;
      case "pill":
        pills.push(el);
        break;
    }
  }

  const decoratedTexts = texts.map((el) =>
    applyOverridesToTextElement(el, config.slotOverrides, config.positionNudges, format)
  );

  const customPromptTexts: Extract<PlanElement, { kind: "text" }>[] = (
    config.customPromptSlots ?? []
  ).map((slot) => {
    const key: SlotKey = `custom:${slot.id}` as const;
    return customPromptToTextElement(
      slot,
      format,
      config.positionNudges?.[key],
      config.slotOverrides?.[key]
    );
  });

  const overlayElements = config.backgroundOverlay
    ? buildOverlayElements(config.backgroundOverlay, format)
    : [];

  const watermarkElements: ExtendedPlanElement[] = [];
  if (config.watermark && ctx.effectiveWatermarkLogoUrl) {
    watermarkElements.push({
      kind: "watermark",
      url: ctx.effectiveWatermarkLogoUrl,
      box: resolveWatermarkBox(config.watermark, format),
      opacity: Math.max(0, Math.min(100, config.watermark.opacity)) / 100,
    });
  }

  const borderElements: ExtendedPlanElement[] = [];
  if (config.border) {
    const clamped = clampBorder(config.border, format);
    borderElements.push({
      kind: "border",
      color: clamped.color,
      thicknessPx: clamped.thicknessPx,
      cornerRadiusPx: clamped.cornerRadiusPx,
      dropShadow: clamped.dropShadow,
    });
  }

  const elements: ExtendedPlanElement[] = [
    ...backgrounds,
    ...shapes,
    ...overlayElements,
    ...images,
    ...decoratedTexts,
    ...customPromptTexts,
    ...dividers,
    ...pills,
    ...watermarkElements,
    ...borderElements,
  ];

  return { format, elements };
}

// ─── Defensive JSON parsing (Requirement 12.3, 14.3) ────────────────────────

/** Type guard for `Record<string, unknown>`. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Type guard for finite numbers (rejects `NaN` and `±Infinity`). */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Type guard for a valid `TextAlign`. */
function isTextAlign(v: unknown): v is TextAlign {
  return v === "left" || v === "center" || v === "right";
}

const CUSTOM_PROMPT_SLOT_TYPES: readonly CustomPromptSlotType[] = [
  "headline",
  "tagline",
  "eventDate",
  "quote",
  "custom",
] as const;

const WATERMARK_POSITIONS: readonly WatermarkConfig["position"][] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

function parseCustomPromptSlot(v: unknown): CustomPromptSlot | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.id !== "string") return null;
  if (typeof v.type !== "string" || !CUSTOM_PROMPT_SLOT_TYPES.includes(v.type as CustomPromptSlotType)) return null;
  if (typeof v.text !== "string") return null;
  if (!isFiniteNumber(v.xPct) || !isFiniteNumber(v.yPct)) return null;
  if (!isFiniteNumber(v.maxWidthPct) || !isFiniteNumber(v.maxHeightPct)) return null;
  if (typeof v.fontFamily !== "string") return null;
  if (!isFiniteNumber(v.fontWeight)) return null;
  if (!isFiniteNumber(v.baseSizePx)) return null;
  if (typeof v.color !== "string") return null;
  if (!isTextAlign(v.align)) return null;
  return {
    id: v.id,
    type: v.type as CustomPromptSlotType,
    text: v.text,
    xPct: v.xPct,
    yPct: v.yPct,
    maxWidthPct: v.maxWidthPct,
    maxHeightPct: v.maxHeightPct,
    fontFamily: v.fontFamily,
    fontWeight: v.fontWeight,
    baseSizePx: v.baseSizePx,
    color: v.color,
    align: v.align,
  };
}

function parseSlotOverride(v: unknown): SlotOverride | null {
  if (!isPlainObject(v)) return null;
  const out: SlotOverride = {};
  if (typeof v.color === "string") out.color = v.color;
  if (typeof v.fontFamily === "string") out.fontFamily = v.fontFamily;
  if (out.color === undefined && out.fontFamily === undefined) return null;
  return out;
}

function parsePositionNudge(v: unknown): PositionNudge | null {
  if (!isPlainObject(v)) return null;
  const out: PositionNudge = {};
  if (isFiniteNumber(v.dxPct)) out.dxPct = v.dxPct;
  if (isFiniteNumber(v.dyPct)) out.dyPct = v.dyPct;
  if (isTextAlign(v.align)) out.align = v.align;
  if (out.dxPct === undefined && out.dyPct === undefined && out.align === undefined) return null;
  return out;
}

function parseBackgroundOverlay(v: unknown): BackgroundOverlay | undefined {
  if (!isPlainObject(v)) {
    if (v !== undefined) {
      logger.warn("customization parse: backgroundOverlay is not an object, dropping", {
        type: typeof v,
      });
    }
    return undefined;
  }
  const out: BackgroundOverlay = {};

  if (isPlainObject(v.dim)) {
    if (typeof v.dim.color === "string" && isFiniteNumber(v.dim.opacity)) {
      out.dim = { color: v.dim.color, opacity: v.dim.opacity };
    } else {
      logger.warn("customization parse: overlay.dim malformed, dropping");
    }
  }

  if (isPlainObject(v.gradient)) {
    const g = v.gradient;
    if (
      typeof g.from === "string" &&
      typeof g.to === "string" &&
      isFiniteNumber(g.direction) &&
      isFiniteNumber(g.opacity)
    ) {
      out.gradient = { from: g.from, to: g.to, direction: g.direction, opacity: g.opacity };
    } else {
      logger.warn("customization parse: overlay.gradient malformed, dropping");
    }
  }

  if (isPlainObject(v.blurRegion)) {
    const b = v.blurRegion;
    if (
      Array.isArray(b.boxPct) &&
      b.boxPct.length === 4 &&
      b.boxPct.every(isFiniteNumber) &&
      isFiniteNumber(b.blurRadiusPx)
    ) {
      out.blurRegion = {
        boxPct: [b.boxPct[0], b.boxPct[1], b.boxPct[2], b.boxPct[3]],
        blurRadiusPx: b.blurRadiusPx,
      };
    } else {
      logger.warn("customization parse: overlay.blurRegion malformed, dropping");
    }
  }

  if (out.dim === undefined && out.gradient === undefined && out.blurRegion === undefined) {
    return undefined;
  }
  return out;
}

function parseWatermarkConfig(v: unknown): WatermarkConfig | undefined {
  if (!isPlainObject(v)) {
    if (v !== undefined) {
      logger.warn("customization parse: watermark is not an object, dropping", { type: typeof v });
    }
    return undefined;
  }
  if (typeof v.position !== "string" || !WATERMARK_POSITIONS.includes(v.position as WatermarkConfig["position"])) {
    logger.warn("customization parse: watermark.position invalid, dropping");
    return undefined;
  }
  if (!isFiniteNumber(v.opacity) || !isFiniteNumber(v.sizePct)) {
    logger.warn("customization parse: watermark opacity/sizePct malformed, dropping");
    return undefined;
  }
  const out: WatermarkConfig = {
    position: v.position as WatermarkConfig["position"],
    opacity: v.opacity,
    sizePct: v.sizePct,
  };
  if (typeof v.uploadedLogoUrl === "string") out.uploadedLogoUrl = v.uploadedLogoUrl;
  return out;
}

function parseBorderStyle(v: unknown): BorderStyle | undefined {
  if (!isPlainObject(v)) {
    if (v !== undefined) {
      logger.warn("customization parse: border is not an object, dropping", { type: typeof v });
    }
    return undefined;
  }
  if (typeof v.color !== "string" || !isFiniteNumber(v.thicknessPx) || !isFiniteNumber(v.cornerRadiusPx)) {
    logger.warn("customization parse: border color/thickness/radius malformed, dropping");
    return undefined;
  }
  const out: BorderStyle = {
    color: v.color,
    thicknessPx: v.thicknessPx,
    cornerRadiusPx: v.cornerRadiusPx,
  };
  if (isPlainObject(v.dropShadow)) {
    const ds = v.dropShadow;
    if (
      typeof ds.color === "string" &&
      isFiniteNumber(ds.offsetX) &&
      isFiniteNumber(ds.offsetY) &&
      isFiniteNumber(ds.blur)
    ) {
      out.dropShadow = { color: ds.color, offsetX: ds.offsetX, offsetY: ds.offsetY, blur: ds.blur };
    } else {
      logger.warn("customization parse: border.dropShadow malformed, dropping");
    }
  }
  return out;
}

/**
 * Defensive validator: accepts an untyped `Json`-shaped blob (as returned
 * from Supabase's `event_creatives.customization` column) and returns a
 * clean `CustomizationConfig` with malformed sub-fields dropped and logged
 * via `logger.warn`. Unknown top-level fields are ignored (forward
 * compatibility — a newer client writing extra fields must not crash an
 * older client reading them back). Returns `{}` on non-object input.
 *
 * Pure.
 */
export function parseCustomization(input: unknown): CustomizationConfig {
  if (!isPlainObject(input)) {
    if (input !== undefined && input !== null) {
      logger.warn("customization parse: top-level value is not an object, defaulting to empty", {
        type: typeof input,
      });
    }
    return {};
  }

  const out: CustomizationConfig = {};

  if (Array.isArray(input.customPromptSlots)) {
    const parsed: CustomPromptSlot[] = [];
    for (const raw of input.customPromptSlots) {
      const slot = parseCustomPromptSlot(raw);
      if (slot) {
        parsed.push(slot);
      } else {
        logger.warn("customization parse: customPromptSlots entry malformed, dropping");
      }
    }
    if (parsed.length > 0) out.customPromptSlots = parsed;
  } else if (input.customPromptSlots !== undefined) {
    logger.warn("customization parse: customPromptSlots is not an array, dropping");
  }

  if (isPlainObject(input.slotOverrides)) {
    const overrides: Partial<Record<SlotKey, SlotOverride>> = {};
    for (const [key, val] of Object.entries(input.slotOverrides)) {
      const parsed = parseSlotOverride(val);
      if (parsed) {
        overrides[key as SlotKey] = parsed;
      } else {
        logger.warn("customization parse: slotOverrides entry malformed, dropping", { key });
      }
    }
    if (Object.keys(overrides).length > 0) out.slotOverrides = overrides;
  } else if (input.slotOverrides !== undefined) {
    logger.warn("customization parse: slotOverrides is not an object, dropping");
  }

  if (isPlainObject(input.positionNudges)) {
    const nudges: Partial<Record<SlotKey, PositionNudge>> = {};
    for (const [key, val] of Object.entries(input.positionNudges)) {
      const parsed = parsePositionNudge(val);
      if (parsed) {
        nudges[key as SlotKey] = parsed;
      } else {
        logger.warn("customization parse: positionNudges entry malformed, dropping", { key });
      }
    }
    if (Object.keys(nudges).length > 0) out.positionNudges = nudges;
  } else if (input.positionNudges !== undefined) {
    logger.warn("customization parse: positionNudges is not an object, dropping");
  }

  const overlay = parseBackgroundOverlay(input.backgroundOverlay);
  if (overlay) out.backgroundOverlay = overlay;

  const watermark = parseWatermarkConfig(input.watermark);
  if (watermark) out.watermark = watermark;

  const border = parseBorderStyle(input.border);
  if (border) out.border = border;

  if (typeof input.appliedBrandKitId === "string") {
    out.appliedBrandKitId = input.appliedBrandKitId;
  } else if (input.appliedBrandKitId !== undefined) {
    logger.warn("customization parse: appliedBrandKitId is not a string, dropping");
  }

  if (isPlainObject(input.snapshotTemplate)) {
    const st = input.snapshotTemplate;
    // Structural check for the CustomCreativeTemplate discriminators only —
    // the wider `CreativeTemplate` shape is not deeply validated here
    // because it originates from this same client at save time (the source
    // is trusted). Deep validation would duplicate the CreativeTemplate
    // schema and add drift risk.
    if (
      typeof st.id === "string" &&
      typeof st.name === "string" &&
      (st.basedOn === null || typeof st.basedOn === "string")
    ) {
      out.snapshotTemplate = st as unknown as CustomCreativeTemplate;
    } else {
      logger.warn("customization parse: snapshotTemplate missing id/name/basedOn, dropping");
    }
  } else if (input.snapshotTemplate !== undefined) {
    logger.warn("customization parse: snapshotTemplate is not an object, dropping");
  }

  return out;
}
