// Unit tests for the editor's bulk-edit, page-insert, shape, text-layout and
// image-placement rules.
//
// These are the pure halves of features an organizer drives by hand — restyle
// a whole card, duplicate a page, add a star, retype a heading. Each one fails
// quietly when wrong: a style that skips an element, a duplicate that shares
// ids with its original, a text box that ends up shorter than its text. None of
// that throws, so it is pinned here.
import { describe, expect, it, vi } from "vitest";

// Konva's Node build needs the native `canvas` package, which isn't installed
// here. Stubbing it out makes `measureTextHeightPx` take its metrics-table
// fallback — the path these tests are about — exactly as it would on any
// machine with no 2D context.
vi.mock("konva", () => ({
  default: {
    Text: class {
      constructor() {
        throw new Error("no canvas in unit tests");
      }
    },
  },
}));

import {
  newDocument,
  newImageElement,
  newPage,
  newPillElement,
  newShapeElement,
  newTextElement,
  type BrochureDocument,
  type BrochureElement,
  type ShapeKind,
} from "../editor-document";
import { placedImageSizeMm } from "../editor-image-file";
import { applySelectionStyle, clonePage, insertPagesAfter, updateElements } from "../editor-operations";
import { SHAPE_LABELS, shapePolygonPoints, textVerticalOffset } from "../editor-render-props";
import { fittedTextHeightMm, naturalTextHeightMm, withFittedHeight } from "../editor-text-layout";

const text = (content = "Hello") =>
  newTextElement({ x: 10, y: 10, width: 80, height: 10, content, fontSize: 12, color: "#111111" });
const rect = () => newShapeElement({ x: 0, y: 0, width: 20, height: 20, shape: "rect", fill: "#eeeeee" });
const pill = () => newPillElement({ x: 0, y: 0, width: 30, height: 8, text: "Tag", fontSize: 10 });
const image = () => newImageElement({ x: 0, y: 0, width: 30, height: 20, src: "a.png" });

function docWith(elements: BrochureElement[]): { doc: BrochureDocument; pageId: string } {
  const page = { ...newPage(), elements };
  return { doc: { ...newDocument(), pages: [page] }, pageId: page.id };
}
const elementsOf = (doc: BrochureDocument) => doc.pages[0].elements;

describe("updateElements", () => {
  it("changes only the selected elements, in one document update", () => {
    const [a, b, c] = [text("a"), text("b"), text("c")];
    const { doc, pageId } = docWith([a, b, c]);
    const next = updateElements(doc, pageId, [a.id, c.id], (el) => ({ ...el, opacity: 0.5 }));
    expect(elementsOf(next).map((el) => el.opacity)).toEqual([0.5, 1, 0.5]);
    expect(elementsOf(next)[1]).toBe(b);
  });

  it("returns the same document when nothing changes, keeping it out of undo history", () => {
    const a = text();
    const { doc, pageId } = docWith([a]);
    expect(updateElements(doc, pageId, [a.id], (el) => el)).toBe(doc);
    expect(updateElements(doc, pageId, [], (el) => ({ ...el, opacity: 0 }))).toBe(doc);
  });
});

