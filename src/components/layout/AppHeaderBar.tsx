import type { CSSProperties, ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarTrigger, useOptionalSidebar } from "@/components/ui/sidebar";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";

/**
 * The one app header. Every surface — organiser dashboard, event pages,
 * community, public site, logged in or out — renders this bar, so height,
 * padding, logo and the sidebar button are identical everywhere:
 *
 *   [☰ when the page has a sidebar] [illuxus]  ………  [page-specific actions]
 *
 * Height is 56px plus the status-bar inset, exposed as `--app-header-h`
 * (index.css) so sidebars and sheets can start directly below it. Only the
 * right-hand actions differ between surfaces.
 */
export function AppHeaderBar({
  actions,
  leading,
  brandName = "illuxus",
  className,
  style,
}: {
  /** Right-hand controls (theme toggle, search, account menu, …). */
  actions: ReactNode;
  /** Optional extra element after the logo, e.g. the Super Admin badge. */
  leading?: ReactNode;
  brandName?: string;
  /** Surface overrides (themed event pages, marketing landing glass). */
  className?: string;
  style?: CSSProperties;
}) {
  // The menu button appears whenever the page has a sidebar — never in a
  // page-specific second row — so it's always in the same place.
  const hasSidebar = useOptionalSidebar() !== null;

  return (
    <header
      className={cn(
        "app-chrome sticky top-0 z-50 border-b border-border bg-card pt-[env(safe-area-inset-top)]",
        className,
      )}
      style={style}
    >
      <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {hasSidebar && (
            <SidebarTrigger className="h-8 w-8 -ml-1 shrink-0" aria-label="Toggle sidebar">
              <Menu className="h-4 w-4" />
            </SidebarTrigger>
          )}
          <a href="https://illuxus.com" className="flex items-center shrink-0" aria-label={`${brandName} home`}>
            <IlluxusWordmark height={22} ariaLabel="" className="shrink-0" />
          </a>
          {leading}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">{actions}</div>
      </div>
    </header>
  );
}

export default AppHeaderBar;
