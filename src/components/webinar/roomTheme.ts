import type { CSSProperties } from "react";
import type { Branding } from "./StageOverlays";

/**
 * Illuxus brand purple (the dark-theme `--primary`, 271 81% 56%). Used when
 * neither the event nor the webinar session sets a colour.
 */
export const ROOM_DEFAULT_ACCENT = "#9234EA";

function parseHex(input?: string | null): [number, number, number] | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export type RoomAccent = { accent: string; accentFg: string };

/** The colour the organizer chose for the event page, if any. */
export function eventThemeColor(pageConfig: unknown): string | null {
  const c = (pageConfig as { theme?: { primaryColor?: unknown } } | null)?.theme?.primaryColor;
  return typeof c === "string" && parseHex(c) ? c : null;
}

/**
 * Room accent, first valid of: the event page colour → the webinar session's
 * branding colour (when branding is enabled) → Illuxus purple. Foreground is
 * black or white, whichever reads better on the accent fill.
 */
export function resolveRoomAccent(opts: {
  eventColor?: string | null;
  branding?: Branding;
  brandingEnabled?: boolean;
} = {}): RoomAccent {
  const { eventColor, branding, brandingEnabled = true } = opts;
  const candidates = [
    eventColor,
    ...(brandingEnabled ? [branding?.accent_color, branding?.primary_color] : []),
  ];
  const picked = candidates.find((c) => parseHex(c)) ?? ROOM_DEFAULT_ACCENT;
  const rgb = parseHex(picked)!;
  // Contrast vs black = (L + .05) / .05, vs white = 1.05 / (L + .05); they
  // cross at L ≈ 0.179.
  const accentFg = luminance(rgb) > 0.179 ? "#0B0B0B" : "#FFFFFF";
  return { accent: `#${picked.trim().replace(/^#/, "")}`, accentFg };
}

function hexToHslTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * CSS variables for the room: `--wb-*` for the room's own classes, plus the
 * shadcn `--primary` / `--ring` tokens so shared components (buttons, inputs,
 * Q&A, polls) pick up the accent instead of the app's purple.
 */
export function roomThemeStyle({ accent, accentFg }: RoomAccent): CSSProperties {
  const accentHsl = hexToHslTriplet(accent);
  const fgHsl = hexToHslTriplet(accentFg);
  return {
    ["--wb-accent" as string]: accent,
    ["--wb-accent-fg" as string]: accentFg,
    ...(accentHsl && fgHsl
      ? {
          ["--primary" as string]: accentHsl,
          ["--primary-ink" as string]: accentHsl,
          ["--primary-foreground" as string]: fgHsl,
          ["--ring" as string]: accentHsl,
        }
      : {}),
  };
}

/*
 * Room design tokens — graphite ramp, one accent.
 *   surfaces: #0F0F10 page · #161617 panel · white/4–6% rows · white/8% hairlines
 *   text:     white (primary) · white/60 (secondary) · white/40 (muted)
 *   radii:    panel 20 · inner card 12 · control 10 · chip 8
 *   motion:   150ms ease-out for feedback, colour/opacity/transform only
 * The accent marks the primary action and the current selection only.
 */

/**
 * Shell classes: the `.dark` class flips every shadcn token in the subtree to
 * the dark palette regardless of the user's app theme. The room is always dark.
 */
export const ROOM_SHELL = "dark bg-[#0F0F10] text-white antialiased";
/** Raised panel surface. Pair with `rounded-[20px]`. */
export const ROOM_PANEL = "bg-[#161617] ring-1 ring-white/[0.06]";
/** Row / inset surface inside a panel. Pair with `rounded-[12px]`. */
export const ROOM_ROW = "bg-white/[0.04]";
/** Square-ish icon button used in headers, rails and card toolbars. */
export const ROOM_ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white/60 transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wb-accent)]";
/** Primary call-to-action fill — the one place the accent is loud. */
export const ROOM_CTA =
  "rounded-[10px] bg-[color:var(--wb-accent)] text-[color:var(--wb-accent-fg)] font-medium transition-[filter,transform] duration-150 ease-out hover:bg-[color:var(--wb-accent)] hover:brightness-110 active:scale-[0.98]";
/** Secondary button. */
export const ROOM_BTN =
  "rounded-[10px] bg-white/[0.06] text-white/85 font-medium transition-colors duration-150 ease-out hover:bg-white/[0.1] hover:text-white";
/** Destructive button — quiet surface, red ink. */
export const ROOM_BTN_DANGER =
  "rounded-[10px] bg-white/[0.06] text-[#FF7A72] font-medium transition-colors duration-150 ease-out hover:bg-[#E5484D]/15";
/** The single entrance on load. */
export const ROOM_ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none";
