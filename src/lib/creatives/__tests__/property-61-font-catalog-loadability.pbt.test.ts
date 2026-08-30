// Feature: creative-reference-templates, Property 61: every font a creative
// can reference is actually loadable.
//
// Why this property exists
// ------------------------
// The renderer used to prime fonts with bare `document.fonts.load(...)`
// calls. That API only shapes a face some stylesheet has already declared —
// with no `@font-face` rule it resolves successfully having fetched nothing,
// and the canvas then paints in the fallback face. `index.html` declares five
// families; `FONT_OPTIONS` offered eleven. The six-family gap included
// `Playfair Display`, which two shipped Event_Promo templates name for their
// headline, so those templates had never once rendered in their intended
// face.
//
// Nothing caught it because every layer reported success. This property is
// the missing check: it asserts the *reachable* font set (what templates
// declare, and what the UI lets an organizer pick) is a subset of the
// *loadable* font set (`CREATIVE_FONTS`), so a family can never again be
// referenced by something that cannot fetch it.
//
// Property 61, four parts:
//   1. Every family named by any shipped template — including EVENT_TEMPLATES,
//      which Property 50 part 3 does not cover — is in CREATIVE_FONTS.
//   2. Every family in FONT_OPTIONS is in CREATIVE_FONTS, so a pick from the
//      customization panel is always loadable.
//   3. Every (family, weight) a template actually asks for is a weight the
//      catalog ships, so the browser never has to synthesize a bold.
//   4. planFontLoads maps requested pairs onto catalog entries: it drops
//      unknown families, emits each family once, and covers every requested
//      weight.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { FONT_OPTIONS } from "@/components/event/page-form/presets";
import {
  CREATIVE_FONTS,
  isKnownCreativeFont,
  planFontLoads,
  weightsFor,
} from "../creative-fonts";
import {
  COMBO_TEMPLATES,
  EVENT_TEMPLATES,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  type CreativeTemplate,
} from "../creative-templates";

const ALL_TEMPLATES: CreativeTemplate[] = [
  ...SPEAKER_TEMPLATES,
  ...SPONSOR_TEMPLATES,
  ...COMBO_TEMPLATES,
  ...EVENT_TEMPLATES,
];

/**
 * Every (family, weight) pair a template can ask the renderer to draw —
 * across text slots, pill labels, and text-stack runs. Pills and stack runs
 * are included because they carry their own typography and are just as
 * capable of naming an unloadable family as a text slot is.
 */
function declaredFontPairs(t: CreativeTemplate): Array<{ family: string; weight: number }> {
  const pairs: Array<{ family: string; weight: number }> = [];
  for (const s of t.textSlots) pairs.push({ family: s.fontFamily, weight: s.fontWeight });
  for (const p of t.pillSlots ?? []) pairs.push({ family: p.fontFamily, weight: p.fontWeight });
  for (const st of t.textStackSlots ?? []) {
    for (const r of st.runs) pairs.push({ family: r.fontFamily, weight: r.fontWeight });
  }
  for (const a of t.adornedTextSlots ?? []) {
    pairs.push({ family: a.fontFamily, weight: a.fontWeight });
  }
  for (const sl of t.sealSlots ?? []) pairs.push({ family: sl.fontFamily, weight: sl.fontWeight });
  return pairs;
}

describe("Property 61: every referenceable creative font is loadable", () => {
  // Part 1 — exhaustive over a fixed registry, so enumeration beats sampling.
  it("every family named by a shipped template is in CREATIVE_FONTS", () => {
    const offenders: string[] = [];
    for (const t of ALL_TEMPLATES) {
      for (const { family } of declaredFontPairs(t)) {
        if (!isKnownCreativeFont(family)) offenders.push(`${t.id} → ${family}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Part 2 — the UI picker must not offer anything the renderer can't fetch.
  it("every family in FONT_OPTIONS is in CREATIVE_FONTS", () => {
    const missing = FONT_OPTIONS.filter((f) => !isKnownCreativeFont(f));
    expect(missing).toEqual([]);
  });

  // Part 3 — a requested weight the catalog omits gets synthesized by the
  // browser, which looks materially worse at display sizes.
  it("every weight a template requests is shipped by the catalog for that family", () => {
    const offenders: string[] = [];
    for (const t of ALL_TEMPLATES) {
      for (const { family, weight } of declaredFontPairs(t)) {
        const weights = weightsFor(family);
        if (weights && !weights.includes(weight)) {
          offenders.push(`${t.id} → ${family} @ ${weight}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Part 4 — property test over the pure planner behind the loader.
  it("planFontLoads drops unknown families, dedupes, and covers every requested weight", () => {
    const arbKnownFamily = fc.constantFrom(...CREATIVE_FONTS.map((f) => f.family));
    const arbUnknownFamily = fc.constantFrom(
      "Definitely Not A Font",
      "Comic Sans MS",
      "",
      "Helvetica Neue LT Std 47",
    );
    const arbPair = fc.record({
      family: fc.oneof(arbKnownFamily, arbUnknownFamily),
      weight: fc.constantFrom(100, 400, 500, 700, 800, 950),
    });

    fc.assert(
      fc.property(fc.array(arbPair, { maxLength: 24 }), (pairs) => {
        const plan = planFontLoads(pairs);

        // Only known families survive.
        for (const { family } of plan) {
          expect(isKnownCreativeFont(family)).toBe(true);
        }

        // One entry per family — duplicates collapse into a single load.
        const families = plan.map((p) => p.family);
        expect(new Set(families).size).toBe(families.length);

        // Every requested weight for a known family is covered, so nothing
        // silently falls back to a synthesized cut.
        for (const { family, weight } of pairs) {
          if (!isKnownCreativeFont(family)) continue;
          const entry = plan.find((p) => p.family === family);
          expect(entry).toBeDefined();
          expect(entry?.weights).toContain(weight);
        }

        // Weights arrive sorted, so the generated stylesheet URL is stable
        // for a given input set and stays cache-friendly.
        for (const { weights } of plan) {
          expect(weights).toEqual([...weights].sort((a, b) => a - b));
        }
      }),
      { numRuns: 200 },
    );
  });
});
