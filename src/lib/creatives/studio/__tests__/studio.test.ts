// Unit tests for the creative studio's pure modules: the templates, the text
// fitter and the event-data derivation. Nothing here needs a canvas — which
// is the point of keeping scenes as plain data.
import { describe, expect, it } from "vitest";

import { normalizeConfig } from "@/components/event/page-form/types";

import { deriveContent, formatDateLine, formatTimeLine, type StudioEventSource } from "../data";
import { layoutText, sceneFonts, sceneImageUrls } from "../render";
import { isHexColor, mix, readableOn, type Scene, type TextNode } from "../scene";
import {
  balanceWords,
  bulletLines,
  findStudioTemplate,
  initialsOf,
  splitLineupTitle,
  STUDIO_FORMATS,
  STUDIO_TEMPLATES,
  studioFilename,
  type BuildInput,
  type StudioContent,
  type StudioSpeaker,
} from "../templates";

const CONTENT: StudioContent = {
  organizerName: "World Business Academy",
  organizerTagline: "Taking responsibility for the whole",
  kicker: "announces the upcoming visit of",
  eventTitle: "World Business Conference 2026",
  subtitle: "Women in Business",
  dateLine: "27–28 March 2026",
  timeLine: "10:00 AM – 5:00 PM",
  venueName: "The Arlington Theatre",
  venueAddress: "2020 Alameda Padre Serra, Suite 135, Santa Barbara, CA 93103",
  infoLabel: "For tickets and information:",
  website: "worldbusiness.org/conference",
  phone: "805.892.4600",
  ctaLabel: "Register now",
  description: "Join us for an inspiring and practical session.",
  bullets: "Turning passion into profit\nBuilding a personal brand\nNetworking secrets\nConfidence coaching\nA fifth point",
  badge: "Live",
  formatLabel: "Webinar",
  speakersLabel: "Guest speakers",
  sponsorLabel: "Sponsor",
  linkLabel: "Register online",
  sideLabel: "Speaker",
  scriptLine: "A Session",
  introLine: "Meet our speaker",
};

const SPEAKERS: StudioSpeaker[] = ["Maela Agatha", "John Levis", "Dave Light", "Mary Ann", "Heart Joy", "Sixth Person"].map(
  (name, i) => ({ id: `s${i}`, name, role: "CEO, Salford & Co.", photoUrl: `https://cdn.test/${i}.jpg` }),
);

const EMPTY_CONTENT = Object.fromEntries(Object.keys(CONTENT).map((key) => [key, ""])) as unknown as StudioContent;

function build(templateId: string, formatIndex: number, overrides: Partial<BuildInput> = {}): Scene {
  const template = findStudioTemplate(templateId);
  return template.build({
    format: STUDIO_FORMATS[formatIndex],
    content: CONTENT,
    speakers: SPEAKERS.slice(0, template.maxSpeakers),
    sponsors: [{ id: "sp1", name: "Men's Wearhouse", logoUrl: "https://cdn.test/logo.png" }],
    organizerLogoUrl: null,
    coverImageUrl: "https://cdn.test/cover.jpg",
    year: "2026",
    palette: template.palette,
    ...overrides,
  });
}

const texts = (scene: Scene): string[] => scene.nodes.flatMap((n) => (n.kind === "text" ? [n.text] : []));

describe("every template in every format", () => {
  const cases = STUDIO_TEMPLATES.flatMap((template) =>
    STUDIO_FORMATS.map((format, index) => ({ template, format, index })).filter(
      ({ format }) => !template.formats || template.formats.includes(format.id),
    ),
  );

  it.each(cases)("$template.name / $format.label keeps text and images on the canvas", ({ template, format, index }) => {
    for (const overrides of [{}, { speakers: [], sponsors: [] }, { content: EMPTY_CONTENT, speakers: [], sponsors: [], coverImageUrl: null }]) {
      const scene = build(template.id, index, overrides);
      expect(scene.width).toBe(format.width);
      expect(scene.height).toBe(format.height);
      for (const node of scene.nodes) {
        if (node.kind !== "text" && node.kind !== "image") continue;
        expect(node.w).toBeGreaterThan(0);
        expect(node.h).toBeGreaterThan(0);
        // A quarter turn swaps the box's sides about its centre; the slight
        // tilts some designs use are allowed their overhang.
        const turned = Math.abs(node.rotation ?? 0) === 90;
        if (node.rotation && !turned) continue;
        const w = turned ? node.h : node.w;
        const h = turned ? node.w : node.h;
        const x = node.x + (node.w - w) / 2;
        const y = node.y + (node.h - h) / 2;
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(x + w).toBeLessThanOrEqual(format.width + 0.5);
        expect(y + h).toBeLessThanOrEqual(format.height + 0.5);
      }
    }
  });

  it.each(cases)("$template.name / $format.label never emits blank text", ({ template, index }) => {
    const scene = build(template.id, index, { content: EMPTY_CONTENT, speakers: [], sponsors: [] });
    for (const text of texts(scene)) expect(text.trim()).not.toBe("");
  });
});

