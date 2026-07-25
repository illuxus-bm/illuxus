# Implementation Plan: UTM Attribution Coverage

Convert the feature design into a series of prompts for a code-generation LLM
that will implement each step with incremental progress. Make sure that each
prompt builds on the previous prompts, and ends with wiring things together.
There should be no hanging or orphaned code that isn't integrated into a
previous step. Focus ONLY on tasks that involve writing, modifying, or
testing code.

## Overview

Implementation proceeds bottom-up: schema migration first (so
`supabase/types.ts` can carry the new columns), then the pure
`csv-escape.ts` + `applications-csv.ts` modules (with their property
tests), then the client-side capture wiring at `LoginPage`, then the
insert wiring in the three conversion surfaces (Speaker/Sponsor
dialogs + LoginPage sign-up), then the display + export UI in
`ApplicationsSection` and `UserManagementPage`, then the final
checkpoint that runs the full test/lint/build gate.

**Additivity discipline (repeat).** No file under `src/components/event/`
that already ships attendee UTM behavior (`EventRsvpCard.tsx`,
`RegistrationsSection.tsx`, `registrations/RegistrantQuickView.tsx`) is
touched by this spec. Property 58 is the tripwire that enforces this
mechanically.

Every task cites the requirement sub-clauses it fulfills. Test sub-tasks
are marked with `*` per project convention and are strictly optional;
core implementation tasks are never optional.

## Tasks

