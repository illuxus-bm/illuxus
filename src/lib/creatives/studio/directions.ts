/**
 * Art-directed designs for the creative studio.
 *
 * A DIRECTION is a complete visual identity — its own colour logic,
 * typefaces, photo treatment and compositional idea — not a skin over a
 * shared layout. There are twelve:
 *
 *   Noir       black tie: gold rules, serif capitals, arched portraits
 *   Swiss      the grid: hairlines, one signal colour, giant numerals
 *   Brutal     the gig poster: one loud colour, black slabs, stickers
 *   Aurora     night sky: coloured light, glass panels, gradient type
 *   Editorial  the magazine: masthead, serif headline, columns
 *   Pop        playtime: flat brights, big shapes, hard-shadow cards
 *   Terminal   the console: mono type, brackets, neon on black
 *   Block      colour-block: a saturated slab and condensed capitals
 *   Soft       gentle: pastel gradient, white rounded cards
 *   Retro      seventies: rainbow arcs, stripes, round lettering
 *   Corporate  the boardroom: white space, navy, one bright accent
 *   Collage    the scrapbook: taped paper, polaroids, handwriting
 *
 * Each direction is drawn for the four kinds of graphic (event, speaker,
 * line-up, partner) and comes in four colourways, so every kind has 48
 * designs. Because they are built as scenes of individual nodes, every
 * element of every design can be selected and edited in the studio.
 */
import { aurora, brutal, editorial, noir, pop, swiss, type Cat, type DirectionBuild } from "./directions-a";
import { block, collage, corporate, retro, soft, terminal } from "./directions-b";
import type { StudioField, StudioPalette, StudioTemplate } from "./templates";

export type StudioCategory = Cat;

export const STUDIO_CATEGORIES: { id: StudioCategory; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "speaker", label: "Speaker" },
  { id: "lineup", label: "Line-up" },
  { id: "partner", label: "Partner" },
];

interface Direction {
  id: string;
  name: string;
  blurb: string;
  build: DirectionBuild;
  labels: Record<keyof StudioPalette, string>;
  ways: { id: string; name: string; palette: StudioPalette }[];
}

const way = (id: string, name: string, primary: string, accent: string, ground: string) => ({ id, name, palette: { primary, accent, ground } });

