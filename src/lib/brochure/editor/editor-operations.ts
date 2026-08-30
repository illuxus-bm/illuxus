/**
 * Direct-manipulation operations for the brochure editor — the "Canva-like"
 * layer on top of `editor-document.ts`'s primitives.
 *
 * Everything here is PURE: each function takes a document and returns a new
 * one, never mutating the input. That is what makes the editor's undo/redo
 * (`editor-history.ts`) work by simply retaining previous document references,
 * and it is why these are unit-testable without a canvas — see
 * `__tests__/editor-operations.test.ts`.
 *
 * ## Why these live in their own module
 *
 * `editor-document.ts` owns the *shape* of a document plus the minimal CRUD
 * needed to build one. This module owns the *editing verbs* an organizer
 * performs — reorder, align, distribute, group, snap. Keeping them apart means
 * the seed builders in `editor-templates.ts` don't accidentally depend on
 * interaction semantics, and the operations can grow without making the model
 * file harder to read.
 *
 * ## Coordinate conventions
 *
 * Every value is millimetres, matching the document model. Operations never
 * consult the viewport zoom, DPI, or Konva — a nudge of 1 means 1 mm on the
 * printed page regardless of how the canvas happens to be scaled.
 */

import {
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
  generateId,
} from "./editor-document";

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Applies `fn` to one page's element array and returns a new document. */
function mapPageElements(
  doc: BrochureDocument,
  pageId: string,
  fn: (elements: BrochureElement[]) => BrochureElement[],
): BrochureDocument {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId) return p;
    const next = fn(p.elements);
    if (next === p.elements) return p;
    changed = true;
    return { ...p, elements: next };
  });
  if (!changed) return doc;
  return { ...doc, pages, updatedAt: new Date().toISOString() };
}

/**
 * Rewrites `zIndex` to be the dense array order, 0..n-1.
 *
 * The model permits duplicate z-indexes (resolved by array index), and the
 * seed builders assign `zIndex = elements.length` as they push. Normalising
 * after every reorder keeps "array order === paint order === zIndex" true,
 * which is what lets the layer operations below reason about position by index
 * instead of having to invent tie-breaking rules.
 */
function normalizeZ(
  elements: BrochureElement[],
  /** The array this result is compared against to decide "nothing changed".
   *  Callers pass the page's ORIGINAL element array so a reorder that moves
   *  nothing (sending the bottom element further back, say) can return it
   *  unchanged — `mapPageElements` uses referential equality to skip the
   *  update, which is what keeps a no-op click out of the undo history. */
  original?: BrochureElement[],
): BrochureElement[] {
  const next = elements.map((el, i) => (el.zIndex === i ? el : { ...el, zIndex: i }));
  if (
    original &&
    next.length === original.length &&
    next.every((el, i) => el === original[i])
  ) {
    return original;
  }
  return next;
}

/** Paint order: ascending zIndex, ties broken by existing array position. */
export function sortedByZ(elements: BrochureElement[]): BrochureElement[] {
  return elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => (a.el.zIndex - b.el.zIndex) || (a.i - b.i))
    .map(({ el }) => el);
}

// ─── Z-order / layer operations ─────────────────────────────────────────────

export type LayerOp = "front" | "forward" | "backward" | "back";

/**
 * Moves elements through the paint order.
 *
 * The model always had a `zIndex` field but there was NO user-facing way to
 * change it — an element added later was permanently on top of one added
 * earlier. That makes a template uneditable in practice: you cannot put a
 * caption over an image you added afterwards, or move a background rectangle
 * behind text.
 *
 * Multi-select aware. `forward`/`backward` iterate from the end/start
 * respectively so a contiguous multi-selection shifts as a block instead of
 * collapsing onto itself, and so two adjacent selected elements can't swap
 * past each other.
 */
