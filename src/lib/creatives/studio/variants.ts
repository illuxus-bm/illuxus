/**
 * Variants of the poster designs.
 *
 * The posters in `templates.ts` are each drawn once, for speakers. This
 * turns every one of them into a family: the same layout in several
 * colourways, and for each kind of graphic an organiser makes —
 *
 *   speaker   one person (the single-portrait posters)
 *   lineup    several people (the multi-portrait posters)
 *   event     the event itself: no speaker, the cover image where a
 *             portrait would be
 *   partner   a sponsor: the logo on a white plate where the portrait
 *             would be, with partner wording
 *
 * Nothing here draws. A variant calls the poster's own `build` and adjusts
 * what goes in (palette, who is featured, default wording) and, for
 * partners, how the portrait slots come out. So a variant is exactly the
 * poster it came from, and stays editable node by node.
 */
import type { ImageNode, Scene, SceneNode } from "./scene";
import type { BuildInput, StudioContent, StudioPalette, StudioSpeaker, StudioTemplate } from "./templates";

export type StudioCategory = "event" | "speaker" | "lineup" | "partner";

export const STUDIO_CATEGORIES: { id: StudioCategory; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "speaker", label: "Speaker" },
  { id: "lineup", label: "Line-up" },
  { id: "partner", label: "Partner" },
];

type Colourway = [name: string, primary: string, accent: string, ground: string];

/**
 * Extra colourways per poster, after its original. Each keeps the poster's
 * own light/dark logic — a dark background stays dark, a light panel stays
 * light — so text contrast holds without the layout knowing.
 */
