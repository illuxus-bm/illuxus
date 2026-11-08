/**
 * Which device and browser a visitor is on, for the /download page to lead
 * with the right way to get the app. Pure: user agent in, answer out.
 */
export type DevicePlatform = "android" | "iphone" | "ipad" | "mac" | "windows" | "chromeos" | "linux" | "unknown";
export type BrowserKind = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "other";

export interface DeviceInfo {
  platform: DevicePlatform;
  browser: BrowserKind;
}

/**
 * `maxTouchPoints` tells an iPad from a Mac: iPadOS 13+ Safari reports a Mac
 * user agent, but Macs have no touch screen.
 */
export function detectDevice(userAgent: string, maxTouchPoints = 0): DeviceInfo {
  const ua = userAgent || "";
  let platform: DevicePlatform = "unknown";
  if (/Android/i.test(ua)) platform = "android";
  else if (/iPhone|iPod/.test(ua)) platform = "iphone";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) platform = "ipad";
  else if (/CrOS/.test(ua)) platform = "chromeos";
  else if (/Macintosh|Mac OS X/.test(ua)) platform = "mac";
  else if (/Windows/.test(ua)) platform = "windows";
  else if (/Linux|X11/.test(ua)) platform = "linux";

  let browser: BrowserKind = "other";
  if (/EdgA?\/|EdgiOS\//.test(ua)) browser = "edge";
  else if (/SamsungBrowser\//.test(ua)) browser = "samsung";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "firefox";
  else if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua)) browser = "safari";

  return { platform, browser };
}

/** The download page section for a platform. */
export function sectionFor(platform: DevicePlatform): "android" | "ios" | "mac" | "desktop" {
  if (platform === "android") return "android";
  if (platform === "iphone" || platform === "ipad") return "ios";
  if (platform === "mac") return "mac";
  return "desktop";
}
