// Feature: social-creative-generator, Property 5: Sponsor tier accent color mapping
//
// Validates: Requirements 3.4
//
// Property 5: For all sponsor tier values (`platinum`, `gold`, `silver`,
// `bronze`, `custom`), `tierAccentColor(tier)` returns a deterministic,
// non-empty color string, and for any unrecognized tier value it falls back
// to the same color as `"bronze"`.
//
// Note: comparing directly against SponsorManagement.tsx's `TIERS` mapping
// isn't testable here — that component uses Tailwind classes referencing CSS
// custom properties (theme-reactive, for screen UI), whereas `tierAccentColor`
// intentionally returns literal canvas-usable colors instead (see the
// implementation notes in `creative-templates.ts`, task 3.6). So this test
// verifies the documented, canvas-usable contract instead: valid color
// literals, determinism, and the unrecognized-tier fallback to "bronze".

import { describe, it } from "vitest";
import fc from "fast-check";

import { tierAccentColor } from "../creative-templates";

const KNOWN_TIERS = ["platinum", "gold", "silver", "bronze", "custom"] as const;

const HSL_PATTERN = /^hsl\(\s*-?\d+(\.\d+)?\s*,\s*\d+(\.\d+)?%\s*,\s*\d+(\.\d+)?%\s*\)$/i;
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

const isCanvasUsableColorLiteral = (color: string): boolean =>
  color.length > 0 &&
  (HSL_PATTERN.test(color) || HEX_PATTERN.test(color)) &&
  !color.startsWith("var(") &&
  !color.startsWith("bg-");

const arbKnownTier = fc.constantFrom(...KNOWN_TIERS);

const arbUnknownTier = fc
  .string()
  .filter((s) => !KNOWN_TIERS.includes(s as (typeof KNOWN_TIERS)[number]));

describe("Property 5: Sponsor tier accent color mapping", () => {
  it("returns a non-empty, canvas-usable color literal for every known tier", () => {
    fc.assert(
      fc.property(arbKnownTier, (tier) => {
        const color = tierAccentColor(tier);
        return isCanvasUsableColorLiteral(color);
      }),
      { numRuns: 100 }
    );
  });

  it("is deterministic — the same tier always returns the identical color string", () => {
    fc.assert(
      fc.property(arbKnownTier, (tier) => {
        const first = tierAccentColor(tier);
        const second = tierAccentColor(tier);
        return first === second;
      }),
      { numRuns: 100 }
    );
  });

  it("falls back to the same color as 'bronze' for any unrecognized tier value", () => {
    fc.assert(
      fc.property(arbUnknownTier, (unknownTier) => {
        return tierAccentColor(unknownTier) === tierAccentColor("bronze");
      }),
      { numRuns: 100 }
    );
  });
});
