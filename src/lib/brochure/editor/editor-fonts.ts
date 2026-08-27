/**
 * Curated font catalog + dynamic Google Fonts loader for the brochure
 * editor.
 *
 * Text elements store a `fontFamily` string that maps 1-1 to a family
 * name in `EDITOR_FONTS` below. The corresponding Google Fonts
 * stylesheet is injected the first time the family is used so Konva's
 * canvas text rendering picks it up. Repeated `ensureFontLoaded` calls
 * for the same family are cheap and idempotent.
 *
 * jsPDF (used for the PDF export) can only render its 3 base fonts
 * (helvetica, times, courier) without embedding a TTF; our editor
 * exports through Konva's `.toDataURL` PNG pipeline, so the browser's
 * loaded fonts DO appear in the final PDF as long as they finished
 * loading before the export renders that page. The `document.fonts.ready`
 * await in `exportDocumentToPdf` handles this synchronization.
 */

export type EditorFontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";

export interface EditorFont {
  family: string;
  category: EditorFontCategory;
  /** Font weights we want available for this family (regular + bold at
   *  minimum; extras included for display families that shine at heavier
   *  weights). */
  weights: number[];
}

/**
 * Curated Google Fonts catalog. Kept intentionally small — 24
 * families across five categories — so the picker stays scannable
 * and the total network payload for on-demand font loading stays
 * within reason.
 */
export const EDITOR_FONTS: EditorFont[] = [
  // Sans-serif (workhorse body / UI text)
  { family: "Poppins", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Inter", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Roboto", category: "sans-serif", weights: [400, 500, 700] },
  { family: "Lato", category: "sans-serif", weights: [400, 700, 900] },
  { family: "Open Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Montserrat", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Raleway", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Work Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Nunito", category: "sans-serif", weights: [400, 700] },
  { family: "DM Sans", category: "sans-serif", weights: [400, 700] },
  // "Space Grotesk" is one of the event-theme `FONT_OPTIONS`
  // (`src/components/event/page-form/presets.ts`) an organizer can set
  // as their event's font family — `resolveBrochureTheme` can resolve
  // it as `colors.fontFamily`, which `seedBrochureDocument` then uses
  // directly on every seeded text/pill element. It must be in this
  // catalog or `ensureFontLoaded` silently no-ops for it (unknown
  // family → no <link> ever injected → permanent fallback-font
  // rendering for any brochure themed with this font). Weight set
  // matches the one already used for this family elsewhere in the app
  // (`src/lib/badge-design.ts`'s `"400;500;600;700"`).
  { family: "Space Grotesk", category: "sans-serif", weights: [400, 500, 600, 700] },

  // Serif (elegant, editorial)
  { family: "Playfair Display", category: "serif", weights: [400, 700, 900] },
  { family: "Merriweather", category: "serif", weights: [400, 700] },
  { family: "Lora", category: "serif", weights: [400, 700] },
  { family: "DM Serif Display", category: "serif", weights: [400] },
  { family: "Cormorant Garamond", category: "serif", weights: [400, 700] },

  // Display (big headline, poster)
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Oswald", category: "display", weights: [400, 700] },
  { family: "Anton", category: "display", weights: [400] },
  { family: "Archivo Black", category: "display", weights: [400] },

  // Handwriting (accents)
  { family: "Pacifico", category: "handwriting", weights: [400] },
  { family: "Dancing Script", category: "handwriting", weights: [400, 700] },
  { family: "Great Vibes", category: "handwriting", weights: [400] },

  // Monospace (code, technical)
  { family: "JetBrains Mono", category: "monospace", weights: [400, 700] },
  { family: "Space Mono", category: "monospace", weights: [400, 700] },
];

/** Set of families already injected as <link> tags so repeated
 *  `ensureFontLoaded` calls for the same family are no-ops. Lives on
 *  the module level, i.e. persists for the entire browser session. */
const loadedFamilies = new Set<string>();

