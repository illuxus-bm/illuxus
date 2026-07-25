# Requirements Document

## Introduction

The **Social_Creative_Generator** (spec `.kiro/specs/social-creative-generator/`,
shipped) auto-produces branded social/promotional graphics for speakers and
sponsors on an event, and the **Creative_AI_Backgrounds** follow-on
(`.kiro/specs/creative-ai-backgrounds/`) added an opt-in Gemini-generated
background source. Both are intentionally opinionated: templates are static
code-defined presets (`SPEAKER_TEMPLATES`, `SPONSOR_TEMPLATES`,
`COMBO_TEMPLATES` in `src/lib/creatives/creative-templates.ts`), the five
default font families are hard-coded per slot, and every speaker on an event
inherits the same event-level `creativeTemplatePrefs`.

This spec — **Creative_Customization** — closes the customization gap. It ports
the fine-grained-control UX conventions already proven by the landing-page
designer (`src/components/event/page-form/EventPageForm.tsx`: 14 section types,
per-section `themeOverride`, drag-reorder via `@dnd-kit/sortable`, font-scale
sliders, `COLOR_SWATCHES`, `FONT_OPTIONS`, `CustomHtmlData`) into the
Creative_Generator, and adds ten organizer-facing customization capabilities:

1. **Custom_Prompt_Slots** — organizer-editable text overlays (headline,
   tagline, event date, quote) added on top of the template's built-in
   `name`/`title`/`company`/`tierBadge` slots.
2. **Slot_Overrides** — per-slot color and font-family overrides for
   individual text slots (in addition to `EventTheme` accent-color resolution).
3. **Position_Nudge** — per-slot alignment override (`left`/`center`/`right`)
   plus a small (x,y) offset expressed as a percentage of the target
   Platform_Format's canvas.
4. **Wider Font_Choices** — expand the current five default families to the
   full `FONT_OPTIONS` list already shipped by the landing-page designer
   (Poppins, Inter, Playfair Display, Merriweather, Roboto, Lato, Open Sans,
   Montserrat, Raleway, JetBrains Mono, Space Grotesk).
5. **Background_Overlay** — a semi-transparent dim overlay, an optional
   direction-controllable linear-gradient overlay, and an optional
   blur-behind-text region — all applied ABOVE the resolved background but
   BELOW every text/image element, to improve legibility over busy backgrounds
   (especially AI-generated ones).
6. **Watermark_Config** — the event's organization logo composited as a
   corner watermark (position, opacity, size). Reuses `organizations.logo_url`
   when set; falls back to a Creative-specific upload when the org has no
   logo.
7. **Border_Style** — a colored outer border (color, thickness, corner
   radius) and an optional drop shadow.
8. **Custom_Template** — organizers fork an existing preset and adjust its
   slots (add/remove/reorder Custom_Prompt_Slots, edit background,
   drag-reorder text slots), then save the result as a per-event, named
   template usable alongside the built-in presets.
9. **Brand_Kits** — org-scoped snapshots of
   `{ primaryColor, accentColor, fontFamily, logoUrl, preferredTemplateIds,
   preferredFormats }` saved under a name and reusable across every event in
   the organization.
10. **Entity_Template_Overrides** — an individual Speaker or Sponsor within an
    event may override the event-level `creativeTemplatePrefs` template
    choice, so batch generation renders that entity with a different template
    without changing the event default.

### Default decisions made during requirements (per investigation)

These resolve the open questions raised in the feature request and captured
during the confirmation round; each is a reasonable default given the
existing codebase, and each is called out here so a reviewer can override it.

1. **Every capability is strictly additive (Additivity_Invariant).** When no
   customization is applied to a Creative, the render output SHALL be
   byte-for-byte identical to what the base Social_Creative_Generator and the
   Creative_AI_Backgrounds specs already produce today. Existing
   `event_creatives` rows persisted before this feature MUST continue to
   render identically; existing tests
   (`src/lib/creatives/__tests__/property-*.pbt.test.ts` — Properties 1-19,
   20-23) MUST continue to pass unchanged.
