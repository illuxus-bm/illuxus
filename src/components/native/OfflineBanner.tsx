import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useAppMode } from "@/hooks/useAppChrome";
import { isNativeApp } from "@/lib/native/platform";

/**
 * "You're offline" while the device has no connection, in the app and the
 * installed PWA, where there is no browser chrome to say so. Pages that were
 * already loaded keep working from the cache (vite.config.ts) meanwhile.
 */
export function OfflineBanner() {
  const appMode = useAppMode();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    if (!appMode) return;
    if (isNativeApp()) {
      // The OS knows better than the web view, which can report stale state.
      let handle: { remove: () => Promise<void> } | null = null;
      let cancelled = false;
      void import("@capacitor/network").then(async ({ Network }) => {
        const status = await Network.getStatus();
        if (cancelled) return;
        setOnline(status.connected);
        handle = await Network.addListener("networkStatusChange", (s) => setOnline(s.connected));
        if (cancelled) void handle.remove();
      });
      return () => { cancelled = true; void handle?.remove(); };
    }
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [appMode]);

  if (!appMode || online) return null;
  return (
    <div
      role="status"
      className="app-chrome pointer-events-none fixed inset-x-0 z-[70] flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium text-background shadow-lg">
        <WifiOff className="h-3.5 w-3.5" /> You're offline
      </span>
    </div>
  );
}
