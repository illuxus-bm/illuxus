/**
 * The poster variants: colourways, and the event and partner versions.
 */
import { describe, expect, it } from "vitest";

import type { SceneNode, TextNode } from "../scene";
import { STUDIO_FORMATS, STUDIO_TEMPLATES, findStudioTemplate, type BuildInput, type StudioContent, type StudioTemplate } from "../templates";
import { STUDIO_CATEGORIES } from "../variants";

const CONTENT: StudioContent = {
  organizerName: "World Business Academy",
  organizerTagline: "",
  kicker: "announces the upcoming session with",
  eventTitle: "World Business Conference 2026",
  subtitle: "Women in Business",
  dateLine: "27–28 March 2026",
  timeLine: "10:00 AM – 5:00 PM",
  venueName: "The Arlington Theatre",
  venueAddress: "2020 Alameda Padre Serra, Santa Barbara",
  infoLabel: "For tickets and information:",
  website: "worldbusiness.org",
  phone: "805.892.4600",
  ctaLabel: "Register now",
  description: "An inspiring and practical session for leaders in business.",
  bullets: "One\nTwo\nThree",
  badge: "Live",
  formatLabel: "Conference",
  speakersLabel: "Guest speakers",
  sponsorLabel: "Sponsor",
  linkLabel: "Register online",
  sideLabel: "Speaker",
  scriptLine: "A Session",
  introLine: "Meet our speaker",
  partnerLine: "Proud to partner with",
};

const SPEAKERS = ["Maela Agatha", "John Levis", "Dave Light", "Mary Ann", "Heart Joy", "Sixth Person"].map((name, i) => ({
  id: `s${i}`,
  name,
  role: "CEO, Salford & Co.",
  bio: "",
  photoUrl: `https://cdn.test/speaker-${i}.jpg`,
}));
const SPONSORS = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Stark"].map((name, i) => ({
  id: `p${i}`,
  name,
  logoUrl: i === 1 ? null : `https://cdn.test/logo-${i}.png`,
}));

const formatsOf = (t: StudioTemplate) => STUDIO_FORMATS.filter((f) => !t.formats || t.formats.includes(f.id));
const input = (t: StudioTemplate, format = formatsOf(t)[0], content: StudioContent = CONTENT): BuildInput => ({
  format,
  content,
  speakers: SPEAKERS.slice(0, t.maxSpeakers),
  sponsors: SPONSORS,
  organizerLogoUrl: null,
  coverImageUrl: "https://cdn.test/cover.jpg",
  year: "2026",
  palette: t.palette,
});
const of = (category: string) => STUDIO_TEMPLATES.filter((t) => t.category === category);
const texts = (nodes: SceneNode[]) => nodes.filter((n): n is TextNode => n.kind === "text").map((n) => n.text.toLowerCase());
const images = (nodes: SceneNode[]) => nodes.flatMap((n) => (n.kind === "image" ? [n] : []));

describe("poster variants", () => {
  it("offers 45–50 designs for every kind of graphic", () => {
    STUDIO_CATEGORIES.forEach(({ id }) => {
      expect(of(id).length, id).toBeGreaterThanOrEqual(45);
      expect(of(id).length, id).toBeLessThanOrEqual(50);
    });
  });

  it("gives every design a unique id and a layout to filter by", () => {
    expect(new Set(STUDIO_TEMPLATES.map((t) => t.id)).size).toBe(STUDIO_TEMPLATES.length);
    STUDIO_TEMPLATES.forEach((t) => expect(t.family, t.id).toBeTruthy());
  });

  it("opens each kind on a screenful of different layouts", () => {
    STUDIO_CATEGORIES.forEach(({ id }) => {
      const layouts = new Set(of(id).map((t) => t.family)).size;
      expect(new Set(of(id).slice(0, layouts).map((t) => t.family)).size, id).toBe(layouts);
    });
  });

  it("never repeats a colourway within a layout", () => {
    STUDIO_CATEGORIES.forEach(({ id }) => {
      const seen = new Set<string>();
      of(id).forEach((t) => {
        const key = `${t.family}|${t.palette.primary}|${t.palette.accent}|${t.palette.ground}`;
        expect(seen.has(key), t.id).toBe(false);
        seen.add(key);
      });
    });
  });

  it("builds every design at every size it supports", () => {
    STUDIO_TEMPLATES.forEach((t) => {
      formatsOf(t).forEach((format) => {
        const scene = t.build(input(t, format));
        expect(scene.nodes.length, `${t.id} ${format.id}`).toBeGreaterThan(3);
        const ids = scene.nodes.map((n) => n.id);
        expect(new Set(ids).size, `${t.id} ${format.id}`).toBe(ids.length);
      });
    });
  });

  it("keeps a bare poster id pointing at the poster as it was", () => {
    const t = findStudioTemplate("studio-webinar");
    expect(t.category).toBe("speaker");
    expect(t.palette).toEqual({ primary: "#231a22", accent: "#f0592b", ground: "#f6f6ea" });
  });

  it("event designs feature nobody and drop the speaker wording", () => {
    of("event").forEach((t) => {
      expect(t.maxSpeakers).toBe(0);
      const scene = t.build({ ...input(t), speakers: SPEAKERS });
      const said = texts(scene.nodes).join(" | ");
      expect(said, t.id).not.toContain("maela");
      expect(said, t.id).not.toMatch(/speaker/);
      expect(images(scene.nodes).some((n) => n.src?.includes("speaker-")), t.id).toBe(false);
    });
  });

  it("partner designs show the sponsor's whole logo on a white plate", () => {
    of("partner").forEach((t) => {
      const scene = t.build(input(t));
      const logos = images(scene.nodes).filter((n) => n.src?.includes("logo-"));
      expect(logos.length, t.id).toBeGreaterThan(0);
      logos.forEach((logo) => {
        expect(logo.fit, t.id).toBe("contain");
        expect(logo.grayscale ?? false, t.id).toBe(false);
        const plate = scene.nodes.find((n) => n.id === `${logo.id}-plate`);
        expect(plate && plate.kind === "rect" && plate.fill === "#ffffff", t.id).toBe(true);
      });
      const said = texts(scene.nodes).join(" | ");
      // Training shows its portraits without captions, so the logo alone names the partner.
      if (t.family !== "Training") expect(said, t.id).toContain("acme");
      expect(said, t.id).not.toMatch(/speaker/);
      expect(said, t.id).not.toContain("maela");
    });
  });

  it("features the chosen partner first", () => {
    const t = of("partner").find((p) => p.family === "Webinar")!;
    const scene = t.build({ ...input(t), sponsors: [SPONSORS[3], ...SPONSORS.filter((_, i) => i !== 3)] });
    expect(texts(scene.nodes).join(" | ")).toContain("umbrella");
    expect(texts(scene.nodes).join(" | ")).not.toContain("acme");
  });

  it("leaves wording the organiser has changed alone", () => {
    const t = of("partner").find((p) => p.family === "Introducing")!;
    const scene = t.build(input(t, undefined, { ...CONTENT, introLine: "With thanks to" }));
    const said = texts(scene.nodes).join(" | ").replace(/\s+/g, " ");
    expect(said).toContain("with thanks to");
    expect(said).not.toContain("proud to partner");
  });
});
