// Feature: utm-attribution-coverage, Property 52: RFC 4180 round-trip through escape and parse is identity
//
// Validates: Requirements 10.5, 11.2, 12.2
//
// Property 52: For any string `v`, `parseCsvCell(escapeCsvCell(v)) === v`.
//
// The test file includes a minimal RFC 4180 `parseCsvCell` inverse that
// mirrors the escaper: if the cell is wrapped in double-quotes, strip the
// outer wrappers and halve every interior doubled quote; otherwise return
// the cell as-is. This guarantees that any string — including empty
// strings and strings containing commas, double-quotes, CR, LF, or
// whitespace — survives an escape→parse round-trip without loss.
//
// Note: for null/undefined the round-trip is `escape(null) === "" === parse("")`,
// so those are excluded from the arbitrary — Property 53 covers the absent case.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { escapeCsvCell } from "../csv-escape";

/**
 * Minimal RFC 4180 CSV cell parser (inverse of `escapeCsvCell` for strings).
 *
 * If `cell` begins and ends with a double-quote (and is at least two chars
 * long), the outer double-quotes are stripped and every doubled interior
 * double-quote (`""`) is halved to a single one (`"`). Otherwise the cell
 * is returned as-is.
 */
function parseCsvCell(cell: string): string {
  if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
    const interior = cell.slice(1, -1);
    return interior.replace(/""/g, '"');
  }
  return cell;
}

describe("Property 52: RFC 4180 round-trip through escape and parse is identity", () => {
  it("parseCsvCell(escapeCsvCell(v)) === v for any string v", () => {
    fc.assert(
      fc.property(fc.string(), (v) => {
        const escaped = escapeCsvCell(v);
        const parsed = parseCsvCell(escaped);
        return parsed === v;
      }),
      { numRuns: 100 }
    );
  });

  it("round-trips example strings with special characters", () => {
    const examples = [
      "",
      "hello",
      "hello,world",
      'she said "hi"',
      "line1\r\nline2",
      "   leading and trailing   ",
      ',",\r\n',
      '"',
      '""',
    ];
    for (const v of examples) {
      expect(parseCsvCell(escapeCsvCell(v))).toBe(v);
    }
  });
});
