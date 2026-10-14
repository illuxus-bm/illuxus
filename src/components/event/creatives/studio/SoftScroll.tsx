/**
 * SoftScroll — a scroll area with no visible scrollbar.
 *
 * It scrolls by touch, wheel, trackpad and keyboard as usual. Since a hidden
 * scrollbar gives no hint that there is more to see, the edges that have
 * content beyond them fade out, and (for rows) arrow buttons appear on
 * devices with a mouse. The selected item is kept in view.
 */
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Edges { l: boolean; r: boolean; t: boolean; b: boolean }
const NO_EDGES: Edges = { l: false, r: false, t: false, b: false };

interface SoftScrollProps extends HTMLAttributes<HTMLDivElement> {
  /** Show previous / next buttons when the content overflows sideways. */
  arrows?: boolean;
  /** Changes when the selection changes, to bring the selected item into view. */
  activeKey?: string;
  /** Classes for the outer wrapper (the scroller itself takes `className`). */
  wrapperClassName?: string;
  children: ReactNode;
}

export function SoftScroll({ arrows = false, activeKey, wrapperClassName, className, children, ...rest }: SoftScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>(NO_EDGES);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next: Edges = {
      l: el.scrollLeft > 2,
      r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      t: el.scrollTop > 2,
      b: el.scrollTop + el.clientHeight < el.scrollHeight - 2,
    };
    setEdges((prev) => (prev.l === next.l && prev.r === next.r && prev.t === next.t && prev.b === next.b ? prev : next));
  }, []);

  // Content changes (a filtered list, a different set of designs) alter the
  // scrollable size without resizing the element, so re-measure on every render.
  useEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", measure); ro?.disconnect(); };
  }, [measure]);

  // Keep the selected item visible without moving the page itself.
  useEffect(() => {
    const el = ref.current;
    if (!el || activeKey === undefined) return;
    const item = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], [aria-current="page"]');
    if (!item) return;
    const box = el.getBoundingClientRect();
    const it = item.getBoundingClientRect();
    const pad = 32;
    let dx = 0, dy = 0;
    if (it.left < box.left + pad) dx = it.left - box.left - pad;
    else if (it.right > box.right - pad) dx = it.right - box.right + pad;
    if (it.top < box.top + pad) dy = it.top - box.top - pad;
    else if (it.bottom > box.bottom - pad) dy = it.bottom - box.bottom + pad;
    if (dx || dy) el.scrollBy({ left: dx, top: dy });
  }, [activeKey]);

  const page = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.8) });
  };

  const arrow = "absolute top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-opacity hover:bg-muted [@media(hover:hover)]:flex";

  return (
    <div className={cn("relative min-w-0", wrapperClassName)}>
      <div
        ref={ref}
        data-fade-l={edges.l ? "" : undefined}
        data-fade-r={edges.r ? "" : undefined}
        data-fade-t={edges.t ? "" : undefined}
        data-fade-b={edges.b ? "" : undefined}
        className={cn("scroll-soft", className)}
        {...rest}
      >
        {children}
      </div>
      {arrows && edges.l && (
        <button type="button" aria-label="Scroll back" onClick={() => page(-1)} className={cn(arrow, "left-0")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {arrows && edges.r && (
        <button type="button" aria-label="Scroll forward" onClick={() => page(1)} className={cn(arrow, "right-0")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
