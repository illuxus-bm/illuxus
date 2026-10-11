import { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";

/**
 * Shared chrome for every footer-linked public marketing page (Features,
 * Pricing, Docs, FAQs, About, Contact, Privacy, Terms, Cookies).
 *
 * Hoists the landing canvas into one place so every marketing surface
 * shares the same chrome and follows the app theme tokens.
 *
 * Behaviour:
 *   - `data-landing="true"` is set so any landing-targeted CSS hooks fire.
 *   - `overflow-x-clip` stops stray horizontal scroll without breaking the
 *     sticky header (`overflow-x-hidden` would).
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
  return (
    <div
      data-landing="true"
      className={`relative min-h-screen overflow-x-clip bg-background text-foreground ${className}`}
    >
      <div className="print:hidden">
        <SiteHeader landingMode={landingHeader} />
      </div>
      {children}
    </div>
  );
}

export default PublicPageShell;
