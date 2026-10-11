// Brochure types built on the poster layout (a colour scheme and a face each),
// and the first page that is the event's own poster.
import { describe, expect, it } from "vitest";

import { BROCHURE_THEMES, isPosterFamily, POSTER_BOLD_SECTION_LAYOUT, resolveSectionLayout } from "../../brochure-templates";
import type { BrochureDocument } from "../editor-document";
import { seedBrochureDocument, type TemplateSeedInput } from "../editor-templates";

const INPUT: TemplateSeedInput = {
  eventTitle: "DevOps Connect",
  dateText: "12 Aug 2026 | 09:00 AM onwards",
  venueText: "Bangalore",
  coverImageUrl: "",
  coverTagline: "Redefining DevOps in the Era of Intelligent Automation",
  abstract: "DevOps Connect is a premier conference for engineering leaders.",
  featured: "Keynotes, panels and expert-led sessions.",
  learningOutcomes: ["Master AI-Driven DevOps", "Optimize Cloud Costs with FinOps"],
  numberedItems: ["Connect with CIOs and CTOs.", "Showcase your solutions."],
  pricingCards: [{ title: "INDIVIDUAL", subtitle: "Early Bird: ₹12,500/-", price: "₹15,000/-", discounts: ["10% on 2 or more participants"] }],
  showRegistrationForm: true,
  socialLinks: [{ platform: "linkedin" }],
  sessions: [
    { id: "1", title: "Registration & Breakfast", description: null, start_time: "2026-08-12T03:00:00Z", end_time: "2026-08-12T04:00:00Z", speakerNames: [], session_type: "break" },
    { id: "2", title: "Panel Discussion 1", description: "AI is reshaping delivery.", start_time: "2026-08-12T04:10:00Z", end_time: "2026-08-12T05:00:00Z", speakerNames: [], session_type: "panel" },
  ] as unknown as TemplateSeedInput["sessions"],
};

const sections = resolveSectionLayout(POSTER_BOLD_SECTION_LAYOUT);
const theme = (id: string) => {
  const found = BROCHURE_THEMES.find((t) => t.id === id);
  if (!found) throw new Error(`no theme ${id}`);
  return found;
};
const seed = (id: string, extra: Partial<TemplateSeedInput> = {}): BrochureDocument =>
  seedBrochureDocument({ ...INPUT, accentColor: theme(id).defaultColors.accentColor, fontFamily: theme(id).defaultColors.fontFamily, ...extra }, theme(id), sections);

/** Every flat colour a document paints with. */
function colours(doc: BrochureDocument): Set<string> {
  const used = new Set<string>();
  for (const page of doc.pages) {
    if (page.background.type === "solid") used.add(page.background.color.toLowerCase());
    for (const el of page.elements) {
      if (el.kind === "text") used.add(el.color.toLowerCase());
      if (el.kind === "shape") [el.fill, el.stroke].forEach((c) => used.add(c.toLowerCase()));
      if (el.kind === "pill") [el.textColor, el.fillColor, el.strokeColor].forEach((c) => used.add(c.toLowerCase()));
    }
  }
  return used;
}

const variants = BROCHURE_THEMES.filter((t) => t.scheme);

