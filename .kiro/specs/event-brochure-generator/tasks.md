# Implementation Plan: Event Brochure Generator

Convert the feature design into a series of prompts for a code-generation LLM
that will implement each step with incremental progress. Make sure that each
prompt builds on the previous prompts, and ends with wiring things together.
There should be no hanging or orphaned code that isn't integrated into a
previous step. Focus ONLY on tasks that involve writing, modifying, or
testing code.

## Overview

Implementation proceeds bottom-up, matching the plan-builder/renderer split
described in the design: the `EventPageConfig` type extension first (no
migration needed — `page_config` is already `jsonb`), then the pure
`brochure-templates.ts` theme/layout/image-fit logic with its property
tests, then the pure `brochure-sections.ts` per-section content builders
with their property tests, then the imperative `brochure-pdf.ts`
`jsPDF`/`jspdf-autotable`/`qrcode` assembly layer with its unit/smoke tests,
then the three new UI components
(`BrochureSectionList`, `BrochurePreviewFrame`, `BrochureConfiguratorDialog`),
and finally the sidebar entry-point wiring into `EventDetailPage.tsx`,
closed out by a final checkpoint that runs the full test/lint/build gate.

Every task cites the requirement sub-clauses it fulfills. Test sub-tasks are
marked with `*` per project convention and are strictly optional; core
implementation tasks are never optional.

## Tasks

- [x] 1. Extend `EventPageConfig` with `brochurePrefs`
  - [x] 1.1 Add the optional `brochurePrefs` field to `EventPageConfig`
    - In `src/components/event/page-form/types.ts`, add
      `brochurePrefs?: { themeId?: string; colorOverride?: { primaryColor?: string; accentColor?: string; fontFamily?: string }; sectionLayout?: { id: "cover" | "agenda" | "speakers" | "sponsors" | "venueLogistics"; included: boolean }[] }`
      to `EventPageConfig`, mirroring the existing `creativeTemplatePrefs?`
      field exactly (additive, optional, no migration — `page_config` is
      already `jsonb`)
    - Update `normalizeConfig`'s legacy-format branch and forward-merge path
      to preserve `brochurePrefs` the same way it already preserves
      `creativeTemplatePrefs`, so existing saved configs remain valid
    - _Requirements: 7.1_

