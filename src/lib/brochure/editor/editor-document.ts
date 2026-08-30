/**
 * Brochure_Document — the serializable data model for the WYSIWYG editor.
 *
 * Everything in the editor's world is a plain JS object with no class
 * instances, no functions, and no runtime-only references. That's what
 * lets the whole document round-trip through `JSON.stringify` and
 * `JSON.parse` for persistence to Supabase, sending across the wire,
 * and loading back into React state on a fresh dialog open. See
 * `roundTripDocument()` at the bottom of this file for the validating
 * roundtrip helper — it's the source of truth for what "serializable"
 * means here.
 *
 * The imperative canvas engine (`BrochureEditorCanvas.tsx`) reads this
 * document tree and translates it to react-konva nodes. Mutations are
 * applied via the pure helper functions in this file, never by
 * modifying the document in place — every helper returns a new
 * document object, mirroring the pattern established by
 * `saveBrochurePrefs` in `brochure-templates.ts`.
 */

// ─── Shared geometry ─────────────────────────────────────────────────────────

/** Position + size in millimetres. Every element's geometry is stored
 *  in mm so the same document renders identically on an A4 page whether
 *  the editor is drawing at 96 DPI or the PDF exporter at 300 DPI. */
export interface Geometry {
  /** X of the top-left corner, mm. */
  x: number;
  /** Y of the top-left corner, mm. */
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees, clockwise. Rotation pivot is the element's
   *  centre. `0` means no rotation. */
  rotation: number;
  /** `0` (invisible) → `1` (fully opaque). */
  opacity: number;
  /** Z-order within the parent page. Higher = drawn later. Duplicates
   *  are permitted and resolved by array index in `Brochure_Page.elements`. */
  zIndex: number;
  /**
   * Card membership tag. Elements sharing a `groupId` are selected, moved and
   * resized as one unit.
   *
   * A flat tag rather than a nested `group` element kind, deliberately. The
   * templates express a card (a speaker tile, a pricing card, an agenda row) as
   * several loose primitives — a background rect, a photo, a name, a job title.
   * Clicking one of those selected only that primitive, so "resize the card"
   * resized the backing rectangle and left the photo and text behind.
   *
   * Nesting would fix that too, but it would have to be threaded through the
   * canvas renderer, the PDF exporter, the properties panel, z-order handling
   * and every seed builder. A tag needs none of that: both renderers ignore the
   * field entirely and keep drawing a flat list, while selection expands from
   * one member to all of them. Undefined means "not part of a card".
   */
  groupId?: string;
  /** Drop shadow. Absent means no shadow, which is the default for everything
   *  the seed builds. */
  shadow?: ElementShadow;
  /** Locked elements can't be selected, dragged or resized on the canvas. The
   *  intended use is a full-bleed background panel that would otherwise be
   *  grabbed on every stray click. Still editable via the layers list. */
  locked?: boolean;
  /** Hidden elements are skipped by BOTH renderers, so they disappear from the
   *  canvas AND the exported PDF. That symmetry is the point — `opacity: 0` was
   *  the only previous approximation and it still rasterised into the file. */
  hidden?: boolean;
}

/**
 * Drop shadow, shared by every element kind.
 *
 * Distances are in millimetres like all other geometry, so a shadow keeps its
 * proportions between the 110 DPI preview and the 300 DPI export instead of
 * being a fixed pixel offset that looks correct at exactly one resolution.
 */
export interface ElementShadow {
  color: string;
  /** Blur radius, mm. */
  blur: number;
  /** Offset, mm. Positive x is right, positive y is down. */
  offsetX: number;
  offsetY: number;
  /** `0` → `1`. Multiplies with the element's own `opacity`. */
  opacity: number;
}

/** Stroke dash style for shapes. Concrete presets rather than a raw dash array:
 *  the array's units would have to be mm and scaled per renderer, and three
 *  named options cover what a brochure actually needs. */
export type StrokeDash = "solid" | "dashed" | "dotted";

/** Two-stop linear gradient fill for shapes. */
export interface ShapeGradient {
  from: string;
  to: string;
  direction: "vertical" | "horizontal" | "diagonal";
}

// ─── Element types ───────────────────────────────────────────────────────────

/** Text element — a rich-text run with a single font/color/size. Multi-
 *  paragraph text is supported via `\n` in `content`; the canvas engine
 *  wraps within the element's `width`. */
