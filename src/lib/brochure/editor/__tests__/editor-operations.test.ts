// Unit tests for src/lib/brochure/editor/editor-operations.ts
//
// These operations are the direct-manipulation layer the editor UI binds to.
// They are worth testing hard because every one of them is a *silent* failure
// mode: an off-by-one in `reorderElements` doesn't throw, it just puts the
// caption under the image; a wrong `distributeElements` doesn't throw, it just
// nudges the endpoints and makes the layout worse. None of that surfaces in a
// type error or a smoke test, so it gets pinned here.
//
// Every assertion is on geometry/order rather than on identity, because the
// functions are pure and return fresh objects by design.
import { describe, expect, it } from "vitest";
import {
  type BrochureDocument,
  type BrochureElement,
  newPage,
  newShapeElement,
  newTextElement,
} from "../editor-document";
import {
  SNAP_TOLERANCE_MM,
  alignElements,
  copyElements,
  distributeElements,
  duplicateElements,
  expandSelectionToGroups,
  groupElements,
  movePage,
  pasteElements,
  reorderElements,
  selectionBounds,
  selectionHasGroup,
  snapPosition,
  sortedByZ,
  translateElements,
  ungroupElements,
} from "../editor-operations";

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Builds a single-page document whose elements have deterministic ids
 * (`a`, `b`, `c`, …) so order assertions read as `["a", "b", "c"]` instead of
 * comparing against random uuids. `zIndex` defaults to array position, which
 * is the invariant the seed builders produce.
 */
