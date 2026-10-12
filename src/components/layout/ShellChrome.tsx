/**
 * Pieces of the signed-in app shell (see `.app-shell` in index.css): the
 * logo row that heads every sidebar, and the hook that lets the sidebar run
 * the full height of the window instead of starting under a header bar.
 */
import { useEffect } from "react";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * The phone sidebar opens in a portal, outside `.app-shell`, so the CSS
 * variable that tells it where to start has to be set on the document too.
 */
export function useShellChrome(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar-top", "0px");
    return () => { root.style.removeProperty("--sidebar-top"); };
  }, []);
}

/** Logo and the collapse button. Collapsed to icons, only the button shows. */
export function ShellSidebarHeader() {
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  return (
    <div className={`flex h-[4.25rem] shrink-0 items-center ${collapsed ? "justify-center" : "justify-between pl-5 pr-3"}`}>
      {!collapsed && (
        <a href="https://illuxus.com" className="flex items-center" aria-label="illuxus home">
          <IlluxusWordmark height={24} ariaLabel="" />
        </a>
      )}
      <SidebarTrigger className="shell-icon-btn !h-8 !w-8 [&_svg]:!h-3.5 [&_svg]:!w-3.5" aria-label="Toggle sidebar" />
    </div>
  );
}