describe("applySelectionStyle", () => {
  it("applies each property to the kinds it fits and skips the rest", () => {
    const [t, r, p, i] = [text(), rect(), pill(), image()];
    const { doc, pageId } = docWith([t, r, p, i]);
    const next = applySelectionStyle(doc, pageId, [t.id, r.id, p.id, i.id], {
      textColor: "#ff0000",
      fillColor: "#00ff00",
      fontFamily: "Inter",
    });
    const [nt, nr, np, ni] = elementsOf(next);
    expect(nt).toMatchObject({ color: "#ff0000", fontFamily: "Inter" });
    expect(nr).toMatchObject({ fill: "#00ff00" });
    expect(np).toMatchObject({ textColor: "#ff0000", fillColor: "#00ff00", fontFamily: "Inter" });
    // An image has no text, fill or font: untouched, same object.
    expect(ni).toBe(i);
  });

  it("clears a shape's gradient so the new fill is actually visible", () => {
    const r = { ...rect(), fillGradient: { from: "#000000", to: "#ffffff", direction: "vertical" as const } };
    const { doc, pageId } = docWith([r]);
    const [next] = elementsOf(applySelectionStyle(doc, pageId, [r.id], { fillColor: "#123456" }));
    expect(next).toMatchObject({ fill: "#123456" });
    expect(next.kind === "shape" && next.fillGradient).toBeFalsy();
  });

  it("scales font sizes proportionally, preserving their hierarchy", () => {
    const big = { ...text(), fontSize: 40 };
    const small = { ...text(), fontSize: 10 };
    const { doc, pageId } = docWith([big, small]);
    const next = elementsOf(applySelectionStyle(doc, pageId, [big.id, small.id], { fontScale: 1.1 }));
    expect(next.map((el) => (el.kind === "text" ? el.fontSize : 0))).toEqual([44, 11]);
  });

  it("clamps opacity and applies lock / hide to every kind", () => {
    const [t, i] = [text(), image()];
    const { doc, pageId } = docWith([t, i]);
    const next = elementsOf(applySelectionStyle(doc, pageId, [t.id, i.id], { opacity: 4, locked: true, hidden: true }));
    for (const el of next) expect(el).toMatchObject({ opacity: 1, locked: true, hidden: true });
  });

  it("is a no-op, by reference, when the style changes nothing", () => {
    const t = text();
    const { doc, pageId } = docWith([t]);
    expect(applySelectionStyle(doc, pageId, [t.id], { textColor: "#111111" })).toBe(doc);
    expect(applySelectionStyle(doc, pageId, [t.id], {})).toBe(doc);
  });
});

describe("insertPagesAfter / clonePage", () => {
  const threePages = (): BrochureDocument => ({ ...newDocument(), pages: [newPage(), newPage(), newPage()] });

  it("inserts directly after the given page", () => {
    const doc = threePages();
    const added = newPage();
    const next = insertPagesAfter(doc, doc.pages[0].id, [added]);
    expect(next.pages.map((p) => p.id)).toEqual([doc.pages[0].id, added.id, doc.pages[1].id, doc.pages[2].id]);
  });

  it("appends when the page isn't found, and does nothing for no pages", () => {
    const doc = threePages();
    const added = newPage();
    expect(insertPagesAfter(doc, "missing", [added]).pages[3]).toBe(added);
    expect(insertPagesAfter(doc, null, [added]).pages[3]).toBe(added);
    expect(insertPagesAfter(doc, doc.pages[0].id, [])).toBe(doc);
  });

  it("clones a page with fresh ids for the page, its elements and its card groups", () => {
    const a = { ...text("a"), groupId: "card-1" };
    const b = { ...rect(), groupId: "card-1" };
    const c = text("loose");
    const source = { ...newPage(), elements: [a, b, c] as BrochureElement[] };
    const copy = clonePage(source);

    expect(copy.id).not.toBe(source.id);
    const sourceIds = new Set(source.elements.map((el) => el.id));
    for (const el of copy.elements) expect(sourceIds.has(el.id)).toBe(false);
    // The copy's card is still one card — but not the SAME card as the original's.
    expect(copy.elements[0].groupId).toBe(copy.elements[1].groupId);
    expect(copy.elements[0].groupId).not.toBe("card-1");
    expect(copy.elements[2].groupId).toBeUndefined();
    // Same place, same content.
    expect(copy.elements.map((el) => [el.x, el.y])).toEqual(source.elements.map((el) => [el.x, el.y]));
  });
});

describe("shapePolygonPoints", () => {
  const polygons: ShapeKind[] = ["triangle", "diamond", "hexagon", "star", "arrow"];

  it.each(polygons)("keeps every %s vertex inside the element box", (shape) => {
    const points = shapePolygonPoints(shape, 60, 24);
    expect(points).not.toBeNull();
    expect(points!.length % 2).toBe(0);
    for (let i = 0; i < points!.length; i += 2) {
      expect(points![i]).toBeGreaterThanOrEqual(-1e-9);
      expect(points![i]).toBeLessThanOrEqual(60 + 1e-9);
      expect(points![i + 1]).toBeGreaterThanOrEqual(-1e-9);
      expect(points![i + 1]).toBeLessThanOrEqual(24 + 1e-9);
    }
  });

  it.each(polygons)("scales the %s with its box", (shape) => {
    const small = shapePolygonPoints(shape, 10, 10)!;
    const large = shapePolygonPoints(shape, 20, 20)!;
    small.forEach((v, i) => expect(large[i]).toBeCloseTo(v * 2, 6));
  });

  it("returns null for shapes drawn with their own node", () => {
    for (const shape of ["rect", "ellipse", "line"] as ShapeKind[]) {
      expect(shapePolygonPoints(shape, 10, 10)).toBeNull();
    }
  });

  it("gives a star ten vertices with its first point straight up", () => {
    const points = shapePolygonPoints("star", 100, 100)!;
    expect(points).toHaveLength(20);
    expect(points[0]).toBeCloseTo(50, 6);
    expect(points[1]).toBeCloseTo(0, 6);
  });

  it("has a label for every shape", () => {
    for (const shape of ["rect", "ellipse", "triangle", "diamond", "hexagon", "star", "arrow", "line"] as ShapeKind[]) {
      expect(SHAPE_LABELS[shape]).toBeTruthy();
    }
  });
});

