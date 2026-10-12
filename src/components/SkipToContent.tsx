/**
 * "Skip to main content" — the first thing a keyboard user reaches on every
 * page, so they can jump past the header and navigation instead of tabbing
 * through all of it on each page load. Invisible until focused.
 *
 * Pages mark their content in different ways (most use `<main>`, some only a
 * heading), so rather than require every page to carry a matching id, the
 * link finds the content when it is used.
 */
export function findMainContent(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>("main, [role='main'], #main-content, h1");
}

export function SkipToContent() {
  const skip = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    const target = findMainContent();
    if (!target) return;
    event.preventDefault();
    // Not every target is focusable by default; -1 lets script focus it
    // without adding it to the tab order.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  };

  return (
    <a
      href="#main-content"
      onClick={skip}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[1000] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  );
}

export default SkipToContent;
