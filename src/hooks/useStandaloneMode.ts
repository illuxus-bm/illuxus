import { useEffect, useState } from "react";

/**
 * Detects whether the app is running in installed / standalone mode
 * (Add to Home Screen on iOS, "Install" on Chrome/Edge/Safari desktop).
 *
 * Returns `true` when:
 *   - `display-mode: standalone` matches (most platforms), OR
 *   - `display-mode: window-controls-overlay` matches (Chrome desktop with WCO), OR
 *   - `window.navigator.standalone === true` (iOS Safari home-screen launch)
 *
 * Updates reactively if the user enters/exits standalone (rare, but Chrome
 * supports `change` events on the matchMedia query).
 *
 * Server-rendered / non-browser environments return `false`.
 */
export function useStandaloneMode(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => detect());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const queries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: window-controls-overlay)"),
      window.matchMedia("(display-mode: minimal-ui)"),
    ];

    const update = () => setStandalone(detect());

    for (const q of queries) {
      // Older Safari uses addListener; modern browsers use addEventListener.
      if (typeof q.addEventListener === "function") {
        q.addEventListener("change", update);
      } else if (typeof (q as MediaQueryList & { addListener?: (cb: () => void) => void }).addListener === "function") {
        (q as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(update);
      }
    }

    return () => {
      for (const q of queries) {
        if (typeof q.removeEventListener === "function") {
          q.removeEventListener("change", update);
        } else if (
          typeof (q as MediaQueryList & { removeListener?: (cb: () => void) => void }).removeListener === "function"
        ) {
          (q as MediaQueryList & { removeListener: (cb: () => void) => void }).removeListener(update);
        }
      }
    };
  }, []);

  return standalone;
}

function detect(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari exposes `navigator.standalone` rather than display-mode media
  // queries when launched from the home screen.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone) return true;
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}