- [x] 2. Implement `src/lib/brochure/brochure-templates.ts`
  - [x] 2.1 Define core types and the `Brochure_Theme` registry
    - Write `BrochureSectionId`, `CoverStyle`, `BrochureTheme`, and the three
      code-defined `BROCHURE_THEMES` presets ("Classic Editorial", "Modern
      Minimal", "Bold Conference") plus `brochureThemesList()`
    - _Requirements: 1.1_
  - [x] 2.2 Implement `resolveBrochureTheme`
    - Implement the pure precedence resolution (override ?? eventTheme value
      ?? theme's own default) for `primaryColor`, `accentColor`, `fontFamily`,
      never mutating the passed-in `eventTheme` object
    - _Requirements: 1.2, 1.3, 1.4_
  - [x]* 2.3 Write property test for theme resolution
    - **Property 24: Brochure theme resolution with fallback, non-mutating**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  - [x] 2.4 Implement `resolveFontFamilyForPdf`
    - Implement the deterministic bucket mapping from an arbitrary
      `fontFamily` string onto `"helvetica" | "times" | "courier"`,
      defaulting to `"helvetica"`
    - _Requirements: 1.2_
  - [x] 2.5 Re-export `tierAccentColor` and define `TIER_RANK`
    - Re-export `tierAccentColor` unchanged from
      `@/lib/creatives/creative-templates` and define the fixed
      `TIER_RANK` (`platinum: 0, gold: 1, silver: 2, bronze: 3, custom: 4`)
    - _Requirements: 5.2, 5.5_
  - [x]* 2.6 Write property test for sponsor tier accent color mapping
    - **Property 36: Sponsor tier accent color matches the existing tier color mapping**
    - **Validates: Requirements 5.5**
  - [x] 2.7 Implement `fitImageBox`
    - Implement the uniform-scale, never-non-uniformly-stretch image-fit
      helper with the `allowUpscale` option (capped at `1` by default)
    - _Requirements: 4.6, 5.6_
  - [x]* 2.8 Write property test for image fit without upscale
    - **Property 32: Image slot fitting never upscales or non-uniformly stretches**
    - **Validates: Requirements 4.6, 5.6**
  - [x] 2.9 Implement `resolveSectionLayout` and `DEFAULT_SECTION_LAYOUT`
    - Implement the pure Section_Layout resolver (order = render order,
      excluded entries dropped) that will be called identically by the
      preview and export pipelines
    - _Requirements: 7.2, 7.3_
  - [x]* 2.10 Write property test for section layout resolution
    - **Property 39: Section layout resolution preserves order and inclusion exactly**
    - **Validates: Requirements 7.2, 7.3, 8.2**
  - [x] 2.11 Implement `buildBrochureFilename`
    - Implement the filesystem-safe slug + `.pdf` filename builder, falling
      back to `"brochure"` when the title has no alphanumeric characters
    - _Requirements: 9.2_
  - [x]* 2.12 Write property test for brochure filename safety
    - **Property 40: Brochure filename is filesystem-safe and derived from the event title**
    - **Validates: Requirements 9.2**
  - [x] 2.13 Implement `isAuthorizedForBrochureGeneration`
    - Implement the pure owner-or-admin predicate, mirroring
      `isAuthorizedForEventCreatives`'s logic without importing it
    - _Requirements: 10.1, 10.2_
  - [x] 2.14 Implement `saveBrochurePrefs` / `readBrochurePrefs`
    - Implement the pure `EventPageConfig.brochurePrefs` read/write helpers
      used by the "Save as event default" toggle
    - _Requirements: 7.1_
  - [x]* 2.15 Write unit tests for `brochure-templates.ts`
    - Cover `resolveFontFamilyForPdf`'s bucket mapping for every
      `FONT_OPTIONS` entry, `isAuthorizedForBrochureGeneration`'s
      owner/admin/neither cases, and `saveBrochurePrefs`/`readBrochurePrefs`'s
      round-trip
    - _Requirements: 1.2, 7.1, 10.1, 10.2_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `src/lib/brochure/brochure-sections.ts`
  - [x] 4.1 Implement `formatCoverDateRange` and `resolveCoverBackground`
    - Implement the pure date-range formatter and the `image_url` →
      `banner_landscape_url` → theme-default background source resolver
    - _Requirements: 2.2, 2.3, 2.4_
  - [x]* 4.2 Write property test for cover date-range formatting
    - **Property 25: Cover date-range formatting**
    - **Validates: Requirements 2.2**
  - [x]* 4.3 Write property test for cover background source precedence
    - **Property 26: Cover background source precedence**
    - **Validates: Requirements 2.3, 2.4**
  - [x] 4.4 Implement `buildCoverContent`
    - Compose `formatCoverDateRange` and `resolveCoverBackground` into the
      full `CoverContent` structure
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.5 Implement `buildAgendaRows` and `buildAgendaSectionContent`
    - Implement the `start_time`-ascending sort, per-session speaker-line
      omission when unassigned, and the zero-sessions
      `emptyMessage: "No sessions scheduled yet."` fallback (never a
      zero-row table)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x]* 4.6 Write property test for agenda sort order and never-empty-table
    - **Property 27: Agenda rows are sorted by start time and never empty-table**
    - **Validates: Requirements 3.1, 3.4, 3.5**
  - [x]* 4.7 Write property test for agenda missing-speaker handling
    - **Property 28: Agenda row omits missing speaker rather than rendering a broken value**
    - **Validates: Requirements 3.2, 3.3**
  - [x] 4.8 Implement `buildSpeakerRows`
    - Implement the `display_order`-ascending sort, `title` → `designation`
      precedence with omission, independent `company` omission, and the
      `photo_url` present/absent → `{ type: "url" } | { type: "placeholder" }`
      branch
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x]* 4.9 Write property test for speaker sort order
    - **Property 29: Speakers are sorted by display order**
    - **Validates: Requirements 4.1**
  - [x]* 4.10 Write property test for speaker title precedence and omission
    - **Property 30: Speaker row title precedence and missing-field omission**
    - **Validates: Requirements 4.2, 4.4**
  - [x]* 4.11 Write property test for missing speaker photo placeholder
    - **Property 31: Missing speaker photo produces a placeholder, never a broken reference**
    - **Validates: Requirements 4.3**
  - [x] 4.12 Implement `groupSponsorsByTierOrdered`, `buildSponsorRow`, `shouldRenderSponsorsSection`
    - Implement the tier-partitioning (one group per fixed tier, no
      sub-splitting by `tier_label`), `TIER_RANK`-ordered grouping, the
      `logo_url` present/absent → image/text row fallback, and the
      non-empty-sponsors-list inclusion decision
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8_
  - [x]* 4.13 Write property test for sponsor tier partitioning
    - **Property 33: Sponsors are partitioned by tier exactly once**
    - **Validates: Requirements 5.1**
  - [x]* 4.14 Write property test for sponsor tier group ordering
    - **Property 34: Sponsor tier groups are ordered by fixed tier rank**
    - **Validates: Requirements 5.2**
  - [x]* 4.15 Write property test for sponsor row logo-missing fallback
    - **Property 35: Sponsor row logo-missing fallback**
    - **Validates: Requirements 5.3, 5.4**
  - [x]* 4.16 Write property test for sponsors-section inclusion decision
    - **Property 37: Sponsors section renders whenever at least one sponsor exists**
    - **Validates: Requirements 5.7, 5.8**
  - [x] 4.17 Implement `buildVenueLogisticsContent`
    - Implement the pure content-assembly function: include exactly the
      non-empty (post-trim) fields, set `qrCodeSourceUrl` iff `mapEmbedUrl`
      is non-empty, return `null` when `venue`/`location`/`parkingNotes`/
      `transitNotes` are all empty
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x]* 4.18 Write property test for venue content assembly and inclusion
    - **Property 38: Venue section content assembly and inclusion**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
  - [x]* 4.19 Write unit tests for `brochure-sections.ts` edge cases
    - Cover a session with an empty `speakerNames` array vs. `undefined`, and
      a sponsor whose `tier` value doesn't match any known `SponsorTier`
      literal (falls into `"custom"`)
    - _Requirements: 3.2, 3.3, 5.1_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `src/lib/brochure/brochure-pdf.ts`
  - [x] 6.1 Implement `loadImageAsDataUrl`
    - Implement the never-throw `fetch` → `Blob` → `FileReader` data-URL
      converter that resolves `null` on any failure (non-2xx, network error,
      CORS block) and logs via `logger.warn("brochure image load failed", { url })`
    - _Requirements: 2.3, 4.2, 5.3_
  - [x] 6.2 Implement the Cover_Section drawing step inside `buildBrochureDocument`
    - Draw the title, `formatCoverDateRange` output, and the resolved
      background (loaded image via `loadImageAsDataUrl` + `fitImageBox` with
      `allowUpscale: true`, or the theme's `defaultBackgroundColor` fill when
      no image loads) plus the theme's accent bar
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 6.3 Implement the Missing_Data_Placeholder drawing helper
    - Implement the filled-rectangle + centered-initial placeholder used
      wherever a speaker photo is absent or fails to load
    - _Requirements: 4.3_
  - [x] 6.4 Implement `autoTable`-based Agenda_Section and Sponsors_Section rendering
    - Render the Agenda_Section via a single `autoTable` call (or the
      empty-message fallback) and the Sponsors_Section via one `autoTable`
      call per `SponsorTierGroup` (tier heading colored via
      `tierAccentColor`), tracking the `lastAutoTable.finalY` cursor
      convention across groups and relying on `autoTable`'s built-in
      page-break-and-repeat-header behavior; wrap long cell text rather than
      truncating or overlapping
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.5, 5.7, 5.8, 11.1, 11.2_
  - [x] 6.5 Implement the manual-grid Speakers_Section pagination
    - Lay out the fixed-column photo/name/title/company card grid, drawing
      each speaker's photo via `loadImageAsDataUrl` + `fitImageBox` (or the
      Missing_Data_Placeholder helper), tracking a running Y cursor and
      calling `doc.addPage()` when the next card would overflow the page
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 11.1, 11.2_
  - [x] 6.6 Implement the Venue_Logistics_Section drawing step
    - Draw the venue/address text and parking/transit notes from
      `buildVenueLogisticsContent`'s output, and, when `qrCodeSourceUrl` is
      set, generate and draw a QR code via the `qrcode` package, catching and
      logging (`logger.warn("brochure qr code generation failed", { url })`)
      any QR-generation failure without blocking the rest of the page
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 6.7 Implement the section-loop assembly and final page-footer pass
    - Wire `buildBrochureDocument` to call `resolveSectionLayout`, iterate
      the resolved sections calling the matching drawing step from 6.2–6.6,
      invoke `onProgress` once per completed section, insert `doc.addPage()`
      between sections, and — after every section is drawn — run the final
      loop that stamps `"{page} / {totalPages}"` into every page's footer
    - _Requirements: 7.2, 7.3, 7.4, 9.1, 9.3, 9.4_
  - [x] 6.8 Implement `generateBrochurePdf`, `downloadBrochurePdf`, `buildBrochurePreviewUrl`
    - Implement the three public entry points around the shared
      `buildBrochureDocument`: `Blob` export, object-URL browser download
      (filename via `buildBrochureFilename`), and `bloburl` live-preview
      output
    - _Requirements: 8.1, 8.2, 9.1, 9.2_
  - [x]* 6.9 Write unit tests for `loadImageAsDataUrl`
    - Mock `fetch` for the success, non-2xx, and network-throw cases and
      assert the function never throws and resolves `null` on every failure
      path
    - _Requirements: 2.3, 4.2, 5.3_
  - [x]* 6.10 Write a smoke test for `generateBrochurePdf`
    - Using a minimal fixture (one session, one speaker, one sponsor, all
      fields present) and a real (unmocked) `jsPDF` instance, assert the
      returned `Blob` is non-empty and has type `"application/pdf"`
    - _Requirements: 9.1, 9.2, 9.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement `BrochureSectionList`
  - [x] 8.1 Create `src/components/event/brochure/BrochureSectionList.tsx`
    - Implement the `@dnd-kit/sortable` vertical list of the five fixed
      Brochure_Section rows (drag handle + include/exclude `Switch` per row),
      following `SponsorManagement.tsx`'s existing `DndContext`/
      `SortableContext`/`useSortable` pattern; deliberately no controls for
      reordering individual speakers/sponsors/sessions within a section
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 9. Implement `BrochurePreviewFrame`
  - [x] 9.1 Create `src/components/event/brochure/BrochurePreviewFrame.tsx`
    - Implement the `useMemo`-wrapped async `refreshPreview` (deps: theme id,
      override colors/font, Section_Layout, fetched entity data) paired with
      a 400ms-debounced `useEffect`, calling `buildBrochurePreviewUrl`,
      revoking the previous `blob:` URL, and setting the new URL as an
      `<iframe src>`; detect `navigator.pdfViewerEnabled === false` and
      render the "Live preview isn't available on this browser" message with
      an "Open in new tab" fallback button instead
    - _Requirements: 8.1, 8.2_

