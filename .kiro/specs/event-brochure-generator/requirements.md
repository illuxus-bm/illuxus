# Requirements Document

## Introduction

Illuxus organizers currently have no way to produce a printable, shareable event
brochure — a multi-page PDF covering the agenda, speakers, sponsors, and venue
logistics — without manually assembling one outside the platform. This feature adds
a **Brochure_Generator** that auto-populates a multi-page, branded PDF from data
already in the platform (`events`, `sessions`, `speakers`/`event_speakers`,
`sponsors`/`event_sponsors`) and lets an organizer pick a design theme, reorder the
generated pages, and lightly restyle colors/fonts before exporting.

This feature follows the architectural precedent of the two prior generator specs
in this codebase — `.kiro/specs/social-creative-generator/` (declarative,
code-defined template model rendered client-side) and
`.kiro/specs/creative-ai-backgrounds/` (strictly additive extension pattern) — but
targets a **paginated, multi-page PDF** output rather than a single fixed-size
raster image. Rather than the "auto-flowing HTML/CSS → PDF" approach floated in the
original feature request, this spec follows the PDF pipeline already proven three
times in this codebase (`src/lib/ticket-pdf.ts`, `src/lib/print-badges.ts`'s
non-print paths, and `src/lib/reports/pdf.ts`): **`jsPDF` + `jspdf-autotable`**,
both already dependencies, with pagination handled by jsPDF's native layout
primitives (`doc.addPage()`, `autoTable`'s automatic page-break-and-repeat-header
behavior) rather than a DOM/HTML rendering engine. No new PDF, HTML-to-PDF, or
headless-browser dependency is introduced, and no server-side rendering job is
introduced — generation is synchronous and client-side, matching every other PDF
feature in the codebase.

### Default decisions made during requirements (per investigation)

These resolve the open questions raised in the feature request and in the
pre-requirements review. Each is a reasonable default given the existing codebase;
flag during review if a different choice is wanted.

1. **Rendering approach: extend the existing `jsPDF` + `jspdf-autotable` pipeline,
   not a new HTML/CSS → PDF renderer.** `jsPDF` is already the dependency used for
   every PDF surface in this codebase (tickets, badges, reports). `jspdf-autotable`
   already provides the exact "auto-flow content across pages, handle variable
   content length" behavior the feature request calls out as its hardest problem —
   it repaginates and repeats headers automatically when a table's body overflows
   a page, which is precisely the 5-speakers-vs-50-speakers problem. Each brochure
   "section" (cover, agenda, speakers, sponsors, venue/logistics) is a section
   builder function that appends content to a shared `jsPDF` document instance and
   returns the Y-cursor position it ended at, mirroring `reports/pdf.ts`'s
   `y = (doc as any).lastAutoTable?.finalY` pattern.
2. **Venue/logistics page renders as text + QR code, not an embedded map image.**
   `events.venue` / `events.location` are plain text; the page-builder's
   `dateVenue.mapEmbedUrl` field is a Google Maps **iframe** embed URL, which
   cannot be rasterized into a PDF client-side without a screenshot/headless-browser
   service. The venue/logistics page instead renders the venue name, address text,
   and (when a map URL is configured) a scannable QR code linking to it — consistent
   with how `ticket-pdf.ts` already uses the `qrcode` package for QR generation. No
   Static Maps API integration is introduced.
3. **Manual reordering is page-type level, not item level.** "Drag reorder
   sections" reorders which of the five page types (Cover, Agenda, Speakers,
   Sponsors, Venue/Logistics) appears in what order and whether it's included at
   all. Reordering individual speakers within the Speakers page or individual
   sessions within the Agenda page is out of scope — those already have an
   established order (`event_speakers.display_order`, `sessions.start_time`) that
   the brochure inherits unchanged.
4. **"Swap colors/fonts" reuses the event's existing theme, not a new picker
   system.** The brochure's color and font inputs are the same
   `EventPageConfig.theme` fields (`primaryColor`, `accentColor`, `fontFamily`)
   already edited via the page builder (`FONT_OPTIONS`/`COLOR_SWATCHES` in
   `src/components/event/page-form/presets.ts`), plus a Brochure_Theme (layout
   preset) selector analogous to the Creative_Template registry in the social
   creative generator spec. No new brand-asset or font-upload system is
   introduced.