2. **All state lives on `Customization_Config` — one new JSONB column, not a
   new table per capability.** A single JSONB column `customization` is added
   to `event_creatives` (default `'{}'::jsonb`, nullable-safe) so old rows
   remain valid. Every non-brand-kit customization for a given Creative
   (Custom_Prompt_Slots, Slot_Overrides, Position_Nudges, Background_Overlay,
   Watermark_Config, Border_Style, the Custom_Template's slot delta) is
   serialized into `Customization_Config`. Persisted Creatives are
   re-renderable identically from `Customization_Config` alone (Property 47,
   Round-trip).
3. **Custom_Templates are per-event and stored on
   `events.page_config.customCreativeTemplates`.** Consistent with the base
   spec's decision to persist `creativeTemplatePrefs` on `page_config` rather
   than in a new table (base spec design.md, "Data Models"). Custom_Templates
   are `CreativeTemplate`-shaped values (the same declarative model already
   in `src/lib/creatives/creative-templates.ts`) plus `id`, `name`, and a
   `basedOn: string | null` field pointing at the preset the organizer
   forked. The static preset registry remains code-defined; only forks live
   in `page_config`.
4. **Brand_Kits are org-scoped and shared across `org_members`.** They live
   in a new `brand_kits` table with `org_id`, RLS mirroring the pattern used
   by `communications` (`org_members` join): every member of the org may
   view, apply, and delete kits belonging to that org; owner and admins may
   create. Kits are NOT tied to a single event — they're reusable across
   every event the org owns.
5. **Custom template builder UX is preset-fork + inline slot editor
   (hybrid).** Organizer forks an existing preset (or a previously-saved
   Custom_Template), then edits individual slots via an inspector panel
   (font, color, alignment, transform, size percentages) and can drag-reorder
   or delete slots; adding a brand-new slot is limited to
   Custom_Prompt_Slots. This matches the fidelity of the landing-page
   designer without introducing a from-scratch canvas editor.
6. **Entity_Template_Overrides are stored on
   `events.page_config.creativeTemplatePrefs.perEntity`.** A new nested
   `{ perEntity: { [entityId]: templateId } }` map on the existing
   `creativeTemplatePrefs`, keyed by speaker/sponsor id. Same RLS scope
   (event ownership), same normalize path, no new column or table.
7. **Watermark logo source precedence.** `Watermark_Config` resolves in this
   fixed order: (i) a Creative-specific uploaded logo URL saved into
   `Customization_Config.watermark.uploadedLogoUrl`, else (ii) the
   organization's `organizations.logo_url` when defined, else (iii) no
   watermark rendered — the plan omits the watermark element rather than
   drawing a placeholder box (Property 44, Resolution_Precedence).
8. **Background_Overlay renders between background and content.** Overlays
   are appended as new `PlanElement`s of a new `kind: "overlay"` inserted
   into the plan AFTER `background` and BEFORE any `image`/`text` element.
   This preserves the existing `drawPlan` element ordering and keeps
   photos/logos crisp: overlays never draw over speaker faces or sponsor
   logos, only over the background (Property 43, Overlay_Z_Order).
9. **Position_Nudge units are percentages of Platform_Format canvas.** Base
   spec's percentage-based reflow (Property 9) is already
   resolution-independent — nudges follow the same convention so a saved
   nudge stays visually consistent across every Platform_Format.
   Nudge magnitude is clamped to ±20% on each axis so a nudge can never
   push a slot fully outside its neighbors' authored region
   (Property 42.1, Nudge_Bounds).
10. **Font-size clamp is preserved through customization.** Base spec's text
    fitting (Property 10) is authoritative: after applying every
    Slot_Override and Position_Nudge, `fitText` still runs against the
    resulting slot box, and the minimum font size is a shared constant
    `MIN_FONT_SIZE_PX = 10` in `creative-renderer.ts` — no
    Slot_Override or Position_Nudge is allowed to produce a rendered font
    smaller than `MIN_FONT_SIZE_PX` (Property 42.2, Font_Size_Floor).
11. **AI background stays authoritative when both an AI background and a
    Background_Overlay are configured.** The overlay is composited over the
    AI-generated PNG (Requirement 5.1), not the other way around; the
    `PlanElement` sequence is always
    `background (image or AI) → overlay → images → texts`
    (Requirement 5.4).
12. **Brand_Kit_Resolution_Precedence.** When a Creative renders, its
    effective template + theme + fonts + logo are resolved in this fixed
    order (highest-priority wins per field): Entity_Template_Override →
    `Customization_Config` (Slot_Overrides, Watermark_Config, Border_Style,
    Background_Overlay, Custom_Prompt_Slots, Position_Nudge) → applied
    Brand_Kit → event-level `creativeTemplatePrefs` → `EventTheme` colors
    (base spec Property 1) → Creative_Template built-in defaults
    (Property 44, Resolution_Precedence).
13. **No new external dependencies.** All new features render entirely with
    the existing canvas pipeline — no new npm packages beyond the base
    spec's `fflate` (batch archive) and shadcn primitives already in
    `src/components/ui/`.

## Glossary

- **Creative_Customization**: The feature this spec defines — the ten
  organizer-facing customization capabilities layered on top of the base
  Creative_Generator and Creative_AI_Backgrounds specs.
- **Customization_Config**: The JSONB shape persisted on
  `event_creatives.customization` and used at render time to reproduce
  every non-template, non-theme customization applied to a Creative
  (Custom_Prompt_Slots, Slot_Overrides, Position_Nudges,
  Background_Overlay, Watermark_Config, Border_Style, the applied
  Brand_Kit id when any, and the Custom_Template id when the render used
  a Custom_Template). See Requirement 12 for the shape.
- **Custom_Prompt_Slot**: An organizer-authored text slot added to a
  Creative_Template at render time (headline, tagline, event date, quote,
  or free-form text), rendered alongside the template's built-in
  `name`/`title`/`company`/`tierBadge`/`presentedBy`/`sponsorName` slots.
  Has the same `TextSlot`-shaped positioning, font, color, and alignment
  fields.
- **Slot_Override**: A per-slot override of the color or font-family
  applied to any TextSlot (built-in or Custom_Prompt_Slot). Overrides the
  slot's baked-in color/font AND the `EventTheme`'s accent color when both
  apply (Property 44, Resolution_Precedence).
- **Position_Nudge**: A per-slot (dx, dy) offset expressed as a percentage
  of the target Platform_Format's canvas, applied AFTER `reflowTemplate`
  and BEFORE `fitText`, plus an optional alignment override
  (`left`/`center`/`right`). Bounded to ±20% on each axis so a nudge can
  never fully eject a slot from the canvas (Property 42.1).
- **Font_Choices**: The full set of font families organizers may pick for
  a Creative — identical to the `FONT_OPTIONS` constant already exported
  by `src/components/event/page-form/presets.ts` (Poppins, Inter, Playfair
  Display, Merriweather, Roboto, Lato, Open Sans, Montserrat, Raleway,
  JetBrains Mono, Space Grotesk).
- **Background_Overlay**: A rendered layer composited ABOVE the resolved
  template/AI background and BELOW every image/text element in the plan.
  Comprises up to three sub-parts, each independently enable-able:
  (a) a solid dim rectangle with opacity 0-100% (`Overlay_Dim`);
  (b) a linear gradient with `from`/`to` colors, a `direction` in degrees
      (0-360), and an opacity (`Overlay_Gradient`);
  (c) a rectangular blur-behind-text region with a blur radius in pixels
      and a bounding box in percent-of-canvas (`Overlay_Blur_Region`).
- **Watermark_Config**: The organization-logo watermark configuration —
  a `position` (`top-left`/`top-right`/`bottom-left`/`bottom-right`), an
  `opacity` (0-100%), and a `size` expressed as a percent of the target
  Platform_Format's canvas short side. Its logo URL is resolved from the
  precedence in decision #7. Contains a `uploadedLogoUrl` field for
  Creative-specific uploads when the org has no `logo_url`.
- **Border_Style**: An outer-border configuration on a Creative — a
  `color`, a `thickness` in pixels, a `cornerRadius` in pixels, and an
  optional `dropShadow: { color, offsetX, offsetY, blur }`. Border and
  drop shadow render OUTSIDE every other element of the plan, always
  drawn last so nothing else obscures them.
- **Custom_Template**: An organizer-authored `CreativeTemplate` derived
  from an existing preset (or a previously-saved Custom_Template) by
  drag-reordering slots, editing individual slot properties via the
  inspector, adding Custom_Prompt_Slots, and/or editing the background.
  Persisted on `events.page_config.customCreativeTemplates` as a
  `CreativeTemplate` value augmented with `id: string`, `name: string`,
  and `basedOn: string | null` (the preset id the template was forked
  from, or null when forked from another Custom_Template). Per-event
  scoped.
- **Brand_Kit**: A named snapshot of `{ primaryColor, accentColor,
  fontFamily, logoUrl, preferredTemplateIds, preferredFormats }`. Stored
  in a new `brand_kits` table with `org_id`, `name`, and the snapshot
  JSON. Org-scoped: visible to every `org_members` row of the same org
  (Requirement 9). Applying a Brand_Kit populates the Creative's
  `EventTheme` overrides and default template/format selection without
  changing the event's underlying `page_config`.
- **Entity_Template_Override**: A per-speaker or per-sponsor override of
  the event-level `creativeTemplatePrefs` template choice. Stored on
  `events.page_config.creativeTemplatePrefs.perEntity[entityId] =
  templateId`. Batch generation resolves each entity's effective
  template through this map before falling back to the event-level
  default (Property 44, Resolution_Precedence).
- **Additivity_Invariant**: The system-wide invariant that a Creative
  generated without any Creative_Customization enabled renders
  byte-for-byte identically to a Creative generated by the base
  Social_Creative_Generator (and, when applicable, the
  Creative_AI_Backgrounds) — same `PlanElement` sequence, same
  `ResolvedBox` coordinates, same colors, same fonts.
- **Preview_Parity**: The invariant carried forward from the base spec's
  Requirement 7 — every customization the organizer applies MUST be
  reflected in the live preview canvas before the Creative is exported,
  so no customization is "silent" (visible only in the final PNG).
- **Resolution_Precedence**: The fixed ordering used to compute a
  Creative's effective template, theme colors, fonts, and logo at render
  time (see decision #12 above). Highest-priority wins per field.
- **MIN_FONT_SIZE_PX**: A shared client-side constant (default `10`) in
  `creative-renderer.ts`. No Slot_Override, Custom_Prompt_Slot, or
  Position_Nudge is allowed to produce a rendered font size smaller than
  `MIN_FONT_SIZE_PX` (Property 42.2, Font_Size_Floor).

### Reused terms (defined in prior specs; brought in for reference)

- **Creative_Generator**, **Creative_Template**, **CreativeType**
  (`speaker`/`sponsor`/`combo`), **Creative** — base spec.
- **Creative_Canvas_Renderer**, **PlanElement**, **RenderPlan**,
  **ResolvedBox**, **`fitText`**, **`nativeSizedLogoBox`**,
  **`drawPlan`** — base spec (`src/lib/creatives/creative-renderer.ts`).
- **Platform_Format** — the five presets (`linkedin-post`,
  `instagram-post`, `instagram-story`, `twitter-post`, `email-banner`).
- **EventTheme** — `{ primaryColor?, accentColor?, orgLogoUrl? }` in
  `creative-templates.ts`.
- **EventPageConfig** and **`creativeTemplatePrefs`** — base spec's
  per-event JSON preference persistence path
  (`src/components/event/page-form/types.ts`).
- **AI_Background_Source**, **AI_Background_Asset**, **Style_Preset**,
  **`buildResolvedPrompt`** — `.kiro/specs/creative-ai-backgrounds/`.
- **event_creatives** — the base spec's persisted-render table
  (migration `022_event_creatives.sql`); AI-backgrounds added a
  `metadata` JSONB column (migration `023_creative_ai_backgrounds.sql`).
  Creative_Customization adds a `customization` JSONB column.
- **organizations**, **organizations.logo_url**, **org_members** —
  existing tables (`supabase/migrations/000_full_schema.sql`) already
  used by `OrgContext` and every org-scoped feature.

## Requirements

### Requirement 1: Custom Prompt Text Overlays

**User Story:** As an event organizer, I want to add my own text overlays to
a Creative (headline, tagline, event date, quote) on top of the template's
name/title/company slots, so that the promotional graphic communicates my
event's message beyond the entity's identity.

#### Acceptance Criteria

1. THE Creative_Generator SHALL let an organizer add zero or more
   Custom_Prompt_Slots to a Creative in addition to the Creative_Template's
   built-in text slots.
2. WHEN an organizer adds a Custom_Prompt_Slot, THE Creative_Generator SHALL
   accept a `text` string, a `type` label
   (`headline`/`tagline`/`eventDate`/`quote`/`custom`), a percentage-based
   position `(xPct, yPct)`, a maximum-size box `(maxWidthPct, maxHeightPct)`,
   a `fontFamily` chosen from Font_Choices, a `fontWeight`, a `baseSizePx`,
   a `color`, and an `align` value (`left`/`center`/`right`).
3. WHEN a Custom_Prompt_Slot is rendered, THE Creative_Canvas_Renderer
   SHALL fit the slot's `text` within its box using the base spec's
   `fitText` (Property 10), and IF the resulting rendered font size would
   be less than `MIN_FONT_SIZE_PX`, THEN THE Creative_Canvas_Renderer
   SHALL truncate the text with an ellipsis rather than render below the
   floor.
4. THE Creative_Generator SHALL let an organizer reorder Custom_Prompt_Slots
   relative to each other via drag-reorder, mirroring the drag-reorder UX
   already used for landing-page sections
   (`@dnd-kit/sortable`, `SectionCatalog`).
5. WHEN an organizer deletes a Custom_Prompt_Slot, THE Creative_Generator
   SHALL remove that slot from the render plan.
6. WHEN a Creative is rendered with zero Custom_Prompt_Slots configured,
   THE Creative_Canvas_Renderer SHALL produce output identical to a base
   Creative rendered with the same template, entity, and format
   (Additivity_Invariant).
7. IF the `type` label is `eventDate`, THEN THE Creative_Generator SHALL
   populate the slot's default `text` value with the event's date
   formatted through the existing `@/lib/datetime` helpers (rendered in
   event-local time, per the project's datetime rule) unless the
   organizer has typed a custom value.

### Requirement 2: Per-Slot Color and Font Overrides

**User Story:** As an event organizer, I want to override the color and
font of individual text slots on a Creative, so that I can tune name /
title / tier-badge typography independently of the template's built-in
choices and the event theme's accent color.

#### Acceptance Criteria

1. THE Creative_Generator SHALL let an organizer set a Slot_Override
   `{ color?, fontFamily? }` on any TextSlot key present in the selected
   template (`name`/`title`/`company`/`tierBadge`/`presentedBy`/
   `sponsorName`) or on any Custom_Prompt_Slot on the Creative.
2. WHERE a Slot_Override defines `color` for a slot key, THE
   Creative_Canvas_Renderer SHALL render that slot's text using the
   override's color and SHALL NOT use the template's built-in slot color
   nor the base spec's `resolveAccentColor` result for that slot.
3. WHERE a Slot_Override defines `fontFamily` for a slot key, THE
   Creative_Canvas_Renderer SHALL render that slot's text using the
   override's `fontFamily` and SHALL NOT use the template's built-in
   `fontFamily`.
4. THE Creative_Generator SHALL restrict the `fontFamily` selectable in a
   Slot_Override to the values in the Font_Choices set defined in
   Requirement 4.1.
5. THE Creative_Generator SHALL restrict the `color` selectable in a
   Slot_Override to a valid CSS color string; the color picker SHALL
   surface the same `COLOR_SWATCHES` palette already exported by
   `src/components/event/page-form/presets.ts` in addition to allowing a
   free-form hex value.
6. WHEN a Creative is rendered with no Slot_Overrides configured for a
   slot key, THE Creative_Canvas_Renderer SHALL fall back to the base
   spec's existing color resolution (template built-in color OR
   `resolveAccentColor` when the slot is in
   `themeOverridable.accentTextKeys`) and font-family resolution for
   that slot (Additivity_Invariant).

### Requirement 3: Slot Position Nudge and Alignment Override

**User Story:** As an event organizer, I want to nudge individual slot
positions and change their text alignment, so that I can fine-tune the
Creative's layout beyond the template author's choices without editing
code.

#### Acceptance Criteria

1. THE Creative_Generator SHALL let an organizer set a Position_Nudge
   `{ dxPct?, dyPct?, align? }` on any TextSlot or ImageSlot present in
   the selected template, or on any Custom_Prompt_Slot on the Creative.
2. WHEN a Position_Nudge is applied to a slot, THE
   Creative_Canvas_Renderer SHALL compute that slot's resolved box by
   calling `reflowTemplate` (base spec) FIRST and THEN offsetting the
   resulting `x` by `dxPct/100 * format.width` and `y` by
   `dyPct/100 * format.height`, THEN re-applying the base spec's
   safe-area clamp (`0 <= x` and `x + width <= format.width`; same for
   `y`).
3. THE Creative_Generator SHALL clamp `dxPct` and `dyPct` to the closed
   interval `[-20, 20]` before applying them; a value outside that range
   SHALL be treated as the corresponding boundary value
   (Property 42.1, Nudge_Bounds).
4. WHERE a Position_Nudge's `align` value is defined, THE
   Creative_Canvas_Renderer SHALL render that slot's text horizontal
   alignment using the override value and SHALL NOT use the template
   slot's built-in `align`.
5. WHEN a Creative is rendered with no Position_Nudge configured for a
   slot, THE Creative_Canvas_Renderer SHALL produce that slot's
   `ResolvedBox` exactly as base spec `reflowTemplate` does today, with
   no additional offset applied (Additivity_Invariant).

### Requirement 4: Wider Font Choices

**User Story:** As an event organizer, I want a larger set of font
families available for my Creative (matching what the landing page
designer already offers), so that my creatives look consistent with my
event landing page and don't feel constrained by the five preset fonts.

#### Acceptance Criteria

1. THE Creative_Generator SHALL offer a Font_Choices set containing at
   minimum the eleven font families in
   `FONT_OPTIONS` from `src/components/event/page-form/presets.ts`:
   Poppins, Inter, Playfair Display, Merriweather, Roboto, Lato, Open
   Sans, Montserrat, Raleway, JetBrains Mono, Space Grotesk.
2. WHERE Font_Choices is exposed as a selector in the Creative_Generator
   UI, THE Creative_Generator SHALL source the list from a single shared
   constant (the same `FONT_OPTIONS` value in
   `page-form/presets.ts`) so the two features stay in sync.
3. WHEN a Slot_Override or a Custom_Prompt_Slot selects a font family,
   THE Creative_Canvas_Renderer SHALL render that slot's text with the
   selected font family using the canvas 2D context's `font` string
   `"{fontWeight} {fontSizePx}px \"{fontFamily}\", sans-serif"` so that
   an unloaded custom font degrades to sans-serif rather than to the
   canvas default.
4. THE Creative_Generator SHALL ensure every font in Font_Choices is
   loaded before the Creative_Canvas_Renderer runs its export
   (`canvas.toBlob`), using `document.fonts.load(...)` for each unique
   family/weight combination present in the Creative's plan; this
   guarantees the exported PNG contains the correct glyphs rather than
   the fallback sans-serif for fonts that haven't finished loading in
   the preview canvas.

### Requirement 5: Background Overlays

**User Story:** As an event organizer, I want to add a dim overlay, a
gradient overlay, or a blur-behind-text region on top of the Creative's
background, so that text stays legible even over busy backgrounds
(especially AI-generated ones).

#### Acceptance Criteria

1. WHEN a Background_Overlay is configured on a Creative, THE
   Creative_Canvas_Renderer SHALL composite each of the overlay's
   configured sub-parts (`Overlay_Dim`, `Overlay_Gradient`,
   `Overlay_Blur_Region`) as an additional `PlanElement` inserted
   AFTER the `background` element and BEFORE every `image` and
   `text` element in the render plan (Property 43, Overlay_Z_Order).
2. WHERE `Overlay_Dim.opacity` is defined, THE
   Creative_Canvas_Renderer SHALL render a full-canvas solid rectangle
   in the configured `color` at the configured `opacity` (0-100%),
   where an opacity of 0 SHALL produce no visible overlay and an
   opacity of 100 SHALL fully cover the background.
3. WHERE `Overlay_Gradient` is defined with `from`, `to`, `direction`
   (0-360 degrees, measured clockwise from north), and `opacity`
   (0-100%), THE Creative_Canvas_Renderer SHALL render a linear
   gradient across the full canvas in the configured direction at the
   configured opacity.
4. WHERE `Overlay_Blur_Region` is defined with a `boxPct` in
   percent-of-canvas and a `blurRadiusPx` in pixels, THE
   Creative_Canvas_Renderer SHALL render a blurred copy of the
   background pixels inside the configured box; the blur SHALL be
   applied to a captured region of the background layer only, and
   SHALL NOT be applied to any speaker photo or sponsor logo pixels.
5. WHEN a Creative is rendered with no Background_Overlay configured,
   THE Creative_Canvas_Renderer SHALL emit no additional
   `PlanElement` beyond what the base spec's plan builders produce
   (Additivity_Invariant).
6. WHEN a Creative uses an AI_Background_Source (Creative_AI_Backgrounds
   spec) AND a Background_Overlay is configured, THE
   Creative_Canvas_Renderer SHALL composite the Background_Overlay
   above the AI_Background_Asset and below every image/text
   element (Requirement 5.1 element ordering carried forward).

### Requirement 6: Organizer Logo Watermark

**User Story:** As an event organizer, I want the organizer's logo
composited as a corner watermark on my Creatives, so that every social
graphic is unambiguously associated with my brand without me having to
paste the logo into the template manually.

#### Acceptance Criteria

1. WHEN a Watermark_Config is configured on a Creative, THE
   Creative_Canvas_Renderer SHALL composite an `image` PlanElement
   with the resolved logo URL at the configured `position` corner,
   `opacity` (0-100%), and `size` (percentage of the target
   Platform_Format's canvas short side), inserted AFTER every other
   `image` and `text` element and BEFORE any `border` element.
2. THE Creative_Canvas_Renderer SHALL resolve the Watermark_Config's
   logo URL in this fixed precedence: (1) the Creative's
   `Customization_Config.watermark.uploadedLogoUrl` when defined,
   (2) the organization's `organizations.logo_url` when defined,
   (3) no watermark rendered (Property 44,
   Resolution_Precedence).
3. IF the resolved watermark logo URL is null or undefined, THEN THE
   Creative_Canvas_Renderer SHALL emit no watermark `PlanElement`
   and SHALL NOT draw a placeholder in its place.
4. THE Creative_Generator SHALL let an organizer upload a
   Creative-specific watermark logo when the organization has no
   `logo_url`; the upload SHALL follow the same
   `site-assets`-bucket upload pattern used by
   `SpeakerPhotoUploader` and `SponsorLogoUploader`, stored under a
   `watermark-logos/{org_id}/` prefix.
5. THE watermark's rendered box SHALL be positioned entirely within
   the canvas bounds `[0, format.width] x [0, format.height]` for
   every valid `size` in `(0, 100]` and every valid `position` value
   (Property 42.3, Watermark_Bounded).
6. WHEN a Creative is rendered with no Watermark_Config configured,
   THE Creative_Canvas_Renderer SHALL emit no watermark
   `PlanElement` (Additivity_Invariant).

### Requirement 7: Border and Frame Styles

**User Story:** As an event organizer, I want a colored border around
my Creative (with optional drop shadow), so that my brand's frame
styling shows up on every social/promotional graphic.

#### Acceptance Criteria

1. WHEN a Border_Style is configured on a Creative, THE
   Creative_Canvas_Renderer SHALL emit a `border` PlanElement with
   the configured `color`, `thickness` (pixels), and `cornerRadius`
   (pixels), rendered as the LAST element in the plan so no other
   element obscures it.
2. WHERE `Border_Style.dropShadow` is defined with `color`,
   `offsetX`, `offsetY`, and `blur`, THE Creative_Canvas_Renderer
   SHALL render the drop shadow behind the border but AFTER all
   image/text elements have been drawn.
3. THE Creative_Canvas_Renderer SHALL clamp `Border_Style.thickness`
   to `[0, 40]` pixels and `Border_Style.cornerRadius` to
   `[0, min(format.width, format.height) / 2]` pixels so a border
   configuration can never fully occlude the Creative's content
   (Property 42.4, Border_Bounded).
4. WHEN a Creative is rendered with no Border_Style configured,
   THE Creative_Canvas_Renderer SHALL emit no border `PlanElement`
   (Additivity_Invariant).

### Requirement 8: Custom Template Builder

**User Story:** As an event organizer, I want to build my own layout
template by forking an existing preset and tweaking its slots
(reorder text slots, edit each slot's properties, add
Custom_Prompt_Slots, edit the background), so that my events can
have a distinctive look without me writing code.

#### Acceptance Criteria

1. WHEN an organizer opens the Custom_Template builder, THE
   Creative_Generator SHALL let the organizer choose a starting
   point: any existing preset in `SPEAKER_TEMPLATES` /
   `SPONSOR_TEMPLATES` / `COMBO_TEMPLATES`, or any previously-saved
   Custom_Template on the current event.
2. WHEN an organizer forks a template, THE Creative_Generator SHALL
   copy that template's `CreativeTemplate` value (background,
   `imageSlots`, `textSlots`, `divider`, `themeOverridable`) into a
   new Custom_Template value and SHALL populate its `basedOn` field
   with the source template's `id` (or `null` when the source was
   itself a Custom_Template).
3. THE Custom_Template builder SHALL let the organizer edit each
   TextSlot's `fontFamily` (limited to Font_Choices), `fontWeight`,
   `baseSizePx`, `color`, `align`, `transform`, and its
   percentage-based position/size fields (`xPct`, `yPct`,
   `maxWidthPct`, `maxHeightPct`) via an inspector panel.
4. THE Custom_Template builder SHALL let the organizer drag-reorder
   the TextSlots relative to each other via `@dnd-kit/sortable`.
5. THE Custom_Template builder SHALL let the organizer add or delete
   Custom_Prompt_Slots (following Requirement 1) as part of the
   template itself so those slots persist as part of the template's
   definition rather than as per-Creative overrides.
6. THE Custom_Template builder SHALL let the organizer edit the
   template's background (`CreativeBgStyle`) — swap between
   `solid`/`gradient`/`image`, edit colors from `COLOR_SWATCHES`
   or free-form hex, upload a background image via the same
   `site-assets`-bucket upload pattern used by the base spec.
7. THE Custom_Template builder SHALL NOT let the organizer add
   built-in ImageSlots (`photo`/`logo`/`speakerPhoto`/`sponsorLogo`)
   that don't already exist on the forked source template, because
   the CreativeType determines which image slots are drawn; adding
   an image slot for a type the CreativeType doesn't support would
   render an empty box.
8. WHEN an organizer saves a Custom_Template, THE
   Creative_Generator SHALL persist it to
   `events.page_config.customCreativeTemplates` as a
   `CreativeTemplate & { id, name, basedOn }` value.
9. THE Creative_Generator SHALL make every saved Custom_Template
   selectable in the Creative_Generator's template picker
   alongside the built-in presets, distinguished by a "Custom"
   label.
10. WHEN an organizer deletes a Custom_Template, THE
    Creative_Generator SHALL remove it from
    `events.page_config.customCreativeTemplates` AND SHALL leave
    every `event_creatives` row that references its id
    unchanged; those rows SHALL still render successfully by
    reading the Custom_Template snapshot embedded in each row's
    `Customization_Config.snapshotTemplate` (see Requirement 12.4).

### Requirement 9: Named Brand Kits

**User Story:** As an event organizer, I want to save a named brand
kit (primary color + accent color + font + logo + preferred
templates + preferred formats) at the organization level, so that
every event in my org can apply the same brand look with a single
click.

#### Acceptance Criteria

1. WHEN an organizer creates a Brand_Kit, THE Creative_Generator
   SHALL persist it into a new `public.brand_kits` table with
   `org_id`, `name`, `snapshot` (the Brand_Kit JSON described in
   the Glossary), `created_by`, and `created_at` columns.
2. THE Brand_Kit's `snapshot` JSON SHALL contain the fields
   `primaryColor`, `accentColor`, `fontFamily`,
   `logoUrl`, `preferredTemplateIds` (subset of built-in and
   Custom_Template ids), and `preferredFormats` (subset of the
   five `PlatformFormat` ids).
3. WHEN an organizer opens the Creative_Generator for an event
   owned by their org, THE Creative_Generator SHALL list every
   Brand_Kit belonging to that org sorted from most to least
   recently created.
4. WHEN an organizer applies a Brand_Kit to a Creative, THE
   Creative_Generator SHALL override the Creative's effective
   `EventTheme.primaryColor`, `EventTheme.accentColor`, and
   default `fontFamily` with the Brand_Kit's snapshot values, and
   SHALL populate the Creative's Watermark_Config's resolved
   logo URL from the Brand_Kit's `logoUrl` field IF no
   `Customization_Config.watermark.uploadedLogoUrl` is set on the
   Creative (Property 44, Resolution_Precedence).
5. WHEN a Brand_Kit is applied to a Creative, THE
   Creative_Generator SHALL preselect the first
   `preferredTemplateIds` entry compatible with the Creative's
   CreativeType (speaker/sponsor/combo) as the default template
   and SHALL preselect the `preferredFormats` set as the default
   Platform_Format multi-select.
6. THE `brand_kits` table SHALL enforce row-level security scoped
   so that a member of an org (row exists in `org_members` for
   `(org_id, user_id)`) OR a platform admin may `SELECT` a
   Brand_Kit belonging to that org, but only the org's `owner_id`
   (from `organizations.owner_id`) OR a platform admin may
   `INSERT`, `UPDATE`, or `DELETE` a Brand_Kit.
7. IF a user without membership in a Brand_Kit's org attempts to
   `SELECT` a Brand_Kit from that org, THEN the RLS policy SHALL
   deny the request.
8. WHEN an organizer deletes a Brand_Kit, THE Creative_Generator
   SHALL remove its `brand_kits` row AND SHALL leave every
   `event_creatives` row that recorded its `brand_kit_id` in
   `Customization_Config.appliedBrandKitId` unchanged; those rows
   SHALL still render successfully because Brand_Kit values are
   already baked into the Creative's `Customization_Config` at
   render time.

### Requirement 10: Per-Entity Template Overrides

**User Story:** As an event organizer, I want an individual speaker
or sponsor to be rendered with a different template than the event
default, so that (for example) my keynote can have a bolder card
than the workshop speakers while still being generated in the same
batch run.

#### Acceptance Criteria

1. THE Creative_Generator SHALL let an organizer set an
   Entity_Template_Override for any Speaker or Sponsor linked to
   the event (a row in `event_speakers` or `event_sponsors`),
   choosing any template id available in the Creative_Generator's
   template picker (built-in preset or Custom_Template) for that
   entity's CreativeType.
2. THE Creative_Generator SHALL persist Entity_Template_Overrides
   in `events.page_config.creativeTemplatePrefs.perEntity`, a
   `{ [entityId: string]: string }` map keyed by the entity's
   `speakers.id` or `sponsors.id` and valued by a template id.
3. WHEN a batch generation run
   (`BatchCreativeGeneratorDialog`) renders each entity, THE
   Batch_Generator SHALL resolve each entity's effective template
   by looking up `creativeTemplatePrefs.perEntity[entityId]`
   FIRST and falling back to the event-level
   `creativeTemplatePrefs[creativeType]` when no per-entity entry
   exists (Property 44, Resolution_Precedence).
4. WHEN a Creative is rendered individually
   (`CreativeGeneratorDialog`) after the organizer selects an
   entity that has an Entity_Template_Override, THE
   Creative_Generator SHALL preselect that override's template in
   the template picker while still letting the organizer choose a
   different template for this one render without changing the
   persisted override.
5. WHEN an organizer removes an Entity_Template_Override, THE
   Creative_Generator SHALL delete that entity's key from
   `creativeTemplatePrefs.perEntity` (rather than storing an
   explicit null) so the map stays minimal and the fallback to
   the event-level default is straightforward.
6. WHEN a batch run renders an event whose
   `creativeTemplatePrefs.perEntity` is empty or missing, THE
   Batch_Generator SHALL produce output identical to a base-spec
   batch run using only the event-level default template
   (Additivity_Invariant).

### Requirement 11: Access Control

**User Story:** As a platform operator, I want every customization
capability restricted to authorized organizers (mirroring the base
spec's Requirement 9), so that speaker/sponsor branding decisions
aren't exposed to or manipulated by unauthorized users.

#### Acceptance Criteria

1. THE Creative_Generator SHALL restrict the creation, editing, and
   deletion of Custom_Prompt_Slots, Slot_Overrides, Position_Nudges,
   Background_Overlays, Watermark_Configs, Border_Styles,
   Custom_Templates, and Entity_Template_Overrides on an event to
   that event's owning organizer (`events.user_id = auth.uid()`)
   and to users with the platform `admin` role, using the same
   `isAuthorizedForEventCreatives` predicate exported by
   `src/lib/creatives/creative-storage.ts` (base spec
   Property 19).
2. IF a user without organizer or admin access to an event
   attempts to persist any of the customizations named in 11.1,
   THEN the underlying Supabase call SHALL be rejected by RLS on
   the `events` row (for `page_config`-persisted values) or on
   `event_creatives` (for `customization`-persisted values).
3. THE `brand_kits` table's RLS policies SHALL implement the
   scoping described in Requirement 9.6 and Requirement 9.7.
4. THE Storage upload path `watermark-logos/{org_id}/` SHALL
   reuse the existing `site-assets` bucket's RLS policies (public
   read, authenticated write scoped by `org_members` — mirroring
   how the base spec reuses those policies for
   `event-creatives/{event_id}/`), so no new bucket or new
   storage policy is required.

### Requirement 12: Persistence Shape of Customization_Config

**User Story:** As an event organizer, I want the customizations I
apply to a Creative to be saved with that Creative and reproducible
next time I open it, so that I don't lose my work and my
Creative_Library shows the same visual output as when I generated
it.

#### Acceptance Criteria

1. THE `event_creatives` table SHALL be extended by a new
   `customization jsonb NOT NULL DEFAULT '{}'::jsonb` column via
   a new Supabase migration
   (`024_event_creatives_customization.sql`); the migration SHALL
   set every existing row's `customization` to `'{}'::jsonb`
   without requiring backfill of any other column so old rows
   remain valid.
2. THE `Customization_Config` JSONB shape SHALL contain the
   fields listed below, each optional so a Creative with no
   customization stores `'{}'::jsonb`:
   - `customPromptSlots?: CustomPromptSlot[]`
   - `slotOverrides?: Record<TextSlotKey, { color?: string; fontFamily?: string }>`
   - `positionNudges?: Record<SlotKey, { dxPct?: number; dyPct?: number; align?: "left" | "center" | "right" }>`
   - `backgroundOverlay?: { dim?: { color: string; opacity: number }; gradient?: { from: string; to: string; direction: number; opacity: number }; blurRegion?: { boxPct: [number, number, number, number]; blurRadiusPx: number } }`
   - `watermark?: { position: "top-left" | "top-right" | "bottom-left" | "bottom-right"; opacity: number; sizePct: number; uploadedLogoUrl?: string }`
   - `border?: { color: string; thicknessPx: number; cornerRadiusPx: number; dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number } }`
   - `appliedBrandKitId?: string`
   - `snapshotTemplate?: CreativeTemplate & { id: string; name: string; basedOn: string | null }`
3. WHEN a Creative is rendered from a persisted `event_creatives`
   row, THE Creative_Canvas_Renderer SHALL apply every field
   present in `Customization_Config` in a deterministic order and
   SHALL produce byte-for-byte identical PNG output to the render
   that first persisted the row (Property 47, Round_Trip).
4. WHEN a Custom_Template is used to render a Creative, THE
   Creative_Generator SHALL embed a `snapshotTemplate` copy of
   that Custom_Template into the Creative's
   `Customization_Config`, so the Creative renders identically
   even if the Custom_Template is later deleted from
   `page_config.customCreativeTemplates` (Requirement 8.10).
5. WHEN a Brand_Kit is applied to a Creative, THE
   Creative_Generator SHALL bake the Brand_Kit's snapshot values
   into the Creative's `Customization_Config` (populating
   `slotOverrides` for `fontFamily` when the Brand_Kit specifies
   a `fontFamily`, `watermark.uploadedLogoUrl` when the
   Brand_Kit specifies a `logoUrl` AND no Creative-specific
   watermark upload is set) so the Creative renders identically
   even if the Brand_Kit is later deleted (Requirement 9.8).

