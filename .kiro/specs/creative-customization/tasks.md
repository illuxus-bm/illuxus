# Implementation Plan: Creative Customization

Convert the feature design into a series of prompts for a code-generation LLM
that will implement each step with incremental progress. Make sure that each
prompt builds on the previous prompts, and ends with wiring things together.
There should be no hanging or orphaned code that isn't integrated into a
previous step. Focus ONLY on tasks that involve writing, modifying, or
testing code.

## Overview

Implementation proceeds bottom-up, matching the pure-first architectural
split described in the design. The two Supabase migrations
(`024_event_creatives_customization.sql`,
`025_brand_kits.sql`) land first so the type surface has a database home,
then the pure `creative-customization.ts` module (types, validators,
resolvers, plan decorator) with its ten property tests, then the pure
`brand-kits.ts` module with its supabase CRUD wrappers, then additive
extensions to `creative-templates.ts`, `creative-renderer.ts`,
`creative-storage.ts` (each verified to leave every base-spec signature
unchanged), then the five new UI components and their integrations into
`CreativeGeneratorDialog` / `BatchCreativeGeneratorDialog` /
`CreativesSection`, and finally a full-checkpoint task that runs
`bun run test --run && bun run lint && bun run build` to prove
Additivity_Invariant (Property 45) — that every base-spec test still
passes.

Every task cites the requirement sub-clauses it fulfills. Test sub-tasks
are marked with `*` per project convention and are strictly optional; core
implementation tasks are never optional.

**Additivity discipline (repeat).** Base-spec signatures in
`creative-templates.ts`, `creative-renderer.ts`, `creative-storage.ts` MUST
NOT be renamed or have their arity changed. New functionality is exported
as new members alongside existing ones. Every hook point in the plan
pipeline short-circuits when its Customization_Config field is absent, so
Property 45 (Additivity_Invariant) is a structural guarantee — not a
best-effort claim.

## Tasks

- [x] 1. Land database migrations
  - [x] 1.1 Write `supabase/migrations/024_event_creatives_customization.sql`
    - Add `customization jsonb NOT NULL DEFAULT '{}'::jsonb` to
      `public.event_creatives`
    - Include a `comment on column` matching the design's spec text
    - No new index (customization is never a query predicate)
    - No RLS change (existing `event_creatives` policies scope by
      `event_id` → `events.user_id` and cover the new column implicitly)
    - _Requirements: 12.1, 14.3_
  - [x] 1.2 Write `supabase/migrations/025_brand_kits.sql`
    - Create `public.brand_kits` with columns
      `id uuid primary key default gen_random_uuid()`,
      `org_id uuid not null references organizations(id) on delete cascade`,
      `name text not null`,
      `snapshot jsonb not null default '{}'::jsonb`,
      `created_by uuid not null references auth.users(id) on delete cascade`,
      `created_at timestamptz not null default now()`
    - Create index `brand_kits_org_idx on (org_id, created_at desc)`
    - Enable RLS
    - Create four RLS policies exactly matching the Data Models section's
      SQL — SELECT via `org_members` OR platform admin; INSERT/UPDATE/DELETE
      via `organizations.owner_id = auth.uid()` OR platform admin
    - Include `comment on table` documenting the RLS truth-table
    - _Requirements: 9.1, 9.2, 9.6, 9.7, 11.3_
  - [x] 1.3 Regenerate `src/integrations/supabase/types.ts`
    - Add the new `event_creatives.customization` field and the new
      `brand_kits` table to `Database["public"]["Tables"]` — follow the
      Creative_AI_Backgrounds spec's hand-edit precedent (there is no
      live codegen in this workspace); the new column reads/writes as
      `Json` and the new table's `Row`/`Insert`/`Update` shapes match the
      migration's columns
    - _Requirements: 12.1, 9.1_

