import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

import RouteSeo from "@/components/RouteSeo";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";

/** Where someone who has lost their way most likely wants to go. */
const DESTINATIONS = [
  { to: "/events", label: "Browse events", description: "See what is coming up." },
  { to: "/features", label: "Features", description: "What the platform does." },
  { to: "/pricing", label: "Pricing", description: "Plans and fees." },
  { to: "/faqs", label: "FAQs", description: "Answers to common questions." },
  { to: "/contact", label: "Contact us", description: "Tell us what you were looking for." },
];

/**
 * The page shown for any address the app has no route for.
 *
 * The host answers every address with the app, so this page cannot send a
 * real 404 status; it is marked `noindex` instead, which is what keeps such
 * addresses out of search results.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn("not-found route", { pathname: location.pathname });
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-16 text-center">
      <RouteSeo
        title="Page not found — illuxus"
        description="The page you were looking for doesn't exist or has moved."
        canonical="https://illuxus.com/404"
        noindex
      />
      <Link to="/" className="mb-8 inline-flex" aria-label="illuxus home">
        <IlluxusWordmark height={28} ariaLabel="" />
      </Link>
      <p className="text-sm font-medium uppercase tracking-widest text-primary">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">We can't find that page</h1>
      <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
        The address <code className="break-all rounded bg-background px-1.5 py-0.5 text-[13px]">{location.pathname}</code> doesn't
        match anything here. It may have moved, or the link may be mistyped.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/contact">Report a broken link</Link>
        </Button>
      </div>
      <nav aria-label="Popular pages" className="mt-10 w-full max-w-2xl">
        <ul className="grid gap-2 text-left sm:grid-cols-2">
          {DESTINATIONS.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50">
                <span className="block text-[14px] font-medium text-foreground">{item.label}</span>
                <span className="block text-[12px] text-muted-foreground">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
};

export default NotFound;
