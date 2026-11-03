/**
 * Where the SPA is running: in the iOS / Android app (Capacitor), installed
 * to a home screen as a PWA, or in an ordinary browser tab.
 *
 * "App mode" is either of the first two. It turns on the phone app chrome
 * (bottom tab bar, compact header) that a browser tab doesn't get, because a
 * tab already has the browser's own chrome around it.
 */
import { Capacitor } from "@capacitor/core";

/** The canonical site, for links that leave the app (shares, emails, QR codes). */
export const SITE_ORIGIN = "https://illuxus.com";

/** True inside the iOS or Android app. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** "ios" | "android" in the app, "web" everywhere else. */
export function nativePlatform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

/** Launched from the home screen as an installed PWA. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

/** The app, or the installed PWA: phone screens get the app chrome. */
export function isAppMode(): boolean {
  return isNativeApp() || isStandalonePwa();
}