- [x] 2. Implement `src/lib/creatives/creative-customization.ts` (pure)
  - [x] 2.1 Define the type surface
    - `SlotKey`, `CustomPromptSlotType`, `CustomPromptSlot`, `SlotOverride`,
      `PositionNudge`, `OverlayDim`, `OverlayGradient`, `OverlayBlurRegion`,
      `BackgroundOverlay`, `WatermarkConfig`, `BorderDropShadow`,
      `BorderStyle`, `CustomCreativeTemplate`, `CustomizationConfig`,
      `AppliedBrandKit`
    - Every field matches Requirement 12.2's shape verbatim (JSON-shaped)
    - Export the constants `MIN_FONT_SIZE_PX = 10`, `NUDGE_MAX_PCT = 20`,
      `BORDER_THICKNESS_MAX_PX = 40`
    - _Requirements: 1.2, 2.1, 3.1, 5, 6.1, 7.1, 8, 9.2, 12.2_
  - [x] 2.2 Implement `isEmptyCustomization`
    - Pure predicate returning `true` iff no field on the config produces
      any additional/overriding `PlanElement` — used by every hook point
      to short-circuit
    - _Requirements: 14.1_
  - [x] 2.3 Implement `clampNudge`, `applyNudgeToBox`, `clampBorder`,
    `resolveWatermarkBox`
    - All pure; each satisfies its Property 42.x invariant unconditionally
      via a final safe-area clamp (defense in depth even if inputs are
      well-behaved)
    - `resolveWatermarkBox` uses a `5%` margin from the canvas edge on
      every corner and returns a square box sized off `min(w, h)` short
      side
    - _Requirements: 3.2, 3.3, 6.5, 7.3_
  - [x] 2.4 Implement `resolveEffective`
    - Enforces Property 44 precedence per field:
      Entity_Template_Override → `snapshotTemplate` → base template;
      `slotOverrides.color`/`fontFamily` per-slot → Brand_Kit → theme →
      template defaults;
      watermark URL from `Customization_Config.watermark.uploadedLogoUrl` →
      `organizations.logo_url` → undefined
    - Pure — never touches Supabase
    - _Requirements: 2.6, 6.2, 9.4, 9.5, 10.3_
  - [x] 2.5 Implement `decoratePlanWithCustomization`
    - Short-circuits on `isEmptyCustomization(config)` — returns the
      input plan reference unchanged (this is where Property 45 is
      structurally guaranteed)
    - Otherwise splits `plan.elements` into `background` + `images` +
      `texts` + `divider` groups, applies `slotOverrides` and
      `positionNudges` to the text elements (via `applyNudgeToBox`),
      appends `overlay-dim` / `overlay-gradient` / `overlay-blur-region`
      elements between `background` and `images`, appends
      Custom_Prompt_Slot text elements after the base spec's text slots,
      then appends `watermark` (when a resolved URL exists) and `border`
      (when configured, using `clampBorder`)
    - Pure — returns a new `RenderPlan` object; never mutates the input
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2,
      3.3, 3.4, 3.5, 5.1, 5.5, 5.6, 6.1, 6.3, 6.6, 7.1, 7.4_
  - [x] 2.6 Implement `parseCustomization`
    - Pure defensive validator that takes an untyped `Json` blob (as
      returned from Supabase) and returns a `CustomizationConfig` with
      malformed fields dropped and logged via `logger.warn`
    - Preserves forward-compatibility so newer clients writing extra
      fields don't crash older clients reading them back
    - _Requirements: 12.1, 12.3, 14.3_
  - [x] 2.7* Write property tests for the pure customization layer
    - `src/lib/creatives/__tests__/property-41-custom-prompt-slot-additive.pbt.test.ts`
      **Property 41: Custom_Prompt_Slot addition is additive to base plan**
      **Validates: Requirements 1.1, 1.4, 1.6, 14.1**
    - `src/lib/creatives/__tests__/property-42-bounds-invariants.pbt.test.ts`
      **Property 42: Bound + floor invariants for nudge / font / watermark / border** (four sub-suites)
      **Validates: Requirements 1.3, 3.2, 3.3, 6.5, 7.3**
    - `src/lib/creatives/__tests__/property-43-overlay-z-order.pbt.test.ts`
      **Property 43: Background_Overlay z-order**
      **Validates: Requirements 5.1, 5.5, 5.6**
    - `src/lib/creatives/__tests__/property-44-resolution-precedence.pbt.test.ts`
      **Property 44: Resolution_Precedence is a strict, transitive per-field ordering**
      **Validates: Requirements 2.6, 6.2, 9.4, 9.5, 10.3**
    - `src/lib/creatives/__tests__/property-45-additivity-invariant.pbt.test.ts`
      **Property 45: Additivity_Invariant against base spec**
      **Validates: Requirements 1.6, 2.6, 3.5, 4.4, 5.5, 6.6, 7.4, 10.6, 14.1, 14.3, 14.4**
    - Each `fc.assert(..., { numRuns: 100 })`; each file header carries
      `// Feature: creative-customization, Property N: <title>` +
      `// Validates: Requirements X.Y, ...`
    - _Requirements: as noted per property_

