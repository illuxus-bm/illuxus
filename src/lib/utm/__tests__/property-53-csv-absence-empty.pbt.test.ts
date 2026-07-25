// Feature: utm-attribution-coverage, Property 53: Absent UTM emits zero characters
//
// Validates: Requirements 10.7, 11.4, 14.1, 14.4
//
// Property 53: `escapeCsvCell(null)` and `escapeCsvCell(undefined)` each
// emit exactly zero characters — never the literal placeholder text
// `"null"`, `"NULL"`, `"None"`, or `"n/a"`. Similarly the empty string
// emits zero characters. Whitespace-only strings are preserved verbatim
// (pre-trimming is a caller's responsibility, not the escaper's).

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { escapeCsvCell } from "../csv-escape";

const FORBIDDEN_PLACEHOLDERS = ["null", "NULL", "None", "n/a"] as const;

describe("Property 53: Absent UTM emits zero characters", () => {
  it("escapeCsvCell(null) === '' and escapeCsvCell(undefined) === ''", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("escapeCsvCell('') === ''", () => {
    expect(escapeCsvCell("")).toBe("");
  });

  it("escapeCsvCell('   ') preserves whitespace as-is (caller pre-trims)", () => {
    expect(escapeCsvCell("   ")).toBe("   ");
  });

  it("absent values never render forbidden placeholder text", () => {
    fc.assert(
      fc.property(fc.constantFrom<null | undefined>(null, undefined), (v) => {
        const out = escapeCsvCell(v);
        if (out !== "") return false;
        for (const bad of FORBIDDEN_PLACEHOLDERS) {
          if (out === bad) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
