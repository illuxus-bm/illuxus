import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useStandaloneMode } from "@/hooks/useStandaloneMode";
import { isNativeApp } from "@/lib/native/platform";
import { logger } from "@/lib/observability";
import { cn } from "@/lib/utils";
import { promptInstall, useInstallPrompt } from "@/lib/pwa-install";

const DISMISSED_KEY = "illuxus.pwa-install.dismissed";
// Re-show the prompt after 14 days even if dismissed previously.
const DISMISSED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function wasDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISSED_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // Storage quota or privacy mode — non-fatal.
  }
}

/**
 * Floating "Install illuxus" pill that surfaces when the browser dispatches
 * `beforeinstallprompt`. Hidden when:
 *   - already running in standalone (the user has already installed)
 *   - user dismissed within the last 14 days
 *   - the browser hasn't fired the event (Safari iOS, Firefox)
 *
 * iOS Safari doesn't expose programmatic install, so we still nudge first-time
 * mobile visitors with a one-line "Add to Home Screen" tip.
 */
export function PWAInstallPrompt() {
  // The iOS / Android app is already installed.
  const standalone = useStandaloneMode() || isNativeApp();
  const { canInstall } = useInstallPrompt();
  const [showIosTip, setShowIosTip] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Capture the deferred install prompt.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (standalone) return;
    if (wasDismissedRecently()) {
      setDismissed(true);
      return;
    }

    // iOS Safari / iPadOS: show a passive tip about Add to Home Screen.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) {
      setShowIosTip(true);
    }
  }, [standalone]);

  const handleInstall = useCallback(async () => {
    try {
      const outcome = await promptInstall();
      logger.info("pwa.install_choice", { outcome });
      if (outcome === "dismissed") {
        markDismissed();
        setDismissed(true);
      }
    } catch (err) {
      logger.warn("pwa.install_prompt_failed", {
        error_message: (err as Error)?.message,
      });
    }
  }, []);

  const handleDismiss = useCallback(() => {
    markDismissed();
    setDismissed(true);
    setShowIosTip(false);
    logger.debug("pwa.install_dismissed");
  }, []);

  if (standalone) return null;
  if (dismissed) return null;
  // The download page has its own, larger install button.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/download")) return null;

  // Chromium prompt — programmatic install.
  if (canInstall) {
    return (
      <div
        className={cn(
          "pwa-install-prompt pointer-events-auto fixed left-1/2 -translate-x-1/2 z-[80]",
          "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
          "flex items-center gap-2 px-3 py-2",
          "rounded-full border border-border bg-card/95 backdrop-blur",
          "shadow-pop",
        )}
        role="dialog"
        aria-label="Install illuxus"
      >
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Download className="h-3.5 w-3.5" />
          Install illuxus
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // iOS Safari tip — passive, only shows once per fortnight.
  if (showIosTip) {
    return (
      <div
        className={cn(
          "pwa-install-prompt pointer-events-auto fixed left-3 right-3 z-[80]",
          "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]",
          "mx-auto max-w-md",
          "flex items-center gap-2 px-3 py-2",
          "rounded-2xl border border-border bg-card/95 backdrop-blur",
          "shadow-pop",
        )}
        role="status"
        aria-label="Install illuxus on iOS"
      >
        <Download className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
        <p className="text-[12px] leading-snug text-foreground flex-1">
          Install illuxus: tap <span className="font-semibold">Share</span> in Safari, then <span className="font-semibold">Add to Home Screen</span>.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

export default PWAInstallPrompt;
