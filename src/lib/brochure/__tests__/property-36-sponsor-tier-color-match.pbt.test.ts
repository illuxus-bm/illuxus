// Feature: event-brochure-generator, Property 36: Sponsor tier accent color matches the existing tier color mapping
//
// Validates: Requirements 5.5
//
// For all Sponsor_Tier values (`platinum`, `gold`, `silver`, `bronze`,
// `custom`), the brochure's tier-heading accent-color function returns the
// same color as the existing `tierAccentColor` mapping in
// `creative-templates.ts` for that tier — a literal equality check since
// both call the same function, guaranteeing they can never drift.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { tierAccentColor as brochureTierAccentColor } from "../brochure-templates";
import { tierAccentColor as creativeTierAccentColor } from "@/lib/creatives/creative-templates";

const arbTier = fc.constantFrom("platinum", "gold", "silver", "bronze", "custom");

describe("Property 36: Sponsor tier accent color matches the existing tier color mapping", () => {
  it("re-exported tierAccentColor equals the creative-templates.ts tierAccentColor for every known tier", () => {
    fc.assert(
      fc.property(arbTier, (tier) => {
        expect(brochureTierAccentColor(tier)).toBe(creativeTierAccentColor(tier));
      }),
      { numRuns: 100 }
    );
  });

  it("also matches for arbitrary/unrecognized tier strings (shared fallback behavior)", () => {
    fc.assert(
      fc.property(fc.string(), (tier) => {
        expect(brochureTierAccentColor(tier)).toBe(creativeTierAccentColor(tier));
      }),
      { numRuns: 100 }
    );
  });
});
