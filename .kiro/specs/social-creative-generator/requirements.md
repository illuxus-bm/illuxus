# Requirements Document

## Introduction

Illuxus organizers currently have no way to produce social/promotional graphics for
speakers and sponsors without a designer. This feature adds a **Creative_Generator**
that auto-populates branded design templates with speaker and sponsor data (photo,
name, title, company, bio / logo, tier) and exports raster images sized for common
social and email platforms — individually, or in batch across every speaker/sponsor
on an event.

The design deliberately follows the pattern already proven by
`src/lib/badge-design.ts` + `src/lib/print-badges.ts` (a declarative
template/element-placement model rendered client-side) rather than introducing a new
server-side rendering service or a third-party design API. Speaker photos and sponsor
logos already live in Supabase Storage (`site-assets` bucket, uploaded via
`SpeakerPhotoUploader` / `SponsorLogoUploader`); `speakers` and `sponsors` already
carry the fields this feature needs (`name`, `title`/`designation`, `company`,
`bio`, `photo_url` / `logo_url`, `tier`).

### Default decisions made during requirements (per investigation)

These resolve the open questions raised in the feature request. Each is a reasonable
default given the existing codebase; flag during review if a different choice is
wanted:

1. **Rendering approach — client-side, canvas-based, not HTML/print.** The existing
   `print-badges.ts` pipeline renders HTML for the *browser print dialog*
   (`window.print()`), which is not usable for producing fixed-pixel-dimension PNG
   files (a LinkedIn post needs to be exactly 1200×627px; print HTML has no
   guaranteed pixel output). This feature instead introduces a new
   **Creative_Canvas_Renderer** that draws directly onto an off-screen `<canvas>`
   element (background, photo/logo `drawImage`, text `fillText`) and exports via
   `canvas.toBlob(...)`, mirroring the manual-canvas-compositing approach already
   used in `CoverCropDialog.tsx`. No new third-party rendering dependency
   (`html2canvas`, `dom-to-image`) is introduced.
2. **No server-side/Edge Function rendering pipeline.** Client-side canvas rendering
   is sufficient at these resolutions and keeps parity with how badges/tickets are
   already generated entirely in-browser.
3. **AI-generated background art is out of scope for this spec.** Only
   solid-color/gradient backgrounds and organizer-uploaded images are supported as
   template backgrounds in this phase. This may be revisited as a later enhancement.
4. **No third-party creative-automation service (Bannerbear, Placid, Canva API).**
   The rendering pipeline is native to this codebase, avoiding external API cost,
   an external dependency, and speaker/sponsor data leaving the platform.
5. **Generated creatives are persisted**, not purely ephemeral. Each successful
   render is uploaded to the existing `site-assets` Storage bucket and recorded in a
   new `event_creatives` table (event, entity, creative type, platform format, asset
   URL), so organizers can revisit a Creative_Library instead of re-rendering every
   time. Template *selection* (which Creative_Template is the default for a given
   creative type on an event) is persisted per-event; Creative_Templates themselves
   are static, code-defined presets (mirroring `NAME_DESIGNS` / `LAYOUT_PRESETS` in
   `badge-design.ts`), not a new database-backed template builder.
6. **Batch generation UX mirrors `PrintBadgesDialog.tsx`**: a settings panel (choose
   template + platform formats) alongside a live preview, with a primary action that
   runs generation across every selected entity and reports progress/failures.

## Glossary

- **Creative_Generator**: The overall feature (UI + rendering pipeline) that
  produces social/promotional raster images for speakers and sponsors on an event.
- **Creative_Template**: A predefined, code-defined layout (background style,
  photo/logo placement, text placement, accent colors) used to render a Creative.
  Distinct templates exist per Creative type (speaker, sponsor, combo).
- **Creative**: A single rendered image output — one entity, rendered with one
  Creative_Template, at one Platform_Format.
- **Creative_Canvas_Renderer**: The client-side rendering engine that composites a
  Creative_Template with Speaker/Sponsor/Event_Theme data onto an off-screen HTML
  `<canvas>` element and exports a raster (PNG) image from it.
- **Platform_Format**: A named output specification with a fixed pixel width and
  height, matching a target social or email surface: LinkedIn Post (1200×627),
  Instagram Post (1080×1080), Instagram Story (1080×1920), Twitter/X Post
  (1600×900), Email Banner (600×200).
- **Speaker_Creative**: A Creative whose primary subject is a single `speakers` row
  (photo_url, name, designation/title, company).
- **Sponsor_Creative**: A Creative whose primary subject is a single `sponsors` row
  (logo_url, name, tier).
- **Combo_Creative**: A Creative that features exactly one Speaker paired with
  exactly one Sponsor on the same image (e.g. "X speaking — presented by Y").
- **Batch_Generator**: The workflow within the Creative_Generator that produces
  Creatives for every Speaker (or every Sponsor) assigned to an event in one
  operation.