### Requirement 13: Live Preview Parity

**User Story:** As an event organizer, I want every customization
I apply to show up in the live preview immediately, so that I
never see a difference between what I preview and what I export.

#### Acceptance Criteria

1. WHEN an organizer changes any Customization_Config field in
   `CreativeGeneratorDialog` or `BatchCreativeGeneratorDialog`,
   THE Creative_Generator SHALL update the live preview
   `<canvas>` (base spec Requirement 7) within the same
   400ms-debounced refresh cycle already used for template and
   entity changes.
2. THE Creative_Generator SHALL render the live preview using
   the SAME plan builder + `drawPlan` code path that the export
   uses, so a customization is impossible to see in the preview
   but absent from the exported PNG (Preview_Parity).
3. WHEN a Brand_Kit is applied in the preview, THE
   Creative_Generator SHALL reflect its effect on the live
   preview `<canvas>` before the organizer confirms the render
   (Preview_Parity).
4. WHEN an AI_Background_Source is generating (Creative_AI
   backgrounds spec), THE Creative_Generator SHALL render the
   pending state consistently with base spec behavior and SHALL
   apply Background_Overlay to the AI background in the live
   preview once the AI asset resolves.

### Requirement 14: Additivity with Base Spec and AI Backgrounds Spec

**User Story:** As a platform maintainer, I want the new
Creative_Customization feature to leave existing behavior
unchanged when no customization is applied, so that every
already-shipped Creative and every base-spec/PBT test continues to
pass unchanged.