describe("event data on the creative", () => {
  it("Spotlight features the chosen speaker's photo, name and role, and the sponsor's logo", () => {
    const scene = build("studio-spotlight", 0);
    expect(sceneImageUrls(scene)).toEqual(expect.arrayContaining(["https://cdn.test/0.jpg", "https://cdn.test/logo.png"]));
    expect(texts(scene)).toEqual(expect.arrayContaining(["MAELA AGATHA", "CEO, SALFORD & CO.", "WORLD BUSINESS CONFERENCE 2026"]));
  });

  it("Spotlight sets the sponsor's name when it has no logo", () => {
    const scene = build("studio-spotlight", 0, { sponsors: [{ id: "sp1", name: "Men's Wearhouse", logoUrl: null }] });
    expect(texts(scene)).toContain("MEN'S WEARHOUSE");
  });

  it("falls back to the event cover when there is no speaker", () => {
    for (const id of ["studio-spotlight", "studio-webinar"]) {
      expect(sceneImageUrls(build(id, 0, { speakers: [] }))).toContain("https://cdn.test/cover.jpg");
    }
  });

  it("does not substitute the cover for a speaker who simply has no photo", () => {
    const scene = build("studio-webinar", 0, { speakers: [{ ...SPEAKERS[0], photoUrl: null }] });
    expect(sceneImageUrls(scene)).not.toContain("https://cdn.test/cover.jpg");
    const photo = scene.nodes.find((n) => n.kind === "image" && n.role === "speaker-photo");
    expect(photo && photo.kind === "image" && photo.fallback?.initials).toBe("MA");
  });

  it("Lineup shows a portrait and a name for each speaker, capped at five", () => {
    const scene = build("studio-lineup", 1, { speakers: SPEAKERS });
    expect(sceneImageUrls(scene)).toHaveLength(5);
    const names = scene.nodes.filter((n) => n.kind === "text" && n.role === "speaker-name");
    expect(names.map((n) => (n as TextNode).text)).toEqual(["MAELA AGATHA", "JOHN LEVIS", "DAVE LIGHT", "MARY ANN", "HEART JOY"]);
  });

  it("gives every node a unique id that survives a field being cleared", () => {
    for (const template of STUDIO_TEMPLATES) {
      const full = build(template.id, 0);
      const ids = full.nodes.map((n) => n.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      // Clearing one line must not renumber the nodes after it, or the
      // organiser's edits would land on the wrong elements.
      const cleared = build(template.id, 0, { content: { ...CONTENT, subtitle: "", phone: "" } });
      const byId = new Map(full.nodes.map((n) => [n.id, n.kind]));
      for (const node of cleared.nodes) expect(byId.get(node.id)).toBe(node.kind);
    }
  });

  it("the grid designs feature up to six speakers", () => {
    for (const id of ["studio-training", "studio-workshop"]) {
      expect(sceneImageUrls(build(id, 0, { speakers: SPEAKERS }))).toHaveLength(6);
    }
  });

  it("the multi-speaker designs feature as many speakers as they declare", () => {
    for (const [id, count] of [["studio-conference", 3], ["studio-trio", 3], ["studio-summit", 3], ["studio-roster", 5], ["studio-talkshow", 4]] as const) {
      const scene = build(id, 0, { speakers: SPEAKERS, coverImageUrl: null });
      expect(scene.nodes.filter((n) => n.kind === "image" && n.role === "speaker-photo")).toHaveLength(count);
      expect(scene.nodes.filter((n) => n.kind === "text" && n.role === "speaker-name")).toHaveLength(count);
    }
  });

  it("Introducing sets the script headline beside the speaker's name and role", () => {
    const scene = build("studio-introducing", 0);
    expect(texts(scene)).toEqual(expect.arrayContaining(["Meet our\nspeaker", "MAELA AGATHA", "CEO, Salford & Co."]));
  });

  it("Speaker Card uses the speaker's own bio when there is one", () => {
    const withBio = build("studio-speaker-card", 0, { speakers: [{ ...SPEAKERS[0], bio: "Fifteen years in product." }] });
    expect(texts(withBio)).toContain("Fifteen years in product.");
    expect(texts(build("studio-speaker-card", 0))).toContain(CONTENT.description);
  });

  it("Webinar lists at most four talking points", () => {
    const scene = build("studio-webinar", 0);
    expect(scene.nodes.filter((n) => n.kind === "text" && n.role === "bullet")).toHaveLength(4);
  });

  it("declares every content field it draws", () => {
    for (const template of STUDIO_TEMPLATES) {
      for (const field of template.fields) expect(Object.keys(CONTENT)).toContain(field.key);
    }
  });
});

describe("template helpers", () => {
  it("splits a title into top line, script word and year", () => {
    expect(splitLineupTitle("World Business Conference 2022", "2026")).toEqual({ top: "World Business", script: "Conference", year: "2022" });
    expect(splitLineupTitle("DevOps Connect", "2026")).toEqual({ top: "DevOps", script: "Connect", year: "2026" });
    expect(splitLineupTitle("Summit", "2026")).toEqual({ top: "", script: "Summit", year: "2026" });
    expect(splitLineupTitle("", "")).toEqual({ top: "", script: "", year: "" });
  });

  it("balances a headline across lines without losing words", () => {
    expect(balanceWords("Business Webinar", 2)).toEqual(["Business", "Webinar"]);
    expect(balanceWords("Annual Technology Leadership Summit 2026", 2).join(" ")).toBe("Annual Technology Leadership Summit 2026");
    expect(balanceWords("Summit", 3)).toEqual(["Summit"]);
    expect(balanceWords("  ", 2)).toEqual([]);
  });

  it("cleans bullet lines", () => {
    expect(bulletLines("- one\n\n• two\n  three  \nfour\nfive", 4)).toEqual(["one", "two", "three", "four"]);
  });

  it("takes initials from the first and last name", () => {
    expect(initialsOf("Maela Agatha")).toBe("MA");
    expect(initialsOf("mary jane watson")).toBe("MW");
    expect(initialsOf("Cher")).toBe("C");
    expect(initialsOf("")).toBe("");
  });

  it("builds a filesystem-safe filename", () => {
    const template = findStudioTemplate("studio-spotlight");
    expect(studioFilename("Dr. Maela Agatha / CEO", template, STUDIO_FORMATS[0])).toBe("dr-maela-agatha-ceo-spotlight-portrait.png");
    expect(studioFilename("???", template, STUDIO_FORMATS[0])).toBe("creative-spotlight-portrait.png");
  });
});

describe("layoutText", () => {
  // Every glyph is half the font size wide.
  const measureAt = (size: number) => (text: string) => text.length * size * 0.5;
  const node = (overrides: Partial<TextNode>): TextNode => ({
    kind: "text", text: "", x: 0, y: 0, w: 200, h: 40, family: "Poppins", weight: 400, size: 40, color: "#000", ...overrides,
  });

  it("keeps the preferred size when the text fits", () => {
    expect(layoutText(node({ text: "Hello" }), measureAt)).toEqual({ size: 40, lines: ["Hello"] });
  });

  it("shrinks until a long line fits", () => {
    const result = layoutText(node({ text: "A much longer line", maxLines: 1 }), measureAt);
    expect(result.lines).toEqual(["A much longer line"]);
    expect(result.size).toBeLessThan(40);
    expect(measureAt(result.size)(result.lines[0])).toBeLessThanOrEqual(200);
  });

  it("wraps when the box is tall enough", () => {
    const result = layoutText(node({ text: "one two three four", h: 200, w: 100, minSize: 40 }), measureAt);
    expect(result.size).toBe(40);
    expect(result.lines.join(" ")).toBe("one two three four");
    expect(result.lines.length).toBeGreaterThan(1);
  });

  it("ellipsizes rather than overflowing at the minimum size", () => {
    const result = layoutText(node({ text: "this text is far too long to ever fit in one short line", maxLines: 1, minSize: 30 }), measureAt);
    expect(result.size).toBe(30);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].endsWith("…")).toBe(true);
    expect(measureAt(30)(result.lines[0])).toBeLessThanOrEqual(200);
  });

  it("honours explicit line breaks", () => {
    expect(layoutText(node({ text: "one\ntwo", h: 200 }), measureAt).lines).toEqual(["one", "two"]);
  });
});