5. **Synchronous, client-side generation with a progress indicator — no server-side
   job.** Every other PDF feature in this codebase (`ticket-pdf.ts`,
   `print-badges.ts`, `reports/pdf.ts`) generates entirely in-browser
   synchronously. A brochure with even 50 speakers and 50 sessions is well within
   `jsPDF`'s and `jspdf-autotable`'s synchronous performance envelope (no
   image-heavy layout engine is required), so no Edge Function or background job
   is introduced for this feature.
6. **No persisted Brochure_Library in this spec.** Unlike
   `event_creatives`/Creative_Library from the social creative generator spec,
   generated brochures are not saved to Storage or recorded in a new table in this
   phase — export is an on-demand "configure → preview → download" flow. This may
   be revisited as a later enhancement, mirroring how AI backgrounds were later
   added onto the social creative generator.
7. **Speaker photos and sponsor logos render as unmodified image composites.**
   Consistent with the social-creative-generator spec's Requirements 2.4/3.3, the
   Brochure_Generator SHALL NOT apply any AI-based or generative alteration to
   speaker photo or sponsor logo pixel data — they are placed into the PDF via
   `jsPDF.addImage` unmodified (aside from uniform scale-to-fit, never stretched
   non-uniformly).
8. **Access is organizer/admin-scoped, matching the base creative-generator
   pattern.** Only an event's owning organizer and platform admins can generate or
   configure a brochure for that event, matching Requirement 9 of the
   social-creative-generator spec.

## Glossary

- **Brochure_Generator**: The overall feature (UI + PDF-assembly pipeline) that
  produces a multi-page branded PDF brochure for an event from the event's
  existing agenda, speaker, sponsor, and venue data.
- **Brochure_Theme**: A predefined, code-defined layout preset (cover page style,
  section heading style, table styling for agenda/sponsor listings, page margins)
  used to render a brochure, analogous to a `CreativeTemplate` in the
  social-creative-generator spec. Distinct from the event's `EventPageConfig.theme`
  (colors/fonts), which a Brochure_Theme consumes as input.
- **Brochure_Section**: One of the five page types a brochure can include: Cover,
  Agenda, Speakers, Sponsors, Venue_Logistics. Each Brochure_Section is rendered by
  its own section-builder function against a shared `jsPDF` document instance.
- **Cover_Section**: The first Brochure_Section — event title, dates, and a hero
  image (from `events.image_url` / `banner_landscape_url` when present).
- **Agenda_Section**: The Brochure_Section listing the event's `sessions`, grouped
  and ordered by `start_time`, each row showing time, title, and assigned
  speaker(s).
- **Speakers_Section**: The Brochure_Section listing the event's linked speakers
  (`event_speakers` ordered by `display_order`), each entry showing photo, name,
  title/designation, and company.
- **Sponsors_Section**: The Brochure_Section listing the event's linked sponsors
  (`event_sponsors`), grouped by Sponsor_Tier, each entry showing logo, name, and
  tier.
- **Venue_Logistics_Section**: The Brochure_Section showing the event's venue name,
  address, and (when configured) a QR code linking to the event's map URL.
- **Sponsor_Tier**: The existing `sponsors.tier` value (`platinum`, `gold`,
  `silver`, `bronze`, or `custom` with a `tier_label`), reusing the same tier→
  accent-color mapping already established in `SponsorManagement.tsx` and reused by
  the social-creative-generator spec's `tierAccentColor`.
- **Section_Layout**: The ordered list of Brochure_Sections (which are included,
  and in what order) for a single brochure generation or a saved per-event default.
- **Brochure_Configurator**: The UI surface where an organizer selects a
  Brochure_Theme, edits colors/fonts, reorders/toggles Brochure_Sections, and
  previews the result before export.
- **Missing_Data_Placeholder**: The documented fallback rendering used when
  optional entity data (speaker photo, sponsor logo, title, company, session
  description) is absent, so the brochure never renders broken image references or
  empty text lines.
- **Event_Theme** *(existing, reused)*: The `EventPageConfig.theme` values
  (`primaryColor`, `accentColor`, `fontFamily`) already stored on an event's
  `page_config` and edited via the event page builder.

## Requirements

### Requirement 1: Brochure Theme Selection and Branding

**User Story:** As an event organizer, I want to pick a brochure design theme that
reflects my event's branding, so that I don't need a designer to produce an
on-brand printable brochure.

