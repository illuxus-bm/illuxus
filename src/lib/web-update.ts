/**
 * Keeps the website current without anyone clearing their browser data.
 *
 * Each build writes /version.json (vite.config.ts). An open tab fetches it
 * now and then and compares it with the build it is running; when a newer
 * deploy is live, the tab reloads itself at a moment nothing is lost:
 *
 * - "fresh": the page just opened, or came back after a long time in the
 *   background, and the person hasn't touched it yet. Reloading then looks
 *   like part of opening the app.
 * - "navigation": they moved to another page in the app; the old page is
 *   gone anyway, so the reload just loads the new one from the new build.
 *
 * Nothing reloads while a video or call is playing, a field is being typed
 * in or has unsent text, or a dialog is open. Otherwise the person sees an
 * "Update ready" toast and refreshes when it suits them.
 *
 * Pages load from the network first (the service worker in vite.config.ts),
 * so a plain reload gets the new build. If one didn't (a stale cache
 * somewhere), the next refresh unregisters the worker and empties its caches
 * first: what clearing site data used to do by hand, minus the sign-out.
 */
export const BUILD_ID: string = import.meta.env.VITE_BUILD_ID ?? "dev";
export const VERSION_URL = "/version.json";

/** How often an open, visible tab looks for a new deploy. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** Back after this long in the background counts as opening the app again. */
export const RESUME_AFTER_MS = 10 * 60 * 1000;
/** How long after opening (untouched) a reload still feels like part of it. */
export const FRESH_WINDOW_MS = 15 * 1000;

/** The build named by a /version.json body, or null. */
export function parseBuildInfo(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const build = (raw as { build?: unknown }).build;
  return typeof build === "string" && /^[\w.-]{1,64}$/.test(build) ? build : null;
}

/** The build currently deployed, or null when it can't be told (offline, …). */
export async function fetchLatestBuild(fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<string | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    return parseBuildInfo(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A newer deploy is live (and this isn't a dev server or the same build). */
export function isNewerBuild(latest: string | null, running = BUILD_ID): latest is string {
  return Boolean(latest) && running !== "dev" && latest !== running;
}

const TEXT_INPUT = /^(text|email|tel|url|search|number|password|date|datetime-local|time|month|week)$/;

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT.test(el.type || "text");
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Audio or video is playing: a webinar, a call, a recording. */
export function isMediaPlaying(doc: Document = document): boolean {
  return Array.from(doc.querySelectorAll("video, audio")).some(
    (m) => m instanceof HTMLMediaElement && !m.paused && !m.ended,
  );
}

/** Reloading now would lose nothing: no media, typing, unsent text or dialog. */
export function isSafeToReload(doc: Document = document): boolean {
  if (isMediaPlaying(doc)) return false;
  if (isEditable(doc.activeElement)) return false;
  // A dialog may hold a half-filled form. Non-modal ones (the cookie
  // banner) don't stop anything.
  if (doc.querySelector('[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]')) return false;
  const typed = Array.from(doc.querySelectorAll("textarea, input, [contenteditable='true']")).some((el) => {
    if (el instanceof HTMLTextAreaElement) return el.value.trim() !== "";
    if (el instanceof HTMLInputElement) return TEXT_INPUT.test(el.type || "text") && el.type !== "search" && el.value.trim() !== "";
    return (el.textContent ?? "").trim() !== "";
  });
  return !typed;
}

export type UpdateMoment = "fresh" | "navigation";

/**
 * Whether reloading into a newer build is harmless right now. On a page
 * change the old page is already gone, so only playing media holds it back.
 */
export function canReloadAt(moment: UpdateMoment, doc: Document = document): boolean {
  return moment === "navigation" ? !isMediaPlaying(doc) : isSafeToReload(doc);
}

const TRIED_KEY = "illuxus:web-update-tried";

/** This tab already reloaded for `build` (and is evidently still behind). */
export function alreadyTriedFor(build: string): boolean {
  try {
    return sessionStorage.getItem(TRIED_KEY) === build;
  } catch {
    return false;
  }
}

/** Reload into the latest build. `thorough` also drops the worker and caches. */
export async function reloadToLatest(build: string, thorough = false): Promise<void> {
  try {
    sessionStorage.setItem(TRIED_KEY, build);
  } catch {
    /* storage blocked */
  }
  if (thorough) {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* no service worker support */
    }
    try {
      const keys = (await globalThis.caches?.keys?.()) ?? [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* no Cache Storage */
    }
  }
  window.location.reload();
}

/**
 * Caches earlier builds' workers made that hold people's data (Supabase REST
 * answers). Nothing writes them any more; delete what's left on devices.
 */
export async function removeRetiredCaches(): Promise<void> {
  try {
    await globalThis.caches?.delete?.("illuxus-supabase-rest");
  } catch {
    /* no Cache Storage */
  }
}
