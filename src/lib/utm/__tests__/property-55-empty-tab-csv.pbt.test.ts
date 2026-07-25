// Feature: utm-attribution-coverage, Property 55: Empty tab produces header-only CSV
//
// Validates: Requirements 10.8
//
// Property 55: When the current Applications filter tab contains zero
// rows, `buildSpeakerApplicationsCsv([])` and
// `buildSponsorApplicationsCsv([])` each return exactly the header
// line — no data rows, no trailing CRLF. This guarantees the
// Attribution_Export still delivers a valid CSV file consisting of
// the header row only when the tab is empty.
//
// The property is trivially over empty input, so this file also
// includes a concrete example assertion in a plain `it` block —
// keeping the file consistent with the fast-check-based Property 54
// while making the invariant obvious to a human reader.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerApplicationsCsv,
  buildSponsorApplicationsCsv,
} from "../applications-csv";

const SPEAKER_HEADER =
  "Name,Email,Company,Session Title,Status,Submitted At,utm_source,utm_medium,utm_campaign,utm_content,utm_term";

const SPONSOR_HEADER =
  "Company,Contact Name,Contact Email,Tier,Status,Submitted At,utm_source,utm_medium,utm_campaign,utm_content,utm_term";

describe("Property 55: Empty tab produces header-only CSV", () => {
  it("buildSpeakerApplicationsCsv([]) === speaker header (no CRLF suffix)", () => {
    expect(buildSpeakerApplicationsCsv([])).toBe(SPEAKER_HEADER);
  });

  it("buildSponsorApplicationsCsv([]) === sponsor header (no CRLF suffix)", () => {
    expect(buildSponsorApplicationsCsv([])).toBe(SPONSOR_HEADER);
  });

  // A property-based framing of the same invariant: for any empty
  // input array (there is only one, so this is degenerate, but it
  // preserves the fast-check-first testing pattern across the utm
  // module and guards against accidental mutation of the empty-array
  // path in future refactors).
  it("buildSpeakerApplicationsCsv([]) equals the header string exactly, across 100 runs", () => {
    fc.assert(
      fc.property(fc.constant([] as const), (rows) => {
        return buildSpeakerApplicationsCsv(rows) === SPEAKER_HEADER;
      }),
      { numRuns: 100 },
    );
  });

  it("buildSponsorApplicationsCsv([]) equals the header string exactly, across 100 runs", () => {
    fc.assert(
      fc.property(fc.constant([] as const), (rows) => {
        return buildSponsorApplicationsCsv(rows) === SPONSOR_HEADER;
      }),
      { numRuns: 100 },
    );
  });
});