const COLOURWAYS: Record<string, { original: string; more: Colourway[] }> = {
  "studio-spotlight": {
    original: "Sage",
    more: [
      ["Sky", "#0b2545", "#ffffff", "#8fb8de"],
      ["Rose", "#3b1226", "#ffffff", "#d4a5a5"],
      ["Sand", "#2b2118", "#ffffff", "#c9b79c"],
      ["Lilac", "#241a40", "#ffffff", "#b3a7d6"],
      ["Olive", "#1f2a14", "#fff8e1", "#a8b58a"],
      ["Clay", "#40160f", "#ffffff", "#d9a38a"],
    ],
  },
  "studio-lineup": {
    original: "Royal",
    more: [
      ["Emerald", "#022c22", "#fbbf24", "#34d399"],
      ["Plum", "#2a0a3d", "#ff5fa2", "#b57bff"],
      ["Crimson", "#3d0a0a", "#ffd166", "#ff6b6b"],
      ["Teal", "#042f3a", "#ff8552", "#2dd4bf"],
      ["Midnight", "#0a0a0a", "#f5c542", "#6b7280"],
    ],
  },
  "studio-webinar": {
    original: "Cream",
    more: [
      ["Sky", "#0f1f3d", "#2563eb", "#eef4ff"],
      ["Mint", "#10231c", "#0f9d6e", "#eef7f1"],
      ["Blush", "#3a1220", "#e11d74", "#fdf0f4"],
      ["Lavender", "#221a3a", "#7c3aed", "#f5f1ff"],
      ["Lemon", "#1f1a0a", "#d97706", "#fffbea"],
      ["Teal", "#0c2a2e", "#0d9488", "#edf7f6"],
    ],
  },
  "studio-speaker-card": {
    original: "Magenta",
    more: [
      ["Navy", "#1e3a8a", "#ffffff", "#e9e9e9"],
      ["Forest", "#166534", "#ffffff", "#e9e9e9"],
      ["Rust", "#b4431c", "#ffffff", "#ece7e3"],
      ["Teal", "#0f766e", "#ffffff", "#e5ebea"],
      ["Ink", "#18181b", "#ffffff", "#e9e9e9"],
      ["Violet", "#6d28d9", "#ffffff", "#e9e7ee"],
    ],
  },
  "studio-session": {
    original: "Red",
    more: [
      ["Cobalt", "#1d4ed8", "#ffd84d", "#f5f5f5"],
      ["Emerald", "#059669", "#fef08a", "#f5f5f5"],
      ["Violet", "#7c3aed", "#fde047", "#f5f5f5"],
      ["Orange", "#ea580c", "#fff3bf", "#f5f5f5"],
      ["Ink", "#111827", "#facc15", "#f5f5f5"],
      ["Pink", "#db2777", "#fde68a", "#f5f5f5"],
    ],
  },
  "studio-keynote": {
    original: "Indigo",
    more: [
      ["Ocean", "#0c2340", "#7dd3fc", "#1d4370"],
      ["Forest", "#10291f", "#a7f3d0", "#1f4d3a"],
      ["Maroon", "#3b0d1a", "#ffc9a8", "#6b1c30"],
      ["Graphite", "#18181b", "#fde047", "#3f3f46"],
      ["Plum", "#2e1065", "#f0abfc", "#4c1d95"],
      ["Teal", "#042f2e", "#fcd34d", "#115e59"],
    ],
  },
  "studio-headliner": {
    original: "Navy",
    more: [
      ["Burgundy", "#4a0d1f", "#ffffff", "#ffffff"],
      ["Forest", "#0f2e22", "#ffffff", "#ffffff"],
      ["Charcoal", "#1c1c1e", "#ffffff", "#ffffff"],
      ["Purple", "#2e1065", "#ffffff", "#ffffff"],
      ["Teal", "#0b3b45", "#ffffff", "#ffffff"],
      ["Cocoa", "#3b2314", "#ffffff", "#ffffff"],
    ],
  },
  "studio-training": {
    original: "Amber",
    more: [
      ["Blue", "#1c1c1c", "#2563eb", "#e8eef8"],
      ["Coral", "#1c1c1c", "#ef4444", "#f3eeee"],
      ["Green", "#1c1c1c", "#16a34a", "#eaf2ec"],
      ["Purple", "#1c1c1c", "#7c3aed", "#efecf6"],
      ["Teal", "#1c1c1c", "#0d9488", "#e6f1f0"],
    ],
  },
  "studio-workshop": {
    original: "Graphite",
    more: [
      ["Navy", "#1e2a4a", "#f59e0b", "#eef1f6"],
      ["Forest", "#1f3d2e", "#f2c14e", "#eef3ee"],
      ["Wine", "#4a1d2e", "#f4a7b9", "#f6eef0"],
      ["Slate", "#334155", "#38bdf8", "#f1f5f9"],
      ["Cocoa", "#3e2a1f", "#e8985e", "#f5efe9"],
    ],
  },
  "studio-conference": {
    original: "Navy",
    more: [
      ["Emerald", "#0f3d2e", "#f59e0b", "#ffffff"],
      ["Wine", "#4a1230", "#fb7185", "#ffffff"],
      ["Charcoal", "#1f2937", "#22d3ee", "#ffffff"],
      ["Purple", "#3b1a6b", "#f472b6", "#ffffff"],
      ["Teal", "#0e3a4a", "#fb923c", "#ffffff"],
    ],
  },
  "studio-trio": {
    original: "Neon",
    more: [
      ["Punch", "#0b0b0b", "#ff4d6d", "#ffd60a"],
      ["Marine", "#0a1128", "#ffd60a", "#00b4d8"],
      ["Arcade", "#1a0b2e", "#f72585", "#4cc9f0"],
      ["Ember", "#0b0b0b", "#f97316", "#fafafa"],
      ["Jungle", "#06281f", "#bef264", "#fb923c"],
    ],
  },
  "studio-introducing": {
    original: "Royal",
    more: [
      ["Plum", "#3b0d2e", "#ff9f6e", "#ffffff"],
      ["Forest", "#0f2e22", "#e8c468", "#ffffff"],
      ["Charcoal", "#18181b", "#f43f5e", "#ffffff"],
      ["Ocean", "#0c3547", "#5eead4", "#ffffff"],
      ["Violet", "#2e1065", "#c4b5fd", "#ffffff"],
      ["Oxblood", "#4a1d1d", "#f5d0a9", "#ffffff"],
    ],
  },
  "studio-summit": {
    original: "Electric",
    more: [
      ["Orchid", "#1a0528", "#f43f5e", "#8b5cf6"],
      ["Emerald", "#021a14", "#fbbf24", "#10b981"],
      ["Ember", "#2a0707", "#fb923c", "#dc2626"],
      ["Lagoon", "#06202b", "#f472b6", "#06b6d4"],
      ["Onyx", "#0a0a0a", "#facc15", "#525252"],
    ],
  },
  "studio-roster": {
    original: "Lagoon",
    more: [
      ["Indigo", "#1e1b4b", "#f472b6", "#e0e7ff"],
      ["Forest", "#14301f", "#f59e0b", "#dcfce7"],
      ["Wine", "#3b0a1c", "#fb923c", "#ffe4e6"],
      ["Onyx", "#18181b", "#facc15", "#f4f4f5"],
      ["Grape", "#2e1a47", "#2dd4bf", "#f3e8ff"],
    ],
  },
  "studio-talkshow": {
    original: "Royal",
    more: [
      ["Grape", "#3b0764", "#fde047", "#e879f9"],
      ["Forest", "#052e16", "#facc15", "#4ade80"],
      ["Ruby", "#450a0a", "#fbbf24", "#fb7185"],
      ["Onyx", "#111111", "#f97316", "#38bdf8"],
      ["Lagoon", "#083344", "#fda4af", "#22d3ee"],
    ],
  },
};

