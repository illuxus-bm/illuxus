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
  seatEmpty: string;
  seatTaken: string;
  screen: string;
  screenText: string;
  bars: [string, string, string, string];
  label: string;
}

export const STAGE_PALETTES: Record<StageTheme, StagePalette> = {
  dark: {
    background: "#071D33",
    gridLine: "#6E8FB3",
    gridMajor: "#F5B614",
    paper: "#F3F1DC",
    ink: "#062038",
    foil: "#F5B614",
    seatEmpty: "#17395D",
    seatTaken: "#F3F6D0",
    screen: "#04121F",
    screenText: "#F3F6D0",
    bars: ["#F5B614", "#F3F6D0", "#6FB3E8", "#7AD3B0"],
    label: "#E8EEF5",
  },
  light: {
    background: "#FAF9F4",
    gridLine: "#071D33",
    gridMajor: "#B37A00",
    paper: "#0B2A4A",
    ink: "#F3F1DC",
    foil: "#F5B614",
    seatEmpty: "#DDD9CB",
    seatTaken: "#0B2F55",
    screen: "#071D33",
    screenText: "#F3F6D0",
    bars: ["#0B2F55", "#E0A100", "#4F86B5", "#2E9E86"],
    label: "#071D33",
  },
};