export interface TextElement extends Geometry {
  id: string;
  kind: "text";
  content: string;
  fontFamily: string;
  fontSize: number; // pt
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  color: string; // hex
  align: "left" | "center" | "right";
  lineHeight: number; // multiplier, e.g. 1.2
  /** Extra tracking between glyphs, in points. Negative tightens. */
  letterSpacing?: number;
  /** Applied at render time, leaving `content` as typed — so switching back to
   *  `none` restores the original casing instead of having destroyed it. */
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  /** Where the text sits within its box. Defaults to `top`, which is what both
   *  renderers did unconditionally before this existed. */
  verticalAlign?: "top" | "middle" | "bottom";
  /** Outline drawn around the glyphs. `strokeWidth` is in mm. */
  strokeColor?: string;
  strokeWidth?: number;
}

/** Image element — a bitmap loaded from a URL. */
export interface ImageElement extends Geometry {
  id: string;
  kind: "image";
  /** Source URL. If it fails to load, the canvas renders a placeholder. */
  src: string;
  /** How the image fits its geometry box. `cover` fills the box and
   *  crops overflow; `contain` fits inside with letterboxing; `fill`
   *  stretches without preserving aspect ratio. */
  fit: "cover" | "contain" | "fill";
  /** Corner radius in mm. `0` = square. */
  cornerRadius: number;
  /**
   * Crop focal point, 0 → 1 on each axis. Chooses which part of the image
   * survives when `fit: "cover"` crops the overflow: `0` keeps the left/top
   * edge, `1` the right/bottom, `0.5` centres.
   *
   * Optional, defaulting to centre, so every document saved before cropping
   * existed keeps rendering exactly as it did. A focal point rather than a
   * pixel crop rect because the element box is resized by dragging and a
   * pixel rect would have to be recomputed on every resize — see
   * `computeImageDrawBox` in `editor-units.ts`, which is the single
   * implementation shared by the canvas and the PDF exporter.
   */
  focalX?: number;
  focalY?: number;
  /** Extra scale on top of the fit scale, `>= 1`. Default `1`. Lets the
   *  organizer push further into the image than `cover` alone allows. */
  zoom?: number;
  /**
   * Mirror the bitmap within its box.
   *
   * Applied to the image INSIDE the element rather than to the element's own
   * transform. Flipping via the Konva Transformer would mean storing a negative
   * scale, and `handleTransformEnd` deliberately takes the absolute value of
   * scale so that dragging a handle past the opposite edge resizes rather than
   * silently collapsing the element. Keeping flip as its own field avoids
   * fighting that.
   */
  flipH?: boolean;
  flipV?: boolean;
}

/** Vector shape element — rect or ellipse for now, more later. */
export interface ShapeElement extends Geometry {
  id: string;
  kind: "shape";
  shape: "rect" | "ellipse";
  fill: string; // hex or transparent
  stroke: string; // hex
  strokeWidth: number; // mm
  cornerRadius: number; // mm, applied only to rects
  /** When present, takes precedence over the flat `fill`. `fill` is retained
   *  underneath so removing the gradient restores the previous solid colour. */
  fillGradient?: ShapeGradient;
  /** Defaults to `solid`. */
  dash?: StrokeDash;
}

/** Pill element — a rounded capsule with centered text. Composed
 *  primitive (background + text) that would otherwise take two
 *  elements to express; kept as a single element for editing
 *  convenience. */
export interface PillElement extends Geometry {
  id: string;
  kind: "pill";
  text: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  fillColor: string;
  strokeColor: string; // "transparent" for no stroke
  strokeWidth: number;
  /** Defaults to `normal`. */
  fontWeight?: "normal" | "bold";
  /** Extra tracking between glyphs, in points. */
  letterSpacing?: number;
}

/** The full element union. Add new element kinds by extending this
 *  union and updating the canvas renderer / properties panel. */
export type BrochureElement = TextElement | ImageElement | ShapeElement | PillElement;

// ─── Page + document ────────────────────────────────────────────────────────

/** Page background — solid color, vertical gradient, or a full-bleed
 *  image. Never null; a plain white page has `type: "solid"` with
 *  `color: "#ffffff"`. */
export type PageBackground =
  | { type: "solid"; color: string }
  | { type: "gradient"; top: string; bottom: string }
  | { type: "image"; src: string; fit: "cover" | "contain" };

/** One page in a Brochure_Document. Page dimensions are in mm; A4
 *  portrait is 210 × 297. */
export interface BrochurePage {
  id: string;
  width: number;
  height: number;
  background: PageBackground;
  elements: BrochureElement[];
}