#### Acceptance Criteria

1. WHEN a Creative is rendered with `customization = '{}'::jsonb`,
   the applied `brand_kit_id` is null, no Custom_Template is
   selected, and no `perEntity` override applies to the entity,
   THE Creative_Canvas_Renderer SHALL produce a `RenderPlan`
   whose `PlanElement` sequence and coordinates equal the
   `RenderPlan` produced by the base spec's plan builders for
   that (entity, template, format, theme) tuple
   (Additivity_Invariant, Property 45).
2. WHEN a Creative is rendered with `customization = '{}'::jsonb`
   AND the Creative uses an AI_Background_Source, THE
   Creative_Canvas_Renderer SHALL produce a `RenderPlan` equal
   to the Creative_AI_Backgrounds spec's plan for the same
   inputs (extending Property 23 of that spec).
3. THE `event_creatives.customization` migration SHALL default
   every pre-existing row's `customization` to `'{}'::jsonb` so
   fetching and re-rendering a base-spec-era Creative produces
   identical output to what it produced at the time it was
   generated (Additivity_Invariant carried through database).
4. The properties, functions, and types exported today by
   `src/lib/creatives/creative-templates.ts`,
   `src/lib/creatives/creative-renderer.ts`, and
   `src/lib/creatives/creative-storage.ts` (base spec) plus
   `src/lib/creatives/creative-ai.ts` (AI backgrounds spec) SHALL
   NOT be removed or have their signatures changed by this
   feature; new functionality SHALL be exported as new members
   (Additivity_Invariant, source-level).

