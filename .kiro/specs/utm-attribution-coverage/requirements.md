# Requirements Document

## Introduction

Illuxus already ships first-touch UTM attribution end-to-end for the attendee RSVP
flow: `src/lib/utm.ts` captures `utm_*` query parameters into a per-tab
sessionStorage record on the public event page, `EventRsvpCard.tsx` stamps those
values onto the `registrations` row at conversion time, `RegistrationsSection.tsx`
renders `via <source>` under each attendee and expands the full source / medium /
campaign / content / term set in the RegistrantQuickView drawer, and the
registrations CSV export includes five dedicated UTM columns.

Three other conversion surfaces on the same platform were not extended when the
attendee flow shipped and therefore have zero attribution data at all — neither on
the row, in the organizer UI, nor in exports:

- **CFP speaker applications** (`speaker_applications` — created via
  `SpeakerApplicationDialog.tsx`, reviewed in `ApplicationsSection.tsx`)
- **CFP sponsor applications** (`sponsor_applications` — created via
  `SponsorApplicationDialog.tsx`, reviewed in `ApplicationsSection.tsx`)
- **Organizer signup** (`profiles`, populated by the `handle_new_user`
  auth trigger from `LoginPage.tsx` sign-up metadata; reviewed in
  `UserManagementPage.tsx`)

This spec closes that gap by extending the existing UTM_Attribution pattern to those
three surfaces so that a marketing team can measure which campaign produced each
converted speaker, sponsor, and organizer, and can pull attribution alongside every
"candidate download" (CSV export) an organizer or admin already runs today.

### Default decisions made during requirements (per investigation)

These decisions resolve ambiguities in the source request. Each mirrors a pattern
already established in the shipped attendee flow; flag during review if a different
choice is wanted.

1. **First-touch semantics reused, not first-touch-once-per-session.** Each of the
   three new surfaces reads first-touch UTM from storage at conversion time and
   stamps it onto its own row. The existing RSVP clear-on-success behavior in
   `EventRsvpCard.tsx` is preserved unchanged; the three new surfaces do NOT
   clear storage after conversion so that a single UTM click can still attribute
   both a speaker application and a subsequent RSVP within the same tab
   session. Storage is naturally scoped to the tab, so it is discarded when the
   tab closes.
2. **URL capture happens where the user first lands.** `PublicEventPage` already
   calls `captureUtm(window.location.search)` on load. Organizer signup marketing
   campaigns frequently link directly to `/login?utm_source=…`, so this spec also
   requires `LoginPage` to run `captureUtm` on load so first-touch is seeded even
   when the visitor never sees a public event page.
3. **UTM is persisted on the same table that already holds the row's identity.**
   Speaker applications get UTM columns on `speaker_applications`; sponsor
   applications on `sponsor_applications`; organizer signup on `profiles`. This
   mirrors the shipped `registrations.utm_*` layout and avoids introducing a new
   join table.
4. **The UTM_Clicks table is not changed and analytics aggregates are not
   re-scoped.** The existing `event_utm_summary` RPC continues to aggregate from
   `utm_clicks` + `registrations` only; adding applications and profiles to the
   funnel view is a separate future spec.
5. **Missing UTM data renders as absence, not as a placeholder.** Rows without a
   captured source SHALL NOT render "via —" clutter in list views, and CSV cells
   without a captured value SHALL be emitted as empty strings (RFC 4180-quoted
   where the surrounding row already needs quoting), matching the shipped
   registrations behavior.
6. **CSV export is the primary "download candidate data" surface.** The
   applications tab currently has no CSV export at all, so this spec adds one for
   speaker applications and one for sponsor applications, patterned after
   `RegistrationsSection.exportCSV` (same header row layout, same RFC 4180
   escaping, same UTM column ordering). The admin user list already has an export
   entry point; this spec extends it with the same five UTM columns.
7. **UTM values are trimmed and capped at 512 characters after URL-decoding.**
   Leading/trailing whitespace is stripped by `captureUtm` before storage. Values
   longer than 512 characters after URL-decoding are truncated at 512 to prevent
   oversized rows and CSV rows the length of a small essay.

## Glossary

- **UTM_Attribution**: The overall feature: capturing, persisting, displaying,
  and exporting first-touch UTM parameters across every conversion surface on
  the platform.
