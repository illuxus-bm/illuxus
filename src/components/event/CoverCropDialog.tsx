import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, RotateCcw, Undo2, Lock } from "lucide-react";

interface Props {
  open: boolean;
  /** Source image URL or data URL. */
  src: string | null;
  /** Longest side of the exported image (px). Aspect is preserved. */
  outputSize?: number;
  /** Output aspect ratio (width / height). Defaults to 1 (square). */
  aspect?: number;
  busy?: boolean;
  onCancel: () => void;
  /** Called with a JPEG Blob (matching `aspect`) after the user confirms the crop. */
  onConfirm: (blob: Blob) => void;
}

/**
 * Pan + zoom cropper that always exports a perfect 1:1 square image.
 * Uses a native canvas — no dependencies.
 */
export default function CoverCropDialog({
  open, src, outputSize = 1200, aspect = 1, busy = false, onCancel, onConfirm,
}: Props) {
  // Rectangular viewport sized by aspect; longest side is 360px.
  const VIEW_W = aspect >= 1 ? 360 : Math.round(360 * aspect);
  const VIEW_H = aspect >= 1 ? Math.round(360 / aspect) : 360;
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1); // multiplier over the "cover" base scale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px relative to viewport center
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /**
   * Aspect-ratio lock. When ON (default and recommended), zoom is applied
   * uniformly to width and height — guaranteeing the image is never scaled
   * non-uniformly (no squeeze / stretch). The control is exposed for clarity;
   * the underlying math always uses a single scale factor.
   */
  const [aspectLocked, setAspectLocked] = useState(true);

  // Undo history of {zoom, offset} snapshots — pushed before each interaction
  const historyRef = useRef<Array<{ zoom: number; offset: { x: number; y: number } }>>([]);
  const [canUndo, setCanUndo] = useState(false);

  /** Stable storage key per image source so framing persists across reopens. */
  const storageKey = src ? `cover-crop:${aspect.toFixed(3)}:${hashString(src)}` : null;

  const pushHistory = useCallback((z: number, o: { x: number; y: number }) => {
    historyRef.current.push({ zoom: z, offset: { ...o } });
    if (historyRef.current.length > 50) historyRef.current.shift();
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setZoom(prev.zoom);
    setOffset(prev.offset);
    setCanUndo(historyRef.current.length > 0);
  };

  // Load image and restore any saved framing for this src
  useEffect(() => {
    if (!open || !src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      historyRef.current = [];
      setCanUndo(false);

      // Try to restore last framing for this image
      const saved = storageKey ? readSaved(storageKey) : null;
      if (saved) {
        setZoom(saved.zoom);
        setOffset(saved.offset);
      } else {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
    };
    img.src = src;
  }, [src, open, storageKey]);

  // Base scale: how much we must scale the image so it fully covers the rectangular
  // viewport. Single shared multiplier on both axes — never squeezes.
  const baseScale = imgSize
    ? Math.max(VIEW_W / imgSize.w, VIEW_H / imgSize.h)
    : 1;
  const uniformScale = baseScale * zoom;
  const drawW = imgSize ? imgSize.w * uniformScale : 0;
  const drawH = imgSize ? imgSize.h * uniformScale : 0;

  // Clamp the offset so the image always covers the viewport
  const clampOffset = useCallback((x: number, y: number) => {
    const maxX = Math.max(0, (drawW - VIEW_W) / 2);
    const maxY = Math.max(0, (drawH - VIEW_H) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [drawW, drawH, VIEW_W, VIEW_H]);

  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
  }, [zoom, clampOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgSize) return;
    // Snapshot current framing so it can be undone
    pushHistory(zoom, offset);
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy));
  };
  const onPointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const reset = () => {
    pushHistory(zoom, offset);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // Wrap the slider so each commit is undoable (snapshot the value *before* the change)
  const zoomCommitRef = useRef<number | null>(null);
  const onZoomChange = (v: number[]) => {
    if (zoomCommitRef.current === null) zoomCommitRef.current = zoom;
    setZoom(v[0]);
  };
  const onZoomCommit = () => {
    if (zoomCommitRef.current !== null && zoomCommitRef.current !== zoom) {
      pushHistory(zoomCommitRef.current, offset);
    }
    zoomCommitRef.current = null;
  };

  const exportCropped = async () => {
    if (!imgRef.current || !imgSize) return;
    // Persist framing for this image so reopening keeps it
    if (storageKey) writeSaved(storageKey, { zoom, offset });
    // The viewport-to-source ratio: 1 viewport px == (1 / (baseScale * zoom)) source px
    const viewToSource = 1 / (baseScale * zoom);
    const sx = imgSize.w / 2 - (VIEW_W / 2 + offset.x) * viewToSource;
    const sy = imgSize.h / 2 - (VIEW_H / 2 + offset.y) * viewToSource;
    const sW = VIEW_W * viewToSource;
    const sH = VIEW_H * viewToSource;

    // Cap output so we never upscale beyond source.
    const outLong = Math.round(Math.min(Math.max(sW, sH), outputSize));
    const outW = aspect >= 1 ? outLong : Math.round(outLong * aspect);
    const outH = aspect >= 1 ? Math.round(outLong / aspect) : outLong;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, outW, outH);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    if (blob) onConfirm(blob);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>
            Drag to reposition, then zoom. The framed area is what attendees will see.
          </DialogDescription>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAspectLocked((v) => !v)}
              className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] border transition-colors ${
                aspectLocked
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              }`}
              title="When on, zoom is applied equally to width and height so the image is never squeezed"
              aria-pressed={aspectLocked}
            >
              <Lock className="h-3 w-3" />
              {aspectLocked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
            </button>
          </div>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden bg-muted touch-none select-none"
            style={{ width: VIEW_W, height: VIEW_H, cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {!imgSize && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {imgSize && src && (
              <img
                src={src}
                alt="Crop preview"
                draggable={false}
                className="absolute pointer-events-none will-change-transform"
                style={{
                  width: drawW,
                  height: drawH,
                  maxWidth: "none",
                  maxHeight: "none",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
            {/* Frame overlay (matches the public hero) */}
            <div className="absolute inset-0 ring-1 ring-inset ring-white/40 pointer-events-none" />
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/10" />
              ))}
            </div>
          </div>

          <div className="w-full px-1">
            <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1.5">
              <span>Zoom</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Undo2 className="h-3 w-3" /> Undo
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              </div>
            </div>
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={onZoomChange}
              onValueCommit={onZoomCommit}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={exportCropped} disabled={busy || !imgSize}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- helpers ----

function hashString(s: string): string {
  // Tiny, stable, non-crypto hash — enough to key localStorage per image src
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

type SavedFraming = { zoom: number; offset: { x: number; y: number } };

function readSaved(key: string): SavedFraming | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.zoom === "number" &&
      typeof parsed?.offset?.x === "number" &&
      typeof parsed?.offset?.y === "number"
    ) return parsed as SavedFraming;
    return null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: SavedFraming) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be full or disabled — silently ignore
  }
}