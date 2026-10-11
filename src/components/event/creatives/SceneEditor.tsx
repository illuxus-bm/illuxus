/**
 * SceneEditor — the creative, editable in place.
 *
 * Draws the scene with the same renderer the export uses and lays a
 * transparent layer over it for selection, dragging, resizing and typing.
 * The component owns no design state: every change is reported as a patch
 * and the studio decides what to store.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import SceneCanvas from "@/components/event/creatives/SceneCanvas";
import { hitTest, moveBy, setBounds, type NodePatch } from "@/lib/creatives/studio/edits";
import { nodeBounds, type Bounds, type Scene, type TextNode } from "@/lib/creatives/studio/scene";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: Array<{ id: Handle; left: string; top: string; cursor: string }> = [
  { id: "nw", left: "0%", top: "0%", cursor: "nwse-resize" },
  { id: "n", left: "50%", top: "0%", cursor: "ns-resize" },
  { id: "ne", left: "100%", top: "0%", cursor: "nesw-resize" },
  { id: "e", left: "100%", top: "50%", cursor: "ew-resize" },
  { id: "se", left: "100%", top: "100%", cursor: "nwse-resize" },
  { id: "s", left: "50%", top: "100%", cursor: "ns-resize" },
  { id: "sw", left: "0%", top: "100%", cursor: "nesw-resize" },
  { id: "w", left: "0%", top: "50%", cursor: "ew-resize" },
];

/** How close (in scene px) a dragged node's centre snaps to the canvas centre. */
const SNAP_DISTANCE = 10;

interface Drag {
  id: string;
  handle: Handle | "move";
  startX: number;
  startY: number;
  bounds: Bounds;
  moved: boolean;
}