/** The full document. */
export interface BrochureDocument {
  id: string;
  title: string;
  pages: BrochurePage[];
  createdAt: string;
  updatedAt: string;
  /**
   * Stamped with `EDITOR_SEED_VERSION` (`editor-templates.ts`) whenever
   * this document is produced by `seedBrochureDocument`. Absent on a
   * hand-built document (there is none today, but the field stays
   * optional for forward-compatibility) and, importantly, absent on
   * every document saved before this field was introduced.
   *
   * `BrochureEditorDialog` uses this to detect a stale saved document —
   * one generated by an OLDER version of the seed than what's running
   * now — and silently re-seed instead of showing content that no
   * longer matches the live jsPDF preview. See `EDITOR_SEED_VERSION`'s
   * doc comment for the full rationale.
   */
  templateVersion?: number;
}

// ─── ID generation ──────────────────────────────────────────────────────────

/** Generates a short random id suitable for element / page keys. Uses
 *  `crypto.randomUUID` when available (all modern browsers + Node 19+),
 *  otherwise falls back to a Math.random-based id. */
export function generateId(prefix = "el"): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().split("-")[0]
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

// ─── Document constructors ──────────────────────────────────────────────────

/** A4 portrait page in mm. */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** Default zero-state document — one empty white A4 page. Used as the
 *  seed for "new brochure" when no template is picked. */
export function newDocument(title = "Untitled Brochure"): BrochureDocument {
  const now = new Date().toISOString();
  return {
    id: generateId("doc"),
    title,
    pages: [newPage()],
    createdAt: now,
    updatedAt: now,
  };
}

/** New blank page — white A4 with no elements. */
export function newPage(): BrochurePage {
  return {
    id: generateId("page"),
    width: A4_WIDTH_MM,
    height: A4_HEIGHT_MM,
    background: { type: "solid", color: "#ffffff" },
    elements: [],
  };
}

// ─── Element constructors ──────────────────────────────────────────────────

interface GeometrySeed {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
}

/** Baseline geometry defaults applied to every new element. */
function withGeometry(seed: GeometrySeed): Geometry {
  return {
    x: seed.x,
    y: seed.y,
    width: seed.width,
    height: seed.height,
    rotation: seed.rotation ?? 0,
    opacity: seed.opacity ?? 1,
    zIndex: seed.zIndex ?? 0,
  };
}

export function newTextElement(seed: GeometrySeed & Partial<Omit<TextElement, keyof Geometry | "id" | "kind">>): TextElement {
  return {
    ...withGeometry(seed),
    id: generateId("text"),
    kind: "text",
    content: seed.content ?? "Text",
    fontFamily: seed.fontFamily ?? "Poppins",
    fontSize: seed.fontSize ?? 16,
    fontWeight: seed.fontWeight ?? "normal",
    fontStyle: seed.fontStyle ?? "normal",
    color: seed.color ?? "#000000",
    align: seed.align ?? "left",
    lineHeight: seed.lineHeight ?? 1.2,
  };
}

export function newImageElement(seed: GeometrySeed & Partial<Omit<ImageElement, keyof Geometry | "id" | "kind">>): ImageElement {
  return {
    ...withGeometry(seed),
    id: generateId("img"),
    kind: "image",
    src: seed.src ?? "",
    fit: seed.fit ?? "cover",
    cornerRadius: seed.cornerRadius ?? 0,
  };
}

export function newShapeElement(seed: GeometrySeed & Partial<Omit<ShapeElement, keyof Geometry | "id" | "kind">>): ShapeElement {
  return {
    ...withGeometry(seed),
    id: generateId("shape"),
    kind: "shape",
    shape: seed.shape ?? "rect",
    fill: seed.fill ?? "#e5e7eb",
    stroke: seed.stroke ?? "transparent",
    strokeWidth: seed.strokeWidth ?? 0,
    cornerRadius: seed.cornerRadius ?? 0,
  };
}

export function newPillElement(seed: GeometrySeed & Partial<Omit<PillElement, keyof Geometry | "id" | "kind">>): PillElement {
  return {
    ...withGeometry(seed),
    id: generateId("pill"),
    kind: "pill",
    text: seed.text ?? "Pill",
    fontFamily: seed.fontFamily ?? "Poppins",
    fontSize: seed.fontSize ?? 10,
    textColor: seed.textColor ?? "#000000",
    fillColor: seed.fillColor ?? "#ffffff",
    strokeColor: seed.strokeColor ?? "transparent",
    strokeWidth: seed.strokeWidth ?? 0,
  };
}

// ─── Pure mutation helpers ─────────────────────────────────────────────────

/** Returns a new document with the given page's elements replaced by
 *  `nextElements`. Pure — the input document is never mutated. */
export function replacePageElements(
  doc: BrochureDocument,
  pageId: string,
  nextElements: BrochureElement[]
): BrochureDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, elements: nextElements } : p)),
    updatedAt: new Date().toISOString(),
  };
}