/** Posters that leave a hole when nobody is featured — not offered for events. */
const NOT_FOR_EVENTS = new Set(["studio-training", "studio-workshop", "studio-talkshow"]);
/** Posters whose portrait slots can't hold a logo well — not offered for partners. */
const NOT_FOR_PARTNERS = new Set(["studio-spotlight", "studio-headliner", "studio-trio"]);

const EVENT_COLOURWAYS = 4;
const PARTNER_COLOURWAYS = 4;

/**
 * Wording that only makes sense for a speaker, and what replaces it. A line
 * is swapped only while it still holds its speaker default, so anything the
 * organiser typed is left alone.
 */
const SPEAKER_DEFAULTS: Partial<Record<keyof StudioContent, string[]>> = {
  kicker: ["announces the upcoming session with"],
  speakersLabel: ["Guest speakers"],
  sideLabel: ["Speaker"],
  scriptLine: ["A Session", "Join online"],
  introLine: ["Meet our speaker"],
};

const EVENT_WORDING: Partial<StudioContent> = {
  kicker: "invites you to",
  speakersLabel: "",
  sideLabel: "Save the date",
  scriptLine: "Save the date",
  introLine: "You're invited",
};

const partnerWording = (content: StudioContent, many: boolean): Partial<StudioContent> => ({
  kicker: "is proud to partner with",
  speakersLabel: many ? "Our partners" : "Our partner",
  sideLabel: "Partner",
  scriptLine: many ? "Our Partners" : "In partnership",
  introLine: many ? "Meet our partners" : content.partnerLine || "Meet our partner",
});

function reword(content: StudioContent, wording: Partial<StudioContent>): StudioContent {
  const next = { ...content };
  (Object.keys(wording) as Array<keyof StudioContent>).forEach((key) => {
    if (SPEAKER_DEFAULTS[key]?.includes(content[key])) next[key] = wording[key] as string;
  });
  return next;
}

/**
 * Re-dresses a poster's portrait slots for logos: a white plate the shape
 * of the slot, with the logo shown whole inside it rather than cropped
 * like a face. The plate takes the slot's place in the stack and is given
 * an id of its own, so no other node's id (and no saved edit) moves.
 */
function logosForPortraits(scene: Scene): Scene {
  const nodes: SceneNode[] = [];
  scene.nodes.forEach((node) => {
    if (node.kind === "text" && node.text === "Keynote Speaker:") {
      nodes.push({ ...node, text: "Our partner:" });
      return;
    }
    if (node.kind !== "image" || node.role !== "speaker-photo" || !node.src) {
      nodes.push(node);
      return;
    }
    const { x, y, w, h } = node;
    const round = node.circle === true;
    nodes.push({
      kind: "rect",
      id: `${node.id}-plate`,
      x,
      y,
      w,
      h,
      fill: "#ffffff",
      radius: round ? Math.min(w, h) / 2 : node.radius,
      opacity: node.opacity,
      rotation: node.rotation,
    });
    const pad = round ? 0.2 : 0.12;
    const logo: ImageNode = {
      kind: "image",
      id: node.id,
      role: "sponsor-logo",
      src: node.src,
      fit: "contain",
      x: x + w * pad,
      y: y + h * pad,
      w: w * (1 - pad * 2),
      h: h * (1 - pad * 2),
      opacity: node.opacity,
      rotation: node.rotation,
    };
    nodes.push(logo);
  });
  return { ...scene, nodes };
}