function docWith(
  boxes: Array<{
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
  }>,
): BrochureDocument {
  const page = newPage();
  const elements: BrochureElement[] = boxes.map((b, i) => ({
    ...newShapeElement({
      x: b.x ?? 0,
      y: b.y ?? 0,
      width: b.width ?? 10,
      height: b.height ?? 10,
    }),
    id: b.id,
    zIndex: b.zIndex ?? i,
  }));
  return {
    id: "doc-test",
    title: "Test",
    pages: [{ ...page, id: "page-1", elements }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Paint order of page 1 as a list of ids. */
function orderOf(doc: BrochureDocument): string[] {
  return sortedByZ(doc.pages[0].elements).map((el) => el.id);
}

/** Looks an element up by id on page 1. */
function el(doc: BrochureDocument, id: string): BrochureElement {
  const found = doc.pages[0].elements.find((e) => e.id === id);
  if (!found) throw new Error(`fixture error: no element ${id}`);
  return found;
}

const PAGE_W = 210;
const PAGE_H = 297;

// ─── sortedByZ ──────────────────────────────────────────────────────────────

describe("sortedByZ", () => {
  it("orders by ascending zIndex", () => {
    const doc = docWith([
      { id: "a", zIndex: 2 },
      { id: "b", zIndex: 0 },
      { id: "c", zIndex: 1 },
    ]);
    expect(orderOf(doc)).toEqual(["b", "c", "a"]);
  });

  it("breaks zIndex ties by existing array position, so sorting is stable", () => {
    // The model explicitly permits duplicate z-indexes. Without a stable
    // tie-break, paint order would be engine-dependent and the exported PDF
    // could differ from the canvas for the same document.
    const doc = docWith([
      { id: "a", zIndex: 5 },
      { id: "b", zIndex: 5 },
      { id: "c", zIndex: 5 },
    ]);
    expect(orderOf(doc)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const doc = docWith([
      { id: "a", zIndex: 2 },
      { id: "b", zIndex: 0 },
    ]);
    const before = doc.pages[0].elements.map((e) => e.id);
    sortedByZ(doc.pages[0].elements);
    expect(doc.pages[0].elements.map((e) => e.id)).toEqual(before);
  });
});

// ─── reorderElements ────────────────────────────────────────────────────────

describe("reorderElements", () => {
  const base = () => docWith([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);

  it("brings a single element to the front", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["b"], "front"))).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
  });

  it("sends a single element to the back", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["c"], "back"))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("moves a single element forward by exactly one step", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["b"], "forward"))).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("moves a single element backward by exactly one step", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["c"], "backward"))).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
  });

  it("is a no-op moving the topmost element forward", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["d"], "forward"))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("is a no-op moving the bottom element backward", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["a"], "backward"))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("normalizes zIndex to dense array order after a reorder", () => {
    // Downstream code (canvas + PDF export) reads zIndex directly. Leaving
    // gaps or duplicates after a reorder is how the two renderers drift.
    const doc = reorderElements(base(), "page-1", ["a"], "front");
    const zs = sortedByZ(doc.pages[0].elements).map((e) => e.zIndex);
    expect(zs).toEqual([0, 1, 2, 3]);
  });

  it("moves a contiguous multi-selection forward as a block without self-collapsing", () => {
    // This is the case a naive forward-swap loop gets wrong: iterating from
    // the start would move "b" past "c", then move "c" past "b" again, so the
    // pair would swap internally and net-move only one position.
    const doc = reorderElements(base(), "page-1", ["b", "c"], "forward");
    expect(orderOf(doc)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a contiguous multi-selection backward as a block", () => {
    const doc = reorderElements(base(), "page-1", ["b", "c"], "backward");
    expect(orderOf(doc)).toEqual(["b", "c", "a", "d"]);
  });

  it("preserves relative order within a multi-selection sent to the front", () => {
    const doc = reorderElements(base(), "page-1", ["c", "a"], "front");
    expect(orderOf(doc)).toEqual(["b", "d", "a", "c"]);
  });

  it("preserves relative order within a multi-selection sent to the back", () => {
    const doc = reorderElements(base(), "page-1", ["d", "b"], "back");
    expect(orderOf(doc)).toEqual(["b", "d", "a", "c"]);
  });

  it("is a no-op for an empty selection", () => {
    const doc = base();
    expect(reorderElements(doc, "page-1", [], "front")).toBe(doc);
  });

  it("is a no-op for an unknown page id", () => {
    const doc = base();
    expect(reorderElements(doc, "page-nope", ["a"], "front")).toBe(doc);
  });

  it("ignores ids that are not on the page", () => {
    expect(orderOf(reorderElements(base(), "page-1", ["ghost"], "front"))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("does not mutate the input document", () => {
    const doc = base();
    reorderElements(doc, "page-1", ["a"], "front");
    expect(orderOf(doc)).toEqual(["a", "b", "c", "d"]);
  });

  // The editor commits every returned document into an undo stack, so an
  // operation that changes nothing must return the SAME reference — otherwise
  // clicking "send to back" on the bottom element fills the undo history with
  // entries that do nothing when undone.
  it("returns the identical document when the order cannot change", () => {
    const doc = base();
    expect(reorderElements(doc, "page-1", ["a"], "back")).toBe(doc);
    expect(reorderElements(doc, "page-1", ["d"], "front")).toBe(doc);
    expect(reorderElements(doc, "page-1", ["a"], "backward")).toBe(doc);
    expect(reorderElements(doc, "page-1", ["d"], "forward")).toBe(doc);
  });

  it("returns the identical document when the whole page is selected", () => {
    // Moving everything relative to everything is a no-op in all four ops.
    const doc = base();
    for (const op of ["front", "back", "forward", "backward"] as const) {
      expect(reorderElements(doc, "page-1", ["a", "b", "c", "d"], op)).toBe(doc);
    }
  });

  it("still returns a new document when the order really does change", () => {
    const doc = base();
    expect(reorderElements(doc, "page-1", ["a"], "front")).not.toBe(doc);
  });

  it("normalizes pre-existing sparse zIndexes even when order is unchanged", () => {
    // Seeded documents can carry duplicate or gappy z-indexes. A reorder that
    // doesn't move anything should still be allowed to densify them, since
    // downstream paint order reads zIndex directly.
    const doc = docWith([
      { id: "a", zIndex: 0 },
      { id: "b", zIndex: 7 },
    ]);
    const out = reorderElements(doc, "page-1", ["b"], "front");
    expect(sortedByZ(out.pages[0].elements).map((e) => e.zIndex)).toEqual([0, 1]);
  });
});

// ─── alignElements ──────────────────────────────────────────────────────────

describe("alignElements", () => {
  it("aligns a lone element to the page, not to itself", () => {
    // Aligning one element against its own bounding box would be a no-op,
    // which makes the button look broken. Page-relative is the useful reading.
    const doc = docWith([{ id: "a", x: 50, y: 50, width: 30, height: 20 }]);

    expect(el(alignElements(doc, "page-1", ["a"], "left"), "a").x).toBe(0);
    expect(el(alignElements(doc, "page-1", ["a"], "right"), "a").x).toBe(PAGE_W - 30);
    expect(el(alignElements(doc, "page-1", ["a"], "hcenter"), "a").x).toBe((PAGE_W - 30) / 2);
    expect(el(alignElements(doc, "page-1", ["a"], "top"), "a").y).toBe(0);
    expect(el(alignElements(doc, "page-1", ["a"], "bottom"), "a").y).toBe(PAGE_H - 20);
    expect(el(alignElements(doc, "page-1", ["a"], "vcenter"), "a").y).toBe((PAGE_H - 20) / 2);
  });

  it("aligns 2+ elements to the selection bounding box, not the page", () => {
    const doc = docWith([
      { id: "a", x: 20, y: 10, width: 30, height: 10 },
      { id: "b", x: 60, y: 40, width: 10, height: 20 },
    ]);

    const left = alignElements(doc, "page-1", ["a", "b"], "left");
    expect(el(left, "a").x).toBe(20);
    expect(el(left, "b").x).toBe(20);

    const right = alignElements(doc, "page-1", ["a", "b"], "right");
    // bbox maxX = max(20+30, 60+10) = 70
    expect(el(right, "a").x).toBe(70 - 30);
    expect(el(right, "b").x).toBe(70 - 10);

    const top = alignElements(doc, "page-1", ["a", "b"], "top");
    expect(el(top, "a").y).toBe(10);
    expect(el(top, "b").y).toBe(10);

    const bottom = alignElements(doc, "page-1", ["a", "b"], "bottom");
    // bbox maxY = max(10+10, 40+20) = 60
    expect(el(bottom, "a").y).toBe(60 - 10);
    expect(el(bottom, "b").y).toBe(60 - 20);
  });

  it("centres 2+ elements on the selection bbox centre", () => {
    const doc = docWith([
      { id: "a", x: 0, y: 0, width: 40, height: 10 },
      { id: "b", x: 0, y: 20, width: 20, height: 10 },
    ]);
    // bbox is x 0..40, centre 20. "a" is already centred; "b" moves to 10.
    const h = alignElements(doc, "page-1", ["a", "b"], "hcenter");
    expect(el(h, "a").x).toBe(0);
    expect(el(h, "b").x).toBe(10);
  });

  it("leaves unselected elements untouched", () => {
    const doc = docWith([
      { id: "a", x: 5, y: 5 },
      { id: "b", x: 90, y: 90 },
    ]);
    const out = alignElements(doc, "page-1", ["a"], "left");
    expect(el(out, "b").x).toBe(90);
    expect(el(out, "b").y).toBe(90);
  });

  it("does not change the perpendicular axis", () => {
    const doc = docWith([{ id: "a", x: 50, y: 77 }]);
    expect(el(alignElements(doc, "page-1", ["a"], "left"), "a").y).toBe(77);
    expect(el(alignElements(doc, "page-1", ["a"], "top"), "a").x).toBe(50);
  });

  it("is a no-op for an empty selection or unknown page", () => {
    const doc = docWith([{ id: "a" }]);
    expect(alignElements(doc, "page-1", [], "left")).toBe(doc);
    expect(alignElements(doc, "page-nope", ["a"], "left")).toBe(doc);
  });

  it("is a no-op when no selected id exists on the page", () => {
    const doc = docWith([{ id: "a" }]);
    expect(alignElements(doc, "page-1", ["ghost"], "left")).toBe(doc);
  });
});

// ─── distributeElements ─────────────────────────────────────────────────────

describe("distributeElements", () => {
  it("equalises gaps horizontally and leaves the endpoints where they were", () => {
    // Widths 10/20/10 over span 0..100 → 60mm of gap split into 2 gaps of 30.
    const doc = docWith([
      { id: "a", x: 0, width: 10 },
      { id: "b", x: 15, width: 20 },
      { id: "c", x: 90, width: 10 },
    ]);
    const out = distributeElements(doc, "page-1", ["a", "b", "c"], "horizontal");

    expect(el(out, "a").x).toBe(0);
    expect(el(out, "c").x).toBe(90);
    expect(el(out, "b").x).toBe(40); // 0 + 10 + 30

    const gap1 = el(out, "b").x - (el(out, "a").x + 10);
    const gap2 = el(out, "c").x - (el(out, "b").x + 20);
    expect(gap1).toBeCloseTo(gap2, 10);
  });

  it("equalises gaps vertically", () => {
    const doc = docWith([
      { id: "a", y: 0, height: 10 },
      { id: "b", y: 12, height: 30 },
      { id: "c", y: 100, height: 10 },
    ]);
    const out = distributeElements(doc, "page-1", ["a", "b", "c"], "vertical");

    expect(el(out, "a").y).toBe(0);
    expect(el(out, "c").y).toBe(100);
    const gap1 = el(out, "b").y - (el(out, "a").y + 10);
    const gap2 = el(out, "c").y - (el(out, "b").y + 30);
    expect(gap1).toBeCloseTo(gap2, 10);
  });

  it("equalises GAPS, not centre spacing, when sizes differ", () => {
    // With mixed sizes these two definitions disagree. Equal centres would
    // put "b" at centre 50 → x = 40 for width 20... which happens to match,
    // so use an asymmetric case where they provably differ.
    const doc = docWith([
      { id: "a", x: 0, width: 10 },
      { id: "b", x: 20, width: 60 },
      { id: "c", x: 90, width: 10 },
    ]);
    const out = distributeElements(doc, "page-1", ["a", "b", "c"], "horizontal");
    // Total size 80 over span 100 → 20mm gap total → 10mm per gap.
    expect(el(out, "b").x).toBe(20); // 0 + 10 + 10
    // Equal-centre spacing would have placed b's centre at 50 → x = 20 too.
    // Distinguish via the last gap: equal-gap keeps c at 90 with gap 10.
    expect(el(out, "c").x - (el(out, "b").x + 60)).toBe(10);
  });

  it("sorts by position rather than trusting selection order", () => {
    const doc = docWith([
      { id: "a", x: 0, width: 10 },
      { id: "b", x: 15, width: 10 },
      { id: "c", x: 90, width: 10 },
    ]);
    const out = distributeElements(doc, "page-1", ["c", "a", "b"], "horizontal");
    expect(el(out, "a").x).toBe(0);
    expect(el(out, "c").x).toBe(90);
    expect(el(out, "b").x).toBeGreaterThan(0);
    expect(el(out, "b").x).toBeLessThan(90);
  });

  it("handles negative gaps (overlapping elements) without throwing", () => {
    const doc = docWith([
      { id: "a", x: 0, width: 50 },
      { id: "b", x: 5, width: 50 },
      { id: "c", x: 10, width: 50 },
    ]);
    const out = distributeElements(doc, "page-1", ["a", "b", "c"], "horizontal");
    expect(el(out, "a").x).toBe(0);
    expect(el(out, "c").x).toBe(10);
    expect(Number.isFinite(el(out, "b").x)).toBe(true);
  });

  it("is a no-op for fewer than 3 elements", () => {
    const doc = docWith([
      { id: "a", x: 0 },
      { id: "b", x: 50 },
    ]);
    expect(distributeElements(doc, "page-1", ["a", "b"], "horizontal")).toBe(doc);
    expect(distributeElements(doc, "page-1", ["a"], "horizontal")).toBe(doc);
    expect(distributeElements(doc, "page-1", [], "horizontal")).toBe(doc);
  });

  it("is a no-op when the selection resolves to fewer than 3 real elements", () => {
    const doc = docWith([{ id: "a" }, { id: "b" }]);
    expect(distributeElements(doc, "page-1", ["a", "b", "ghost"], "horizontal")).toBe(doc);
  });

  it("is a no-op for an unknown page", () => {
    const doc = docWith([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(distributeElements(doc, "page-nope", ["a", "b", "c"], "horizontal")).toBe(doc);
  });

  it("leaves unselected elements untouched", () => {
    const doc = docWith([
      { id: "a", x: 0, width: 10 },
      { id: "b", x: 15, width: 10 },
      { id: "c", x: 90, width: 10 },
      { id: "z", x: 33, width: 10 },
    ]);
    const out = distributeElements(doc, "page-1", ["a", "b", "c"], "horizontal");
    expect(el(out, "z").x).toBe(33);
  });
});

// ─── snapPosition ───────────────────────────────────────────────────────────

describe("snapPosition", () => {
  const emptyPage = () => docWith([]).pages[0];

  it("snaps the left edge to the page left edge", () => {
    const res = snapPosition(emptyPage(), { id: "m", x: 1, y: 100, width: 20, height: 10 });
    expect(res.x).toBe(0);
    expect(res.guides).toContainEqual({ orientation: "vertical", at: 0 });
  });

  it("snaps the right edge to the page right edge", () => {
    const res = snapPosition(emptyPage(), {
      id: "m",
      x: PAGE_W - 20 - 1,
      y: 100,
      width: 20,
      height: 10,
    });
    expect(res.x).toBe(PAGE_W - 20);
  });

  it("snaps the horizontal centre to the page centre", () => {
    // Centre of a 40mm-wide box lands on 105 when x = 85.
    const res = snapPosition(emptyPage(), { id: "m", x: 86, y: 100, width: 40, height: 10 });
    expect(res.x).toBe(85);
    expect(res.guides).toContainEqual({ orientation: "vertical", at: PAGE_W / 2 });
  });

  it("snaps the vertical centre to the page centre", () => {
    const res = snapPosition(emptyPage(), {
      id: "m",
      x: 10,
      y: PAGE_H / 2 - 5 + 1,
      width: 10,
      height: 10,
    });
    expect(res.y).toBe(PAGE_H / 2 - 5);
    expect(res.guides).toContainEqual({ orientation: "horizontal", at: PAGE_H / 2 });
  });

  it("snaps to another element's edge", () => {
    const page = docWith([{ id: "other", x: 80, y: 40, width: 30, height: 30 }]).pages[0];
    const res = snapPosition(page, { id: "m", x: 79, y: 200, width: 10, height: 10 });
    expect(res.x).toBe(80);
    expect(res.guides).toContainEqual({ orientation: "vertical", at: 80 });
  });

  it("snaps to another element's centre line", () => {
    const page = docWith([{ id: "other", x: 80, y: 40, width: 30, height: 30 }]).pages[0];
    // other centre X = 95. Moving box width 10 → x = 90 centres it.
    const res = snapPosition(page, { id: "m", x: 91, y: 200, width: 10, height: 10 });
    expect(res.x).toBe(90);
    expect(res.guides).toContainEqual({ orientation: "vertical", at: 95 });
  });

  it("never snaps an element to itself", () => {
    // If self were a candidate, every drag would be frozen in place: the
    // element's own edges are always at distance 0.
    const page = docWith([{ id: "m", x: 80, y: 80, width: 10, height: 10 }]).pages[0];
    const res = snapPosition(page, { id: "m", x: 130, y: 200, width: 10, height: 10 });
    expect(res.x).toBe(130);
    expect(res.y).toBe(200);
    expect(res.guides).toEqual([]);
  });

  it("resolves the two axes independently", () => {
    // Near the page left edge horizontally, nowhere near anything vertically.
    const res = snapPosition(emptyPage(), { id: "m", x: 1, y: 100, width: 20, height: 10 });
    expect(res.x).toBe(0);
    expect(res.y).toBe(100);
    expect(res.guides).toHaveLength(1);
    expect(res.guides[0].orientation).toBe("vertical");
  });

  it("returns the position unchanged and no guides when nothing is in range", () => {
    const res = snapPosition(emptyPage(), { id: "m", x: 63, y: 100, width: 11, height: 7 });
    expect(res.x).toBe(63);
    expect(res.y).toBe(100);
    expect(res.guides).toEqual([]);
  });

  it("snaps the trailing edge, not just the leading one, to a centre line", () => {
    // Regression: any of the three edges (start / centre / end) may be the one
    // that latches. A box at y=137 with height 10 has its BOTTOM edge at 147,
    // 1.5mm from the A4 vertical centre (148.5) — so it snaps even though its
    // origin is 11.5mm away. Getting this wrong makes snapping feel like it
    // only works when dragging down-and-right.
    const res = snapPosition(emptyPage(), { id: "m", x: 10, y: 137, width: 10, height: 10 });
    expect(res.y).toBe(PAGE_H / 2 - 10);
    expect(res.guides).toContainEqual({ orientation: "horizontal", at: PAGE_H / 2 });
  });

  it("snaps exactly at the tolerance boundary and not beyond it", () => {
    const atBoundary = snapPosition(emptyPage(), {
      id: "m",
      x: SNAP_TOLERANCE_MM,
      y: 137,
      width: 10,
      height: 10,
    });
    expect(atBoundary.x).toBe(0);

    const justOutside = snapPosition(emptyPage(), {
      id: "m",
      x: SNAP_TOLERANCE_MM + 0.001,
      y: 137,
      width: 10,
      height: 10,
    });
    expect(justOutside.x).toBeCloseTo(SNAP_TOLERANCE_MM + 0.001, 10);
  });

  it("honours a custom tolerance", () => {
    const moving = { id: "m", x: 5, y: 100, width: 10, height: 10 };
    expect(snapPosition(emptyPage(), moving, 1).x).toBe(5);
    expect(snapPosition(emptyPage(), moving, 10).x).toBe(0);
  });

  it("picks the nearest candidate when several are in range", () => {
    // Two candidate lines within tolerance: page 0 (dist 1.5) and other's
    // left edge at 2 (dist 0.5 from the moving left edge).
    const page = docWith([{ id: "other", x: 2, y: 40, width: 30, height: 30 }]).pages[0];
    const res = snapPosition(page, { id: "m", x: 1.5, y: 200, width: 10, height: 10 }, 2);
    expect(res.x).toBe(2);
  });

  it("does not mutate the page", () => {
    const page = docWith([{ id: "other", x: 80, y: 40, width: 30, height: 30 }]).pages[0];
    const snapshot = JSON.stringify(page);
    snapPosition(page, { id: "m", x: 79, y: 200, width: 10, height: 10 });
    expect(JSON.stringify(page)).toBe(snapshot);
  });
});

// ─── translateElements ──────────────────────────────────────────────────────

describe("translateElements", () => {
  it("moves every selected element by the same delta", () => {
    const doc = docWith([
      { id: "a", x: 10, y: 20 },
      { id: "b", x: 30, y: 40 },
      { id: "z", x: 0, y: 0 },
    ]);
    const out = translateElements(doc, "page-1", ["a", "b"], 5, -3);
    expect([el(out, "a").x, el(out, "a").y]).toEqual([15, 17]);
    expect([el(out, "b").x, el(out, "b").y]).toEqual([35, 37]);
    expect([el(out, "z").x, el(out, "z").y]).toEqual([0, 0]);
  });

  it("preserves the relative offsets inside the selection", () => {
    // This is the whole point of the operation: a card built from loose
    // primitives has to keep its internal geometry when it moves.
    const doc = docWith([
      { id: "a", x: 10, y: 20 },
      { id: "b", x: 30, y: 25 },
    ]);
    const out = translateElements(doc, "page-1", ["a", "b"], 40, 40);
    expect(el(out, "b").x - el(out, "a").x).toBe(20);
    expect(el(out, "b").y - el(out, "a").y).toBe(5);
  });

  it("allows moving off-page (clamping is a UI concern, not a model one)", () => {
    const doc = docWith([{ id: "a", x: 0, y: 0 }]);
    const out = translateElements(doc, "page-1", ["a"], -50, -50);
    expect(el(out, "a").x).toBe(-50);
  });

  it("is a no-op for a zero delta or empty selection", () => {
    const doc = docWith([{ id: "a" }]);
    expect(translateElements(doc, "page-1", ["a"], 0, 0)).toBe(doc);
    expect(translateElements(doc, "page-1", [], 5, 5)).toBe(doc);
  });

  it("does not mutate the input document", () => {
    const doc = docWith([{ id: "a", x: 10, y: 20 }]);
    translateElements(doc, "page-1", ["a"], 5, 5);
    expect(el(doc, "a").x).toBe(10);
  });
});

// ─── duplicateElements ──────────────────────────────────────────────────────

describe("duplicateElements", () => {
  it("adds a copy with a fresh id, offset from the original", () => {
    const doc = docWith([{ id: "a", x: 10, y: 20, width: 30, height: 40 }]);
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["a"]);

    expect(newIds).toHaveLength(1);
    expect(newIds[0]).not.toBe("a");
    expect(out.pages[0].elements).toHaveLength(2);

    const copy = el(out, newIds[0]);
    expect(copy.x).toBe(14);
    expect(copy.y).toBe(24);
    expect(copy.width).toBe(30);
    expect(copy.height).toBe(40);
  });

  it("honours a custom offset", () => {
    const doc = docWith([{ id: "a", x: 10, y: 20 }]);
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["a"], 0);
    expect(el(out, newIds[0]).x).toBe(10);
    expect(el(out, newIds[0]).y).toBe(20);
  });

  it("copies element-kind-specific properties, not just geometry", () => {
    const page = newPage();
    const text = {
      ...newTextElement({ x: 0, y: 0, width: 50, height: 10 }),
      id: "t",
      content: "Keynote",
      fontSize: 33,
      color: "#ff6600",
    };
    const doc: BrochureDocument = {
      id: "d",
      title: "T",
      pages: [{ ...page, id: "page-1", elements: [text] }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["t"]);
    const copy = el(out, newIds[0]);
    expect(copy.kind).toBe("text");
    if (copy.kind !== "text") throw new Error("unreachable");
    expect(copy.content).toBe("Keynote");
    expect(copy.fontSize).toBe(33);
    expect(copy.color).toBe("#ff6600");
  });

  it("puts copies on top of the originals in paint order", () => {
    const doc = docWith([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["a"]);
    expect(orderOf(out)).toEqual(["a", "b", "c", newIds[0]]);
  });

  it("duplicates a multi-selection preserving relative order and offsets", () => {
    const doc = docWith([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 20, y: 10 },
    ]);
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["a", "b"]);
    expect(newIds).toHaveLength(2);
    expect(orderOf(out)).toEqual(["a", "b", newIds[0], newIds[1]]);
    expect(el(out, newIds[1]).x - el(out, newIds[0]).x).toBe(20);
  });

  it("generates distinct ids for every copy", () => {
    const doc = docWith([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const { newIds } = duplicateElements(doc, "page-1", ["a", "b", "c"]);
    expect(new Set(newIds).size).toBe(3);
  });

  it("normalizes zIndex so the copies are densely ordered", () => {
    const doc = docWith([{ id: "a" }, { id: "b" }]);
    const { doc: out } = duplicateElements(doc, "page-1", ["a", "b"]);
    expect(sortedByZ(out.pages[0].elements).map((e) => e.zIndex)).toEqual([0, 1, 2, 3]);
  });

  it("returns the document untouched for an empty or unmatched selection", () => {
    const doc = docWith([{ id: "a" }]);
    expect(duplicateElements(doc, "page-1", [])).toEqual({ doc, newIds: [] });
    expect(duplicateElements(doc, "page-1", ["ghost"])).toEqual({ doc, newIds: [] });
    expect(duplicateElements(doc, "page-nope", ["a"])).toEqual({ doc, newIds: [] });
  });

  it("does not mutate the input document", () => {
    const doc = docWith([{ id: "a" }]);
    duplicateElements(doc, "page-1", ["a"]);
    expect(doc.pages[0].elements).toHaveLength(1);
  });
});

// ─── Grouping (cards) ───────────────────────────────────────────────────────

/** Builds a page whose elements carry the given group tags. */
function groupedDoc(
  boxes: Array<{ id: string; groupId?: string; x?: number; y?: number }>,
): BrochureDocument {
  const doc = docWith(boxes.map((b) => ({ id: b.id, x: b.x, y: b.y })));
  const tagged = doc.pages[0].elements.map((el, i) =>
    boxes[i].groupId ? { ...el, groupId: boxes[i].groupId } : el,
  );
  return { ...doc, pages: [{ ...doc.pages[0], elements: tagged }] };
}

describe("expandSelectionToGroups", () => {
  it("expands one grouped element to its whole card", () => {
    // This is the fix for the reported bug: clicking a speaker tile's
    // background rect used to select only that rect, so resizing grew the
    // backing box and left the photo and text behind.
    const doc = groupedDoc([
      { id: "bg", groupId: "card1" },
      { id: "photo", groupId: "card1" },
      { id: "name", groupId: "card1" },
      { id: "loose" },
    ]);
    expect(expandSelectionToGroups(doc.pages[0], ["bg"])).toEqual([
      "bg",
      "photo",
      "name",
    ]);
  });

  it("leaves an ungrouped element alone", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b", groupId: "card1" }]);
    expect(expandSelectionToGroups(doc.pages[0], ["a"])).toEqual(["a"]);
  });

  it("expands across several cards at once", () => {
    const doc = groupedDoc([
      { id: "a1", groupId: "c1" },
      { id: "a2", groupId: "c1" },
      { id: "b1", groupId: "c2" },
      { id: "b2", groupId: "c2" },
    ]);
    expect(expandSelectionToGroups(doc.pages[0], ["a1", "b2"])).toEqual([
      "a1",
      "a2",
      "b1",
      "b2",
    ]);
  });

  it("keeps ungrouped members of a mixed selection", () => {
    const doc = groupedDoc([
      { id: "bg", groupId: "c1" },
      { id: "photo", groupId: "c1" },
      { id: "loose" },
    ]);
    expect(expandSelectionToGroups(doc.pages[0], ["bg", "loose"])).toEqual([
      "bg",
      "photo",
      "loose",
    ]);
  });

  it("returns results in page order, so repeated clicks are stable", () => {
    const doc = groupedDoc([
      { id: "bg", groupId: "c1" },
      { id: "photo", groupId: "c1" },
      { id: "name", groupId: "c1" },
    ]);
    const once = expandSelectionToGroups(doc.pages[0], ["name"]);
    const twice = expandSelectionToGroups(doc.pages[0], once);
    expect(once).toEqual(["bg", "photo", "name"]);
    expect(twice).toEqual(once);
  });

  it("returns the identical array when nothing needs adding", () => {
    // Called on every click, so a stable reference keeps React state and memo
    // dependencies from churning.
    const doc = groupedDoc([{ id: "a" }, { id: "b" }]);
    const input = ["a"];
    expect(expandSelectionToGroups(doc.pages[0], input)).toBe(input);

    const full = groupedDoc([
      { id: "x", groupId: "c" },
      { id: "y", groupId: "c" },
    ]);
    const complete = ["x", "y"];
    expect(expandSelectionToGroups(full.pages[0], complete)).toBe(complete);
  });

  it("is a no-op for an empty selection", () => {
    const doc = groupedDoc([{ id: "a", groupId: "c" }]);
    const empty: string[] = [];
    expect(expandSelectionToGroups(doc.pages[0], empty)).toBe(empty);
  });

  it("ignores ids that are not on the page", () => {
    const doc = groupedDoc([{ id: "a", groupId: "c" }, { id: "b", groupId: "c" }]);
    expect(expandSelectionToGroups(doc.pages[0], ["ghost"])).toEqual(["ghost"]);
  });
});

describe("groupElements", () => {
  it("tags the selection with one shared id", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const out = groupElements(doc, "page-1", ["a", "b"]);
    const ga = el(out, "a").groupId;
    const gb = el(out, "b").groupId;
    expect(ga).toBeTruthy();
    expect(ga).toBe(gb);
    expect(el(out, "c").groupId).toBeUndefined();
  });

  it("makes the grouped elements expand as a card afterwards", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const out = groupElements(doc, "page-1", ["a", "b"]);
    expect(expandSelectionToGroups(out.pages[0], ["a"])).toEqual(["a", "b"]);
  });

  it("generates a distinct id per group", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
    const out = groupElements(groupElements(doc, "page-1", ["a", "b"]), "page-1", ["c", "d"]);
    expect(el(out, "a").groupId).not.toBe(el(out, "c").groupId);
  });

  it("merges rather than nests when the selection spans two cards", () => {
    // The model is deliberately flat. Silently producing a half-nested state
    // would be worse than merging.
    const doc = groupedDoc([
      { id: "a1", groupId: "c1" },
      { id: "a2", groupId: "c1" },
      { id: "b1", groupId: "c2" },
    ]);
    const out = groupElements(doc, "page-1", ["a1", "a2", "b1"]);
    const ids = new Set([
      el(out, "a1").groupId,
      el(out, "a2").groupId,
      el(out, "b1").groupId,
    ]);
    expect(ids.size).toBe(1);
  });

  it("needs at least two elements", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }]);
    expect(groupElements(doc, "page-1", ["a"])).toBe(doc);
    expect(groupElements(doc, "page-1", [])).toBe(doc);
  });

  it("is a no-op when fewer than two ids exist on the page", () => {
    const doc = groupedDoc([{ id: "a" }]);
    expect(groupElements(doc, "page-1", ["a", "ghost"])).toBe(doc);
    expect(groupElements(doc, "page-nope", ["a", "b"])).toBe(doc);
  });

  it("does not mutate the input document", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }]);
    groupElements(doc, "page-1", ["a", "b"]);
    expect(el(doc, "a").groupId).toBeUndefined();
  });
});

