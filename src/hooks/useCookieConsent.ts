import { useEffect, useState } from "react";

export type CookieConsentState = {
  consent: "accepted" | "declined" | "pending";
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "illuxus:cookie-consent";

function readFromStorage(): CookieConsentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { consent: "pending", analytics: false, marketing: false };
    const parsed = JSON.parse(raw) as Partial<CookieConsentState> & { consent?: string };
    if (parsed.consent === "accepted") {
      return {
        consent: "accepted",
        analytics: parsed.analytics ?? true,
        marketing: parsed.marketing ?? false,
      };
    }
    if (parsed.consent === "declined") {
      return { consent: "declined", analytics: false, marketing: false };
    }
  } catch {
    // ignore parse errors
  }
  return { consent: "pending", analytics: false, marketing: false };
}

/**
 * Reads the user's cookie-consent decision from localStorage.
 * Returns `"pending"` if the banner has not been interacted with yet.
 * Subscribes to `storage` events so multiple tabs stay in sync.
 */
export function useCookieConsent(): CookieConsentState {
  const [state, setState] = useState<CookieConsentState>(() => readFromStorage());

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setState(readFromStorage());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return state;
}
