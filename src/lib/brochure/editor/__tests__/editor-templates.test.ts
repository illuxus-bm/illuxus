// Unit tests for src/lib/brochure/editor/editor-templates.ts
//
// `seedBrochureDocument` is what an organizer who never opens the editor
// actually downloads, so its failures are silent ones: a session dropped off
// the end of the agenda, a paragraph clipped by its card, a row printed past
// the bottom of the page. None of those throw. These tests pin the properties
// that keep the seeded brochure whole for content of any length — everything
// supplied is on a page, and everything on a page is inside it.
import { describe, expect, it } from "vitest";
import { BROCHURE_THEMES, type BrochureSectionId, type BrochureTheme } from "../../brochure-templates";
import type { BrochureDocument, BrochurePage, TextElement } from "../editor-document";
import { EDITOR_SEED_VERSION, seedBrochureDocument, type TemplateSeedInput } from "../editor-templates";

const theme = (id: string): BrochureTheme => {
  const found = BROCHURE_THEMES.find((t) => t.id === id);
  if (!found) throw new Error(`theme ${id} missing`);
  return found;
};
const POSTER = theme("poster-bold");
const CLASSIC = theme("classic-editorial");

const LOREM =
  "AI is reshaping the software delivery lifecycle, enabling organizations to move from automation to intelligent, autonomous operations.";

/** Local-time ISO string, so the formatted start time doesn't depend on the
 *  machine's time zone. */
const at = (hour: number, minute: number): string => new Date(2026, 7, 12, hour, minute).toISOString();

const session = (i: number, extra: Partial<NonNullable<TemplateSeedInput["sessions"]>[number]> = {}) => ({
  id: `s${i}`,
  title: `Session ${i}`,
  start_time: at(8 + Math.floor(i / 4), (i % 4) * 15),
  end_time: at(8 + Math.floor(i / 4), (i % 4) * 15 + 10),
  speakerNames: [],
  ...extra,
});

const baseInput = (overrides: Partial<TemplateSeedInput> = {}): TemplateSeedInput => ({
  eventTitle: "DevOps Connect",
  dateText: "12 Aug 2026 | 09:00 AM onwards",
  venueText: "Bangalore",
  coverImageUrl: "https://example.com/cover.png",
  ...overrides,
});

const seed = (input: TemplateSeedInput, ids: BrochureSectionId[], t: BrochureTheme = POSTER): BrochureDocument =>
  seedBrochureDocument(input, t, ids);

const texts = (page: BrochurePage): TextElement[] =>
  page.elements.filter((el): el is TextElement => el.kind === "text");
const allText = (doc: BrochureDocument): string[] => doc.pages.flatMap((p) => texts(p).map((t) => t.content));
const count = (haystack: string[], needle: string): number => haystack.filter((s) => s === needle).length;

/** Every text element sits inside its page. Shapes and images may bleed off
 *  the edge on purpose (the cover's footer card); text never should. */
function expectTextInsidePages(doc: BrochureDocument): void {
  for (const page of doc.pages) {
    for (const el of texts(page)) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.x + el.width).toBeLessThanOrEqual(page.width + 0.001);
      expect(el.y + el.height, `"${el.content.slice(0, 40)}" runs off the page`).toBeLessThanOrEqual(page.height + 0.001);
    }
  }
}

describe("seedBrochureDocument", () => {
  it("stamps the current seed version", () => {
    expect(seed(baseInput(), ["cover"]).templateVersion).toBe(EDITOR_SEED_VERSION);
  });

  it("skips sections that have no content, and never returns zero pages", () => {
    const doc = seed(baseInput(), ["abstract", "whySponsor", "agenda", "speakers", "sponsors", "pricing", "venueLogistics", "sponsorshipPackages"]);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].elements).toEqual([]);
  });

  it("gives z-order in paint order on every page", () => {
    const doc = seed(
      baseInput({ abstract: LOREM, numberedItems: ["One", "Two"], sessions: [session(0), session(1)] }),
      ["cover", "abstract", "whySponsor", "agenda"]
    );
    for (const page of doc.pages) {
      page.elements.forEach((el, i) => expect(el.zIndex).toBe(i));
    }
  });
});

