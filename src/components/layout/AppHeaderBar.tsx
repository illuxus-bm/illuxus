import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hexToRgb, perceivedLuminance } from "@/lib/theme-contrast";
import { SidebarTrigger, useOptionalSidebar } from "@/components/ui/sidebar";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { Link } from "react-router-dom";
import { useAppMode } from "@/hooks/useAppChrome";
import { HeaderNavRoom } from "@/components/layout/header-nav-room";

/** Width of an element's visible children, first left edge to last right edge. */
function childrenSpan(el: HTMLElement): number {
  const rects = Array.from(el.children)
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0);
  if (rects.length === 0) return 0;
  return Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
}

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
  // In the app the logo is the way home inside it, not to the website.
  const appMode = useAppMode();

  // Nothing is under the chips until the page scrolls, so the haze behind
  // them (index.css) stays off till then: on a textured canvas it would
  // otherwise show as a band.
  const [scrolled, setScrolled] = useState(false);
  // Phones, on surfaces with a menu row: once the page scrolls, the top row
  // goes away and the menu row stays pinned on its own. The header never
  // changes height for this — it pins itself higher (`data-pin-menu`,
  // index.css) so the top row scrolls off with the page. Shrinking the
  // header instead moved the page under the reader, which moved the scroll
  // position back across the threshold, and the rows flickered.
  const [collapsed, setCollapsed] = useState(false);
  const collapsible = !!nav && !navWideOnly;
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      setCollapsed(window.scrollY > 24);
    };
    // Read the restored scroll position after the first frame has been laid
    // out; reading it during mount forced a full-page layout (~150 ms).
    let timer: number | undefined;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(onScroll, 0);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // How far down the header the menu row starts, so it can pin there.
  // Measured, because the top row is taller when its chips wrap.
  const headerRef = useRef<HTMLElement>(null);
  const menuRowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const row = menuRowRef.current;
    if (!collapsible || !header || !row) return;
    const measure = () => header.style.setProperty("--menu-row-top", `${row.offsetTop}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [collapsible]);

  // From `lg` the nav shares the row with both sides, which never shrink below
  // their chips; what is left is the nav's room (HeaderNavRoom). Measured from
  // the sides' contents, not the nav, so the nav switching between names and
  // icons never feeds back into the measurement.
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [navRoom, setNavRoom] = useState<number | null>(null);
  const hasNav = !!nav;
  useLayoutEffect(() => {
    const header = headerRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!hasNav || !header || !left || !right) return;
    const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 1024px)") : null;
    const measure = () => {
      if (!wide?.matches) return setNavRoom(null);
      const cs = getComputedStyle(header);
      const inner = header.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap) || 0;
      setNavRoom(Math.max(0, Math.floor(inner - childrenSpan(left) - childrenSpan(right) - 2 * gap)));
    };
    measure();
    wide?.addEventListener?.("change", measure);
    if (typeof ResizeObserver === "undefined") return () => wide?.removeEventListener?.("change", measure);
    // The header for the window's width; each chip for its own (a name
    // loading, the badge's label appearing); and chips coming and going
    // without this component re-rendering (the avatar once the user loads).
    const observer = new ResizeObserver(measure);
    const watchChips = () => {
      observer.disconnect();
      observer.observe(header);
      for (const el of [...Array.from(left.children), ...Array.from(right.children)]) observer.observe(el);
    };
    watchChips();
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      watchChips();
      measure();
    });
    mutations?.observe(left, { childList: true });
    mutations?.observe(right, { childList: true });
    return () => {
      observer.disconnect();
      mutations?.disconnect();
      wide?.removeEventListener?.("change", measure);
    };
  });

  const canvas = canvasColor ? hexToRgb(canvasColor) : null;
  // Fading only — no size change, so nothing below moves.
  const topRow = cn(
    collapsible && "max-lg:transition-opacity max-lg:duration-200",
    collapsible && collapsed && "max-lg:pointer-events-none max-lg:opacity-0",
  );

  const wordmark = (
    <IlluxusWordmark
      height={22}
      variant={canvasColor ? (perceivedLuminance(canvasColor) > 0.55 ? "light" : "dark") : "auto"}
      ariaLabel=""
    />
  );
  const logoClass = "pointer-events-auto flex h-9 shrink-0 items-center px-1 lg:h-10";

  return (
    <header
      ref={headerRef}
      data-scrolled={scrolled}
      data-pin-menu={collapsible || undefined}
      style={canvas ? ({
        "--float-haze": `rgb(${canvas.r} ${canvas.g} ${canvas.b} / 0.6)`,
        "--float-haze-solid": `rgb(${canvas.r} ${canvas.g} ${canvas.b} / 0.94)`,
      } as CSSProperties) : undefined}
      className={cn(
        "float-header app-chrome sticky top-0 z-50 flex flex-wrap items-center lg:flex-nowrap gap-x-2 gap-y-2.5 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4 lg:gap-x-3 lg:px-6 lg:pb-4 lg:pt-[calc(1rem+env(safe-area-inset-top))]",
        className,
      )}
    >
      <div ref={leftRef} className={cn("flex min-w-0 items-center gap-2 lg:min-w-max lg:flex-1", topRow)}>
        {hasSidebar && (
          <SidebarTrigger className="shell-icon-btn float-chip shrink-0" aria-label="Toggle sidebar" />
        )}
        {appMode ? (
          <Link to="/" className={logoClass} aria-label={`${brandName} home`}>{wordmark}</Link>
        ) : (
          <a href="https://illuxus.com" className={logoClass} aria-label={`${brandName} home`}>{wordmark}</a>
        )}
        {leading}
      </div>
      {nav && (
        <div ref={menuRowRef} className={cn("min-w-0 justify-center lg:flex", navWideOnly ? "hidden" : "order-last flex w-full lg:order-none lg:w-auto")}>
          <HeaderNavRoom.Provider value={navRoom}>{nav}</HeaderNavRoom.Provider>
        </div>
      )}
      <div ref={rightRef} className={cn("ml-auto flex shrink-0 items-center gap-1.5 lg:min-w-max lg:flex-1 lg:justify-end", topRow)}>{actions}</div>
    </header>
  );
}

export default AppHeaderBar;
