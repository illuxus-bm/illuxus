import type { ThemeConfig } from "./types";

/** 24 curated theme presets covering brands, moods and event styles. */
export interface ThemePreset {
  id: string;
  name: string;
  theme: ThemeConfig;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "indigo-classic", name: "Indigo Classic", theme: { primaryColor: "#6366f1", accentColor: "#f59e0b", backgroundColor: "#ffffff", textColor: "#1a1a2e", fontFamily: "Poppins" } },
  { id: "midnight-blue",   name: "Midnight Blue",   theme: { primaryColor: "#3b82f6", accentColor: "#22d3ee", backgroundColor: "#0b1120", textColor: "#e2e8f0", fontFamily: "Poppins" } },
  { id: "forest",          name: "Forest",          theme: { primaryColor: "#16a34a", accentColor: "#facc15", backgroundColor: "#f7faf7", textColor: "#0f1f14", fontFamily: "Poppins" } },
  { id: "sunset",          name: "Sunset",          theme: { primaryColor: "#ef4444", accentColor: "#f59e0b", backgroundColor: "#fff7ed", textColor: "#1f1408", fontFamily: "Poppins" } },
  { id: "ocean",           name: "Ocean",           theme: { primaryColor: "#0ea5e9", accentColor: "#14b8a6", backgroundColor: "#f0f9ff", textColor: "#0c2733", fontFamily: "Poppins" } },
  { id: "rose",            name: "Rose",            theme: { primaryColor: "#e11d48", accentColor: "#f472b6", backgroundColor: "#fff1f2", textColor: "#290912", fontFamily: "Playfair Display" } },
  { id: "violet-dark",     name: "Violet Dark",     theme: { primaryColor: "#a78bfa", accentColor: "#f0abfc", backgroundColor: "#0f0a1f", textColor: "#ede9fe", fontFamily: "Poppins" } },
  { id: "emerald",         name: "Emerald",         theme: { primaryColor: "#10b981", accentColor: "#fbbf24", backgroundColor: "#ffffff", textColor: "#0a1f1a", fontFamily: "Poppins" } },
  { id: "monochrome",      name: "Monochrome",      theme: { primaryColor: "#0a0a0a", accentColor: "#525252", backgroundColor: "#fafafa", textColor: "#0a0a0a", fontFamily: "Poppins" } },
  { id: "carbon",          name: "Carbon",          theme: { primaryColor: "#fafafa", accentColor: "#facc15", backgroundColor: "#0a0a0a", textColor: "#fafafa", fontFamily: "Poppins" } },
  { id: "coral",           name: "Coral Pop",       theme: { primaryColor: "#fb7185", accentColor: "#fde047", backgroundColor: "#fffbeb", textColor: "#27110f", fontFamily: "Poppins" } },
  { id: "sky-mint",        name: "Sky Mint",        theme: { primaryColor: "#06b6d4", accentColor: "#10b981", backgroundColor: "#f0fdfa", textColor: "#0c2723", fontFamily: "Poppins" } },
  { id: "amber-pro",       name: "Amber Pro",       theme: { primaryColor: "#d97706", accentColor: "#1e3a8a", backgroundColor: "#fffbeb", textColor: "#1c1206", fontFamily: "Merriweather" } },
  { id: "regal-purple",    name: "Regal Purple",    theme: { primaryColor: "#7c3aed", accentColor: "#facc15", backgroundColor: "#faf5ff", textColor: "#1f0a3a", fontFamily: "Playfair Display" } },
  { id: "tech-cyan",       name: "Tech Cyan",       theme: { primaryColor: "#06b6d4", accentColor: "#a855f7", backgroundColor: "#0a0f1f", textColor: "#e0f2fe", fontFamily: "JetBrains Mono" } },
  { id: "slate-pro",       name: "Slate Pro",       theme: { primaryColor: "#475569", accentColor: "#0ea5e9", backgroundColor: "#f8fafc", textColor: "#0f172a", fontFamily: "Poppins" } },
  { id: "lime-energy",     name: "Lime Energy",     theme: { primaryColor: "#84cc16", accentColor: "#0f172a", backgroundColor: "#f7fee7", textColor: "#1a2e05", fontFamily: "Poppins" } },
  { id: "burgundy",        name: "Burgundy",        theme: { primaryColor: "#9f1239", accentColor: "#fbbf24", backgroundColor: "#fef2f2", textColor: "#250612", fontFamily: "Merriweather" } },
  { id: "navy-gold",       name: "Navy & Gold",     theme: { primaryColor: "#1e3a8a", accentColor: "#eab308", backgroundColor: "#ffffff", textColor: "#0a1429", fontFamily: "Playfair Display" } },
  { id: "mocha",           name: "Mocha",           theme: { primaryColor: "#78350f", accentColor: "#fb923c", backgroundColor: "#fef3c7", textColor: "#1c1208", fontFamily: "Merriweather" } },
  { id: "neon-night",      name: "Neon Night",      theme: { primaryColor: "#22d3ee", accentColor: "#f472b6", backgroundColor: "#020617", textColor: "#f1f5f9", fontFamily: "JetBrains Mono" } },
  { id: "festival",        name: "Festival",        theme: { primaryColor: "#ec4899", accentColor: "#facc15", backgroundColor: "#1e1b4b", textColor: "#fef3c7", fontFamily: "Poppins" } },
  { id: "minimal-cream",   name: "Minimal Cream",   theme: { primaryColor: "#1f2937", accentColor: "#d97706", backgroundColor: "#fdf6e3", textColor: "#1f2937", fontFamily: "Playfair Display" } },
  { id: "arctic",          name: "Arctic",          theme: { primaryColor: "#0369a1", accentColor: "#64748b", backgroundColor: "#f0f9ff", textColor: "#0c1827", fontFamily: "Poppins" } },
];

/** 32 hand-picked color swatches usable for primary / accent / etc. */
export const COLOR_SWATCHES: string[] = [
  "#0a0a0a", "#525252", "#737373", "#a3a3a3", "#e5e5e5", "#ffffff",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#facc15", "#84cc16",
  "#22c55e", "#16a34a", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#fb7185", "#fda4af", "#fb923c", "#fbbf24", "#a3e635",
  "#34d399", "#22d3ee",
];

/**
 * Font families offered by the organizer-facing pickers (event theme,
 * creative customization panel).
 *
 * Must stay a subset of the creatives renderer's loadable catalog in
 * `src/lib/creatives/creative-fonts.ts` — a family offered here but absent
 * there is fetched by nothing and renders in the fallback face. Property 50
 * asserts the two agree.
 */
export const FONT_OPTIONS: string[] = [
  "Poppins", "Inter", "Playfair Display", "Merriweather",
  "Roboto", "Lato", "Open Sans", "Montserrat", "Raleway",
  "JetBrains Mono", "Space Grotesk", "DM Sans",
  // Script faces, for invitation-style creatives where the headline is
  // calligraphic rather than set in a sans.
  "Dancing Script", "Great Vibes", "Pacifico",
];
