import { useEffect } from "react";
import { toast } from "sonner";
import { isNativeApp, nativePlatform } from "@/lib/native/platform";
import { fetchAppConfig } from "@/lib/native/app-update";
import { applyDownloadedUpdate, CHECK_INTERVAL_MS, checkForLiveUpdate, markAppReady } from "@/lib/native/live-update";
import { logger } from "@/lib/observability";

/** Where a new app shell comes from until the store listings are live. */
const ANDROID_APK = "https://github.com/illuxus-bm/illuxus/releases/latest/download/illuxus.apk";
const PROMPTED_KEY = "illuxus.native-update.prompted";

/**
 * Keeps the iOS / Android app up to date (lib/native/live-update):
 *  - confirms each launch started fine, so a broken update rolls back;
 *  - at launch, switches to a version downloaded earlier (under the splash);
 *  - a few seconds after launch, and when the app returns after hours away,
 *    downloads a newer release in the background, for the next launch;
 *  - when a release needs a newer app shell, asks once to install it.
 * Renders nothing; does nothing in a browser.
 */
export function AppLiveUpdate() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let lastCheck = 0;
    let resume: { remove: () => Promise<void> } | null = null;

    const check = async () => {
      if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      const decision = await checkForLiveUpdate();
      logger.debug("native.live_update", { action: decision.action, ...(decision.action === "none" ? { reason: decision.reason } : { version: decision.manifest.version }) });
      if (cancelled || decision.action !== "native-update") return;

      const { version } = decision.manifest;
      try {
        if (localStorage.getItem(PROMPTED_KEY) === version) return;
        localStorage.setItem(PROMPTED_KEY, version);
      } catch { /* storage blocked: prompt anyway */ }

      const config = await fetchAppConfig();
      const platform = nativePlatform();
      const url = platform === "android" ? config?.storeUrl.android ?? ANDROID_APK : config?.storeUrl.ios;
      toast(`illuxus ${version} is available`, {
        description: url
          ? "This version needs an app update to install."
          : "Update illuxus from the App Store to get it.",
        duration: Infinity,
        ...(url ? { action: { label: "Update", onClick: () => window.location.assign(url) } } : {}),
      });
    };

    let timer: number | undefined;
    void (async () => {
      await markAppReady();
      // A version downloaded last time: switch to it now. The page reloads
      // into it, and this runs again there.
      if (await applyDownloadedUpdate()) return;
      // After launch has settled, so the check doesn't compete with first paint.
      if (!cancelled) timer = window.setTimeout(() => void check(), 4000);
    })();
    void import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("resume", () => void check());
      if (cancelled) void handle.remove();
      else resume = handle;
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void resume?.remove();
    };
  }, []);

  return null;
}
