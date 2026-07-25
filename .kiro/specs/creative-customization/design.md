# Design Document: Creative Customization

## Overview

The **Creative_Customization** feature is a strictly additive layer on top of
the shipped **Social_Creative_Generator**
(`.kiro/specs/social-creative-generator/`) and the follow-on
**Creative_AI_Backgrounds** (`.kiro/specs/creative-ai-backgrounds/`). It ports
the fine-grained controls already proven by the landing-page designer
(`src/components/event/page-form/EventPageForm.tsx`) into the
Creative_Generator, layering ten new organizer-facing capabilities without
changing a single existing signature in `creative-templates.ts` /
`creative-renderer.ts` / `creative-storage.ts`.

Nothing in this feature removes, renames, or changes the arity of any base-spec
export. Every new capability is opt-in and reaches the render pipeline through:

- A new **`Customization_Config`** JSONB blob persisted per-Creative on
  `event_creatives.customization` (default `'{}'::jsonb`).
- A new **`brand_kits`** table for org-scoped named theme snapshots.
- New optional fields on `EventPageConfig`:
  - `customCreativeTemplates?: CustomCreativeTemplate[]` — organizer-forked
    templates.
  - `creativeTemplatePrefs.perEntity?: Record<string, string>` — per-speaker /
    per-sponsor template overrides.
- New pure library modules and new UI panels; **zero mutations** to the base
  spec's plan builders (`buildSpeakerPlan` / `buildSponsorPlan` /
  `buildComboPlan`) beyond the addition of an optional `customization` parameter
  with a default of `{}` that short-circuits to the pre-existing code path
  (Property 45, Additivity_Invariant).

The Additivity_Invariant is the single most important design constraint: any
Creative rendered with `customization = {}`, no applied Brand_Kit, no Custom_Template,
and no `perEntity` override MUST produce a `RenderPlan` that is `deep-equal`
to the base spec's plan for the same `(entity, template, format, theme)` tuple.
Every hook point is designed to short-circuit when nothing customizes it, so
byte-identical output is not an accident of testing but a structural
guarantee.

The additive surface is:

- **Two new database changes** — a new column
  `event_creatives.customization jsonb NOT NULL DEFAULT '{}'::jsonb` (migration
  `024_event_creatives_customization.sql`) and a new `brand_kits` table
  (migration `025_brand_kits.sql`).
- **Two new pure library modules** — `src/lib/creatives/creative-customization.ts`
  (types, validation, plan-builder extension) and `src/lib/creatives/brand-kits.ts`
  (Brand_Kit types + CRUD wrappers).
- **Additive extensions to existing modules**:
  `creative-templates.ts` gains `resolveTemplateWithCustom(...)` and
  `EventPageConfig.customCreativeTemplates` helpers;
  `creative-renderer.ts` gains a new `overlay` / `border` / watermark
  `PlanElement` variant, extended `RenderPlan` element ordering, and font
  loading for the wider Font_Choices set;
  `creative-storage.ts` gains `Customization_Config`-aware read/write
  helpers.
- **Five new UI components** —
  `src/components/event/creatives/CustomizationPanel.tsx`,
  `CustomTemplateBuilder.tsx`, `BrandKitLibrary.tsx`,
  `BrandKitPicker.tsx`, and `EntityTemplateOverrideEditor.tsx` — plus
  extensions to `CreativeGeneratorDialog.tsx` and
  `BatchCreativeGeneratorDialog.tsx` to mount the panel and route the config
  through the render path.
- **One new page-config field** on `EventPageConfig`
  (`customCreativeTemplates`) and one nested field
  (`creativeTemplatePrefs.perEntity`) — both optional and
  forward-merged by `normalizeConfig`.

**Backward compatibility (Requirement 14).** An organizer who applies no
customization renders exactly the base spec's output. The base-spec property
tests (Properties 1-19) and AI-backgrounds property tests (Properties 20-23)
continue to pass unchanged. Existing `event_creatives` rows (all with
`customization = '{}'::jsonb` after the migration backfill) render byte-for-byte
identically to what they produced at generation time.

## Architecture

The customization pipeline is a **pre-plan** and **plan-decorator** step. Its
inputs (a `Customization_Config` and optional applied Brand_Kit) flow through
new pure helpers that either short-circuit (empty config, Property 45) or
emit new `PlanElement`s inserted at fixed positions in the base plan.

```mermaid
flowchart TD
    subgraph UI["src/components/event/creatives/"]
        CGD[CreativeGeneratorDialog<br/>+ CustomizationPanel]
        BCGD[BatchCreativeGeneratorDialog<br/>+ CustomizationPanel]
        CTB[CustomTemplateBuilder<br/>preset fork + slot inspector]
        BKL[BrandKitLibrary<br/>org-scoped CRUD]
        BKP[BrandKitPicker<br/>apply to current creative]
        ETE[EntityTemplateOverrideEditor<br/>per-speaker/per-sponsor]
        PV[CreativePreviewCanvas<br/>same drawPlan path]
    end

    subgraph Lib["src/lib/creatives/"]
        CT[creative-templates.ts<br/>+ resolveTemplateWithCustom<br/>+ save/read custom templates<br/>+ save/read per-entity prefs]
        CC[creative-customization.ts NEW<br/>Customization_Config type<br/>+ validators + plan decorators<br/>+ resolveEffective(...)]
        BK[brand-kits.ts NEW<br/>Brand_Kit types + CRUD]
        CR[creative-renderer.ts<br/>+ overlay/border/watermark PlanElement variants<br/>+ wider font loader<br/>+ optional customization param]
        CS[creative-storage.ts<br/>+ customization read/write<br/>+ watermark-logo upload]
    end

    subgraph Data["Supabase"]
        EC[(event_creatives<br/>+ customization jsonb)]
        BK_TBL[(brand_kits NEW)]
        EV[(events.page_config<br/>+ customCreativeTemplates<br/>+ creativeTemplatePrefs.perEntity)]
        SA[(site-assets<br/>+ watermark-logos/{org_id}/)]
        ORG[(organizations.logo_url)]
    end

    CGD --> CC
    CGD --> BKP
    CGD --> ETE
    BCGD --> CC
    BCGD --> BKP
    BCGD --> ETE
    CTB --> CT
    BKL --> BK
    BKP --> BK

    CC --> CT
    CC --> CR
    PV --> CC
    PV --> CR

    CGD -- write customization --> EC
    CGD -- write custom templates + perEntity --> EV
    CGD -- upload watermark logo --> SA
    BKL -- CRUD --> BK_TBL
    CR -- read org logo --> ORG
    CS -- read/write --> EC
```

**Rendering pipeline (customization-aware, single creative):**

1. Organizer picks entity + template + one or more `Platform_Format`s (base
   spec) and optionally opens the `CustomizationPanel` to configure any
   subset of the ten new capabilities.
2. `resolveEffective(entity, template, format, theme, config, brandKit,
   perEntity)` (pure) computes the effective template, effective theme
   colors, and effective font per the strict precedence in
   Property 44 — Resolution_Precedence. When `config = {}`, no `brandKit`
   applies, no `Custom_Template` snapshot, and no `perEntity` override
   applies, this function returns the base-spec triple unchanged
   (Property 45).
3. `buildXPlan(entity, template, format, theme)` (base spec, unchanged
   signature) is called with the resolved template + theme. The result is
   the exact plan the base spec produces today.