## Correctness Properties

*Property numbering continues from prior specs: Properties 1-19 are the
Social_Creative_Generator, 20-23 are Creative_AI_Backgrounds, and 24-40 are
Event_Brochure_Generator. This spec starts at 41 so property test files
across specs never collide.*

### Property 41: Custom_Prompt_Slot addition is additive to base plan

*For any* `Speaker` / `Sponsor` / `Combo` entity, any
`CreativeTemplate`, any `PlatformFormat`, any `EventTheme`, and any
list of Custom_Prompt_Slots (including the empty list), building the
render plan with those Custom_Prompt_Slots applied SHALL:

- when the list is empty, produce a plan whose `PlanElement` sequence
  and coordinates equal the base spec's plan for the same inputs
  (Additivity_Invariant);
- when the list is non-empty, produce a plan whose base-spec
  `PlanElement` subset (background, image, text-for-built-in-slots,
  divider) is identical to the base plan's, with one additional
  `text` `PlanElement` appended per Custom_Prompt_Slot in the same
  order the list was authored, each with its configured `fontFamily`,
  `color`, `align`, and resolved position/box.

**Validates: Requirements 1.1, 1.4, 1.6, 14.1**

### Property 42: Bound and floor invariants for nudges, watermark, and border

For every Creative rendered with any combination of
Slot_Overrides, Position_Nudges, Watermark_Config, and Border_Style,
the following four bounds SHALL hold simultaneously.

