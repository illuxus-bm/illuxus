// Feature: social-creative-generator, Property 6: Combo creative structural completeness
//
// Validates: Requirements 4.1, 4.2
//
// Property 6: For any valid speaker and sponsor pair and any Combo
// `CreativeTemplate`, `buildComboPlan` produces a plan that contains the
// speaker's photo/placeholder and name elements, the sponsor's logo/name
// elements, and at least one `divider` element separating the two (when the
// template defines one).

import { describe, it } from "vitest";
import fc from "fast-check";

import { buildComboPlan } from "../creative-renderer";
import type { SpeakerLike, SponsorLike, PlanElement } from "../creative-renderer";
import { COMBO_TEMPLATES, PLATFORM_FORMATS } from "../creative-templates";
import type { EventTheme } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.constant(undefined),
  designation: fc.constant(undefined),
  company: fc.constant(undefined),
});

const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  tier_label: fc.constant(undefined),
});

const arbTemplate = fc.constantFrom(...COMBO_TEMPLATES);
const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme: fc.Arbitrary<EventTheme> = fc.constant({} as EventTheme);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 6: Combo creative structural completeness", () => {
  it("always contains speaker photo/name, sponsor logo-or-name/sponsorName, and a divider when the template defines one", () => {
    fc.assert(
      fc.property(
        arbSpeaker,
        arbSponsor,
        arbTemplate,
        arbFormat,
        arbTheme,
        (speaker, sponsor, template, format, theme) => {
          const plan = buildComboPlan(speaker, sponsor, template, format, theme);
          const elements: PlanElement[] = plan.elements;

          // 1. Speaker photo/placeholder element present.
          const photoElements = elements.filter(
            (e): e is Extract<PlanElement, { kind: "image" }> =>
              e.kind === "image" && e.role === "photo"
          );
          if (photoElements.length === 0) {
            return false;
          }

          // 2. Speaker name text element present with matching text
          //    (case-insensitive to allow for an uppercase transform).
          const nameElements = elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> =>
              e.kind === "text" && e.key === "name"
          );
          if (nameElements.length === 0) {
            return false;
          }
          if (
            !nameElements.some(
              (e) => e.text.toLowerCase() === speaker.name.toLowerCase()
            )
          ) {
            return false;
          }

          // 3. Sponsor-identifying element present: either a logo image, or
          //    the logo-fallback sponsorName text substituting for it.
          const logoElements = elements.filter(
            (e): e is Extract<PlanElement, { kind: "image" }> =>
              e.kind === "image" && e.role === "logo"
          );
          const sponsorNameTextElements = elements.filter(
            (e): e is Extract<PlanElement, { kind: "text" }> =>
              e.kind === "text" && e.key === "sponsorName"
          );
          if (logoElements.length === 0 && sponsorNameTextElements.length === 0) {
            return false;
          }

          // 4. sponsorName text element present with matching text
          //    (case-insensitive to allow for an uppercase transform).
          if (sponsorNameTextElements.length === 0) {
            return false;
          }
          if (
            !sponsorNameTextElements.some(
              (e) => e.text.toLowerCase() === sponsor.name.toLowerCase()
            )
          ) {
            return false;
          }

          // 5. If the template defines a divider, the plan must contain one.
          if (template.divider) {
            const hasDivider = elements.some((e) => e.kind === "divider");
            if (!hasDivider) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
