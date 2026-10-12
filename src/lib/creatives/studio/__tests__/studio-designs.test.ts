import { describe, expect, it } from "vitest";
import { findOverlaps } from "../studio-audit";
import { STUDIO_DESIGNS, STUDIO_LAYOUTS, designById, designsFor } from "../studio-designs";
import { fitRect, inset, splitH, splitV, type AuditBox } from "../studio-draw";
import { STUDIO_KITS } from "../studio-kits";

const KINDS = ["event", "speaker", "lineup", "sponsor"] as const;

describe("design library", () => {
  it("offers 48 designs for every kind: 8 layouts in 6 styles", () => {
    expect(STUDIO_KITS).toHaveLength(6);
    for (const kind of KINDS) {
      expect(STUDIO_LAYOUTS.filter((l) => l.kind === kind), kind).toHaveLength(8);
      expect(designsFor(kind), kind).toHaveLength(48);
    }
    expect(STUDIO_DESIGNS).toHaveLength(192);
  });

  it("has no duplicate designs: every layout × style pair appears exactly once", () => {
    expect(new Set(STUDIO_DESIGNS.map((d) => d.id)).size).toBe(STUDIO_DESIGNS.length);
    for (const layout of STUDIO_LAYOUTS) {
      const kits = STUDIO_DESIGNS.filter((d) => d.layout.id === layout.id).map((d) => d.kit.id).sort();
      expect(kits, layout.id).toEqual(STUDIO_KITS.map((k) => k.id).sort());
    }
  });

  it("leads each kind with eight different layouts, so the picker shows variety first", () => {
    for (const kind of KINDS) {
      const first = designsFor(kind).slice(0, 8);
      expect(new Set(first.map((d) => d.layout.id)).size, kind).toBe(8);
      expect(new Set(first.map((d) => d.kit.id)).size, kind).toBeGreaterThanOrEqual(5);
    }
  });

  it("finds a design by id and names it by layout and style", () => {
    const d = designById("speaker-spotlight@glow");
    expect(d?.name).toBe("Spotlight · Glow");
    expect(designById("nope")).toBeNull();
  });
});

describe("layout rectangles", () => {
  const r = { x: 10, y: 20, w: 200, h: 100 };

  it("splits without overlap or loss, honouring the gap", () => {
    const [top, bottom] = splitV(r, 0.25, 8);
    expect(top.y + top.h + 8).toBe(bottom.y);
    expect(top.h + bottom.h + 8).toBe(r.h);
    const [left, right] = splitH(r, 60, 10);
    expect(left.w).toBe(60);
    expect(left.x + left.w + 10).toBe(right.x);
    expect(right.x + right.w).toBe(r.x + r.w);
  });

  it("never produces negative sizes, even when asked for more than there is", () => {
    const [a, b] = splitV(r, 500, 8);
    expect(a.h).toBe(92);
    expect(b.h).toBe(0);
    expect(inset(r, 500).w).toBe(0);
  });

  it("fits a box of a given shape inside another, staying within it", () => {
    const square = fitRect(r, 1);
    expect(square.w).toBe(100);
    expect(square.x).toBe(60);
    const wide = fitRect({ x: 0, y: 0, w: 100, h: 100 }, 2, 0, 1);
    expect(wide).toEqual({ x: 0, y: 50, w: 100, h: 50 });
  });
});

describe("overlap audit", () => {
  const box = (kind: AuditBox["kind"], x: number, y: number, w: number, h: number, label: string = kind): AuditBox => ({ kind, x, y, w, h, label });

  it("passes a clean layout, including boxes that merely touch", () => {
    expect(findOverlaps([box("media", 0, 0, 100, 100), box("text", 100, 0, 80, 40), box("text", 100, 40, 80, 40), box("mark", 0, 110, 30, 20)], 200, 200)).toEqual([]);
  });

  it("flags text on a picture", () => {
    const issues = findOverlaps([box("media", 0, 0, 100, 100, "photo"), box("text", 60, 60, 80, 30, "name")], 200, 200);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("text-on-picture");
  });

  it("flags text on text, and the organiser's mark on anything", () => {
    expect(findOverlaps([box("text", 0, 0, 100, 30), box("text", 50, 10, 100, 30)], 200, 200)[0].rule).toBe("text-on-text");
    expect(findOverlaps([box("mark", 0, 0, 40, 40), box("media", 20, 20, 100, 100)], 200, 200)[0].rule).toBe("mark-overlap");
  });

  it("flags anything running off the canvas", () => {
    expect(findOverlaps([box("text", 180, 10, 60, 20)], 200, 200)[0].rule).toBe("off-canvas");
    expect(findOverlaps([box("text", -1, 10, 60, 20)], 200, 200)).toEqual([]); // within tolerance
  });

  it("allows a picture on a picture (a logo on its plate)", () => {
    expect(findOverlaps([box("media", 0, 0, 100, 100), box("media", 20, 20, 60, 60)], 200, 200)).toEqual([]);
  });
});
