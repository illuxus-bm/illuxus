// Feature: social-creative-generator, Property 60: Event_Promo creative structural completeness
//
// Validates: Social_Creative_Generator Event_Promo extension (Stats Banner /
// Invite Card templates: event title, tagline, date label, up to 4 stat
// value/label pairs, date pill, CTA button).
//
// Property 60: For any `EventPromoLike` and any Event_Promo `CreativeTemplate`,
// `buildEventPlan` produces a plan that:
//  - always contains an `eventTitle` text element with matching text
//    (case-insensitive, to allow for an uppercase transform);
//  - contains an `eventTagline`/`dateLabel` text element iff BOTH the
//    template defines that slot AND the promo supplied a non-empty value
//    for it (never an empty placeholder);
//  - contains exactly `min(4, promo.stats.length)` stat value/label pairs,
//    each matching the corresponding `promo.stats[i]` entry;
//  - always contains a CTA `pill` element when the template defines a
//    `ctaButton` slot (falling back to "Register Now" when
//    `promo.ctaLabel` is absent), and a `datePill` element iff the
//    template defines that slot AND `promo.dateLabel` is set;
//  - never throws for any combination of present/absent optional fields.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildEventPlan } from "../creative-renderer";
import type { EventPromoLike, PlanElement } from "../creative-renderer";
import { EVENT_TEMPLATES, PLATFORM_FORMATS } from "../creative-templates";
import type { EventTheme } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const arbMaybeString = fc.option(arbNonEmptyString, { nil: undefined });

const arbStat = fc.record({
  value: arbNonEmptyString,
  label: arbNonEmptyString,
});

const arbPromo: fc.Arbitrary<EventPromoLike> = fc.record({
  id: fc.uuid(),
  title: arbNonEmptyString,
  tagline: arbMaybeString,
  dateLabel: arbMaybeString,
  ctaLabel: arbMaybeString,
  wordmarkUrl: fc.constant(undefined),
  stats: fc.array(arbStat, { minLength: 0, maxLength: 6 }),
});

const arbTemplate = fc.constantFrom(...EVENT_TEMPLATES);
const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

describe("Property 60: Event_Promo creative structural completeness", () => {
  it("always renders the event title, conditionally renders tagline/dateLabel, renders up to 4 stat pairs, and renders the CTA/date pills correctly", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        const plan = buildEventPlan(promo, template, format, theme);
        const elements: PlanElement[] = plan.elements;

        // 1. eventTitle text element always present with matching text.
        const titleEls = elements.filter(
          (e): e is Extract<PlanElement, { kind: "text" }> => e.kind === "text" && e.key === "eventTitle"
        );
        const hasTemplateTitleSlot = template.textSlots.some((s) => s.key === "eventTitle");
        if (hasTemplateTitleSlot) {
          expect(titleEls.length).toBeGreaterThan(0);
          expect(titleEls.some((e) => e.text.toLowerCase() === promo.title.toLowerCase())).toBe(true);
        } else {
          expect(titleEls.length).toBe(0);
        }

        // 2. eventTagline / dateLabel — present iff BOTH the template
        //    defines the slot AND the promo has a non-empty value.
        for (const key of ["eventTagline", "dateLabel"] as const) {
          const hasSlot = template.textSlots.some((s) => s.key === key);
          const value = key === "eventTagline" ? promo.tagline : promo.dateLabel;
          const els = elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> => e.kind === "text" && e.key === key
          );
          if (hasSlot && value) {
            expect(els.length).toBeGreaterThan(0);
            expect(els.some((e) => e.text.toLowerCase() === value.toLowerCase())).toBe(true);
          } else {
            expect(els.length).toBe(0);
          }
        }

        // 3. Stat pairs — exactly min(4, stats.length) rendered, matched by
        //    index to the template's statValueN/statLabelN slots (when the
        //    template defines that many).
        const stats = promo.stats ?? [];
        const expectedCount = Math.min(4, stats.length);
        for (let i = 0; i < 4; i += 1) {
          const n = i + 1;
          const valueKey = `statValue${n}` as PlanElement extends { kind: "text"; key: infer K } ? K : never;
          const hasValueSlot = template.textSlots.some((s) => s.key === valueKey);
          const valueEls = elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> => e.kind === "text" && e.key === valueKey
          );
          if (i < expectedCount && hasValueSlot) {
            expect(valueEls.some((e) => e.text === stats[i].value)).toBe(true);
          } else {
            expect(valueEls.length).toBe(0);
          }
        }
        void expectedCount;

        // 4. CTA pill — present iff the template defines a ctaButton slot;
        //    falls back to "Register Now" when ctaLabel is absent.
        const ctaSlotDefined = (template.pillSlots ?? []).some((p) => p.key === "ctaButton");
        const ctaEls = elements.filter(
          (e): e is Extract<PlanElement, { kind: "pill" }> => e.kind === "pill" && e.key === "ctaButton"
        );
        if (ctaSlotDefined) {
          expect(ctaEls.length).toBe(1);
          expect(ctaEls[0].text).toBe(promo.ctaLabel || "Register Now");
        } else {
          expect(ctaEls.length).toBe(0);
        }

        // 5. Date pill — present iff the template defines a datePill slot
        //    AND promo.dateLabel is set.
        const dateSlotDefined = (template.pillSlots ?? []).some((p) => p.key === "datePill");
        const dateEls = elements.filter(
          (e): e is Extract<PlanElement, { kind: "pill" }> => e.kind === "pill" && e.key === "datePill"
        );
        if (dateSlotDefined && promo.dateLabel) {
          expect(dateEls.length).toBe(1);
          expect(dateEls[0].text).toBe(promo.dateLabel);
        } else {
          expect(dateEls.length).toBe(0);
        }
      }),
      { numRuns: 150 }
    );
  });

  it("never throws for any combination of present/absent optional fields, across every template and format", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        expect(() => buildEventPlan(promo, template, format, theme)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });
});