- [x] 3. Implement `src/lib/creatives/brand-kits.ts`
  - [x] 3.1 Define types and pure builders
    - `BrandKitRow` (matches Data Models), `buildBrandKitRecord`
      (pure `INSERT` payload builder), `readBrandKitSnapshot` (pure —
      converts a row into the `AppliedBrandKit` shape used by
      `resolveEffective`)
    - _Requirements: 9.1, 9.2_
  - [x] 3.2 Implement Supabase CRUD wrappers
    - `fetchBrandKits(orgId)` — never throws, logs on error, returns
      `[]` on failure (mirrors `fetchEventCreativeBackgrounds`)
    - `createBrandKit(record)` — logs and returns null on failure
    - `deleteBrandKit(id)` — logs and returns false on failure
    - RLS is the real security boundary; these helpers assume the caller
      is authorized (client-side gate via
      `isAuthorizedForEventCreatives` where applicable)
    - _Requirements: 9.6, 9.7, 9.8_
  - [x] 3.3* Write property test for Brand_Kit RLS scope
    - `src/lib/creatives/__tests__/property-48-brand-kit-rls.pbt.test.ts`
      **Property 48: Brand_Kit RLS scope invariants**
      **Validates: Requirements 9.6, 9.7, 11.3**
    - Follows the base-spec Property 19's pattern for RLS assertions
      (Postgres integration test if a `@testcontainers` harness is
      available, else documented as a manual truth-table verification
      against a shared Supabase project — matching how the base spec
      handles Property 19)
    - _Requirements: 9.6, 9.7, 11.3_

- [x] 4. Extend `src/lib/creatives/creative-templates.ts` (additive only)
  - [x] 4.1 Add per-entity template override helpers
    - `readEffectiveTemplateId(config, entityId, creativeType)` — pure;
      returns `perEntity[entityId]` when present, else
      `creativeTemplatePrefs[creativeType]`, else `undefined`
    - `saveEntityTemplateOverride(config, entityId, templateId)` — pure
    - `clearEntityTemplateOverride(config, entityId)` — pure; deletes
      the key rather than storing null so the map stays minimal
    - _Requirements: 10.2, 10.3, 10.5_
  - [x] 4.2 Add Custom_Template persistence helpers
    - `saveCustomTemplate(config, template)` — pure; upserts by `id`
    - `deleteCustomTemplate(config, templateId)` — pure; leaves any
      `event_creatives` rows that reference the id untouched (they
      render via their embedded `snapshotTemplate`, Requirement 8.10)
    - _Requirements: 8.8, 8.10_
  - [x] 4.3 Extend `EventPageConfig` shape in `page-form/types.ts`
    - Add `customCreativeTemplates?: CustomCreativeTemplate[]` (as `unknown[]`
      at the schema module level to avoid an import cycle onto
      `creative-customization.ts` — the same pattern already used for
      `creativeTemplatePrefs` re-declaring its literal union)
    - Add `perEntity?: Record<string, string>` inside
      `creativeTemplatePrefs`
    - Extend `normalizeConfig`'s legacy-format branch and forward-merge
      path to preserve both fields identically to
      `creativeTemplatePrefs` / `brochurePrefs`
    - _Requirements: 8.8, 10.2, 14.3_
  - [x] 4.4* Write property test for per-entity template precedence
    - `src/lib/creatives/__tests__/property-46-entity-template-precedence.pbt.test.ts`
      **Property 46: Entity_Template_Override precedence in batch runs**
      **Validates: Requirements 10.3, 10.6**
    - _Requirements: 10.3, 10.6_

