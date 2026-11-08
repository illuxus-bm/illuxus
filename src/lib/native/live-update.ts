/**
 * Live updates: new releases reach installed apps without a reinstall.
 *
 * Every GitHub release carries the app's web code as `illuxus-web.zip`, with
 * `illuxus-web.json` describing it (scripts/app-bundle.mjs). At launch, and
 * when the app returns after a while, the app reads the latest release's
 * description and:
 *
 *  - if it's newer and works with this app shell (its `minNativeBuild` is at
 *    or below this build), downloads it in the background;
 *  - on the next fresh launch, switches to it in the first second, while the
 *    splash is still up (`applyDownloadedUpdate`): never mid-task, and never
 *    by reloading the page while someone has only stepped away;
 *  - if it needs a newer shell (native code changed), asks once to install
 *    the new version (AppLiveUpdate shows the prompt);
 *  - otherwise does nothing.
 *
 * A downloaded version that fails to start is rolled back automatically: the
 * page confirms each launch (`markAppReady`), and the updater reverts if it
 * doesn't in time. The app then remembers that version and never tries it
 * again; a later release with a fix installs as usual. `liveUpdates: false` in public/app-config.json
 * pauses all of it remotely. Nothing is reported to third parties: the
 * updater's statistics are switched off (capacitor.config.ts).
 */
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { compareVersions, fetchAppConfig } from "./app-update";
import { isNativeApp } from "./platform";

const REPO = "illuxus-bm/illuxus";
// Where releases live. A build can point elsewhere (a staging server, or a
// local one when testing) with VITE_LIVE_UPDATE_BASE, laid out the same way:
// <base>/latest/download/illuxus-web.json and <base>/download/v<version>/illuxus-web.zip.
const BASE = ((import.meta.env.VITE_LIVE_UPDATE_BASE as string | undefined) || `https://github.com/${REPO}/releases`).replace(/\/+$/, "");
export const BUNDLE_MANIFEST_URL = `${BASE}/latest/download/illuxus-web.json`;
export const bundleZipUrl = (version: string) => `${BASE}/download/v${version}/illuxus-web.zip`;

/** How often a returning app checks again. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface BundleManifest {
  /** The release's version, e.g. "1.0.3". */
  version: string;
  /** The release's build number. */
  build: number;
  /** The oldest app shell (build number) this web code runs on. */
  minNativeBuild: number;
  /** SHA-256 of illuxus-web.zip, hex. */
  sha256: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;

export function parseBundleManifest(raw: unknown): BundleManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const version = typeof r.version === "string" && VERSION.test(r.version) ? r.version : null;
  const build = int(r.build);
  const minNativeBuild = int(r.minNativeBuild);
  const sha256 = typeof r.sha256 === "string" && /^[0-9a-f]{64}$/.test(r.sha256) ? r.sha256 : null;
  if (!version || !build || !minNativeBuild || !sha256 || minNativeBuild > build) return null;
  return { version, build, minNativeBuild, sha256 };
}

/**
 * Of the downloaded versions, the newest one to switch to: newer than what's
 * running, and not one that already failed to start.
 */
export function pickDownloaded<T extends { version: string; status: string }>(
  bundles: T[],
  runningVersion: string,
  failed: readonly string[] = [],
): T | null {
  const usable = bundles.filter(
    (b) => (b.status === "success" || b.status === "pending") && VERSION.test(b.version)
      && VERSION.test(runningVersion) && compareVersions(b.version, runningVersion) > 0
      && !failed.includes(b.version),
  );
  usable.sort((a, b) => compareVersions(b.version, a.version));
  return usable[0] ?? null;
}

export type LiveUpdateDecision =
  | { action: "none"; reason: string }
  | { action: "download"; manifest: BundleManifest }
  | { action: "native-update"; manifest: BundleManifest };

/**
 * What to do about `manifest`, for an app shell of build `nativeBuild` now
 * running web code version `runningVersion`.
 */
export function decideLiveUpdate(
  manifest: BundleManifest | null,
  nativeBuild: number,
  runningVersion: string,
  enabled = true,
  failed: readonly string[] = [],
): LiveUpdateDecision {
  if (!enabled) return { action: "none", reason: "paused" };
  if (!manifest) return { action: "none", reason: "no release" };
  if (failed.includes(manifest.version)) return { action: "none", reason: "failed before" };
  if (!VERSION.test(runningVersion) || compareVersions(manifest.version, runningVersion) <= 0) {
    return { action: "none", reason: "up to date" };
  }
  if (!Number.isInteger(nativeBuild) || nativeBuild < manifest.minNativeBuild) {
    return { action: "native-update", manifest };
  }
  return { action: "download", manifest };
}

