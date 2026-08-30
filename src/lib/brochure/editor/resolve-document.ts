/**
 * `resolveBrochureDocument` — the single decision point for "which document
 * are we rendering?".
 *
 * ## Why this exists
 *
 * The brochure module used to have TWO independent renderers with zero shared
 * code:
 *
 *   Pipeline A  `brochure-pdf.ts`      theme + section driven, jsPDF vector.
 *                                     Powered the configurator's live preview
 *                                     AND its "Download brochure" button.
 *   Pipeline B  `editor/editor-pdf.ts` document driven, Konva raster.
 *                                     Powered the editor canvas AND the
 *                                     editor's own "Export PDF".
 *
 * `seedBrochureDocument` re-implemented pipeline A's layout by hand in
 * pipeline B's model. That had three consequences, all of which users hit:
 *
 *   1. Edits made in the editor were INVISIBLE in the main "Download
 *      brochure" output, because that path never read the document.
 *   2. The two layouts drifted every time either side was touched, which is
 *      the "huge difference between editor and preview" symptom.
 *   3. `EDITOR_SEED_VERSION` was introduced to paper over (2) by DISCARDING
 *      the organizer's saved document whenever the mirror changed — i.e. the
 *      workaround for the duplication destroyed user work.
 *
 * The fix is to stop having two renderers. The `BrochureDocument` is now the
 * only thing that gets rendered, by everything. Pipeline A is demoted to what
 * it is actually good at: pure content assembly (`brochure-sections.ts`) and
 * section resolution (`resolveSectionLayout`), both of which already feed
 * `seedBrochureDocument`.
 *
 * ## The rule
 *
 *   saved document exists  ->  render it verbatim. It is the organizer's work.
 *   no saved document      ->  seed one from the theme, and render that.
 *
 * Because the seed is deterministic given (seed input, theme, section ids),
 * an organizer who never opens the editor still gets a correct themed
 * brochure — "fully template-based" — and the moment they DO edit, their
 * document takes over with no change in rendering path. Preview, canvas and
 * export are then the same picture by construction, not by mirroring.
 */

import type { BrochureSectionId, BrochureTheme } from "../brochure-templates";
import type { BrochureDocument } from "./editor-document";
import { seedBrochureDocument, type TemplateSeedInput } from "./editor-templates";

/** Where the resolved document came from. Callers use this for UI copy —
 *  e.g. telling the organizer the preview reflects their own edits. */
export type DocumentSource = "saved" | "template";

export interface ResolvedBrochureDocument {
  document: BrochureDocument;
  source: DocumentSource;
}

/**
 * Returns the document to render, plus where it came from.
 *
 * @param saved  the organizer's persisted document
 *               (`page_config.brochurePrefs.editorDocument`), or null/undefined.
 * @param seed   source data for a fresh template seed.
 * @param theme  the selected Brochure_Theme.
 * @param sectionIds resolved, ordered section ids (from `resolveSectionLayout`).
 *
 * Pure and synchronous — safe to call inside `useMemo`.
 */
export function resolveBrochureDocument(
  saved: BrochureDocument | null | undefined,
  seed: TemplateSeedInput,
  theme: BrochureTheme,
  sectionIds: BrochureSectionId[],
): ResolvedBrochureDocument {
  if (isUsableDocument(saved)) {
    return { document: saved, source: "saved" };
  }
  return {
    document: seedBrochureDocument(seed, theme, sectionIds),
    source: "template",
  };
}

/**
 * Structural validity check for a document read back from JSONB.
 *
 * `page_config.brochurePrefs.editorDocument` is typed as `pages: unknown[]`
 * and is cast straight through with no schema validation, so a truncated or
 * hand-edited row can produce an object that satisfies TypeScript but would
 * render as a blank PDF. Treating a malformed document as "absent" degrades
 * to the template seed, which is always better than shipping an empty page.
 *
 * Deliberately shallow: it verifies the shape the renderer actually depends
 * on (at least one page, each with positive mm dimensions and an elements
 * array) rather than deep-validating every element, because the renderers
 * already tolerate unknown element kinds and missing images individually.
 */
export function isUsableDocument(
  doc: BrochureDocument | null | undefined,
): doc is BrochureDocument {
  if (!doc || typeof doc !== "object") return false;
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) return false;
  return doc.pages.every(
    (p) =>
      !!p &&
      typeof p === "object" &&
      typeof p.width === "number" &&
      typeof p.height === "number" &&
      p.width > 0 &&
      p.height > 0 &&
      Array.isArray(p.elements),
  );
}