- [x] 5. Extend `src/lib/creatives/creative-renderer.ts` (additive only)
  - [x] 5.1 Add new `PlanElement` variants
    - `overlay-dim`, `overlay-gradient`, `overlay-blur-region`,
      `watermark`, `border`
    - Every existing `PlanElement` variant remains structurally
      unchanged; the new variants join the discriminated union
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 7.1_
  - [x] 5.2 Implement `drawOverlayDim`, `drawOverlayGradient`,
    `drawOverlayBlurRegion`
    - `drawOverlayDim`: full-canvas `fillRect` with `globalAlpha` for
      opacity
    - `drawOverlayGradient`: `createLinearGradient(...)` with the
      direction converted from degrees to radians using the same
      convention as the base spec's `drawBackground`
    - `drawOverlayBlurRegion`: `getImageData` on the target box, draw
      to an `OffscreenCanvas` with `ctx.filter = "blur(Npx)"`, then
      `drawImage` back into the main canvas — scoped to the box only
      via image data extraction, so speaker photos/sponsor logos
      (drawn afterward per the plan order) are never blurred
      (Requirement 5.4)
    - _Requirements: 5.2, 5.3, 5.4_
  - [x] 5.3 Implement `drawWatermark`
    - Uses base-spec `loadImage` for cross-origin safety; on load
      failure logs `logger.warn("creative watermark load failed",
      { url })` and skips the draw (Requirement 6.3 — no placeholder)
    - Applies `ctx.globalAlpha = el.opacity` for the draw, restores
      afterward
    - _Requirements: 6.1, 6.3, 6.5, 6.6_
  - [x] 5.4 Implement `drawBorder`
    - Applies drop-shadow context settings first (when
      `el.dropShadow`), then strokes a rounded-rect path inset by
      `thicknessPx / 2` from every edge, using `ctx.roundRect` when
      available or the manual `arcTo` fallback (matching
      `drawImageCropped`'s pattern)
    - Restores shadow state after the stroke
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 5.5 Add new switch cases to `drawPlan`
    - `case "overlay-dim":`, `case "overlay-gradient":`,
      `case "overlay-blur-region":`, `case "watermark":`,
      `case "border":`
    - Every base-spec case (`background`, `image`, `text`, `divider`)
      is left byte-identical
    - _Requirements: 5, 6, 7_
  - [x] 5.6 Implement `ensureFontsLoadedForPlan(plan)`
    - Extracts every unique `(fontFamily, fontWeight)` combo from
      plan's `text` elements and awaits
      `document.fonts.load(\`${weight} 16px ${family}\`)` for each
    - Best-effort — silent failure degrades to `sans-serif` fallback
      via `drawTextElement`'s existing font string
    - Called from `drawPlan` before iterating elements (mirrors the
      existing `ensureFontsLoaded` call site)
    - _Requirements: 4.1, 4.3, 4.4_
  - [x] 5.7* Write font-loading property test
    - `src/lib/creatives/__tests__/property-50-font-choices-consistency.pbt.test.ts`
      **Property 50: Font_Choices consistency across UI and renderer**
      **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Extend `src/lib/creatives/creative-storage.ts` (additive only)
  - [x] 6.1 Extend `CreativeAssetInput` and `CreativeAssetRecord`
    - Add `customization?: CustomizationConfig` (optional on input) and
      `customization: Record<string, unknown>` (required on the record,
      defaulted to `{}`)
    - Extend `buildCreativeAssetRecord` to pass through
      `input.customization ?? {}` — every base-spec caller that omits
      the parameter continues to land `{}` in the new column
    - Extend `EventCreativeRow` with `customization: Json`
    - _Requirements: 12.1, 14.3_
  - [x] 6.2 Implement `uploadWatermarkLogo`
    - `watermark-logos/{org_id}/{filename}` in the existing
      `site-assets` bucket; same upsert-safe pattern as
      `uploadCreativeAsset`; returns `{ url, storagePath }`
    - _Requirements: 6.4, 11.4_
  - [x] 6.3* Write property test for the customization round-trip
    - `src/lib/creatives/__tests__/property-47-customization-round-trip.pbt.test.ts`
      **Property 47: Customization_Config round-trip**
      **Validates: Requirements 8.10, 9.8, 12.3, 12.4, 12.5**
    - Tests `parseCustomization(JSON.parse(JSON.stringify(config)))`
      semantic equivalence, plus the render-plan determinism check
    - _Requirements: 8.10, 9.8, 12.3, 12.4, 12.5_

- [x] 7. Build `src/components/event/creatives/CustomizationPanel.tsx`
  - [x] 7.1 Scaffold the panel shell
    - Local `customization: CustomizationConfig` state (default `{}`);
      `onChange` callback exposed to parent; 400ms debounce shared with
      the base-spec preview refresh
    - Collapsible sections mirroring `EventPageForm.tsx`'s inspector
      pattern: Custom Prompts, Slot Overrides, Position Nudges,
      Background Overlay, Watermark, Border, Custom Template, Brand Kit,
      Entity Override
    - _Requirements: 13.1, 13.2_
  - [x] 7.2 Implement the Custom Prompt Slots section
    - `@dnd-kit/sortable` list of slot cards; "Add slot" opens a
      type-picker; on `type === "eventDate"` pre-populates `text` using
      `@/lib/datetime`'s existing helpers with the event's timezone
      (Requirement 1.7)
    - Each card edits `text`, `xPct`, `yPct`, `maxWidthPct`,
      `maxHeightPct`, `fontFamily` (dropdown of `FONT_OPTIONS`),
      `fontWeight`, `baseSizePx`, `color` (`COLOR_SWATCHES` +
      free-form), `align`
    - Delete button removes the slot
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7_
  - [x] 7.3 Implement the Slot Overrides section
    - Enumerates each built-in slot in the current template's
      `textSlots` plus each Custom_Prompt_Slot
    - Per-row color picker (defaulting to the template's built-in
      color) and font-family dropdown (defaulting to
      `effectiveFontFamily`)
    - Color picker uses the shared `COLOR_SWATCHES` palette plus a
      free-form hex input
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 7.4 Implement the Position Nudges section
    - Per-slot sliders for `dxPct` and `dyPct` (both `[-20, 20]`);
      alignment radio group (`left`/`center`/`right`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 7.5 Implement the Background Overlay section
    - Three sub-cards with enable toggles: `Overlay_Dim`
      (color + opacity), `Overlay_Gradient`
      (from + to + direction + opacity), `Overlay_Blur_Region`
      (`boxPct` sliders + `blurRadiusPx`)
    - _Requirements: 5.2, 5.3, 5.4_
  - [x] 7.6 Implement the Watermark section
    - Corner picker (four radio options), opacity slider (0-100),
      size slider (5-30% of short side by UI-side convention — the
      config allows up to 100% but the UI slider caps at 30 for
      sensibility)
    - "Upload custom logo" file input reveals when the org has no
      `logo_url`; on upload calls `uploadWatermarkLogo`
    - _Requirements: 6.1, 6.4_
  - [x] 7.7 Implement the Border section
    - Color picker + thickness slider (0-40 px) + corner radius
      slider (0-`min(w, h) / 2` px) + "Drop shadow" toggle revealing
      color / offsetX / offsetY / blur controls
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 7.8 Implement the Brand Kit section
    - Mounts `BrandKitPicker` inline; on kit application, populates
      the effective theme/font/logo used by the plan build
    - Persists `appliedBrandKitId` and bakes the kit's snapshot into
      the Creative's `Customization_Config` at save time (Requirement
      12.5)
    - _Requirements: 9.3, 9.4, 9.5, 12.5_
  - [x] 7.9 Implement the Entity Override section
    - Shown only when an entity is selected in the parent dialog
    - Template picker scoped to the entity's CreativeType; "Save as
      default for this speaker/sponsor" button; "Clear override"
      button
    - Writes go through `saveEntityTemplateOverride` /
      `clearEntityTemplateOverride` and
      `supabase.from("events").update({ page_config })`
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

- [x] 8. Build `src/components/event/creatives/CustomTemplateBuilder.tsx`
  - [x] 8.1 Scaffold the modal
    - Left inspector list of slots (`@dnd-kit/sortable`); right live
      `<canvas>` preview; bottom slot-inspector panel that appears
      when a slot is selected; header with a name input and Save
      button
    - Fork entry point: any built-in preset or previously-saved
      Custom_Template on the current event
    - _Requirements: 8.1, 8.2_
  - [x] 8.2 Implement the slot inspector
    - Editors for `fontFamily` (`FONT_OPTIONS`), `fontWeight`,
      `baseSizePx`, `color` (`COLOR_SWATCHES` + free-form), `align`,
      `transform`, `xPct`, `yPct`, `maxWidthPct`, `maxHeightPct`
    - _Requirements: 8.3_
  - [x] 8.3 Implement drag-reorder and add/delete Custom_Prompt_Slots
    - `@dnd-kit/sortable` re-orders template text slots
    - "Add prompt slot" mounts the same Custom_Prompt_Slot editor used
      in `CustomizationPanel`
    - "Add image slot" is deliberately disabled — Requirement 8.7
      forbids adding image slots that the CreativeType doesn't already
      support
    - _Requirements: 8.4, 8.5, 8.7_
  - [x] 8.4 Implement background editing
    - Swap between `solid` / `gradient` / `image`, edit colors from
      `COLOR_SWATCHES`, upload a background image via the same
      `site-assets` upload pattern used by the base spec
    - _Requirements: 8.6_
  - [x] 8.5 Implement Save
    - Persists the Custom_Template via `saveCustomTemplate` and
      `supabase.from("events").update({ page_config })`
    - Assigns a fresh `id` on first save; preserves `basedOn` throughout
    - _Requirements: 8.8, 8.9_

- [x] 9. Build `src/components/event/creatives/BrandKitLibrary.tsx`
  - [x] 9.1 Scaffold the panel
    - Lists every kit belonging to the current org via
      `fetchBrandKits(orgId)`; sorted most-to-least recently created
    - Row: color-swatch preview + font name + small logo thumbnail
    - _Requirements: 9.3_
  - [x] 9.2 Implement create + delete flows
    - "New brand kit" opens a form dialog capturing name +
      snapshot fields; on save calls `createBrandKit`
    - Row delete button (gated by `isAdmin || isOwner` client-side —
      RLS is the real boundary per Property 48) calls `deleteBrandKit`
    - Toast on success + failure via `sonner`
    - _Requirements: 9.1, 9.2, 9.6, 9.7, 9.8_

- [x] 10. Build `src/components/event/creatives/BrandKitPicker.tsx`
  - [x] 10.1 Implement the picker
    - Compact `<Select>` dropdown of kits fetched via
      `fetchBrandKits(orgId)`; on pick, callbacks with the picked
      kit's `AppliedBrandKit` shape (via `readBrandKitSnapshot`)
    - "Clear applied kit" option available at the top of the list
    - _Requirements: 9.3, 9.4, 9.5_

- [x] 11. Build `src/components/event/creatives/EntityTemplateOverrideEditor.tsx`
  - [x] 11.1 Implement the editor
    - Reads the current effective template via
      `readEffectiveTemplateId`; renders a template picker scoped to
      templates compatible with the entity's CreativeType (built-in +
      Custom_Template)
    - "Save as default" button writes via
      `saveEntityTemplateOverride`; "Clear override" writes via
      `clearEntityTemplateOverride`
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

