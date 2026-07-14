// Feature: social-creative-generator
//
// Unit tests for the "happy path" of the plan builders: fully-populated,
// realistic entity data (no missing fields). Complements the missing-fields
// property test (Property 3, property-03-missing-optional-fields.pbt.test.ts)
// by asserting the exact photo/logo/text elements and values a complete
// speaker/sponsor/combo produces.
//
// Validates: Requirements 2.1, 3.1, 4.1

import { describe, it, expect } from "vitest";

import { buildSpeakerPlan, buildSponsorPlan, buildComboPlan, type SpeakerLike, type SponsorLike } from "../creative-renderer";
import {
  SPEAKER_TEMPLATES,
  SPONSOR_TEMPLATES,
  COMBO_TEMPLATES,
  PLATFORM_FORMATS,
  tierAccentColor,
  type EventTheme,
} from "../creative-templates";

const emptyTheme: EventTheme = {};

describe("buildSpeakerPlan happy path (Requirement 2.1)", () => {
  const speaker: SpeakerLike = {
    id: "s1",
    name: "Ada Lovelace",
    photo_url: "https://example.com/ada.jpg",
    title: "Chief Scientist",
    designation: "CTO",
    company: "Analytical Engines Inc",
  };

  const plan = buildSpeakerPlan(speaker, SPEAKER_TEMPLATES[0], PLATFORM_FORMATS[0], emptyTheme);

  it("contains a photo image element with the speaker's photo url", () => {
    const photoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "photo");
    expect(photoElements).toHaveLength(1);
    const photo = photoElements[0] as Extract<(typeof plan.elements)[number], { kind: "image" }>;
    expect(photo.url).toBe("https://example.com/ada.jpg");
  });

  it("contains a name text element with the speaker's name", () => {
    const nameElements = plan.elements.filter((el) => el.kind === "text" && el.key === "name");
    expect(nameElements).toHaveLength(1);
    const nameText = (nameElements[0] as { text: string }).text;
    expect(nameText.toLowerCase()).toBe("ada lovelace");
  });

  it("prefers title over designation", () => {
    const titleElements = plan.elements.filter((el) => el.kind === "text" && el.key === "title");
    expect(titleElements).toHaveLength(1);
    const titleText = (titleElements[0] as { text: string }).text;
    expect(titleText.toLowerCase()).toBe("chief scientist");
    expect(titleText.toLowerCase()).not.toBe("cto");
  });

  it("contains a company text element with the speaker's company", () => {
    const companyElements = plan.elements.filter((el) => el.kind === "text" && el.key === "company");
    expect(companyElements).toHaveLength(1);
    const companyText = (companyElements[0] as { text: string }).text;
    expect(companyText.toLowerCase()).toBe("analytical engines inc");
  });

  it("carries the photo url through unmodified — no filter/transform field exists (Requirement 2.4)", () => {
    const photoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "photo");
    const photo = photoElements[0] as Extract<(typeof plan.elements)[number], { kind: "image" }>;

    expect(photo.url).toBe(speaker.photo_url);
    expect("filter" in photo).toBe(false);
    expect("transform" in photo).toBe(false);

    const allowedKeys = new Set(["kind", "role", "url", "box", "shape", "placeholderInitial"]);
    for (const key of Object.keys(photo)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});

describe("buildSponsorPlan happy path (Requirement 3.1)", () => {
  const sponsor: SponsorLike = {
    id: "sp1",
    name: "Acme Corp",
    logo_url: "https://example.com/acme.png",
    tier: "gold",
    tier_label: null,
  };

  const plan = buildSponsorPlan(sponsor, SPONSOR_TEMPLATES[0], PLATFORM_FORMATS[0], emptyTheme);

  it("contains a logo image element with the sponsor's logo url", () => {
    const logoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "logo");
    expect(logoElements).toHaveLength(1);
    const logo = logoElements[0] as Extract<(typeof plan.elements)[number], { kind: "image" }>;
    expect(logo.url).toBe("https://example.com/acme.png");
  });

  it("contains a sponsorName text element with the sponsor's name", () => {
    const nameElements = plan.elements.filter((el) => el.kind === "text" && el.key === "sponsorName");
    expect(nameElements).toHaveLength(1);
    const nameText = (nameElements[0] as { text: string }).text;
    expect(nameText.toLowerCase()).toBe("acme corp");
  });

  it("contains a tierBadge text element colored via tierAccentColor and derived from the tier", () => {
    const tierElements = plan.elements.filter((el) => el.kind === "text" && el.key === "tierBadge");
    expect(tierElements).toHaveLength(1);
    const tierBadge = tierElements[0] as { text: string; color: string };
    expect(tierBadge.color).toBe(tierAccentColor("gold"));
    expect(["gold", "GOLD"]).toContain(tierBadge.text);
  });
});