export const DIRECTIONS: Direction[] = [
  {
    id: "noir", name: "Noir", blurb: "Black tie — gold rules, serif capitals and arched portraits.", build: noir,
    labels: { primary: "Text", accent: "Metal", ground: "Background" },
    ways: [way("gold", "Black & gold", "#f4ecd8", "#c9a24b", "#0b0b0c"), way("silver", "Midnight", "#eef1f7", "#b9c4d9", "#0c1830"), way("emerald", "Emerald", "#f3efe2", "#d4af37", "#06281f"), way("bordeaux", "Bordeaux", "#f7ece8", "#e0b58f", "#2a0a12")],
  },
  {
    id: "swiss", name: "Swiss", blurb: "The grid — hairlines, one signal colour and giant numerals.", build: swiss,
    labels: { primary: "Text & rules", accent: "Signal colour", ground: "Paper" },
    ways: [way("red", "Red", "#111111", "#e10600", "#f4f2ee"), way("cobalt", "Cobalt", "#0d0d0d", "#1740ff", "#ffffff"), way("night", "Night", "#f5f5f0", "#ffd400", "#101012"), way("orange", "Orange", "#14213d", "#fb5607", "#f5f0e6")],
  },
  {
    id: "brutal", name: "Brutal", blurb: "The gig poster — one loud colour, black slabs and stickers.", build: brutal,
    labels: { primary: "Ink", accent: "Sticker", ground: "Poster colour" },
    ways: [way("yellow", "Yellow", "#0a0a0a", "#ffffff", "#ffd60a"), way("pink", "Hot pink", "#0a0a0a", "#fff200", "#ff2e88"), way("paper", "Paper", "#0a0a0a", "#ff3b1f", "#f2efe6"), way("acid", "Acid", "#0a0a0a", "#ffffff", "#b8ff29")],
  },
  {
    id: "aurora", name: "Aurora", blurb: "Night sky — coloured light, glass panels and gradient type.", build: aurora,
    labels: { primary: "First light", accent: "Second light", ground: "Night" },
    ways: [way("neon", "Neon", "#ff2ea6", "#21d4fd", "#070a1f"), way("sunset", "Sunset", "#ff7a18", "#ff2d75", "#0c0612"), way("borealis", "Borealis", "#7cffb2", "#18c8ff", "#04121a"), way("violet", "Ultraviolet", "#8a5cff", "#3d7bff", "#080818")],
  },
  {
    id: "editorial", name: "Editorial", blurb: "The magazine — masthead, serif headline and columns.", build: editorial,
    labels: { primary: "Ink", accent: "Highlight", ground: "Paper" },
    ways: [way("forest", "Forest", "#14342b", "#c2552d", "#f3ecdd"), way("navy", "Navy", "#0f1f3d", "#c81d25", "#ffffff"), way("plum", "Plum", "#3b1136", "#b8860b", "#f8e9e4"), way("graphite", "Graphite", "#1b1b1b", "#e85d04", "#e9e9e6")],
  },
  {
    id: "pop", name: "Pop", blurb: "Playtime — flat brights, big shapes and hard-shadow cards.", build: pop,
    labels: { primary: "Big shape", accent: "Second colour", ground: "Background" },
    ways: [way("coral", "Coral", "#2f6bff", "#ff6b4a", "#fff4d6"), way("grape", "Grape", "#7b2ff7", "#ffd23f", "#d6fff0"), way("gum", "Bubblegum", "#0d3b66", "#00c2a8", "#ffd1e3"), way("sunny", "Sunny", "#ff7b00", "#1d3557", "#cfefff")],
  },
  {
    id: "terminal", name: "Terminal", blurb: "The console — mono type, brackets and a neon on black.", build: terminal,
    labels: { primary: "Neon", accent: "Text", ground: "Screen" },
    ways: [way("matrix", "Matrix", "#39ff88", "#f2fff7", "#050806"), way("cyber", "Cyber", "#22e1ff", "#ffe3fb", "#0a0a1a"), way("amber", "Amber", "#ffb000", "#fff6e0", "#0b0906"), way("violet", "Violet", "#b98cff", "#eaffd0", "#121018")],
  },
  {
    id: "block", name: "Block", blurb: "Colour-block — a saturated slab and condensed capitals.", build: block,
    labels: { primary: "Slab", accent: "Ink", ground: "Paper" },
    ways: [way("red", "Signal red", "#e3231b", "#111111", "#ffffff"), way("blue", "Electric blue", "#1f4fff", "#0b1437", "#f4f6ff"), way("orange", "Orange", "#ff5a00", "#f7f2e8", "#141414"), way("teal", "Teal", "#00857a", "#102a43", "#f6efe2")],
  },
  {
    id: "soft", name: "Soft", blurb: "Gentle — a pastel gradient, white rounded cards and soft serif.", build: soft,
    labels: { primary: "Gradient end", accent: "Text", ground: "Gradient start" },
    ways: [way("peach", "Peach", "#e3ccff", "#3b1e4d", "#ffe3d3"), way("mint", "Mint", "#c5e4ff", "#0f3d3e", "#d3f8e2"), way("butter", "Butter", "#ffd1dc", "#4a2c1a", "#fff3c4"), way("lilac", "Lilac", "#c9d6ff", "#252a6b", "#eadcff")],
  },
  {
    id: "retro", name: "Retro", blurb: "Seventies — rainbow arcs, stripes and round warm lettering.", build: retro,
    labels: { primary: "Warm colour", accent: "Deep colour", ground: "Paper" },
    ways: [way("sunset", "Sunset", "#f77f00", "#5a2a0c", "#fdf0d5"), way("lagoon", "Lagoon", "#e9c46a", "#1d4e5f", "#fbf5e6"), way("cherry", "Cherry", "#e63946", "#4a1942", "#ffe5ec"), way("olive", "Olive", "#bc6c25", "#283618", "#f1e8cf")],
  },
  {
    id: "corporate", name: "Corporate", blurb: "The boardroom — white space, navy and one bright accent.", build: corporate,
    labels: { primary: "Main colour", accent: "Accent", ground: "Background" },
    ways: [way("blue", "Navy & blue", "#0b2545", "#1e88ff", "#ffffff"), way("emerald", "Charcoal & green", "#1f2933", "#00a86b", "#ffffff"), way("magenta", "Purple & pink", "#2d1b69", "#e6007e", "#ffffff"), way("orange", "Black & orange", "#111111", "#ff6a00", "#f4f4f2")],
  },
  {
    id: "collage", name: "Collage", blurb: "The scrapbook — taped paper, polaroids and handwriting.", build: collage,
    labels: { primary: "Ink", accent: "Pen & tape", ground: "Desk" },
    ways: [way("kraft", "Kraft", "#1c1917", "#d62828", "#e6d5b8"), way("mint", "Mint", "#102a43", "#ff6b6b", "#cfe8dc"), way("rose", "Rose", "#3d2314", "#128277", "#f6cfd3"), way("slate", "Slate", "#111111", "#f4b400", "#b8c4cf")],
  },
];