- [x] 10. Implement `BrochureConfiguratorDialog`
  - [x] 10.1 Implement the dialog's data fetch and initial state hydration
    - On open, fetch the event row (title, dates, venue/location, image
      URLs, `page_config`), `sessions` + `session_speakers` (falling back to
      each session's legacy `speaker_id` and filtering out any dangling
      speaker reference before it reaches `buildAgendaRows`), `event_speakers`
      → `speakers`, and `event_sponsors` → `sponsors`; hydrate initial state
      from `readBrochurePrefs(normalizeConfig(event.page_config))`, falling
      back to `BROCHURE_THEMES[0]` + `DEFAULT_SECTION_LAYOUT` when absent
    - _Requirements: 1.1, 3.2, 3.3, 7.1_
  - [x] 10.2 Implement the theme/override controls and mount the section list and preview
    - Implement the Brochure_Theme picker (3 thumbnails), the color swatch
      and font select overrides (`COLOR_SWATCHES`/`FONT_OPTIONS` from
      `src/components/event/page-form/presets.ts`) applied over the event's
      own theme values without writing back to `EventPageConfig.theme`, and
      mount `BrochureSectionList` and `BrochurePreviewFrame`
    - _Requirements: 1.1, 1.2, 1.4, 8.1, 8.2_
  - [x] 10.3 Implement the generate/download action and "Save as event default"
    - Wire the primary action to `downloadBrochurePdf`, driving a Radix
      `Progress` bar from `onProgress`; wire the "Save as event default"
      toggle to `saveBrochurePrefs` + the existing
      `supabase.from("events").update({ page_config })` path; catch any
      `generateBrochurePdf`/`downloadBrochurePdf` failure, log via
      `logger.error("brochure generation failed", { event_id, error_message })`,
      and surface a `toast.error` while keeping the dialog open
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 11. Wire the Brochure_Generator into the event dashboard
  - [x] 11.1 Add the "Brochure" sidebar tab to `EventDetailPage.tsx`
    - Add the lazy-loaded `BrochureSectionPageLazy` entry (mirroring
      `CreativesSectionLazy`) rendering `BrochureConfiguratorDialog`/the
      brochure section page, computing
      `canAccessBrochure = isAuthorizedForBrochureGeneration(event.user_id, authUser?.id ?? "", isAdmin)`,
      filtering the sidebar nav with
      `!(i.key === "brochure" && !canAccessBrochure)`, and gating the render
      with `activeSection === "brochure" && canAccessBrochure`
    - _Requirements: 10.1, 10.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Run `bun run test --run`, `bun run lint`, and `bun run build` and confirm
    all pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit / property tests) and can be
  skipped for a faster MVP; core implementation tasks are never marked
  optional.