describe("ungroupElements", () => {
  it("removes the group tag entirely rather than leaving it undefined-valued", () => {
    // The field is optional, and a leftover `groupId: undefined` key would
    // serialize into the persisted JSON as noise.
    const doc = groupedDoc([
      { id: "a", groupId: "c1" },
      { id: "b", groupId: "c1" },
    ]);
    const out = ungroupElements(doc, "page-1", ["a", "b"]);
    expect("groupId" in el(out, "a")).toBe(false);
    expect("groupId" in el(out, "b")).toBe(false);
  });

  it("leaves geometry untouched", () => {
    const doc = groupedDoc([
      { id: "a", groupId: "c1", x: 12, y: 34 },
      { id: "b", groupId: "c1" },
    ]);
    const out = ungroupElements(doc, "page-1", ["a"]);
    expect([el(out, "a").x, el(out, "a").y]).toEqual([12, 34]);
  });

  it("only ungroups what was selected", () => {
    const doc = groupedDoc([
      { id: "a", groupId: "c1" },
      { id: "b", groupId: "c1" },
    ]);
    const out = ungroupElements(doc, "page-1", ["a"]);
    expect(el(out, "b").groupId).toBe("c1");
  });

  it("stops the selection expanding once every member is ungrouped", () => {
    const doc = groupedDoc([
      { id: "a", groupId: "c1" },
      { id: "b", groupId: "c1" },
    ]);
    const out = ungroupElements(doc, "page-1", ["a", "b"]);
    expect(expandSelectionToGroups(out.pages[0], ["a"])).toEqual(["a"]);
  });

  it("is a no-op when nothing in the selection is grouped", () => {
    const doc = groupedDoc([{ id: "a" }, { id: "b" }]);
    expect(ungroupElements(doc, "page-1", ["a", "b"])).toBe(doc);
    expect(ungroupElements(doc, "page-1", [])).toBe(doc);
  });

  it("does not mutate the input document", () => {
    const doc = groupedDoc([
      { id: "a", groupId: "c1" },
      { id: "b", groupId: "c1" },
    ]);
    ungroupElements(doc, "page-1", ["a"]);
    expect(el(doc, "a").groupId).toBe("c1");
  });
});