export interface SceneEditorProps {
  scene: Scene;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called once before a gesture starts changing things, so it can be undone as one step. */
  onBeginChange: () => void;
  onPatch: (id: string, patch: NodePatch) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export default function SceneEditor(props: SceneEditorProps) {
  const { scene, selectedId, onSelect, onBeginChange, onPatch } = props;
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const selected = useMemo(() => scene.nodes.find((n) => n.id === selectedId) ?? null, [scene, selectedId]);
  const bounds = selected ? nodeBounds(selected) : null;
  const editing = editingId ? (scene.nodes.find((n) => n.id === editingId && n.kind === "text") as TextNode | undefined) : undefined;

  useEffect(() => {
    if (editingId && editingId !== selectedId) setEditingId(null);
  }, [editingId, selectedId]);

  /** Pointer position in scene pixels. */
  const toScene = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * scene.width,
      y: ((event.clientY - rect.top) / rect.height) * scene.height,
    };
  };

  const commitText = (): void => {
    if (!editing?.id) return;
    if (draft !== editing.text) {
      onBeginChange();
      onPatch(editing.id, { text: draft });
    }
    setEditingId(null);
  };

  const startDrag = (event: React.PointerEvent, id: string, handle: Handle | "move"): void => {
    const node = scene.nodes.find((n) => n.id === id);
    if (!node) return;
    const point = toScene(event);
    dragRef.current = { id, handle, startX: point.x, startY: point.y, bounds: nodeBounds(node), moved: false };
    layerRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return;
    if (editingId) commitText();
    layerRef.current?.focus({ preventScroll: true });
    const handle = (event.target as HTMLElement).dataset.handle as Handle | undefined;
    if (handle && selectedId) {
      startDrag(event, selectedId, handle);
      return;
    }
    const point = toScene(event);
    const hit = hitTest(scene, point.x, point.y);
    onSelect(hit);
    if (hit) startDrag(event, hit, "move");
  };

  const handlePointerMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const node = scene.nodes.find((n) => n.id === drag.id);
    if (!node) return;
    const point = toScene(event);
    let dx = point.x - drag.startX;
    let dy = point.y - drag.startY;
    if (!drag.moved) {
      // Ignore the jitter of a plain click.
      if (Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      onBeginChange();
    }

    if (drag.handle === "move") {
      const centerX = drag.bounds.x + drag.bounds.w / 2 + dx;
      const centerY = drag.bounds.y + drag.bounds.h / 2 + dy;
      const snapX = Math.abs(centerX - scene.width / 2) < SNAP_DISTANCE;
      const snapY = Math.abs(centerY - scene.height / 2) < SNAP_DISTANCE;
      if (snapX) dx += scene.width / 2 - centerX;
      if (snapY) dy += scene.height / 2 - centerY;
      setGuides({ x: snapX, y: snapY });
      const current = nodeBounds(node);
      onPatch(drag.id, moveBy(node, drag.bounds.x + dx - current.x, drag.bounds.y + dy - current.y));
      return;
    }

    const { x, y, w, h } = drag.bounds;
    let left = x;
    let top = y;
    let right = x + w;
    let bottom = y + h;
    if (drag.handle.includes("w")) left = Math.min(x + dx, right - 8);
    if (drag.handle.includes("e")) right = Math.max(x + w + dx, left + 8);
    if (drag.handle.includes("n")) top = Math.min(y + dy, bottom - 8);
    if (drag.handle.includes("s")) bottom = Math.max(y + h + dy, top + 8);
    const corner = drag.handle.length === 2;
    // Corners keep the proportions of anything that isn't a plain box of
    // text, so photos and circles don't distort; hold Shift to free them.
    if (corner && !event.shiftKey && node.kind !== "rect" && w > 0 && h > 0) {
      const ratio = w / h;
      const newW = right - left;
      const newH = newW / ratio;
      if (drag.handle.includes("n")) top = bottom - newH;
      else bottom = top + newH;
    }
    onPatch(drag.id, setBounds(node, { x: left, y: top, w: right - left, h: bottom - top }, corner));
  };

  const handlePointerUp = (event: React.PointerEvent): void => {
    dragRef.current = null;
    setGuides({ x: false, y: false });
    if (layerRef.current?.hasPointerCapture(event.pointerId)) layerRef.current.releasePointerCapture(event.pointerId);
  };

  const handleDoubleClick = (event: React.MouseEvent): void => {
    const point = toScene(event);
    const hit = hitTest(scene, point.x, point.y);
    const node = scene.nodes.find((n) => n.id === hit);
    if (node?.kind === "text" && node.id) {
      onSelect(node.id);
      setDraft(node.text);
      setEditingId(node.id);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (editingId) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) props.onRedo();
      else props.onUndo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      props.onRedo();
      return;
    }
    if (!selected?.id) return;
    if (event.key === "Escape") onSelect(null);
    else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      props.onDelete(selected.id);
    } else if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      props.onDuplicate(selected.id);
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      onBeginChange();
      onPatch(selected.id, moveBy(selected, dx, dy));
    }
  };

  const percent = (value: number, total: number): string => `${(value / total) * 100}%`;
  const layerWidth = layerRef.current?.clientWidth ?? 0;
  const displayScale = layerWidth > 0 ? layerWidth / scene.width : 0.5;

  return (
    <div className="relative select-none">
      <SceneCanvas scene={scene} pixelWidth={720} className="rounded-sm shadow-xl" />
      <div
        ref={layerRef}
        tabIndex={0}
        role="application"
        aria-label="Creative canvas. Click an element to select it, drag to move, double-click text to edit."
        className="absolute inset-0 touch-none outline-none"
        style={{ cursor: dragRef.current?.handle === "move" ? "grabbing" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {guides.x && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-fuchsia-500" />}
        {guides.y && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-fuchsia-500" />}

        {bounds && selected && !editing && (
          <div
            className="pointer-events-none absolute border-2 border-sky-500"
            style={{
              left: percent(bounds.x, scene.width),
              top: percent(bounds.y, scene.height),
              width: percent(bounds.w, scene.width),
              height: percent(bounds.h, scene.height),
              transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
            }}
          >
            {/* Rotated elements are resized from the panel: dragging a handle
                of a turned box would need its centre re-solved on every move. */}
            {!selected.rotation &&
              HANDLES.map((handle) => (
                <div
                  key={handle.id}
                  data-handle={handle.id}
                  className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-500 bg-white"
                  style={{ left: handle.left, top: handle.top, cursor: handle.cursor }}
                />
              ))}
          </div>
        )}

        {editing && (
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitText}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") setEditingId(null);
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commitText();
            }}
            className="absolute resize-none rounded-sm border-2 border-sky-500 bg-white/95 p-1 text-neutral-900 outline-none"
            style={{
              left: percent(editing.x, scene.width),
              top: percent(editing.y, scene.height),
              width: percent(editing.w, scene.width),
              minHeight: percent(editing.h, scene.height),
              fontFamily: `"${editing.family}", sans-serif`,
              fontWeight: editing.weight,
              fontSize: Math.max(12, Math.min(editing.size * displayScale, 40)),
              lineHeight: editing.lineHeight ?? 1.2,
              textAlign: editing.align ?? "left",
            }}
          />
        )}
      </div>
    </div>
  );
}