describe("brochure types", () => {
  it("offers several types on the poster layout, with unique ids", () => {
    expect(variants.length).toBeGreaterThanOrEqual(4);
    expect(new Set(BROCHURE_THEMES.map((t) => t.id)).size).toBe(BROCHURE_THEMES.length);
    expect(BROCHURE_THEMES[0].id).toBe("poster-bold");
    for (const t of variants) expect(isPosterFamily(t)).toBe(true);
    expect(isPosterFamily(theme("classic-editorial"))).toBe(false);
  });

  it.each(variants)("$name has the same pages and elements as Poster Bold, in its own colours", (variant) => {
    const base = seed("poster-bold");
    const doc = seed(variant.id);
    expect(doc.pages.map((p) => p.elements.length)).toEqual(base.pages.map((p) => p.elements.length));
    // Geometry is untouched — a scheme recolours, it doesn't re-lay-out.
    expect(doc.pages.map((p) => p.elements.map((e) => [e.x, e.y, e.width, e.height]))).toEqual(
      base.pages.map((p) => p.elements.map((e) => [e.x, e.y, e.width, e.height])),
    );
    const used = colours(doc);
    const scheme = variant.scheme!;
    expect(used).toContain(scheme.ink.toLowerCase());
    expect(used).toContain(scheme.paper.toLowerCase());
    expect(used).toContain(variant.defaultColors.accentColor.toLowerCase());
    // None of the poster's own neutrals are left behind, unless the scheme keeps one.
    for (const neutral of ["#000000", "#f6f6f6", "#ffffff"]) {
      const kept = [scheme.ink, scheme.paper, scheme.card].some((c) => c.toLowerCase() === neutral);
      if (!kept) expect(used).not.toContain(neutral);
    }
  });

  it("leaves Poster Bold itself in black, white and paper", () => {
    const used = colours(seed("poster-bold"));
    expect(used).toContain("#000000");
    expect(used).toContain("#f6f6f6");
  });

  it("squares the corners where the scheme says so, and rounds them further where it says that", () => {
    const radii = (doc: BrochureDocument): number[] => doc.pages.flatMap((p) => p.elements.flatMap((e) => (e.kind === "shape" ? [e.cornerRadius] : [])));
    const base = radii(seed("poster-bold"));
    expect(base.some((r) => r > 0)).toBe(true);
    expect(radii(seed("executive")).every((r) => r === 0)).toBe(true);
    expect(Math.max(...radii(seed("royal")))).toBeGreaterThan(Math.max(...base));
  });

  it("recolours black glyph icons to the ink but leaves brand icons alone", () => {
    const icons = (doc: BrochureDocument): string[] =>
      doc.pages.flatMap((p) => p.elements.flatMap((e) => (e.kind === "image" && e.src.startsWith("data:image/svg") ? [decodeURIComponent(e.src)] : [])));
    const base = icons(seed("poster-bold"));
    const dark = icons(seed("midnight"));
    expect(dark).toHaveLength(base.length);
    const blackGlyphs = base.filter((svg) => /#000(000)?\b/i.test(svg));
    expect(blackGlyphs.length).toBeGreaterThan(0);
    expect(dark.some((svg) => /#000(000)?\b/i.test(svg))).toBe(false);
    // The LinkedIn mark has no black in it, so it is byte-for-byte the same.
    const brand = base.find((svg) => !/#000(000)?\b/i.test(svg));
    expect(brand && dark).toContain(brand);
  });
});

describe("poster first page", () => {
  it("is the event's poster alone, filling the sheet edge to edge", () => {
    const doc = seed("poster-bold", { coverPosterUrl: "https://cdn.test/mobile-poster.jpg" });
    const cover = doc.pages[0];
    expect(cover.elements).toHaveLength(1);
    expect(cover.elements[0]).toMatchObject({ kind: "image", src: "https://cdn.test/mobile-poster.jpg", fit: "cover", x: 0, y: 0, width: cover.width, height: cover.height });
    // The other pages are exactly what they would have been.
    expect(doc.pages.length).toBe(seed("poster-bold").pages.length);
  });

  it("falls back to the designed cover without a poster", () => {
    for (const posterUrl of [undefined, "", "   "]) {
      const cover = seed("poster-bold", { coverPosterUrl: posterUrl }).pages[0];
      expect(cover.elements.length).toBeGreaterThan(1);
      expect(cover.elements.some((e) => e.kind === "text" && e.content.includes("DevOps"))).toBe(true);
    }
  });

  it("is used by every brochure type, untouched by its scheme", () => {
    for (const t of BROCHURE_THEMES) {
      const cover = seed(t.id, { coverPosterUrl: "https://cdn.test/mobile-poster.jpg" }).pages[0];
      expect(cover.elements).toHaveLength(1);
      expect(cover.elements[0]).toMatchObject({ kind: "image", x: 0, y: 0, width: 210, height: 297 });
    }
  });
});