export function reorderElements(
  doc: BrochureDocument,
  pageId: string,
  elementIds: string[],
  op: LayerOp,
): BrochureDocument {
  if (elementIds.length === 0) return doc;
  const ids = new Set(elementIds);

  return mapPageElements(doc, pageId, (elements) => {
    const ordered = sortedByZ(elements);
    const isSel = (el: BrochureElement) => ids.has(el.id);

    if (op === "front") {
      const kept = ordered.filter((el) => !isSel(el));
      const moved = ordered.filter(isSel);
      return normalizeZ([...kept, ...moved], elements);
    }
    if (op === "back") {
      const kept = ordered.filter((el) => !isSel(el));
      const moved = ordered.filter(isSel);
      return normalizeZ([...moved, ...kept], elements);
    }

    const next = [...ordered];
    if (op === "forward") {
      // Walk from the top so a block of selected elements moves together.
      for (let i = next.length - 2; i >= 0; i -= 1) {
        if (isSel(next[i]) && !isSel(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
    } else {
      // backward — walk from the bottom.
      for (let i = 1; i < next.length; i += 1) {
        if (isSel(next[i]) && !isSel(next[i - 1])) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
    }
    return normalizeZ(next, elements);
  });
}

// ─── Alignment ──────────────────────────────────────────────────────────────

export type AlignAxis = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/**
 * Aligns elements to each other, or to the page when only one is selected.
 *
 * The single-element case aligning to the PAGE is the important detail:
 * "align left" on one element is meaningless relative to itself, and centring
 * a lone title on the page is the single most common thing an organizer wants.
 * With 2+ selected, the bounding box of the selection is the reference — which
 * is what every design tool does and what makes the operation composable.
 */
export function alignElements(
  doc: BrochureDocument,
  pageId: string,
  elementIds: string[],
  axis: AlignAxis,
): BrochureDocument {
  if (elementIds.length === 0) return doc;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return doc;

  const ids = new Set(elementIds);
  const selected = page.elements.filter((el) => ids.has(el.id));
  if (selected.length === 0) return doc;

  const bounds =
    selected.length === 1
      ? { minX: 0, minY: 0, maxX: page.width, maxY: page.height }
      : {
          minX: Math.min(...selected.map((e) => e.x)),
          minY: Math.min(...selected.map((e) => e.y)),
          maxX: Math.max(...selected.map((e) => e.x + e.width)),
          maxY: Math.max(...selected.map((e) => e.y + e.height)),
        };

  return mapPageElements(doc, pageId, (elements) =>
    elements.map((el) => {
      if (!ids.has(el.id)) return el;
      switch (axis) {
        case "left":
          return { ...el, x: bounds.minX };
        case "right":
          return { ...el, x: bounds.maxX - el.width };
        case "hcenter":
          return { ...el, x: bounds.minX + (bounds.maxX - bounds.minX - el.width) / 2 };
        case "top":
          return { ...el, y: bounds.minY };
        case "bottom":
          return { ...el, y: bounds.maxY - el.height };
        case "vcenter":
          return { ...el, y: bounds.minY + (bounds.maxY - bounds.minY - el.height) / 2 };
        default:
          return el;
      }
    }),
  );
}

/**
 * Distributes 3+ elements so the GAPS between them are equal.
 *
 * Equal-gap rather than equal-centre-spacing: with mixed element sizes,
 * equalising centres leaves visually uneven whitespace, which is the thing the
 * organizer is actually trying to fix. The first and last elements stay put
 * and define the span.
 *
 * Fewer than 3 elements is a no-op — there is no interior gap to equalise.
 */
export function distributeElements(
  doc: BrochureDocument,
  pageId: string,
  elementIds: string[],
  direction: "horizontal" | "vertical",
): BrochureDocument {
  if (elementIds.length < 3) return doc;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return doc;

  const ids = new Set(elementIds);
  const selected = page.elements
    .filter((el) => ids.has(el.id))
    .sort((a, b) => (direction === "horizontal" ? a.x - b.x : a.y - b.y));
  if (selected.length < 3) return doc;

  const first = selected[0];
  const last = selected[selected.length - 1];
  const span =
    direction === "horizontal"
      ? last.x + last.width - first.x
      : last.y + last.height - first.y;
  const totalSize = selected.reduce(
    (acc, el) => acc + (direction === "horizontal" ? el.width : el.height),
    0,
  );
  const gap = (span - totalSize) / (selected.length - 1);

  // Walk left-to-right / top-to-bottom laying each element after the previous
  // one plus the computed gap. Endpoints land back on their original values
  // because the span was derived from them.
  const positions = new Map<string, number>();
  let cursor = direction === "horizontal" ? first.x : first.y;
  for (const el of selected) {
    positions.set(el.id, cursor);
    cursor += (direction === "horizontal" ? el.width : el.height) + gap;
  }

  return mapPageElements(doc, pageId, (elements) =>
    elements.map((el) => {
      const pos = positions.get(el.id);
      if (pos === undefined) return el;
      return direction === "horizontal" ? { ...el, x: pos } : { ...el, y: pos };
    }),
  );
}

// ─── Snapping ───────────────────────────────────────────────────────────────

/** A guide line the canvas should draw while dragging. */
export interface SnapGuide {
  orientation: "vertical" | "horizontal";
  /** Position in mm along the perpendicular axis. */
  at: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

/** Default snap tolerance in mm — how close an edge must be to grab. */
export const SNAP_TOLERANCE_MM = 2;

/**
 * Snaps a dragged element's proposed position to nearby edges and centres.
 *
 * Candidate lines are the page edges, the page centre lines, and every edge +
 * centre of every OTHER element on the page. Both axes are resolved
 * independently so an element can snap horizontally without being forced
 * vertically.
 *
 * Returns the adjusted position plus the guides that were engaged, so the
 * canvas can draw exactly the lines that are actually holding — showing a
 * guide that isn't affecting position is worse than showing none.
 *
 * Pure, and independent of zoom: tolerance is in mm, so snapping feels the
 * same whether the organizer is zoomed to fit or inspecting closely.
 *
 * Known limitation: candidate lines come from unrotated `x/y/width/height`, so
 * for a rotated element the guides track its axis-aligned box rather than its
 * visual outline. Computing true rotated bounds would need the corner
 * transform for every candidate on the page on every drag frame, and rotated
 * elements are rare in these templates — so this trades a small inaccuracy in
 * an uncommon case for snapping that stays cheap in the common one.
 */
export function snapPosition(
  page: BrochurePage,
  moving: { id: string; x: number; y: number; width: number; height: number },
  tolerance: number = SNAP_TOLERANCE_MM,
): SnapResult {
  const others = page.elements.filter((el) => el.id !== moving.id);

  const vLines = [0, page.width / 2, page.width];
  const hLines = [0, page.height / 2, page.height];
  for (const el of others) {
    vLines.push(el.x, el.x + el.width / 2, el.x + el.width);
    hLines.push(el.y, el.y + el.height / 2, el.y + el.height);
  }

  // Each edge of the moving box that may latch onto a candidate line, paired
  // with the offset needed to convert a line position into a box origin.
  const vEdges = [
    { value: moving.x, toOrigin: 0 },
    { value: moving.x + moving.width / 2, toOrigin: -moving.width / 2 },
    { value: moving.x + moving.width, toOrigin: -moving.width },
  ];
  const hEdges = [
    { value: moving.y, toOrigin: 0 },
    { value: moving.y + moving.height / 2, toOrigin: -moving.height / 2 },
    { value: moving.y + moving.height, toOrigin: -moving.height },
  ];

  const guides: SnapGuide[] = [];
  let bestX: { x: number; at: number; dist: number } | null = null;
  for (const edge of vEdges) {
    for (const line of vLines) {
      const dist = Math.abs(edge.value - line);
      if (dist <= tolerance && (!bestX || dist < bestX.dist)) {
        bestX = { x: line + edge.toOrigin, at: line, dist };
      }
    }
  }
  let bestY: { y: number; at: number; dist: number } | null = null;
  for (const edge of hEdges) {
    for (const line of hLines) {
      const dist = Math.abs(edge.value - line);
      if (dist <= tolerance && (!bestY || dist < bestY.dist)) {
        bestY = { y: line + edge.toOrigin, at: line, dist };
      }
    }
  }

  if (bestX) guides.push({ orientation: "vertical", at: bestX.at });
  if (bestY) guides.push({ orientation: "horizontal", at: bestY.at });

  return {
    x: bestX ? bestX.x : moving.x,
    y: bestY ? bestY.y : moving.y,
    guides,
  };
}

// ─── Card / multi-element operations ────────────────────────────────────────

/**
 * Moves several elements by the same delta — the "drag a card" primitive.
 *
 * The seeded templates express a card (a pricing tile, an agenda row, a
 * numbered why-sponsor line) as several loose primitives sitting next to each
 * other, because the model has no group type. Selecting them and translating
 * them together is what makes those cards feel like objects, without
 * introducing nesting into the document model — which would have to be
 * threaded through the canvas renderer, the export renderer, the properties
 * panel and every seed builder.
 */
export function translateElements(
  doc: BrochureDocument,
  pageId: string,
  elementIds: string[],
  dx: number,
  dy: number,
): BrochureDocument {
  if (elementIds.length === 0 || (dx === 0 && dy === 0)) return doc;
  const ids = new Set(elementIds);
  return mapPageElements(doc, pageId, (elements) =>
    elements.map((el) => (ids.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el)),
  );
}

/**
 * Duplicates elements, offset slightly so the copy is visibly on top of the
 * original rather than perfectly hidden behind it, and returns the new ids so
 * the caller can select the copy (which is what makes duplicate-then-drag feel
 * right).
 */
export function duplicateElements(
  doc: BrochureDocument,
  pageId: string,
  elementIds: string[],
  offsetMm = 4,
): { doc: BrochureDocument; newIds: string[] } {
  if (elementIds.length === 0) return { doc, newIds: [] };
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return { doc, newIds: [] };

  const ids = new Set(elementIds);
  const copies: BrochureElement[] = [];
  for (const el of sortedByZ(page.elements)) {
    if (!ids.has(el.id)) continue;
    copies.push({
      ...el,
      id: generateId(el.kind),
      x: el.x + offsetMm,
      y: el.y + offsetMm,
    } as BrochureElement);
  }
  if (copies.length === 0) return { doc, newIds: [] };

  const next = mapPageElements(doc, pageId, (elements) =>
    normalizeZ([...sortedByZ(elements), ...copies]),
  );
  return { doc: next, newIds: copies.map((c) => c.id) };
}

/**
 * Bounding box of a set of elements, or null when none match.
 *
 * Used by the editor toolbar to report the selection's size in mm. That
 * readout matters in a print layout tool: the canvas is scaled to fit the
 * viewport, so on-screen pixels tell the organizer nothing about how large
 * something will actually be on the page.
 */
export function selectionBounds(
  page: BrochurePage,
  elementIds: string[],
): { x: number; y: number; width: number; height: number } | null {
  const ids = new Set(elementIds);
  const selected = page.elements.filter((el) => ids.has(el.id));
  if (selected.length === 0) return null;
  const minX = Math.min(...selected.map((e) => e.x));
  const minY = Math.min(...selected.map((e) => e.y));
  const maxX = Math.max(...selected.map((e) => e.x + e.width));
  const maxY = Math.max(...selected.map((e) => e.y + e.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