- **UTM_Fields**: The ordered set of five nullable text columns `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, matching the
  shipped `registrations.utm_*` layout.
- **First_Touch_UTM**: The set of UTM_Fields captured from the URL on the first
  page-load of a tab that carried at least one utm_* query parameter, held in
  the tab's sessionStorage under the key `illuxus:utm` by
  `src/lib/utm.ts::captureUtm`. Values are URL-decoded, trimmed via
  `String.prototype.trim`, and capped at 512 characters.
- **Attribution_Storage**: The per-tab sessionStorage record where
  First_Touch_UTM is held between the initial marketing click and the
  eventual conversion. Managed by `src/lib/utm.ts` (`captureUtm`,
  `loadStoredUtm`, `clearStoredUtm`).
- **Attendee_Registration**: A row in the `registrations` table produced by
  `EventRsvpCard.tsx`. Attendee_Registrations already carry UTM_Fields.
- **Speaker_Application**: A row in the `speaker_applications` table produced by
  `SpeakerApplicationDialog.tsx`.
- **Sponsor_Application**: A row in the `sponsor_applications` table produced by
  `SponsorApplicationDialog.tsx`.
- **Application**: Either a Speaker_Application or a Sponsor_Application.
- **Organizer_Signup**: A row in the `profiles` table with `account_type` value
  `organizer`, produced by the `handle_new_user` trigger fired when a new user
  signs up through `LoginPage.tsx`.
- **User_Profile**: Any row in the `profiles` table regardless of account_type
  (`attendee` or `organizer`).
- **Conversion_Row**: A row of any of the following four types:
  Attendee_Registration, Speaker_Application, Sponsor_Application, or
  User_Profile.
- **Attribution_UI**: The set of UI surfaces that render UTM_Fields to
  organizers or admins. Includes the applications list rows and detail dialogs
  in `ApplicationsSection.tsx`, the user list in `UserManagementPage.tsx`, and
  the existing attendee attribution surfaces in `RegistrationsSection.tsx`.
- **Attribution_Export**: A CSV file exported by an organizer or admin that
  contains one row per Conversion_Row and includes the five UTM_Fields as
  dedicated columns.
- **Marketing_Landing_Surface**: A route where a UTM-tagged marketing link is
  allowed to land. In this spec that set is `{PublicEventPage, LoginPage}`.
- **Organizer_View**: A logged-in user who owns the target event or organization
  and can review Applications, Attendee_Registrations, and their exports for
  that event or organization.
- **Admin_View**: A logged-in user with the platform-level `admin` role, able
  to review User_Profiles in `UserManagementPage.tsx` and their export.
- **Absent_UTM**: A UTM_Field value that is NULL, an empty string, or a string
  containing only whitespace characters.

## Requirements

### Requirement 1: UTM_Fields on Speaker_Application, Sponsor_Application, and User_Profile Tables

**User Story:** As a marketer, I want every conversion row to carry the five
UTM_Fields, so that I can attribute each speaker, sponsor, and organizer to the
campaign that produced them.

#### Acceptance Criteria

1. THE Speaker_Application row SHALL persist the five UTM_Fields as five
   independently nullable text columns matching the shipped
   `registrations.utm_*` layout in name, type, and nullability.
2. THE Sponsor_Application row SHALL persist the five UTM_Fields as five
   independently nullable text columns matching the shipped
   `registrations.utm_*` layout in name, type, and nullability.
3. THE User_Profile row SHALL persist the five UTM_Fields as five independently
   nullable text columns matching the shipped `registrations.utm_*` layout in
   name, type, and nullability.
4. THE Attendee_Registration row SHALL continue to persist the five UTM_Fields
   without any UTM column being renamed, dropped, or made non-nullable by this
   spec's migrations.
5. IF a UTM_Field value is absent, null, undefined, or empty-after-trim at the
   moment a Conversion_Row is created, THEN THE Conversion_Row SHALL persist
   that UTM_Field as SQL NULL rather than as an empty string.
6. WHEN this spec's migrations add the five UTM_Fields to the
   Speaker_Application, Sponsor_Application, and User_Profile tables, THE
   migrations SHALL initialize every pre-existing row's UTM_Fields to SQL NULL
   so already-persisted rows have well-defined UTM values immediately after
   the migration runs.

### Requirement 2: First_Touch_UTM Capture on Marketing_Landing_Surfaces

**User Story:** As a marketer, I want UTM parameters to be captured wherever a
campaign link lands, so that I can attribute conversions that start from either an
event page or the sign-up page.

#### Acceptance Criteria

1. WHEN PublicEventPage completes its initial mount for a given browser
   navigation, THE UTM_Attribution SHALL call `captureUtm` exactly once for
   that navigation with the URL query string of the current navigation.
2. WHEN LoginPage completes its initial mount for a given browser navigation,
   THE UTM_Attribution SHALL call `captureUtm` exactly once for that
   navigation with the URL query string of the current navigation.
3. WHEN `captureUtm` runs on any Marketing_Landing_Surface and the current URL
   carries at least one query parameter whose name is in the set
   {`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`}
   with a value that is non-empty after trimming leading and trailing
   whitespace, and Attribution_Storage does not already hold a
   First_Touch_UTM, THE UTM_Attribution SHALL write, as the new
   First_Touch_UTM, the trimmed value of each such present UTM_Field and NULL
   for each of the five UTM_Fields absent from the URL or empty after
   trimming.
4. WHEN `captureUtm` runs on any Marketing_Landing_Surface and
   Attribution_Storage already holds a First_Touch_UTM, THE UTM_Attribution
   SHALL leave the stored First_Touch_UTM unchanged for the remaining lifetime
   of the tab session.
5. THE UTM_Attribution SHALL NOT capture UTM parameters from any route outside
   the Marketing_Landing_Surface set of {PublicEventPage, LoginPage}.
6. IF `captureUtm` runs on any Marketing_Landing_Surface and every query
   parameter whose name is in the set {`utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, `utm_term`} is either absent or empty after
   trimming whitespace, THEN THE UTM_Attribution SHALL leave
   Attribution_Storage unchanged.
