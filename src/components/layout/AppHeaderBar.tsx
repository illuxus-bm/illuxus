import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hexToRgb, perceivedLuminance } from "@/lib/theme-contrast";
import { SidebarTrigger, useOptionalSidebar } from "@/components/ui/sidebar";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";

/**
 * The one app header. Every surface — public site, organiser dashboard,
 * event pages, community, super admin, logged in or out — renders it, so the
 * look, the sizes and where things sit are identical everywhere:
 *
 *   [☰ if the page has a sidebar] [illuxus] [leading]  ··  [nav]  ··  [actions]
 *
 * It is not a bar. Each control is its own chip floating over the page
 * (`float-chip`, index.css) and the header only places them; the page
 * scrolls underneath and the gaps between chips stay clickable. The logo is
 * the exception: it is the plain wordmark, flat on the page, with no chip
 * around it. Once the page has scrolled, what passes under the header fades
 * into the page's canvas, so nothing runs into the logo. Its height is
 * exposed as `--app-header-h` (index.css) so sticky content can start below
 * it. Only what goes in the three slots differs between surfaces.
 */
export function AppHeaderBar({
  actions,
  leading,
  nav,
  navWideOnly = false,
  brandName = "illuxus",
  canvasColor,
  className,
}: {
  /** Right-hand chips (theme switch, search, account menu, …). */
  actions: ReactNode;
  /** Chips beside the logo, e.g. the workspace or the Super Admin badge. */
  leading?: ReactNode;
  /** The surface's destinations, centred. Below `lg` they take a second row. */
  nav?: ReactNode;
  /** For destinations that only exist from `lg` up: no second row is kept for them. */
  navWideOnly?: boolean;
  brandName?: string;
  /**
   * Hex background of a page that has its own design theme (event and
   * organisation pages). The logo and the haze sit straight on the canvas,
   * so they follow it; without it the canvas is the app theme's.
   */
  canvasColor?: string;
  className?: string;
}) {
  // The menu button appears whenever the page has a sidebar — never in a
  // page-specific second row — so it's always in the same place.
  const hasSidebar = useOptionalSidebar() !== null;

  // Nothing is under the chips until the page scrolls, so the haze behind
  // them (index.css) stays off till then: on a textured canvas it would
  // otherwise show as a band.
  const [scrolled, setScrolled] = useState(false);
  // Phones, on surfaces with a menu row: once the page scrolls, the top row
  // slides away and the menu row stays pinned on its own.
  const [collapsed, setCollapsed] = useState(false);
  const collapsible = !!nav && !navWideOnly;
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      setCollapsed(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const canvas = canvasColor ? hexToRgb(canvasColor) : null;
  const topRow = cn(
    collapsible && "max-lg:transition-[max-height,opacity] max-lg:duration-200",
    collapsible && (collapsed ? "max-lg:pointer-events-none max-lg:max-h-0 max-lg:overflow-hidden max-lg:opacity-0" : "max-lg:max-h-16"),
  );

  return (
    <header
      data-scrolled={scrolled}
      style={canvas ? ({ "--float-haze": `rgb(${canvas.r} ${canvas.g} ${canvas.b} / 0.6)` } as CSSProperties) : undefined}
      className={cn(
        "float-header app-chrome sticky top-0 z-50 flex flex-wrap items-center gap-x-2 gap-y-2.5 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4 lg:gap-x-3 lg:px-6 lg:pb-4 lg:pt-[calc(1rem+env(safe-area-inset-top))]",
        collapsible && collapsed && "max-lg:gap-y-0",
        className,
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2 lg:flex-1", topRow)}>
        {hasSidebar && (
          <SidebarTrigger className="shell-icon-btn float-chip shrink-0" aria-label="Toggle sidebar" />
        )}
        <a
          href="https://illuxus.com"
          className="pointer-events-auto flex h-9 shrink-0 items-center px-1 lg:h-10"
          aria-label={`${brandName} home`}
        >
          <IlluxusWordmark
            height={22}
            variant={canvasColor ? (perceivedLuminance(canvasColor) > 0.55 ? "light" : "dark") : "auto"}
            ariaLabel=""
          />
        </a>
        {leading}
      </div>
      {nav && (
        <div className={cn("min-w-0 justify-center lg:flex", navWideOnly ? "hidden" : "order-last flex w-full lg:order-none lg:w-auto")}>
          {nav}
        </div>
      )}
      <div className={cn("ml-auto flex shrink-0 items-center gap-1.5 lg:flex-1 lg:justify-end", topRow)}>{actions}</div>
    </header>
  );
}

export default AppHeaderBar;
