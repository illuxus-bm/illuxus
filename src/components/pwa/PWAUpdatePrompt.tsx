import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { logger } from "@/lib/observability";

/**
 * Listens for newly-installed service workers and prompts the user with a
 * non-intrusive Sonner toast. Update only happens when the user opts in;
 * otherwise the next cold start will pick up the new version anyway.
 *
 * Mounted once near the top of the React tree (see App.tsx). It renders
 * nothing of its own — just hooks into the SW lifecycle and surfaces toasts.
 */
export function PWAUpdatePrompt() {
  const promptShownRef = useRef(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      logger.info("pwa.sw_registered", { url: swUrl, scope: registration?.scope });

      // Poll for updates every hour while the tab is open. This is a soft
      // safety net so long-lived sessions still pick up new versions.
      if (registration) {
        const interval = setInterval(
          () => {
            registration.update().catch((err) =>
              logger.debug("pwa.update_check_failed", {
                error_message: err?.message,
              }),
            );
          },
          60 * 60 * 1000,
        );

        // Best-effort cleanup: register a one-shot pagehide listener.
        window.addEventListener(
          "pagehide",
          () => clearInterval(interval),
          { once: true },
        );
      }
    },
    onRegisterError(err) {
      logger.warn("pwa.sw_register_failed", {
        error_name: (err as Error)?.name,
        error_message: (err as Error)?.message,
      });
    },
  });

  // Show "ready offline" once on first install.
  useEffect(() => {
    if (!offlineReady) return;
    toast.success("illuxus is ready to use offline", {
      description: "Pages you've already visited will load without a connection.",
      duration: 5000,
    });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  // Show "update available" prompt with an action button.
  useEffect(() => {
    if (!needRefresh || promptShownRef.current) return;
    promptShownRef.current = true;

    logger.info("pwa.update_available");

    const id = toast("A new version of illuxus is available", {
      description: "Refresh now to get the latest fixes and features.",
      duration: Infinity,
      action: {
        label: "Update",
        onClick: () => {
          logger.info("pwa.update_accepted");
          updateServiceWorker(true).catch((err) =>
            logger.error("pwa.update_failed", {
              error_message: (err as Error)?.message,
            }),
          );
        },
      },
      cancel: {
        label: "Later",
        onClick: () => {
          logger.debug("pwa.update_dismissed");
          setNeedRefresh(false);
          promptShownRef.current = false;
        },
      },
    });

    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}

export default PWAUpdatePrompt;