- [x] 12. Wire customization into `CreativeGeneratorDialog.tsx`
  - [x] 12.1 Mount `CustomizationPanel` alongside the existing settings
    - Add a "Customize" tab or expandable panel; local `customization`
      state fed to the panel; `onChange` updates state
    - Preserve every existing tab/panel — mounting is purely additive
    - _Requirements: 13.1, 13.2_
  - [x] 12.2 Route customization through the render pipeline
    - Before calling `renderXCreative`, call `resolveEffective` with
      the current config + applied Brand_Kit + per-entity override,
      then `buildXPlan(entity, effective.template, format,
      effective.theme)`, then `decoratePlanWithCustomization(plan,
      config, effective)`, then `drawPlan` + `canvas.toBlob`
    - Live preview uses the same code path (Property 49)
    - _Requirements: 13.1, 13.2, 14.4_
  - [x] 12.3 Persist customization on save
    - Bake the applied Brand_Kit's snapshot + any Custom_Template
      snapshot into the persisted `CustomizationConfig` before
      calling `insertCreativeAssetRecord` (Property 47 round-trip)
    - _Requirements: 12.3, 12.4, 12.5_

- [x] 13. Wire customization into `BatchCreativeGeneratorDialog.tsx`
  - [x] 13.1 Mount `CustomizationPanel` for the batch run
    - Same `CustomizationPanel` mounted once and applied to every
      entity in the batch (the "shared config across the batch"
      convention)
    - _Requirements: 13.1_
  - [x] 13.2 Route per-entity template override through the batch loop
    - Before each entity render, resolve template via
      `readEffectiveTemplateId(config, entity.id, creativeType)` and
      use that template
    - Every stage after resolution is base-spec-unchanged
    - _Requirements: 10.3, 10.6, 14.4_
  - [x] 13.3* Write Preview_Parity property test
    - `src/lib/creatives/__tests__/property-49-preview-parity.pbt.test.ts`
      **Property 49: Preview_Parity between live canvas and exported PNG**
      **Validates: Requirements 13.1, 13.2, 13.3, 13.4**
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 14. Mount `BrandKitLibrary` in `CreativesSection.tsx`
  - [x] 14.1 Add a "Brand kits" tab
    - Alongside the existing "Creatives" and "AI backgrounds" tabs;
      lazy-loaded like `CreativesSectionLazy`
    - _Requirements: 9.3_

