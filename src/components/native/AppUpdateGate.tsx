import { useEffect, useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";
import { isNativeApp, nativePlatform } from "@/lib/native/platform";
import { fetchAppConfig, updateRequired, type AppConfig, type AppPlatform } from "@/lib/native/app-update";

/**
 * In the iOS / Android app only: when this version is older than the oldest
 * one illuxus.com still allows (`public/app-config.json`, lib/native/app-update),
 * covers the app with a screen asking the person to update. Checked at launch
 * and each time the app comes back to the foreground. Renders nothing in a
 * browser, and nothing when the check can't be made.
 */
export function AppUpdateGate() {
  const [blocked, setBlocked] = useState<{ config: AppConfig; platform: AppPlatform } | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    const platform = nativePlatform();
    if (platform === "web") return;
    let cancelled = false;
    let resume: { remove: () => Promise<void> } | null = null;

    const check = async () => {
      const [{ App }, config] = await Promise.all([import("@capacitor/app"), fetchAppConfig()]);
      if (cancelled || !config) return;
      const { version } = await App.getInfo();
      const required = updateRequired(config, platform, version);
      if (required) logger.warn("native.update_required", { version, minimum: config.minimumVersion[platform] });
      if (!cancelled) setBlocked(required ? { config, platform } : null);
    };

    void check().catch(() => { /* fail open */ });
    void import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("resume", () => void check().catch(() => {}));
      if (cancelled) void handle.remove();
      else resume = handle;
    });
    return () => {
      cancelled = true;
      void resume?.remove();
    };
  }, []);

  if (!blocked) return null;
  const { config, platform } = blocked;
  const store = platform === "ios" ? "the App Store" : "Google Play";
  const url = config.storeUrl[platform];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      aria-describedby="app-update-body"
      className="app-chrome fixed inset-0 z-[200] flex items-center justify-center bg-background px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <ArrowUpCircle className="h-12 w-12 text-primary" aria-hidden="true" />
        <h1 id="app-update-title" className="mt-5 text-xl font-semibold tracking-tight">Update illuxus</h1>
        <p id="app-update-body" className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {config.message ?? `This version of the app is no longer supported. Update to the latest version from ${store} to keep using illuxus.`}
        </p>
        {url ? (
          // A store link leaves the web view: Capacitor hands it to the OS,
          // which opens the store app.
          <Button className="mt-6 w-full" size="lg" onClick={() => window.location.assign(url)}>
            Update now
          </Button>
        ) : (
          <p className="mt-6 text-[13px] font-medium">Open {store} and search for illuxus.</p>
        )}
      </div>
    </div>
  );
}