#### Acceptance Criteria

1. WHEN an organizer opens the Brochure_Configurator for an event, THE
   Brochure_Generator SHALL display the available Brochure_Themes for the
   organizer to choose from.
2. WHEN an organizer selects a Brochure_Theme, THE Brochure_Generator SHALL
   populate that Brochure_Theme's heading and accent colors from the event's
   Event_Theme (`primaryColor`, `accentColor`) and the event's `fontFamily`.
3. WHERE the event's Event_Theme does not define a color needed by the selected
   Brochure_Theme, THE Brochure_Generator SHALL use that Brochure_Theme's built-in
   default color for that value.
4. WHEN an organizer overrides a color or font within the Brochure_Configurator,
   THE Brochure_Generator SHALL apply the override to the generated PDF without
   modifying the event's stored Event_Theme.

### Requirement 2: Cover Page Generation

**User Story:** As an organizer, I want the brochure to open with a branded cover
page, so that attendees immediately recognize the event.

#### Acceptance Criteria

1. THE Cover_Section SHALL render the event's title and start date on the
   brochure's first page.
2. IF the event has an `end_date` distinct from its `date`, THEN THE Cover_Section
   SHALL render the event's date range instead of a single date.
3. IF the event has an `image_url` or `banner_landscape_url` value, THEN THE
   Cover_Section SHALL render that image on the cover page.
4. IF the event has neither an `image_url` nor a `banner_landscape_url` value,
   THEN THE Cover_Section SHALL render the selected Brochure_Theme's default cover
   background instead of an image.

### Requirement 3: Agenda Section Generation

**User Story:** As an organizer, I want the brochure to include the full session
schedule, so that attendees can plan which sessions to attend.

#### Acceptance Criteria

1. WHEN an event's Agenda_Section is generated, THE Brochure_Generator SHALL list
   every `sessions` row belonging to that event ordered by `start_time` ascending.
2. THE Agenda_Section SHALL render each session's title, formatted start and end
   time, and assigned speaker name(s) as one row.
3. IF a session has no assigned speaker, THEN THE Agenda_Section SHALL render that
   session's row without a speaker value rather than an empty or broken reference.
4. WHEN an event's Agenda_Section content exceeds one page, THE Brochure_Generator
   SHALL continue the agenda listing onto additional pages, repeating the section's
   column headers on each new page.
5. IF an event has zero `sessions` rows, THEN THE Brochure_Generator SHALL either
   omit the Agenda_Section from the generated PDF or render it with an explicit
   "no sessions scheduled" message, and SHALL NOT render an empty table.

### Requirement 4: Speakers Section Generation

**User Story:** As an organizer, I want the brochure to showcase the speaker
line-up, so that attendees know who they'll be hearing from.

#### Acceptance Criteria

1. WHEN an event's Speakers_Section is generated, THE Brochure_Generator SHALL
   list every speaker linked to that event via `event_speakers`, ordered by
   `display_order` ascending.
2. THE Speakers_Section SHALL render each speaker's photo, name, and
   title/designation (preferring `title`, falling back to `designation` when
   `title` is absent) and company.
3. IF a speaker has no `photo_url`, THEN THE Speakers_Section SHALL render a
   Missing_Data_Placeholder in place of the photo and SHALL still render that
   speaker's name, title/designation, and company.
4. IF a speaker has no title, no designation, or no company value, THEN THE
   Speakers_Section SHALL omit that field's line for that speaker rather than
   rendering an empty line.
5. WHEN an event's Speakers_Section content exceeds one page, THE
   Brochure_Generator SHALL continue the speaker listing onto additional pages.
6. WHEN a speaker's photo is rendered, THE Speakers_Section SHALL render that
   photo as an unmodified image composite scaled uniformly to fit its layout slot,
   without applying any AI-based, generative, or format-converting alteration to
   the photo's pixels. This requirement does not apply when a
   Missing_Data_Placeholder is rendered in place of a photo.

### Requirement 5: Sponsors Section Generation

**User Story:** As an organizer, I want the brochure to thank and promote
sponsors grouped by tier, so that sponsors receive the visibility their sponsorship
tier earns.

#### Acceptance Criteria

1. WHEN an event's Sponsors_Section is generated, THE Brochure_Generator SHALL
   list every sponsor linked to that event via `event_sponsors`, grouped by
   Sponsor_Tier.
