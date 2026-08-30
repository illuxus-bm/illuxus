// Feature: creative-reference-templates, Property 62: Event_Promo composite
// slot completeness.
//
// Why this property exists
// ------------------------
// Property 60 pins the behaviour of the *plain* Event_Promo slots: an
// `eventTitle` text slot, a `dateLabel` text slot, a `ctaButton` pill. The
// reference-matched templates render their headline through a `textStackSlot`,
// their date through an `adornedTextSlot`, and their CTA through a
// `sealSlot` — none of which Property 60 looks at. It therefore passes
// vacuously for them: it asserts zero `text` elements with key `eventTitle`,
// which is trivially true when the title arrives as a `text-stack`.
//
// So without this property, the two templates the whole reference rework exists
// to deliver had no structural coverage at all. Their headline could stop
// rendering entirely and the suite would stay green.
//
// Property 62, five parts:
//   1. A text-stack emits exactly the runs whose bound source resolves
//      non-empty — literal runs always, field runs only when the field is set.
//      A promo with no `titleLead` yields a one-run headline, not a gap.
//   2. A `fields` source joins present fields with its separator and skips
//      absent ones, so no leading/trailing/doubled separator can appear.
//   3. An adorned-text element appears iff its bound source resolves non-empty,
//      and its adornment sizes are all finite and positive.
//   4. A seal appears iff the template declares one, always with a non-empty
//      label (falling back to "Register Now").
//   5. buildEventPlan never throws for any combination of absent optionals.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildEventPlan } from "../creative-renderer";
import type { EventPromoLike, PlanElement } from "../creative-renderer";
import { EVENT_TEMPLATES, PLATFORM_FORMATS } from "../creative-templates";
import type { EventTheme, PromoTextField, PromoTextSource } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbNonEmpty = fc
  .string({ minLength: 1, maxLength: 28 })
  .filter((s) => s.trim().length > 0);
const arbMaybe = fc.option(arbNonEmpty, { nil: undefined });

const arbPromo: fc.Arbitrary<EventPromoLike> = fc.record({
  id: fc.uuid(),
  title: arbNonEmpty,
  titleLead: arbMaybe,
  editionLabel: arbMaybe,
  tagline: arbMaybe,
  dateLabel: arbMaybe,
  ctaLabel: arbMaybe,
  wordmarkUrl: fc.constant(undefined),
  stats: fc.array(fc.record({ value: arbNonEmpty, label: arbNonEmpty }), {
    minLength: 0,
    maxLength: 6,
  }),
});

const arbTemplate = fc.constantFrom(...EVENT_TEMPLATES);
const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

/** Mirrors the renderer's field read, independently, so the test doesn't just
 *  restate the implementation it is checking. */
function readField(field: PromoTextField, promo: EventPromoLike): string {
  const map: Record<PromoTextField, string | null | undefined> = {
    title: promo.title,
    titleLead: promo.titleLead,
    tagline: promo.tagline,
    dateLabel: promo.dateLabel,
    ctaLabel: promo.ctaLabel,
    editionLabel: promo.editionLabel,
  };
  return (map[field] ?? "").trim();
}

function expectedText(source: PromoTextSource, promo: EventPromoLike): string {
  if (source.from === "literal") return source.text;
  if (source.from === "fields") {
    return source.fields
      .map((f) => readField(f, promo))
      .filter((v) => v.length > 0)
      .join(source.join);
  }
  return readField(source.field, promo);
}

const stacksOf = (els: PlanElement[]) =>
  els.filter((e): e is Extract<PlanElement, { kind: "text-stack" }> => e.kind === "text-stack");
const adornedOf = (els: PlanElement[]) =>
  els.filter((e): e is Extract<PlanElement, { kind: "adorned-text" }> => e.kind === "adorned-text");
const sealsOf = (els: PlanElement[]) =>
  els.filter((e): e is Extract<PlanElement, { kind: "seal" }> => e.kind === "seal");

