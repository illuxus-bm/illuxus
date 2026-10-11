/**
 * Canvases for the Creative Studio: the live preview, which sizes itself to
 * its container, and the small design thumbnails. Both draw through
 * `renderStudio`, the same call the PNG export uses.
 */
import { useEffect, useRef, useState } from "react";
import { ensureStudioFonts, renderStudio, type StudioSize, type StudioSpec } from "@/lib/creatives/studio/studio-render";

/** Redraw when fonts finish loading — text measured with a fallback font is the wrong size. */
function useFontsReady(spec: StudioSpec): number {
  const [tick, setTick] = useState(0);
  const key = `${spec.fonts.display}|${spec.fonts.body}`;
  useEffect(() => {
    let alive = true;
    void ensureStudioFonts(spec.fonts).then(() => { if (alive) setTick((n) => n + 1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tick;
}

export function StudioPreview({ spec, size, maxHeightVh = 62 }: { spec: StudioSpec; size: StudioSize; maxHeightVh?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const fontsTick = useFontsReady(spec);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const maxH = Math.max(220, (window.innerHeight * maxHeightVh) / 100);
      const w = Math.min(el.clientWidth, (maxH * size.width) / size.height, size.width);
      setBox({ w: Math.floor(w), h: Math.floor((w * size.height) / size.width) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [size.width, size.height, maxHeightVh]);

  useEffect(() => {
    if (!canvas.current || !box || box.w < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderStudio(canvas.current, spec, size.width, size.height, Math.min(1, (box.w * dpr) / size.width));
  }, [spec, size, box, fontsTick]);

  return (
    <div ref={wrap} className="w-full flex justify-center">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Preview: ${spec.design.name}, ${size.name}`}
        style={box ? { width: box.w, height: box.h } : { width: "100%", aspectRatio: `${size.width} / ${size.height}` }}
        className="rounded-xl shadow-lg ring-1 ring-black/10 bg-muted"
      />
    </div>
  );
}

/** A small, fixed-width rendering used in the design picker. */
export function StudioThumb({ spec, size, width = 104 }: { spec: StudioSpec; size: StudioSize; width?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fontsTick = useFontsReady(spec);
  const height = Math.round((width * size.height) / size.width);
  useEffect(() => {
    if (!canvas.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderStudio(canvas.current, spec, size.width, size.height, (width * dpr) / size.width);
  }, [spec, size, width, fontsTick]);
  return <canvas ref={canvas} aria-hidden="true" style={{ width, height }} className="rounded-md block" />;
}