2. THE Sponsors_Section SHALL render Sponsor_Tier groups ordered from highest to
   lowest tier rank (`platinum` → `gold` → `silver` → `bronze` → `custom`).
3. THE Sponsors_Section SHALL render each sponsor's logo and name within its
   Sponsor_Tier group.
4. IF a sponsor has no `logo_url`, THEN THE Sponsors_Section SHALL render that
   sponsor's name as styled text in place of the logo image.
5. WHEN a Sponsor_Tier group is rendered, THE Sponsors_Section SHALL apply that
   tier's associated accent color from the existing sponsor-tier color mapping to
   that group's heading.
6. THE Sponsors_Section SHALL render a sponsor's logo as an unmodified image
   composite scaled uniformly to fit its layout slot, without applying any
   AI-based or generative alteration, or non-uniform stretching, to the logo's
   pixels.
7. IF an event has zero linked sponsors, THEN THE Brochure_Generator SHALL omit
   the Sponsors_Section from the generated PDF rather than rendering an empty
   section.
8. WHERE an event has one or more linked sponsors, THE Brochure_Generator SHALL
   render the Sponsors_Section for that event regardless of how many of those
   sponsors have a `logo_url` value, applying Requirement 5.4's text fallback for
   any sponsor without a logo.

### Requirement 6: Venue and Logistics Section Generation

**User Story:** As an organizer, I want the brochure to include venue and
logistics details, so that attendees know where to go and how to find it.

#### Acceptance Criteria

1. WHEN an event's Venue_Logistics_Section is generated, THE Brochure_Generator
   SHALL render the event's `venue` and `location` values as the venue name and
   address text.
2. WHERE the event's page configuration defines a `dateVenue.mapEmbedUrl` value,
   THE Venue_Logistics_Section SHALL render a QR code encoding that URL.
3. IF the event's page configuration does not define a `dateVenue.mapEmbedUrl`
   value, THEN THE Venue_Logistics_Section SHALL render the venue name and address
   text without a QR code, rather than rendering a broken or empty QR placeholder.
4. WHERE the event's page configuration defines `dateVenue.parkingNotes` or
   `dateVenue.transitNotes` values, THE Venue_Logistics_Section SHALL render those
   values as additional logistics text.
5. IF an event has neither a `venue` value, a `location` value, nor any
   `dateVenue` logistics text configured, THEN THE Brochure_Generator SHALL omit
   the Venue_Logistics_Section from the generated PDF rather than rendering an
   empty section.

### Requirement 7: Section Reordering and Inclusion

**User Story:** As an organizer, I want to reorder or exclude brochure pages
before exporting, so that the brochure's structure matches what I want attendees
to see first.

#### Acceptance Criteria

1. WHEN an organizer opens the Brochure_Configurator, THE Brochure_Generator SHALL
   display the five Brochure_Sections (Cover, Agenda, Speakers, Sponsors,
   Venue_Logistics) in the Section_Layout's current order, each with an
   include/exclude toggle.
2. WHEN an organizer reorders a Brochure_Section within the Brochure_Configurator,
   THE Brochure_Generator SHALL render the generated PDF's pages in that updated
   Section_Layout order.
3. WHEN an organizer excludes a Brochure_Section within the Brochure_Configurator,
   THE Brochure_Generator SHALL NOT render that Brochure_Section's pages in the
   generated PDF.
4. IF an organizer excludes the Cover_Section, THEN THE Brochure_Generator SHALL
   still generate the remaining included Brochure_Sections in their configured
   order.
5. THE Brochure_Configurator SHALL NOT provide controls to reorder individual
   speakers, sponsors, or sessions within a Brochure_Section — item ordering within
   a Brochure_Section SHALL follow the existing `display_order` or `start_time`
   ordering already defined on that data.

### Requirement 8: Live Preview Before Export

**User Story:** As an organizer, I want to preview the brochure before generating
the final PDF, so that I can catch layout, branding, or ordering issues early.

#### Acceptance Criteria

1. WHEN an organizer selects a Brochure_Theme, edits colors/fonts, or changes the
   Section_Layout within the Brochure_Configurator, THE Brochure_Generator SHALL
   update a preview reflecting those selections before any PDF file is exported.
2. THE Brochure_Configurator's preview SHALL reflect the same Section_Layout order
   and included/excluded Brochure_Sections that the exported PDF will contain.

### Requirement 9: PDF Export