describe("Property 62: Event_Promo composite slot completeness", () => {
  it("text-stacks emit exactly the runs whose source resolves non-empty, in author order", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        const plan = buildEventPlan(promo, template, format, theme);
        const stacks = stacksOf(plan.elements);

        for (const slot of template.textStackSlots ?? []) {
          const expectedRuns = slot.runs
            .map((r) => ({ spec: r, text: expectedText(r.source, promo) }))
            .filter((r) => r.text.length > 0);

          // A stack with every run resolving empty is omitted entirely rather
          // than emitted as an empty block.
          if (expectedRuns.length === 0) continue;

          const emitted = stacks.filter((s) => s.runs.length === expectedRuns.length);
          expect(
            emitted.length,
            `no text-stack with ${expectedRuns.length} run(s) for slot ${slot.key}`,
          ).toBeGreaterThan(0);

          const match = emitted.find((s) =>
            s.runs.every((run, i) => {
              const want = expectedRuns[i];
              const wanted =
                want.spec.transform === "uppercase" ? want.text.toUpperCase() : want.text;
              return run.text === wanted;
            }),
          );
          expect(match, `run text/order mismatch for slot ${slot.key}`).toBeDefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a joining source never produces a leading, trailing or doubled separator", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        const plan = buildEventPlan(promo, template, format, theme);

        for (const slot of template.textStackSlots ?? []) {
          for (const spec of slot.runs) {
            if (spec.source.from !== "fields") continue;
            const join = spec.source.join;
            if (join.trim().length !== 0 && join.length === 0) continue;

            const text = expectedText(spec.source, promo);
            if (text.length === 0) continue;

            // The separator is a space in every shipped template; a present
            // field is trimmed, so no separator can sit at either end.
            expect(text.startsWith(join)).toBe(false);
            expect(text.endsWith(join)).toBe(false);
            expect(text.includes(join + join)).toBe(false);

            const emitted = stacksOf(plan.elements).flatMap((s) => s.runs.map((r) => r.text));
            const wanted = spec.transform === "uppercase" ? text.toUpperCase() : text;
            expect(emitted).toContain(wanted);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("adorned-text appears iff its source resolves non-empty, with finite positive adornment metrics", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        const plan = buildEventPlan(promo, template, format, theme);
        const adorned = adornedOf(plan.elements);

        const slots = template.adornedTextSlots ?? [];
        const expectedPresent = slots.filter((s) => expectedText(s.source, promo).length > 0);
        expect(adorned.length).toBe(expectedPresent.length);

        for (const slot of expectedPresent) {
          const want = expectedText(slot.source, promo);
          const found = adorned.find((a) => a.text === want);
          expect(found, `no adorned-text for ${slot.key}`).toBeDefined();
          if (!found) continue;

          // Scaled metrics must stay usable: a non-finite or negative radius
          // silently produces an invisible or inverted adornment rather than
          // an error, so it has to be asserted.
          if (found.adornment.style === "dots") {
            expect(found.adornment.radiusPx).toBeGreaterThan(0);
            expect(Number.isFinite(found.adornment.radiusPx)).toBe(true);
            expect(Number.isFinite(found.adornment.gapPx)).toBe(true);
          } else {
            expect(found.adornment.sizePx).toBeGreaterThan(0);
            expect(found.adornment.strokeWidthPx).toBeGreaterThan(0);
            expect(Number.isFinite(found.adornment.gapPx)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a seal appears iff the template declares one, and its label is never empty", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        const plan = buildEventPlan(promo, template, format, theme);
        const seals = sealsOf(plan.elements);
        const declared = template.sealSlots ?? [];

        expect(seals.length).toBe(declared.length);
        for (const seal of seals) {
          expect(seal.text.length).toBeGreaterThan(0);
          expect(seal.text).toBe((promo.ctaLabel ?? "").trim() || "Register Now");
        }

        // A template declares a seal CTA or a pill CTA, never both — two
        // stacked call-to-action buttons would be a layout bug.
        const ctaPills = plan.elements.filter((e) => e.kind === "pill" && e.key === "ctaButton");
        expect(declared.length > 0 && ctaPills.length > 0).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // Regression guard. Non-font metrics were originally scaled with
  // `scaleTextSize`, whose `Math.max(10, …)` floor exists to keep *type*
  // legible. Applied to an icon stroke, a dot radius or letter tracking that
  // floor is destructive: a 2px calendar outline became 10px and filled the
  // glyph in solid, and 5px of eyebrow tracking became 10px. Both rendered
  // without error and passed every structural assertion — only looking at the
  // output revealed them. Rendering a template at its own authored size, where
  // the scale factor is ~1, pins the metrics to their authored values.
  it("scales non-font metrics proportionally, without applying the font-size floor", () => {
    for (const template of EVENT_TEMPLATES) {
      // Find the shipped format closest to this template's authored aspect and
      // size, so the scale factor is ~1 and authored values pass through.
      const authoredShort = Math.min(template.authoredWidth, template.authoredHeight);
      const format = PLATFORM_FORMATS.reduce((best, f) =>
        Math.abs(Math.min(f.width, f.height) - authoredShort) <
        Math.abs(Math.min(best.width, best.height) - authoredShort)
          ? f
          : best,
      );
      const scale = Math.min(format.width, format.height) / authoredShort;

      const promo: EventPromoLike = {
        id: "metrics",
        title: "Virtual HR Summit",
        titleLead: "India\u2019s Largest",
        editionLabel: "Summer Edition",
        tagline: "You\u2019re Invited",
        dateLabel: "23rd July, 2026",
        ctaLabel: "Register for FREE",
        stats: [
          { value: "6000+", label: "Attendees" },
          { value: "30+", label: "Speakers" },
        ],
      };

      const plan = buildEventPlan(promo, template, format, {});

      for (const slot of template.adornedTextSlots ?? []) {
        const el = adornedOf(plan.elements).find(
          (a) => a.text === expectedText(slot.source, promo),
        );
        if (!el) continue;
        const spec = slot.adornment;
        if (spec.style === "dots" && el.adornment.style === "dots") {
          expect(el.adornment.radiusPx).toBeCloseTo(spec.radiusPx * scale, 1);
          expect(el.adornment.gapPx).toBeCloseTo(spec.gapPx * scale, 1);
        } else if (spec.style === "leading-icon" && el.adornment.style === "leading-icon") {
          // The one that actually broke: a 2px authored stroke must stay ~2px.
          expect(el.adornment.strokeWidthPx).toBeCloseTo(spec.strokeWidthPx * scale, 1);
          expect(el.adornment.sizePx).toBeCloseTo(spec.sizePx * scale, 1);
          expect(el.adornment.gapPx).toBeCloseTo(spec.gapPx * scale, 1);
        }
      }

      for (const slot of template.textStackSlots ?? []) {
        for (const runSpec of slot.runs) {
          if (runSpec.letterSpacingPx === undefined) continue;
          const text = expectedText(runSpec.source, promo);
          if (!text) continue;
          const wanted = runSpec.transform === "uppercase" ? text.toUpperCase() : text;
          const run = stacksOf(plan.elements)
            .flatMap((s) => s.runs)
            .find((r) => r.text === wanted);
          if (!run) continue;
          expect(run.letterSpacingPx).toBeCloseTo(runSpec.letterSpacingPx * scale, 1);
        }
      }
    }
  });

  it("never throws for any combination of absent optional fields", () => {
    fc.assert(
      fc.property(arbPromo, arbTemplate, arbFormat, arbTheme, (promo, template, format, theme) => {
        expect(() => buildEventPlan(promo, template, format, theme)).not.toThrow();
      }),
      { numRuns: 150 },
    );
  });
});