describe("cover", () => {
  it("stacks a two-word title on two lines at the largest size", () => {
    const [page] = seed(baseInput(), ["cover"]).pages;
    const title = texts(page).find((t) => t.content === "DevOps\nConnect");
    expect(title).toBeDefined();
    expect(title!.fontSize).toBeGreaterThan(60);
  });

  it("shrinks a long title instead of letting it overflow", () => {
    const longTitle = "The Global Platform Engineering and Site Reliability Leadership Forum 2026";
    const doc = seed(baseInput({ eventTitle: longTitle }), ["cover"]);
    const title = texts(doc.pages[0]).find((t) => t.content.replace(/\n/g, " ") === longTitle);
    expect(title).toBeDefined();
    expect(title!.fontSize).toBeLessThan(60);
    expectTextInsidePages(doc);
  });

  it("omits the hero image, organizer credit and social caption when they aren't configured", () => {
    const [page] = seed(baseInput({ coverImageUrl: "" }), ["cover"]).pages;
    expect(page.elements.some((el) => el.kind === "image")).toBe(false);
    const content = texts(page).map((t) => t.content);
    expect(content).not.toContain("Conceptualized & Organized by");
    expect(content).not.toContain("Follow us on social media");
  });

  it("draws one icon per social link", () => {
    const [page] = seed(
      baseInput({ coverImageUrl: "", socialLinks: [{ platform: "linkedin" }, { platform: "twitter" }] }),
      ["cover"]
    ).pages;
    expect(page.elements.filter((el) => el.kind === "image")).toHaveLength(2);
    expect(texts(page).map((t) => t.content)).toContain("Follow us on social media");
  });
});

describe("inner page lockup", () => {
  it("shows the event name on every inner page even with no logo", () => {
    const doc = seed(
      baseInput({ abstract: LOREM, numberedItems: ["One"], sessions: [session(0)], pricingCards: [{ title: "Individual", price: "₹15,000/-" }] }),
      ["abstract", "whySponsor", "agenda", "pricing"]
    );
    expect(doc.pages).toHaveLength(4);
    for (const page of doc.pages) {
      const content = texts(page).map((t) => t.content);
      expect(content).toContain("DevOps");
      expect(content).toContain("Connect");
    }
  });

  it("uses the on-dark logo on colored pages and the standard logo elsewhere", () => {
    const doc = seed(
      baseInput({ logoUrl: "https://example.com/logo.png", logoOnDarkUrl: "https://example.com/logo-white.png", abstract: LOREM, sessions: [session(0)] }),
      ["abstract", "agenda"]
    );
    const imageSources = (page: BrochurePage): string[] =>
      page.elements.flatMap((el) => (el.kind === "image" ? [el.src] : []));
    expect(imageSources(doc.pages[0])).toContain("https://example.com/logo-white.png");
    expect(imageSources(doc.pages[1])).toContain("https://example.com/logo.png");
  });
});

describe("abstract page", () => {
  it("paints each label tab over its card, not under it", () => {
    const [page] = seed(baseInput({ abstract: LOREM, featured: LOREM }), ["abstract"]).pages;
    for (const label of ["ABSTRACT", "Featured"]) {
      const tab = texts(page).find((t) => t.content === label);
      expect(tab).toBeDefined();
      const card = page.elements.find(
        (el) => el.kind === "shape" && el.groupId === tab!.groupId && el.width > 150
      );
      expect(card).toBeDefined();
      expect(tab!.zIndex).toBeGreaterThan(card!.zIndex);
    }
  });

  const outcomes = ["A", "B", "C", "D", "E", "F"];
  const body = (d: BrochureDocument): TextElement => texts(d.pages[0]).find((t) => t.content.startsWith("AI is reshaping"))!;

  it("steps the type down to keep longer copy on one page", () => {
    const short = seed(baseInput({ abstract: LOREM, learningOutcomes: outcomes }), ["abstract"]);
    const longer = Array.from({ length: 3 }, () => LOREM).join(" ");
    const doc = seed(baseInput({ abstract: longer, featured: longer, learningOutcomes: outcomes }), ["abstract"]);
    expect(doc.pages).toHaveLength(1);
    expect(body(doc).fontSize).toBeLessThan(body(short).fontSize);
    expectTextInsidePages(doc);
  });

  it("carries on to another page when copy is too long even at the smallest size", () => {
    const long = Array.from({ length: 12 }, () => LOREM).join(" ");
    const doc = seed(baseInput({ abstract: long, featured: long, learningOutcomes: outcomes }), ["abstract"]);
    expect(doc.pages.length).toBeGreaterThan(1);
    const content = allText(doc);
    expect(count(content, "ABSTRACT")).toBe(1);
    expect(count(content, "Featured")).toBe(1);
    for (const o of outcomes) expect(count(content, o)).toBe(1);
    expectTextInsidePages(doc);
  });
});