function forEvent(base: StudioTemplate): StudioTemplate["build"] {
  return (input: BuildInput) => base.build({ ...input, speakers: [], content: reword(input.content, EVENT_WORDING) });
}

function forPartner(base: StudioTemplate): StudioTemplate["build"] {
  return (input: BuildInput) => {
    const featured = input.sponsors.slice(0, Math.max(1, base.maxSpeakers));
    const many = base.maxSpeakers > 1;
    const stand: StudioSpeaker[] = featured.map((sponsor) => ({
      id: sponsor.id,
      name: sponsor.name,
      role: many ? "" : "Official partner",
      bio: "",
      photoUrl: sponsor.logoUrl,
    }));
    const scene = base.build({
      ...input,
      speakers: stand,
      // The partner is the subject, so the poster's own sponsor strip stays empty.
      sponsors: [],
      content: reword(input.content, partnerWording(input.content, many)),
    });
    return logosForPortraits(scene);
  };
}

function describe(category: StudioCategory, poster: StudioTemplate): string {
  if (category === "event") return `The ${poster.name} layout announcing the event itself, with your cover image where a portrait would be.`;
  if (category === "partner") {
    return poster.maxSpeakers > 1
      ? `The ${poster.name} layout showing up to ${poster.maxSpeakers} partner logos, the chosen partner first.`
      : `The ${poster.name} layout featuring one partner's logo and name.`;
  }
  return poster.description;
}

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Every design the studio offers: each poster in each colourway, for each
 * kind of graphic it suits. Within a kind the list runs colourway by
 * colourway, so the first screenful shows every layout once.
 */
export function expandPosters(posters: StudioTemplate[]): StudioTemplate[] {
  const out: StudioTemplate[] = [];
  const colourwaysOf = (poster: StudioTemplate): Array<{ name: string; palette: StudioPalette }> => {
    const set = COLOURWAYS[poster.id];
    return [
      { name: set?.original ?? "Original", palette: poster.palette },
      ...(set?.more ?? []).map(([name, primary, accent, ground]) => ({ name, palette: { primary, accent, ground } })),
    ];
  };
  const add = (category: StudioCategory, list: StudioTemplate[], limit: number, build: (p: StudioTemplate) => StudioTemplate["build"], maxSpeakers: (p: StudioTemplate) => number): void => {
    const rounds = Math.min(limit, Math.max(0, ...list.map((p) => colourwaysOf(p).length)));
    for (let round = 0; round < rounds; round += 1) {
      list.forEach((poster) => {
        const colourway = colourwaysOf(poster)[round];
        if (!colourway) return;
        out.push({
          ...poster,
          id: `${poster.id}-${category}-${slug(colourway.name)}`,
          name: `${poster.name} · ${colourway.name}`,
          category,
          family: poster.name,
          description: describe(category, poster),
          palette: colourway.palette,
          maxSpeakers: maxSpeakers(poster),
          build: build(poster),
        });
      });
    }
  };

  const single = posters.filter((p) => p.maxSpeakers === 1);
  const multi = posters.filter((p) => p.maxSpeakers > 1);
  add("event", posters.filter((p) => !NOT_FOR_EVENTS.has(p.id)), EVENT_COLOURWAYS, forEvent, () => 0);
  add("speaker", single, Infinity, (p) => p.build, (p) => p.maxSpeakers);
  add("lineup", multi, Infinity, (p) => p.build, (p) => p.maxSpeakers);
  add("partner", posters.filter((p) => !NOT_FOR_PARTNERS.has(p.id)), PARTNER_COLOURWAYS, forPartner, () => 0);
  return out;
}