4. `decoratePlanWithCustomization(plan, config, organizations)` (new, pure)
   walks the plan and:
   - Prepends any Background_Overlay `PlanElement`s AFTER the
     `background` and BEFORE every `image`/`text` element
     (Property 43, Overlay_Z_Order).
   - Appends any Custom_Prompt_Slot `PlanElement`s after the base spec's
     text slots, in author order (Property 41).
   - Applies per-slot Slot_Overrides and Position_Nudges by walking the
     existing text `PlanElement`s and overwriting their `color`,
     `fontFamily`, `align`, and `box` fields in place on a plan **copy**
     (never mutates the argument, per the base spec's purity convention).
   - Appends a watermark `PlanElement` (a special `image` variant with
     `role: "watermark"`) after all image/text elements when a resolved
     watermark logo URL exists, else emits nothing (Property 42.3).
   - Appends a border `PlanElement` last, so it always draws on top,
     when a Border_Style is configured (Property 42.4).
   When `config = {}`, this decorator returns the input plan
   **structurally unchanged** — every branch short-circuits on the
   absent field — so `plan === decoratePlanWithCustomization(plan, {})`
   under deep-equal (Property 45).
5. `drawPlan(ctx, plan)` (base spec, unchanged signature) draws the plan
   through the same imperative pipeline — the new `PlanElement` variants
   (`overlay`, `border`, and the `watermark` role) each get their own
   drawing branch appended to the existing `switch (el.kind)` cases in
   `drawPlan`. **Every pre-existing `PlanElement` case remains
   byte-identical**; the new cases are only entered when new element kinds
   are present in the plan.
6. `ensureFontsLoaded(...)` (extended) now loads every font family in the
   plan's text elements, not just Poppins — mirroring
   `document.fonts.load(...)` per Requirement 4.4.
7. The exported PNG is uploaded via the base-spec `uploadCreativeAsset`, and
   an `event_creatives` row is inserted with the new `customization` JSONB
   column carrying the exact config used at render time so a later fetch +
   re-render reproduces the same output byte-for-byte (Property 47,
   Round_Trip).

**Batch pipeline (Per-Entity_Template_Override, Requirement 10).** In
`BatchCreativeGeneratorDialog`, before rendering each entity the batch loop
resolves the effective template through `creativeTemplatePrefs.perEntity[entityId]`
first, falling back to `creativeTemplatePrefs[creativeType]` and then to
the built-in registry's first preset (Property 46). Every other stage of the
batch pipeline (Customization_Config, applied Brand_Kit, format loop, ZIP
assembly) is unchanged from the base spec.

## Components and Interfaces

### New: `src/lib/creatives/creative-customization.ts` (pure)

Types, validators, resolution precedence, and plan decorators. Contains **no**
Supabase calls — pure functions only, so every guarantee is testable with
`fast-check` without a network mock (Properties 41-47, 49-50).

```typescript
import type {
  CreativeTemplate,
  EventTheme,
  PlatformFormat,
  ResolvedBox,
  TextSlot,
} from "./creative-templates";
import type { PlanElement, RenderPlan } from "./creative-renderer";

// ─── Public types (Requirement 12) ───────────────────────────────────────────

/** Union of every keyable slot in a plan: built-in text slots + image slots +
 *  Custom_Prompt_Slots (identified by their `id`). */
export type SlotKey =
  | TextSlot["key"]                       // "name" | "title" | "company" | ...
  | "photo" | "logo" | "speakerPhoto" | "sponsorLogo" // image slots
  | `custom:${string}`;                   // Custom_Prompt_Slot ids

/** A single `type` label for a Custom_Prompt_Slot (Requirement 1.2). */
export type CustomPromptSlotType =
  | "headline" | "tagline" | "eventDate" | "quote" | "custom";

/** Organizer-authored text overlay (Requirement 1). */
export interface CustomPromptSlot {
  /** Stable id — used for drag-reorder keys and Slot_Override targeting. */
  id: string;
  type: CustomPromptSlotType;
  text: string;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number;
  fontFamily: string;   // must be in FONT_OPTIONS (Requirement 4.1)
  fontWeight: number;   // 400 | 500 | 600 | 700 typical
  baseSizePx: number;
  color: string;        // CSS color string
  align: "left" | "center" | "right";
}

/** Per-slot color / font override (Requirement 2). */
export interface SlotOverride {
  color?: string;
  fontFamily?: string;  // must be in FONT_OPTIONS
}

/** Per-slot position nudge + alignment override (Requirement 3). */
export interface PositionNudge {
  dxPct?: number;       // clamped to [-20, 20] at apply time (Property 42.1)
  dyPct?: number;
  align?: "left" | "center" | "right";
}

/** Background_Overlay sub-parts (Requirement 5). */
export interface OverlayDim { color: string; opacity: number /* 0..100 */ }
export interface OverlayGradient {
  from: string;
  to: string;
  direction: number;    // degrees 0..360, measured clockwise from north
  opacity: number;      // 0..100
}
export interface OverlayBlurRegion {
  boxPct: [number, number, number, number]; // [xPct, yPct, wPct, hPct]
  blurRadiusPx: number;
}
export interface BackgroundOverlay {
  dim?: OverlayDim;
  gradient?: OverlayGradient;
  blurRegion?: OverlayBlurRegion;
}

/** Watermark configuration (Requirement 6). */
export interface WatermarkConfig {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  opacity: number;      // 0..100
  sizePct: number;      // % of Platform_Format's short side
  uploadedLogoUrl?: string; // Creative-specific override (Requirement 6.4)
}

/** Border + drop shadow (Requirement 7). */
export interface BorderDropShadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}
export interface BorderStyle {
  color: string;
  thicknessPx: number;      // clamped to [0, 40] (Property 42.4)
  cornerRadiusPx: number;   // clamped to [0, min(w, h) / 2]
  dropShadow?: BorderDropShadow;
}

/** Custom_Template — a preset fork stored on `page_config`. */
export interface CustomCreativeTemplate extends CreativeTemplate {
  /** New id assigned when the template is saved. */
  id: string;
  /** Display name shown in the template picker. */
  name: string;
  /** Preset id the fork was derived from, or `null` when forked from
   *  another Custom_Template. */
  basedOn: string | null;
}

/** The persistence shape stored on `event_creatives.customization`
 *  (Requirement 12.2). Every field is optional so `{}` is a valid empty
 *  configuration and stores as JSONB `'{}'`. */
export interface CustomizationConfig {
  customPromptSlots?: CustomPromptSlot[];
  slotOverrides?: Partial<Record<SlotKey, SlotOverride>>;
  positionNudges?: Partial<Record<SlotKey, PositionNudge>>;
  backgroundOverlay?: BackgroundOverlay;
  watermark?: WatermarkConfig;
  border?: BorderStyle;
  /** The Brand_Kit id that was applied at render time (Requirement 9). */
  appliedBrandKitId?: string;
  /** Embedded Custom_Template snapshot (Requirement 8.10, 12.4) so the
   *  Creative renders identically even if the Custom_Template is later
   *  deleted from `page_config`. */
  snapshotTemplate?: CustomCreativeTemplate;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Shared with `creative-renderer.ts` (Requirement 10 in Introduction, and
 *  Property 42.2, Font_Size_Floor). */
export const MIN_FONT_SIZE_PX = 10;

/** Property 42.1 (Nudge_Bounds). */
export const NUDGE_MAX_PCT = 20;

/** Property 42.4 (Border_Bounded). */
export const BORDER_THICKNESS_MAX_PX = 40;

// ─── Purity: an empty config is truly a no-op ─────────────────────────────────

/**
 * Returns `true` iff the config would produce no additional/overriding
 * PlanElements — used by every hook point to short-circuit and guarantee
 * Property 45. Pure.
 */
export function isEmptyCustomization(c: CustomizationConfig | undefined): boolean {
  if (!c) return true;
  if (c.customPromptSlots && c.customPromptSlots.length > 0) return false;
  if (c.slotOverrides && Object.keys(c.slotOverrides).length > 0) return false;
  if (c.positionNudges && Object.keys(c.positionNudges).length > 0) return false;
  if (c.backgroundOverlay?.dim || c.backgroundOverlay?.gradient || c.backgroundOverlay?.blurRegion) return false;
  if (c.watermark) return false;
  if (c.border) return false;
  // Note: appliedBrandKitId and snapshotTemplate are resolved BEFORE the
  // decorator runs (they change the effective template/theme, not the plan
  // decoration), so they are not part of "empty decorator input".
  return true;
}

// ─── Bounds clamping (Property 42) ──────────────────────────────────────────

/** Clamps a Position_Nudge's dx/dy into [-20, 20] before offsetting a slot
 *  (Property 42.1). Pure. */
export function clampNudge(nudge: PositionNudge): PositionNudge {
  return {
    dxPct: nudge.dxPct === undefined ? undefined : Math.max(-NUDGE_MAX_PCT, Math.min(NUDGE_MAX_PCT, nudge.dxPct)),
    dyPct: nudge.dyPct === undefined ? undefined : Math.max(-NUDGE_MAX_PCT, Math.min(NUDGE_MAX_PCT, nudge.dyPct)),
    align: nudge.align,
  };
}

/** Offsets a `ResolvedBox` by a clamped Position_Nudge, then re-applies the
 *  safe-area clamp (Property 42.1). Pure. */
export function applyNudgeToBox(
  box: ResolvedBox,
  nudge: PositionNudge,
  format: PlatformFormat
): ResolvedBox {
  const clamped = clampNudge(nudge);
  const dx = ((clamped.dxPct ?? 0) / 100) * format.width;
  const dy = ((clamped.dyPct ?? 0) / 100) * format.height;
  let x = box.x + dx;
  let y = box.y + dy;
  x = Math.max(0, Math.min(x, format.width - box.width));
  y = Math.max(0, Math.min(y, format.height - box.height));
  return { x, y, width: box.width, height: box.height };
}

/** Clamps a Border_Style's thickness / cornerRadius to their safe bounds
 *  for a target format (Property 42.4). Pure. */
export function clampBorder(border: BorderStyle, format: PlatformFormat): BorderStyle {
  const maxRadius = Math.min(format.width, format.height) / 2;
  return {
    ...border,
    thicknessPx: Math.max(0, Math.min(BORDER_THICKNESS_MAX_PX, border.thicknessPx)),
    cornerRadiusPx: Math.max(0, Math.min(maxRadius, border.cornerRadiusPx)),
  };
}

/** Resolves a Watermark_Config to a `ResolvedBox` fully contained in
 *  `[0, w] × [0, h]` (Property 42.3). Pure. */
export function resolveWatermarkBox(
  wm: WatermarkConfig,
  format: PlatformFormat
): ResolvedBox {
  const shortSide = Math.min(format.width, format.height);
  const size = Math.max(0, Math.min(100, wm.sizePct)) / 100 * shortSide;
  // Uniform margin (5% of short side) between the watermark and the canvas
  // edge, matching the base spec's safe-area convention.
  const margin = shortSide * 0.05;
  let x = 0, y = 0;
  switch (wm.position) {
    case "top-left":     x = margin; y = margin; break;
    case "top-right":    x = format.width  - size - margin; y = margin; break;
    case "bottom-left":  x = margin; y = format.height - size - margin; break;
    case "bottom-right": x = format.width  - size - margin; y = format.height - size - margin; break;
  }
  // Defensive: even with a 100% size on the shortest format, the margin
  // subtraction might push x/y negative — clamp to [0, ...] to preserve the
  // Property 42.3 invariant unconditionally.
  x = Math.max(0, Math.min(x, format.width - size));
  y = Math.max(0, Math.min(y, format.height - size));
  return { x, y, width: size, height: size };
}

// ─── Effective-value resolution (Property 44) ────────────────────────────────

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

/** Strict Resolution_Precedence for the effective (template, theme, font,
 *  logo) tuple at render time (Property 44). Pure — this function is where
 *  Property 44 is enforced. */
export function resolveEffective(
  args: {
    baseTemplate: CreativeTemplate;
    baseTheme: EventTheme;
    config: CustomizationConfig;
    brandKit?: AppliedBrandKit;
    /** Entity template override id looked up from
     *  `page_config.creativeTemplatePrefs.perEntity[entity.id]`. */
    entityOverrideTemplate?: CreativeTemplate;
    /** The organization row's `logo_url` (Requirement 6.2). */
    orgLogoUrl?: string;
  }
): {
  template: CreativeTemplate;
  theme: EventTheme;
  effectiveFontFamily: string;      // fallback for slots without a Slot_Override.fontFamily
  effectiveWatermarkLogoUrl?: string; // resolved via Requirement 6.2 precedence
} {
  const { baseTemplate, baseTheme, config, brandKit, entityOverrideTemplate, orgLogoUrl } = args;

  // 1. Entity_Template_Override wins over event-level default and template
  //    fork, per Requirement 10.3.
  // 2. Custom_Template snapshot from Customization_Config overrides everything
  //    else about the layout — the Creative rendered with a snapshot must
  //    match the snapshot even if the source template was deleted.
  const template = config.snapshotTemplate ?? entityOverrideTemplate ?? baseTemplate;

  // Theme resolution: Customization_Config's slotOverrides are per-slot (not
  // theme-wide), so brand_kit + event theme + template built-ins govern here.
  // Base spec's `resolveBackground` + `resolveAccentColor` continue to apply
  // — this function only fills in the theme's undefined fields from the
  // Brand_Kit, then leaves everything else for the base pipeline.
  const theme: EventTheme = {
    primaryColor: baseTheme.primaryColor ?? brandKit?.primaryColor,
    accentColor:  baseTheme.accentColor  ?? brandKit?.accentColor,
    orgLogoUrl:   baseTheme.orgLogoUrl   ?? brandKit?.logoUrl,
  };

  // Effective font family for slots WITHOUT a Slot_Override.fontFamily:
  //   Slot_Override wins per-slot (applied later in the decorator).
  //   Brand_Kit fontFamily is the next fallback across all slots.
  //   Template's built-in slot.fontFamily is the final fallback.
  const effectiveFontFamily = brandKit?.fontFamily ?? "Poppins";

  // Watermark logo precedence (Requirement 6.2):
  //   1. Customization_Config.watermark.uploadedLogoUrl (Creative-specific)
  //   2. organizations.logo_url
  //   3. undefined (omit watermark entirely)
  const effectiveWatermarkLogoUrl =
    config.watermark?.uploadedLogoUrl
    ?? orgLogoUrl
    ?? undefined;

  return { template, theme, effectiveFontFamily, effectiveWatermarkLogoUrl };
}

// ─── Plan decoration (Properties 41, 43) ─────────────────────────────────────

/** Decorates a base RenderPlan with every Customization_Config field.
 *  Pure — returns a new plan; never mutates the input.
 *
 *  Element ordering after decoration (Property 43):
 *
 *    background            (from base plan)
 *    → overlay-dim         (new, if configured)
 *    → overlay-gradient    (new, if configured)
 *    → overlay-blur-region (new, if configured)
 *    → images              (from base plan: photo/logo/speakerPhoto/sponsorLogo)
 *    → texts               (from base plan: name/title/company/tierBadge/...)
 *    → custom-prompt texts (new, appended in author order — Property 41)
 *    → divider             (from base plan, if present)
 *    → watermark           (new, if a resolved watermark URL exists)
 *    → border              (new, if configured; drawn last — Property 42.4)
 *
 *  Short-circuits: when `config` is empty per `isEmptyCustomization(config)`,
 *  returns a structurally-equal copy of the input plan (element-for-element
 *  deep equal). This is the on-ramp for Property 45.
 */
export function decoratePlanWithCustomization(
  plan: RenderPlan,
  config: CustomizationConfig,
  ctx: { effectiveWatermarkLogoUrl?: string; effectiveFontFamily: string }
): RenderPlan {
  if (isEmptyCustomization(config)) {
    // Return the same reference for byte-level equality guarantees in
    // property tests (deep-equal is what Property 45 requires, but this
    // stronger guarantee helps performance-sensitive live previews too).
    return plan;
  }

  // Walk plan.elements, split into background / images / texts / divider,
  // apply per-slot overrides + nudges, then reassemble in the fixed order
  // above. See implementation notes in the tasks list.
  //
  // (Full implementation lives in the module; this signature is the
  // contract Testing Strategy targets.)
  throw new Error("Implemented in creative-customization.ts — see design.md#components");
}
```

### New: `src/lib/creatives/brand-kits.ts`

Types + `supabase` CRUD wrappers for the org-scoped `brand_kits` table.
Pure helpers (`buildBrandKitRecord`, `readBrandKitSnapshot`) are kept
separate from imperative Supabase calls so the pure helpers can be tested
without a network mock, following the base spec's `creative-storage.ts`
split.

```typescript
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import type { AppliedBrandKit } from "./creative-customization";

export interface BrandKitRow {
  id: string;
  org_id: string;
  name: string;
  snapshot: {
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    logoUrl?: string;
    preferredTemplateIds?: string[];
    preferredFormats?: string[];
  };
  created_by: string;
  created_at: string;
}

/** Pure builder — payload for `INSERT INTO brand_kits`. */
export function buildBrandKitRecord(input: {
  orgId: string;
  name: string;
  snapshot: BrandKitRow["snapshot"];
  createdBy: string;
}): Omit<BrandKitRow, "id" | "created_at"> {
  return {
    org_id: input.orgId,
    name: input.name.trim(),
    snapshot: { ...input.snapshot },
    created_by: input.createdBy,
  };
}

/** Fetches every Brand_Kit visible to the caller for the given org, ordered
 *  most-to-least recently created (Requirement 9.3). Never throws — returns
 *  `[]` and logs on error, mirroring the base spec's
 *  `fetchEventCreativeBackgrounds` convention. */
export async function fetchBrandKits(orgId: string): Promise<BrandKitRow[]> {
  const { data, error } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("brand kits fetch failed", { org_id: orgId, error_message: error.message });
    return [];
  }
  return data ?? [];
}

/** Inserts a Brand_Kit; caller must ensure org ownership. RLS is the actual
 *  security boundary (Property 48). */
export async function createBrandKit(record: Omit<BrandKitRow, "id" | "created_at">): Promise<BrandKitRow | null> {
  const { data, error } = await supabase
    .from("brand_kits")
    .insert(record)
    .select("*")
    .single();
  if (error) {
    logger.error("brand kit insert failed", { org_id: record.org_id, error_message: error.message });
    return null;
  }
  return data;
}

/** Deletes a Brand_Kit. RLS enforces "org owner or admin only" (Property 48). */
export async function deleteBrandKit(id: string): Promise<boolean> {
  const { error } = await supabase.from("brand_kits").delete().eq("id", id);
  if (error) {
    logger.error("brand kit delete failed", { id, error_message: error.message });
    return false;
  }
  return true;
}

/** Bakes a Brand_Kit's snapshot into an `AppliedBrandKit` for
 *  `resolveEffective`. Pure. */
export function readBrandKitSnapshot(row: BrandKitRow): AppliedBrandKit {
  return {
    id: row.id,
    primaryColor: row.snapshot.primaryColor,
    accentColor: row.snapshot.accentColor,
    fontFamily: row.snapshot.fontFamily,
    logoUrl: row.snapshot.logoUrl,
    preferredTemplateIds: row.snapshot.preferredTemplateIds,
    preferredFormats: row.snapshot.preferredFormats,
  };
}
```

### Extension: `src/lib/creatives/creative-templates.ts`

Two additive helpers for Custom_Template persistence and per-entity template
override reads. Zero existing signatures changed.

```typescript
import type { CustomCreativeTemplate } from "./creative-customization";
import type { EventPageConfig } from "@/components/event/page-form/types";

/** Reads the effective template for an entity — checks
 *  `creativeTemplatePrefs.perEntity[entityId]` first (Requirement 10.3),
 *  then falls back to `creativeTemplatePrefs[creativeType]`, then to the
 *  built-in registry's first preset. Pure. Property 46. */
export function readEffectiveTemplateId(
  config: EventPageConfig,
  entityId: string,
  creativeType: CreativeType
): string | undefined {
  const perEntity = config.creativeTemplatePrefs?.perEntity?.[entityId];
  if (perEntity) return perEntity;
  return config.creativeTemplatePrefs?.[creativeType];
}

/** Sets a per-entity template override (Requirement 10.2). Pure. */
export function saveEntityTemplateOverride(
  config: EventPageConfig,
  entityId: string,
  templateId: string
): EventPageConfig {
  return {
    ...config,
    creativeTemplatePrefs: {
      ...config.creativeTemplatePrefs,
      perEntity: {
        ...config.creativeTemplatePrefs?.perEntity,
        [entityId]: templateId,
      },
    },
  };
}

/** Removes a per-entity template override (Requirement 10.5) — deletes the
 *  key rather than storing `null` so the map stays minimal. Pure. */
export function clearEntityTemplateOverride(
  config: EventPageConfig,
  entityId: string
): EventPageConfig {
  const next = { ...(config.creativeTemplatePrefs?.perEntity ?? {}) };
  delete next[entityId];
  return {
    ...config,
    creativeTemplatePrefs: {
      ...config.creativeTemplatePrefs,
      perEntity: next,
    },
  };
}

/** Persists a Custom_Template on `page_config.customCreativeTemplates`
 *  (Requirement 8.8). Pure — returns a new config. */
export function saveCustomTemplate(
  config: EventPageConfig,
  template: CustomCreativeTemplate
): EventPageConfig {
  const existing = config.customCreativeTemplates ?? [];
  const idx = existing.findIndex((t) => t.id === template.id);
  const nextList = idx === -1 ? [...existing, template] : existing.map((t, i) => i === idx ? template : t);
  return { ...config, customCreativeTemplates: nextList };
}

/** Deletes a Custom_Template (Requirement 8.10). Pure. */
export function deleteCustomTemplate(config: EventPageConfig, templateId: string): EventPageConfig {
  return {
    ...config,
    customCreativeTemplates: (config.customCreativeTemplates ?? []).filter((t) => t.id !== templateId),
  };
}
```

### Extension: `src/lib/creatives/creative-renderer.ts`

Additive `PlanElement` variants, an `overlay`/`border`/`watermark` drawing
branch in `drawPlan`, and a wider font-loading helper. **Existing plan
builders, `fitText`, `nativeSizedLogoBox`, `drawTextElement`,
`drawImageElement`, and `drawBackground` are unchanged.**

```typescript
// Additive to the existing PlanElement union — every base-spec case remains
// as-is.
export type PlanElement =
  // ...existing variants (background/image/text/divider)
  | { kind: "overlay-dim"; color: string; opacity: number /* 0..1 */ }
  | {
      kind: "overlay-gradient";
      from: string; to: string;
      direction: number;    // radians (converted from degrees at plan-build time)
      opacity: number;      // 0..1
    }
  | {
      kind: "overlay-blur-region";
      box: ResolvedBox;
      blurRadiusPx: number;
    }
  | {
      // Watermark reuses image loading but pins to a Watermark-config-derived box,
      // rendered with an opacity multiplier — a new kind (rather than reusing
      // `image`) so it's easy to test for its z-order invariant (Property 42.3).
      kind: "watermark";
      url: string;
      box: ResolvedBox;
      opacity: number;      // 0..1
    }
  | {
      kind: "border";
      color: string;
      thicknessPx: number;
      cornerRadiusPx: number;
      dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    };

// drawPlan gains new switch cases — every base-spec case is untouched:
//   case "overlay-dim":       drawOverlayDim(ctx, el, plan.format); break;
//   case "overlay-gradient":  drawOverlayGradient(ctx, el, plan.format); break;
//   case "overlay-blur-region": drawOverlayBlurRegion(ctx, el, plan.format); break;
//   case "watermark":         await drawWatermark(ctx, el); break;
//   case "border":            drawBorder(ctx, el, plan.format); break;

/**
 * Extended `ensureFontsLoaded` — accepts the plan and preloads every unique
 * (fontFamily, fontWeight) combination present in `text` elements
 * (Requirement 4.4). Best-effort; unresolved families degrade to the CSS
 * `sans-serif` fallback baked into `drawTextElement`'s font string
 * (Requirement 4.3).
 */
async function ensureFontsLoadedForPlan(plan: RenderPlan): Promise<void> { /* … */ }
```

**Overlay_Blur_Region implementation note.** Canvas 2D's `ctx.filter =
"blur(Npx)"` is supported by every browser we ship to (Chrome, Firefox,
Safari, Edge). To scope the blur to a specific box without blurring the whole
canvas, `drawOverlayBlurRegion` (1) grabs the current canvas pixels in the
target box via `ctx.getImageData(box.x, box.y, box.width, box.height)`,
(2) draws them to a scratch `OffscreenCanvas`, (3) applies
`filter = "blur(Npx)"` on the scratch context, (4) `drawImage`s the blurred
scratch back into the main canvas at the same box, (5) restores. The
resulting blur affects only the pixels in the target box, and only the
pixels of the layers **already drawn below the plan cursor** — namely, the
background (and any preceding overlay elements). This is why the plan
ordering places `overlay-blur-region` after `overlay-dim` /
`overlay-gradient` but strictly before every `image`/`text` element:
Requirement 5.4 explicitly forbids the blur from touching speaker photos or
sponsor logos. **Requirement 5.4 is enforced by ordering, not by pixel
masking**, which is simpler and more predictable.

**Watermark drawing.** `drawWatermark` uses the base spec's `loadImage`
helper for cross-origin safety, applies `ctx.globalAlpha = el.opacity` for
the draw, and calls `ctx.drawImage(img, el.box.x, el.box.y, el.box.width,
el.box.height)` — no aspect-ratio manipulation because the resolved
`el.box` is already a square derived from the format's short side
(`resolveWatermarkBox`). Failure to load the logo image logs
`logger.warn("creative watermark load failed", { url })` and skips the draw
(mirroring the base spec's photo/logo missing-image behavior).

**Border drawing.** `drawBorder` first applies the drop shadow (if any) by
setting `ctx.shadowColor` / `ctx.shadowOffsetX` / `ctx.shadowOffsetY` /
`ctx.shadowBlur`, then strokes a rounded-rect path
(`ctx.roundRect` when available, else the manual `arcTo` fallback already
used by `drawImageCropped`) inset by `thicknessPx / 2` from every edge so
the drawn stroke sits fully inside the canvas bounds. Restores shadow state
after the stroke.

**Overlay_Gradient direction convention.** Requirement 5.3 specifies
"degrees, 0-360, measured clockwise from north." Canvas 2D's
`createLinearGradient(x0, y0, x1, y1)` takes cartesian coordinates, so
`drawOverlayGradient` converts to `radians = (direction - 90) * π / 180`
(matching the base spec's existing background-gradient conversion in
`drawBackground`) and derives the endpoints via
`x0 = w/2 - cos(rad)*w/2, y0 = h/2 - sin(rad)*h/2, x1 = w/2 + cos(rad)*w/2,
y1 = h/2 + sin(rad)*h/2`. `ctx.globalAlpha` handles the overlay opacity.

### Extension: `src/lib/creatives/creative-storage.ts`

Additive read/write helpers for the new `customization` column and one new
storage helper for the Creative-specific watermark logo upload. **Existing
signatures unchanged.**

```typescript
import type { CustomizationConfig } from "./creative-customization";

/** Extended `CreativeAssetInput` — adds an optional `customization` field
 *  that lands in `event_creatives.customization`. Every base-spec caller
 *  can omit this parameter and the resulting row will store `{}` in the
 *  new column (Requirement 12.1). */
export interface CreativeAssetInput {
  // ...existing fields (eventId, creativeType, speakerId, sponsorId,
  //   templateId, platformFormat, assetUrl, storagePath, createdBy,
  //   metadata)
  customization?: CustomizationConfig;
}

/** Extended `CreativeAssetRecord` — carries the new column value into the
 *  Supabase insert payload. */
export interface CreativeAssetRecord {
  // ...existing fields
  customization: Record<string, unknown>; // JSONB shape of CustomizationConfig
}

/** Additive to the existing `buildCreativeAssetRecord`: passes `customization`
 *  through, defaulting to `{}` (Requirement 12.1). Pure. */
export function buildCreativeAssetRecord(input: CreativeAssetInput): CreativeAssetRecord {
  // ...existing validation
  return {
    // ...existing fields
    customization: (input.customization ?? {}) as Record<string, unknown>,
  };
}

/** New helper — uploads a Creative-specific watermark logo (Requirement 6.4).
 *  Reuses `site-assets` bucket, stored under `watermark-logos/{org_id}/`.
 *  Same upsert-safe pattern as `uploadCreativeAsset`. */
export async function uploadWatermarkLogo(
  orgId: string,
  filename: string,
  blob: Blob
): Promise<{ url: string; storagePath: string }> {
  const path = `watermark-logos/${orgId}/${filename}`;
  const { error } = await supabase.storage.from("site-assets").upload(path, blob, {
    cacheControl: "3600",
    upsert: true,
    contentType: blob.type || "image/png",
  });
  if (error) {
    logger.error("watermark logo upload failed", { org_id: orgId, storage_path: path, error_message: error.message });
    throw error;
  }
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return { url: data.publicUrl, storagePath: path };
}

/** Extended `EventCreativeRow` — includes the new column. */
export interface EventCreativeRow {
  // ...existing fields
  customization: Json; // JSONB — CustomizationConfig shape
}
```

### New: `src/components/event/creatives/CustomizationPanel.tsx`

Mounted inside `CreativeGeneratorDialog` and `BatchCreativeGeneratorDialog`.
Sections mirror `EventPageForm.tsx`'s inspector-panel pattern: a
sticky-header settings column with collapsible groups, each group editing
one `CustomizationConfig` field:

1. **Custom Prompt Slots** — `@dnd-kit/sortable` list of
   `CustomPromptSlot` cards. "Add slot" opens a small type-picker
   (`headline`/`tagline`/`eventDate`/`quote`/`custom`) that pre-populates
   `text` (for `eventDate`, defaults to
   `formatEventDate(event.date, event.timezone)` using
   `@/lib/datetime` — Requirement 1.7). Each card has inline editors for
   `text`, `xPct`, `yPct`, `maxWidthPct`, `maxHeightPct`, `fontFamily`
   (dropdown of `FONT_OPTIONS`), `fontWeight`, `baseSizePx`, `color`
   (swatches from `COLOR_SWATCHES` + free-form hex), and `align`.
2. **Slot Overrides** — one row per built-in slot key present in the
   current template's `textSlots`, plus one row per Custom_Prompt_Slot,
   each with a color picker (defaults to the template's built-in color)
   and a font-family dropdown (defaults to `effectiveFontFamily`).
3. **Position Nudges** — same one-row-per-slot layout, with two
   sliders (`dxPct` in `[-20, 20]`, `dyPct` in `[-20, 20]`) and an
   alignment radio group.
4. **Background Overlay** — three sub-cards
   (`Overlay_Dim`, `Overlay_Gradient`, `Overlay_Blur_Region`), each
   with an enable toggle and controls specific to that sub-part
   (color+opacity for dim; from/to/direction/opacity for gradient;
   boxPct + blurRadiusPx for blur-region).
5. **Watermark** — a position radio group (four corners), an
   `opacity` slider (0-100), and a `sizePct` slider (5-30% of short
   side is a sensible UI-side range even though the config allows up
   to 100). "Upload custom logo" reveals a file input that hits
   `uploadWatermarkLogo`.
6. **Border** — color picker, thickness slider (0-40 px), corner
   radius slider (0-`min(w,h)/2`), plus a "Drop shadow" toggle
   revealing color / offsetX / offsetY / blur controls.
7. **Custom Template** — a "Fork this preset" button that opens
   `CustomTemplateBuilder` in a modal.
8. **Brand Kit** — a `BrandKitPicker` dropdown listing every kit the
   org owns; selecting one applies its snapshot to the Creative
   (populating the effective theme/font/logo — the values are baked
   into `Customization_Config` per Requirement 12.5).
9. **Entity Template Override** — surfaces only when the current
   entity has a saved per-entity override, with a "Clear override"
   button.

Every control writes into a local `config: CustomizationConfig` state
that's debounced (400ms — matching the base spec's live-preview
convention) and passed through the same plan-builder + `drawPlan`
pipeline the export uses (Property 49, Preview_Parity).

### New: `src/components/event/creatives/CustomTemplateBuilder.tsx`

Modal opened from `CustomizationPanel`'s "Fork this preset" button. Layout:

- **Left**: an inspector list of every slot in the fork
  (`@dnd-kit/sortable` for drag-reorder of text slots per Requirement 8.4).
  Each slot is a clickable card with a "delete" button (except built-in
  image slots, which are not deletable — Requirement 8.7). A "+ Add custom
  slot" button at the bottom.
- **Right**: a live `<canvas>` preview using the same plan-build +
  `drawPlan` path.
- **Bottom**: a slot-inspector panel that appears when a slot is
  selected, editing every field per Requirement 8.3.
- **Header**: a text field for the template `name` and a "Save" button
  that writes the finished `CustomCreativeTemplate` back to
  `page_config.customCreativeTemplates` via `saveCustomTemplate` and the
  existing `supabase.from("events").update({ page_config })` path.

The builder never edits the static preset registries directly — every
save writes a new value into `EventPageConfig.customCreativeTemplates`
(Requirement 8.8).

### New: `src/components/event/creatives/BrandKitLibrary.tsx`

Standalone panel accessible from `CreativesSection.tsx` (a new "Brand
kits" tab alongside "Creatives" and "AI backgrounds"). Lists every kit
belonging to the current org, sorted most-to-least recently created.
Each row shows a color-swatch preview + font name + a small logo
thumbnail. Header controls: "New brand kit" (opens a create modal),
"Apply to current event" (writes the kit's values into the current
event's `page_config.theme` for downstream default resolution). Each row
also carries a delete button gated by `isAdmin || isOwner` (client-side
UX gate mirroring `SponsorManagement.tsx`; RLS is the real security
boundary per Property 48).

### New: `src/components/event/creatives/BrandKitPicker.tsx`

Compact selector for mounting inside `CustomizationPanel` and the
Custom_Template_Builder. Fetches kits via `fetchBrandKits(orgId)`,
renders a shadcn `<Select>` dropdown, and calls back with the picked
kit's `AppliedBrandKit` shape when the organizer applies one.

### New: `src/components/event/creatives/EntityTemplateOverrideEditor.tsx`

Section in `CustomizationPanel` shown only when an entity is selected
(single-creative flow) or in an inline "per-entity" tab of
`BatchCreativeGeneratorDialog`. Shows the current effective template
name (resolved through `readEffectiveTemplateId`), a template picker
scoped to templates compatible with the entity's CreativeType, a "Save
as default for this speaker/sponsor" button that writes via
`saveEntityTemplateOverride`, and a "Clear override" button that writes
via `clearEntityTemplateOverride`. Writes are debounced and go through
the same `supabase.from("events").update({ page_config })` path used
elsewhere.

### Extension: `src/components/event/creatives/CreativeGeneratorDialog.tsx`

Additive changes:

1. Add local `customization` state (default `{}`) fed to
   `CustomizationPanel`.
2. Add local `appliedBrandKit` state (default `undefined`) fed to
   `BrandKitPicker`.
3. In `handleGenerate`, resolve effective template/theme via
   `resolveEffective(...)`, call the base plan builder, then decorate the
   plan via `decoratePlanWithCustomization`, then feed to `drawPlan` /
   `renderPlanToPngBlob`.
4. When calling `insertCreativeAssetRecord`, pass the same `customization`
   (with any snapshot template + applied brand kit id baked in) so the
   persisted row is round-trippable (Property 47).

**No signature of any base-spec function is changed.**
`renderSpeakerCreative` / `renderSponsorCreative` / `renderComboCreative`
are left as-is; the dialog now takes the explicit plan-builder + decorator
route above. The base-spec convenience wrappers stay available for callers
that don't need customization.

### Extension: `src/components/event/creatives/BatchCreativeGeneratorDialog.tsx`

Additive changes:

1. Mount `CustomizationPanel` (shared config applied to every entity in
   the batch — the base UX assumption for batch runs).
2. Before rendering each entity in the batch loop, resolve its effective
   template via `readEffectiveTemplateId(config, entity.id, creativeType)`
   (Property 46).
3. Pass the resolved `customization` through to
   `decoratePlanWithCustomization` per entity.

## Data Models

Two schema changes ship in two new migrations. Both are strictly additive.

### Migration `024_event_creatives_customization.sql`

```sql
-- Adds the Customization_Config JSONB column to event_creatives.
-- Default of '{}'::jsonb means every existing row (and every new row from a
-- caller that doesn't opt into customization) stores an empty object,
-- preserving the Additivity_Invariant end-to-end.

alter table public.event_creatives
  add column if not exists customization jsonb not null default '{}'::jsonb;

comment on column public.event_creatives.customization is
  'Customization_Config JSONB for the Creative_Customization feature. Contains customPromptSlots, slotOverrides, positionNudges, backgroundOverlay, watermark, border, appliedBrandKitId, and snapshotTemplate. Default {} preserves base-spec render output.';
```

The `event_creatives` RLS policies from `022_event_creatives.sql` cover the
new column implicitly — every existing SELECT/INSERT/UPDATE/DELETE policy
already scopes by `event_id` → `events.user_id`, so adding a new JSONB
column requires no policy change. No index is required because the
`customization` field is never a query predicate (rows are always fetched
by `event_id` + `created_at`).

### Migration `025_brand_kits.sql`

```sql
-- New table for organization-scoped named Brand_Kits (Requirement 9).

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists brand_kits_org_idx
  on public.brand_kits (org_id, created_at desc);

alter table public.brand_kits enable row level security;

-- SELECT: any member of the org OR platform admin (Requirement 9.6).
create policy "brand_kits: org members and admins can select"
  on public.brand_kits
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = brand_kits.org_id
        and om.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- INSERT: only the org's owner OR platform admin (Requirement 9.6).
create policy "brand_kits: org owner and admins can insert"
  on public.brand_kits
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- UPDATE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can update"
  on public.brand_kits
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

-- DELETE: only the org's owner OR platform admin.
create policy "brand_kits: org owner and admins can delete"
  on public.brand_kits
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = brand_kits.org_id
        and o.owner_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

comment on table public.brand_kits is
  'Organization-scoped Brand_Kits for the Creative_Customization feature. RLS: any org_member (or admin) may select; only the org.owner_id (or admin) may insert/update/delete.';
```

The RLS truth table this migration implements (Property 48):

| is_org_member | is_org_owner | is_platform_admin | SELECT | INSERT | UPDATE | DELETE |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| F | F | F | deny | deny | deny | deny |
| T | F | F | **allow** | deny | deny | deny |
| F | T | F | **allow** (owner is also a member via `org_members`) | **allow** | **allow** | **allow** |
| T | T | F | **allow** | **allow** | **allow** | **allow** |
| F | F | T | **allow** | **allow** | **allow** | **allow** |
| T | F | T | **allow** | **allow** | **allow** | **allow** |
| F | T | T | **allow** | **allow** | **allow** | **allow** |
| T | T | T | **allow** | **allow** | **allow** | **allow** |

Property 48 exhausts this truth table (8 rows × 4 verbs = 32 cases) and
asserts the expected allow/deny outcome for each cell.

### Additive fields on `EventPageConfig`

```typescript
// src/components/event/page-form/types.ts — additive; existing fields are
// unchanged; `normalizeConfig` forward-merges these from `fresh` when a
// stored config predates them, mirroring `creativeTemplatePrefs` /
// `brochurePrefs` conventions.

export interface EventPageConfig {
  // ...existing fields
  creativeTemplatePrefs?: Partial<Record<"speaker" | "sponsor" | "combo", string>> & {
    /** Per-entity template override (Requirement 10.2). Keyed by
     *  speakers.id or sponsors.id. Empty/absent → fall back to
     *  creativeTemplatePrefs[creativeType]. */
    perEntity?: Record<string, string>;
  };
  /** Organizer-forked Custom_Templates for this event (Requirement 8.8). */
  customCreativeTemplates?: CustomCreativeTemplate[];
}
```

`normalizeConfig` in `types.ts` is extended to forward-merge these two
optional fields identically to how `creativeTemplatePrefs` and
`brochurePrefs` are already merged today — no shape validation beyond
"the field is an object of the expected top-level shape" (deep
validation happens client-side when the panel renders).

## Error Handling

Every failure mode is scoped to keep the customization pipeline resilient:
a single missing font, a single unreachable watermark URL, or a single
malformed slot config never aborts the whole render.

| Failure | Where it's caught | Fallback |
| --- | --- | --- |
| Slot_Override or Custom_Prompt_Slot references a fontFamily not in `FONT_OPTIONS` | `CustomizationPanel` (dropdown restricts to `FONT_OPTIONS`) + `decoratePlanWithCustomization` (defensive) | Silently fall back to `effectiveFontFamily`; log via `logger.warn("customization unknown font family", { fontFamily })`. Requirement 4 constrains the picker; this branch is defensive-only |
| Watermark upload logo fetch/CORS failure | `drawWatermark` in `creative-renderer.ts` (reuses `loadImage`) | Skip the watermark draw entirely and log `logger.warn("creative watermark load failed", { url })`. Requirement 6.3 explicitly says no placeholder box for a missing logo |
| `organizations.logo_url` present but unreachable | Same as above — the URL is fetched at draw time | Same as above — skip and log |
| Position_Nudge out of `[-20, 20]` range | `clampNudge` (pure) | Clamped to boundary value silently (Property 42.1). No logging — this is documented behavior |
| Border thickness / cornerRadius out of bounds | `clampBorder` (pure) | Clamped silently (Property 42.4) |
| Watermark logo file upload to `site-assets` fails | `uploadWatermarkLogo` | Rethrows; the `CustomizationPanel` uploader catches, shows a toast, and leaves the previous `uploadedLogoUrl` (if any) unchanged |
| Custom_Template save fails (`.update({ page_config })` error) | Custom_Template_Builder's save handler | Toast `"Failed to save custom template"`, keep modal open so retry doesn't lose organizer edits |
| Brand_Kit CRUD failure (network, RLS deny) | `createBrandKit` / `deleteBrandKit` / `fetchBrandKits` | Each logs and returns null/false/`[]`; `BrandKitLibrary` shows a toast on save/delete failures and an empty state on fetch failures |
| Snapshot template embedded in an old `event_creatives` row references a font not currently in `FONT_OPTIONS` (e.g. shipped feature removed a font) | `decoratePlanWithCustomization` | Renders with the CSS `sans-serif` fallback (already in the base spec's `drawTextElement` font string) — the PNG stays visually reasonable rather than crashing |
| `customization` JSONB fetched from Supabase doesn't match `CustomizationConfig` shape (defensive) | `parseCustomization(...)` (pure guard called on fetch) | Fields that fail validation are dropped silently; the resulting config still renders whatever remains. Log via `logger.warn("customization malformed field", { field })` per dropped field. This handles forward-compatibility with newer client versions writing fields an older cached client can't understand |
| `applyNudgeToBox` produces a box that violates the safe-area clamp (defensive — the input clamp already prevents this) | `applyNudgeToBox` itself | The re-clamp at the end guarantees `x, y >= 0 && x + w <= format.width && y + h <= format.height` unconditionally, so this branch is a defense-in-depth belt-and-braces guard |
| Font in the plan hasn't finished loading when `canvas.toBlob` fires | `ensureFontsLoadedForPlan` (awaited before `drawPlan`) | The `document.fonts.load` call for each `(family, weight)` combo is awaited; unresolved families degrade to `sans-serif` via `drawTextElement`'s font string. Property 50 asserts this end-to-end |
| Organizer not authorized to persist a customization on an event they don't own | UI gate `isAuthorizedForEventCreatives` (client-side) + `events` RLS policies (real security boundary) | The dialog's save action is hidden client-side. If a hostile client bypasses the gate, `.update({ page_config })` fails at the RLS layer, and `.insert` into `event_creatives` fails at the RLS layer (Requirement 11.2) |

## Testing Strategy

Every pure function in `creative-customization.ts` and every additive
helper in `creative-templates.ts` / `creative-storage.ts` is directly
testable without a `<canvas>`, a DOM, or a network mock — this is the
whole point of keeping the decorator layer pure (see Architecture).
Imperative `drawPlan` extensions for the new element kinds are exercised
via a mocked `CanvasRenderingContext2D` (following the base spec's own
canvas-mocking pattern in
`src/lib/creatives/__tests__/creative-storage.integration.test.ts` and
similar).

Property test files live in `src/lib/creatives/__tests__/`, named
`property-N-*.pbt.test.ts` per the existing convention, each with a
header comment `// Feature: creative-customization, Property N: <title>`
and a `// Validates: Requirements X.Y, ...` line, run via
`fc.assert(fc.property(...), { numRuns: 100 })`.

| Property | File | Function(s) under test |
| --- | --- | --- |
| 41 — Custom_Prompt_Slot addition is additive | `property-41-custom-prompt-slot-additive.pbt.test.ts` | `decoratePlanWithCustomization` |
| 42.1 — Nudge_Bounds | `property-42-bounds-invariants.pbt.test.ts` (Property 42 subgroup 1) | `clampNudge`, `applyNudgeToBox` |
| 42.2 — Font_Size_Floor | `property-42-bounds-invariants.pbt.test.ts` (Property 42 subgroup 2) | integration between `decoratePlanWithCustomization` and base-spec `fitText` |
| 42.3 — Watermark_Bounded | `property-42-bounds-invariants.pbt.test.ts` (Property 42 subgroup 3) | `resolveWatermarkBox` |
| 42.4 — Border_Bounded | `property-42-bounds-invariants.pbt.test.ts` (Property 42 subgroup 4) | `clampBorder` |
| 43 — Background_Overlay z-order | `property-43-overlay-z-order.pbt.test.ts` | `decoratePlanWithCustomization` |
| 44 — Resolution_Precedence is strict + transitive | `property-44-resolution-precedence.pbt.test.ts` | `resolveEffective` |
| 45 — Additivity_Invariant vs base spec | `property-45-additivity-invariant.pbt.test.ts` | `decoratePlanWithCustomization({}) === plan` (structural equality) |
| 46 — Entity_Template_Override precedence in batch | `property-46-entity-template-precedence.pbt.test.ts` | `readEffectiveTemplateId` |
| 47 — Customization_Config round-trip | `property-47-customization-round-trip.pbt.test.ts` | `buildCreativeAssetRecord` + `parseCustomization` |
| 48 — Brand_Kit RLS scope invariants | `property-48-brand-kit-rls.pbt.test.ts` (Postgres integration test) | migration `025_brand_kits.sql` policies |
| 49 — Preview_Parity | `property-49-preview-parity.pbt.test.ts` | plan builder + decorator equality between live-preview and export code paths |
| 50 — Font_Choices consistency | `property-50-font-choices-consistency.pbt.test.ts` | `FONT_OPTIONS` is a superset of every family present in a decorated plan |

**Property 48 test approach.** Unlike Properties 41-47, 49, 50 (which are
pure-function properties testable in Vitest without Supabase), Property 48
requires actual database policies. The test follows the pattern established
in `supabase/migrations/*.integration.test.sql` (if present) or, more
pragmatically per the base spec convention, is an
`@testcontainers`-optional test that runs against a real Postgres with the
migrations applied — creating fixture rows for each cell of the truth table
and asserting the observed allow/deny outcome. The base spec's Property 19
covers the same shape for `event_creatives` and can be used as the template.

**Example test (Property 45, the central Additivity_Invariant):**

```typescript
// src/lib/creatives/__tests__/property-45-additivity-invariant.pbt.test.ts
// Feature: creative-customization, Property 45: Additivity_Invariant against base spec
// Validates: Requirements 1.6, 2.6, 3.5, 4.4, 5.5, 6.6, 7.4, 10.6, 14.1, 14.3, 14.4

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { arbSpeaker, arbSpeakerTemplate, arbFormat, arbTheme } from "./_arbitraries";
import { buildSpeakerPlan } from "../creative-renderer";
import { decoratePlanWithCustomization } from "../creative-customization";

describe("Property 45: Additivity_Invariant", () => {
  it("decorating a base plan with empty config produces a deep-equal plan", () => {
    fc.assert(
      fc.property(arbSpeaker, arbSpeakerTemplate, arbFormat, arbTheme, (speaker, template, format, theme) => {
        const basePlan = buildSpeakerPlan(speaker, template, format, theme);
        const decorated = decoratePlanWithCustomization(basePlan, {}, {
          effectiveFontFamily: "Poppins",
          effectiveWatermarkLogoUrl: undefined,
        });
        // Both structural (deep) and byte-equal for the elements array:
        // decorated.elements should be `===` the basePlan.elements reference
        // when config is empty (the decorator short-circuits on isEmptyCustomization).
        return decorated.elements === basePlan.elements
          && decorated.format === basePlan.format;
      }),
      { numRuns: 100 }
    );
  });
});
```

**Existing base-spec test suite regression coverage.** Properties 1-19
(Social_Creative_Generator) and 20-23 (Creative_AI_Backgrounds) MUST
continue to pass unchanged after this feature ships. The Additivity_Invariant
(Property 45) is not just a new property — it's the assertion that the
existing test suite stays green. Task-list execution will verify this via
`bun run test --run` at every checkpoint.

## Additivity Strategy — how base-spec output stays byte-identical

The Additivity_Invariant (Property 45) is guaranteed by four
structural design decisions, not by defensive testing:

1. **`decoratePlanWithCustomization` short-circuits on empty config.**
   The very first line of the function calls `isEmptyCustomization(config)`
   and returns the input plan by reference when true. There is no branch
   that could produce a different-shaped plan for an empty config — it is
   literally the same object.
2. **No base-spec signature changes.** `buildSpeakerPlan` /
   `buildSponsorPlan` / `buildComboPlan` retain their four-argument
   signatures. The customization flow calls them with the same `(entity,
   template, format, theme)` tuple the base spec always uses; the decorator
   runs after. Adding an optional fifth parameter is deliberately avoided
   so no base-spec caller can inadvertently pass a non-`{}` config.
3. **No changes to any existing `PlanElement` variant.** The new variants
   (`overlay-dim`, `overlay-gradient`, `overlay-blur-region`,
   `watermark`, `border`) are additions to the union. Every existing
   `drawPlan` `switch` case is byte-identical to the base spec's
   implementation. Old rows fetched from `event_creatives` (with
   `customization = {}`) build the same plan structure, run through the
   same drawing branches, and produce the same PNG bytes.
4. **The `customization` column defaults to `'{}'::jsonb`.** Every
   pre-existing row (all of which land with `{}` after the migration's
   `NOT NULL DEFAULT` clause) reads back as an empty config and hits the
   short-circuit in step 1. Property 47 (Round_Trip) plus Property 45
   (Additivity_Invariant) together guarantee identical PNG output for
   every existing row.

**AI backgrounds interaction (Requirement 5.6, Requirement 14.2).** When a
Creative uses an AI background, the base spec's plan pipeline already
places the AI URL into the plan's `background` element with
`kind: "background"` and `style: { type: "image", url: ..., fit: "cover" }`.
The customization decorator inserts Background_Overlay elements strictly
between the `background` and the first `image`/`text` element, preserving
the AI background's authority over what shows underneath. Property 43
covers this ordering explicitly, so the AI backgrounds spec's Property 23
(which asserts base-spec plan equivalence for an AI-backed background)
composes cleanly with Property 45 (which asserts the decorator preserves
the plan when nothing customizes it).

## Correctness Properties

*Property numbering continues across all creative-related specs: base
Social_Creative_Generator uses 1-19, Creative_AI_Backgrounds uses 20-23,
Event_Brochure_Generator uses 24-40. This spec adds Properties 41-50 so
test files across specs never collide. Full statements live in
`requirements.md` — this section is the design-side one-line summary of
each property + the function under test.*

### Property 41: Custom_Prompt_Slot addition is additive to base plan

`decoratePlanWithCustomization` with an empty `customPromptSlots` list
produces a plan whose `PlanElement` sequence equals the base spec's plan;
with a non-empty list, the base plan's `PlanElement` subset is unchanged
and one `text` element per Custom_Prompt_Slot is appended in author order.

**Validates: Requirements 1.1, 1.4, 1.6, 14.1**

### Property 42: Bound + floor invariants for nudge / font / watermark / border

Four sub-properties tested in one file:
- **42.1** `clampNudge` + `applyNudgeToBox` keep every resolved slot box
  inside the canvas safe area (Requirement 3.3).
- **42.2** No `text` `PlanElement` in a decorated plan has
  `fontSizePx < MIN_FONT_SIZE_PX` (Requirement 1.3).
- **42.3** `resolveWatermarkBox` produces a box fully contained in
  `[0, width] × [0, height]` for every valid `sizePct` and `position`
  (Requirement 6.5).
- **42.4** `clampBorder` keeps `thicknessPx ∈ [0, 40]` and
  `cornerRadiusPx ∈ [0, min(w, h) / 2]` (Requirement 7.3).

**Validates: Requirements 1.3, 3.2, 3.3, 6.5, 7.3**

### Property 43: Background_Overlay z-order

For any Background_Overlay configuration, the resulting
`RenderPlan.elements` contain (in order) the `background` element, zero or
more overlay elements (`overlay-dim`, `overlay-gradient`,
`overlay-blur-region`), every image and text element from the base plan,
optionally the watermark, and optionally the border — with no overlay
element preceding the background or following any image/text element.

**Validates: Requirements 5.1, 5.5, 5.6**

### Property 44: Resolution_Precedence is a strict, transitive per-field ordering

For any tuple of (Entity_Template_Override, `Customization_Config`,
applied Brand_Kit, event `creativeTemplatePrefs`, `EventTheme`, template
built-in default), `resolveEffective` returns per-field values ordered per
the requirements' precedence: Entity_Template_Override →
`Customization_Config` → Brand_Kit → event-level prefs → `EventTheme` →
template defaults. Two `Customization_Config` fields never conflict
(single-writer).

**Validates: Requirements 2.6, 6.2, 9.4, 9.5, 10.3**

### Property 45: Additivity_Invariant against base spec

For any Creative rendered where every Creative_Customization condition is
false (empty config, no Custom_Template, no Brand_Kit, no matching
`perEntity` override), the resulting `RenderPlan` is `deep-equal` to the
base spec's plan, and `renderXCreative(...)` produces an identical PNG
blob (hash-equal). The design guarantees this structurally via the
short-circuit in `decoratePlanWithCustomization` (see Additivity Strategy
section above).

**Validates: Requirements 1.6, 2.6, 3.5, 4.4, 5.5, 6.6, 7.4, 10.6, 14.1, 14.3, 14.4**

### Property 46: Entity_Template_Override precedence in batch runs

`readEffectiveTemplateId` returns `perEntity[entity.id]` when present,
else `creativeTemplatePrefs[creativeType]`, else the CreativeType's first
preset id in the built-in registry. Entities not in `perEntity` render
deep-equal to the base spec's plan.

**Validates: Requirements 10.3, 10.6**

### Property 47: Customization_Config round-trip

Persisting a `CustomizationConfig` into `event_creatives.customization`
(JSONB) and later fetching + re-rendering the row produces a PNG
hash-equal to the PNG produced by the original render. JSON round-tripping
preserves every field's semantic value; the render pipeline is
deterministic in `(entity, template, format, theme, customization)`.

**Validates: Requirements 8.10, 9.8, 12.3, 12.4, 12.5**

### Property 48: Brand_Kit RLS scope invariants

For any user `u`, org `o`, and Brand_Kit `k` with `k.org_id = o`, the
`brand_kits` RLS policies allow `SELECT k` when `u` is an org member or
platform admin, and allow `INSERT`/`UPDATE`/`DELETE` on `k` only when `u`
is the org owner or platform admin. Exhausts the 8×4 truth table of
`(is_org_member, is_org_owner, is_platform_admin) × SQL verb`.

**Validates: Requirements 9.6, 9.7, 11.3**

### Property 49: Preview_Parity between live canvas and exported PNG

The `RenderPlan` produced for the live preview `<canvas>` in
`CreativeGeneratorDialog` / `BatchCreativeGeneratorDialog` is deep-equal
to the plan produced when the Creative is exported; consequently, the PNG
bytes rendered from either plan are hash-equal.

**Validates: Requirements 13.1, 13.2, 13.3, 13.4**

### Property 50: Font_Choices consistency across UI and renderer

Every font family selectable in the Creative_Generator UI is present in
`FONT_OPTIONS`; every font family present in a rendered plan's `text`
`PlanElement` resolves to a loaded `FontFace` under `document.fonts` (via
`document.fonts.load(...)`) before `canvas.toBlob` is invoked.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**
