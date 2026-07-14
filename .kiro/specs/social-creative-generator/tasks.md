# Implementation Plan: Social Creative Generator

## Overview

Implementation proceeds bottom-up: database schema first, then the pure
`creative-templates.ts` layout/theme logic, then the pure `creative-renderer.ts`
plan builders, then the imperative canvas-drawing/export layer, then
`creative-batch.ts`, then the Supabase persistence/authorization layer, and
finally the UI dialogs and their wiring into `EventDetailPage.tsx`. Each layer's
property-based tests are placed immediately after the function they validate so
correctness is confirmed before the next layer builds on top of it.

## Tasks

- [x] 1. Add dependencies and database schema
  - [x] 1.1 Add `fflate` dependency
    - Add `fflate` at exact pinned version `0.8.2` to `package.json` `dependencies` (run `bun add fflate@0.8.2` and commit the lockfile)
    - _Requirements: 6.6_
  - [x] 1.2 Create the `event_creatives` migration
    - Write a new migration file creating `public.event_creatives` (columns, check constraint, index) and its RLS policies exactly as specified in the design's Data Models section, following the `event_speakers`/`event_sponsors` owner-or-admin RLS pattern
    - Grant `SELECT, INSERT, UPDATE, DELETE` to `authenticated`, matching the existing table conventions
    - _Requirements: 8.1, 9.1, 9.2, 9.3_
  - [x] 1.3 Regenerate `src/integrations/supabase/types.ts`
    - Regenerate Supabase types after the migration so `event_creatives` is a typed table (per project convention, this file is never hand-edited)
    - _Requirements: 8.1_
  - [x] 1.4 Extend `EventPageConfig` with `creativeTemplatePrefs`
    - Add the optional `creativeTemplatePrefs?: Partial<Record<CreativeType, string>>` field to `EventPageConfig` in `src/components/event/page-form/types.ts` and ensure `normalizeConfig`'s forward-merge preserves it on old saved configs
    - _Requirements: 1.4_