- **42.1 (Nudge_Bounds)** — *For any* Position_Nudge with any real
  `dxPct` and `dyPct`, the applied nudge SHALL be clamped to the
  interval `[-20, 20]` on each axis before offsetting the slot's
  resolved box; after offsetting and re-clamping to the safe area,
  the slot's `ResolvedBox` SHALL satisfy `0 <= x`,
  `x + width <= format.width`, `0 <= y`,
  `y + height <= format.height`.
- **42.2 (Font_Size_Floor)** — *For any* text slot (built-in TextSlot,
  Custom_Prompt_Slot, and any Slot_Override applied to either) and
  any input text of any length, the rendered font size produced by
  `fitText` SHALL be at least `MIN_FONT_SIZE_PX` (default 10) OR the
  text SHALL be truncated with an ellipsis; the renderer SHALL NEVER
  emit a text `PlanElement` whose `fontSizePx < MIN_FONT_SIZE_PX`.
- **42.3 (Watermark_Bounded)** — *For any* Watermark_Config with any
  valid `position`, any `sizePct` in `(0, 100]`, and any `opacity` in
  `[0, 100]`, the watermark's resolved box SHALL satisfy `0 <= x`,
  `x + width <= format.width`, `0 <= y`,
  `y + height <= format.height` for every `PlatformFormat`.
