import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAppMode } from "@/hooks/useAppChrome";
import { hapticSelection } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

/** How far (after damping) a pull has to go before letting go refreshes. */
const THRESHOLD = 64;
const MAX_PULL = 96;

/**
 * Pull down from the top of the page to reload it, as in a native list. Only
 * in the app (and the installed PWA): a browser tab has its own reload, and
 * its own pull-to-refresh on mobile.
 *
 * Renders the spinner that follows the finger; the page passes what
 * reloading means for it.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const appMode = useAppMode();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    if (!appMode) return;
    let startY: number | null = null;
    let current = 0;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      // Only from the very top, and not from inside a dialog or a sheet.
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1) return;
      if ((e.target as Element | null)?.closest?.('[role="dialog"], [data-vaul-drawer]')) return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        current = 0;
        setPull(0);
        return;
      }
      current = Math.min(dy * 0.5, MAX_PULL);
      if (!armed && current >= THRESHOLD) {
        armed = true;
        hapticSelection();
      } else if (armed && current < THRESHOLD) {
        armed = false;
      }
      setPull(current);
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      const release = current >= THRESHOLD;
      current = 0;
      armed = false;
      setPull(0);
      if (!release) return;
      busy.current = true;
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        busy.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [appMode]);

  if (!appMode || (pull === 0 && !refreshing)) return null;

  const offset = refreshing ? THRESHOLD : pull;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: "calc(var(--app-header-h, 4rem) - 2.25rem)", transform: `translateY(${offset}px)`, transition: pull ? "none" : "transform 0.2s ease-out" }}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md",
          (refreshing || pull >= THRESHOLD) && "text-primary",
        )}
        style={{ opacity: refreshing ? 1 : Math.min(pull / THRESHOLD, 1) }}
      >
        <RefreshCw
          className={cn("h-4 w-4", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 270}deg)` }}
        />
        <span className="sr-only">{refreshing ? "Refreshing" : ""}</span>
      </span>
    </div>
  );
}