describe("why-sponsor page", () => {
  it("lists every item, numbered, inside the page", () => {
    const items = Array.from({ length: 14 }, (_, i) => `Reason ${i + 1}: ${LOREM}`);
    const doc = seed(baseInput({ numberedItems: items }), ["whySponsor"]);
    expect(doc.pages).toHaveLength(1);
    const content = allText(doc);
    for (const item of items) expect(content).toContain(item);
    expect(content).toContain("14");
    expectTextInsidePages(doc);
  });
});

describe("poster agenda", () => {
  it("shows each session's start time, not the range", () => {
    const doc = seed(baseInput({ sessions: [session(0, { start_time: at(9, 40), end_time: at(10, 20) })] }), ["agenda"]);
    const content = allText(doc);
    expect(content).toContain("09:40 AM");
    expect(content.some((c) => c.includes(" - "))).toBe(false);
  });

  it("turns dash-prefixed description lines into bullets", () => {
    const doc = seed(
      baseInput({ sessions: [session(0, { description: "Intro paragraph.\n- First point\n- Second point" })] }),
      ["agenda"]
    );
    const content = allText(doc);
    expect(content).toContain("Intro paragraph.");
    expect(content).toContain("First point");
    expect(content).toContain("Second point");
    expect(count(content, "•")).toBe(2);
  });

  it("keeps a short day on one page, using both columns", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(i));
    const doc = seed(baseInput({ sessions }), ["agenda"]);
    expect(doc.pages).toHaveLength(1);
    const titleXs = new Set(texts(doc.pages[0]).filter((t) => /^Session \d+$/.test(t.content)).map((t) => t.x));
    expect(titleXs.size).toBe(2);
  });

  it("continues a long day onto further pages without dropping or repeating a session", () => {
    const sessions = Array.from({ length: 40 }, (_, i) =>
      session(i, { description: `${LOREM}\n- ${LOREM}\n- ${LOREM}`, sessionType: i % 3 === 0 ? "panel" : "break" })
    );
    const doc = seed(baseInput({ sessions }), ["agenda"]);
    expect(doc.pages.length).toBeGreaterThan(1);
    const content = allText(doc);
    for (const s of sessions) expect(count(content, s.title)).toBe(1);
    expectTextInsidePages(doc);
  });

  it("never stacks two sessions on top of each other within a column", () => {
    const sessions = Array.from({ length: 16 }, (_, i) =>
      session(i, { title: i % 2 ? `Session ${i}` : `Session ${i}: ${LOREM}`, description: i % 2 ? undefined : LOREM })
    );
    const doc = seed(baseInput({ sessions }), ["agenda"]);
    for (const page of doc.pages) {
      // Time chips are the black rects at a column's left edge.
      const chips = page.elements.filter((el) => el.kind === "shape" && el.fill === "#000000" && el.width < 30);
      const byColumn = new Map<number, typeof chips>();
      for (const chip of chips) byColumn.set(chip.x, [...(byColumn.get(chip.x) ?? []), chip]);
      for (const column of byColumn.values()) {
        const sorted = [...column].sort((a, b) => a.y - b.y);
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].height);
        }
      }
    }
  });
});

describe("classic agenda", () => {
  it("lists every session across as many pages as it takes", () => {
    const sessions = Array.from({ length: 45 }, (_, i) => session(i, { speakerNames: ["Jane Doe"] }));
    const doc = seed(baseInput({ sessions }), ["agenda"], CLASSIC);
    expect(doc.pages.length).toBeGreaterThan(1);
    const content = allText(doc);
    for (const s of sessions) expect(count(content, s.title)).toBe(1);
    expectTextInsidePages(doc);
  });
});

describe("speakers", () => {
  const speakers = Array.from({ length: 30 }, (_, i) => ({
    id: `sp${i}`,
    name: `Speaker Number ${i}`,
    title: "Chief Technology Officer",
    company: "Example Corporation",
    display_order: i,
  }));

  it.each([
    ["poster", POSTER],
    ["classic", CLASSIC],
  ])("shows every speaker on the %s theme, paginating past the first page", (_name, t) => {
    const doc = seed(baseInput({ speakers }), ["speakers"], t);
    expect(doc.pages.length).toBeGreaterThan(1);
    const content = allText(doc);
    for (const s of speakers) expect(count(content, s.name)).toBe(1);
    expectTextInsidePages(doc);
  });
});

