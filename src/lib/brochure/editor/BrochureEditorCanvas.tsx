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
  snapPosition,
  type SnapGuide,
} from "./editor-operations";

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

  // The Konva stage renders at `1x` DPI internally but the page's
  // pixel dimensions come from `mmToPx(mm, SCREEN_DPI) × scale`. This
  // one factor is applied everywhere geometry converts to canvas
  // pixels so the whole scene fits the viewport without altering the
  // underlying document mm values.
  const scalePxPerMm = (mmToPx(1, SCREEN_DPI) * fit.scale);

  const stageW = fit.widthPx;
  const stageH = fit.heightPx;

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
    (elementId: string, additive: boolean) => {
      if (!additive) {
        onSelect([elementId]);
        return;
      }
      onSelect(
        selectedElementIds.includes(elementId)
          ? selectedElementIds.filter((id) => id !== elementId)
          : [...selectedElementIds, elementId],
      );
    },
    [onSelect, selectedElementIds],
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

      // Dragging something outside the current selection replaces it. Konva
      // only proxies drag to nodes the Transformer is attached to, so an
      // unselected element moves alone, which is what we want here.
      const ids = selectedElementIds.includes(elementId) ? selectedElementIds : [elementId];
      if (!selectedElementIds.includes(elementId)) onSelect([elementId]);

      const from = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const node = nodeRefs.current.get(id);
        if (node) from.set(id, { x: node.x(), y: node.y() });
      }
      dragStartRef.current = { initiatorId: elementId, ids, from };
    },
    [onSelect, selectedElementIds],
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

    // Read each node's FINAL position rather than applying one delta. Konva may
    // have moved these nodes itself via the drag proxy, so reading back makes
    // the commit independent of how they got there — and it produces exactly
    // one document update, hence one undo entry, for one user gesture.
    let next = doc;
    let moved = false;
    for (const id of gesture.ids) {
      const node = nodeRefs.current.get(id);
      const from = gesture.from.get(id);
      if (!node) continue;
      if (from && Math.abs(node.x() - from.x) < 0.01 && Math.abs(node.y() - from.y) < 0.01) {
        continue;
      }
      moved = true;
      next = updateElement(next, page.id, id, {
        x: node.x() / scalePxPerMm,
        y: node.y() / scalePxPerMm,
      });
    }
    // A click registers as a zero-distance drag; committing it would push an
    // undo entry for doing nothing.
    if (moved) onChange(next);
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

      next = updateElement(next, page.id, id, {
        x: node.x() / scalePxPerMm,
        y: node.y() / scalePxPerMm,
        // Absolute value, because dragging an anchor past the opposite edge
        // gives a NEGATIVE scale. Without this the element collapses to the 1mm
        // floor instead of resizing, which reads as the element vanishing.
        width: Math.max(1, element.width * Math.abs(scaleX)),
        height: Math.max(1, element.height * Math.abs(scaleY)),
        rotation: node.rotation(),
      });
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

      const hits = page.elements
        .filter(
          (el) =>
            el.x < maxX && el.x + el.width > minX && el.y < maxY && el.y + el.height > minY,
        )
        .map((el) => el.id);

      const additive = e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;
      if (additive) {
        onSelect(Array.from(new Set([...selectedElementIds, ...hits])));
      } else {
        onSelect(hits);
      }
    },
    [onSelect, page.elements, scalePxPerMm, selectedElementIds],
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
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-muted/40 overflow-hidden"
    >
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
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((el) => (
                <ElementNode
                  key={el.id}
                  element={el}
                  scale={scalePxPerMm}
                  page={page}
                  isSelected={selectedElementIds.includes(el.id)}
                  registerNode={registerNode}
                  onSelect={(additive) => handleSelect(el.id, additive)}
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
  /** Publishes (or retracts) the live Konva node in the parent's registry. */
  registerNode: (elementId: string, node: Konva.Group | null) => void;
  /** `additive` is true for shift/cmd-click, meaning "toggle in the selection". */
  onSelect: (additive: boolean) => void;
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
    registerNode,
    onSelect,
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

  return (
    <Group
      ref={setRef}
      x={xPx}
      y={yPx}
      rotation={element.rotation}
      opacity={element.opacity}
      draggable
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
        onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect(false);
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <ElementBody element={element} width={wPx} height={hPx} pageWidth={page.width} scale={scale} />
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
  return (
    <Text
      x={0}
      y={0}
      width={width}
      height={height}
      text={el.content}
      fontFamily={el.fontFamily}
      fontSize={ptToMm(el.fontSize) * scale}
      fontStyle={
        el.fontWeight === "bold" && el.fontStyle === "italic"
          ? "italic bold"
          : el.fontWeight === "bold"
            ? "bold"
            : el.fontStyle === "italic"
              ? "italic"
              : "normal"
      }
      fill={el.color}
      align={el.align}
      lineHeight={el.lineHeight}
      wrap="word"
      listening
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
    }}>
      <Image image={image} x={dx} y={dy} width={drawW} height={drawH} listening={false} />
    </Group>
  );
}

function ShapeBody({ el, width, height, scale }: { el: ShapeElement; width: number; height: number; scale: number }) {
  if (el.shape === "ellipse") {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        fill={el.fill === "transparent" ? undefined : el.fill}
        stroke={el.stroke === "transparent" ? undefined : el.stroke}
        strokeWidth={el.strokeWidth * scale}
      />
    );
  }
  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill={el.fill === "transparent" ? undefined : el.fill}
      stroke={el.stroke === "transparent" ? undefined : el.stroke}
      strokeWidth={el.strokeWidth * scale}
      cornerRadius={el.cornerRadius * scale}
    />
  );
}

function PillBody({ el, width, height, scale }: { el: PillElement; width: number; height: number; scale: number }) {
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
      />
      <Text
        x={0}
        y={0}
        width={width}
        height={height}
        text={el.text}
        fontFamily={el.fontFamily}
        fontSize={ptToMm(el.fontSize) * scale}
        fill={el.textColor}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </>
  );
}
