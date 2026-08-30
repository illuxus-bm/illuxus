/**
 * BrochureEditorCanvas — the imperative Konva rendering + interaction
 * layer for the brochure editor.
 *
 * Given a Brochure_Document and an active page id, this component
 * renders the page background + every element on it inside a
 * `react-konva` `<Stage>`. It handles the three Phase 1 interactions:
 * selection (click to select, click background to deselect), drag
 * (drag element to move), and resize/rotate (Konva's built-in
 * `<Transformer>` on the selected node).
 *
 * All coordinate math is in document millimetres — this component
 * converts to/from pixels internally via `editor-units.ts` so
 * `Brochure_Document` on Supabase always reads back with the same
 * geometry regardless of the viewport size at edit time.
 *
 * This is intentionally NOT a full editor UI. The centre canvas alone;
 * the properties panel + element palette + page thumbnails live in
 * later phases and mount around this in `BrochureEditorDialog`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Ellipse, Line, Text, Image, Transformer } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import { Maximize2, Minus, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  computeImageDrawBox,
  mmToPx,
  ptToMm,
  fitPageToViewport,
  SCREEN_DPI,
} from "./editor-units";
import { ensureFontLoaded, onFontLoaded } from "./editor-fonts";
import {
  collectDocumentFontFamilies,
  updateElement,
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
  type ImageElement,
  type PageBackground,
  type PillElement,
  type ShapeElement,
  type TextElement,
} from "./editor-document";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_PRESETS,
  expandSelectionToGroups,
  snapPosition,
  type SnapGuide,
} from "./editor-operations";
import {
  dashArray,
  fontStyleString,
  mirrorProps,
  shadowProps,
  shapeFillProps,
  textExtras,
  transformedText,
} from "./editor-render-props";

interface Props {
  document: BrochureDocument;
  onChange: (doc: BrochureDocument) => void;
  /** Active page id. Only this page is rendered — page thumbnails +
   *  navigation are the parent component's responsibility. */
  activePageId: string;
  /**
   * Currently-selected element ids. An array rather than a single id
   * because a "card" in the seeded templates is several loose primitives
   * (background rect + heading + body text), and the organizer has to be
   * able to grab all of them at once to move or resize the card as a unit.
   * Empty means nothing is selected. Owned by the parent so the properties
   * panel and the toolbar can react to selection changes.
   */
  selectedElementIds: string[];
  onSelect: (elementIds: string[]) => void;
}