describe("scene helpers", () => {
  it("lists each font family once with the weights used", () => {
    const fonts = sceneFonts(build("studio-webinar", 0));
    expect(fonts.map((f) => f.family).sort()).toEqual(["Anton", "Poppins"]);
    expect(new Set(fonts.map((f) => f.family)).size).toBe(fonts.length);
  });

  it("mixes and contrasts colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(readableOn("#ffffff")).toBe("#111827");
    expect(readableOn("#0f1b2d")).toBe("#ffffff");
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("red")).toBe(false);
  });
});

describe("event data derivation", () => {
  const event: StudioEventSource = {
    title: "DevOps Connect 2026",
    description: "<p>A premier conference for engineering leaders.</p>",
    date: "2026-08-12T03:30:00Z",
    endDate: "2026-08-12T11:30:00Z",
    timezone: "Asia/Kolkata",
    venue: "Taj MG Road",
    location: "Bengaluru",
    eventFormat: "in_person",
    organizerName: "Illuxus",
    sessionTitles: ["Platform engineering", "Supply chain security"],
    publicUrl: "https://app.test/events/abc",
  };

  it("formats dates in the event's timezone", () => {
    expect(formatDateLine("2026-08-12T03:30:00Z", null, "Asia/Kolkata")).toBe("12 August 2026");
    expect(formatDateLine("2026-03-27T10:00:00Z", "2026-03-28T10:00:00Z", "UTC")).toBe("27–28 March 2026");
    expect(formatDateLine("2026-03-30T10:00:00Z", "2026-04-02T10:00:00Z", "UTC")).toBe("30 March – 2 April 2026");
    // 20:00 UTC is already the next day in Kolkata.
    expect(formatDateLine("2026-08-12T20:00:00Z", null, "Asia/Kolkata")).toBe("13 August 2026");
    expect(formatDateLine("not a date", null, null)).toBe("");
  });

  it("formats a time range, or a start time when the end is another day", () => {
    expect(formatTimeLine("2026-08-12T03:30:00Z", "2026-08-12T11:30:00Z", "Asia/Kolkata")).toBe("9:00 AM – 5:00 PM");
    expect(formatTimeLine("2026-08-12T03:30:00Z", null, "Asia/Kolkata")).toBe("9:00 AM onwards");
    expect(formatTimeLine("2026-08-12T03:30:00Z", "2026-08-13T11:30:00Z", "Asia/Kolkata")).toBe("9:00 AM onwards");
  });

  it("fills the copy from the event", () => {
    const content = deriveContent(event, normalizeConfig(null));
    expect(content).toMatchObject({
      eventTitle: "DevOps Connect 2026",
      organizerName: "Illuxus",
      dateLine: "12 August 2026",
      timeLine: "9:00 AM – 5:00 PM",
      venueName: "Taj MG Road",
      venueAddress: "Bengaluru",
      website: "app.test/events/abc",
      description: "A premier conference for engineering leaders.",
      bullets: "Platform engineering\nSupply chain security",
      formatLabel: "In-person event",
    });
  });

  it("labels a virtual event as a webinar held online", () => {
    const content = deriveContent({ ...event, venue: null, location: null, eventFormat: "virtual" }, normalizeConfig(null));
    expect(content.formatLabel).toBe("Webinar");
    expect(content.venueName).toBe("Online");
  });

  it("prefers the event page's contact details and call to action", () => {
    const config = normalizeConfig(null);
    for (const section of config.sections) {
      if (section.id === "contact") section.data = { organizerName: "Acme Events", phone: "+91 98765 43210", website: "https://acme.test/" };
    }
    config.sections.push({ id: "hero", enabled: true, order: 0, data: { subheadline: "Ship faster", primaryCtaText: "Book your seat" } });
    expect(deriveContent(event, config)).toMatchObject({
      organizerName: "Acme Events",
      phone: "+91 98765 43210",
      website: "acme.test",
      subtitle: "Ship faster",
      ctaLabel: "Book your seat",
    });
  });
});
