import { describe, expect, it } from "vitest";

import { DIRECTIONS, DIRECTION_TEMPLATES, LINEUP_SIZE, STUDIO_CATEGORIES } from "../directions";
import { cols, dateParts, fit, grid, inset, rows } from "../direction-kit";
import { nodeBounds, type Scene, type TextNode } from "../scene";
import { STUDIO_FORMATS, STUDIO_TEMPLATES, type BuildInput, type StudioContent } from "../templates";

const CONTENT: StudioContent = {
  organizerName: "Biz Millennium", organizerTagline: "", kicker: "", eventTitle: "CFO Connect Summit & Awards",
  subtitle: "Finance 6.0 — The Next Big Shift", dateLine: "16 October 2026", timeLine: "9:00 AM – 6:00 PM",
  venueName: "JW Marriott, Pune", venueAddress: "", infoLabel: "", website: "illuxus.com/cfo", phone: "",
  ctaLabel: "Register now", description: "", bullets: "", badge: "Live", formatLabel: "In-person event",
  speakersLabel: "Guest speakers", sponsorLabel: "Gold partner", linkLabel: "", sideLabel: "Keynote speaker",
  scriptLine: "", introLine: "Meet our speaker", partnerLine: "Proud to partner with",
};
const SPEAKERS = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Speaker ${i + 1}`, role: "CFO, Example", photoUrl: i % 2 ? null : `https://img/p${i}.jpg` }));
const input = (templateId: string, formatId: string, content: StudioContent = CONTENT): BuildInput => {
  const template = STUDIO_TEMPLATES.find((t) => t.id === templateId)!;
  return {
    format: STUDIO_FORMATS.find((f) => f.id === formatId)!, content,
    speakers: SPEAKERS.slice(0, Math.max(1, template.maxSpeakers)),
    sponsors: [{ id: "p1", name: "Zoho", logoUrl: "https://img/zoho.png" }],
    organizerLogoUrl: "https://img/logo.png", coverImageUrl: "https://img/banner.jpg", year: "2026", palette: template.palette,
  };
};
const texts = (scene: Scene): TextNode[] => scene.nodes.filter((n): n is TextNode => n.kind === "text");

