/**
 * Screens that draw dark art under the status bar whatever the theme (the
 * app's welcome and sign-in screens) ask for light status-bar icons while
 * they are showing; NativeBridge combines that with the theme. Without it,
 * light mode would put dark icons on the dark art, where they can't be read.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

let darkScreens = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Call from a screen whose top edge is always dark. `belowWidth` limits it to
 * narrower layouts (e.g. the sign-in screen's art only tops the page on
 * phones); it follows rotation and resizing.
 */
export function useDarkScreenBars(active = true, belowWidth?: number) {
  const [narrow, setNarrow] = useState(() => matchesBelow(belowWidth));
  useEffect(() => {
    if (belowWidth === undefined || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${belowWidth - 1}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [belowWidth]);

  const on = active && narrow;
  useEffect(() => {
    if (!on) return;
    darkScreens += 1;
    notify();
    return () => {
      darkScreens -= 1;
      notify();
    };
  }, [on]);
}

function matchesBelow(width: number | undefined): boolean {
  if (width === undefined) return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(`(max-width: ${width - 1}px)`).matches;
}

/** True while any always-dark screen is showing. */
export function useDarkScreenShowing(): boolean {
  return useSyncExternalStore(subscribe, () => darkScreens > 0, () => false);
}

/**
 * Whether the page draws under the status bar (edge to edge). Always so on
 * iOS; on Android only with a recent WebView (Capacitor passes the insets
 * through from WebView 140). Otherwise the bars sit outside the page, over
 * the native window's colour, which follows the app's theme instead.
 * Watches an invisible element padded by the inset, so it updates when the
 * shell reports insets after load, or on rotation.
 */
export function usePageUnderStatusBar(enabled = true): boolean {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);";
    document.body.appendChild(probe);
    const measure = () => setUnder((parseFloat(getComputedStyle(probe).paddingTop) || 0) > 0);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(probe);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      probe.remove();
    };
  }, [enabled]);
  return under;
}
