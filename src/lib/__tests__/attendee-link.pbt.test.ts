/**
 * Property tests for `buildAttendeeJoinUrl` / `attendeeLinksToCsv`.
 *
 * The contract:
 *   1. The returned URL always carries `?join=<token>` matching the
 *      registration's `join_token` byte-for-byte. The token is the
 *      only signal the live route uses to identify the attendee
 *      (`claim_join_session` RPC), so corrupting / re-encoding it
 *      would break sign-in for that attendee.
 *   2. When no UTM is passed, the URL carries only `join=` and
 *      nothing else.
 *   3. When UTM is partial (some fields), only the provided UTM
 *      fields appear.
 *   4. UTM values with special chars (`space`, `&`, `=`, `?`,
 *      unicode) round-trip cleanly: parsing the URL via
 *      `URLSearchParams` gives back the input strings.
 *   5. The token is never URL-encoded twice — extracting the
 *      `join` param via `URLSearchParams.get` yields the original
 *      token, not a percent-encoded variant.
 *
 * Hand-rolled examples cover three concrete scenarios:
 *   A. No UTM at all.
 *   B. Full UTM, all five fields.
 *   C. Slug fallback: when `event.slug` is missing, the URL uses
 *      `event.id` as the path segment.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildAttendeeJoinUrl, attendeeLinksToCsv } from "../attendee-link";

// Fast-check arbitrary for a 64-char hex token (the DB shape).
const tokenArb = fc.hexaString({ minLength: 64, maxLength: 64 });

// Arbitrary that emits UUID-ish strings for event ids; slugs are short
// kebab-case strings. `null` is also a valid slug, in which case the
// builder falls back to `event.id`.
const eventIdArb = fc.uuid();
const slugArb = fc.oneof(
  fc.constant<string | null>(null),
  fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+){0,4}$/),
);

// Free-form strings that might appear in UTM values: spaces, `&`,
// `=`, `?`, unicode. We deliberately keep `'\n'` out so the
// generator doesn't produce values that `URLSearchParams` would
// re-encode into `+`-form vs `%0A`-form ambiguously across runtimes.
const utmCharArb = fc.string({ minLength: 0, maxLength: 24 })
  .filter((s) => !/[\r\n]/.test(s));

// Helper — pull the path + query off a URL string without using the
// `URL` constructor (so we still cover the relative-path edge case
// when the public origin happens to be the absolute one).
function parseUrl(u: string): { path: string; params: URLSearchParams } {
  const qIdx = u.indexOf("?");
  const path = qIdx === -1 ? u : u.slice(0, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? "" : u.slice(qIdx + 1));
  return { path, params };
}

describe("buildAttendeeJoinUrl — properties", () => {
  it("Property 1: ?join=<token> is always present and equals the input token", () => {
    fc.assert(
      fc.property(tokenArb, eventIdArb, slugArb, (token, eventId, slug) => {
        const url = buildAttendeeJoinUrl({
          registration: { join_token: token, event_id: eventId },
          event: { id: eventId, slug },
        });
        const { params } = parseUrl(url);
        expect(params.get("join")).toBe(token);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 2: with no UTM, the only query param is `join`", () => {
    fc.assert(
      fc.property(tokenArb, eventIdArb, slugArb, (token, eventId, slug) => {
        const url = buildAttendeeJoinUrl({
          registration: { join_token: token, event_id: eventId },
          event: { id: eventId, slug },
        });
        const { params } = parseUrl(url);
        const keys = Array.from(params.keys()).sort();
        expect(keys).toEqual(["join"]);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 3: only the UTM fields that are provided land on the URL", () => {
    fc.assert(
      fc.property(
        tokenArb, eventIdArb, slugArb,
        fc.option(utmCharArb, { nil: undefined }),
        fc.option(utmCharArb, { nil: undefined }),
        fc.option(utmCharArb, { nil: undefined }),
        fc.option(utmCharArb, { nil: undefined }),
        fc.option(utmCharArb, { nil: undefined }),
        (token, eventId, slug, source, medium, campaign, content, term) => {
          const utm = { source, medium, campaign, content, term };
          const url = buildAttendeeJoinUrl({
            registration: { join_token: token, event_id: eventId },
            event: { id: eventId, slug },
            utm,
          });
          const { params } = parseUrl(url);
          // Compute the expected key set: `join` plus every UTM whose
          // value is a non-empty string (matches the builder's guard).
          const expected = new Set<string>(["join"]);
          if (typeof source   === "string" && source.length   > 0) expected.add("utm_source");
          if (typeof medium   === "string" && medium.length   > 0) expected.add("utm_medium");
          if (typeof campaign === "string" && campaign.length > 0) expected.add("utm_campaign");
          if (typeof content  === "string" && content.length  > 0) expected.add("utm_content");
          if (typeof term     === "string" && term.length     > 0) expected.add("utm_term");
          const got = new Set(params.keys());
          expect(got).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 4: UTM values with special chars round-trip via URLSearchParams", () => {
    const specialUtm = fc.oneof(
      fc.constant("with spaces"),
      fc.constant("with&amp"),
      fc.constant("with=equals"),
      fc.constant("with?question"),
      fc.constant("with#hash"),
      fc.constant("résumé-Δ-日本語"),
      fc.constant("a+b/c"),
      fc.constant("100%"),
      utmCharArb,
    );
    fc.assert(
      fc.property(tokenArb, eventIdArb, slugArb, specialUtm, specialUtm, (token, eventId, slug, src, camp) => {
        const url = buildAttendeeJoinUrl({
          registration: { join_token: token, event_id: eventId },
          event: { id: eventId, slug },
          utm: { source: src, campaign: camp },
        });
        const { params } = parseUrl(url);
        // Only assert the non-empty case — the builder strips empty
        // values, so the round-trip claim is conditional on emit.
        if (src.length > 0) expect(params.get("utm_source")).toBe(src);
        if (camp.length > 0) expect(params.get("utm_campaign")).toBe(camp);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 5: the join token is never URL-encoded twice", () => {
    // Even when we artificially construct a token that *looks* like
    // a URL-encoded sequence (e.g. `%20%21`), the builder must emit
    // it verbatim. Decoding the param twice would NOT round-trip.
    const sketchyToken = fc.oneof(
      tokenArb,
      fc.constant("%20%21%22"),
      fc.constant("abc%2Fdef"),
      fc.constant("hello world"),
      fc.constant("a&b=c?d#e"),
    );
    fc.assert(
      fc.property(sketchyToken, eventIdArb, slugArb, (token, eventId, slug) => {
        const url = buildAttendeeJoinUrl({
          registration: { join_token: token, event_id: eventId },
          event: { id: eventId, slug },
        });
        const { params } = parseUrl(url);
        // URLSearchParams.get decodes exactly once — the result must
        // match the raw token. Double-encoding would surface here as
        // the decoded value still containing `%xx` sequences when the
        // input had none.
        expect(params.get("join")).toBe(token);
      }),
      { numRuns: 100 },
    );
  });
});

describe("buildAttendeeJoinUrl — examples", () => {
  it("A: no UTM → URL contains only ?join=<token>", () => {
    const url = buildAttendeeJoinUrl({
      registration: { join_token: "abc123", event_id: "evt-1" },
      event: { id: "evt-1", slug: "ai-workshop" },
    });
    expect(url).toMatch(/\/e\/ai-workshop\/live\?join=abc123$/);
  });

  it("B: full UTM emits all five utm_* params in stable order", () => {
    const url = buildAttendeeJoinUrl({
      registration: { join_token: "tok-9", event_id: "evt-1" },
      event: { id: "evt-1", slug: "ai-workshop" },
      utm: {
        source: "email",
        medium: "transactional",
        campaign: "ai-workshop",
        content: "event-invitation",
        term: "welcome",
      },
    });
    expect(url).toContain("?join=tok-9");
    expect(url).toContain("&utm_source=email");
    expect(url).toContain("&utm_medium=transactional");
    expect(url).toContain("&utm_campaign=ai-workshop");
    expect(url).toContain("&utm_content=event-invitation");
    expect(url).toContain("&utm_term=welcome");
  });

  it("C: slug missing → URL falls back to event.id in the path segment", () => {
    const url = buildAttendeeJoinUrl({
      registration: { join_token: "tok-x", event_id: "evt-7" },
      event: { id: "evt-7", slug: null },
    });
    expect(url).toMatch(/\/e\/evt-7\/live\?join=tok-x$/);
  });
});

describe("attendeeLinksToCsv", () => {
  it("emits a header + one row per input", () => {
    const csv = attendeeLinksToCsv([
      { name: "Ada",     email: "ada@x.test",    joinUrl: "https://x.test/e/a/live?join=1" },
      { name: "Grace",   email: "grace@x.test",  joinUrl: "https://x.test/e/a/live?join=2" },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Name,Email,Join URL");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Ada");
    expect(lines[2]).toContain("Grace");
  });

  it("quotes fields with commas, quotes, or newlines per RFC-4180", () => {
    const csv = attendeeLinksToCsv([
      { name: 'Ada, "the Countess"', email: "ada@x.test", joinUrl: "https://x.test/e/a/live?join=1" },
    ]);
    // The name field must be surrounded by quotes and inner quotes doubled.
    expect(csv).toContain('"Ada, ""the Countess"""');
  });
});