- **Creative_Asset**: The persisted result of a successful render — a PNG file in
  the `site-assets` Storage bucket plus a row in the `event_creatives` table
  recording the event, entity, Creative type, Platform_Format, and file URL.
- **Creative_Library**: The UI surface listing an event's existing Creative_Assets.
- **Event_Theme**: The branding values already stored on an Event and its
  Organization (accent/primary colors from `page_config`, `organizations.logo_url`,
  `events.image_url` / `banner_landscape_url`) used to auto-brand a
  Creative_Template's colors and logo placement.
- **Sponsor_Tier**: The existing `sponsors.tier` value (`platinum`, `gold`,
  `silver`, `bronze`, or `custom` with a `tier_label`), each already mapped to an
  accent color in `SponsorManagement.tsx`.

## Requirements

### Requirement 1: Template Selection & Branding

**User Story:** As an event organizer, I want the creative generator to offer
branded design templates for my event, so that I don't need a designer to produce
on-brand promotional graphics.

#### Acceptance Criteria

1. WHEN an organizer opens the Creative_Generator for an event, THE Creative_Generator
   SHALL display the available Creative_Templates for each Creative type
   (Speaker_Creative, Sponsor_Creative, Combo_Creative).
2. WHEN an organizer selects a Creative_Template, THE Creative_Canvas_Renderer SHALL
   populate that template's background and accent colors from the event's
   Event_Theme where an Event_Theme value is defined.
3. WHERE the Event_Theme does not define a color or logo needed by a
   Creative_Template, THE Creative_Canvas_Renderer SHALL use that Creative_Template's
   built-in default color and omit the undefined logo element.
4. WHEN an organizer changes the selected Creative_Template for a Creative type on an
   event, THE Creative_Generator SHALL persist that selection as the event's default
   Creative_Template for that Creative type.

### Requirement 2: Individual Speaker Creative Generation

**User Story:** As an organizer, I want to generate an individual promotional card
for a speaker, so that I can announce them on social media without manual design
work.

#### Acceptance Criteria

1. WHEN an organizer requests a Speaker_Creative for a Speaker, THE
   Creative_Canvas_Renderer SHALL render that Speaker's photo, name, title, and
   company onto the selected Speaker Creative_Template.
2. IF a Speaker has no `photo_url`, THEN THE Creative_Canvas_Renderer SHALL render a
   placeholder initial avatar in place of the photo and SHALL still render the
   Speaker's name, title, and company.
3. IF a Speaker has no title or no company value, THEN THE Creative_Canvas_Renderer
   SHALL omit that field's placement rather than rendering an empty line.
4. THE Creative_Canvas_Renderer SHALL render a Speaker's photo as an unmodified image
   composite, without applying any AI-based or generative alteration to the photo's
   pixels.

### Requirement 3: Individual Sponsor Creative Generation

**User Story:** As an organizer, I want to generate an individual card for a
sponsor showing their logo and tier, so that I can promote and thank sponsors on
social media.

#### Acceptance Criteria

1. WHEN an organizer requests a Sponsor_Creative for a Sponsor, THE
   Creative_Canvas_Renderer SHALL render that Sponsor's logo, name, and Sponsor_Tier
   badge onto the selected Sponsor Creative_Template.
2. IF a Sponsor has no `logo_url`, THEN THE Creative_Canvas_Renderer SHALL render the
   Sponsor's name as styled text in place of the logo image.
3. THE Creative_Canvas_Renderer SHALL render a Sponsor's logo as an unmodified image
   composite, without applying any AI-based or generative alteration, resizing, or
   scaling to the logo's pixels — the logo SHALL be drawn at its native pixel
   dimensions, positioned per the Creative_Template's logo anchor point.
4. WHEN a Sponsor's Sponsor_Tier is rendered, THE Creative_Canvas_Renderer SHALL use
   that tier's associated accent color from the existing sponsor-tier color mapping.

### Requirement 4: Combined "Featuring" Creative Generation

**User Story:** As an organizer, I want a combined creative that pairs a speaker
with a sponsor, so that I can promote sponsor-hosted sessions or sponsored speakers
in a single post.

#### Acceptance Criteria

1. WHEN an organizer selects one Speaker and one Sponsor and requests a
   Combo_Creative, THE Creative_Canvas_Renderer SHALL render both the selected
   Speaker's photo and name and the selected Sponsor's logo and name onto the
   selected Combo Creative_Template.
2. THE Combo Creative_Template SHALL render the Speaker section and the Sponsor
   section as visually distinct regions of the image (e.g. divider line and/or a
   "presented by" label).
3. IF the Speaker or the Sponsor selected for a Combo_Creative is not assigned to the
   current event, THEN THE Creative_Generator SHALL reject the Combo_Creative request
   and SHALL display an explanatory message instead of rendering.

### Requirement 5: Platform Export Formats

**User Story:** As an organizer, I want to export creatives at the correct size for
each social/email platform, so that my posts look correct without manual cropping.