7. IF writing the First_Touch_UTM to Attribution_Storage fails, THEN THE
   UTM_Attribution SHALL leave any prior Attribution_Storage state intact and
   SHALL NOT propagate the failure as an unhandled error from `captureUtm`.

### Requirement 3: Speaker_Application Attribution at Submission

**User Story:** As a marketer, I want each Speaker_Application row to carry the
UTM values from the tab's First_Touch_UTM, so that I can measure which campaign
produced each speaker applicant.

#### Acceptance Criteria

1. WHEN SpeakerApplicationDialog issues a Speaker_Application insert, THE
   UTM_Attribution SHALL read the current First_Touch_UTM from
   Attribution_Storage via `loadStoredUtm` before the insert executes and
   SHALL include the five UTM_Fields returned by that read as five columns of
   the same insert operation, such that the persisted Speaker_Application
   row's five UTM_Fields equal the values returned by `loadStoredUtm` at read
   time.
2. IF Attribution_Storage holds no First_Touch_UTM when a Speaker_Application
   is submitted, THEN THE Speaker_Application row SHALL persist all five
   UTM_Fields as NULL rather than as empty strings.
3. IF reading Attribution_Storage throws an exception or returns unparseable
   data when a Speaker_Application is submitted, THEN THE UTM_Attribution
   SHALL proceed with the Speaker_Application insert and SHALL persist all
   five UTM_Fields on the inserted row as NULL.
4. WHEN a Speaker_Application submission succeeds, THE UTM_Attribution SHALL
   leave Attribution_Storage unchanged.
5. IF a Speaker_Application submission fails, THEN THE UTM_Attribution SHALL
   leave Attribution_Storage unchanged.

### Requirement 4: Sponsor_Application Attribution at Submission

**User Story:** As a marketer, I want each Sponsor_Application row to carry the
UTM values from the tab's First_Touch_UTM, so that I can measure which campaign
produced each sponsor applicant.

#### Acceptance Criteria

1. WHEN SponsorApplicationDialog submits a Sponsor_Application, THE
   UTM_Attribution SHALL read the current First_Touch_UTM from
   Attribution_Storage before issuing the insert and include its five
   UTM_Fields as columns on the Sponsor_Application row in that same insert
   operation.
2. IF Attribution_Storage holds no First_Touch_UTM at the moment
   SponsorApplicationDialog submits a Sponsor_Application, THEN THE
   Sponsor_Application row SHALL persist all five UTM_Fields as NULL rather
   than as empty strings.
3. THE UTM_Attribution SHALL leave Attribution_Storage unchanged after every
   Sponsor_Application submission attempt, regardless of whether the
   submission succeeded or failed.
