// Feature: creative-reference-templates, Property 63: prompt-brief resolution
// is total and never yields an unrenderable creative.
//
// Why this property exists
// ------------------------
// `resolveBrief` sits between a language model and the canvas renderer. Its
// input is therefore adversarial by nature: fields may be missing, blank,
// whitespace-only, over-length, or the wrong type entirely, and a model asked
// for `"invite" | "banner"` will occasionally answer `"Invite Layout"`.
//
// Every one of those failure modes is silent downstream. An invalid hex reaches
// `ctx.fillStyle`, which canvas ignores without error — the element simply
// keeps whatever colour was set before it, so the bug surfaces as one
// mysteriously mis-coloured shape. An unrecognised layout would index the
// template map to `undefined` and take down the render. A blank title would
// produce a creative with no headline.
//
// So the guarantee worth pinning is totality: for ANY input shape,
// `resolveBrief` returns a promo with a non-empty title, a template id that
// exists in the registry, and a theme containing only valid colours.
//
// Property 63, five parts:
//   1. The resolved template id always exists in EVENT_TEMPLATES.
//   2. promo.title is always non-empty — falling back to the event title.
//   3. The theme contains only valid hex colours, and never an accent without
//      a primary (an accent alone has no effect on background resolution).
//   4. Stats are capped at 4 and every retained entry has both parts non-empty.
//   5. The resolved brief always survives buildEventPlan without throwing.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  briefToTheme,
  isHexColor,
  resolveBrief,
  resolveLayout,
  splitHeadline,
  templateIdForLayout,
  type CreativeBriefSuggestion,
} from "../creative-brief";
import { buildEventPlan } from "../creative-renderer";
import { EVENT_TEMPLATES, PLATFORM_FORMATS } from "../creative-templates";

const TEMPLATE_IDS = new Set(EVENT_TEMPLATES.map((t) => t.id));

// ─── Generators ────────────────────────────────────────────────────────────

/** Strings a model plausibly returns, including the degenerate ones. */
const arbModelString = fc.oneof(
  fc.string({ minLength: 1, maxLength: 40 }),
  fc.constant(""),
  fc.constant("   "),
  fc.constant("\n\t "),
  fc.string({ minLength: 60, maxLength: 200 }),
  fc.constant("India\u2019s Largest Virtual HR Summit"),
);

const arbMaybeModelString = fc.option(arbModelString, { nil: undefined });

/** Layout values including plausible model mistakes. */
const arbLayout = fc.oneof(
  fc.constant("invite"),
  fc.constant("banner"),
  fc.constant("INVITE"),
  fc.constant("Banner "),
  fc.constant("square"),
  fc.constant("Invite Layout"),
  fc.constant(""),
  fc.constant(undefined),
);

/** Colours including the invalid forms canvas would silently swallow. */
const arbColor = fc.oneof(
  fc.constant("#7c3aed"),
  fc.constant("#FFF"),
  fc.constant("  #1b1145  "),
  fc.constant("purple"),
  fc.constant("#12345"),
  fc.constant("rgb(1,2,3)"),
  fc.constant(""),
  fc.constant(undefined),
);

const arbPalette = fc.option(
  fc.record({
    primary: fc.option(arbColor, { nil: undefined }),
    accent: fc.option(arbColor, { nil: undefined }),
  }),
  { nil: undefined },
);

const arbSuggestion: fc.Arbitrary<CreativeBriefSuggestion> = fc.record({
  draftId: fc.oneof(fc.uuid(), fc.constant("")),
  title: arbModelString,
  titleLead: arbMaybeModelString,
  editionLabel: arbMaybeModelString,
  tagline: arbMaybeModelString,
  dateLabel: arbMaybeModelString,
  ctaLabel: arbMaybeModelString,
  stats: fc.option(
    fc.array(fc.record({ value: arbModelString, label: arbModelString }), { maxLength: 8 }),
    { nil: undefined },
  ),
  layout: arbLayout,
  palette: arbPalette,
});

const arbFallbacks = fc.record({
  eventTitle: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  dateLabel: fc.option(arbModelString, { nil: undefined }),
  wordmarkUrl: fc.constant(null),
});

