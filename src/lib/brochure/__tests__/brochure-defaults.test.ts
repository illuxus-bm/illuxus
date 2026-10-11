// Unit tests for src/lib/brochure/brochure-defaults.ts — the copy a brochure
// starts with, so its poster pages aren't empty until someone types them in.
import { describe, expect, it } from "vitest";

import { normalizeConfig } from "@/components/event/page-form/types";

import { defaultPosterContent, fillPosterDefaults, splitAbstract, type PosterDefaultsSource } from "../brochure-defaults";

const source = (overrides: Partial<PosterDefaultsSource> = {}): PosterDefaultsSource => ({
  title: "DevOps Connect",
  description: "DevOps Connect is a premier conference for engineering leaders.\n\nKeynotes, panels and expert-led sessions cover AI-powered DevOps and platform engineering.",
  organizerLogoUrl: "https://cdn.test/org.png",
  sessionTitles: [
    "Registration & Breakfast",
    "Panel Discussion 1: Agentic AI, AIOps & The Future of Autonomous Software Delivery",
    "Networking Tea Break",
    "Technology Leadership Session",
  ],
  config: normalizeConfig(null),
  ...overrides,
});

describe("splitAbstract", () => {
  it("keeps the description's own paragraph break", () => {
    expect(splitAbstract("First paragraph.\n\nSecond paragraph.")).toEqual({ abstract: "First paragraph.", featured: "Second paragraph." });
  });

  it("strips markup", () => {
    expect(splitAbstract("<p>Hello <b>world</b>.</p><p>Again.</p>")).toEqual({ abstract: "Hello world.", featured: "Again." });
  });

  it("leaves a short single paragraph whole", () => {
    expect(splitAbstract("One short line.")).toEqual({ abstract: "One short line.", featured: "" });
  });

  it("divides one long paragraph at a sentence boundary without losing sentences", () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} adds a little more detail about the event.`);
    const { abstract, featured } = splitAbstract(sentences.join(" "));
    expect(abstract.endsWith(".")).toBe(true);
    expect(featured.length).toBeGreaterThan(0);
    expect(abstract).toContain("Sentence number 1 ");
    expect(featured).not.toContain("Sentence number 1 ");
  });

  it("returns nothing for an empty description", () => {
    expect(splitAbstract("")).toEqual({ abstract: "", featured: "" });
  });
});

describe("defaultPosterContent", () => {
  it("fills the abstract page from the description and the organiser logo from the organisation", () => {
    const content = defaultPosterContent(source());
    expect(content.abstract).toBe("DevOps Connect is a premier conference for engineering leaders.");
    expect(content.featured).toContain("Keynotes, panels");
    expect(content.organizerLogoUrl).toBe("https://cdn.test/org.png");
  });

  it("takes learning outcomes from session topics, skipping breaks and registration", () => {
    const outcomes = defaultPosterContent(source()).learningOutcomes ?? [];
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].startsWith("Agentic AI, AIOps")).toBe(true);
    expect(outcomes[0].length).toBeLessThanOrEqual(47);
    expect(outcomes[1]).toBe("Technology Leadership Session");
  });

  it("prefers the event page's highlights for learning outcomes", () => {
    const config = normalizeConfig(null);
    for (const section of config.sections) {
      if (section.id === "about") section.data = { highlights: [{ label: "Speakers", value: "30+" }] };
    }
    expect(defaultPosterContent(source({ config })).learningOutcomes).toEqual(["30+ Speakers"]);
  });

  it("builds pricing cards from ticket tiers and switches the registration form on with them", () => {
    const config = normalizeConfig(null);
    for (const section of config.sections) {
      if (section.id === "tickets") {
        section.data = { tiers: [{ id: "1", name: "Individual", price: "₹15,000/-", description: "Early Bird: ₹12,500/-" }, { id: "2", name: "", price: "1" }] };
      }
    }
    const content = defaultPosterContent(source({ config }));
    expect(content.pricingCards).toEqual([{ title: "INDIVIDUAL", subtitle: "Early Bird: ₹12,500/-", price: "₹15,000/-" }]);
    expect(content.registrationForm).toBe(true);
    expect(defaultPosterContent(source()).pricingCards).toBeUndefined();
  });

  it("always offers why-sponsor points and the four social icons", () => {
    const content = defaultPosterContent(source({ description: null, sessionTitles: [] }));
    expect(content.whySponsor?.[0]).toContain("DevOps Connect");
    expect(content.socialLinks?.map((l) => l.platform)).toEqual(["linkedin", "instagram", "facebook", "twitter"]);
    expect(content.abstract).toBeUndefined();
    expect(content.learningOutcomes).toBeUndefined();
  });
});

describe("fillPosterDefaults", () => {
  it("never replaces what the organiser saved, including a list they emptied", () => {
    const defaults = defaultPosterContent(source());
    const filled = fillPosterDefaults({ abstract: "My own abstract", whySponsor: [] }, defaults);
    expect(filled.abstract).toBe("My own abstract");
    expect(filled.whySponsor).toEqual([]);
    expect(filled.featured).toBe(defaults.featured);
  });

  it("uses the defaults when nothing is saved", () => {
    const defaults = defaultPosterContent(source());
    expect(fillPosterDefaults(undefined, defaults)).toEqual(defaults);
  });
});