4. IF reading First_Touch_UTM from Attribution_Storage throws an error or
   returns a value that is not a valid UTM record when a Sponsor_Application
   is submitted, THEN THE UTM_Attribution SHALL treat the First_Touch_UTM as
   absent and proceed to insert the Sponsor_Application row with all five
   UTM_Fields set to NULL.

### Requirement 5: Organizer_Signup Attribution at Account Creation

**User Story:** As a marketer, I want each new User_Profile to carry the UTM
values from the tab's First_Touch_UTM, so that I can measure which campaign
produced each organizer and attendee account.

#### Acceptance Criteria

1. WHEN LoginPage submits a `supabase.auth.signUp` request, THE
   UTM_Attribution SHALL read the current First_Touch_UTM from
   Attribution_Storage and include five keys named `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, and `utm_term` in the `options.data` payload
   sent with the sign-up request, with each key's value equal to the
   corresponding UTM_Field returned by `loadStoredUtm` or NULL when that
   UTM_Field is absent.
2. WHEN the `handle_new_user` auth trigger inserts a new User_Profile row, THE
   UTM_Attribution SHALL populate the new User_Profile's five UTM_Fields from
   the identically-named keys in the auth metadata written in acceptance
   criterion 5.1, mapping each metadata key to its same-named column and
   persisting missing metadata keys or empty-string values as SQL NULL
   (consistent with Requirement 1.5).
3. IF Attribution_Storage holds no First_Touch_UTM when a sign-up is
   submitted, THEN the `options.data` payload SHALL carry all five UTM keys
   with NULL values and the resulting User_Profile row SHALL persist all five
   UTM_Fields as NULL.
4. WHEN a `supabase.auth.signUp` request succeeds, THE UTM_Attribution SHALL
   leave Attribution_Storage unchanged so a subsequent Attendee_Registration
   or Application submission in the same tab still attributes to the same
   First_Touch_UTM.
5. IF a `supabase.auth.signUp` request fails, THEN THE UTM_Attribution SHALL
   leave Attribution_Storage unchanged so a retry of the same sign-up form
   re-reads the same First_Touch_UTM.

### Requirement 6: Attendee_Registration Attribution Non-Regression

**User Story:** As a marketer, I want the attendee attribution I already have
to keep working exactly as it does today, so that this spec does not silently
degrade the existing funnel data.

#### Acceptance Criteria

1. WHEN EventRsvpCard submits an Attendee_Registration, THE UTM_Attribution
   SHALL read the current First_Touch_UTM from Attribution_Storage and stamp
   its `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and
   `utm_term` values onto the correspondingly named UTM_Fields columns of the
   inserted Attendee_Registration row.
2. IF Attribution_Storage holds no First_Touch_UTM when an
   Attendee_Registration is submitted, THEN THE Attendee_Registration row
   SHALL persist all five UTM_Fields as NULL.
3. WHEN an Attendee_Registration submission returns a successful insert
   response from the backing data layer, THE UTM_Attribution SHALL invoke
   `clearStoredUtm` so that a subsequent `loadStoredUtm` call from the same
   tab returns no First_Touch_UTM.
4. WHEN RegistrationsSection.tsx renders an Attendee_Registration list row
   for an Organizer_View or Admin_View, THE Attribution_UI SHALL render an
   inline `via <utm_source>` hint under the attendee entry whenever that
   Attendee_Registration has a non-empty `utm_source`.
5. WHEN RegistrationsSection.tsx opens the RegistrantQuickView drawer for an
   Attendee_Registration whose row has at least one non-empty UTM_Field, THE
   Attribution_UI SHALL display the row's `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, and `utm_term` values, each labelled with
   its column name.
6. WHERE RegistrationsSection.tsx exposes the registrations CSV export, THE
   Attribution_Export SHALL include five contiguous columns named
   `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`,
   in that order, and SHALL emit an empty CSV cell for any of those five
   UTM_Field values that is NULL on the exported row.

### Requirement 7: Speaker_Application UTM Display in Attribution_UI

**User Story:** As an organizer, I want to see the UTM source on every speaker
applicant row and the full attribution set in the applicant detail dialog, so
that I know which campaign drove each applicant without opening a database
tool.

#### Acceptance Criteria

