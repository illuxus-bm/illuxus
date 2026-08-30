/**
 * Feature-neutral Google Fonts loader for canvas rendering.
 *
 * ## Why this exists
 *
 * `document.fonts.load("700 16px Dancing Script")` does **not** fetch a font.
 * The Font Loading API only shapes a face that a stylesheet has already
 * *declared* — if no `@font-face` rule for that family exists, the call
 * resolves successfully having done nothing, and the subsequent canvas draw
 * silently falls back to the CSS font stack.
 *
 * That distinction is the root of a whole class of "why is my canvas text in
 * the wrong font" bugs: the code looks like it awaits the font, the promise
 * resolves, and the text still renders in system sans. The fix is to inject
 * the stylesheet `<link>` first, *then* ask the Font Loading API to shape the
 * specific weights, *then* draw.
 *
 * This module owns that sequence. Callers supply a family and its weights;
 * everything else (dedupe, `<link>` injection, per-weight shaping, the
 * network-failure timeout) is handled here.
 *
 * ## Why canvas needs this and DOM text doesn't
 *
 * When a webfont arrives late, the browser reflows and repaints DOM text on
 * its own. A `<canvas>` is just a bitmap — pixels already rasterized with the
 * fallback face stay that way until something redraws. So canvas renderers
 * have to *await* font readiness before their first measure/draw rather than
 * firing and forgetting. `ensureWebFont` is designed to be awaited.
 *
 * @see src/lib/creatives/creative-fonts.ts — the creatives catalog + wrapper
 */

/**
 * Families whose `<link>` has already been appended, so repeated calls are
 * cheap no-ops. Module-level, so it persists for the browser session.
 *
 * Keyed by family name alone rather than family+weights: the injected
 * stylesheet always requests the full weight list the caller declared for
 * that family, so a second call with a subset needs no additional network
 * work.
 */
const injectedFamilies = new Set<string>();

/**
 * In-flight and settled load promises, keyed by family. Returned to
 * concurrent callers so N simultaneous requests for the same family share
 * one network round-trip instead of racing.
 *
 * Without this, a plan containing eight text elements in the same family
 * would fire eight parallel `ensureWebFont` calls, each appending its own
 * `<link>` before any of them had a chance to record the family as injected.
 */
const loadPromises = new Map<string, Promise<void>>();

/**
 * How long to wait for a font stylesheet before giving up and letting the
 * browser fall back. A hung font CDN must never hang a render — an export
 * in the fallback face is a worse-looking success, but a promise that never
 * settles is a spinner that never stops.
 */
const STYLESHEET_TIMEOUT_MS = 3000;

/** Builds the Google Fonts CSS2 URL for a family and its weights. */
export function googleFontsHref(family: string, weights: readonly number[]): string {
  // Google's API wants `+` for spaces, not `%20`.
  const familyQuery = encodeURIComponent(family).replace(/%20/g, "+");
  const weightQuery = [...new Set(weights)].sort((a, b) => a - b).join(";");
  return `https://fonts.googleapis.com/css2?family=${familyQuery}:wght@${weightQuery}&display=swap`;
}

/**
 * Ensures `family` is fetched and every weight in `weights` is shaped and
 * ready for canvas measurement. Idempotent per family, and safe to call
 * concurrently — callers share one underlying load.
 *
 * Resolves (never rejects) in every failure mode: no DOM, a blocked CDN, a
 * bogus family name. A font that can't be loaded degrades to the caller's
 * CSS fallback stack, which is a cosmetic regression rather than a broken
 * render.
 *
 * Awaiting this before the first `measureText` is what makes canvas
 * typography deterministic.
 */
export async function ensureWebFont(family: string, weights: readonly number[]): Promise<void> {
  if (typeof document === "undefined") return;

  const existing = loadPromises.get(family);
  if (existing) return existing;

  const promise = loadFamily(family, weights);
  loadPromises.set(family, promise);
  return promise;
}

async function loadFamily(family: string, weights: readonly number[]): Promise<void> {
  try {
    if (!injectedFamilies.has(family)) {
      injectedFamilies.add(family);
      await injectStylesheet(googleFontsHref(family, weights));
    }

    // Shape each weight explicitly. `document.fonts.ready` alone is not
    // enough: it resolves once the fonts *currently in use by rendered
    // content* have settled, and a family that is only linked — never
    // referenced by any DOM node — may not be counted. Canvas text is
    // exactly that case, since the canvas is a bitmap and never
    // participates in font matching. Asking for each weight by name is
    // what actually forces the fetch.
    if (document.fonts) {
      await Promise.all(
        [...new Set(weights)].map((weight) =>
          document.fonts.load(`${weight} 16px "${family}"`).catch(() => undefined),
        ),
      );
      await document.fonts.ready;
    }
  } catch {
    // Best-effort by design — see the doc comment above.
  }
}

/**
 * Appends a stylesheet `<link>` and resolves once it has loaded, errored, or
 * timed out. Resolving on error is deliberate: the caller's next step is to
 * shape weights, which will simply fail over to the fallback face.
 */
function injectStylesheet(href: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    link.addEventListener("load", settle, { once: true });
    link.addEventListener("error", settle, { once: true });
    setTimeout(settle, STYLESHEET_TIMEOUT_MS);

    document.head.appendChild(link);

    // Already cached by the browser: the sheet is live synchronously and no
    // `load` event will fire.
    if (link.sheet) settle();
  });
}

/**
 * Test seam — drops the memoized state so a suite can assert on injection
 * behavior across cases without leaking a `<link>` from one test into the
 * next. Not used in product code.
 */
export function __resetWebFontCacheForTests(): void {
  injectedFamilies.clear();
  loadPromises.clear();
}