#### Acceptance Criteria

1. THE Creative_Generator SHALL offer the following Platform_Formats: LinkedIn Post
   (1200×627), Instagram Post (1080×1080), Instagram Story (1080×1920), Twitter/X
   Post (1600×900), and Email Banner (600×200).
2. WHEN an organizer selects one or more Platform_Formats for a Creative, THE
   Creative_Canvas_Renderer SHALL render one raster image per selected
   Platform_Format at that Platform_Format's exact pixel width and height.
3. WHEN a Creative_Template is rendered at a Platform_Format whose aspect ratio
   differs from the Creative_Template's authored aspect ratio, THE
   Creative_Canvas_Renderer SHALL reflow or scale the template's element placements
   so that no text, photo, or logo element is cropped or overlaps another element.
4. WHEN a Creative render completes, THE Creative_Generator SHALL make the rendered
   image available for download as a PNG file whose name includes the entity's name
   and the Platform_Format's label.

### Requirement 6: Batch Generation

**User Story:** As an organizer, I want to generate creatives for all speakers (or
all sponsors) at once, so that I don't have to repeat the process for every person
individually.

#### Acceptance Criteria

1. WHEN an organizer starts a Batch_Generator run for "all speakers" on an event, THE
   Batch_Generator SHALL generate a Speaker_Creative for every Speaker currently
   assigned to that event.
2. WHEN an organizer starts a Batch_Generator run for "all sponsors" on an event, THE
   Batch_Generator SHALL generate a Sponsor_Creative for every Sponsor currently
   assigned to that event.
3. THE Batch_Generator SHALL apply the same selected Creative_Template and the same
   selected Platform_Formats to every Creative produced within one Batch_Generator
   run.
4. WHILE a Batch_Generator run is in progress, THE Creative_Generator SHALL display
   the count of Creatives completed out of the total queued for that run.
5. IF rendering fails for one entity within a Batch_Generator run, THEN THE
   Batch_Generator SHALL continue rendering the remaining entities and SHALL report
   which entities failed once the run completes.
6. WHEN a Batch_Generator run completes, THE Creative_Generator SHALL provide a
   single downloadable archive containing every Creative produced by that run.

### Requirement 7: Creative Preview

**User Story:** As an organizer, I want to preview a creative before generating
final exports, so that I can catch layout or branding issues early.

#### Acceptance Criteria

1. WHEN an organizer selects a Creative_Template, an entity, and a Platform_Format,
   THE Creative_Generator SHALL display a live preview reflecting those selections
   before any file is exported.
2. WHEN an organizer changes the Creative_Template, the entity, or the
   Platform_Format while the preview is open, THE Creative_Generator SHALL update the
   live preview to reflect the new selection.

### Requirement 8: Creative Asset Persistence & Library

**User Story:** As an organizer, I want previously generated creatives saved with
the event, so that I can re-download or reuse them later without regenerating.

#### Acceptance Criteria

1. WHEN a Creative render completes successfully, THE Creative_Generator SHALL
   upload the rendered image to Storage and SHALL create a Creative_Asset record
   referencing the event, the entity, the Creative type, and the Platform_Format.
2. WHEN an organizer opens the Creative_Library for an event, THE Creative_Generator
   SHALL list that event's Creative_Asset records ordered from most to least
   recently created.
3. WHEN an organizer deletes a Creative_Asset from the Creative_Library, THE
   Creative_Generator SHALL remove both the stored file and its Creative_Asset
   record.

### Requirement 9: Access Control

**User Story:** As a platform operator, I want creative generation restricted to
authorized organizers, so that speaker and sponsor data isn't exposed to or
manipulated by unauthorized users.

#### Acceptance Criteria

1. THE Creative_Generator SHALL restrict creative generation, batch generation, and
   Creative_Library access for an event to that event's owning organizer and users
   with the admin role.
2. IF a user without organizer or admin access to an event attempts to generate a
   Creative, run a Batch_Generator, or read that event's Creative_Library, THEN THE
   Creative_Generator SHALL deny the request.
3. WHERE a Creative_Asset's rendered file is stored in the existing `site-assets`
   Storage bucket, THE Creative_Generator SHALL apply the same object-level access
   pattern already used for event banners and sponsor logos (public read,
   organizer-scoped write) rather than introducing a new access model.

### Requirement 10: Text Overflow Handling

**User Story:** As an organizer, I want long names, titles, or company names to
still look good on a creative, so that unexpected text length doesn't break the
layout.

#### Acceptance Criteria

1. WHEN a Speaker's or Sponsor's name, title, or company text exceeds the width
   available at its Creative_Template placement, THE Creative_Canvas_Renderer SHALL
   either wrap the text onto an additional line or reduce its font size so the text
   remains fully visible within that element's bounds.
2. THE Creative_Canvas_Renderer SHALL NOT render text that extends beyond the
   Platform_Format's canvas boundaries.
