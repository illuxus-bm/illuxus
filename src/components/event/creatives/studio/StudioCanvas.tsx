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

/**
 * A small rendering used in the design picker. It fills its container's
 * width and is only drawn once it has scrolled into view, so a picker with
 * dozens of designs stays quick.
 */
export function StudioThumb({ spec, size }: { spec: StudioSpec; size: StudioSize }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);
  const fontsTick = useFontsReady(spec);
  useEffect(() => {
    const el = canvas.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !seen) return;
    const width = el.clientWidth || 96;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderStudio(el, spec, size.width, size.height, (width * dpr) / size.width);
  }, [spec, size, seen, fontsTick]);
  return <canvas ref={canvas} aria-hidden="true" style={{ width: "100%", aspectRatio: `${size.width} / ${size.height}` }} className="rounded-md block bg-muted" />;
}
