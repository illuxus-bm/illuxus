// Unit tests for src/lib/brochure/editor/editor-text-metrics.ts
//
// The template seed sizes every card, row and headline from these estimates
// before anything is drawn. Konva silently drops lines that don't fit a text
// box, so an estimate that comes up a line short is a clipped paragraph in the
// downloaded PDF with no error anywhere — these tests are the only check.
import { describe, expect, it } from "vitest";
import {
  balanceLines,
  estimateTextHeightMm,
  estimateTextWidthMm,
  fitFontSizePt,
  textBlockHeightMm,
  wrapTextLines,
} from "../editor-text-metrics";

describe("estimateTextWidthMm", () => {
  it("scales linearly with font size", () => {
    const at10 = estimateTextWidthMm("DevOps Connect", 10);
    expect(estimateTextWidthMm("DevOps Connect", 20)).toBeCloseTo(at10 * 2, 6);
  });

  it("measures bold wider than regular", () => {
    expect(estimateTextWidthMm("Event Agenda", 12, true)).toBeGreaterThan(estimateTextWidthMm("Event Agenda", 12));
  });

  it("gives narrow glyphs less room than wide ones", () => {
    expect(estimateTextWidthMm("illil", 12)).toBeLessThan(estimateTextWidthMm("mwmwm", 12));
  });

  it("still measures glyphs outside the ASCII table", () => {
    expect(estimateTextWidthMm("₹15,000/-", 12)).toBeGreaterThan(estimateTextWidthMm("15,000/-", 12));
    expect(estimateTextWidthMm("été", 12)).toBeGreaterThan(0);
  });

  it("is zero for an empty string", () => {
    expect(estimateTextWidthMm("", 12)).toBe(0);
  });
});

describe("wrapTextLines", () => {
  const copy =
    "DevOps Connect is a premier conference bringing together technology leaders, engineering executives, and DevOps professionals.";

  it("keeps text that fits on one line", () => {
    expect(wrapTextLines("Bangalore", 100, 10)).toEqual(["Bangalore"]);
  });

  it("never produces a line wider than the box", () => {
    const lines = wrapTextLines(copy, 60, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(estimateTextWidthMm(line, 10)).toBeLessThanOrEqual(60);
  });

  it("loses no words", () => {
    expect(wrapTextLines(copy, 60, 10).join(" ")).toBe(copy);
  });

  it("honours explicit line breaks, including blank ones", () => {
    expect(wrapTextLines("one\n\ntwo", 100, 10)).toEqual(["one", "", "two"]);
  });

  it("breaks after a hyphen, as Konva does", () => {
    // "cloud-native" alone is wider than the box but "cloud-" fits.
    const width = estimateTextWidthMm("cloud-nat", 10);
    expect(wrapTextLines("cloud-native", width, 10)).toEqual(["cloud-", "native"]);
  });

  it("splits a single word wider than the box instead of looping", () => {
    const lines = wrapTextLines("Supercalifragilistic", 10, 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("Supercalifragilistic");
  });

  it("terminates when even one glyph is wider than the box", () => {
    expect(wrapTextLines("WW", 0.1, 10)).toEqual(["W", "W"]);
  });

  it("needs more lines in a narrower box", () => {
    expect(wrapTextLines(copy, 40, 10).length).toBeGreaterThan(wrapTextLines(copy, 80, 10).length);
  });
});

describe("text heights", () => {
  it("is line count × font size × line height", () => {
    // 72pt is one inch.
    expect(textBlockHeightMm(2, 72, 1.5)).toBeCloseTo(2 * 25.4 * 1.5, 6);
  });

  it("grows as the box narrows", () => {
    const text = "Strengthening software supply chain security by securing dependencies.";
    expect(estimateTextHeightMm(text, 40, 10, 1.3)).toBeGreaterThan(estimateTextHeightMm(text, 120, 10, 1.3));
  });
});

describe("fitFontSizePt", () => {
  it("returns the largest size at which the widest line fits", () => {
    const size = fitFontSizePt(["DevOps", "Connect"], 60, 200, 4, true);
    expect(estimateTextWidthMm("Connect", size, true)).toBeCloseTo(60, 4);
    expect(estimateTextWidthMm("DevOps", size, true)).toBeLessThanOrEqual(60);
  });

  it("clamps to the maximum when there is room to spare", () => {
    expect(fitFontSizePt(["Hi"], 500, 40, 8)).toBe(40);
  });

  it("clamps to the minimum rather than going unreadably small", () => {
    expect(fitFontSizePt(["A very long line of text that cannot fit"], 5, 40, 8)).toBe(8);
  });

  it("returns the maximum for empty input", () => {
    expect(fitFontSizePt([], 100, 40, 8)).toBe(40);
    expect(fitFontSizePt([""], 100, 40, 8)).toBe(40);
  });
});

describe("balanceLines", () => {
  it("splits a two-word title one word per line", () => {
    expect(balanceLines("DevOps Connect", 2)).toEqual(["DevOps", "Connect"]);
  });

  it("picks the split with the narrowest widest line", () => {
    expect(balanceLines("Annual Technology Leadership Summit 2026", 2)).toEqual([
      "Annual Technology",
      "Leadership Summit 2026",
    ]);
  });

  it("returns fewer lines when there aren't enough words", () => {
    expect(balanceLines("Summit", 3)).toEqual(["Summit"]);
    expect(balanceLines("Tech Summit", 3)).toEqual(["Tech", "Summit"]);
  });

  it("keeps every word, in order", () => {
    const title = "The Global Platform Engineering and Reliability Forum";
    expect(balanceLines(title, 3).join(" ")).toBe(title);
  });

  it("returns nothing for blank input", () => {
    expect(balanceLines("   ", 2)).toEqual([]);
  });
});
