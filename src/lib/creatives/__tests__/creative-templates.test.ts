import { describe, it, expect } from "vitest";
import {
  PLATFORM_FORMATS,
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  templatesFor,
} from "../creative-templates";

describe("PLATFORM_FORMATS", () => {
  it("has exactly 5 entries with the specified ids and dimensions (Requirement 5.1)", () => {
    const expected = [
      { id: "linkedin-post", width: 1200, height: 627 },
      { id: "instagram-post", width: 1080, height: 1080 },
      { id: "instagram-story", width: 1080, height: 1920 },
      { id: "twitter-post", width: 1600, height: 900 },
      { id: "email-banner", width: 600, height: 200 },
    ];

    expect(PLATFORM_FORMATS).toHaveLength(5);

    for (const exp of expected) {
      const format = PLATFORM_FORMATS.find((f) => f.id === exp.id);
      expect(format).toBeDefined();
      expect(format?.width).toBe(exp.width);
      expect(format?.height).toBe(exp.height);
    }
  });
});

describe("templatesFor", () => {
  it("returns a non-empty array of speaker templates, all typed 'speaker' (Requirement 1.1)", () => {
    const templates = templatesFor("speaker");
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template.type).toBe("speaker");
    }
  });

  it("returns a non-empty array of sponsor templates, all typed 'sponsor' (Requirement 1.1)", () => {
    const templates = templatesFor("sponsor");
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template.type).toBe("sponsor");
    }
  });

  it("returns a non-empty array of combo templates, all typed 'combo' and featuring both speaker and sponsor image slots (Requirement 1.1)", () => {
    const templates = templatesFor("combo");
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template.type).toBe("combo");
      expect(template.imageSlots.speakerPhoto).toBeDefined();
      expect(template.imageSlots.sponsorLogo).toBeDefined();
    }
  });
});

describe("template registry ids", () => {
  it("has no duplicate template ids across the whole registry", () => {
    const allIds = [...SPEAKER_TEMPLATES, ...SPONSOR_TEMPLATES, ...COMBO_TEMPLATES].map(
      (template) => template.id
    );
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