- **42.4 (Border_Bounded)** — *For any* Border_Style, the effective
  `thickness` used at render time SHALL be clamped to `[0, 40]`
  pixels and `cornerRadius` SHALL be clamped to
  `[0, min(format.width, format.height) / 2]` pixels, so the border
  can never fully occlude the Creative's content on any
  `PlatformFormat`.

**Validates: Requirements 1.3, 3.2, 3.3, 6.5, 7.3**

### Property 43: Background_Overlay z-order

*For any* Creative with any Background_Overlay configuration, the
resulting `RenderPlan.elements` SHALL contain (in order):

1. exactly one `background` element (the base spec's background);
2. zero or more overlay elements
   (`Overlay_Dim`, `Overlay_Gradient`, `Overlay_Blur_Region`), in the
   order (dim, gradient, blur-region) matching the config schema;
3. every image and text `PlanElement` from the base spec's plan;
4. optionally the watermark image `PlanElement`;
5. optionally the border `PlanElement`.

No overlay element SHALL appear before the `background` element and
no overlay element SHALL appear after any `image` or `text` element
of the plan (Requirement 5.1 / Overlay_Z_Order). When the plan is
generated from a Creative whose background is an AI_Background_Asset,
the same ordering holds against the AI-backed background element
(Requirement 5.6).

**Validates: Requirements 5.1, 5.5, 5.6**

### Property 44: Resolution_Precedence is a strict, transitive per-field ordering

*For any* combination of (Entity_Template_Override,
Customization_Config, applied Brand_Kit, event-level
`creativeTemplatePrefs`, `EventTheme`, template built-in default) for
a given render, the effective per-field value SHALL be resolved in
this strict, transitive precedence (highest wins per field):

1. Entity_Template_Override (`creativeTemplatePrefs.perEntity[id]`)
   determines the effective `templateId`;
2. `Customization_Config` fields (`slotOverrides`, `watermark`,
   `border`, `backgroundOverlay`, `customPromptSlots`,
   `positionNudges`, `snapshotTemplate`) determine per-slot color,
   font, position, watermark, border, overlay, and the effective
   template value when `snapshotTemplate` is set;
3. Applied Brand_Kit (`Customization_Config.appliedBrandKitId`)
   populates any `EventTheme` field (`primaryColor`, `accentColor`,
   `fontFamily`, `logoUrl`) that is not overridden by the Creative's
   own `Customization_Config`;
4. Event-level `creativeTemplatePrefs[creativeType]` determines the
   effective `templateId` when no Entity_Template_Override and no
   `snapshotTemplate` are set;
5. `EventTheme` (base spec Property 1) determines each color the
   template marks as `themeOverridable` when no Slot_Override and no
   Brand_Kit set it;
6. `Creative_Template` built-in defaults are used for every field
   left unresolved by the previous steps.

The ordering SHALL be transitive and total: for any two sources of
the same field at different precedence levels, the higher-precedence
source's value wins; two Customization_Config fields never conflict
because each field is single-writer.

**Validates: Requirements 2.6, 6.2, 9.4, 9.5, 10.3**

### Property 45: Additivity_Invariant against base spec

*For any* Creative rendered where every Creative_Customization
condition is false (`customization = {}`, no Custom_Template, no
Brand_Kit, no Entity_Template_Override that applies to the current
entity), the resulting `RenderPlan.elements` sequence and every
`ResolvedBox` in it SHALL be `deep-equal` (structural equality) to
the base spec's plan for the same
`(entity, template, format, theme)` tuple. Under the same
conditions, `renderXCreative(...)` SHALL produce an identical PNG
blob (hash-equal) to what the base spec's renderer produces today
for that tuple.

**Validates: Requirements 1.6, 2.6, 3.5, 4.4, 5.5, 6.6, 7.4, 10.6,
14.1, 14.3, 14.4**

### Property 46: Entity_Template_Override precedence in batch runs

*For any* list of speakers or sponsors and any partial
`perEntity: Record<entityId, templateId>` map, the Batch_Generator's
effective template for each entity SHALL equal
`perEntity[entity.id]` when that key exists, else
`creativeTemplatePrefs[creativeType]`, else the CreativeType's
first preset id in the built-in registry. For every entity not
present in `perEntity`, the resulting `RenderPlan` SHALL be
deep-equal to the base spec's plan (Property 45). For every entity
present in `perEntity` with `perEntity[id] = t`, the resulting
`RenderPlan` SHALL be deep-equal to the base spec's plan when the
event-level default is temporarily replaced by `t`.

**Validates: Requirements 10.3, 10.6**

### Property 47: Customization_Config round-trip

*For any* Creative render produced with a
`Customization_Config` `c`, persisting `c` into
`event_creatives.customization` (as JSON) and later fetching that
row and re-rendering the Creative SHALL produce a PNG blob
hash-equal to the PNG blob produced by the original render. In
particular, JSON round-tripping (serialize → deserialize) SHALL
preserve every field's semantic value, and the render pipeline
SHALL be deterministic in `(entity, template, format, theme,
customization)`.

**Validates: Requirements 8.10, 9.8, 12.3, 12.4, 12.5**

### Property 48: Brand_Kit RLS scope invariants

*For any* user `u`, any org `o`, and any Brand_Kit
`k` with `k.org_id = o`, the `brand_kits` RLS policies SHALL:

- allow `SELECT k` when either (i) a row exists in `org_members`
  with `(user_id, org_id) = (u, o)`, or (ii) `u` has the platform
  `admin` role;
- allow `INSERT`/`UPDATE`/`DELETE` on `k` only when either (i) `u`
  is the org's owner (`organizations.owner_id = u`), or (ii) `u`
  has the platform `admin` role;
- deny every other `(u, k)` pair.

The property SHALL be tested by exhausting the truth-table of the
three predicates
`(is_org_member, is_org_owner, is_platform_admin)` and asserting
the expected allow/deny outcome for each of the four SQL verbs.

**Validates: Requirements 9.6, 9.7, 11.3**

### Property 49: Preview_Parity between live canvas and exported PNG

*For any* Creative and any Customization_Config, the
`RenderPlan` produced for the live preview `<canvas>` in
`CreativeGeneratorDialog` / `BatchCreativeGeneratorDialog` SHALL
be deep-equal to the `RenderPlan` produced when the same Creative
is exported (`renderXCreative(...)` → `canvas.toBlob(...)`);
consequently, the PNG bytes rendered from either plan through
`drawPlan` SHALL be hash-equal.

**Validates: Requirements 13.1, 13.2, 13.3, 13.4**

### Property 50: Font_Choices consistency across UI and renderer

*For any* font family selectable in the Creative_Generator UI (via
Slot_Overrides, Custom_Prompt_Slots, or the Custom_Template
inspector), the value MUST appear in the `FONT_OPTIONS` constant
exported by `src/components/event/page-form/presets.ts`; and *for
any* font family present in a rendered plan's `PlanElement` of
`kind: "text"`, the same family MUST resolve to a loaded
`FontFace` under `document.fonts` (via `document.fonts.load(...)`)
before `canvas.toBlob` is invoked. This property is exercised by
picking every family in `FONT_OPTIONS` at random, generating a
Creative that uses it, and asserting the exported PNG's rendered
glyphs are non-empty (positive test for font loading).

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**