/** Returns a new document with the given element replaced by
 *  `patch`-merged version. If the element doesn't exist, the document
 *  is returned unchanged. Pure. */
export function updateElement(
  doc: BrochureDocument,
  pageId: string,
  elementId: string,
  patch: Partial<BrochureElement>
): BrochureDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      if (p.id !== pageId) return p;
      let mutated = false;
      const nextElements = p.elements.map((el) => {
        if (el.id !== elementId) return el;
        mutated = true;
        // Cast the merge to any-of-union then back to BrochureElement so
        // TS doesn't try to prove the merge is safe across the discriminated
        // union — callers are responsible for only patching fields that
        // exist on the element's `kind`.
        return { ...el, ...(patch as unknown as Partial<typeof el>) } as BrochureElement;
      });
      if (!mutated) return p;
      return { ...p, elements: nextElements };
    }),
    updatedAt: new Date().toISOString(),
  };
}

/** Returns a new document with an element added to the given page.
 *  The element's `zIndex` is set to the highest existing z-index on the
 *  page + 1 so the new element renders on top. Pure. */
export function addElement(
  doc: BrochureDocument,
  pageId: string,
  element: BrochureElement
): BrochureDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      if (p.id !== pageId) return p;
      const maxZ = p.elements.reduce((acc, el) => Math.max(acc, el.zIndex), -1);
      return { ...p, elements: [...p.elements, { ...element, zIndex: maxZ + 1 }] };
    }),
    updatedAt: new Date().toISOString(),
  };
}

/** Returns a new document with the given element removed from its page.
 *  Pure. */
export function removeElement(
  doc: BrochureDocument,
  pageId: string,
  elementId: string
): BrochureDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === pageId ? { ...p, elements: p.elements.filter((el) => el.id !== elementId) } : p
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Returns a new document with a page added. Pure. */
export function addPage(doc: BrochureDocument, page: BrochurePage = newPage()): BrochureDocument {
  return {
    ...doc,
    pages: [...doc.pages, page],
    updatedAt: new Date().toISOString(),
  };
}

/** Returns a new document with the given page removed. If removing
 *  would leave zero pages, a fresh blank page is inserted instead —
 *  the invariant "every document has at least one page" is preserved.
 *  Pure. */
export function removePage(doc: BrochureDocument, pageId: string): BrochureDocument {
  const filtered = doc.pages.filter((p) => p.id !== pageId);
  return {
    ...doc,
    pages: filtered.length > 0 ? filtered : [newPage()],
    updatedAt: new Date().toISOString(),
  };
}

// ─── Serialization ─────────────────────────────────────────────────────────

/**
 * Round-trips a document through JSON serialization and returns the
 * parsed copy. Used at persistence boundaries to guarantee the
 * document contains no non-serializable values (functions, class
 * instances, circular refs, `undefined` in array slots). Also serves
 * as the property-test oracle for Property 60 (see the editor's test
 * file).
 */
export function roundTripDocument(doc: BrochureDocument): BrochureDocument {
  return JSON.parse(JSON.stringify(doc)) as BrochureDocument;
}

/** Returns the element with the given id from the given page, or
 *  `null` when either the page or the element doesn't exist. Pure. */
export function findElement(
  doc: BrochureDocument,
  pageId: string,
  elementId: string
): BrochureElement | null {
  const page = doc.pages.find((p) => p.id === pageId);
  return page?.elements.find((el) => el.id === elementId) ?? null;
}

/**
 * Pure helper: collects every unique `fontFamily` used by any `text` or
 * `pill` element across every page of `doc`. Mirrors
 * `creative-renderer.ts`'s `collectUniqueFontPairs` split — a pure
 * predicate over the document tree, kept separate from the DOM-touching
 * `ensureFontLoaded` wrapper so it stays trivially testable.
 *
 * `BrochureEditorCanvas` calls this on every document change and feeds
 * the result to `ensureFontLoaded` — this is what makes a freshly-seeded
 * document (whose text elements reference the resolved theme font, e.g.
 * "Playfair Display") actually request that Google Fonts family instead
 * of silently rendering in the browser's fallback sans-serif until the
 * organizer happens to open the font dropdown.
 */
export function collectDocumentFontFamilies(doc: BrochureDocument): string[] {
  const seen = new Set<string>();
  for (const page of doc.pages) {
    for (const el of page.elements) {
      if (el.kind === "text" || el.kind === "pill") {
        seen.add(el.fontFamily);
      }
    }
  }
  return Array.from(seen);
}