describe("selectionHasGroup", () => {
  it("is true when any selected element belongs to a card", () => {
    const doc = groupedDoc([{ id: "a", groupId: "c1" }, { id: "b" }]);
    expect(selectionHasGroup(doc.pages[0], ["a"])).toBe(true);
    expect(selectionHasGroup(doc.pages[0], ["a", "b"])).toBe(true);
  });

  it("is false for an ungrouped or empty selection", () => {
    const doc = groupedDoc([{ id: "a", groupId: "c1" }, { id: "b" }]);
    expect(selectionHasGroup(doc.pages[0], ["b"])).toBe(false);
    expect(selectionHasGroup(doc.pages[0], [])).toBe(false);
    expect(selectionHasGroup(doc.pages[0], ["ghost"])).toBe(false);
  });
});

// ─── Group interaction with the other operations ────────────────────────────

describe("grouped cards work with the existing operations", () => {
  it("translates a whole card rigidly", () => {
    const doc = groupedDoc([
      { id: "bg", groupId: "c1", x: 0, y: 0 },
      { id: "photo", groupId: "c1", x: 2, y: 2 },
    ]);
    const ids = expandSelectionToGroups(doc.pages[0], ["bg"]);
    const out = translateElements(doc, "page-1", ids, 10, 5);
    expect([el(out, "bg").x, el(out, "bg").y]).toEqual([10, 5]);
    expect([el(out, "photo").x, el(out, "photo").y]).toEqual([12, 7]);
  });

  it("duplicates a card as a card, with its own fresh group id", () => {
    // Copies must NOT share the original's groupId, or selecting the copy would
    // also select the original and the two would be stuck together forever.
    const doc = groupedDoc([
      { id: "bg", groupId: "c1" },
      { id: "photo", groupId: "c1" },
    ]);
    const { doc: out, newIds } = duplicateElements(doc, "page-1", ["bg", "photo"]);
    expect(newIds).toHaveLength(2);

    const copyGroups = new Set(newIds.map((id) => el(out, id).groupId));
    expect(copyGroups.size).toBe(1);
    const copyGroup = [...copyGroups][0];
    expect(copyGroup).toBeTruthy();
    expect(copyGroup).not.toBe("c1");

    // And the copy expands to exactly itself, not to the original too.
    expect(expandSelectionToGroups(out.pages[0], [newIds[0]]).sort()).toEqual(
      [...newIds].sort(),
    );
  });

  it("keeps a card contiguous in paint order when sent to the front", () => {
    const doc = groupedDoc([
      { id: "bg", groupId: "c1" },
      { id: "other" },
      { id: "photo", groupId: "c1" },
    ]);
    const ids = expandSelectionToGroups(doc.pages[0], ["bg"]);
    const out = reorderElements(doc, "page-1", ids, "front");
    expect(orderOf(out)).toEqual(["other", "bg", "photo"]);
  });
});

