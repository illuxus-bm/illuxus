import { describe, expect, it } from "vitest";
import {
  CURATED_PALETTES, buildPaletteSet, contrast, customPalette, darkPaletteFrom, dominantColors, hueDistance,
  lightPaletteFrom, parseHex, readableOn,
} from "../studio-palette";
import { STUDIO_SIZES, formatStudioDate, studioFilename } from "../studio-render";
import { compact, gap, shapeOf, stackHeight, type Block } from "../studio-draw";

/** Solid-colour RGBA pixels, `n` of each colour. */
const pixels = (...colors: [string, number][]) =>
  colors.flatMap(([hex, n]) => Array.from({ length: n }, () => [...parseHex(hex)!, 255]).flat());

describe("studio palettes", () => {
  const every = [
    ...CURATED_PALETTES,
    ...["#0f766e", "#be123c", "#1d4ed8", "#f59e0b", "#111111", "#fafafa", "#7c3aed"].flatMap((c) => [darkPaletteFrom(c), darkPaletteFrom(c, "#22c55e"), lightPaletteFrom(c)]),
    customPalette("#0ea5e9", "#0ea5e9", false), customPalette("#facc15", "#fde047", true),
  ];

  it("every palette keeps headline text readable on its background", () => {
    for (const p of every) expect(contrast(p.ink, p.bg), `${p.id} ink on bg`).toBeGreaterThanOrEqual(7);
  });

  it("every palette's accent stands out from the background, and its label is readable on it", () => {
    for (const p of every) {
      expect(contrast(p.accent, p.bg), `${p.id} accent on bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(p.onAccent, p.accent), `${p.id} text on accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a second brand colour too close to the first is replaced, not used as an invisible accent", () => {
    const p = darkPaletteFrom("#0f766e", "#0d9488");
    expect(hueDistance(p.accent, "#0f766e")).toBeGreaterThan(20);
  });

  it("picks white or near-black text by contrast", () => {
    expect(readableOn("#0a0f24")).toBe("#ffffff");
    expect(readableOn("#fde047")).toBe("#0b0f19");
  });

  it("finds the dominant colour of an image and a distinct second one, ignoring greys", () => {
    const out = dominantColors(pixels(["#0f766e", 400], ["#f59e0b", 120], ["#808080", 900], ["#ffffff", 900], ["#000000", 900]));
    expect(out).not.toBeNull();
    expect(hueDistance(out!.primary, "#0f766e")).toBeLessThan(15);
    expect(out!.accent && hueDistance(out!.accent, "#f59e0b")).toBeLessThan(15);
  });

  it("returns nothing for an image with no real colour", () => {
    expect(dominantColors(pixels(["#777777", 500], ["#ffffff", 500]))).toBeNull();
  });

  it("offers banner palettes first, a brand palette only when it adds something, then the curated set", () => {
    const withBanner = buildPaletteSet({ banner: { primary: "#0f766e", accent: "#f59e0b" }, brandPrimary: "#be123c" });
    expect(withBanner.slice(0, 2).map((p) => p.id)).toEqual(["banner-dark", "banner-light"]);
    expect(withBanner.map((p) => p.id)).toContain("brand-dark");
    const sameHue = buildPaletteSet({ banner: { primary: "#0f766e", accent: null }, brandPrimary: "#0d9488" });
    expect(sameHue.map((p) => p.id)).not.toContain("brand-dark");
    expect(buildPaletteSet({}).map((p) => p.id)).toEqual(CURATED_PALETTES.map((p) => p.id));
    expect(new Set(withBanner.map((p) => p.id)).size).toBe(withBanner.length);
  });
});

describe("studio designs and sizes", () => {
  it("classifies canvas shapes", () => {
    const shape = (id: string) => { const s = STUDIO_SIZES.find((x) => x.id === id)!; return shapeOf(s.width, s.height); };
    expect([shape("square"), shape("portrait"), shape("story"), shape("landscape"), shape("wide")]).toEqual(["square", "square", "tall", "wide", "wide"]);
  });

  it("builds safe, readable file names", () => {
    expect(studioFilename(["CFO Connect Summit & Awards", "Sara Khan", "Spotlight"], STUDIO_SIZES[0])).toBe("cfo-connect-summit-awards-sara-khan-spotlight-square.png");
    expect(studioFilename(["../../etc", null, "x"], STUDIO_SIZES[2])).toBe("etc-x-story.png");
  });

  it("formats the event date in the event's timezone", () => {
    expect(formatStudioDate("2026-10-16T20:00:00Z", "Asia/Kolkata")).toBe("17 Oct 2026");
    expect(formatStudioDate("2026-10-16T20:00:00Z", "UTC")).toBe("16 Oct 2026");
    expect(formatStudioDate(null)).toBe("");
    expect(formatStudioDate("2026-10-16T20:00:00Z", "Not/AZone")).toMatch(/Oct 2026/);
  });
});

describe("stacks", () => {
  const text = (height: number): Block => ({ kind: "custom", height, width: 10, paint: () => undefined });

  it("drops an empty block together with the gap before it", () => {
    const out = compact([text(10), gap(4), text(0), gap(4), text(6)]);
    expect(out.map((b) => b.height)).toEqual([10, 4, 6]);
    expect(stackHeight(out)).toBe(20);
  });

  it("never starts or ends with a gap", () => {
    expect(compact([gap(3), text(0), gap(3), text(8), gap(3), null, false]).map((b) => b.height)).toEqual([8]);
  });
});
