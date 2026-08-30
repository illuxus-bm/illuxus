# UTM Attribution

This document is the developer onboarding guide for illuxus's first-touch UTM
attribution layer. It covers the four conversion surfaces that carry UTM,
how first-touch capture flows through per-tab storage, the CSV export
contract, and how to sanity-check the pipeline from an organizer or admin
seat.

If you're looking for how the property-based tests are structured, jump to
[Property test coverage](#property-test-coverage). If you're chasing a
regression in the attendee flow, [Property 58](#property-test-coverage) is
the tripwire.

## Overview

illuxus captures the standard five UTM parameters (`utm_source`,
`utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) on the first URL a
tab sees, holds them in per-tab `sessionStorage`, and stamps them onto
every "conversion row" the same tab subsequently produces. Organizers and
admins see the source inline on list rows, the full five-field set on
detail surfaces, and a five-column trailing block on every CSV export.

The pattern is single-source, single-tab, first-touch: whichever campaign
link the visitor clicks first is credited on every downstream conversion
in that tab, regardless of how many event pages, login redirects, or
application dialogs they open along the way.

Absent values render as absence, never as a placeholder. `null` never
becomes the string `"null"` in a CSV cell, and an empty `utm_source`
never becomes an em-dash under an applicant's name.

## The four attribution surfaces

Every attribution surface follows the same shape: **capture** (URL → tab
storage), **insert** (tab storage → row), **display** (row → UI), and
**export** (row → CSV cell).

| Surface | Table | Capture on | Insert via | Display in | Export from |
| --- | --- | --- | --- | --- | --- |
| Attendee_Registration | `registrations` | `PublicEventPage` | `EventRsvpCard.tsx` | `RegistrationsSection.tsx` + `RegistrantQuickView.tsx` | `RegistrationsSection` |
| Speaker_Application | `speaker_applications` | `PublicEventPage` | `SpeakerApplicationDialog.tsx` | `ApplicationsSection.tsx` | `ApplicationsSection` |
| Sponsor_Application | `sponsor_applications` | `PublicEventPage` | `SponsorApplicationDialog.tsx` | `ApplicationsSection.tsx` | `ApplicationsSection` |
| User_Profile | `profiles` | `LoginPage.tsx` mount | `handle_new_user()` trigger reading `auth.users.raw_user_meta_data` | `UserManagementPage.tsx` | `UserManagementPage` |

Attendee_Registration shipped first. Speaker_Application,
Sponsor_Application, and User_Profile were added later so all four
surfaces now share one contract end to end.

## First-touch semantics

Capture happens exactly once per tab, on the first URL that carries at
least one non-empty UTM parameter. The set of routes allowed to capture
is the **Marketing_Landing_Surface** set: `PublicEventPage` and
`LoginPage`. No other route reads UTM out of the URL.

The three helpers in `src/lib/utm.ts` bound the entire lifecycle:

- `captureUtm(search)` — called on `PublicEventPage` mount and
  `LoginPage` mount. Writes to `sessionStorage` under the key
  `illuxus:utm` only when storage is empty and the URL carries at least
  one non-empty UTM parameter. Values are URL-decoded, trimmed via
  `String.prototype.trim`, and capped at 512 characters.
- `loadStoredUtm()` — reads without clearing. Called at conversion time
  by every insert site. Returns `{}` when nothing is stored or when the
  stored payload can't be parsed; consumers use `?? null` to translate
  missing keys into SQL `NULL`.
- `clearStoredUtm()` — called **only** by `EventRsvpCard.tsx` after a
  successful attendee registration. This preserves the shipped attendee
  behavior.

Storage is never cleared by Speaker_Application, Sponsor_Application, or
Organizer_Signup submissions. A single UTM click therefore attributes
every application and profile the same tab creates, and the eventual
attendee RSVP too. The tab closing discards the storage naturally.

## CSV export contract

Every UTM-bearing CSV export in the app is built by the pure module
`src/lib/utm/csv-escape.ts` and shaped by `src/lib/utm/applications-csv.ts`.

The contract:

- **RFC 4180 escaping.** Cells containing `,`, `"`, `\r`, or `\n` are
  wrapped in double quotes with any interior quotes doubled.
  `escapeCsvCell` handles every value type the app produces
  (`string`, `number`, `boolean`, `null`, `undefined`, and objects via
  `JSON.stringify`). `symbol` and `bigint` are rejected.
- **Five trailing UTM columns.** Every export appends `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` as the last
  five columns, in that order, matching the shipped
  `registrations.utm_*` layout.
- **Empty cells for Absent_UTM.** A missing or empty UTM value is
  emitted as zero characters — never as `"null"`, `"NULL"`, `"None"`,
  or `"n/a"`.
- **UTF-8, no BOM, CRLF line terminators.** Per RFC 4180.
- **`CsvEscapeError` aborts the download.** If `buildCsvDocument`
  encounters a value it can't safely serialize (a bigint, a symbol, or
  a JSON stringify failure), it throws `CsvEscapeError` before any
  bytes reach the user's browser. The calling handler catches the
  error and surfaces a `toast.error("Export blocked", ...)` on the
  originating surface without leaking internals.

The browser-side download helper is `downloadCsv(filename, content)` in
`applications-csv.ts`; it wraps the content in a
`Blob({ type: "text/csv;charset=utf-8" })` and drives a synthetic `<a>`
click.

## How to test (organizer POV)

To confirm attribution end-to-end from a fresh tab:

1. Open an incognito window (so `sessionStorage` starts empty).
2. Visit a UTM-tagged URL, for example
   `https://illuxus.com/e/your-event?utm_source=twitter&utm_medium=organic&utm_campaign=launch`.
   The tag can also point at `/login?utm_source=…` for the sign-up
   surface.
3. Submit one of the four conversions from the same tab:
   - RSVP through `EventRsvpCard`.
   - Apply as a speaker via `SpeakerApplicationDialog`.
   - Apply as a sponsor via `SponsorApplicationDialog`.
   - Create an account on `LoginPage`.
4. Open the review surface for that conversion type:
   - Attendee → `RegistrationsSection` — `via twitter` under the
     attendee, full five-field set in `RegistrantQuickView`.
   - Applications → `ApplicationsSection` — `via twitter` on the row,
     Attribution section in the detail dialog.
   - Users → `UserManagementPage` — `via twitter` on the row.
5. Export the CSV and confirm the last five columns carry
   `twitter`, `organic`, `launch`, and empty cells for `utm_content`
   and `utm_term`.

If you repeat step 3 in the same tab (e.g. applying as a speaker after
already applying as a sponsor), both rows will carry `twitter` /
`organic` / `launch`. Only the successful attendee RSVP clears storage.

## 512-character cap

`captureUtm` enforces a hard 512-character cap per UTM_Field after
URL-decoding and whitespace trimming. Longer values are truncated to
their first 512 characters before being written to `sessionStorage`.
This prevents a runaway campaign ID from producing multi-kilobyte CSV
rows or bloating `raw_user_meta_data`.

The cap is a storage-side invariant, not a URL-side one — the browser
will still parse and decode the full query parameter; only the value
persisted to `sessionStorage` (and therefore to any Conversion_Row) is
truncated.

## Property test coverage

Seven property-based tests live under
`src/lib/utm/__tests__/`. All seven run under `bun run test` on every
CI build.

| Property | File | Validates |
| --- | --- | --- |
| 52 | `property-52-csv-escape-roundtrip.pbt.test.ts` | RFC 4180 round-trip through escape/parse is identity |
| 53 | `property-53-csv-absence-empty.pbt.test.ts` | Absent UTM emits zero characters |
| 54 | `property-54-applications-csv-headers.pbt.test.ts` | Applications CSV header layout is stable |
| 55 | `property-55-empty-tab-csv.pbt.test.ts` | Empty tab produces header-only CSV |
| 56 | `property-56-utm-roundtrip.pbt.test.ts` | UTM round-trip through URL → storage preserves values |
| 57 | `property-57-utm-length-cap.pbt.test.ts` | 512-character cap is enforced |
| 58 | `property-58-attendee-non-regression.pbt.test.ts` | Attendee non-regression tripwire |

**Property 58 is the attendee tripwire.** It fingerprints the opening
of `EventRsvpCard.tsx`, `RegistrationsSection.tsx`, and
`registrations/RegistrantQuickView.tsx` and fails loudly if any of
those files are edited. The three new surfaces were added without
touching the shipped attendee flow, and
Property 58 is the mechanical check that this stays true across future
work. If you have a legitimate reason to edit an attendee file, update
the fingerprint in Property 58 along with the change.

## Migrations

The UTM columns on `speaker_applications`, `sponsor_applications`, and
`profiles` land in `supabase/migrations/026_utm_attribution_coverage.sql`
along with a `CREATE OR REPLACE` of the `handle_new_user()` trigger that
extracts UTM keys from `auth.users.raw_user_meta_data` and stamps them
on the new profile row.

**Migration 026 must be applied manually to Supabase.** Paste the file
into the Supabase SQL Editor and run it. The three `ALTER TABLE`
statements use `add column if not exists`, so re-running is safe. The
trigger `CREATE OR REPLACE` preserves every field the shipped trigger
already sets — only the five UTM lines are new.

RLS is inherited. No new policy is required: existing event-owner /
admin scope on the two applications tables and self-read / admin bypass
on `profiles` already cover the UTM columns. The migration's header
comment documents this explicitly.

## Related code

- `src/lib/utm.ts` — capture, load, and clear helpers.
- `src/lib/utm/csv-escape.ts` and `src/lib/utm/applications-csv.ts` — the
  export contract.
- `src/lib/utm/__tests__/` — the seven property tests listed above.
- `supabase/migrations/026_utm_attribution_coverage.sql` — the UTM columns
  and the `handle_new_user()` trigger update.
