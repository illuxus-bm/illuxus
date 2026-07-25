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
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Ellipse, Text, Image, Transformer } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";

import {
  mmToPx,
  ptToPx,
  pxToMm,
  fitPageToViewport,
  SCREEN_DPI,
} from "./editor-units";
import {
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

interface Props {
  document: BrochureDocument;
  onChange: (doc: BrochureDocument) => void;
  /** Active page id. Only this page is rendered — page thumbnails +
   *  navigation are the parent component's responsibility. */
  activePageId: string;
  /** Selected element id, or `null` for no selection. Owned by the
   *  parent so the properties panel can react to selection changes. */
  selectedElementId: string | null;
  onSelect: (elementId: string | null) => void;
}

export default function BrochureEditorCanvas({
  document: doc,
  onChange,
  activePageId,
  selectedElementId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

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

  const commitGeometry = (elementId: string, patch: Partial<BrochureElement>) => {
    onChange(updateElement(doc, page.id, elementId, patch));
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-muted/40 overflow-hidden"
    >
      {stageW > 0 && stageH > 0 && (
        <Stage
          width={stageW}
          height={stageH}
          onMouseDown={(e) => {
            // Deselect when clicking on the empty stage / page background.
            if (e.target === e.target.getStage()) {
              onSelect(null);
              return;
            }
            // Konva event `target` may be the background Rect (id "page-bg")
            // rather than the Stage; deselect in that case too.
            if (e.target.attrs.id === "page-bg") {
              onSelect(null);
            }
          }}
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
                  isSelected={el.id === selectedElementId}
                  onSelect={() => onSelect(el.id)}
                  onGeometryCommit={(patch) => commitGeometry(el.id, patch)}
                />
              ))}
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
  // Compute a fit box mirroring `fitImageBox` from the jsPDF renderer.
  const scale = fit === "cover"
    ? Math.max(width / image.width, height / image.height)
    : Math.min(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;
  return (
    <>
      <Rect id="page-bg" x={0} y={0} width={width} height={height} fill="#f3f4f6" listening />
      <Image image={image} x={dx} y={dy} width={drawW} height={drawH} listening={false} />
    </>
  );
}

// ─── Element node router ───────────────────────────────────────────────────

interface ElementNodeProps {
  element: BrochureElement;
  scale: number; // px per mm
  page: BrochurePage;
  isSelected: boolean;
  onSelect: () => void;
  onGeometryCommit: (patch: Partial<BrochureElement>) => void;
}

/**
 * One element node — routes on `element.kind` to the concrete renderer,
 * wraps in a Konva `<Group>` so drag/resize/rotate operate on the
 * element as a unit, and attaches a `<Transformer>` when this element
 * is the current selection.
 */
function ElementNode(props: ElementNodeProps) {
  const { element, scale, page, isSelected, onSelect, onGeometryCommit } = props;
  const nodeRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  // Wire the Transformer to the currently-selected node on every render
  // where the selection state changes. Konva transformers are
  // imperatively-attached via `.nodes([node])`, so this must be an
  // effect rather than a prop.
  useEffect(() => {
    if (isSelected && nodeRef.current && transformerRef.current) {
      transformerRef.current.nodes([nodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // Convert the element's mm geometry to canvas pixels.
  const xPx = element.x * scale;
  const yPx = element.y * scale;
  const wPx = element.width * scale;
  const hPx = element.height * scale;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    onGeometryCommit({
      x: pxToMm(node.x() / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI),
      y: pxToMm(node.y() / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI),
    });
  };

  const handleTransformEnd = () => {
    const node = nodeRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Reset internal Konva scale — we bake it into the width/height
    // instead so subsequent transforms compose correctly.
    node.scaleX(1);
    node.scaleY(1);
    const newWmm = pxToMm((wPx * scaleX) / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI);
    const newHmm = pxToMm((hPx * scaleY) / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI);
    onGeometryCommit({
      x: pxToMm(node.x() / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI),
      y: pxToMm(node.y() / scale * mmToPx(1, SCREEN_DPI), SCREEN_DPI),
      width: Math.max(4, newWmm),
      height: Math.max(4, newHmm),
      rotation: node.rotation(),
    });
  };

  return (
    <>
      <Group
        ref={nodeRef}
        x={xPx}
        y={yPx}
        rotation={element.rotation}
        opacity={element.opacity}
        draggable
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        <ElementBody element={element} width={wPx} height={hPx} pageWidth={page.width} />
      </Group>
      {isSelected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
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
          boundBoxFunc={(_oldBox, newBox) => {
            // Enforce a minimum size so the user can't shrink an element
            // into an invisible speck.
            if (newBox.width < 8 || newBox.height < 8) return _oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

// ─── Element body renderers ────────────────────────────────────────────────

function ElementBody({ element, width, height, pageWidth }: { element: BrochureElement; width: number; height: number; pageWidth: number }) {
  switch (element.kind) {
    case "text":
      return <TextBody el={element} width={width} height={height} />;
    case "image":
      return <ImageBody el={element} width={width} height={height} />;
    case "shape":
      return <ShapeBody el={element} width={width} height={height} />;
    case "pill":
      return <PillBody el={element} width={width} height={height} />;
    default: {
      // Exhaustive check.
      const _never: never = element;
      void _never;
      void pageWidth;
      return null;
    }
  }
}

function TextBody({ el, width, height }: { el: TextElement; width: number; height: number }) {
  return (
    <Text
      x={0}
      y={0}
      width={width}
      height={height}
      text={el.content}
      fontFamily={el.fontFamily}
      fontSize={ptToPx(el.fontSize) * (width / width)}
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

function ImageBody({ el, width, height }: { el: ImageElement; width: number; height: number }) {
  const [image, status] = useImage(el.src || "", "anonymous");
  if (status !== "loaded" || !image) {
    // Placeholder gray box while loading / on error.
    return <Rect x={0} y={0} width={width} height={height} fill="#e5e7eb" cornerRadius={el.cornerRadius} />;
  }

  const scale = el.fit === "cover"
    ? Math.max(width / image.width, height / image.height)
    : el.fit === "contain"
      ? Math.min(width / image.width, height / image.height)
      : Math.min(width / image.width, height / image.height); // "fill" — we still clamp to preserve ratio in-editor
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;

  return (
    <Group clipFunc={(ctx) => {
      // Rounded clip so the image respects `cornerRadius` even when it
      // overflows the geometry box in cover mode.
      const r = Math.min(el.cornerRadius, width / 2, height / 2);
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

function ShapeBody({ el, width, height }: { el: ShapeElement; width: number; height: number }) {
  if (el.shape === "ellipse") {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        fill={el.fill === "transparent" ? undefined : el.fill}
        stroke={el.stroke === "transparent" ? undefined : el.stroke}
        strokeWidth={el.strokeWidth}
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
      strokeWidth={el.strokeWidth}
      cornerRadius={el.cornerRadius}
    />
  );
}

function PillBody({ el, width, height }: { el: PillElement; width: number; height: number }) {
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
        strokeWidth={el.strokeWidth}
      />
      <Text
        x={0}
        y={0}
        width={width}
        height={height}
        text={el.text}
        fontFamily={el.fontFamily}
        fontSize={ptToPx(el.fontSize)}
        fill={el.textColor}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </>
  );
}