**User Story:** As an organizer, I want to download the finished brochure as a
PDF, so that I can share it with attendees or print it.

#### Acceptance Criteria

1. WHEN an organizer requests brochure generation, THE Brochure_Generator SHALL
   assemble the included Brochure_Sections, in Section_Layout order, into a single
   multi-page PDF document.
2. WHEN brochure generation completes, THE Brochure_Generator SHALL make the
   generated PDF available for download as a file whose name includes the event's
   title.
3. WHILE brochure generation is in progress, THE Brochure_Configurator SHALL
   display a progress indicator to the organizer.
4. THE Brochure_Generator SHALL number every page of the generated PDF and SHALL
   display each page's number and the total page count in that page's footer.

### Requirement 10: Access Control

**User Story:** As a platform operator, I want brochure generation restricted to
authorized organizers, so that speaker, sponsor, and event data isn't exposed to
or manipulated by unauthorized users.

#### Acceptance Criteria

1. THE Brochure_Generator SHALL restrict access to the Brochure_Configurator and
   to brochure generation for an event to that event's owning organizer and users
   with the admin role.
2. IF a user without organizer or admin access to an event attempts to open the
   Brochure_Configurator or generate a brochure for that event, THEN THE
   Brochure_Generator SHALL deny the request.

### Requirement 11: Text and Content Overflow Handling

**User Story:** As an organizer, I want long titles, names, or descriptions to
still look correct in the brochure, so that unexpected content length doesn't
break the layout or hide information.

#### Acceptance Criteria

1. WHEN a session title, speaker name, sponsor name, or venue address text exceeds
   the width available at its rendered position, THE Brochure_Generator SHALL wrap
   that text onto additional lines within its cell or block rather than truncating
   or overlapping adjacent content.
2. THE Brochure_Generator SHALL NOT render text that extends beyond a page's
   printable margin.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid
executions of a system — essentially, a formal statement about what the system
should do. Properties serve as the bridge between human-readable specifications and
machine-verifiable correctness guarantees.*

Numbering continues from the highest existing property number in this codebase
(`Property 23`, in `.kiro/specs/creative-ai-backgrounds/design.md`) so property test
files across specs never collide.

### Property 24: Brochure theme resolution with fallback, non-mutating

*For any* Brochure_Theme and any Event_Theme (with any subset of `primaryColor` /
`accentColor` / `fontFamily` defined or undefined, and with any optional per-field
override supplied by the organizer), the theme-resolution function returns the
override when supplied, else the Event_Theme's value when defined, else the
Brochure_Theme's own built-in default — and the input Event_Theme object passed in
is never mutated by this resolution (deep-equal to itself before and after the
call).

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 25: Cover date-range formatting

*For any* `date` and any (possibly absent) `end_date`, the cover date-formatting
function renders a single formatted date when `end_date` is absent or equal to
`date`, and renders a range containing both formatted dates when `end_date` is
defined and differs from `date`.

**Validates: Requirements 2.2**

### Property 26: Cover background source precedence

*For any* combination of a defined/undefined `image_url`, a defined/undefined
`banner_landscape_url`, and a Brochure_Theme's default background, the cover
background-selection function deterministically chooses `image_url` when defined,
else `banner_landscape_url` when defined, else the Brochure_Theme's default
background — and always resolves to exactly one source.

**Validates: Requirements 2.3, 2.4**

### Property 27: Agenda rows are sorted by start time and never empty-table

*For any* list of sessions with arbitrary `start_time` values (including an empty
list), the agenda row-builder produces rows ordered by `start_time` ascending, and
for an empty input list produces either no Agenda_Section or an explicit
"no sessions scheduled" row — never a section marked as a data table with zero
rows.

**Validates: Requirements 3.1, 3.4, 3.5**

### Property 28: Agenda row omits missing speaker rather than rendering a broken value

*For any* session with or without an assigned speaker, building that session's
agenda row never throws, always includes the session's title and formatted time
range, and either includes the assigned speaker's name (when present) or omits the
speaker field entirely (when absent) — never rendering an empty or placeholder
speaker string.

**Validates: Requirements 3.2, 3.3**

### Property 29: Speakers are sorted by display order

*For any* list of speakers linked to an event with arbitrary `display_order`
values, the speaker row-builder produces rows ordered by `display_order`
ascending.

**Validates: Requirements 4.1**

