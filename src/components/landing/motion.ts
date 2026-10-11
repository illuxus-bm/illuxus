import { useEffect, useRef, useState, type RefObject } from "react";

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Linear 0→1 as `p` travels from `a` to `b`. */
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Smoothstep easing. */
export const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Visibility of a block that owns the `[a, b]` slice of a scroll timeline:
 * fades in over `fade` after `a` and out over `fade` before `b`.
 */
export function windowed(p: number, a: number, b: number, fade = 0.035) {
  const fadeIn = a <= 0 ? 1 : span(p, a, a + fade);
  const fadeOut = b >= 1 ? 0 : span(p, b - fade, b);
  return { opacity: ease(fadeIn) * (1 - ease(fadeOut)), fadeIn, fadeOut };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(ref: RefObject<T>, rootMargin = "0px 0px -8% 0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** True while the element is anywhere near the viewport. */
export function useNearViewport<T extends Element>(ref: RefObject<T>, rootMargin = "25% 0px 25% 0px") {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[entries.length - 1].isIntersecting),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return near;
}

/* ─── Scroll frame bus ──────────────────────────────────────────────────────
   One passive scroll/resize listener for the whole page. Subscribers run at
   most once per animation frame and measure their own element, so nothing
   caches positions that could go stale when content above changes height. */
type FrameListener = () => void;
const listeners = new Set<FrameListener>();
let scheduled = false;

function flush() {
  scheduled = false;
  listeners.forEach((listener) => listener());
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

export function onScrollFrame(listener: FrameListener) {
  if (listeners.size === 0) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  }
  listeners.add(listener);
  schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    }
  };
}

/**
 * Progress of an element through the viewport: 0 when its top edge reaches
 * the bottom of the screen, 1 when its bottom edge leaves the top.
 */
export function useViewportProgress<T extends HTMLElement>(
  ref: RefObject<T>,
  onProgress: (progress: number) => void,
  enabled = true,
) {
  const callback = useRef(onProgress);
  callback.current = onProgress;
  useEffect(() => {
    if (!enabled) return;
    return onScrollFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      callback.current(clamp01((viewport - rect.top) / (viewport + rect.height)));
    });
  }, [ref, enabled]);
}

/** Subtle pointer-driven 3D tilt. Pair with the `.tilt` class. */
export function useTilt<T extends HTMLElement>(maxDeg = 5) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-y * maxDeg * 2).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * maxDeg * 2).toFixed(2)}deg`);
    };
    const leave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [maxDeg]);
  return ref;
}

/**
 * Split a headline into a plain lead and an emphasised tail, the way the
 * poster headings colour their closing words.
 */
export function splitAccent(title: string): { lead: string[]; accent: string[] } {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { lead: [], accent: words };
  const accentCount = Math.max(1, Math.round(words.length * 0.4));
  return { lead: words.slice(0, words.length - accentCount), accent: words.slice(words.length - accentCount) };
}
