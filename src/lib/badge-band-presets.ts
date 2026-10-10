/**
 * Saved colour presets for the badge participant band, kept per browser.
 * The colours last used are remembered separately with the rest of the
 * print preferences (PrintBadgesDialog), so a preset is only needed to
 * switch between named schemes.
 */
import { sanitizeBandColors, type BandColors } from "./print-badges";

export type BandColorPreset = { name: string; colors: BandColors };

const KEY = "illuxus.badge-band-presets.v1";

export function loadBandPresets(): BandColorPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .map((p) => ({ name: String(p.name).trim().slice(0, 40), colors: sanitizeBandColors(p.colors) }));
  } catch {
    return [];
  }
}

export function saveBandPresets(presets: BandColorPreset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
  } catch {
    // Storage unavailable (private mode / blocked) — presets just won't persist.
  }
}

export function sameBandColors(a: BandColors, b: BandColors): boolean {
  return a.attendee === b.attendee && a.speaker === b.speaker && a.partner === b.partner;
}