### Property 30: Speaker row title precedence and missing-field omission

*For any* speaker with any subset of `title`, `designation`, and `company` defined
or undefined, building that speaker's row never throws, displays `title` when
defined, else `designation` when `title` is absent and `designation` is defined,
else omits the title/designation line entirely, and independently omits the
company line when `company` is absent — with no line rendering empty text.

**Validates: Requirements 4.2, 4.4**

### Property 31: Missing speaker photo produces a placeholder, never a broken reference

*For any* speaker with `photo_url` present or absent, building that speaker's row
never throws and either includes an image reference to `photo_url` (when present)
or includes a Missing_Data_Placeholder marker (when absent) — never an image
element with a null/undefined URL.

**Validates: Requirements 4.3**

### Property 32: Image slot fitting never upscales or non-uniformly stretches

*For any* image slot box and any natural image width/height (for a speaker photo
or a sponsor logo), the image-fit function returns a box whose width and height
either equal the natural width/height exactly (when it fits within the slot) or
are uniformly downscaled by the same factor on both axes (when it doesn't fit) —
never upscaled beyond native size and never scaled by different factors per axis.

**Validates: Requirements 4.6, 5.6**

### Property 33: Sponsors are partitioned by tier exactly once

*For any* list of sponsors with arbitrary Sponsor_Tier values, grouping those
sponsors by tier produces groups such that every input sponsor appears in exactly
one group matching its own tier, and the union of all groups' sponsors equals the
input list exactly (no sponsor duplicated or dropped).

**Validates: Requirements 5.1**

### Property 34: Sponsor tier groups are ordered by fixed tier rank

*For any* subset of Sponsor_Tier values present among an event's sponsors, the
rendered tier-group order follows the fixed rank
`platinum > gold > silver > bronze > custom`, restricted to only the tiers
actually present, regardless of the input sponsors' original list order.

**Validates: Requirements 5.2**

### Property 35: Sponsor row logo-missing fallback

*For any* sponsor with `logo_url` present or absent, building that sponsor's row
never throws and either includes an image reference to `logo_url` (when present)
or includes the sponsor's name rendered as styled text in place of the logo (when
absent).

**Validates: Requirements 5.3, 5.4**

### Property 36: Sponsor tier accent color matches the existing tier color mapping

*For all* Sponsor_Tier values (`platinum`, `gold`, `silver`, `bronze`, `custom`),
the brochure's tier-heading accent-color function returns the same color as the
existing `TIERS` mapping in `SponsorManagement.tsx` for that tier.

**Validates: Requirements 5.5**

### Property 37: Sponsors section renders whenever at least one sponsor exists

*For any* list of sponsors (including sponsors with and without a `logo_url`),
the Sponsors_Section inclusion decision returns "render" if and only if the list
is non-empty — logo presence/absence never affects the inclusion decision.

**Validates: Requirements 5.7, 5.8**

### Property 38: Venue section content assembly and inclusion

*For any* combination of (possibly absent) `venue`, `location`, `mapEmbedUrl`,
`parkingNotes`, and `transitNotes` values, the venue-section content-assembly
function includes exactly the subset of these fields that are non-empty strings
(a QR-code element only when `mapEmbedUrl` is non-empty), and the
Venue_Logistics_Section inclusion decision returns "render" if and only if at
least one of `venue`, `location`, `parkingNotes`, or `transitNotes` is a non-empty
string.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 39: Section layout resolution preserves order and inclusion exactly

*For any* permutation and any subset (inclusion/exclusion combination) of the five
Brochure_Sections, the layout-resolution function used by both the preview and the
export pipeline produces a resolved section list whose order exactly matches the
configured Section_Layout order and whose membership exactly matches the set of
included sections — no section is added, dropped, or reordered relative to the
configuration, and the preview's resolved list and the export pipeline's resolved
list are identical for the same Section_Layout input.

**Validates: Requirements 7.2, 7.3, 8.2**

### Property 40: Brochure filename is filesystem-safe and derived from the event title

*For any* event title string (including empty strings, unicode characters, and
filesystem-unsafe characters such as `/`, `\`, `:`, `*`, `?`), the filename-building
function returns a string containing no filesystem-unsafe characters, ending in
`.pdf`, and containing a non-empty slugified form of the title as a substring when
the title contains at least one alphanumeric character.

**Validates: Requirements 9.2**