const FIELDS: Record<StudioCategory, StudioField[]> = {
  event: [
    { key: "formatLabel", label: "Label" },
    { key: "eventTitle", label: "Event title" },
    { key: "subtitle", label: "Tagline", multiline: true },
    { key: "dateLine", label: "Date" },
    { key: "timeLine", label: "Time" },
    { key: "venueName", label: "Venue" },
    { key: "ctaLabel", label: "Button" },
    { key: "website", label: "Website" },
    { key: "organizerName", label: "Organiser" },
  ],
  speaker: [
    { key: "sideLabel", label: "Label" },
    { key: "introLine", label: "Intro line" },
    { key: "eventTitle", label: "Event title" },
    { key: "dateLine", label: "Date" },
    { key: "venueName", label: "Venue" },
    { key: "ctaLabel", label: "Button" },
    { key: "website", label: "Website" },
    { key: "organizerName", label: "Organiser" },
  ],
  lineup: [
    { key: "speakersLabel", label: "Label" },
    { key: "eventTitle", label: "Event title" },
    { key: "dateLine", label: "Date" },
    { key: "venueName", label: "Venue" },
    { key: "ctaLabel", label: "Button" },
    { key: "website", label: "Website" },
    { key: "organizerName", label: "Organiser" },
  ],
  partner: [
    { key: "sponsorLabel", label: "Label" },
    { key: "partnerLine", label: "Headline" },
    { key: "eventTitle", label: "Event title" },
    { key: "dateLine", label: "Date" },
    { key: "venueName", label: "Venue" },
    { key: "website", label: "Website" },
    { key: "organizerName", label: "Organiser" },
  ],
};

/** How many speakers a line-up design shows. */
export const LINEUP_SIZE = 6;

/**
 * Every art-directed design, ordered so the picker leads with variety: within
 * a kind, one colourway of each of the twelve directions, then the next
 * colourway of each, and so on.
 */
export const DIRECTION_TEMPLATES: StudioTemplate[] = STUDIO_CATEGORIES.flatMap(({ id: category }) =>
  [0, 1, 2, 3].flatMap((round) =>
    DIRECTIONS.map((direction, i): StudioTemplate => {
      const colourway = direction.ways[(round + i) % direction.ways.length];
      return {
        id: `${direction.id}-${category}-${colourway.id}`,
        name: `${direction.name} · ${colourway.name}`,
        description: direction.blurb,
        category,
        family: direction.name,
        maxSpeakers: category === "speaker" ? 1 : category === "lineup" ? LINEUP_SIZE : 0,
        palette: colourway.palette,
        paletteLabels: direction.labels,
        fields: FIELDS[category],
        build: (input) => direction.build(input, category),
      };
    }),
  ),
);
