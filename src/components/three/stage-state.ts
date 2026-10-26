/**
 * Shared, mutable state between the landing page DOM and the WebGL stage.
 * The DOM writes scroll progress and pointer position; the scene reads them
 * every frame. Kept outside React so scrolling never triggers a re-render.
 */
export const stage = {
  /** 0 → 1 across the pinned hero + story track. */
  progress: 0,
  /** Pointer position, -1 … 1 from the viewport centre. */
  pointerX: 0,
  pointerY: 0,
};

/** Scroll-timeline slices owned by the hero and each story chapter. */
export const STAGE_WINDOWS = {
  hero: [0, 0.12],
  sell: [0.14, 0.34],
  checkin: [0.36, 0.56],
  floor: [0.58, 0.78],
  attribution: [0.8, 1],
} as const;

/** Share of the hall that ends up checked in (matches the door counter). */
export const CHECKED_IN_SHARE = 892 / 1200;

/** Registrations by source, shared by the 3D bars and the "Top sources" card. */
export const SOURCES = [
  { name: "LinkedIn ads", count: 432 },
  { name: "Newsletter", count: 318 },
  { name: "Speaker share", count: 214 },
  { name: "Direct", count: 142 },
] as const;

export type StageTheme = "light" | "dark";

export interface StagePalette {
  background: string;
  gridLine: string;
  gridMajor: string;
  paper: string;
  ink: string;
  foil: string;
  /** Text colour on top of the foil. */
  foilInk: string;
  seatEmpty: string;
  seatTaken: string;
  screen: string;
  screenText: string;
  bars: [string, string, string, string];
  label: string;
}

export const STAGE_PALETTES: Record<StageTheme, StagePalette> = {
  dark: {
    background: "#121212",
    gridLine: "#A8A3B8",
    gridMajor: "#9333EA",
    paper: "#FAFAFA",
    ink: "#111827",
    foil: "#F59E0B",
    foilInk: "#1A1200",
    seatEmpty: "#2A2A2A",
    seatTaken: "#FAFAFA",
    screen: "#0A0A0A",
    screenText: "#FAFAFA",
    bars: ["#9333EA", "#C084FC", "#EC4899", "#F59E0B"],
    label: "#E5E7EB",
  },
  light: {
    background: "#FAFAFA",
    gridLine: "#111827",
    gridMajor: "#7E22CE",
    paper: "#111827",
    ink: "#FAFAFA",
    foil: "#D97706",
    foilInk: "#1A1200",
    seatEmpty: "#E5E7EB",
    seatTaken: "#7E22CE",
    screen: "#111827",
    screenText: "#FAFAFA",
    bars: ["#7E22CE", "#A855F7", "#DB2777", "#D97706"],
    label: "#111827",
  },
};
