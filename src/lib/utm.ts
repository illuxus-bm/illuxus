/**
 * utm.ts — client-side UTM parameter capture and persistence.
 *
 * Strategy: first-touch attribution. UTM params are read from the URL on the
 * first page-load that carries them, stored in sessionStorage (survives
 * same-tab navigation but not new tabs), and cleared after a registration
 * completes so a second registration in the same session isn't credited to
 * the same campaign.
 *
 * The session key is a short fingerprint (tab open time) used server-side to
 * de-duplicate rapid browser reloads in the utm_clicks table.
 */

const SESSION_KEY = "illuxus:utm";
const TAB_KEY = "illuxus:utm:tab";

export interface UtmParams {
  utm_source?:   string;
  utm_medium?:   string;
  utm_campaign?: string;
  utm_content?:  string;
  utm_term?:     string;
}

/** Read UTM params from a URLSearchParams (or from window.location.search). */
export function readUtmFromSearch(search: string | URLSearchParams): UtmParams {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: UtmParams = {};
  const keys: (keyof UtmParams)[] = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  ];
  for (const k of keys) {
    const v = p.get(k);
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Returns true when at least one utm_* key is present. */
export function hasUtm(params: UtmParams): boolean {
  return Object.values(params).some(Boolean);
}

/**
 * Capture UTM params from the current URL into sessionStorage.
 * Implements first-touch: if params are already stored this session, the
 * incoming params are ignored unless `force=true`.
 *
 * Returns the params that are NOW active (either freshly captured or
 * already stored). Returns `{}` if no params are available at all.
 */
export function captureUtm(search: string, force = false): UtmParams {
  const incoming = readUtmFromSearch(search);

  if (hasUtm(incoming)) {
    // Only overwrite if first-touch has no data yet, or forced.
    const existing = loadStoredUtm();
    if (!hasUtm(existing) || force) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(incoming)); } catch (_) {}
    }
    return hasUtm(existing) && !force ? existing : incoming;
  }

  return loadStoredUtm();
}

/** Load whatever UTM params are currently stored. Returns `{}` if none. */
export function loadStoredUtm(): UtmParams {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UtmParams;
  } catch (_) {
    return {};
  }
}

/** Clear stored UTM params — call after a successful registration. */
export function clearStoredUtm(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}

/**
 * Return a stable tab session key (generated once per tab open).
 * Used server-side to de-duplicate utm_clicks rows.
 */
export function getTabSessionKey(): string {
  try {
    let k = sessionStorage.getItem(TAB_KEY);
    if (!k) {
      k = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(TAB_KEY, k);
    }
    return k;
  } catch (_) {
    return "";
  }
}

/**
 * Build a shareable event URL with UTM parameters appended.
 * Used by the organiser dashboard to generate trackable share links.
 */
export function buildUtmUrl(
  baseUrl: string,
  utm: UtmParams & { utm_source: string; utm_medium: string; utm_campaign: string },
): string {
  const url = new URL(baseUrl);
  if (utm.utm_source)   url.searchParams.set("utm_source",   utm.utm_source);
  if (utm.utm_medium)   url.searchParams.set("utm_medium",   utm.utm_medium);
  if (utm.utm_campaign) url.searchParams.set("utm_campaign", utm.utm_campaign);
  if (utm.utm_content)  url.searchParams.set("utm_content",  utm.utm_content ?? "");
  if (utm.utm_term)     url.searchParams.set("utm_term",     utm.utm_term ?? "");
  return url.toString();
}
