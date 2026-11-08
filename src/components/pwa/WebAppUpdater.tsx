import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/native/platform";
import { logger } from "@/lib/observability";
import {
  alreadyTriedFor,
  canReloadAt,
  CHECK_INTERVAL_MS,
  fetchLatestBuild,
  FRESH_WINDOW_MS,
  isNewerBuild,
  reloadToLatest,
  removeRetiredCaches,
  RESUME_AFTER_MS,
  type UpdateMoment,
} from "@/lib/web-update";

const TOAST_ID = "web-update-ready";

/**
 * Keeps the website on the latest deploy (see lib/web-update.ts): registers
 * the service worker, looks for a newer build when the page opens, comes back
 * to the foreground, goes online, and every 10 minutes, and reloads into it
 * at a harmless moment, or offers "Refresh". Renders nothing. The iOS /
 * Android app updates itself instead (components/native/AppLiveUpdate).
 */
export function WebAppUpdater() {
  if (isNativeApp() || import.meta.env.DEV) return null;
  return <WebUpdater />;
}

function WebUpdater() {
  const { pathname } = useLocation();
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  /** The newer build that's live, once found. */
  const latest = useRef<string | null>(null);
  /** When the page last opened or came back from a long time away. */
  const freshSince = useRef(Date.now());
  const touched = useRef(false);
  const toastShown = useRef<string | null>(null);

  useRegisterSW({
    onRegisteredSW(swUrl, reg) {
      registration.current = reg ?? null;
      logger.info("pwa.sw_registered", { url: swUrl, scope: reg?.scope });
    },
    onRegisterError(err) {
      logger.warn("pwa.sw_register_failed", {
        error_name: (err as Error)?.name,
        error_message: (err as Error)?.message,
      });
    },
  });

  const reload = useCallback((build: string, thorough: boolean) => {
    logger.info("pwa.update_reload", { build, thorough });
    void reloadToLatest(build, thorough);
  }, []);

  /**
   * Reload now if the moment allows ("busy": the person is in the middle of
   * something, so never); otherwise offer it.
   */
  const apply = useCallback(
    (moment: UpdateMoment | "busy") => {
      const build = latest.current;
      if (!build) return;
      const tried = alreadyTriedFor(build);
      if (!tried && moment !== "busy" && canReloadAt(moment)) return reload(build, false);
      if (toastShown.current === build) return;
      toastShown.current = build;
      toast("A new version of illuxus is ready", {
        id: TOAST_ID,
        description: "Refresh to update. It takes a second.",
        duration: Infinity,
        // A plain reload already failed to bring it in: clear the caches too.
        action: { label: "Refresh", onClick: () => reload(build, tried) },
      });
    },
    [reload],
  );

  const check = useCallback(async () => {
    // Also fetches a new service worker, which installs in the background.
    registration.current?.update().catch(() => undefined);
    const build = await fetchLatestBuild();
    if (!isNewerBuild(build)) return;
    if (latest.current !== build) logger.info("pwa.update_available", { build });
    latest.current = build;
    // Untouched since it opened: reloading now is part of opening the app.
    const fresh = !touched.current && Date.now() - freshSince.current < FRESH_WINDOW_MS;
    apply(fresh ? "fresh" : "busy");
  }, [apply]);

  // Looks for a new deploy: now, on return, back online, and periodically.
  useEffect(() => {
    void removeRetiredCaches();
    void check();

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= RESUME_AFTER_MS) {
        // Back after a long while: like opening the app again.
        freshSince.current = Date.now();
        touched.current = false;
      }
      void check();
    };
    const onOnline = () => void check();
    const onTouch = () => {
      touched.current = true;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHECK_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pointerdown", onTouch, { capture: true, passive: true });
    window.addEventListener("keydown", onTouch, { capture: true, passive: true });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      window.removeEventListener("keydown", onTouch, { capture: true });
    };
  }, [check]);

  // Moving to another page with a newer build live: load it from that build.
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (latest.current) apply("navigation");
  }, [pathname, apply]);

  return null;
}

export default WebAppUpdater;
