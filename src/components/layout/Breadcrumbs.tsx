import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

/**
 * A "Home › Page" trail for the public pages, so a visitor who lands deep in
 * the site from a search result can see where they are and step back up.
 * The matching `BreadcrumbList` structured data is written into each page's
 * HTML at build time (see `src/lib/seo/prerender.ts`).
 */
const LABELS: Record<string, string> = {
  features: "Features",
  pricing: "Pricing",
  about: "About",
  contact: "Contact",
  faqs: "FAQs",
  docs: "Documentation",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  cookies: "Cookie Policy",
  refunds: "Refund Policy",
  gdpr: "GDPR Notice",
  accessibility: "Accessibility",
  "data-deletion": "Delete my data",
  events: "Events",
  discover: "Discover",
  "event-management-software": "Event Management Software",
  "event-ticketing-platform": "Event Ticketing Platform",
  "conference-management-platform": "Conference Management Platform",
  "webinar-platform-india": "Webinar Platform",
};

/** "refund-policy" → "Refund policy", for a page with no label of its own. */
function fallbackLabel(segment: string): string {
  const words = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The trail for a path: every segment, each linking to its own level. Pure. */
export function breadcrumbTrail(pathname: string): Array<{ label: string; to: string }> {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, index) => ({
    label: LABELS[segment] ?? fallbackLabel(segment),
    to: `/${segments.slice(0, index + 1).join("/")}`,
  }));
}

export function Breadcrumbs({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  const trail = breadcrumbTrail(pathname);
  if (trail.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <li>
          <Link to="/" className="rounded hover:text-foreground hover:underline underline-offset-4">
            Home
          </Link>
        </li>
        {trail.map((crumb, index) => {
          const current = index === trail.length - 1;
          return (
            <li key={crumb.to} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              {current ? (
                <span aria-current="page" className="font-medium text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className="rounded hover:text-foreground hover:underline underline-offset-4">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