// ── Versions that failed to start ────────────────────────────────────────────
// The web view's storage outlives switching versions, so the version being
// tried is noted before switching; if the next start is still on the old
// one, the new one failed.
const TRYING_KEY = "illuxus.live-update.trying";
const FAILED_KEY = "illuxus.live-update.failed";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked */ }
}

/** Versions that failed to start on this device, newest last. */
export function failedVersions(): string[] {
  try {
    const list = JSON.parse(read(FAILED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * After a switch: if `running` isn't the version that was being tried, that
 * version was rolled back, and joins the failed list. Pure on its inputs;
 * returns the new state.
 */
export function settleAttempt(trying: string | null, running: string, failed: readonly string[]): { failed: string[]; changed: boolean } {
  if (!trying) return { failed: [...failed], changed: false };
  if (trying === running || failed.includes(trying)) return { failed: [...failed], changed: true };
  return { failed: [...failed, trying].slice(-20), changed: true };
}

function settleLastAttempt(running: string) {
  const result = settleAttempt(read(TRYING_KEY), running, failedVersions());
  if (!result.changed) return;
  write(FAILED_KEY, JSON.stringify(result.failed));
  write(TRYING_KEY, null);
}

// ── The native side ──────────────────────────────────────────────────────────

// Imported directly, never resolved from a promise: a Capacitor plugin proxy
// answers every property, `then` included, so a promise would try to call
// CapacitorUpdater.then() ("not implemented") instead of returning it.

/** Tells the updater this version started fine; without it, a new version is rolled back. */
export async function markAppReady(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* an older app shell without the updater */
  }
}

/** The web code version running now: a live update's, or the shell's own. */
async function runningVersion(): Promise<string> {
  const current = await CapacitorUpdater.current();
  return current.bundle.version === "builtin" ? current.native : current.bundle.version;
}

/**
 * At a fresh launch: switches to a newer version downloaded earlier. The page
 * reloads into it straight away, under the splash. Returns true when it does.
 * A version that then fails to confirm it started is rolled back.
 */
export async function applyDownloadedUpdate(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const running = await runningVersion();
    settleLastAttempt(running);
    const { bundles } = await CapacitorUpdater.list();
    const next = pickDownloaded(bundles, running, failedVersions());
    if (!next) return false;
    write(TRYING_KEY, next.version);
    await CapacitorUpdater.set({ id: next.id });
    return true;
  } catch {
    return false;
  }
}

async function readManifest(): Promise<BundleManifest | null> {
  // Native HTTP: GitHub's download links redirect to another host without
  // CORS headers, which a web-view fetch can't follow.
  const { CapacitorHttp } = await import("@capacitor/core");
  const res = await CapacitorHttp.get({
    url: BUNDLE_MANIFEST_URL,
    headers: { Accept: "application/json" },
    connectTimeout: 10_000,
    readTimeout: 10_000,
  });
  if (res.status !== 200) return null;
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return parseBundleManifest(data);
}

/**
 * One check: reads the latest release and acts on it. Returns the decision,
 * so the caller can prompt for a native update. Never throws.
 */
export async function checkForLiveUpdate(): Promise<LiveUpdateDecision> {
  if (!isNativeApp()) return { action: "none", reason: "browser" };
  try {
    const [{ App }, config, manifest] = await Promise.all([
      import("@capacitor/app"),
      fetchAppConfig(),
      readManifest(),
    ]);
    const [{ build }, running] = await Promise.all([App.getInfo(), runningVersion()]);
    const decision = decideLiveUpdate(manifest, Number(build), running, config?.liveUpdates !== false, failedVersions());
    if (decision.action !== "download") return decision;

    const { version, sha256 } = decision.manifest;
    // Download only. The switch happens at the next fresh launch
    // (applyDownloadedUpdate); the updater is never told to apply it on its
    // own, which it would do by reloading when the app goes to the background.
    const { bundles } = await CapacitorUpdater.list();
    const have = bundles.find((b) => b.version === version);
    if (!have || have.status === "deleted") {
      await CapacitorUpdater.download({ url: bundleZipUrl(version), version, checksum: sha256 });
    }
    return decision;
  } catch (err) {
    return { action: "none", reason: (err as Error)?.message || "failed" };
  }
}
