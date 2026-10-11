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
    background: "#0F1115",
    gridLine: "#8A93A6",
    gridMajor: "#427FFA",
    paper: "#FAFAFA",
    ink: "#14171F",
    foil: "#427FFA",
    foilInk: "#FFFFFF",
    seatEmpty: "#262A33",
    seatTaken: "#FAFAFA",
    screen: "#08090C",
    screenText: "#FAFAFA",
    bars: ["#427FFA", "#2DD46F", "#FBB12E", "#9A6BF5"],
    label: "#FAFAFA",
  },
  light: {
    background: "#FFFFFF",
    gridLine: "#14171F",
    gridMajor: "#246BF9",
    paper: "#14171F",
    ink: "#FAFAFA",
    foil: "#427FFA",
    foilInk: "#FFFFFF",
    seatEmpty: "#E3E5EA",
    seatTaken: "#14171F",
    screen: "#14171F",
    screenText: "#FAFAFA",
    bars: ["#246BF9", "#1EB85A", "#F5A40F", "#8246EE"],
    label: "#14171F",
  },
};
