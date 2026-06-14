import { useLocation } from "react-router-dom";
import { useEffect } from "react";

import { logger } from "@/lib/observability";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn("not-found route", { pathname: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 text-center">
      {/* Brand wordmark — present even on the 404 surface */}
      <a href="/" className="mb-8 inline-flex" aria-label="illuxus home">
        <IlluxusWordmark height={28} ariaLabel="" />
      </a>
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
      <a href="/" className="text-primary underline hover:text-primary/90">
        Return to Home
      </a>
    </div>
  );
};

export default NotFound;