describe("Property 63: prompt-brief resolution is total", () => {
  it("always resolves to a template id present in the registry", () => {
    fc.assert(
      fc.property(arbSuggestion, arbFallbacks, (suggestion, fallbacks) => {
        const resolved = resolveBrief(suggestion, fallbacks);
        expect(TEMPLATE_IDS.has(resolved.templateId)).toBe(true);
        expect(templateIdForLayout(resolved.layout)).toBe(resolved.templateId);
      }),
      { numRuns: 300 },
    );
  });

  it("always produces a non-empty headline, falling back to the event title", () => {
    fc.assert(
      fc.property(arbSuggestion, arbFallbacks, (suggestion, fallbacks) => {
        const { promo } = resolveBrief(suggestion, fallbacks);
        expect(promo.title.trim().length).toBeGreaterThan(0);

        // A blank model title must fall back rather than render an empty
        // headline. When the invite split fires, the title becomes the tail of
        // the split, so only check the fallback when no split occurred.
        if (suggestion.title.trim().length === 0 && promo.titleLead === undefined) {
          expect(promo.title).toBe(fallbacks.eventTitle);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never emits an invalid colour, nor an accent without a primary", () => {
    fc.assert(
      fc.property(arbSuggestion, arbFallbacks, (suggestion, fallbacks) => {
        const { theme } = resolveBrief(suggestion, fallbacks);

        if (theme.primaryColor !== undefined) expect(isHexColor(theme.primaryColor)).toBe(true);
        if (theme.accentColor !== undefined) {
          expect(isHexColor(theme.accentColor)).toBe(true);
          // resolveBackground only reads accentColor as a gradient's `to` when
          // primaryColor supplied the `from`, so an accent alone is inert.
          expect(theme.primaryColor).toBeDefined();
        }
      }),
      { numRuns: 300 },
    );
  });

  it("caps stats at 4 and drops entries missing either part", () => {
    fc.assert(
      fc.property(arbSuggestion, arbFallbacks, (suggestion, fallbacks) => {
        const { promo } = resolveBrief(suggestion, fallbacks);
        const stats = promo.stats ?? [];
        expect(stats.length).toBeLessThanOrEqual(4);
        for (const s of stats) {
          expect(s.value.trim().length).toBeGreaterThan(0);
          expect(s.label.trim().length).toBeGreaterThan(0);
        }
        // An all-blank stats array is omitted rather than emitted empty, so the
        // stats panel doesn't render as four empty columns.
        if (stats.length === 0) expect(promo.stats).toBeUndefined();
      }),
      { numRuns: 300 },
    );
  });

  it("produces a brief that renders without throwing, at every format", () => {
    fc.assert(
      fc.property(
        arbSuggestion,
        arbFallbacks,
        fc.constantFrom(...PLATFORM_FORMATS),
        (suggestion, fallbacks, format) => {
          const resolved = resolveBrief(suggestion, fallbacks);
          const template = EVENT_TEMPLATES.find((t) => t.id === resolved.templateId);
          expect(template).toBeDefined();
          if (!template) return;
          expect(() =>
            buildEventPlan(resolved.promo, template, format, resolved.theme),
          ).not.toThrow();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("resolveLayout / splitHeadline / briefToTheme", () => {
  it("maps only the exact vocabulary, and falls back otherwise", () => {
    expect(resolveLayout("invite")).toBe("invite");
    expect(resolveLayout("INVITE")).toBe("invite");
    expect(resolveLayout(" banner ")).toBe("banner");
    // Anything outside the vocabulary must fall back rather than index the
    // template map to undefined.
    for (const bad of ["square", "Invite Layout", "", null, undefined, 7, {}]) {
      expect(resolveLayout(bad)).toBe("banner");
    }
  });

  it("splits a headline at its natural hinge, and declines when too short", () => {
    expect(splitHeadline("India\u2019s Largest Virtual HR Summit")).toEqual({
      lead: "India\u2019s Largest",
      rest: "Virtual HR Summit",
    });
    expect(splitHeadline("Middle East\u2019s Largest Virtual HR Summit")).toEqual({
      lead: "Middle East\u2019s Largest",
      rest: "Virtual HR Summit",
    });
    // Too short to split without making the hierarchy worse than one clean line.
    expect(splitHeadline("Annual Summit")).toBeNull();
    expect(splitHeadline("Product Launch 2026")).toBeNull();
  });

  it("keeps a valid primary and drops an unusable accent", () => {
    expect(briefToTheme({ primary: "#1b1145", accent: "#7c5cfc" })).toEqual({
      primaryColor: "#1b1145",
      accentColor: "#7c5cfc",
    });
    expect(briefToTheme({ primary: "#1b1145", accent: "lavender" })).toEqual({
      primaryColor: "#1b1145",
    });
    expect(briefToTheme({ accent: "#7c5cfc" })).toEqual({});
    expect(briefToTheme(undefined)).toEqual({});
  });
});
