import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { isNativeApp } from "@/lib/native/platform";

/** True in the iOS / Android app and in the installed PWA. */
export function useAppMode(): boolean {
  const standalone = useStandaloneMode();
  return isNativeApp() || standalone;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

/**
 * Full-screen flows and separate portals: no tab bar, so nothing invites
 * leaving half-way (sign-in, onboarding, a live stage, check-in), and the
 * sponsor / speaker / partner portals and the super admin keep their own
 * navigation.
 */
const NO_TAB_BAR = [
  // "/" in the app is the welcome screen (signed out) or a redirect.
  "/",
  "/login", "/reset-password", "/activate", "/invite", "/complete-profile", "/onboarding",
  "/e/", "/checkin", "/checkout", "/certificates/", "/support/",
  "/sponsor", "/speaker", "/partner",
  "/dashboard/admin", "/dashboard/events/new", "/__preview",
];

export type TabSet = "organiser" | "attendee" | "guest";

/**
 * Whether the bottom tab bar is showing, and whose tabs it carries. Read by
 * the tab bar itself and by the headers, which drop the destinations the tab
 * bar has taken over.
 */
export function useAppTabBar(): { visible: boolean; set: TabSet } {
  const appMode = useAppMode();
  const narrow = useMediaQuery("(max-width: 1023px)");
  const { pathname } = useLocation();
  const { user, isAdmin, accountType } = useAuth();
  const { memberships } = useOrg();

  const set: TabSet = !user
    ? "guest"
    : isAdmin || accountType === "organizer" || memberships.length > 0
      ? "organiser"
      : "attendee";
  // "/e/" covers what is under it; "/sponsor" covers itself and what is under it.
  const routeAllows = !NO_TAB_BAR.some((p) =>
    p === "/" ? pathname === "/" : p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
  return { visible: appMode && narrow && routeAllows, set };
}