describe("design directions", () => {
  it("gives every kind of graphic 48 designs: twelve directions in four colourways", () => {
    expect(DIRECTIONS).toHaveLength(12);
    for (const direction of DIRECTIONS) expect(direction.ways, direction.id).toHaveLength(4);
    for (const { id } of STUDIO_CATEGORIES) expect(DIRECTION_TEMPLATES.filter((t) => t.category === id), id).toHaveLength(48);
    expect(new Set(DIRECTION_TEMPLATES.map((t) => t.id)).size).toBe(DIRECTION_TEMPLATES.length);
  });

  it("leads each kind with one design from each of the twelve directions", () => {
    for (const { id } of STUDIO_CATEGORIES) {
      const first = DIRECTION_TEMPLATES.filter((t) => t.category === id).slice(0, 12);
      expect(new Set(first.map((t) => t.family)).size, id).toBe(12);
    }
  });

  it("gives each direction its own colours and its own typefaces", () => {
    const grounds = new Set(DIRECTIONS.flatMap((d) => d.ways.map((w) => `${w.palette.ground}/${w.palette.primary}/${w.palette.accent}`)));
    expect(grounds.size).toBe(48);
    const families = DIRECTIONS.map((d) => {
      const scene = STUDIO_TEMPLATES.find((t) => t.id === `${d.id}-event-${d.ways[0].id}`)!.build(input(`${d.id}-event-${d.ways[0].id}`, "instagram-post"));
      return [...new Set(texts(scene).map((t) => t.family))].sort().join("+");
    });
    // At least ten different type pairings across the twelve directions.
    expect(new Set(families).size).toBeGreaterThanOrEqual(10);
  });

  it("files every design, including the reference posters, under a kind", () => {
    for (const template of STUDIO_TEMPLATES) {
      expect(STUDIO_CATEGORIES.map((c) => c.id), template.id).toContain(template.category);
      expect(template.family, template.id).toBeTruthy();
    }
  });

  it("features the chosen speaker, the line-up and the partner", () => {
    const speaker = STUDIO_TEMPLATES.find((t) => t.id === "swiss-speaker-red")!.build(input("swiss-speaker-red", "instagram-post"));
    expect(texts(speaker).some((t) => t.text === "Speaker 1")).toBe(true);
    const lineup = STUDIO_TEMPLATES.find((t) => t.id === "soft-lineup-peach")!.build(input("soft-lineup-peach", "instagram-post"));
    expect(lineup.nodes.filter((n) => n.kind === "image" && n.role === "speaker-photo")).toHaveLength(LINEUP_SIZE);
    const partner = STUDIO_TEMPLATES.find((t) => t.id === "noir-partner-gold")!.build(input("noir-partner-gold", "instagram-post"));
    expect(partner.nodes.some((n) => n.kind === "image" && n.role === "sponsor-logo" && n.src === "https://img/zoho.png")).toBe(true);
    expect(texts(partner).some((t) => t.text === "Proud to partner with")).toBe(true);
  });

  it("keeps element ids stable when a line is cleared, so canvas edits stay attached", () => {
    for (const template of DIRECTION_TEMPLATES.filter((t) => t.id.endsWith(DIRECTIONS.find((d) => d.name === t.family)!.ways[0].id))) {
      const full = template.build(input(template.id, "instagram-post"));
      const cleared = template.build(input(template.id, "instagram-post", { ...CONTENT, subtitle: "", ctaLabel: "", timeLine: "" }));
      const idOf = (scene: Scene, text: string) => texts(scene).find((t) => t.text.toLowerCase().includes(text))?.id;
      const titleFull = idOf(full, "cfo connect"), titleCleared = idOf(cleared, "cfo connect");
      if (titleFull) expect(titleCleared, template.id).toBe(titleFull);
      const last = (scene: Scene) => scene.nodes[scene.nodes.length - 1].id;
      // Nothing after a cleared line is renumbered.
      if (texts(full).length !== texts(cleared).length) expect(Number(last(cleared)!.slice(1)), template.id).toBeLessThanOrEqual(Number(last(full)!.slice(1)));
    }
  });

  it("never lets one piece of text sit on a photo or logo", () => {
    for (const template of DIRECTION_TEMPLATES) {
      for (const format of STUDIO_FORMATS) {
        const scene = template.build(input(template.id, format.id));
        const pictures = scene.nodes.filter((n) => n.kind === "image" && (n.role === "speaker-photo" || n.role === "sponsor-logo" || n.role === "event-cover")).map(nodeBounds);
        for (const text of texts(scene)) {
          for (const p of pictures) {
            const w = Math.min(text.x + text.w, p.x + p.w) - Math.max(text.x, p.x);
            const h = Math.min(text.y + text.h, p.y + p.h) - Math.max(text.y, p.y);
            expect(w > 2 && h > 2, `${template.id} / ${format.label}: "${text.text.slice(0, 24)}" overlaps a picture`).toBe(false);
          }
        }
      }
    }
  });
});

describe("layout helpers", () => {
  const box = { x: 10, y: 20, w: 200, h: 100 };

  it("divides a box into rows and columns without gaps or overlap", () => {
    const r = rows(box, [1, 3], 10);
    expect(r[0].h + r[1].h + 10).toBeCloseTo(box.h);
    expect(r[0].y + r[0].h + 10).toBeCloseTo(r[1].y);
    const c = cols(box, [1, 1, 2], 6);
    expect(c[2].x + c[2].w).toBeCloseTo(box.x + box.w);
    expect(c[2].w).toBeCloseTo(c[0].w * 2);
  });

  it("fits a shape inside a box and never returns a negative size", () => {
    expect(fit(box, 1)).toEqual({ x: 60, y: 20, w: 100, h: 100 });
    expect(inset(box, 500).w).toBe(0);
  });

  it("centres a short last row in a grid", () => {
    const cells = grid({ x: 0, y: 0, w: 300, h: 200 }, 5, 3, 0);
    expect(cells[3].x).toBe(50);
    expect(cells[4].x).toBe(150);
  });

  it("splits a date line into the day and the rest", () => {
    expect(dateParts("16 October 2026")).toEqual(["16", "October 2026"]);
    expect(dateParts("27–28 March 2026")).toEqual(["27", "March 2026"]);
    expect(dateParts("To be announced")).toEqual(["", "To be announced"]);
  });
});
