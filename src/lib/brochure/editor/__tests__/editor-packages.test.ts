// The partnership pages: several comparison tables, the "Additional
// Partnerships" price list and the footnote, as in the reference pricing deck.
import { describe, expect, it } from "vitest";

import { BROCHURE_THEMES } from "../../brochure-templates";
import type { SponsorshipPackagesInput } from "../../brochure-sections";
import type { BrochurePage } from "../editor-document";
import { seedBrochureDocument } from "../editor-templates";

const texts = (page: BrochurePage): string[] =>
  page.elements.flatMap((e) => (e.kind === "text" ? [e.content.replace(/\n/g, " ")] : []));

function pagesFor(packages: SponsorshipPackagesInput): BrochurePage[] {
  return seedBrochureDocument(
    { eventTitle: "DevOps Connect", dateText: "12 Aug 2026", venueText: "Bangalore", coverImageUrl: "", sponsorshipPackages: packages },
    BROCHURE_THEMES[0],
    ["sponsorshipPackages"],
  ).pages;
}

const premium: SponsorshipPackagesInput = {
  title: "Premium Partnership Packages",
  benefits: ["Thought Leadership Keynote", "Logo on Lanyard"],
  tiers: [
    { name: "Presenting Partner", price: "INR 8,00,000 + GST", cells: ["30 mins", "Exclusive"] },
    { name: "Knowledge Partner", price: "INR 5,00,000 + GST", cells: ["15 mins", false] },
  ],
};
const standard = {
  title: "Standard Partnership Packages",
  benefits: ["Curated 1:1 Meetings"],
  tiers: [{ name: "Gold Partner", price: "INR 2,50,000 + GST", cells: ["2 meetings"] }],
};
const additional = [
  { label: "Associate Partner", price: "INR 80,000/-" },
  { label: "", price: "" },
];
const footnote = "*The attendee list will be shared with all partners after the event*";

describe("partnership packages pages", () => {
  it("gives each table its own page under its own title", () => {
    const pages = pagesFor({ ...premium, more: [standard] });
    expect(pages).toHaveLength(2);
    expect(texts(pages[0])).toEqual(expect.arrayContaining(["Premium Partnership Packages", "Presenting Partner", "INR 8,00,000 + GST"]));
    expect(texts(pages[1])).toEqual(expect.arrayContaining(["Standard Partnership Packages", "Gold Partner", "2 meetings"]));
    expect(texts(pages[1])).not.toContain("Presenting Partner");
  });

  it("lists the extras once, under the last table, skipping blank lines", () => {
    const pages = pagesFor({ ...premium, more: [standard], additional });
    expect(pages).toHaveLength(2);
    expect(texts(pages[0])).not.toContain("Additional Partnerships");
    expect(texts(pages[1])).toEqual(expect.arrayContaining(["Additional Partnerships", "Associate Partner", "INR 80,000/-"]));
    expect(texts(pages[1]).filter((t) => t === "")).toEqual([]);
  });

  it("uses the organiser's heading for the extras", () => {
    const pages = pagesFor({ ...premium, additional, additionalTitle: "Add-ons" });
    expect(texts(pages[0])).toContain("Add-ons");
  });

  it("puts the footnote under every table", () => {
    const pages = pagesFor({ ...premium, more: [standard], footnote });
    expect(pages.every((page) => texts(page).includes(footnote))).toBe(true);
  });

  it("moves the extras to a page of their own when the last table leaves no room", () => {
    const benefits = Array.from({ length: 23 }, (_, i) => `Benefit ${i + 1}`);
    const pages = pagesFor({
      title: "Premium Partnership Packages",
      benefits,
      tiers: [{ name: "Presenting Partner", price: "INR 1", cells: benefits.map(() => "Yes") }],
      additional: Array.from({ length: 6 }, (_, i) => ({ label: `Extra ${i + 1}`, price: "INR 1" })),
    });
    const withExtras = pages.filter((page) => texts(page).includes("Extra 1"));
    expect(withExtras).toHaveLength(1);
    expect(texts(withExtras[0])).not.toContain("Benefit 1");
  });

  it("keeps every element on the page", () => {
    for (const page of pagesFor({ ...premium, more: [standard], additional, footnote })) {
      for (const el of page.elements) {
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.y + el.height).toBeLessThanOrEqual(297.5);
        expect(el.x + el.width).toBeLessThanOrEqual(210.5);
      }
    }
  });

  it("shows only the extras when there is no table", () => {
    const pages = pagesFor({ additional, footnote });
    expect(pages).toHaveLength(1);
    expect(texts(pages[0])).toEqual(expect.arrayContaining(["Additional Partnerships", "Associate Partner", footnote]));
  });

  it("produces nothing when there is nothing to show", () => {
    expect(pagesFor({})).toHaveLength(1); // the seed's blank-page fallback
    expect(pagesFor({})[0].elements).toHaveLength(0);
  });
});