describe("buildSponsorPlan with custom tier (Requirement 3.4 spot-check)", () => {
  const sponsor: SponsorLike = {
    id: "sp2",
    name: "Community Co",
    logo_url: "https://example.com/community.png",
    tier: "custom",
    tier_label: "Community Partner",
  };

  const plan = buildSponsorPlan(sponsor, SPONSOR_TEMPLATES[0], PLATFORM_FORMATS[0], emptyTheme);

  it("uses tier_label for the tierBadge text, not the literal 'custom'", () => {
    const tierElements = plan.elements.filter((el) => el.kind === "text" && el.key === "tierBadge");
    expect(tierElements).toHaveLength(1);
    const tierBadgeText = (tierElements[0] as { text: string }).text;
    expect(tierBadgeText.toLowerCase()).toBe("community partner");
    expect(tierBadgeText.toLowerCase()).not.toBe("custom");
  });
});

describe("buildComboPlan happy path (Requirement 4.1)", () => {
  const speaker: SpeakerLike = {
    id: "s1",
    name: "Ada Lovelace",
    photo_url: "https://example.com/ada.jpg",
    title: "Chief Scientist",
    designation: "CTO",
    company: "Analytical Engines Inc",
  };

  const sponsor: SponsorLike = {
    id: "sp1",
    name: "Acme Corp",
    logo_url: "https://example.com/acme.png",
    tier: "gold",
    tier_label: null,
  };

  // Verify the assumption this test relies on: COMBO_TEMPLATES[0] declares a divider.
  it("COMBO_TEMPLATES[0] declares a divider (assumption check)", () => {
    expect(COMBO_TEMPLATES[0].divider).toBeDefined();
  });

  const plan = buildComboPlan(speaker, sponsor, COMBO_TEMPLATES[0], PLATFORM_FORMATS[0], emptyTheme);

  it("contains a photo image element with the speaker's photo url", () => {
    const photoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "photo");
    expect(photoElements).toHaveLength(1);
    const photo = photoElements[0] as Extract<(typeof plan.elements)[number], { kind: "image" }>;
    expect(photo.url).toBe(speaker.photo_url);
  });

  it("contains a logo image element with the sponsor's logo url", () => {
    const logoElements = plan.elements.filter((el) => el.kind === "image" && el.role === "logo");
    expect(logoElements).toHaveLength(1);
    const logo = logoElements[0] as Extract<(typeof plan.elements)[number], { kind: "image" }>;
    expect(logo.url).toBe(sponsor.logo_url);
  });

  it("contains a name text element with the speaker's name", () => {
    const nameElements = plan.elements.filter((el) => el.kind === "text" && el.key === "name");
    expect(nameElements).toHaveLength(1);
    expect((nameElements[0] as { text: string }).text.toLowerCase()).toBe("ada lovelace");
  });

  it("contains a sponsorName text element with the sponsor's name", () => {
    const sponsorNameElements = plan.elements.filter((el) => el.kind === "text" && el.key === "sponsorName");
    expect(sponsorNameElements).toHaveLength(1);
    expect((sponsorNameElements[0] as { text: string }).text.toLowerCase()).toBe("acme corp");
  });

  it("contains a presentedBy text element", () => {
    const presentedByElements = plan.elements.filter((el) => el.kind === "text" && el.key === "presentedBy");
    expect(presentedByElements).toHaveLength(1);
  });

  it("contains a divider element separating speaker and sponsor", () => {
    const dividerElements = plan.elements.filter((el) => el.kind === "divider");
    expect(dividerElements).toHaveLength(1);
  });
});