1. WHEN Attribution_UI renders a Speaker_Application row for an Organizer_View
   or Admin_View AND that Speaker_Application row's `utm_source` contains at
   least one non-whitespace character, THE Attribution_UI SHALL render an
   inline `via <utm_source>` hint under the applicant's contact line, with
   the `<utm_source>` value rendered as plain text.
2. IF a Speaker_Application row's `utm_source` is an Absent_UTM value, THEN
   THE Attribution_UI SHALL NOT render the `via` hint for that row and SHALL
   NOT substitute any placeholder text (em-dash, "None", "null", "n/a", or
   equivalent).
3. WHEN Attribution_UI opens the Speaker_Application detail dialog AND at
   least one of the row's five UTM_Fields contains a non-whitespace
   character, THE Attribution_UI SHALL render an "Attribution" section that
   displays the row's `utm_source`, `utm_medium`, `utm_campaign`,
   `utm_content`, and `utm_term` values in that exact order, each labelled
   with its column name.
4. WHEN Attribution_UI renders the Attribution section per criterion 3, IF a
   UTM_Field on that row is an Absent_UTM value, THEN THE Attribution_UI
   SHALL render that field's label and leave its value area empty rather
   than omitting the label or rendering placeholder text.
5. IF all five UTM_Fields on a Speaker_Application row are Absent_UTM values,
   THEN THE Attribution_UI SHALL omit the entire Attribution section
   (heading, labels, values) from that row's detail dialog rather than
   rendering an empty section.

### Requirement 8: Sponsor_Application UTM Display in Attribution_UI

**User Story:** As an organizer, I want the same UTM visibility on sponsor
applicants as on speaker applicants, so that both application funnels report
their sources consistently.

#### Acceptance Criteria

1. WHEN Attribution_UI renders a Sponsor_Application row for an Organizer_View
   or Admin_View AND that Sponsor_Application row's `utm_source` contains at
   least one non-whitespace character, THE Attribution_UI SHALL render an
   inline `via <utm_source>` hint directly beneath the applicant's
   contact-info line, with the `<utm_source>` value rendered as plain text.
2. IF a Sponsor_Application row's `utm_source` is an Absent_UTM value, THEN
   THE Attribution_UI SHALL NOT render the `via` hint for that row and SHALL
   NOT substitute any placeholder character or label.
3. WHEN Attribution_UI opens the Sponsor_Application detail dialog AND at
   least one of the row's five UTM_Fields contains a non-whitespace
   character, THE Attribution_UI SHALL render an "Attribution" section that
   displays the row's `utm_source`, `utm_medium`, `utm_campaign`,
   `utm_content`, and `utm_term` values in that exact order, each labelled
   with its column name.
4. WHEN Attribution_UI renders the Attribution section per criterion 3, IF a
   UTM_Field on that row is an Absent_UTM value, THEN THE Attribution_UI
   SHALL render that field's label and leave its value area empty rather
   than omitting the label or rendering placeholder text.
5. IF all five UTM_Fields on a Sponsor_Application row are Absent_UTM values,
   THEN THE Attribution_UI SHALL omit the entire Attribution section
   (heading, labels, values) from that row's detail dialog rather than
   rendering an empty section.

### Requirement 9: User_Profile UTM Display in Attribution_UI

**User Story:** As a platform admin, I want to see the UTM source on every user
row in the admin user list, so that I can attribute organizer sign-ups to the
campaign that produced them.

#### Acceptance Criteria

1. WHEN Attribution_UI renders a User_Profile row in UserManagementPage for
   an Admin_View AND the User_Profile's `utm_source` contains at least one
   non-whitespace character, THE Attribution_UI SHALL render an inline
   `via <utm_source>` hint in that row, truncating the displayed
   `<utm_source>` to a maximum of 64 rendered characters with a trailing
   ellipsis when the stored value exceeds 64 characters.
2. IF a User_Profile row's `utm_source` is an Absent_UTM value, THEN THE
   Attribution_UI SHALL NOT render the `via` hint for that row.
3. WHERE UserManagementPage exposes a user detail surface, WHEN at least one
   of the User_Profile's five UTM_Fields contains at least one non-whitespace
   character, THE Attribution_UI SHALL display all five fields in that
   surface with a fixed label for each field, rendering any field whose
   value is an Absent_UTM value as an explicit empty-state indicator that is
   visually distinct from a present value.
4. IF all five UTM_Fields on a User_Profile row are Absent_UTM values, THEN
   THE Attribution_UI SHALL NOT display the UTM attribution section in the
   user detail surface.