- [x] 1. Land database migration + regenerate types
  - [x] 1.1 Write `supabase/migrations/026_utm_attribution_coverage.sql`
    - Add `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
      `utm_term` as five `text` (nullable) columns to
      `speaker_applications`, `sponsor_applications`, and `profiles`
    - Use `add column if not exists` so re-running the migration is
      safe
    - Include `comment on column` for each of the three tables'
      `utm_source` (documents the source per the design)
    - Do NOT add indexes on UTM columns (design decision — applications/
      profiles are not queried by UTM values)
    - _Requirements: 1.1, 1.2, 1.3, 1.6_
  - [x] 1.2 Extend the `handle_new_user()` trigger function to read UTM
    from `auth.users.raw_user_meta_data`
    - Include a `CREATE OR REPLACE FUNCTION public.handle_new_user()`
      block in the same migration
    - **Critical**: read the current trigger definition first (via
      `pg_get_functiondef('public.handle_new_user'::regproc)` in a
      psql session or by reading `000_full_schema.sql`'s
      `handle_new_user` body) and preserve every existing INSERT/UPDATE
      field the trigger currently sets. Only the UTM lines are new
    - Extract each UTM_Field via
      `nullif(trim(meta->>'utm_source'), '')` etc. — empty strings and
      whitespace-only strings persist as SQL NULL (Requirement 1.5 /
      5.2)
    - The `on conflict (id) do update set` clause uses `coalesce(existing, new)`
      so a re-signup with new UTM doesn't overwrite existing UTM
      (first-touch semantics)
    - _Requirements: 5.2, 1.5_
  - [x] 1.3 Regenerate `src/integrations/supabase/types.ts`
    - Hand-edit per workspace convention (no live codegen — same
      precedent as AI backgrounds spec)
    - Add the five UTM columns as `string | null` on `Row` and
      `string | null | undefined` on `Insert` / `Update` for:
      `Database["public"]["Tables"]["speaker_applications"]`,
      `Database["public"]["Tables"]["sponsor_applications"]`,
      `Database["public"]["Tables"]["profiles"]`
    - Preserve every existing entry byte-for-byte
    - Run `getDiagnostics` to confirm zero TS errors
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Verify `src/lib/utm.ts` API + implementation
  - [x] 2.1 Confirm the shipped `captureUtm` already enforces the
    512-character cap and trim
    - Read the current `captureUtm` implementation
    - If the 512-cap is missing, add it as an in-place non-breaking
      change: after URL-decoding + trim, if `value.length > 512`,
      truncate to 512 chars before storing (Requirement 12.4)
    - If trim isn't already `String.prototype.trim`, switch to it
      (Requirements 2.3, 12.1)
    - Do NOT change the `UtmParams` / `captureUtm` / `loadStoredUtm` /
      `clearStoredUtm` API surface — the exports must stay
      byte-identical
    - _Requirements: 12.1, 12.4_
  - [x] 2.2* Write property test for URL → storage round-trip and
    length cap
    - `src/lib/utm/__tests__/property-56-utm-roundtrip.pbt.test.ts` —
      **Property 56: UTM round-trip through URL → storage**
      **Validates: Requirements 12.1, 12.2, 12.3**
    - `src/lib/utm/__tests__/property-57-utm-length-cap.pbt.test.ts` —
      **Property 57: UTM_Field character cap at 512 is enforced**
      **Validates: Requirements 12.4**
    - Each `fc.assert(..., { numRuns: 100 })`
    - _Requirements: 12.1, 12.4_

- [x] 3. Implement `src/lib/utm/csv-escape.ts` (pure)
  - [x] 3.1 Type surface + `escapeCsvCell`
    - Export `escapeCsvCell(value: unknown, opts?: { throwOnUnserializable?: boolean }): string`
    - Handle every value type per the design: string / number / boolean /
      symbol (throws) / bigint (throws) / object (JSON.stringify) /
      null|undefined (empty string)
    - RFC 4180 escape: wrap in double-quotes when the cell contains
      `[",\r\n]`, doubling interior quotes
    - Empty for absent (never `"null"` / `"NULL"` / `"None"` / `"n/a"`)
    - _Requirements: 10.5, 10.7, 11.2, 11.4, 14.1, 14.4_
  - [x] 3.2 `CsvEscapeError` class + `buildCsvDocument(headers, rows)`
    - Class extends `Error`, name `"CsvEscapeError"`
    - `buildCsvDocument`: escapes every cell with
      `throwOnUnserializable: true`, joins with CRLF line terminators,
      returns a full document string (no BOM)
    - _Requirements: 10.6, 10.9, 11.3_
  - [x] 3.3* Write property tests for the CSV escaper
    - `property-52-csv-escape-roundtrip.pbt.test.ts` —
      **Property 52: RFC 4180 round-trip through escape and parse is identity**
      **Validates: Requirements 10.5, 11.2, 12.2** (test file includes a
      minimal `parseCsvCell` inverse)
    - `property-53-csv-absence-empty.pbt.test.ts` —
      **Property 53: Absent UTM emits zero characters**
      **Validates: Requirements 10.7, 11.4, 14.1, 14.4**
    - _Requirements: as noted per property_

- [x] 4. Implement `src/lib/utm/applications-csv.ts` (pure)
  - [x] 4.1 `buildSpeakerApplicationsCsv(rows)` +
    `buildSponsorApplicationsCsv(rows)`
    - Headers: domain columns first (Name / Email / Company / Session
      Title / Status / Submitted At for speaker; Company / Contact
      Name / Contact Email / Tier / Status / Submitted At for sponsor),
      then five contiguous trailing UTM columns
      (`utm_source` / `utm_medium` / `utm_campaign` / `utm_content` /
      `utm_term`)
    - Uses `buildCsvDocument` — every escape failure propagates as
      `CsvEscapeError`
    - Empty `rows` → header-only CSV (Requirement 10.8)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  - [x] 4.2 `downloadCsv(filename, content)` browser helper
    - Creates a `Blob` with `type: "text/csv;charset=utf-8"`, triggers
      an `<a>` click, revokes the object URL
    - Shared by every UI export in this spec
    - _Requirements: 10.9_
  - [x] 4.3* Write property tests for applications-csv
    - `property-54-applications-csv-headers.pbt.test.ts` —
      **Property 54: Applications CSV header layout**
      **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 14.5**
    - `property-55-empty-tab-csv.pbt.test.ts` —
      **Property 55: Empty tab produces header-only CSV**
      **Validates: Requirements 10.8**
    - _Requirements: as noted per property_

- [x] 5. Wire `captureUtm` on `LoginPage` mount
  - [x] 5.1 Add `useEffect` calling `captureUtm(window.location.search)` on mount
    - Import from `@/lib/utm`
    - No dependencies array modifications elsewhere
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.7_

- [x] 6. Wire UTM into `supabase.auth.signUp` in `LoginPage`
  - [x] 6.1 In the sign-up submit path, read `loadStoredUtm()` and
    thread the five keys through `options.data`
    - Reads `loadStoredUtm()` immediately before the signUp call
    - Adds five keys (`utm_source` etc.) with `?? null` fallback so
      absent fields land as SQL NULL after the trigger runs
    - Preserves every existing metadata field the signUp already sends
    - Do NOT call `clearStoredUtm` after signUp success — Requirement
      5.4 explicitly requires storage to remain intact
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [x] 7. Wire UTM into Speaker_Application submission
  - [x] 7.1 In `SpeakerApplicationDialog.tsx`, read `loadStoredUtm()`
    immediately before the insert
    - Adds the five UTM columns to the insert payload (using `?? null`
      fallback so absent fields land as SQL NULL — Requirement 3.2)
    - Wraps the `loadStoredUtm()` call in a try/catch that treats any
      thrown or malformed value as absent (Requirement 3.3)
    - Do NOT call `clearStoredUtm` on success (Requirement 3.4) or on
      failure (Requirement 3.5)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. Wire UTM into Sponsor_Application submission
  - [x] 8.1 In `SponsorApplicationDialog.tsx`, read `loadStoredUtm()`
    immediately before the insert
    - Same shape as Task 7.1
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 9. Display UTM on Application rows and detail dialogs in
  `ApplicationsSection.tsx`
  - [x] 9.1 Add `via <utm_source>` inline hint under every Application
    row's contact line
    - Only rendered when `utm_source` contains at least one
      non-whitespace character
    - Renders `<utm_source>` as plain text (no HTML interpolation)
    - Never substitutes any placeholder character or label when absent
      (Requirement 7.2 / 8.2 / 14.2)
    - _Requirements: 7.1, 7.2, 8.1, 8.2, 14.2_
  - [x] 9.2 Add read-only "Attribution" section in each Application's
    detail dialog
    - Renders only when at least one of the five UTM_Fields on the row
      is non-empty (Requirement 7.5 / 8.5 / 14.3)
    - Displays all five fields in order (`utm_source`, `utm_medium`,
      `utm_campaign`, `utm_content`, `utm_term`), each with a fixed
      label matching the column name
    - For any Absent_UTM field on a row with at least one non-empty
      field: label rendered, value area empty (Requirement 7.4 / 8.4)
    - Consistent with the shipped `RegistrantQuickView` Attribution
      section
    - _Requirements: 7.3, 7.4, 7.5, 8.3, 8.4, 8.5_

- [x] 10. Add CSV export actions on both Application tabs
  - [x] 10.1 Speaker Applications tab: "Export CSV" button
    - Handler: builds CSV via `buildSpeakerApplicationsCsv(filteredApps)`,
      calls `downloadCsv`, filename
      `speaker-applications-${eventSlug ?? eventId}.csv`
    - Wraps in try/catch on `CsvEscapeError`: aborts and shows
      `toast.error("Export blocked", { description: "..." })` per
      Requirement 10.6
    - Success toast: `toast.success("CSV exported", { description: "N row(s)." })`
    - _Requirements: 10.1, 10.3, 10.5, 10.6, 10.7, 10.8, 10.9_
  - [x] 10.2 Sponsor Applications tab: same shape
    - Filename `sponsor-applications-${eventSlug ?? eventId}.csv`
    - _Requirements: 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

- [x] 11. Display UTM in `UserManagementPage.tsx` user rows
  - [x] 11.1 Extend the `profiles` fetch query to include the five UTM
    columns
    - Add `utm_source, utm_medium, utm_campaign, utm_content, utm_term`
      to the `.select("...")` call
    - _Requirements: 9.1_
  - [x] 11.2 Add `via <utm_source>` inline hint on each user row
    - Only rendered when `utm_source` is non-empty
    - Truncated to a maximum of 64 rendered characters with a trailing
      ellipsis (Requirement 9.1's rendered-char cap)
    - Never substitutes placeholder text when absent (Requirement 9.2 /
      14.2)
    - _Requirements: 9.1, 9.2, 14.2_
  - [x] 11.3 Add Attribution display to the user detail surface
    - The existing user detail dialog/drawer/expanded row (whichever the
      page already uses) gets a labelled five-field Attribution section
    - Renders only when at least one UTM_Field is non-empty
      (Requirement 9.4 / 14.3)
    - Shows an explicit empty-state indicator for Absent_UTM fields
      alongside present ones (Requirement 9.3)
    - _Requirements: 9.3, 9.4, 14.3_

- [x] 12. Extend `UserManagementPage.tsx` CSV export
  - [x] 12.1 Add the five UTM columns to the existing export headers +
    data rows
    - Uses `buildCsvDocument` from `@/lib/utm/csv-escape` and
      `downloadCsv` from `@/lib/utm/applications-csv`
    - Wraps in try/catch on `CsvEscapeError` with a user-visible
      `toast.error` per Requirement 11.3
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 13. RLS non-regression verification
  - [x] 13.1 Confirm the three affected tables' existing RLS policies
    cover the new UTM columns implicitly
    - `speaker_applications`, `sponsor_applications`: event-owner /
      admin scope
    - `profiles`: self-read + admin bypass
    - No new policy is required (Requirement 13.1-13.3)
    - Document in a small header comment on migration `026` that
      Requirement 13 is inherited from parent policies
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 14. Attendee flow non-regression
  - [x] 14.1* Write Property 58 (attendee non-regression tripwire)
    - `property-58-attendee-non-regression.pbt.test.ts` —
      **Property 58: Attendee non-regression tripwire**
      **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
    - Reads the first three lines (opening docstring marker) of
      `EventRsvpCard.tsx`, `RegistrationsSection.tsx`,
      `registrations/RegistrantQuickView.tsx` and asserts they match
      the fingerprint recorded when this spec landed
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 15. Integration tests for the dialog submission paths
  - [x] 15.1* Write `SpeakerApplicationDialog.utm-e2e.test.ts`
    - Sets sessionStorage['illuxus:utm'] to a known payload
    - Renders the dialog, fills the form, submits
    - Asserts the mocked `supabase.from("speaker_applications").insert(...)`
      call received the five UTM columns
    - _Requirements: 3.1, 3.2_
  - [x] 15.2* Write `SponsorApplicationDialog.utm-e2e.test.ts`
    - Same shape for sponsor dialog
    - _Requirements: 4.1, 4.2_

- [x] 16. Docs update
  - [x] 16.1 Extend `docs/utm-attribution.md` (or create it if absent)
    - Document the four attribution surfaces (attendee / speaker /
      sponsor / signup), first-touch semantics, and the new CSV
      exports
    - Include a short "How to test" section for organizers
    - _Requirements: all_

- [x] 17. Final checkpoint — run every gate
  - [x] 17.1 Run tests, lint, build
    - `bun run test --run` — every existing test must pass unchanged
      (Attendee non-regression is critical: Property 58 tripwire),
      plus every new Property 52-58 test passes 100 fast-check runs
    - `bun run lint` — clean (no NEW errors introduced by this
      feature)
    - `bun run build` — succeeds
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

## Notes

- **Migration 026 requires manual application** to your Supabase
  instance (paste into SQL Editor and run) after code lands. The three
  ALTER TABLE statements are idempotent (`add column if not exists`).
- **`handle_new_user` trigger extension is the trickiest part.** Task
  1.2 must read the current trigger body from the shipped schema
  (`000_full_schema.sql`) before writing the migration, so no existing
  behavior is lost during the CREATE OR REPLACE.
- **Property numbering fixed at 51-58.** Never reuse across specs.
- **Bun-only.** Use `bun run test --run`, `bun run lint`, `bun run build`.
  Never `npm` or `pnpm`.
- **`console.*` banned.** Use `logger` from `@/lib/observability`.
- **Attendee non-regression is a structural invariant.** No file under
  `EventRsvpCard.tsx`, `RegistrationsSection.tsx`, or
  `registrations/RegistrantQuickView.tsx` is edited by this spec.
  Property 58's tripwire enforces this.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4"] },
    { "wave": 4, "tasks": ["5", "7", "8"] },
    { "wave": 5, "tasks": ["6", "9", "11"] },
    { "wave": 6, "tasks": ["10", "12"] },
    { "wave": 7, "tasks": ["13", "14", "15"] },
    { "wave": 8, "tasks": ["16"] },
    { "wave": 9, "tasks": ["17"] }
  ],
  "dependencies": {
    "1": [],
    "2": ["1"],
    "3": [],
    "4": ["1", "3"],
    "5": [],
    "6": ["5"],
    "7": ["1"],
    "8": ["1"],
    "9": ["1"],
    "10": ["4", "9"],
    "11": ["1"],
    "12": ["3", "11"],
    "13": ["1"],
    "14": [],
    "15": ["7", "8"],
    "16": ["10", "12"],
    "17": ["6", "10", "12", "13", "14", "15", "16"]
  }
}
```