export default function BrochureEditorCanvas({
  document: doc,
  onChange,
  activePageId,
  selectedElementIds,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  /**
   * Live Konva node handles keyed by element id.
   *
   * Needed because a multi-node `<Transformer>` is attached imperatively via
   * `.nodes([...])`, and because dragging one member of a multi-selection has
   * to move its siblings within the same frame — both require reaching the
   * actual Konva nodes, which React refs on child components can't provide
   * from the parent.
   */
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const transformerRef = useRef<Konva.Transformer | null>(null);

  /** Guides currently holding the dragged element, in mm. */
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  /**
   * The in-flight drag gesture, or `null` when nothing is being dragged.
   *
   * This exists because ONE user drag produces MANY Konva drag events. Konva's
   * `Transformer` proxies drag across every attached node: on the first
   * `dragmove` it shifts the other attached nodes by the same delta and calls
   * `startDrag()` on them, which makes them genuine drag participants that
   * then emit their own `dragstart` / `dragmove` / `dragend`.
   *
   * So the gesture has to be claimed once and ignored on re-entry, and it must
   * be committed exactly once — otherwise each sibling's `dragend` commits
   * against the same stale `doc` captured in this render's closure and only the
   * last write survives, leaving the other elements moved on the canvas but
   * unmoved in the document.
   */
  const dragStartRef = useRef<{
    /** The element the user actually grabbed. */
    initiatorId: string;
    /** Every element Konva will move for this gesture. */
    ids: string[];
    /** Starting positions in canvas px, used to detect a no-op drag. */
    from: Map<string, { x: number; y: number }>;
  } | null>(null);

  /** In-progress rubber-band selection, in canvas px. */
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  /** The scrolling viewport that pans the page once it's larger than the pane. */
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * Id of the text/pill element being edited directly on the canvas, or `null`.
   *
   * Editing happens in a real `<textarea>` overlaid on the element rather than
   * inside Konva, because canvas has no text input: no caret, no selection, no
   * IME, no spellcheck, no accessibility. Overlaying the browser's own control
   * gets all of that for free, and it's the same approach Konva's own
   * documentation recommends.
   */
  const [editingId, setEditingId] = useState<string | null>(null);

  // Request every font family actually used by this document. Konva
  // does NOT repaint canvas text on its own when a web font finishes
  // loading mid-session (unlike DOM text, which the browser updates
  // automatically) — see Konva's own docs on custom fonts. Without this
  // effect, a freshly-seeded document (whose text elements reference
  // the resolved theme font, e.g. "Playfair Display") would silently
  // render in the browser's fallback sans-serif until the organizer
  // happened to open the font dropdown in the properties panel, which
  // is what made the canvas look visually wrong/inconsistent on first
  // open. `onFontLoaded` below forces a stage redraw once each family
  // actually finishes loading so the swap is visible without a manual
  // interaction.
  useEffect(() => {
    const families = collectDocumentFontFamilies(doc);
    for (const family of families) {
      void ensureFontLoaded(family);
    }
  }, [doc]);

  useEffect(() => {
    return onFontLoaded(() => {
      stageRef.current?.batchDraw();
    });
  }, []);

  // Observe the container size so the page auto-fits when the dialog
  // resizes (e.g. on window resize or when the properties panel opens
  // in a later phase and reduces the centre pane width).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setViewport({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = useMemo(() => doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0], [doc, activePageId]);

  const fit = useMemo(
    () => fitPageToViewport(page.width, page.height, viewport.w, viewport.h),
    [page.width, page.height, viewport.w, viewport.h]
  );

  /**
   * User zoom, or `null` for "fit to pane".
   *
   * `null` rather than storing the computed fit number, so fit STAYS fit when
   * the dialog is resized or the page size changes — freezing the number at the
   * moment fit was chosen would silently stop being a fit.
   *
   * `1` means 100%: one document millimetre drawn at `SCREEN_DPI`. That is the
   * conventional meaning of 100% for print work, and it's the only definition
   * available to us — real physical size would need the display's true DPI,
   * which the browser doesn't expose.
   */
  const [zoom, setZoom] = useState<number | null>(null);
  const effectiveScale = zoom ?? fit.scale;

  // The Konva stage renders at `1x` DPI internally but the page's
  // pixel dimensions come from `mmToPx(mm, SCREEN_DPI) × scale`. This
  // one factor is applied everywhere geometry converts to canvas
  // pixels, so changing it is all that zooming requires — no document
  // mm value is touched, and snapping stays in mm and therefore feels
  // identical at every zoom level.
  const scalePxPerMm = mmToPx(1, SCREEN_DPI) * effectiveScale;

  const stageW = mmToPx(page.width, SCREEN_DPI) * effectiveScale;
  const stageH = mmToPx(page.height, SCREEN_DPI) * effectiveScale;

  // ─── Zoom ─────────────────────────────────────────────────────────────────

  /**
   * Applies a new zoom while keeping a fixed point in the page stationary under
   * the cursor.
   *
   * Anchoring is what separates usable zoom from infuriating zoom: without it,
   * zooming in on a footer throws the footer off-screen and you have to hunt for
   * it with the scrollbars every step.
   *
   * `anchor` is in viewport pixels relative to the scroll container. Omitted
   * means "keep the centre of the visible area" — the right behaviour for the
   * toolbar buttons and keyboard shortcuts, which have no cursor position.
   */
  const applyZoom = useCallback(
    (nextZoom: number, anchor?: { x: number; y: number }) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const el = scrollRef.current;
      if (!el) {
        setZoom(clamped);
        return;
      }

      const ratio = clamped / effectiveScale;
      const ax = anchor ? anchor.x : el.clientWidth / 2;
      const ay = anchor ? anchor.y : el.clientHeight / 2;

      // Document-space offset of the anchor before the change, scaled by the
      // zoom ratio, gives where it lands after — the difference is how far the
      // scroll position has to move to hold it still.
      const nextLeft = (el.scrollLeft + ax) * ratio - ax;
      const nextTop = (el.scrollTop + ay) * ratio - ay;

      setZoom(clamped);
      // After React has resized the stage. A layout effect would still run
      // before the browser recomputes scrollWidth, so the assignment would be
      // clamped to the OLD scrollable extent and the anchor would drift.
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollLeft = nextLeft;
        node.scrollTop = nextTop;
      });
    },
    [effectiveScale],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) =>
      applyZoom(effectiveScale * factor, anchor),
    [applyZoom, effectiveScale],
  );

  /** The element currently open for in-place editing, if it still exists. */
  const editingElement = useMemo(() => {
    if (!editingId) return null;
    const found = page.elements.find((el) => el.id === editingId);
    return found && (found.kind === "text" || found.kind === "pill") ? found : null;
  }, [editingId, page.elements]);

  // Dropping the active page or deleting the element mid-edit would otherwise
  // leave the editor open over nothing.
  useEffect(() => {
    if (editingId && !editingElement) setEditingId(null);
  }, [editingId, editingElement]);

  /**
   * Ctrl/Cmd + wheel zooms; a plain wheel scrolls the pane normally.
   *
   * Registered natively with `passive: false` because React's onWheel is
   * attached as a passive listener, where `preventDefault()` is ignored — the
   * browser would zoom the whole application UI instead of the canvas.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Exponential so each notch is a constant proportional step, which is what
      // makes zoom feel linear across the whole range.
      zoomBy(Math.exp(-e.deltaY * 0.002), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  /**
   * Zoom keyboard shortcuts, owned here rather than in the dialog's shortcut
   * chain so zoom state stays local to the viewport that it describes.
   *
   * `preventDefault` is mandatory: `Cmd+-` / `Cmd+=` / `Cmd+0` are the browser's
   * own page-zoom bindings, and without this they would scale the entire
   * application chrome instead of the canvas.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const target = e.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping) return;

      // `e.code` for the bracket-style keys: `e.key` reports the shifted
      // character, so `Cmd+Shift+=` (a common way to press "+") wouldn't match.
      if (e.code === "Equal" || e.key === "+") {
        e.preventDefault();
        zoomBy(1.25);
      } else if (e.code === "Minus" || e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.25);
      } else if (e.code === "Digit0") {
        e.preventDefault();
        setZoom(null);
      } else if (e.code === "Digit1") {
        e.preventDefault();
        applyZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyZoom, zoomBy]);

  // ─── Selection ────────────────────────────────────────────────────────────

  /**
   * Click-to-select, shift/cmd-click to toggle membership.
   *
   * Toggle rather than add-only so the organizer can back out of an
   * over-wide marquee without starting the selection over.
   */
  /**
   * Stable registry callback. Stable matters: React re-invokes a ref callback
   * (once with `null`, once with the node) whenever its identity changes, so an
   * inline closure here would thrash the map on every re-render — including the
   * many re-renders that happen while dragging as snap guides update.
   */
  const registerNode = useCallback((elementId: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(elementId, node);
    else nodeRefs.current.delete(elementId);
  }, []);

  const handleSelect = useCallback(
    (elementId: string, additive: boolean, isolate: boolean) => {
      // `isolate` (Alt/Option-click) reaches a single element INSIDE a card.
      // Without it, a grouped element could never be edited on its own — you
      // could never retype one speaker's job title, because every click would
      // grab the whole tile.
      const grow = (ids: string[]) =>
        isolate ? ids : expandSelectionToGroups(page, ids);

      if (!additive) {
        onSelect(grow([elementId]));
        return;
      }
      // Toggling a card removes all of its members, not just the one clicked.
      const clickedGroup = grow([elementId]);
      const alreadyIn = clickedGroup.every((id) => selectedElementIds.includes(id));
      onSelect(
        alreadyIn
          ? selectedElementIds.filter((id) => !clickedGroup.includes(id))
          : Array.from(new Set([...selectedElementIds, ...clickedGroup])),
      );
    },
    [onSelect, page, selectedElementIds],
  );

  // Re-bind the shared Transformer whenever the selection changes, or when the
  // document changes (a re-render can replace the underlying Konva nodes, and
  // a Transformer holding a detached node draws handles that do nothing).
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedElementIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedElementIds, doc, activePageId]);

  // ─── Drag (with snapping, selection-wide) ─────────────────────────────────

  const handleDragStart = useCallback(
    (elementId: string) => {
      // Re-entrant: Konva's drag proxy calls startDrag() on the other selected
      // nodes, so this fires once per moving element. Only the first call —
      // from the element the user actually grabbed — defines the gesture.
      if (dragStartRef.current) return;

      // Dragging something outside the current selection replaces it — and if
      // that something belongs to a card, the whole card comes along.
      //
      // This matters for the click-and-drag-in-one-motion case: Konva fires
      // `dragstart` BEFORE `click`, so the card isn't selected yet and the
      // Transformer is still attached to whatever was selected before. Konva
      // therefore won't proxy this gesture to the card's other members, and
      // `handleDragEnd` compensates by applying the initiator's delta to any
      // element that didn't move on its own.
      const ids = selectedElementIds.includes(elementId)
        ? selectedElementIds
        : expandSelectionToGroups(page, [elementId]);
      if (!selectedElementIds.includes(elementId)) onSelect(ids);

      const from = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const node = nodeRefs.current.get(id);
        if (node) from.set(id, { x: node.x(), y: node.y() });
      }
      dragStartRef.current = { initiatorId: elementId, ids, from };
    },
    [onSelect, page, selectedElementIds],
  );

  const handleDragMove = useCallback(
    (elementId: string) => {
      const gesture = dragStartRef.current;
      if (!gesture || elementId !== gesture.initiatorId) return;

      // Snapping is deliberately limited to single-element drags.
      //
      // Konva's drag proxy hands each node in a multi-selection its own pointer
      // offset, captured once on the first frame, and then moves each one
      // independently for the rest of the gesture. Nudging only the initiator to
      // a snap line would therefore pull the group apart. Correcting every node
      // every frame means re-implementing group drag alongside the one Konva is
      // already running — more machinery than a snap is worth. The group still
      // moves rigidly; it just doesn't latch onto guides.
      if (gesture.ids.length !== 1) return;

      const node = nodeRefs.current.get(elementId);
      const element = page.elements.find((el) => el.id === elementId);
      if (!node || !element) return;

      // Snap in millimetre space so the tolerance feels identical at every
      // zoom level, then write the result back to the node in px.
      const snapped = snapPosition(page, {
        id: elementId,
        x: node.x() / scalePxPerMm,
        y: node.y() / scalePxPerMm,
        width: element.width,
        height: element.height,
      });
      node.x(snapped.x * scalePxPerMm);
      node.y(snapped.y * scalePxPerMm);
      setSnapGuides(snapped.guides);
    },
    [page, scalePxPerMm],
  );

  const handleDragEnd = useCallback(() => {
    const gesture = dragStartRef.current;
    // A sibling's dragend arriving after the gesture was already committed.
    if (!gesture) return;
    // Claim it immediately so the remaining dragend events are no-ops.
    dragStartRef.current = null;
    setSnapGuides([]);

    // How far the grabbed element actually travelled. Used below to carry any
    // card member that Konva didn't move on its own.
    const initiatorNode = nodeRefs.current.get(gesture.initiatorId);
    const initiatorFrom = gesture.from.get(gesture.initiatorId);
    const dx = initiatorNode && initiatorFrom ? initiatorNode.x() - initiatorFrom.x : 0;
    const dy = initiatorNode && initiatorFrom ? initiatorNode.y() - initiatorFrom.y : 0;

    // A click registers as a zero-distance drag; committing it would push an
    // undo entry for doing nothing.
    const isStationary = (px: number, py: number) =>
      Math.abs(px) < 0.01 && Math.abs(py) < 0.01;
    if (isStationary(dx, dy)) return;

    // Read each node's FINAL position rather than applying one delta. Konva may
    // have moved these nodes itself via the Transformer's drag proxy, so reading
    // back makes the commit independent of how they got there — and it produces
    // exactly one document update, hence one undo entry, per user gesture.
    let next = doc;
    for (const id of gesture.ids) {
      const node = nodeRefs.current.get(id);
      const from = gesture.from.get(id);
      if (!node || !from) continue;

      const nodeDx = node.x() - from.x;
      const nodeDy = node.y() - from.y;

      // A card member that never moved means Konva didn't proxy to it — the
      // Transformer wasn't attached to it yet when the drag began (click and
      // drag in one motion). Apply the initiator's delta so the card stays
      // together instead of shedding the piece that was grabbed.
      const useInitiatorDelta = id !== gesture.initiatorId && isStationary(nodeDx, nodeDy);
      const finalX = useInitiatorDelta ? from.x + dx : node.x();
      const finalY = useInitiatorDelta ? from.y + dy : node.y();

      next = updateElement(next, page.id, id, {
        x: finalX / scalePxPerMm,
        y: finalY / scalePxPerMm,
      });
    }
    onChange(next);
  }, [doc, onChange, page.id, scalePxPerMm]);

  // ─── Transform (resize / rotate, selection-wide) ──────────────────────────

  /**
   * Bakes Konva's transient node scale into the document's mm width/height for
   * every selected node.
   *
   * Konva scales each attached node independently, so this reads them all back
   * rather than deriving one factor — that's what lets a multi-element card be
   * resized by one drag of the shared bounding box.
   */
  const handleTransformEnd = useCallback(() => {
    let next = doc;
    for (const id of selectedElementIds) {
      const node = nodeRefs.current.get(id);
      const element = page.elements.find((el) => el.id === id);
      if (!node || !element) continue;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // Reset the transient scale so subsequent transforms compose from 1.
      node.scaleX(1);
      node.scaleY(1);
      // Konva writes skew too when it decomposes a group resize that contains a
      // rotated element. `BrochureElement` has no skew field, so leaving it on
      // the node would show a skew on the canvas that neither the document nor
      // the PDF export knows about.
      node.skewX(0);
      node.skewY(0);

      const absX = Math.abs(scaleX);
      const absY = Math.abs(scaleY);

      const geometry = {
        x: node.x() / scalePxPerMm,
        y: node.y() / scalePxPerMm,
        // Absolute value, because dragging an anchor past the opposite edge
        // gives a NEGATIVE scale. Without this the element collapses to the 1mm
        // floor instead of resizing, which reads as the element vanishing.
        width: Math.max(1, element.width * absX),
        height: Math.max(1, element.height * absY),
        rotation: node.rotation(),
      };

      // Type size follows a PROPORTIONAL resize (both axes changing, i.e. a
      // corner drag or any group resize) but not a single-axis one, which is the
      // convention every design tool uses: dragging a side re-wraps the text,
      // dragging a corner scales it. Without this, resizing a card grew the box
      // and left the text at its original size, which is most of what "it
      // resizes the box, not the component" felt like.
      //
      // Built per-kind rather than by writing `fontSize` onto a
      // `Partial<BrochureElement>`: that union only permits the keys common to
      // every element kind, and this project's `strict: false` is the only
      // reason a blind write would have compiled.
      const proportional = Math.abs(absX - 1) > 0.001 && Math.abs(absY - 1) > 0.001;
      const typeScale = Math.min(absX, absY);

      if (proportional && (element.kind === "text" || element.kind === "pill")) {
        next = updateElement(next, page.id, id, {
          ...geometry,
          fontSize: Math.max(1, element.fontSize * typeScale),
        });
      } else {
        next = updateElement(next, page.id, id, geometry);
      }
    }
    if (next !== doc) onChange(next);
  }, [doc, onChange, page.elements, page.id, scalePxPerMm, selectedElementIds]);

  // ─── Marquee (rubber-band) selection ──────────────────────────────────────
  //
  // The primary way to grab a card: shift-clicking every piece of a 6-element
  // pricing tile is tedious and easy to get wrong.

  const isBackgroundTarget = (target: Konva.Node) =>
    target === target.getStage() || target.attrs.id === "page-bg";

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isBackgroundTarget(e.target)) return;
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      marqueeStartRef.current = { x: pos.x, y: pos.y };
      setMarquee({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
      // Don't clear the selection yet — a plain click clears it on mouse-up.
      // Clearing here would make shift-drag-to-extend impossible.
    },
    [],
  );

  const handleStageMouseMove = useCallback(() => {
    const start = marqueeStartRef.current;
    if (!start) return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    setMarquee({ x1: start.x, y1: start.y, x2: pos.x, y2: pos.y });
  }, []);

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const start = marqueeStartRef.current;
      marqueeStartRef.current = null;
      setMarquee(null);
      if (!start) return;

      const pos = stageRef.current?.getPointerPosition() ?? start;
      const dragged = Math.abs(pos.x - start.x) > 3 || Math.abs(pos.y - start.y) > 3;

      // A click (no meaningful drag) on the background clears the selection —
      // the behaviour this component had before marquee existed.
      if (!dragged) {
        if (isBackgroundTarget(e.target)) onSelect([]);
        return;
      }

      // Intersection, not containment: a full-bleed background rect can never
      // be fully enclosed by a marquee drawn inside the page, so requiring
      // containment would make the most important element unselectable.
      const minX = Math.min(start.x, pos.x) / scalePxPerMm;
      const maxX = Math.max(start.x, pos.x) / scalePxPerMm;
      const minY = Math.min(start.y, pos.y) / scalePxPerMm;
      const maxY = Math.max(start.y, pos.y) / scalePxPerMm;

      const rawHits = page.elements
        .filter(
          (el) =>
            el.x < maxX && el.x + el.width > minX && el.y < maxY && el.y + el.height > minY,
        )
        .map((el) => el.id);

      // Touching part of a card selects the whole card, so a marquee can't
      // leave you resizing a tile's background without its photo.
      const hits = e.evt.altKey ? rawHits : expandSelectionToGroups(page, rawHits);

      const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
      if (additive) {
        onSelect(Array.from(new Set([...selectedElementIds, ...hits])));
      } else {
        onSelect(hits);
      }
    },
    [onSelect, page, scalePxPerMm, selectedElementIds],
  );

  // Abandons an in-flight marquee. Leaving the stage mid-drag is the common
  // way to get here, and the selection is left untouched rather than cleared:
  // the gesture was cancelled, not completed.
  const handleStageMouseLeave = useCallback(() => {
    if (!marqueeStartRef.current) return;
    marqueeStartRef.current = null;
    setMarquee(null);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {/* Scroll container = pan. Once the zoomed page is larger than the pane,
          the native scrollbars are the pan mechanism, which also gives
          trackpad two-finger panning and shift-wheel for free. */}
      <div ref={scrollRef} className="w-full h-full overflow-auto bg-muted/40">
        {/*
          `m-auto` on the inner wrapper rather than `justify-center` on this
          flex container. Centring a flex item that OVERFLOWS its scroll
          container clips the top/left and makes that part unreachable by
          scrolling; auto margins centre without that failure.
        */}
        <div
          className="flex p-5"
          style={{
            minWidth: "100%",
            minHeight: "100%",
            width: "max-content",
            height: "max-content",
          }}
        >
          {/* `relative` so the in-place text editor can be absolutely
              positioned over the element it's editing, and so it pans and zooms
              with the page instead of floating at a fixed screen offset. */}
          <div className="m-auto relative" style={{ width: stageW, height: stageH }}>
      {stageW > 0 && stageH > 0 && (
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          // Releasing the mouse outside the stage never fires `mouseup` on it,
          // which would otherwise leave the marquee rectangle painted on the
          // canvas forever. Dragging a selection box past the page edge is
          // routine, so this is a reachable state, not a corner case.
          onMouseLeave={handleStageMouseLeave}
          style={{
            boxShadow: "0 2px 24px rgba(0,0,0,0.12)",
            background: "#fff",
          }}
        >
          <Layer>
            <PageBackgroundNode background={page.background} width={stageW} height={stageH} />
          </Layer>
          <Layer>
            {[...page.elements]
              // Hidden elements are skipped by BOTH renderers, so the canvas and
              // the exported PDF agree — unlike `opacity: 0`, which still
              // rasterised into the file.
              .filter((el) => !el.hidden)
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => (
                <ElementNode
                  key={el.id}
                  element={el}
                  scale={scalePxPerMm}
                  page={page}
                  isSelected={selectedElementIds.includes(el.id)}
                  registerNode={registerNode}
                  isEditing={editingId === el.id}
                  onSelect={(additive, isolate) => handleSelect(el.id, additive, isolate)}
                  onStartEditing={
                    el.kind === "text" || el.kind === "pill"
                      ? () => setEditingId(el.id)
                      : undefined
                  }
                  onDragStart={() => handleDragStart(el.id)}
                  onDragMove={() => handleDragMove(el.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}

            {/* One Transformer for the whole selection, so a multi-element
                card resizes from a single shared bounding box. */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={selectedElementIds.length === 1}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
                "top-center",
                "bottom-center",
              ]}
              borderStroke="#3b82f6"
              anchorStroke="#3b82f6"
              anchorFill="#ffffff"
              anchorSize={8}
              onTransformEnd={handleTransformEnd}
              boundBoxFunc={(oldBox, newBox) => {
                // Enforce a minimum size so the user can't shrink an element
                // into an invisible speck.
                if (newBox.width < 8 || newBox.height < 8) return oldBox;
                return newBox;
              }}
            />

            {/* Alignment guides — drawn only for the lines actually holding
                the dragged element, so a visible guide always means
                "you are snapped to this". */}
            {snapGuides.map((guide) =>
              guide.orientation === "vertical" ? (
                <Line
                  key={`v-${guide.at}`}
                  points={[guide.at * scalePxPerMm, 0, guide.at * scalePxPerMm, stageH]}
                  stroke="#ec4899"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                />
              ) : (
                <Line
                  key={`h-${guide.at}`}
                  points={[0, guide.at * scalePxPerMm, stageW, guide.at * scalePxPerMm]}
                  stroke="#ec4899"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                />
              ),
            )}

            {marquee && (
              <Rect
                x={Math.min(marquee.x1, marquee.x2)}
                y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill="rgba(59,130,246,0.12)"
                stroke="#3b82f6"
                strokeWidth={1}
                dash={[4, 3]}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}

            {editingElement && (
              <InPlaceTextEditor
                key={editingElement.id}
                element={editingElement}
                scale={scalePxPerMm}
                onCommit={(value) => {
                  const patch =
                    editingElement.kind === "text" ? { content: value } : { text: value };
                  onChange(updateElement(doc, page.id, editingElement.id, patch));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        </div>
      </div>

      <ZoomControl
        percent={Math.round(effectiveScale * 100)}
        isFit={zoom === null}
        canZoomIn={effectiveScale < MAX_ZOOM - 1e-6}
        canZoomOut={effectiveScale > MIN_ZOOM + 1e-6}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(1 / 1.25)}
        onSetZoom={(z) => applyZoom(z)}
        onFit={() => setZoom(null)}
      />
    </div>
  );
}

// ─── Zoom control ──────────────────────────────────────────────────────────

/**
 * Floating zoom control, bottom-right of the canvas pane.
 *
 * Overlaid on the canvas rather than added to the top toolbar: it belongs to the
 * viewport, not to the selection, and every design tool puts it here — so it's
 * where organizers look for it.
 */
function ZoomControl({
  percent,
  isFit,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onFit,
}: {
  percent: number;
  isFit: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetZoom: (zoom: number) => void;
  onFit: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md border border-border bg-background/95 backdrop-blur px-1 py-0.5 shadow-sm">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        title="Zoom out (Ctrl+-)"
        aria-label="Zoom out"
        className="h-7 w-7 grid place-items-center rounded hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Zoom level"
            className="h-7 min-w-[62px] px-1.5 rounded hover:bg-muted text-[11px] tabular-nums"
          >
            {percent}%{isFit ? " · Fit" : ""}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem onClick={onFit}>
            Fit to pane
            <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+0</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {ZOOM_PRESETS.map((z) => (
            <DropdownMenuItem key={z} onClick={() => onSetZoom(z)}>
              {Math.round(z * 100)}%
              {z === 1 && (
                <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+1</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        title="Zoom in (Ctrl+=)"
        aria-label="Zoom in"
        className="h-7 w-7 grid place-items-center rounded hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />

      <button
        type="button"
        onClick={onFit}
        title="Fit to pane (Ctrl+0)"
        aria-label="Fit page to pane"
        className="h-7 w-7 grid place-items-center rounded hover:bg-muted"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Page background node ──────────────────────────────────────────────────

function PageBackgroundNode({ background, width, height }: { background: PageBackground; width: number; height: number }) {
  if (background.type === "solid") {
    return <Rect id="page-bg" x={0} y={0} width={width} height={height} fill={background.color} listening />;
  }
  if (background.type === "gradient") {
    return (
      <Rect
        id="page-bg"
        x={0}
        y={0}
        width={width}
        height={height}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: height }}
        fillLinearGradientColorStops={[0, background.top, 1, background.bottom]}
        listening
      />
    );
  }
  // Image background — rendered via a bitmap loader; fall back to a
  // solid grey when the URL fails to load.
  return <ImageBackground src={background.src} fit={background.fit} width={width} height={height} />;
}

function ImageBackground({ src, fit, width, height }: { src: string; fit: "cover" | "contain"; width: number; height: number }) {
  const [image] = useImage(src, "anonymous");
  if (!image) {
    return <Rect id="page-bg" x={0} y={0} width={width} height={height} fill="#f3f4f6" listening />;
  }
  // Same shared fit helper the PDF exporter uses for page backgrounds.
  const box = computeImageDrawBox({
    boxWidth: width,
    boxHeight: height,
    naturalWidth: image.width,
    naturalHeight: image.height,
    fit,
  });
  return (
    <>
      <Rect id="page-bg" x={0} y={0} width={width} height={height} fill="#f3f4f6" listening />
      <Image
        image={image}
        x={box.dx}
        y={box.dy}
        width={box.width}
        height={box.height}
        listening={false}
      />
    </>
  );
}

// ─── Element node router ───────────────────────────────────────────────────

interface ElementNodeProps {
  element: BrochureElement;
  scale: number; // px per mm
  page: BrochurePage;
  isSelected: boolean;
  /** True while the overlaid textarea is open over this element. */
  isEditing: boolean;
  /** Publishes (or retracts) the live Konva node in the parent's registry. */
  registerNode: (elementId: string, node: Konva.Group | null) => void;
  /**
   * @param additive shift/cmd-click — toggle this element in the selection.
   * @param isolate  alt-click — select just this element, ignoring its card.
   */
  onSelect: (additive: boolean, isolate: boolean) => void;
  /** Double-click handler, only supplied for kinds that carry editable text. */
  onStartEditing?: () => void;
  onDragStart: () => void;
  onDragMove: () => void;
  onDragEnd: () => void;
}

/**
 * One element node — routes on `element.kind` to the concrete renderer and
 * wraps it in a Konva `<Group>` so drag/resize/rotate operate on the element
 * as a unit.
 *
 * Drag and transform are deliberately NOT handled here. Both are
 * selection-wide operations: snapping needs every other element on the page as
 * candidate geometry, and moving one member of a multi-selection has to move
 * its siblings in the same frame. Neither is knowable from inside a single
 * element, so the parent owns them and this component just forwards the
 * events.
 */
function ElementNode(props: ElementNodeProps) {
  const {
    element,
    scale,
    page,
    isSelected,
    isEditing,
    registerNode,
    onSelect,
    onStartEditing,
    onDragStart,
    onDragMove,
    onDragEnd,
  } = props;

  // Stable per-element ref callback, so React doesn't detach and reattach the
  // node in the parent's registry on every re-render.
  const setRef = useCallback(
    (node: Konva.Group | null) => registerNode(element.id, node),
    [registerNode, element.id],
  );

  // Convert the element's mm geometry to canvas pixels.
  const xPx = element.x * scale;
  const yPx = element.y * scale;
  const wPx = element.width * scale;
  const hPx = element.height * scale;

  // A locked element is inert on the canvas: not clickable, not draggable, and
  // (because it can't be selected) not resizable. The intended use is a
  // full-bleed background panel that would otherwise be grabbed on every stray
  // click. It stays reachable from the layers list, which is what keeps locking
  // from being a one-way trap.
  const locked = !!element.locked;

  return (
    <Group
      ref={setRef}
      x={xPx}
      y={yPx}
      rotation={element.rotation}
      opacity={element.opacity}
      listening={!locked}
      draggable={!locked}
      onMouseEnter={(e) => {
        // Change the cursor to "move" so users know the element (or
        // full-bleed image) is grabbable — otherwise a page-sized
        // image looks like a static background and users don't
        // realise they can click to select it.
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "move";
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey, e.evt.altKey);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        // Touch has no modifier keys, so a tap always selects the whole card.
        onSelect(false, false);
      }}
      onDblClick={(e) => {
        if (!onStartEditing) return;
        e.cancelBubble = true;
        onStartEditing();
      }}
      onDblTap={(e) => {
        if (!onStartEditing) return;
        e.cancelBubble = true;
        onStartEditing();
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {/* While the overlaid textarea is open, the Konva copy is suppressed —
          otherwise the glyphs render twice, slightly offset, because canvas and
          DOM text metrics never match exactly. For a pill the capsule stays
          drawn and only its label is hidden, so the shape doesn't flicker. */}
      {isEditing && element.kind === "pill" ? (
        <PillBody el={element} width={wPx} height={hPx} scale={scale} hideText />
      ) : isEditing && element.kind === "text" ? null : (
        <ElementBody element={element} width={wPx} height={hPx} pageWidth={page.width} scale={scale} />
      )}
      {isSelected && (
        // Per-element outline. The shared Transformer only draws ONE box around
        // the whole selection, so without this the organizer can't tell which
        // pieces of a card are actually in the selection and which just happen
        // to sit inside the bounding box.
        <Rect
          x={0}
          y={0}
          width={wPx}
          height={hPx}
          stroke="#3b82f6"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />
      )}
    </Group>
  );
}

// ─── Element body renderers ────────────────────────────────────────────────

function ElementBody({
  element,
  width,
  height,
  pageWidth,
  scale,
}: {
  element: BrochureElement;
  width: number;
  height: number;
  pageWidth: number;
  /** Canvas px per document mm — the SAME factor already used to
   *  convert this element's x/y/width/height, so mm-denominated style
   *  properties (font size, stroke width, corner radius) scale with
   *  the rest of the scene at every viewport zoom level instead of
   *  being fixed to a `SCREEN_DPI` px value that only looks right by
   *  coincidence at one particular pane size. */
  scale: number;
}) {
  switch (element.kind) {
    case "text":
      return <TextBody el={element} width={width} height={height} scale={scale} />;
    case "image":
      return <ImageBody el={element} width={width} height={height} scale={scale} />;
    case "shape":
      return <ShapeBody el={element} width={width} height={height} scale={scale} />;
    case "pill":
      return <PillBody el={element} width={width} height={height} scale={scale} />;
    default: {
      // Exhaustive check.
      const _never: never = element;
      void _never;
      void pageWidth;
      return null;
    }
  }
}

function TextBody({ el, width, height, scale }: { el: TextElement; width: number; height: number; scale: number }) {
  // `ptToMm(1) * scale` is the pt→px factor at this zoom level; letter spacing
  // is stored in points so it tracks the type size.
  const ptToPxFactor = ptToMm(1) * scale;
  return (
    <Text
      x={0}
      y={0}
      width={width}
      height={height}
      text={transformedText(el.content, el.textTransform)}
      fontFamily={el.fontFamily}
      fontSize={ptToMm(el.fontSize) * scale}
      fontStyle={fontStyleString(el.fontWeight, el.fontStyle)}
      fill={el.color}
      align={el.align}
      lineHeight={el.lineHeight}
      wrap="word"
      listening
      {...textExtras(el, ptToPxFactor, scale)}
      {...shadowProps(el.shadow, scale)}
    />
  );
}

function ImageBody({ el, width, height, scale }: { el: ImageElement; width: number; height: number; scale: number }) {
  const [image, status] = useImage(el.src || "", "anonymous");
  const radiusPx = el.cornerRadius * scale;
  if (status !== "loaded" || !image) {
    // Placeholder gray box while loading / on error. Include a dashed
    // border and hint text so a page-sized image whose URL failed to
    // load is still visibly a selectable element (users otherwise
    // mistake it for a blank page background).
    const hint = el.src ? "Image failed to load — click to replace" : "Image — click to add source";
    return (
      <>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="#f3f4f6"
          stroke="#cbd5e1"
          strokeWidth={1}
          dash={[6, 4]}
          cornerRadius={radiusPx}
        />
        <Text
          x={0}
          y={Math.max(0, height / 2 - 8)}
          width={width}
          height={16}
          text={hint}
          fontFamily="Inter, sans-serif"
          fontSize={12}
          fill="#64748b"
          align="center"
          listening={false}
        />
      </>
    );
  }

  // Fit / zoom / focal-point math is shared with the PDF exporter — the same
  // `computeImageDrawBox` call — so the canvas and the downloaded file cannot
  // disagree. They previously each had their own copy, and both had silently
  // degraded `fit: "fill"` into `contain`.
  const {
    dx,
    dy,
    width: drawW,
    height: drawH,
  } = computeImageDrawBox({
    boxWidth: width,
    boxHeight: height,
    naturalWidth: image.width,
    naturalHeight: image.height,
    fit: el.fit,
    zoom: el.zoom,
    focalX: el.focalX,
    focalY: el.focalY,
  });

  return (
    <Group clipFunc={(ctx) => {
      // Rounded clip so the image respects `cornerRadius` even when it
      // overflows the geometry box in cover mode.
      const r = Math.min(radiusPx, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(width - r, 0);
      ctx.quadraticCurveTo(width, 0, width, r);
      ctx.lineTo(width, height - r);
      ctx.quadraticCurveTo(width, height, width - r, height);
      ctx.lineTo(r, height);
      ctx.quadraticCurveTo(0, height, 0, height - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
    }} {...shadowProps(el.shadow, scale)}>
      {/* Must stay listening. A Konva Group has no hit area of its own — hit
          testing goes through its children — so `listening={false}` here left a
          successfully-loaded image with ZERO hit area. Clicks fell through to
          the page background and deselected, which is why images could not be
          selected and therefore could not be resized. The `clipFunc` above also
          clips the hit region, so the clickable area is the element's box even
          when a `cover` image overflows it.

          The placeholder branch above always had a listening Rect, so a BROKEN
          image was selectable while a working one wasn't. */}
      <Image
        image={image}
        width={drawW}
        height={drawH}
        {...mirrorProps(el.flipH, el.flipV, dx, dy, drawW, drawH)}
      />
    </Group>
  );
}

function ShapeBody({ el, width, height, scale }: { el: ShapeElement; width: number; height: number; scale: number }) {
  const strokeWidthPx = el.strokeWidth * scale;
  const common = {
    stroke: el.stroke === "transparent" ? undefined : el.stroke,
    strokeWidth: strokeWidthPx,
    dash: dashArray(el.dash, strokeWidthPx),
    ...shapeFillProps(el, width, height),
    ...shadowProps(el.shadow, scale),
  };
  if (el.shape === "ellipse") {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        {...common}
      />
    );
  }
  return (
    <Rect x={0} y={0} width={width} height={height} cornerRadius={el.cornerRadius * scale} {...common} />
  );
}

function PillBody({
  el,
  width,
  height,
  scale,
  hideText = false,
}: {
  el: PillElement;
  width: number;
  height: number;
  scale: number;
  /** Set while the in-place editor is open, so the capsule keeps drawing but its
   *  label doesn't double up with the textarea's. */
  hideText?: boolean;
}) {
  // A pill is a rounded rect with the corner radius = height/2, plus
  // centered text on top.
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        cornerRadius={height / 2}
        fill={el.fillColor === "transparent" ? undefined : el.fillColor}
        stroke={el.strokeColor === "transparent" ? undefined : el.strokeColor}
        strokeWidth={el.strokeWidth * scale}
        {...shadowProps(el.shadow, scale)}
      />
      {!hideText && (
        <Text
          x={0}
          y={0}
          width={width}
          height={height}
          text={el.text}
          fontFamily={el.fontFamily}
          fontSize={ptToMm(el.fontSize) * scale}
          fontStyle={fontStyleString(el.fontWeight, "normal")}
          letterSpacing={el.letterSpacing ? el.letterSpacing * ptToMm(1) * scale : undefined}
          fill={el.textColor}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
    </>
  );
}

// ─── In-place text editor ──────────────────────────────────────────────────

/**
 * A `<textarea>` overlaid exactly on top of a text or pill element.
 *
 * Editing text on a canvas is otherwise a side-panel affair: you retype in a
 * box on the right while the text you're changing sits somewhere else on screen.
 * For the single most repeated action in brochure design that's a constant tax,
 * so this puts the caret where the words are.
 *
 * The textarea's font, size, tracking, colour and alignment are matched to the
 * element so the text doesn't visibly jump when editing starts or ends. It can't
 * match Konva's line breaking exactly — canvas and DOM text measurement differ —
 * so the overlay is a close approximation, and the authoritative render appears
 * again the moment editing commits.
 *
 * Commit on blur or Cmd/Ctrl+Enter; abandon on Escape. Enter inserts a newline,
 * because these boxes are genuinely multi-line (the model stores `\n`).
 */
function InPlaceTextEditor({
  element,
  scale,
  onCommit,
  onCancel,
}: {
  element: TextElement | PillElement;
  scale: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const initial = element.kind === "text" ? element.content : element.text;
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  const isText = element.kind === "text";
  const fontPx = ptToMm(element.fontSize) * scale;

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        // Stop the dialog's global shortcuts from seeing these keys — Delete
        // would otherwise remove the element being typed into, and Cmd+A would
        // select every element on the page instead of the text.
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onCommit(value);
        }
      }}
      spellCheck
      style={{
        position: "absolute",
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
        fontFamily: `"${element.fontFamily}", sans-serif`,
        fontSize: fontPx,
        fontWeight: isText ? element.fontWeight : (element.fontWeight ?? "normal"),
        fontStyle: isText && element.fontStyle === "italic" ? "italic" : "normal",
        letterSpacing: element.letterSpacing ? element.letterSpacing * ptToMm(1) * scale : undefined,
        lineHeight: isText ? element.lineHeight : 1.2,
        color: isText ? element.color : element.textColor,
        textAlign: isText ? element.align : "center",
        textTransform: isText ? (element.textTransform ?? "none") : "none",
        // A pill's capsule is still painted underneath, so the editor must not
        // cover it; a bare text element has nothing behind it either way.
        background: "transparent",
        border: "1px solid #3b82f6",
        outline: "none",
        padding: 0,
        margin: 0,
        resize: "none",
        overflow: "hidden",
        // Rotation shares the element's centre pivot, matching Konva.
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: "center center",
      }}
    />
  );
}
