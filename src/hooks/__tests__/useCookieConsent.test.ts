import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { globalPrivacyControl, readFromStorage } from "../useCookieConsent";

const KEY = "illuxus:cookie-consent";

function setGpc(value: boolean | undefined) {
  Object.defineProperty(navigator, "globalPrivacyControl", { value, configurable: true });
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setGpc(undefined);
});

describe("cookie consent and Global Privacy Control", () => {
  it("is pending with nothing stored", () => {
    expect(readFromStorage()).toEqual({ consent: "pending", analytics: false, marketing: false });
  });

  it("keeps an accepted marketing choice without a GPC signal", () => {
    localStorage.setItem(KEY, JSON.stringify({ consent: "accepted", analytics: true, marketing: true }));
    expect(globalPrivacyControl()).toBe(false);
    expect(readFromStorage().marketing).toBe(true);
  });

  it("turns marketing off when the browser sends GPC, but leaves analytics as chosen", () => {
    setGpc(true);
    localStorage.setItem(KEY, JSON.stringify({ consent: "accepted", analytics: true, marketing: true }));
    expect(globalPrivacyControl()).toBe(true);
    expect(readFromStorage()).toEqual({ consent: "accepted", analytics: true, marketing: false });
  });
});