- [x] 15. Final checkpoint — run every gate
  - [x] 15.1 Run tests, lint, build
    - `bun run test --run` — must pass every existing base-spec
      property test (Properties 1-19), every AI-backgrounds property
      test (Properties 20-23), every brochure property test
      (Properties 24-40), and every new customization property test
      (Properties 41-50)
    - `bun run lint` — must be clean (no new errors introduced)
    - `bun run build` — must succeed
    - This checkpoint is where Additivity_Invariant (Property 45) is
      empirically validated: if any base-spec test regresses, revert
      and revisit the extension that caused it
    - _Requirements: 14.1, 14.4_

## Notes

- **Additivity is structural, not aspirational.** Every hook point
  (`isEmptyCustomization`, `decoratePlanWithCustomization`) short-circuits
  when its config field is absent, so Property 45 (Additivity_Invariant)
  is guaranteed by construction. Task 15's checkpoint proves this
  empirically: if any of Properties 1-40 regresses, revert the last
  extension and revisit.
- **Base-spec signatures are frozen.** No file in
  `src/lib/creatives/creative-templates.ts`,
  `src/lib/creatives/creative-renderer.ts`, or
  `src/lib/creatives/creative-storage.ts` may rename an export, remove an
  export, or change the arity of any existing signature. Every new symbol
  is added alongside the existing ones. `CreativeAssetInput` gains an
  optional `customization` field; every base-spec caller that omits it
  continues to work.
