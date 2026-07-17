// Feature: creative-ai-backgrounds, Property 21: AI asset URL never appears in a photo or logo element
//
// Validates: Requirements 4.3, 4.1
//
// Property 21: For any speaker or sponsor entity, any `CreativeTemplate`, any
// `Platform_Format`, any `EventTheme`, and any AI-generated background URL
// `aiUrl`, when the template is passed through the AI-splicing step
// (`{ ...template, background: { type: "image", url: aiUrl, fit: "cover" } }`)
// and rendered through `buildSpeakerPlan` / `buildSponsorPlan` /
// `buildComboPlan`, the resulting `RenderPlan.elements` contains `aiUrl` only
// inside an element with `kind: "background"` and never inside any element
// with `kind: "image"` (regardless of that image element's
// `role: "photo" | "logo"`).

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  buildSpeakerPlan,
  buildSponsorPlan,
  buildComboPlan,
  type SpeakerLike,
  type SponsorLike,
  type RenderPlan,
} from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  type CreativeTemplate,
  type EventTheme,
} from "../creative-templates";

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

const arbFormat = fc.constantFrom(...PLATFORM_FORMATS);

const arbTheme: fc.Arbitrary<EventTheme> = fc.record({
  primaryColor: fc.option(fc.constantFrom("#ff0000", "#00ff00", "#0000ff"), { nil: undefined }),
  accentColor: fc.option(fc.constantFrom("#ffff00", "#ff00ff"), { nil: undefined }),
});

/** A distinctive AI background URL, unlikely to collide with any
 * independently generated `fc.webUrl()` value used for photo_url/logo_url. */
const arbAiUrl = fc
  .string({ minLength: 5, maxLength: 30 })
  .map((s) => `https://ai-background.test/${encodeURIComponent(s)}.png`);

/** One generated test case: a fully-built `RenderPlan` plus the `aiUrl` that
 * was spliced into its background, exactly mirroring
 * `CreativeGeneratorDialog.handleGenerate`'s splice shape. */
interface Case {
  plan: RenderPlan;
  aiUrl: string;
}

function splice(template: CreativeTemplate, aiUrl: string): CreativeTemplate {
  return { ...template, background: { type: "image", url: aiUrl, fit: "cover" } };
}

const arbSpeakerCase: fc.Arbitrary<Case> = fc
  .record({
    speaker: arbSpeaker,
    template: fc.constantFrom(...SPEAKER_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
    aiUrl: arbAiUrl,
  })
  .map(({ speaker, template, format, theme, aiUrl }) => ({
    plan: buildSpeakerPlan(speaker, splice(template, aiUrl), format, theme),
    aiUrl,
  }));

const arbSponsorCase: fc.Arbitrary<Case> = fc
  .record({
    sponsor: arbSponsor,
    template: fc.constantFrom(...SPONSOR_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
    aiUrl: arbAiUrl,
  })
  .map(({ sponsor, template, format, theme, aiUrl }) => ({
    plan: buildSponsorPlan(sponsor, splice(template, aiUrl), format, theme),
    aiUrl,
  }));

const arbComboCase: fc.Arbitrary<Case> = fc
  .record({
    speaker: arbSpeaker,
    sponsor: arbSponsor,
    template: fc.constantFrom(...COMBO_TEMPLATES),
    format: arbFormat,
    theme: arbTheme,
    aiUrl: arbAiUrl,
  })
  .map(({ speaker, sponsor, template, format, theme, aiUrl }) => ({
    plan: buildComboPlan(speaker, sponsor, splice(template, aiUrl), format, theme),
    aiUrl,
  }));

const arbCase: fc.Arbitrary<Case> = fc.oneof(arbSpeakerCase, arbSponsorCase, arbComboCase);

// ─── Property ──────────────────────────────────────────────────────────────

describe("Property 21: AI asset URL never appears in a photo or logo element", () => {
  it("places aiUrl only inside a kind:\"background\" element, never inside a kind:\"image\" element", () => {
    fc.assert(
      fc.property(arbCase, ({ plan, aiUrl }) => {
        const backgroundMatches = plan.elements.filter(
          (el) => el.kind === "background" && el.style.type === "image" && el.style.url === aiUrl
        );
        const imageMatches = plan.elements.filter((el) => el.kind === "image" && el.url === aiUrl);

        // aiUrl always ends up as the background (that's the point of the splice).
        expect(backgroundMatches.length).toBe(1);

        // aiUrl must never leak into a photo/logo image element.
        expect(imageMatches.length).toBe(0);

        // Overall: aiUrl appears in at most one element, and it must be the background.
        const totalMatches = backgroundMatches.length + imageMatches.length;
        expect(totalMatches).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  // Explicit (non-property-generated) case: the entity's own photo_url is a
  // similar-looking (but distinct) URL to the AI url, verifying the
  // assertion above isn't accidentally satisfied by a loose/partial match.
  it("does not cross-contaminate when the entity's own photo_url looks similar to (but differs from) the AI url", () => {
    const aiUrl = "https://ai-background.test/actual-generated-background.png";
    const speaker: SpeakerLike = {
      id: "speaker-1",
      name: "Jane Doe",
      photo_url: "https://ai-background.test/actual-generated-background-photo.png",
    };
    const template = splice(SPEAKER_TEMPLATES[0], aiUrl);
    const plan = buildSpeakerPlan(speaker, template, PLATFORM_FORMATS[0], {});

    const photoElement = plan.elements.find((el) => el.kind === "image" && el.role === "photo");
    expect(photoElement).toBeDefined();
    expect((photoElement as { url: string | null }).url).toBe(speaker.photo_url);
    expect((photoElement as { url: string | null }).url).not.toBe(aiUrl);

    const backgroundElement = plan.elements.find((el) => el.kind === "background");
    expect(backgroundElement).toBeDefined();
    expect((backgroundElement as { style: { type: string; url?: string } }).style.url).toBe(aiUrl);
  });
});
