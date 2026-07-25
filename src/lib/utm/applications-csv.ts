import { buildCsvDocument } from "./csv-escape";

/**
 * Row shape consumed by `buildSpeakerApplicationsCsv`.
 *
 * `speaker_applications` is not currently listed in
 * `src/integrations/supabase/types.ts` — existing callers cast their
 * Supabase reads via `as never`. Rather than expand that type file (a
 * larger design decision reserved for a future spec), this module
 * defines the minimum shape it needs to build a CSV row. Callers cast
 * their fetched rows to this type before invoking the builder.
 *
 * Every field is nullable so absent values flow through as an empty
 * cell per Requirements 10.7 / 14.4.
 */
export interface SpeakerApplicationRow {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  session_title?: string | null;
  status?: string | null;
  created_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}

/**
 * Row shape consumed by `buildSponsorApplicationsCsv`. Same rationale
 * as `SpeakerApplicationRow` — see that doc comment.
 */
export interface SponsorApplicationRow {
  company_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  tier?: string | null;
  status?: string | null;
  created_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}

/** Five contiguous trailing UTM header columns per Requirements 10.3
 *  and 10.4. Ordering is normative — do not permute. */
const UTM_HEADERS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** Speaker_Application CSV header row per Requirements 10.1 and 10.3. */
const SPEAKER_HEADERS = [
  "Name",
  "Email",
  "Company",
  "Session Title",
  "Status",
  "Submitted At",
  ...UTM_HEADERS,
] as const;

/** Sponsor_Application CSV header row per Requirements 10.2 and 10.4. */
const SPONSOR_HEADERS = [
  "Company",
  "Contact Name",
  "Contact Email",
  "Tier",
  "Status",
  "Submitted At",
  ...UTM_HEADERS,
] as const;

/**
 * Builds the Speaker_Application CSV per Requirements 10.1, 10.3, and
 * 10.5. Domain columns come first, followed by the five contiguous
 * trailing UTM columns.
 *
 * Every UTM_Field cell is passed through verbatim to `buildCsvDocument`
 * so NULL / undefined values are emitted as empty strings per
 * Requirements 10.7 / 14.4 — never the literal text `"null"`.
 *
 * `created_at` is normalized to an ISO-8601 string when present so
 * downstream spreadsheet consumers see a stable, sortable timestamp.
 *
 * Escape failures propagate as {@link CsvEscapeError} from
 * `buildCsvDocument`, so the caller aborts the download before any
 * bytes are delivered to the browser per Requirement 10.6.
 *
 * Empty `rows` produce a header-only CSV per Requirement 10.8.
 *
 * Pure.
 */
export function buildSpeakerApplicationsCsv(
  rows: readonly SpeakerApplicationRow[]
): string {
  const dataRows: readonly (readonly unknown[])[] = rows.map((r) => [
    r.name ?? "",
    r.email ?? "",
    r.company ?? "",
    r.session_title ?? "",
    r.status ?? "",
    r.created_at ? new Date(r.created_at).toISOString() : "",
    r.utm_source ?? "",
    r.utm_medium ?? "",
    r.utm_campaign ?? "",
    r.utm_content ?? "",
    r.utm_term ?? "",
  ]);
  return buildCsvDocument(SPEAKER_HEADERS, dataRows);
}

/**
 * Builds the Sponsor_Application CSV per Requirements 10.2, 10.4, and
 * 10.5. Shape mirrors {@link buildSpeakerApplicationsCsv} — see that
 * doc comment for absence semantics, escape-failure behavior, and
 * empty-rows behavior.
 *
 * Pure.
 */
export function buildSponsorApplicationsCsv(
  rows: readonly SponsorApplicationRow[]
): string {
  const dataRows: readonly (readonly unknown[])[] = rows.map((r) => [
    r.company_name ?? "",
    r.contact_name ?? "",
    r.contact_email ?? "",
    r.tier ?? "",
    r.status ?? "",
    r.created_at ? new Date(r.created_at).toISOString() : "",
    r.utm_source ?? "",
    r.utm_medium ?? "",
    r.utm_campaign ?? "",
    r.utm_content ?? "",
    r.utm_term ?? "",
  ]);
  return buildCsvDocument(SPONSOR_HEADERS, dataRows);
}

/**
 * Triggers a browser download of a UTF-8 CSV blob with a `.csv` file
 * extension. Shared by every UI export in the UTM_Attribution feature —
 * the two Applications tabs in `ApplicationsSection.tsx` and the
 * admin user list in `UserManagementPage.tsx`.
 *
 * The blob is created with MIME `text/csv;charset=utf-8` so browsers
 * decode the response as UTF-8 (Requirement 10.9). The temporary
 * anchor element is inserted into the document, clicked, and removed
 * synchronously; the object URL is revoked after 1 second to give the
 * browser time to start the download while still releasing the URL
 * afterwards.
 *
 * Side-effecting: requires a browser environment (`document`, `Blob`,
 * `URL.createObjectURL`).
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