describe("pricing page", () => {
  it("renders cards and three attendee blocks of the registration form", () => {
    const doc = seed(
      baseInput({
        pricingCards: [
          { title: "Individual", subtitle: "Early Bird: ₹12,500/-", price: "₹15,000/-", discounts: ["10% on 2 or more participants"] },
          { title: "Award Nominations", price: "₹25,000/-" },
        ],
        showRegistrationForm: true,
      }),
      ["pricing"]
    );
    const content = allText(doc);
    expect(content).toContain("INDIVIDUAL");
    expect(content).toContain("AWARD NOMINATIONS");
    expect(content).toContain("Group Discounts");
    expect(count(content, "Name")).toBe(3);
    expect(count(content, "Email")).toBe(3);
    expect(doc.pages[0].elements.filter((el) => el.kind === "pill")).toHaveLength(12);
    expectTextInsidePages(doc);
  });

  it("is skipped with no cards and no form", () => {
    expect(seed(baseInput({ pricingCards: [], showRegistrationForm: false }), ["cover", "pricing"]).pages).toHaveLength(1);
  });
});

describe("partnership packages", () => {
  const benefits = Array.from({ length: 10 }, (_, i) => `Benefit ${i + 1}`);
  const tier = (name: string) => ({ name, price: "INR 1,00,000 + GST", cells: benefits.map((_, i) => (i % 3 === 0 ? false : `Value ${i}`)) });

  it("draws a cross icon for excluded benefits and leaves empty cells blank", () => {
    const doc = seed(
      baseInput({
        sponsorshipPackages: { title: "Premium Partnership Packages", benefits: ["A", "B", "C"], tiers: [{ name: "Gold", cells: [false, true, null] }] },
      }),
      ["sponsorshipPackages"]
    );
    expect(doc.pages[0].elements.filter((el) => el.kind === "image")).toHaveLength(2);
    expect(allText(doc)).not.toContain("—");
  });

  it("splits more than four tiers into equal tables, each tier shown once", () => {
    const tiers = ["Presenting", "Co-Presenting", "Knowledge", "Platinum", "Gold", "Exhibit"].map(tier);
    const doc = seed(baseInput({ sponsorshipPackages: { title: "Packages", benefits, tiers } }), ["sponsorshipPackages"]);
    expect(doc.pages).toHaveLength(2);
    const content = allText(doc);
    for (const t of tiers) expect(count(content, t.name)).toBe(1);
    expect(count(content, "Cost")).toBe(2);
    expectTextInsidePages(doc);
  });

  it("continues a long benefit list on another page, with the cost row only at the end", () => {
    const many = Array.from({ length: 60 }, (_, i) => `Benefit ${i + 1}`);
    const doc = seed(
      baseInput({ sponsorshipPackages: { title: "Packages", benefits: many, tiers: [{ name: "Gold", price: "INR 1", cells: many.map(() => "Yes") }] } }),
      ["sponsorshipPackages"]
    );
    expect(doc.pages.length).toBeGreaterThan(1);
    const content = allText(doc);
    for (const b of many) expect(count(content, b)).toBe(1);
    expect(count(content, "Cost")).toBe(1);
    expect(texts(doc.pages[doc.pages.length - 1]).map((t) => t.content)).toContain("Cost");
    expectTextInsidePages(doc);
  });
});

describe("full poster brochure", () => {
  it("keeps all text inside the page for a realistic event", () => {
    const doc = seed(
      baseInput({
        coverTagline: "Redefining DevOps in the Era of Intelligent Automation",
        abstract: `${LOREM} ${LOREM} ${LOREM}`,
        featured: `${LOREM} ${LOREM}`,
        learningOutcomes: ["Master AI-Driven DevOps", "Optimize Cloud Costs with FinOps", "Enhance Security with DevSecOps"],
        numberedItems: Array.from({ length: 8 }, () => LOREM),
        sessions: Array.from({ length: 14 }, (_, i) => session(i, { description: i % 4 === 2 ? `${LOREM}\n- ${LOREM}` : undefined })),
        pricingCards: [{ title: "Individual", price: "₹15,000/-", discounts: ["10% on 2 or more participants", "20% on 5 or more participants"] }],
        showRegistrationForm: true,
        venueLogistics: { venue: "Taj MG Road", location: `${LOREM} ${LOREM}`, parkingNotes: LOREM, transitNotes: LOREM },
      }),
      ["cover", "abstract", "whySponsor", "agenda", "pricing", "venueLogistics"]
    );
    expect(doc.pages).toHaveLength(6);
    expectTextInsidePages(doc);
  });
});