describe("textVerticalOffset", () => {
  it("positions text that fits according to its alignment", () => {
    expect(textVerticalOffset(100, 40, "top")).toBe(0);
    expect(textVerticalOffset(100, 40, undefined)).toBe(0);
    expect(textVerticalOffset(100, 40, "middle")).toBe(30);
    expect(textVerticalOffset(100, 40, "bottom")).toBe(60);
  });

  it("anchors text taller than its box at the top, whatever the alignment", () => {
    // Centring would push the first line out above the box.
    expect(textVerticalOffset(40, 100, "middle")).toBe(0);
    expect(textVerticalOffset(40, 100, "bottom")).toBe(0);
    expect(textVerticalOffset(40, 40, "middle")).toBe(0);
  });
});

describe("fitted text height", () => {
  const long = "Strengthening software supply chain security by securing dependencies and pipelines.";

  it("needs more height for more text and for a narrower box", () => {
    expect(naturalTextHeightMm(text(long))).toBeGreaterThan(naturalTextHeightMm(text("Short")));
    expect(naturalTextHeightMm({ ...text(long), width: 30 })).toBeGreaterThan(naturalTextHeightMm(text(long)));
  });

  it("makes top-aligned text hug its content, growing and shrinking", () => {
    const tall = { ...text("One line"), height: 90 };
    expect(fittedTextHeightMm(tall)).toBeLessThan(90);
    const short = { ...text(long), width: 30, height: 2 };
    expect(fittedTextHeightMm(short)).toBeGreaterThan(2);
  });

  it("keeps the box of middle-aligned text unless the text outgrows it", () => {
    const label = { ...text("Label"), height: 30, verticalAlign: "middle" as const };
    expect(fittedTextHeightMm(label)).toBe(30);
    const crowded = { ...text(long), width: 30, height: 4, verticalAlign: "middle" as const };
    expect(fittedTextHeightMm(crowded)).toBeGreaterThan(4);
  });

  it("refits the height when a patch changes what the text needs", () => {
    const el = { ...text("Short"), height: 40 };
    const patched = withFittedHeight(el, { content: long });
    expect(patched.height).toBeDefined();
    expect(patched.height).toBeCloseTo(fittedTextHeightMm({ ...el, content: long }), 6);
  });

  it("leaves a patch alone when it can't affect height, or sets height itself", () => {
    const el = text();
    expect(withFittedHeight(el, { color: "#ff0000" })).toEqual({ color: "#ff0000" });
    expect(withFittedHeight(el, { height: 55, content: long })).toEqual({ height: 55, content: long });
  });
});

describe("placedImageSizeMm", () => {
  it("keeps the picture's proportions within the page share", () => {
    const landscape = placedImageSizeMm(400, 200, 210, 297);
    expect(landscape.width / landscape.height).toBeCloseTo(2, 6);
    expect(landscape.width).toBeLessThanOrEqual(210 * 0.45 + 1e-9);

    const portrait = placedImageSizeMm(200, 800, 210, 297);
    expect(portrait.width / portrait.height).toBeCloseTo(0.25, 6);
    expect(portrait.height).toBeLessThanOrEqual(297 * 0.45 + 1e-9);
  });

  it("falls back to 4:3 when the natural size is unknown", () => {
    const size = placedImageSizeMm(0, 0, 210, 297);
    expect(size.width / size.height).toBeCloseTo(4 / 3, 6);
  });
});
