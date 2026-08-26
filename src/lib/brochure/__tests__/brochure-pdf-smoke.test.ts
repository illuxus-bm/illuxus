/**
 * Smoke test for `generateBrochurePdf` using a REAL (unmocked) `jsPDF`
 * instance — only `fetch` is stubbed (to a deterministic failure, so the
 * speaker photo and sponsor logo fall back to their documented
 * placeholders without ever hitting the network under jsdom/vitest). This
 * exercises the full `buildBrochureDocument` assembly pipeline: cover,
 * agenda (autoTable), speakers (manual grid + placeholder), sponsors
 * (autoTable + text fallback), and venue/logistics (QR code via the real
 * `qrcode` package, which needs no network).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { BROCHURE_THEMES, DEFAULT_SECTION_LAYOUT } from "../brochure-templates";
import { generateBrochurePdf, type BrochureGenerationInput } from "../brochure-pdf";

describe("generateBrochurePdf (smoke)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces a non-empty application/pdf Blob for a minimal fixture", async () => {
    // Every image fetch fails deterministically — speaker photo and
    // sponsor logo should fall back to their placeholders rather than
    // throwing or hitting the real network.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    const input: BrochureGenerationInput = {
      event: {
        title: "Annual Tech Summit",
        date: "2026-03-01T09:00:00.000Z",
        end_date: "2026-03-01T18:00:00.000Z",
        venue: "Grand Hall",
        location: "123 Main St, Springfield",
        image_url: null,
        banner_landscape_url: null,
      },
      sessions: [
        {
          id: "s1",
          title: "Opening Keynote",
          start_time: "2026-03-01T09:00:00.000Z",
          end_time: "2026-03-01T10:00:00.000Z",
          speakerNames: ["Jane Doe"],
        },
      ],
      speakers: [
        {
          id: "sp1",
          name: "Jane Doe",
          photo_url: "https://example.com/jane.png",
          title: "CEO",
          designation: null,
          company: "Acme Corp",
          display_order: 0,
        },
      ],
      sponsors: [
        {
          id: "sn1",
          name: "Acme Sponsor",
          logo_url: "https://example.com/logo.png",
          tier: "platinum",
          display_order: 0,
        },
      ],
      venueLogistics: {
        venue: "Grand Hall",
        location: "123 Main St, Springfield",
        mapEmbedUrl: "https://maps.example.com/embed?q=grand-hall",
        parkingNotes: "Parking available on-site.",
        transitNotes: "Nearest station: Central.",
      },
      theme: BROCHURE_THEMES[0],
      eventTheme: {},
      sectionLayout: DEFAULT_SECTION_LAYOUT,
    };

    const blob = await generateBrochurePdf(input);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("calls onProgress once per included section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    const onProgress = vi.fn();

    const input: BrochureGenerationInput = {
      event: {
        title: "Minimal Event",
        date: "2026-05-01T09:00:00.000Z",
      },
      sessions: [],
      speakers: [],
      sponsors: [],
      venueLogistics: {},
      // Only one theme ships now (Classic). Was `BROCHURE_THEMES[1]`
      // when the registry had five themes; kept using index 0 after
      // the trim.
      theme: BROCHURE_THEMES[0],
      eventTheme: {},
      sectionLayout: DEFAULT_SECTION_LAYOUT,
      onProgress,
    };

    await generateBrochurePdf(input);

    // Zero sponsors -> sponsors section id is dropped from the resolved
    // list (Requirement 5.7). Zero venue/location/logistics -> the
    // venueLogistics id is also dropped (Requirement 6.5) rather than
    // consuming a blank page. Only cover, agenda, speakers remain.
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it("draws a Sponsorship_Packages comparison table (autoTable + vector check/cross glyphs) without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    const input: BrochureGenerationInput = {
      event: {
        title: "Annual Tech Summit",
        date: "2026-03-01T09:00:00.000Z",
      },
      sessions: [],
      speakers: [],
      sponsors: [],
      venueLogistics: {},
      theme: BROCHURE_THEMES[0],
      eventTheme: {},
      sectionLayout: [
        { id: "cover", included: true },
        { id: "sponsorshipPackages", included: true },
      ],
      posterContent: {
        sponsorshipPackages: {
          title: "Premium Partnership Packages",
          benefits: [
            "Chairperson's Opening Remark",
            "Exhibit Table Space",
            "Curated 1:1 Meetings",
            "Company Profile",
          ],
          tiers: [
            {
              name: "Presenting Partner",
              price: "INR 8,00,000 + GST",
              cells: [false, true, "10 meetings", "350 words"],
            },
            {
              name: "Knowledge Partner",
              price: "INR 5,00,000 + GST",
              cells: [false, true, "4 meetings", null],
            },
          ],
        },
      },
    };

    const blob = await generateBrochurePdf(input);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("generateBrochurePdf (Poster Bold theme, smoke)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the Poster_Bold cover, Abstract, Why Sponsor, timetable-cards Agenda, and Pricing sections without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    const posterBoldTheme = BROCHURE_THEMES.find((t) => t.id === "poster-bold");
    expect(posterBoldTheme).toBeDefined();
    expect(posterBoldTheme?.agenda.layout).toBe("timetable-cards");

    const input: BrochureGenerationInput = {
      event: {
        title: "DevOps Connect",
        date: "2026-08-12T09:00:00.000Z",
        venue: "Bangalore",
        image_url: "https://example.com/cover.png",
      },
      sessions: [
        {
          id: "s1",
          title: "Panel Discussion 1: Agentic AI, AIOps & The Future of Autonomous Software Delivery",
          description:
            "AI is reshaping the software delivery lifecycle, enabling organizations to move from automation to intelligent, autonomous operations.",
          start_time: "2026-08-12T09:40:00.000Z",
          end_time: "2026-08-12T10:20:00.000Z",
          speakerNames: ["Jane Doe"],
        },
        {
          id: "s2",
          title: "Panel Discussion 2: Platform Engineering, DevEx & Engineering Productivity at Scale",
          description: "Platform engineering is becoming a key enabler of developer productivity and business agility.",
          start_time: "2026-08-12T10:40:00.000Z",
          end_time: "2026-08-12T11:20:00.000Z",
          speakerNames: [],
        },
      ],
      speakers: [],
      sponsors: [],
      venueLogistics: {},
      theme: posterBoldTheme!,
      eventTheme: {},
      sectionLayout: [
        { id: "cover", included: true },
        { id: "abstract", included: true },
        { id: "whySponsor", included: true },
        { id: "agenda", included: true },
        { id: "pricing", included: true },
      ],
      posterContent: {
        coverTagline: "You're Invited",
        abstract: {
          abstract: "DevOps Connect is a premier conference bringing together technology leaders.",
          featured: "Keynotes, panel discussions, & expert-led sessions.",
          learningOutcomes: ["Master AI-Driven DevOps", "Optimize Cloud Costs with FinOps"],
        },
        whySponsor: {
          items: ["Connect with CIOs, CTOs, DevOps leaders.", "Showcase your solutions in automation."],
        },
        pricing: {
          cards: [{ title: "Individual", price: "₹15,000/-", discounts: ["10% on 2 or more participants"] }],
          showRegistrationForm: true,
        },
      },
    };

    const blob = await generateBrochurePdf(input);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});