// ─── Clipboard ──────────────────────────────────────────────────────────────

describe("copyElements", () => {
  it("returns detached copies, so editing the document can't mutate the clipboard", () => {
    // This is what makes cut-then-paste work: the originals are gone by the time
    // paste runs.
    const doc = docWith([{ id: "a", x: 10 }, { id: "b", x: 20 }]);
    const clip = copyElements(doc.pages[0], ["a"]);
    expect(clip).toHaveLength(1);
    expect(clip[0]).not.toBe(el(doc, "a"));
    expect(clip[0].x).toBe(10);
  });

  it("returns clipboard entries in paint order", () => {
    const doc = docWith([
      { id: "a", zIndex: 2 },
      { id: "b", zIndex: 0 },
      { id: "c", zIndex: 1 },
    ]);
    expect(copyElements(doc.pages[0], ["a", "b", "c"]).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("ignores unknown ids and returns empty for an empty selection", () => {
    const doc = docWith([{ id: "a" }]);
    expect(copyElements(doc.pages[0], ["ghost"])).toEqual([]);
    expect(copyElements(doc.pages[0], [])).toEqual([]);
  });
});

describe("pasteElements", () => {
  it("adds copies with fresh ids, offset, on top", () => {
    const source = docWith([{ id: "a", x: 10, y: 20 }]);
    const clip = copyElements(source.pages[0], ["a"]);

    const target = docWith([{ id: "existing" }]);
    const { doc: out, newIds } = pasteElements(target, "page-1", clip);

    expect(newIds).toHaveLength(1);
    expect(newIds[0]).not.toBe("a");
    expect(orderOf(out)).toEqual(["existing", newIds[0]]);
    expect(el(out, newIds[0]).x).toBe(14);
    expect(el(out, newIds[0]).y).toBe(24);
  });

  it("pastes onto a DIFFERENT page than the source, which is how elements move", () => {
    // The whole point: before this, `duplicateElements` was the only copy
    // mechanism and it was hard-wired to one page.
    const twoPage: BrochureDocument = {
      ...docWith([{ id: "a", x: 5, y: 5 }]),
      pages: [
        docWith([{ id: "a", x: 5, y: 5 }]).pages[0],
        { ...newPage(), id: "page-2", elements: [] },
      ],
    };
    const clip = copyElements(twoPage.pages[0], ["a"]);
    const { doc: out, newIds } = pasteElements(twoPage, "page-2", clip);

    expect(out.pages[0].elements).toHaveLength(1); // source untouched
    expect(out.pages[1].elements).toHaveLength(1);
    expect(out.pages[1].elements[0].id).toBe(newIds[0]);
  });

  it("remaps card tags so a pasted card is its own card", () => {
    // Reusing the source groupId would weld the copy to the original — selecting
    // one would select both, forever.
    const source = groupedDoc([
      { id: "bg", groupId: "c1" },
      { id: "photo", groupId: "c1" },
    ]);
    const clip = copyElements(source.pages[0], ["bg", "photo"]);
    const { doc: out, newIds } = pasteElements(source, "page-1", clip);

    const copyGroups = new Set(newIds.map((id) => el(out, id).groupId));
    expect(copyGroups.size).toBe(1);
    expect([...copyGroups][0]).not.toBe("c1");
  });

  it("keeps two separate cards separate when pasted together", () => {
    const source = groupedDoc([
      { id: "a1", groupId: "c1" },
      { id: "a2", groupId: "c1" },
      { id: "b1", groupId: "c2" },
      { id: "b2", groupId: "c2" },
    ]);
    const clip = copyElements(source.pages[0], ["a1", "a2", "b1", "b2"]);
    const { doc: out, newIds } = pasteElements(source, "page-1", clip);
    const groups = new Set(newIds.map((id) => el(out, id).groupId));
    expect(groups.size).toBe(2);
  });

  it("pasting twice produces two independent copies", () => {
    const source = docWith([{ id: "a" }]);
    const clip = copyElements(source.pages[0], ["a"]);
    const first = pasteElements(source, "page-1", clip);
    const second = pasteElements(first.doc, "page-1", clip);
    expect(second.newIds[0]).not.toBe(first.newIds[0]);
    expect(second.doc.pages[0].elements).toHaveLength(3);
  });

  it("keeps zIndex dense after a paste", () => {
    const source = docWith([{ id: "a" }, { id: "b" }]);
    const clip = copyElements(source.pages[0], ["a", "b"]);
    const { doc: out } = pasteElements(source, "page-1", clip);
    expect(sortedByZ(out.pages[0].elements).map((e) => e.zIndex)).toEqual([0, 1, 2, 3]);
  });

  it("is a no-op for an empty clipboard or unknown page", () => {
    const doc = docWith([{ id: "a" }]);
    expect(pasteElements(doc, "page-1", [])).toEqual({ doc, newIds: [] });
    expect(pasteElements(doc, "page-nope", copyElements(doc.pages[0], ["a"]))).toEqual({
      doc,
      newIds: [],
    });
  });

  it("does not mutate the input document", () => {
    const doc = docWith([{ id: "a" }]);
    pasteElements(doc, "page-1", copyElements(doc.pages[0], ["a"]));
    expect(doc.pages[0].elements).toHaveLength(1);
  });
});

// ─── movePage ───────────────────────────────────────────────────────────────

describe("movePage", () => {
  /** Document with `n` pages named `p1`…`pn`. */
  const pagesDoc = (n: number): BrochureDocument => ({
    id: "d",
    title: "T",
    pages: Array.from({ length: n }, (_, i) => ({ ...newPage(), id: `p${i + 1}`, elements: [] })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const order = (d: BrochureDocument) => d.pages.map((p) => p.id);

  it("swaps a page with the one before it", () => {
    expect(order(movePage(pagesDoc(4), "p3", "earlier"))).toEqual(["p1", "p3", "p2", "p4"]);
  });

  it("swaps a page with the one after it", () => {
    expect(order(movePage(pagesDoc(4), "p2", "later"))).toEqual(["p1", "p3", "p2", "p4"]);
  });

  it("is a no-op at the boundaries", () => {
    const doc = pagesDoc(3);
    expect(movePage(doc, "p1", "earlier")).toBe(doc);
    expect(movePage(doc, "p3", "later")).toBe(doc);
  });

  it("is a no-op for an unknown page or a single-page document", () => {
    const doc = pagesDoc(3);
    expect(movePage(doc, "nope", "earlier")).toBe(doc);
    const one = pagesDoc(1);
    expect(movePage(one, "p1", "later")).toBe(one);
  });

  it("can walk a page from the end to the front, one step at a time", () => {
    // The concrete scenario this was written for: "duplicate page" appends to the
    // end, so bringing the copy back to position 2 has to be possible.
    let doc = pagesDoc(5);
    for (let i = 0; i < 3; i += 1) doc = movePage(doc, "p5", "earlier");
    expect(order(doc)).toEqual(["p1", "p5", "p2", "p3", "p4"]);
  });

  it("preserves page contents and identity, only the order", () => {
    const doc = pagesDoc(3);
    const before = doc.pages.find((p) => p.id === "p2");
    const out = movePage(doc, "p2", "later");
    expect(out.pages.find((p) => p.id === "p2")).toBe(before);
    expect(out.pages).toHaveLength(3);
  });

  it("does not mutate the input document", () => {
    const doc = pagesDoc(3);
    movePage(doc, "p2", "later");
    expect(order(doc)).toEqual(["p1", "p2", "p3"]);
  });
});

// ─── selectionBounds ────────────────────────────────────────────────────────

describe("selectionBounds", () => {
  it("returns the union box of the selection", () => {
    const page = docWith([
      { id: "a", x: 10, y: 20, width: 30, height: 10 },
      { id: "b", x: 5, y: 50, width: 10, height: 10 },
    ]).pages[0];
    expect(selectionBounds(page, ["a", "b"])).toEqual({ x: 5, y: 20, width: 35, height: 40 });
  });

  it("returns the element's own box for a single selection", () => {
    const page = docWith([{ id: "a", x: 10, y: 20, width: 30, height: 10 }]).pages[0];
    expect(selectionBounds(page, ["a"])).toEqual({ x: 10, y: 20, width: 30, height: 10 });
  });

  it("ignores ids that are not on the page", () => {
    const page = docWith([{ id: "a", x: 10, y: 20, width: 30, height: 10 }]).pages[0];
    expect(selectionBounds(page, ["a", "ghost"])).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 10,
    });
  });

  it("returns null when nothing matches", () => {
    const page = docWith([{ id: "a" }]).pages[0];
    expect(selectionBounds(page, [])).toBeNull();
    expect(selectionBounds(page, ["ghost"])).toBeNull();
  });
});