- No component-test task is included for `BrochureSectionList`/
  `BrochureConfiguratorDialog`: this codebase has no existing
  `*.test.tsx` component-test convention under `src/components/` to follow,
  so one was not invented for this feature.
- Every property test task cites the exact property number and title from
  `design.md`'s Correctness Properties section, and every task cites the
  granular requirement sub-clauses it implements.
- The dependency graph below is intentionally near-linear: the type
  extension gates the pure `brochure-templates.ts` layer (its
  `saveBrochurePrefs`/`readBrochurePrefs` operate on `EventPageConfig`),
  which gates `brochure-sections.ts` (uses `TIER_RANK`/`tierAccentColor`),
  which gates the imperative `brochure-pdf.ts` assembly layer, which gates
  the UI. `BrochureSectionList` and `BrochurePreviewFrame` are independent
  files and can be built in parallel once `brochure-pdf.ts` lands, but both
  are required before `BrochureConfiguratorDialog` can mount them.
- Once `tasks.md` is created, open this file and click "Start task" next to
  any task item to begin implementation. This workflow does not implement
  the feature itself.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] },
    { "wave": 8, "tasks": ["8", "9"] },
    { "wave": 9, "tasks": ["10"] },
    { "wave": 10, "tasks": ["11"] },
    { "wave": 11, "tasks": ["12"] }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": ["3"],
    "5": ["4"],
    "6": ["5"],
    "7": ["6"],
    "8": ["7"],
    "9": ["7"],
    "10": ["8", "9"],
    "11": ["10"],
    "12": ["11"]
  }
}
```
