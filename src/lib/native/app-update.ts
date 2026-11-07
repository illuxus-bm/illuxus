/**
 * Retiring old app versions.
 *
 * An installed app keeps the web bundle it shipped with until the person
 * updates it, so a release with a serious bug — or one that no longer works
 * with the server — can't be fixed in place. `public/app-config.json` on
 * illuxus.com names the oldest version each platform may still run; an older
 * app shows a "please update" screen (AppUpdateGate) instead of the app.
 *
 * Raising it is the last resort, for a release that is actually broken: it
 * locks everyone on an older version out until they update. Never raise it
 * above the version that is live in the store, or nobody can get past it.
 * `scripts/check-app-release.mjs` refuses a minimum above the app's version.
 *
 * Fails open: if the file can't be fetched or read, the app runs.
 */
import { SITE_ORIGIN } from "./platform";

export type AppPlatform = "ios" | "android";

export interface AppConfig {
  /** Oldest version allowed to run, per platform ("1.2.0"). Missing: any. */
  minimumVersion: Partial<Record<AppPlatform, string>>;
  /** Where the update is, per platform. Missing: the screen names the store instead. */
  storeUrl: Partial<Record<AppPlatform, string>>;
  /** Shown on the update screen in place of the default text. */
  message: string | null;
}

export const APP_CONFIG_URL = `${SITE_ORIGIN}/app-config.json`;

const VERSION = /^\d+(\.\d+){0,3}$/;

/** -1, 0 or 1, comparing dotted numeric versions ("1.10.0" > "1.9.2"; "1.2" = "1.2.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const pick = (raw: unknown, valid: (v: string) => boolean): Partial<Record<AppPlatform, string>> => {
  const out: Partial<Record<AppPlatform, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of ["ios", "android"] as const) {
    const v = (raw as Record<string, unknown>)[p];
    if (typeof v === "string" && valid(v.trim())) out[p] = v.trim();
  }
  return out;
};

const isStoreUrl = (v: string) => /^(https:\/\/|itms-apps:\/\/|market:\/\/)/.test(v);

/** The config file's contents, with anything malformed dropped. `null` if it isn't an object. */
export function parseAppConfig(raw: unknown): AppConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    minimumVersion: pick(r.minimumVersion, (v) => VERSION.test(v)),
    storeUrl: pick(r.storeUrl, isStoreUrl),
    message: typeof r.message === "string" && r.message.trim() ? r.message.trim().slice(0, 500) : null,
  };
}

/** Whether `current` on `platform` is older than the config allows. Unknown versions are let through. */
export function updateRequired(config: AppConfig, platform: AppPlatform, current: string | null | undefined): boolean {
  const minimum = config.minimumVersion[platform];
  if (!minimum || !current || !VERSION.test(current)) return false;
  return compareVersions(current, minimum) < 0;
}

/** Fetches the config, giving up after `timeoutMs`. `null` on any failure (fail open). */
export async function fetchAppConfig(timeoutMs = 8000): Promise<AppConfig | null> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(APP_CONFIG_URL, { cache: "no-store", signal: controller?.signal });
    if (!res.ok) return null;
    return parseAppConfig(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