### Requirement 10: Speaker_Application and Sponsor_Application Attribution_Export

**User Story:** As an organizer, I want to download the applicant list as a CSV
that includes UTM columns, so that I can pull attribution into a marketing
spreadsheet.

#### Acceptance Criteria

1. WHEN an Organizer_View or Admin_View activates the CSV export action on
   the Speaker_Applications tab of ApplicationsSection, THE Attribution_UI
   SHALL produce an Attribution_Export containing one header row followed by
   one CSV row per Speaker_Application visible under the current filter, in
   the same order those rows are displayed in the UI.
2. WHEN an Organizer_View or Admin_View activates the CSV export action on
   the Sponsor_Applications tab of ApplicationsSection, THE Attribution_UI
   SHALL produce an Attribution_Export containing one header row followed by
   one CSV row per Sponsor_Application visible under the current filter, in
   the same order those rows are displayed in the UI.
3. THE Attribution_Export for Speaker_Applications SHALL include five
   contiguous trailing columns named `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, `utm_term`, in that order, with each header
   name matching the corresponding column position in every data row.
4. THE Attribution_Export for Sponsor_Applications SHALL include five
   contiguous trailing columns named `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, `utm_term`, in that order, with each header
   name matching the corresponding column position in every data row.
5. IF any exported CSV cell contains a comma, a double-quote, a carriage
   return, or a line feed, THEN THE Attribution_Export SHALL RFC 4180 escape
   that cell by wrapping the cell value in double quotes and doubling any
   interior double-quote characters.
6. IF RFC 4180 escaping of any Attribution_Export cell fails, THEN THE
   Attribution_Export SHALL abort file generation before any bytes are
   delivered to the user's browser, SHALL NOT deliver a partial or
   unescaped CSV, and SHALL surface a user-visible error message on
   ApplicationsSection identifying that the export was blocked, without
   revealing internal error details.
7. WHERE any UTM_Field value on an exported row is NULL, THE
   Attribution_Export SHALL emit that cell as an empty string with no
   surrounding whitespace and no double-quote wrapping.
8. IF the current filter tab contains zero Applications, THEN THE
   Attribution_Export SHALL still produce a valid CSV file consisting of
   the header row only, delivered to the user with no data rows.
9. THE Attribution_Export CSV file SHALL be encoded as UTF-8 without a byte
   order mark and SHALL use CRLF line terminators per RFC 4180.

### Requirement 11: User_Profile Attribution_Export

**User Story:** As a platform admin, I want to download the user list as a CSV
that includes UTM columns, so that I can measure organizer sign-up conversions
by campaign.

#### Acceptance Criteria

