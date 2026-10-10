/**
 * In-app "Back" that never leaves the app or lands on an auth screen.
 *
 * `navigate(-1)` alone is unsafe for header back arrows: the previous history
 * entry can be the login page (right after signing in), another website, or
 * nothing at all (a link opened in a new tab). `window.history.length` can't
 * tell these apart — it also counts other sites' entries.
 *
 * React Router stores an `idx` in `history.state` for every entry it creates.
 * `HistoryTracker` records which path sits at each index, so `useAppBack`
 * can check the previous entry before going back, and otherwise navigate to
 * a fallback route.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const pathAtIndex = new Map<number, string>();

/** Pages a Back arrow must never return to. */
const NON_RETURNABLE = /^\/(login|reset-password|complete-profile|onboarding)(\/|$|\?)/;

function currentIdx(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/** Mount once inside the router. Renders nothing. */
export function HistoryTracker() {
  const location = useLocation();
  useEffect(() => {
    const idx = currentIdx();
    if (idx !== null) pathAtIndex.set(idx, location.pathname + location.search);
  }, [location]);
  return null;
}

/** Returns a handler that goes back within the app, or to `fallback`. */
export function useAppBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = currentIdx();
    const previous = idx !== null && idx > 0 ? pathAtIndex.get(idx - 1) : undefined;
    if (previous && !NON_RETURNABLE.test(previous)) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
