/**
 * Installing illuxus.com as an app (Chrome, Edge and other Chromium browsers
 * on Windows, ChromeOS, Linux, macOS and Android).
 *
 * The browser offers installation once, early, through `beforeinstallprompt`.
 * This module catches it as soon as the bundle loads (imported from main.tsx),
 * whichever page is open, and lets any component show an Install button
 * (`useInstallPrompt`): the floating pill and the /download page share it.
 *
 * Safari (iPhone, iPad, Mac) and Firefox don't fire the event; there the
 * download page explains the browser's own steps instead.
 */
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep it for our own button instead of the browser's mini-infobar.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Shows the browser's install dialog. Each captured prompt can be used once. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") installed = true;
  notify();
  return outcome;
}

let snapshot = { canInstall: false, installed: false };
function getSnapshot() {
  const canInstall = deferred !== null;
  if (snapshot.canInstall !== canInstall || snapshot.installed !== installed) {
    snapshot = { canInstall, installed };
  }
  return snapshot;
}
const serverSnapshot = { canInstall: false, installed: false };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this browser can install illuxus with one click right now, and whether it just did. */
export function useInstallPrompt() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
