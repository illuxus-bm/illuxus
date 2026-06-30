import { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import SiteHeader from "@/components/SiteHeader";

/**
 * Shared chrome for every footer-linked public marketing page (Features,
 * Pricing, Docs, FAQs, About, Contact, Privacy, Terms, Cookies).
 *
 * Previously each of those pages opened with their own
 * `<div className="min-h-screen bg-background"><SiteHeader />...</div>`
 * wrapper, which used the muted theme tokens (a flat near-white in light,
 * a flat near-black in dark). The landing page itself uses a darker
 * `#09090B` canvas and a subtle indigo/violet radial gradient overlay in
 * dark mode plus the glassy `landingMode` variant of `SiteHeader`, so
 * clicking from the footer into Docs / FAQs / Pricing visibly broke the
 * theme. This shell hoists that landing canvas into one place so every
 * marketing surface inherits the same chrome.
 *
 * Behaviour:
 *   - `data-landing="true"` is set so any landing-targeted CSS hooks fire.
 *   - The radial gradient is dark-mode only — light mode keeps the clean
 *     white canvas so prose stays readable.
 *   - `overflow-x-hidden` matches the landing wrapper and prevents the
 *     gradient bleed from triggering horizontal scroll on narrow mobile.
 *   - `<SiteHeader landingMode />` is rendered for the user automatically.
 *     If a page genuinely needs the muted header (a dashboard page that
 *     reuses this shell, for example), pass `landingHeader={false}`.
 */
export function PublicPageShell({
  children,
  className = "",
  landingHeader = true,
}: {
  children: ReactNode;
  /** Extra classes to merge onto the outer wrapper. */
  className?: string;
  /** Render `<SiteHeader landingMode />` (default). Pass false for muted header. */
  landingHeader?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <div
      data-landing="true"
      className={`${theme === "dark" ? "dark" : ""} relative min-h-screen overflow-x-hidden bg-white dark:bg-[#09090B] text-gray-900 dark:text-white ${className}`}
      style={{
        backgroundImage:
          theme === "dark"
            ? "radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.10), transparent 70%)," +
              "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.08), transparent 70%)"
            : undefined,
      }}
    >
      <div className="print:hidden">
        <SiteHeader landingMode={landingHeader} />
      </div>
      {children}
    </div>
  );
}

export default PublicPageShell;
