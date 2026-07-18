// Feature: event-brochure-generator, Property 38: Venue section content assembly and inclusion
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
//
// For any combination of (possibly absent) `venue`, `location`,
// `mapEmbedUrl`, `parkingNotes`, and `transitNotes` values, the
// venue-section content-assembly function includes exactly the subset of
// these fields that are non-empty strings (a QR-code element only when
// `mapEmbedUrl` is non-empty), and the Venue_Logistics_Section inclusion
// decision returns "render" if and only if at least one of `venue`,
// `location`, `parkingNotes`, or `transitNotes` is a non-empty string.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildVenueLogisticsContent, type VenueLogisticsInput } from "../brochure-sections";

/** Arbitrary that generates strings including empty/whitespace-only values
 *  and null/undefined, so `.trim()`-emptiness is exercised. */
const arbMaybeString = fc.option(
  fc.oneof(
    fc.constant(""),
    fc.constant("   "),
    fc.string({ minLength: 1, maxLength: 20 })
  ),
  { nil: undefined }
);

const arbInput: fc.Arbitrary<VenueLogisticsInput> = fc.record({
  venue: arbMaybeString,
  location: arbMaybeString,
  mapEmbedUrl: arbMaybeString,
  parkingNotes: arbMaybeString,
  transitNotes: arbMaybeString,
});

function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

describe("Property 38: Venue section content assembly and inclusion", () => {
  it("includes exactly the non-empty (post-trim) fields and sets qrCodeSourceUrl iff mapEmbedUrl is non-empty", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const content = buildVenueLogisticsContent(input);

        const shouldRender = isNonEmpty(input.venue) || isNonEmpty(input.location) || isNonEmpty(input.parkingNotes) || isNonEmpty(input.transitNotes);

        if (!shouldRender) {
          expect(content).toBeNull();
          return;
        }

        expect(content).not.toBeNull();
        const c = content!;

        if (isNonEmpty(input.venue)) {
          expect(c.venueName).toBe((input.venue as string).trim());
        } else {
          expect(c.venueName).toBeUndefined();
        }

        if (isNonEmpty(input.location)) {
          expect(c.address).toBe((input.location as string).trim());
        } else {
          expect(c.address).toBeUndefined();
        }

        if (isNonEmpty(input.parkingNotes)) {
          expect(c.parkingNotes).toBe((input.parkingNotes as string).trim());
        } else {
          expect(c.parkingNotes).toBeUndefined();
        }

        if (isNonEmpty(input.transitNotes)) {
          expect(c.transitNotes).toBe((input.transitNotes as string).trim());
        } else {
          expect(c.transitNotes).toBeUndefined();
        }

        if (isNonEmpty(input.mapEmbedUrl)) {
          expect(c.qrCodeSourceUrl).toBe((input.mapEmbedUrl as string).trim());
        } else {
          expect(c.qrCodeSourceUrl).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it("returns null when only mapEmbedUrl is set (a map URL alone does not force rendering)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 30 }), (mapEmbedUrl) => {
        const content = buildVenueLogisticsContent({ mapEmbedUrl });
        expect(content).toBeNull();
      }),
      { numRuns: 20 }
    );
  });
});
