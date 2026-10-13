import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteContent } from "@/hooks/useSiteContent";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeaderBar } from "@/components/layout/AppHeaderBar";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { HEADER_CHIP } from "@/components/layout/header-chip";
import { cn } from "@/lib/utils";

/**
 * Centralized site header used across every public segment
 * (marketing site, discover, attendee, org/event pages).
 *
 * Intentionally minimal: the Illuxus logo on the left; Discover, the theme
 * switch and an auth control on the right. Only the marketing variant
 * (landingMode) adds section links, in the centre.
 *
 * It is the same header as the dashboard's (AppHeaderBar): chips floating
 * over the page, with the same account menu. On org / event pages that have
 * their own design theme the chips keep the app's colours, so they stay
 * readable on any canvas and in both light and dark app modes. The logo has
 * no chip behind it, so those pages pass their canvas colour (`canvasColor`)
 * and the header draws the wordmark that reads on it.
 */
export default function SiteHeader({
  homeHref = "/",
  landingMode = false,
  canvasColor,
}: {
  homeHref?: string;
  /** Hex background of a page that has its own design theme, not the app's. */
  canvasColor?: string;
  /**
   * When true, the header renders the marketing landing variant:
   *  - section links as chips in the centre (from `lg` up)
   *  - "Start for free" as the rightmost chip (when signed out)
   * Other surfaces pass nothing and get the compact default.
   */
  landingMode?: boolean;
}) {
  const { user } = useAuth();
  const { content } = useSiteContent();
  const { pathname } = useLocation();
  const { brandName } = content.navbar;
  // `homeHref` is kept in the API for back-compat but the logo now always links to illuxus.com.
  void homeHref;

  // Section links for the marketing pages. On the landing page itself they
  // are plain hash links (smooth-scrolled); elsewhere they route back to it.
  const landingNav = landingMode ? (
    <nav aria-label="Sections" className="app-chrome flex items-center gap-1.5 2xl:gap-2">
      {content.navbar.links.map((link) => {
        const className = cn(HEADER_CHIP, "px-3 2xl:px-3.5");
        if (link.href.startsWith("#")) {
          return pathname === "/" ? (
            <a key={link.label} href={link.href} className={className}>{link.label}</a>
          ) : (
            <Link key={link.label} to={`/${link.href}`} className={className}>{link.label}</Link>
          );
        }
        return link.href.startsWith("/") ? (
          <Link key={link.label} to={link.href} className={className}>{link.label}</Link>
        ) : (
          <a key={link.label} href={link.href} className={className}>{link.label}</a>
        );
      })}
    </nav>
  ) : undefined;

  const onDiscover = pathname.startsWith("/discover");

  return (
    // Same header as the dashboard (AppHeaderBar): only what goes in its
    // slots is public-specific.
    <AppHeaderBar
      brandName={brandName}
      canvasColor={canvasColor}
      nav={landingNav}
      navWideOnly
      actions={<>
        {/* A circle with just the compass on phones. */}
        <Link
          to="/discover"
          title="Discover"
          aria-current={onDiscover ? "page" : undefined}
          data-active={onDiscover}
          className={cn(HEADER_CHIP, "min-w-9 sm:px-3 lg:min-w-10 2xl:px-3.5")}
        >
          <Compass className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Discover</span>
        </Link>

        <ThemeToggle floating />

        {user ? (
          <AccountMenu />
        ) : landingMode ? (
          <>
            <Link to="/login" className={cn(HEADER_CHIP, "hidden px-3 sm:inline-flex 2xl:px-3.5")}>
              Sign in
            </Link>
            <Link
              to="/login"
              className="group float-chip float-chip-solid inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10 lg:px-4"
            >
              <span className="hidden sm:inline">Start for free</span>
              <span className="sm:hidden">Sign up</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </>
        ) : (
          <Link to="/login" className={cn(HEADER_CHIP, "px-3 2xl:px-3.5")}>
            Sign in
          </Link>
        )}
      </>}
    />
  );
}
