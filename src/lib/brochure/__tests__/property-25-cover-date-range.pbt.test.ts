// Feature: event-brochure-generator, Property 25: Cover date-range formatting
//
// Validates: Requirements 2.2
//
// For any `date` and any (possibly absent) `end_date`, the cover
// date-formatting function renders a single formatted date when `end_date`
// is absent or equal to `date`, and renders a range containing both
// formatted dates when `end_date` is defined and differs from `date`.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { format as formatDate } from "date-fns";

import { formatCoverDateRange } from "../brochure-sections";

const COVER_DATE_FORMAT = "MMM d, yyyy";

const arbIsoDate = fc
  .date({ min: new Date("2000-01-01T00:00:00.000Z"), max: new Date("2100-01-01T00:00:00.000Z") })
  .map((d) => d.toISOString());

describe("Property 25: Cover date-range formatting", () => {
  it("renders a single date when end_date is absent", () => {
    fc.assert(
      fc.property(arbIsoDate, (date) => {
        const result = formatCoverDateRange(date);
        expect(result).toBe(formatDate(new Date(date), COVER_DATE_FORMAT));
      }),
      { numRuns: 100 }
    );
  });

  it("renders a single date when end_date equals date", () => {
    fc.assert(
      fc.property(arbIsoDate, (date) => {
        const result = formatCoverDateRange(date, date);
        expect(result).toBe(formatDate(new Date(date), COVER_DATE_FORMAT));
      }),
      { numRuns: 100 }
    );
  });

  it("renders a range containing both formatted dates when end_date differs from date", () => {
    fc.assert(
      fc.property(arbIsoDate, arbIsoDate, (date, endDate) => {
        fc.pre(new Date(date).getTime() !== new Date(endDate).getTime());

        const result = formatCoverDateRange(date, endDate);

        const startText = formatDate(new Date(date), COVER_DATE_FORMAT);
        const endText = formatDate(new Date(endDate), COVER_DATE_FORMAT);

        expect(result).toContain(startText);
        expect(result).toContain(endText);
        expect(result).not.toBe(startText);
      }),
      { numRuns: 100 }
    );
  });

  it("treats null end_date the same as an absent one", () => {
    fc.assert(
      fc.property(arbIsoDate, (date) => {
        expect(formatCoverDateRange(date, null)).toBe(formatCoverDateRange(date));
      }),
      { numRuns: 50 }
    );
  });
});