- [x] 2. Checkpoint - Ensure schema and types compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement `src/lib/creatives/creative-templates.ts`
  - [x] 3.1 Define core types and the `Platform_Format` registry
    - Write `CreativeType`, `PlatformFormatId`, `PlatformFormat`, `PLATFORM_FORMATS` (the five named formats with exact pixel dimensions), `CreativeBgStyle`, `ImageSlot`, `TextSlot`, `CreativeTemplate`
    - _Requirements: 5.1_
  - [x] 3.2 Author the static template presets and `templatesFor`
    - Implement `SPEAKER_TEMPLATES`, `SPONSOR_TEMPLATES`, `COMBO_TEMPLATES` (2-3 presets each) and `templatesFor(type)`
    - _Requirements: 1.1_
  - [x]* 3.3 Write unit tests for the static registries
    - Assert `PLATFORM_FORMATS` matches the five specified formats/dimensions exactly and `templatesFor` returns non-empty arrays for all three types
    - _Requirements: 1.1, 5.1_
  - [x] 3.4 Implement `resolveBackground` and `resolveAccentColor`
    - Implement the theme-fallback resolution functions described in the design (theme value when defined, template default otherwise; omit the logo element when `orgLogoUrl` is undefined)
    - _Requirements: 1.2, 1.3_
  - [x]* 3.5 Write property test for theme resolution
    - **Property 1: Theme resolution with fallback**
    - **Validates: Requirements 1.2, 1.3**
  - [x] 3.6 Implement `tierAccentColor`
    - Re-export the platinum/gold/silver/bronze/custom → color mapping as a single source of truth shared with `SponsorManagement.tsx`'s `TIERS` constant
    - _Requirements: 3.4_
  - [x]* 3.7 Write property test for tier color mapping
    - **Property 5: Sponsor tier accent color mapping**
    - **Validates: Requirements 3.4**
  - [x] 3.8 Implement `reflowTemplate`
    - Implement the percent→pixel reflow with the safe-area clamp described in the design (`x, y >= 0`; `x + width <= targetWidth`; `y + height <= targetHeight`)
    - _Requirements: 5.3_
  - [x]* 3.9 Write property test for reflow containment
    - **Property 9: Reflowed element bounds stay within canvas**
    - **Validates: Requirements 5.3**
  - [x] 3.10 Implement `saveCreativeTemplatePref` / `readCreativeTemplatePref`
    - Implement the pure `EventPageConfig` read/write helpers for per-event, per-type template selection
    - _Requirements: 1.4_
  - [x]* 3.11 Write property test for template preference round-trip
    - **Property 2: Template selection persistence round-trip**
    - **Validates: Requirements 1.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement `src/lib/creatives/creative-renderer.ts` plan builders
  - [x] 5.1 Define `SpeakerLike`, `SponsorLike`, `PlanElement`, `RenderPlan`
    - Write the plan-layer types described in the design
    - _Requirements: 2.1, 3.1_
  - [x] 5.2 Implement `buildSpeakerPlan` and `buildSponsorPlan`
    - Implement plan construction including the missing-photo placeholder-initial fallback, missing-logo styled-name fallback, and omission of missing title/company text elements
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_
  - [x]* 5.3 Write property test for missing optional fields
    - **Property 3: Missing optional fields are handled gracefully**
    - **Validates: Requirements 2.2, 2.3, 3.2**
  - [x] 5.4 Implement `assertComboEligible`
    - Implement the pure linkage-validation function and `ComboEntityNotLinkedError`
    - _Requirements: 4.3_
  - [x]* 5.5 Write property test for combo linkage rejection
    - **Property 7: Combo creative rejects entities not linked to the event**
    - **Validates: Requirements 4.3**
  - [x] 5.6 Implement `buildComboPlan`
    - Compose the speaker and sponsor plan elements plus a `divider` element into one combo plan
    - _Requirements: 4.1, 4.2_
  - [x]* 5.7 Write property test for combo structural completeness
    - **Property 6: Combo creative structural completeness**
    - **Validates: Requirements 4.1, 4.2**
  - [x] 5.8 Implement `nativeSizedLogoBox`
    - Implement the never-upscale, never-non-uniformly-stretch sizing helper described in the design
    - _Requirements: 3.3_
  - [x]* 5.9 Write property test for native logo sizing
    - **Property 4: Sponsor logo is never upscaled or stretched**
    - **Validates: Requirements 3.3**
  - [x] 5.10 Implement `fitText` with an injectable measurer
    - Implement wrap/shrink-to-fit text layout taking a `measure(text, fontSizePx)` function so it is testable without a real canvas
    - _Requirements: 10.1, 10.2_
  - [x]* 5.11 Write property test for text fitting
    - **Property 10: Text always fits within its element's bounds**
    - **Validates: Requirements 10.1, 10.2**
  - [x] 5.12 Implement `creativeFilename`
    - Implement entity-name sanitization + format-label composition into a safe `.png` filename
    - _Requirements: 5.4_
  - [x]* 5.13 Write property test for filename composition
    - **Property 11: Download filenames are valid and traceable**
    - **Validates: Requirements 5.4**
  - [x]* 5.14 Write unit tests for plan happy-path content
    - Assert full-data speaker/sponsor/combo plans contain the expected photo/logo/text elements with correct values
    - _Requirements: 2.1, 3.1, 4.1_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement canvas drawing and export
  - [x] 7.1 Implement `drawPlan`
    - Implement the imperative draw step (background fill, `drawImage` for photo/logo with the native-size/placeholder logic wired in, `fillText` using `fitText`'s output, divider line) drawing the photo/logo composite unmodified (no `ctx.filter`/transform)
    - Log image load failures via `logger.warn` and fall back to the placeholder path per the design's Error Handling section
    - _Requirements: 2.4, 3.3_
  - [x] 7.2 Implement `renderSpeakerCreative`, `renderSponsorCreative`, `renderComboCreative`
    - Compose the relevant `buildXPlan` + an off-screen canvas sized to the target `Platform_Format` + `drawPlan` + `canvas.toBlob("image/png")`
    - _Requirements: 5.2_
  - [x]* 7.3 Write property test for exact pixel output dimensions
    - **Property 8: Rendered output matches the exact target pixel dimensions**
    - **Validates: Requirements 5.2**
    - Use a mock canvas shim (`{ width, height, toBlob }`) rather than a real `HTMLCanvasElement`, per the design's Testing Strategy
  - [x]* 7.4 Write unit tests for `drawPlan`'s failure fallback and unmodified-composite guarantee
    - Assert a failed image load falls back to the placeholder and logs a warning; assert no filter/transform is applied to photo/logo draws
    - _Requirements: 2.2, 2.4, 3.2, 3.3_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement `src/lib/creatives/creative-batch.ts`
  - [x] 9.1 Implement `progressReducer`
    - Implement the monotonic, bounded-by-total progress counter
    - _Requirements: 6.4_
  - [x]* 9.2 Write property test for progress monotonicity
    - **Property 13: Batch progress is monotonic and bounded**
    - **Validates: Requirements 6.4**
  - [x] 9.3 Implement `runBatch`
    - Implement the per-(entity × format) orchestration with per-pair fault isolation and `onProgress` callback wired to `progressReducer`
    - _Requirements: 6.1, 6.2, 6.3, 6.5_
  - [x]* 9.4 Write property test for batch coverage and setting consistency
    - **Property 12: Batch run covers every entity exactly once with consistent settings**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [x]* 9.5 Write property test for batch fault isolation
    - **Property 14: Batch failures are isolated and completely reported**
    - **Validates: Requirements 6.5**
  - [x] 9.6 Implement `buildBatchArchive`
    - Implement ZIP assembly from successful `BatchOutcome`s using `fflate`'s `zipSync`, named via `creativeFilename`
    - _Requirements: 6.6_
  - [x]* 9.7 Write property test for archive contents
    - **Property 15: Batch archive contains exactly the successful creatives**
    - **Validates: Requirements 6.6**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement persistence, upload, and authorization
  - [x] 11.1 Implement the creative asset upload helper
    - Implement an upload function mirroring `SpeakerPhotoUploader`/`SponsorLogoUploader`'s `supabase.storage.from("site-assets").upload(...)` pattern, writing to an `event-creatives/{event_id}/` prefix, and a pure `buildCreativeAssetRecord(...)` function producing the `event_creatives` insert payload
    - _Requirements: 8.1, 9.3_
  - [x]* 11.2 Write property test for asset record completeness
    - **Property 16: Creative asset records are fully populated from their inputs**
    - **Validates: Requirements 8.1**
  - [x] 11.3 Implement the Creative_Library query and sort function
    - Implement the `event_creatives` fetch (ordered by `created_at desc`) and the pure client-side ordering-guard function described in the design
    - _Requirements: 8.2_
  - [x]* 11.4 Write property test for library ordering
    - **Property 17: Creative library lists most-recent-first**
    - **Validates: Requirements 8.2**
  - [x] 11.5 Implement the delete orchestration
    - Implement the function that calls storage delete and DB delete, reporting which step(s) failed on partial failure, per the design's Error Handling section
    - _Requirements: 8.3_
  - [x]* 11.6 Write property test for delete orchestration
    - **Property 18: Delete orchestration always attempts both steps and reports partial failure**
    - **Validates: Requirements 8.3**
  - [x] 11.7 Implement the authorization predicate
    - Implement the pure `isAuthorizedForEventCreatives(ownerId, requesterId, isAdmin)` predicate used by the UI layer (RLS remains the actual enforcement boundary per the design)
    - _Requirements: 9.1, 9.2_
  - [x]* 11.8 Write property test for authorization
    - **Property 19: Authorization matches the owner-or-admin rule**
    - **Validates: Requirements 9.1, 9.2**
  - [x]* 11.9 Write integration tests for upload+insert and library query
    - 1-2 examples verifying the real Storage upload + `event_creatives` insert path and the real ordered Supabase query, against a test project or mocked client
    - _Requirements: 8.1, 8.2_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Build the Creative_Generator UI components
  - [x] 13.1 Implement `TemplatePicker` and `EntityPicker`
    - Implement the per-type template thumbnail picker and the speaker/sponsor/combo-pair entity picker
    - _Requirements: 1.1_
  - [x] 13.2 Implement `CreativePreviewCanvas`
    - Implement the shared live-preview `<canvas>` component that calls `renderXCreative` (or a lower-cost preview-only draw path) on selection change, debounced like `PrintBadgesDialog`'s `refreshPreview`
    - _Requirements: 7.1, 7.2_
  - [x]* 13.3 Write component tests for live preview updates
    - Assert the preview redraws when template, entity, or `Platform_Format` selection changes
    - _Requirements: 7.1, 7.2_
  - [x] 13.4 Implement `CreativeGeneratorDialog`
    - Implement the single-creative flow: type tabs, `TemplatePicker`, `EntityPicker`, format multi-select, "Save as event default" toggle wired to `saveCreativeTemplatePref`, per-format generate/upload/insert action, per-file download, and the combo-rejection toast/log path
    - _Requirements: 1.1, 1.4, 2.1, 3.1, 4.1, 4.3, 5.2, 5.4, 6.4, 7.1, 7.2, 8.1_
  - [x] 13.5 Implement `BatchCreativeGeneratorDialog`
    - Implement the batch flow: template + format selection (no entity picker), `runBatch` wiring, progress bar, per-entity success/failure list, and the "Download all (.zip)" action wired to `buildBatchArchive`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 13.6 Implement `CreativeLibrarySection`
    - Implement the thumbnail grid listing `event_creatives` and the delete action wired to the delete orchestration
    - _Requirements: 8.2, 8.3_

- [x] 14. Wire the Creative_Generator into the event dashboard
  - [x] 14.1 Add the "Creatives" sidebar section to `EventDetailPage.tsx`
    - Add the lazy-loaded `CreativesSection` entry point (mirroring `ApplicationsSectionLazy`) composing `CreativeLibrarySection` with buttons opening `CreativeGeneratorDialog` and `BatchCreativeGeneratorDialog`, gated by the authorization predicate from task 11.7
    - _Requirements: 9.1, 9.2_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

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
    { "wave": 8, "tasks": ["8"] },
    { "wave": 9, "tasks": ["9"] },
    { "wave": 10, "tasks": ["10"] },
    { "wave": 11, "tasks": ["11"] },
    { "wave": 12, "tasks": ["12"] },
    { "wave": 13, "tasks": ["13"] },
    { "wave": 14, "tasks": ["14"] },
    { "wave": 15, "tasks": ["15"] }
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
    "9": ["8"],
    "10": ["9"],
    "11": ["10"],
    "12": ["11"],
    "13": ["12"],
    "14": ["13"],
    "15": ["14"]
  }
}
```

## Notes

- Tasks marked with `*` are optional (unit/property/integration/component tests)
  and can be skipped for a faster MVP; core implementation tasks are never marked
  optional.
- Every property test task cites the exact property number and title from
  `design.md`'s Correctness Properties section, and every task cites the
  granular requirement sub-clauses it implements.
- The dependency graph is intentionally linear (one task per wave) because each
  layer's checkpoint (tasks 2, 4, 6, 8, 10, 12) gates the next layer building on
  top of it — templates before renderer, renderer before canvas export, canvas
  export before batch, batch and persistence before UI, UI before dashboard
  wiring.
- Once `tasks.md` is created, open this file and click "Start task" next to any
  task item to begin implementation. This workflow does not implement the
  feature itself.