1. WHEN an Admin_View activates the CSV export action on UserManagementPage,
   THE Attribution_Export SHALL produce a UTF-8 encoded CSV containing one
   header row followed by one data row per exported User_Profile, and SHALL
   include five contiguous trailing columns named `utm_source`,
   `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, in that order.
2. IF any exported CSV cell contains a comma, a double-quote, a carriage
   return, or a line feed, THEN THE Attribution_Export SHALL RFC 4180 escape
   that cell by wrapping the cell value in double quotes and doubling any
   interior double-quote characters.
3. IF RFC 4180 escaping of any Attribution_Export cell fails, THEN THE
   Attribution_Export SHALL abort file generation before any bytes are
   delivered to the user's browser, SHALL NOT deliver a partial or
   unescaped CSV, and SHALL display a user-visible error message on
   UserManagementPage identifying that the export was blocked, without
   revealing internal error details.
4. IF any UTM_Field value on an exported row is an Absent_UTM value, THEN
   THE Attribution_Export SHALL emit that cell as an empty string with no
   surrounding whitespace and no double-quote wrapping, and SHALL NOT emit
   the literal text `null` or `NULL`.

### Requirement 12: Round-Trip Preservation of UTM_Fields Through Storage and Export

**User Story:** As a marketer, I want the UTM values I stamp on a marketing
link to arrive unchanged in the exported CSV, so that campaign IDs I paste back
into my ad platform still match.

#### Acceptance Criteria

1. WHEN `loadStoredUtm` returns a First_Touch_UTM that was written to
   Attribution_Storage by `captureUtm` on a Marketing_Landing_Surface, THE
   UTM_Attribution SHALL return each UTM_Field value character-for-character
   equal to the URL-decoded query parameter value with leading and trailing
   whitespace (as defined by JavaScript's `String.prototype.trim`) removed,
   up to a maximum of 512 characters after URL-decoding.
2. THE Attribution_Export SHALL emit each UTM_Field cell for a
   Conversion_Row character-for-character identical to the value persisted
   on that Conversion_Row, aside from RFC 4180 escaping applied per
   Requirements 10.5 and 11.2.
3. WHEN UTM_Attribution stamps a First_Touch_UTM read from
   Attribution_Storage onto a Conversion_Row at conversion time per
   Requirements 3.1, 4.1, 5.1, and 6.1, THE UTM_Attribution SHALL persist
   each of the five UTM_Field values on that Conversion_Row
   character-for-character identical to the value returned by
   `loadStoredUtm` at that moment.
4. IF a URL query parameter value for any UTM_Field on a
   Marketing_Landing_Surface exceeds 512 characters after URL-decoding and
   whitespace trimming, THEN THE UTM_Attribution SHALL truncate the value to
   its first 512 characters before writing it to Attribution_Storage.

### Requirement 13: Access Control for Attribution_UI and Attribution_Export

**User Story:** As a platform operator, I want UTM data restricted to the same
people who can already see the row it belongs to, so that this spec does not
widen data exposure.

#### Acceptance Criteria

1. THE Attribution_UI SHALL restrict display and export of a
   Speaker_Application row's UTM_Fields to the set of viewers already
   authorized to read that Speaker_Application row under existing
   row-level security policies, introducing no additional viewers.
2. THE Attribution_UI SHALL restrict display and export of a
   Sponsor_Application row's UTM_Fields to the set of viewers already
   authorized to read that Sponsor_Application row under existing
   row-level security policies, introducing no additional viewers.
3. THE Attribution_UI SHALL restrict display and export of a User_Profile
   row's UTM_Fields to the set of viewers already authorized to read that
   User_Profile row under existing row-level security policies, which for
   a full-row read is limited to Admin_View users.
4. IF a viewer without the required RLS grant attempts to read a
   Conversion_Row's UTM_Fields via Attribution_UI, THEN the underlying data
   layer SHALL exclude that Conversion_Row from the query result and SHALL
   NOT return any of its UTM_Field values.
5. IF a viewer without the required RLS grant attempts to export a
   Conversion_Row via Attribution_Export, THEN THE Attribution_Export SHALL
   omit that Conversion_Row entirely from the output rather than emitting
   the row with blanked UTM_Field cells.

### Requirement 14: Absence Rendering Consistency

**User Story:** As an organizer, I want rows without UTM data to look clean,
so that empty attribution does not clutter the applicant and user lists.

#### Acceptance Criteria

1. THE Attribution_UI and Attribution_Export SHALL treat any UTM_Field that
   is SQL NULL, an empty string after trim, or a string containing only
   whitespace characters (per the Absent_UTM glossary term) as absent for
   the purposes of every rendering and emission decision in Requirements
   6 through 11.
2. THE Attribution_UI SHALL render zero characters in place of an
   Absent_UTM `utm_source` on any Conversion_Row list item — specifically,
   SHALL NOT render an em-dash (`—`), a hyphen (`-`), a bullet (`•`), or
   the tokens `None`, `null`, `N/A`, `n/a`, `Unknown`, `undefined` in any
   case, and SHALL NOT render the `via` hint's `via` keyword when
   `<utm_source>` would resolve to a zero-character string.
3. IF all five UTM_Fields on a Conversion_Row detail surface are Absent_UTM
   values, THEN THE Attribution_UI SHALL omit the Attribution section's
   heading, per-field labels, and any framing chrome (border, panel, or
   divider that visually delimits the section) rather than rendering an
   empty container.
4. WHERE any UTM_Field value on an exported row is an Absent_UTM value, THE
   Attribution_Export SHALL emit that cell as zero characters between its
   surrounding delimiters and SHALL NOT emit the literal tokens `null`,
   `NULL`, `None`, or `n/a` in any case.
5. THE Attribution_Export SHALL preserve the five UTM_Fields columns
   required by Requirements 10.3, 10.4, and 11.1 in both the header row and
   in every data row regardless of how many values in those columns are
   Absent_UTM, so downstream spreadsheet consumers see a consistent column
   layout across every export.