/**
 * Subscribers notified every time a previously-unloaded font family
 * finishes loading. Konva does NOT repaint its canvas automatically
 * when a web font becomes available mid-session — the official Konva
 * docs on custom fonts spell this out explicitly: canvas text needs an
 * imperative redraw after the font finishes loading, unlike DOM text
 * which the browser updates on its own
 * (https://konvajs.org/docs/sandbox/Custom_Font.html). Without this,
 * any text element seeded with (or switched to) a family that wasn't
 * already cached by the browser renders in the fallback font
 * indefinitely — this was the root cause of the reported "font issues"
 * in the editor canvas.
 *
 * `BrochureEditorCanvas` registers a listener on mount that forces a
 * Konva stage redraw whenever this fires.
 */
const fontLoadListeners = new Set<() => void>();

/** Registers a callback invoked every time a font family finishes
 *  loading via `ensureFontLoaded`. Returns an unsubscribe function. */
export function onFontLoaded(listener: () => void): () => void {
  fontLoadListeners.add(listener);
  return () => fontLoadListeners.delete(listener);
}

function notifyFontLoaded(): void {
  for (const listener of fontLoadListeners) listener();
}

/**
 * Injects the Google Fonts stylesheet `<link>` for `family` into the
 * document `<head>` if it hasn't been loaded yet. Returns a promise
 * that resolves when `document.fonts.ready` fires — this is what the
 * PDF export waits on before rendering, so bespoke fonts appear
 * correctly in the exported document rather than falling back to the
 * browser's default serif.
 *
 * Safe to call on the server / during SSR: bails out silently when
 * `document` is undefined.
 */
export async function ensureFontLoaded(family: string): Promise<void> {
  if (typeof document === "undefined") return;
  if (loadedFamilies.has(family)) {
    await document.fonts.ready;
    return;
  }
  const meta = EDITOR_FONTS.find((f) => f.family === family);
  if (!meta) {
    // Unknown family — leave it to the browser's font-family fallback
    // stack. Not treated as an error since a template seed can
    // reference a family that the user has custom-loaded elsewhere.
    return;
  }
  const familyQuery = encodeURIComponent(family).replace(/%20/g, "+");
  const weightsQuery = meta.weights.join(";");
  const href = `https://fonts.googleapis.com/css2?family=${familyQuery}:wght@${weightsQuery}&display=swap`;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  loadedFamilies.add(family);

  // Wait for the font stylesheet to finish loading + shape all
  // requested weights.
  await new Promise<void>((resolve) => {
    if (link.sheet) {
      resolve();
      return;
    }
    link.addEventListener("load", () => resolve(), { once: true });
    // Fallback timeout so a network failure doesn't hang the editor
    // indefinitely — after 3s we resolve and let the browser fall back
    // to the CSS font-family stack.
    setTimeout(resolve, 3000);
  });
  // Explicitly request every weight via the Font Loading API too (not
  // just the <link> stylesheet) — `document.fonts.ready` only resolves
  // once fonts already *requested* for use finish loading. A family
  // that's merely linked but never referenced by any rendered DOM text
  // can otherwise leave `document.fonts.ready` resolving before the
  // family is actually usable, which previously showed up as brochure
  // text staying in the fallback font on first paint.
  await Promise.all(
    meta.weights.map((w) =>
      document.fonts.load(`${w} 16px "${family}"`).catch(() => undefined)
    )
  );
  await document.fonts.ready;
  notifyFontLoaded();
}

/**
 * Eager-loads every family in the catalog. Called once when the editor
 * dialog opens so subsequent picks in the font dropdown are instant.
 * The requests are parallel; failure of any one family is silently
 * ignored (each call is `.catch(() => undefined)`d).
 */
export async function preloadAllEditorFonts(): Promise<void> {
  await Promise.all(
    EDITOR_FONTS.map((f) => ensureFontLoaded(f.family).catch(() => undefined))
  );
}
