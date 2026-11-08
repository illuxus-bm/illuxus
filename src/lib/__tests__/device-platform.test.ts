import { describe, expect, it } from "vitest";

import { detectDevice, sectionFor } from "../device-platform";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  // iPadOS Safari presents itself as a Mac.
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  linuxChrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

describe("detectDevice", () => {
  it.each([
    ["iphoneSafari", 5, "iphone", "safari", "ios"],
    ["iphoneChrome", 5, "iphone", "chrome", "ios"],
    ["ipadSafari", 5, "ipad", "safari", "ios"],
    ["macSafari", 0, "mac", "safari", "mac"],
    ["macChrome", 0, "mac", "chrome", "mac"],
    ["androidChrome", 5, "android", "chrome", "android"],
    ["androidSamsung", 5, "android", "samsung", "android"],
    ["windowsEdge", 0, "windows", "edge", "desktop"],
    ["windowsFirefox", 0, "windows", "firefox", "desktop"],
    ["chromebook", 0, "chromeos", "chrome", "desktop"],
    ["linuxChrome", 0, "linux", "chrome", "desktop"],
  ] as const)("%s", (key, touch, platform, browser, section) => {
    const device = detectDevice(UA[key], touch);
    expect(device).toEqual({ platform, browser });
    expect(sectionFor(device.platform)).toBe(section);
  });

  it("copes with no user agent", () => {
    expect(detectDevice("")).toEqual({ platform: "unknown", browser: "other" });
  });
});
