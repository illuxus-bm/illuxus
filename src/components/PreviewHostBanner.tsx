import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isLoginGatedPreviewHost,
  publishedHostFor,
} from "@/lib/event-routes";
import { SiteContainer } from "@/components/layout/SiteContainer";

/**
 * Banner shown on public event/org pages when the user lands on a
 * login-gated private preview domain. Offers a one-click switch to the
 * published host so end-users aren't prompted to log in.
 */
const DISMISS_KEY = "preview-host-banner-dismissed";

export default function PreviewHostBanner({ autoRedirect = false }: { autoRedirect?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isPreview = useMemo(() => isLoginGatedPreviewHost(host), [host]);
  const publicHost = useMemo(() => publishedHostFor(host), [host]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    }
  }, []);

  useEffect(() => {
    if (!autoRedirect || !isPreview || !publicHost) return;
    const url = `${window.location.protocol}//${publicHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(url);
  }, [autoRedirect, isPreview, publicHost]);

  if (!isPreview || dismissed) return null;

  const targetUrl = publicHost
    ? `${window.location.protocol}//${publicHost}${window.location.pathname}${window.location.search}${window.location.hash}`
    : null;

  return (
    <div className="sticky top-0 z-50 w-full border-b border-border bg-secondary text-foreground">
      <SiteContainer className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-0">
          You're viewing a private preview that requires sign-in.
          {targetUrl ? " Open the public version instead." : " Use the published domain to share this page."}
        </span>
        {targetUrl && (
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <a href={targetUrl}>
              <ExternalLink className="h-3 w-3" /> Open public page
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px]"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </Button>
      </SiteContainer>
    </div>
  );
}