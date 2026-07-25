// Feature: utm-attribution-coverage, Property 54: Applications CSV header layout
//
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 14.5
//
// Property 54: For any array of Speaker_Application or Sponsor_Application
// rows, the CSV produced by `buildSpeakerApplicationsCsv` /
// `buildSponsorApplicationsCsv` starts with the exact, byte-for-byte
// header line the design specifies — six domain columns first, then the
// five contiguous trailing UTM columns in the fixed order
// `utm_source,utm_medium,utm_campaign,utm_content,utm_term`.
//
// This is a structural invariant: downstream spreadsheet consumers rely
// on a stable column layout across every export (Requirement 14.5), so
// the header row must be independent of the number, shape, or content
// of the data rows.

import { describe, it } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerApplicationsCsv,
  buildSponsorApplicationsCsv,
  type SpeakerApplicationRow,
  type SponsorApplicationRow,
} from "../applications-csv";

const SPEAKER_HEADER =
  "Name,Email,Company,Session Title,Status,Submitted At,utm_source,utm_medium,utm_campaign,utm_content,utm_term";

const SPONSOR_HEADER =
  "Company,Contact Name,Contact Email,Tier,Status,Submitted At,utm_source,utm_medium,utm_campaign,utm_content,utm_term";

// Generator for a single Speaker_Application row. Every field is
// optional-or-nullable so the property exercises the full absence
// space (null, undefined, empty string) alongside populated values.
// `created_at` is generated as a valid ISO-8601 date string when
// present so the builder's `new Date(...).toISOString()` normalization
// does not throw.
const arbSpeakerRow: fc.Arbitrary<SpeakerApplicationRow> = fc.record(
  {
    name: fc.option(fc.string(), { nil: undefined }),
    email: fc.option(fc.string(), { nil: undefined }),
    company: fc.option(fc.string(), { nil: undefined }),
    session_title: fc.option(fc.string(), { nil: undefined }),
    status: fc.option(fc.string(), { nil: undefined }),
    created_at: fc.option(
      fc.date({ min: new Date("1970-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z") }).map((d) => d.toISOString()),
      { nil: undefined },
    ),
    utm_source: fc.option(fc.string(), { nil: undefined }),
    utm_medium: fc.option(fc.string(), { nil: undefined }),
    utm_campaign: fc.option(fc.string(), { nil: undefined }),
    utm_content: fc.option(fc.string(), { nil: undefined }),
    utm_term: fc.option(fc.string(), { nil: undefined }),
  },
  { requiredKeys: [] },
);

// Same shape for Sponsor_Application rows.
const arbSponsorRow: fc.Arbitrary<SponsorApplicationRow> = fc.record(
  {
    company_name: fc.option(fc.string(), { nil: undefined }),
    contact_name: fc.option(fc.string(), { nil: undefined }),
    contact_email: fc.option(fc.string(), { nil: undefined }),
    tier: fc.option(fc.string(), { nil: undefined }),
    status: fc.option(fc.string(), { nil: undefined }),
    created_at: fc.option(
      fc.date({ min: new Date("1970-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z") }).map((d) => d.toISOString()),
      { nil: undefined },
    ),
    utm_source: fc.option(fc.string(), { nil: undefined }),
    utm_medium: fc.option(fc.string(), { nil: undefined }),
    utm_campaign: fc.option(fc.string(), { nil: undefined }),
    utm_content: fc.option(fc.string(), { nil: undefined }),
    utm_term: fc.option(fc.string(), { nil: undefined }),
  },
  { requiredKeys: [] },
);

describe("Property 54: Applications CSV header layout", () => {
  it("buildSpeakerApplicationsCsv(rows) starts with the exact speaker header line", () => {
    fc.assert(
      fc.property(fc.array(arbSpeakerRow, { maxLength: 20 }), (rows) => {
        const csv = buildSpeakerApplicationsCsv(rows);
        // Header is the entire document when rows is empty; otherwise it
        // is followed by CRLF and the first data row.
        if (rows.length === 0) {
          return csv === SPEAKER_HEADER;
        }
        return csv.startsWith(`${SPEAKER_HEADER}\r\n`);
      }),
      { numRuns: 100 },
    );
  });

  it("buildSponsorApplicationsCsv(rows) starts with the exact sponsor header line", () => {
    fc.assert(
      fc.property(fc.array(arbSponsorRow, { maxLength: 20 }), (rows) => {
        const csv = buildSponsorApplicationsCsv(rows);
        if (rows.length === 0) {
          return csv === SPONSOR_HEADER;
        }
        return csv.startsWith(`${SPONSOR_HEADER}\r\n`);
      }),
      { numRuns: 100 },
    );
  });
});
