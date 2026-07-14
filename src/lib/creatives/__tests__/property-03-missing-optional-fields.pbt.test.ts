// Feature: social-creative-generator, Property 3: Missing optional fields are handled gracefully
//
// Validates: Requirements 2.2, 2.3, 3.2
//
// Property 3: For any SpeakerLike or SponsorLike with any subset of its
// optional fields (photo_url, title, company for speakers; logo_url for
// sponsors) set to null/undefined, building that entity's render plan never
// throws, includes a text/image element for every present optional field
// with the correct value, and either omits the element (missing
// title/company) or substitutes a documented fallback element (placeholder
// initial for missing photo, styled name text for missing logo) for every
// missing optional field — with no element left rendering empty text.

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerPlan,
  buildSponsorPlan,
  type SpeakerLike,
  type SponsorLike,
} from "../creative-renderer";
import { SPEAKER_TEMPLATES, SPONSOR_TEMPLATES, PLATFORM_FORMATS, type EventTheme } from "../creative-templates";

// ─── Generators ────────────────────────────────────────────────────────────

const arbSpeaker: fc.Arbitrary<SpeakerLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  photo_url: fc.option(fc.webUrl(), { nil: undefined }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  designation: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
});

const arbSponsor: fc.Arbitrary<SponsorLike> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  logo_url: fc.option(fc.webUrl(), { nil: undefined }),
  tier: fc.constantFrom("platinum", "gold", "silver", "bronze", "custom"),
  tier_label: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const arbSpeakerTemplate = fc.constantFrom(...SPEAKER_TEMPLATES);
const arbSponsorTemplate = fc.constantFrom(...SPONSOR_TEMPLATES);
const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);
const arbTheme = fc.constant({} as EventTheme);

// ─── Properties ────────────────────────────────────────────────────────────

describe("Property 3: Missing optional fields are handled gracefully", () => {
  it("buildSpeakerPlan never throws and handles missing photo_url/title/company gracefully", () => {
    fc.assert(
      fc.property(arbSpeaker, arbSpeakerTemplate, arbFormat, arbTheme, (speaker, template, format, theme) => {
        const plan = buildSpeakerPlan(speaker, template, format, theme);

        const photoElements = plan.elements.filter(
          (el) => el.kind === "image" && el.role === "photo"
        ) as Array<Extract<(typeof plan.elements)[number], { kind: "image" }>>;

        if (speaker.photo_url) {
          expect(photoElements.length).toBe(1);
          expect(photoElements[0].url).toBe(speaker.photo_url);
          expect(photoElements[0].placeholderInitial).toBeUndefined();
        } else {
          expect(photoElements.length).toBe(1);
          expect(photoElements[0].url).toBeNull();
          expect(photoElements[0].placeholderInitial).toBeTruthy();
          expect(photoElements[0].placeholderInitial!.length).toBeGreaterThan(0);
        }

        const titleElements = plan.elements.filter((el) => el.kind === "text" && el.key === "title");
        if (speaker.title || speaker.designation) {
          expect(titleElements.length).toBe(1);
          expect((titleElements[0] as { text: string }).text.length).toBeGreaterThan(0);
        } else {
          expect(titleElements.length).toBe(0);
        }

        const companyElements = plan.elements.filter((el) => el.kind === "text" && el.key === "company");
        if (speaker.company) {
          expect(companyElements.length).toBe(1);
          expect((companyElements[0] as { text: string }).text.length).toBeGreaterThan(0);
        } else {
          expect(companyElements.length).toBe(0);
        }

        for (const el of plan.elements) {
          if (el.kind === "text") {
            expect(el.text.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("buildSponsorPlan never throws and handles missing logo_url gracefully", () => {
    fc.assert(
      fc.property(arbSponsor, arbSponsorTemplate, arbFormat, arbTheme, (sponsor, template, format, theme) => {
        const plan = buildSponsorPlan(sponsor, template, format, theme);

        const logoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "logo");

        if (sponsor.logo_url) {
          expect(logoElements.length).toBe(1);
          expect((logoElements[0] as { url: string | null }).url).toBe(sponsor.logo_url);
        } else {
          expect(logoElements.length).toBe(0);
          const nameFallback = plan.elements.filter(
            (el) => el.kind === "text" && (el as { text: string }).text === sponsor.name
          );
          expect(nameFallback.length).toBeGreaterThanOrEqual(1);
        }

        for (const el of plan.elements) {
          if (el.kind === "text") {
            expect(el.text.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
