/**
 * Kept apart from `CookieConsent.tsx` so the footer link can reopen the
 * banner without pulling the banner (and its animation library) into the
 * entry bundle.
 */

/** Fired to reopen the banner so a choice can be reviewed or changed. */
export const OPEN_COOKIE_SETTINGS_EVENT = "illuxus:open-cookie-settings";

/** Reopens the cookie banner — wired to the "Cookie settings" footer link. */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
