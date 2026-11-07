/**
 * Makes the web app behave like an app inside the iOS / Android shell.
 * Runs once from main.tsx, before React renders; does nothing in a browser.
 *
 * A web view lacks a few things a browser tab has, and has one it shouldn't:
 *
 *  - Downloads. `<a download href="blob:…">` does nothing in a web view, and
 *    the app builds every export (tickets, CSVs, PDFs, badges, .ics) that
 *    way. Here such a click saves the file and opens the share sheet, from
 *    where it can go to Files, Drive, Mail or a calendar.
 *  - Sharing. Android's web view has no `navigator.share`; iOS's is limited.
 *    Both get the native share sheet.
 *  - Links out. The web view would otherwise navigate itself away to another
 *    site. Links to other sites open in the in-app browser instead, and
 *    links to illuxus.com stay in the app (`setAppNavigator`).
 *  - The keyboard. `html.keyboard-open` is set while it is up, so the tab
 *    bar can step aside (index.css).
 */
import { isNativeApp, nativePlatform, isAppMode, SITE_ORIGIN } from "./platform";
import { logger } from "@/lib/observability";

type Navigate = (to: string) => void;
let appNavigate: Navigate | null = null;

/** The router's navigate, registered by NativeBridge, for links into the app. */
export function setAppNavigator(navigate: Navigate | null) {
  appNavigate = navigate;
}

const SITE_HOSTS = new Set([new URL(SITE_ORIGIN).host, `www.${new URL(SITE_ORIGIN).host}`]);

/** An in-app path for a link to the public site or the `illuxus://` scheme, else null. */
export function inAppPath(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.protocol === "illuxus:") {
    // illuxus://events/abc → /events/abc
    return `/${url.host}${url.pathname}${url.search}${url.hash}`.replace(/\/{2,}/g, "/");
  }
  if (url.origin === window.location.origin || SITE_HOSTS.has(url.host)) {
    return `${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}

/** Opens a web page in the in-app browser (SFSafariViewController / Custom Tabs). */
export async function openInAppBrowser(url: string) {
  const { Browser } = await import("@capacitor/browser");
  const dark = document.documentElement.classList.contains("dark");
  await Browser.open({ url, presentationStyle: "popover", toolbarColor: dark ? "#121212" : "#fafafa" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/** Writes a file to the app's cache and returns its file:// URI. */
async function writeCacheFile(name: string, blob: Blob): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const safeName = name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "download";
  const { uri } = await Filesystem.writeFile({
    path: `exports/${safeName}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  return uri;
}

/** Saves what a download link points at and offers it in the share sheet. */
async function saveDownload(href: string, filename: string) {
  try {
    const blob = await (await fetch(href)).blob();
    const uri = await writeCacheFile(filename, blob);
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: filename, files: [uri], dialogTitle: filename });
  } catch (err) {
    // Closing the share sheet without picking anything rejects too.
    logger.debug("native.download_not_shared", { error_message: (err as Error)?.message });
  }
}

function installDownloads() {
  const isDownload = (a: HTMLAnchorElement) => a.hasAttribute("download") && /^(blob:|data:)/.test(a.href);

  // Most exports click a detached <a download> from code.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (isDownload(this)) {
      void saveDownload(this.href, this.download || "download");
      return;
    }
    click.call(this);
  };

  // The rest are real links the user taps.
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a && isDownload(a)) {
        e.preventDefault();
        void saveDownload(a.href, a.download || "download");
      }
    },
    true,
  );

  // Callers revoke the blob URL right after clicking, but the file is read
  // asynchronously here. Hold the URL a minute longer.
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => {
    window.setTimeout(() => revoke(url), 60_000);
  };
}

function installShare() {
  const nativeShare = async (data: ShareData = {}) => {
    const { Share } = await import("@capacitor/share");
    const files = data.files?.length
      ? await Promise.all(data.files.map((f) => writeCacheFile(f.name, f)))
      : undefined;
    try {
      await Share.share({ title: data.title, text: data.text, url: data.url, files });
    } catch (err) {
      // Same as the web API: closing the sheet is an AbortError.
      throw new DOMException((err as Error)?.message || "Share canceled", "AbortError");
    }
  };
  Object.defineProperty(navigator, "share", { value: nativeShare, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
}

function installLinks() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.("a");
    if (!a || !a.href || a.hasAttribute("download")) return;
    const url = new URL(a.href, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "illuxus:") return;

    const path = inAppPath(a.href);
    if (path !== null) {
      // Same-origin links without a target are React Router's own.
      if (url.origin === window.location.origin && !a.target) return;
      e.preventDefault();
      appNavigate?.(path);
      return;
    }
    e.preventDefault();
    void openInAppBrowser(url.href);
  });

  const open = window.open.bind(window);
  window.open = (target?: string | URL, name?: string, features?: string) => {
    const href = target ? String(target) : "";
    if (/^https?:/i.test(href)) {
      const path = inAppPath(href);
      if (path !== null) appNavigate?.(path);
      else void openInAppBrowser(href);
      return null;
    }
    return open(target, name, features);
  };
}

async function installKeyboard() {
  const { Keyboard } = await import("@capacitor/keyboard");
  const root = document.documentElement;
  await Keyboard.addListener("keyboardWillShow", () => root.classList.add("keyboard-open"));
  await Keyboard.addListener("keyboardWillHide", () => root.classList.remove("keyboard-open"));
  if (nativePlatform() === "ios") await Keyboard.setAccessoryBarVisible({ isVisible: true });
}

export function bootNativeApp() {
  const root = document.documentElement;
  if (isAppMode()) root.classList.add("app-mode");
  if (!isNativeApp()) return;

  root.classList.add("native-app", `native-${nativePlatform()}`);
  // iOS zooms the page into any field under 16px when it's focused, and
  // doesn't zoom back out. A maximum scale stops that, and iOS still lets
  // people pinch to zoom. Android honours the maximum and would lose pinch
  // zoom (an accessibility need), and doesn't zoom into fields, so it's iOS only.
  if (nativePlatform() === "ios") {
    document
      .querySelector('meta[name="viewport"]')
      ?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");
  }
  installDownloads();
  installShare();
  installLinks();
  installKeyboard().catch((err) =>
    logger.debug("native.keyboard_unavailable", { error_message: (err as Error)?.message }),
  );
  // index.html paints its own splash; hand over to it straight away.
  import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 150 }))
    .catch(() => { /* already hidden */ });
}
