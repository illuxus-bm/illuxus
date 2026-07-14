// Feature: social-creative-generator, Property 8: Rendered output matches the exact target pixel dimensions
//
// Validates: Requirements 5.2
//
// Property 8: For any entity/template/`Platform_Format` combination, the
// `RenderPlan` produced by a plan builder (`buildSpeakerPlan`,
// `buildSponsorPlan`, `buildComboPlan`) carries a `format` whose
// `width`/`height` exactly equal the `Platform_Format` that was passed in.
//
// This is the invariant `renderPlanToPngBlob` (the private helper inside
// `creative-renderer.ts`) relies on when it sets
// `canvas.width = plan.format.width; canvas.height = plan.format.height;`
// before drawing and calling `canvas.toBlob()` — if this invariant holds,
// the exported canvas's pixel dimensions are guaranteed correct BY
// CONSTRUCTION.
//
// Per the design's Testing Strategy, this is tested against the *plan*
// rather than the real exported `renderSpeakerCreative`/`renderSponsorCreative`/
// `renderComboCreative` functions: this project's Vitest environment is
// `jsdom` with no canvas polyfill installed, so
// `document.createElement("canvas").getContext("2d")` returns `null` and the
// real render functions would throw `"Could not get 2D canvas context"`
// rather than exercising the property. Testing the plan's `format` field is
// equivalent to testing an `OffscreenCanvas`-or-mock-canvas shim
// (`{ width, height, toBlob }`) that simply records what it was asked to
// draw, since both approaches verify the same dimension invariant without
// needing a real browser canvas.

import { describe, it } from "vitest";
import fc from "fast-check";

import { buildSpeakerPlan, buildSponsorPlan, buildComboPlan } from "../creative-renderer";
import type { SpeakerLike, SponsorLike } from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
} from "../creative-templates";
import type { EventTheme } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  designation: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  company: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
});

const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  tier_label: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
});

const arbSpeakerTemplate = fc.constantFrom(...SPEAKER_TEMPLATES);
const arbSponsorTemplate = fc.constantFrom(...SPONSOR_TEMPLATES);
const arbComboTemplate = fc.constantFrom(...COMBO_TEMPLATES);

// The 5 real Platform_Formats — exactly the formats that will ever be passed
// to the real render functions, so testing against them is representative.
const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 8: Rendered output matches the exact target pixel dimensions", () => {
  it("buildSpeakerPlan's plan.format exactly equals the Platform_Format passed in", () => {
    fc.assert(
      fc.property(
        arbSpeaker,
        arbSpeakerTemplate,
        arbFormat,
        arbTheme,
        (speaker, template, format, theme) => {
          const plan = buildSpeakerPlan(speaker, template, format, theme);
          return plan.format.width === format.width && plan.format.height === format.height;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("buildSponsorPlan's plan.format exactly equals the Platform_Format passed in", () => {
    fc.assert(
      fc.property(
        arbSponsor,
        arbSponsorTemplate,
        arbFormat,
        arbTheme,
        (sponsor, template, format, theme) => {
          const plan = buildSponsorPlan(sponsor, template, format, theme);
          return plan.format.width === format.width && plan.format.height === format.height;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("buildComboPlan's plan.format exactly equals the Platform_Format passed in", () => {
    fc.assert(
      fc.property(
        arbSpeaker,
        arbSponsor,
        arbComboTemplate,
        arbFormat,
        arbTheme,
        (speaker, sponsor, template, format, theme) => {
          const plan = buildComboPlan(speaker, sponsor, template, format, theme);
          return plan.format.width === format.width && plan.format.height === format.height;
        }
      ),
      { numRuns: 100 }
    );
  });
});