- **Property numbering is fixed.** Properties 41-50 are unique to this
  spec (base spec = 1-19, AI backgrounds = 20-23, brochure = 24-40). Never
  reuse an existing number.
- **Migrations require `supabase db push` (or manual paste into the SQL
  editor) after landing.** Task 15's checkpoint assumes migrations
  `024_event_creatives_customization.sql` and `025_brand_kits.sql` have
  been applied to the target Supabase. Reference the shipped
  Creative_AI_Backgrounds spec's post-implementation instruction to
  organizers about running the migration.
- **Bun-only.** Use `bun run test --run`, `bun run lint`, `bun run build`.
  Never `npm` or `pnpm`.
- **`console.*` is banned.** ESLint enforces `no-console: error` — use
  `logger` from `@/lib/observability`.
- **`supabase.rpc` is banned.** Use `supabaseRpc` from
  `@/lib/observability`. This spec's Supabase calls are all
  `.from(...).insert/select/update/delete` (no RPCs).

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4"] },
    { "wave": 4, "tasks": ["5", "6"] },
    { "wave": 5, "tasks": ["7", "8", "9", "10", "11"] },
    { "wave": 6, "tasks": ["12", "13", "14"] },
    { "wave": 7, "tasks": ["15"] }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": ["1"],
    "4": ["2"],
    "5": ["2"],
    "6": ["2"],
    "7": ["2", "3", "4", "5", "6"],
    "8": ["4"],
    "9": ["3"],
    "10": ["3"],
    "11": ["4"],
    "12": ["7", "8", "10", "11"],
    "13": ["7", "10", "11"],
    "14": ["9"],
    "15": ["12", "13", "14"]
  }
}
```
