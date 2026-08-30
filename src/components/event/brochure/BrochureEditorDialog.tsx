/**
 * BrochureEditorDialog — the WYSIWYG brochure editor.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │  Toolbar (title, undo, redo, export)           │
 *   ├───┬────────────────────────────┬───────────────┤
 *   │ P │        Canvas              │  Properties   │
 *   │ a │                            │               │
 *   │ l │                            │               │
 *   │ e │                            │               │
 *   │ t │                            │               │
 *   │ t │                            │               │
 *   │ e │                            │               │
 *   ├───┴────────────────────────────┴───────────────┤
 *   │  Page thumbnails + add / duplicate / delete    │
 *   └────────────────────────────────────────────────┘
 *
 * Loads a document from the chosen template seed on first open,
 * maintains an undo/redo history stack, and offers global keyboard
 * shortcuts. Every one of these acts on the WHOLE selection, which may be
 * several elements:
 *   - Delete / Backspace  — delete the selection
 *   - Escape              — clear the selection
 *   - Cmd/Ctrl-Z          — undo
 *   - Cmd/Ctrl-Shift-Z    — redo (also Cmd/Ctrl-Y)
 *   - Cmd/Ctrl-D          — duplicate the selection
 *   - Cmd/Ctrl-A          — select everything on the active page
 *   - Cmd/Ctrl-C / X / V  — copy / cut / paste (paste targets the ACTIVE page,
 *                           which is how an element moves between pages)
 *   - Cmd/Ctrl-G          — group the selection into a card
 *   - Cmd/Ctrl-Shift-G    — ungroup
 *   - Cmd/Ctrl-] / [      — bring forward / send backward
 *   - Cmd/Ctrl-Shift-] /[ — bring to front / send to back
 *   - Arrow keys          — nudge the selection by 1 mm (10 mm with Shift)
 *
 * Zoom shortcuts (Cmd/Ctrl with `+` / `-` / `0` / `1`, and Cmd/Ctrl-wheel) are
 * owned by `BrochureEditorCanvas` instead, since zoom describes the viewport
 * rather than the selection.
 *
 * Double-clicking a text or pill element edits it in place on the canvas.
 * Alt-clicking reaches a single element inside a grouped card.
 *
 * Export renders each page to a Konva canvas at print DPI and stamps
 * into a jsPDF, then triggers a browser download. Save persists the
 * document JSON via `onSaveDocument` (owned by the parent, which
 * writes to `events.page_config.brochureDocument`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  X,
  Undo2,
  Redo2,
  Download,
  Loader2,
  Save,
  RotateCcw,
  BringToFront,
  SendToBack,
  ArrowUp,
  ArrowDown,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Columns3,
  Rows3,
  Copy,
  Group,
  Ungroup,
  ClipboardCopy,
  ClipboardPaste,
  Scissors,
} from "lucide-react";
import { toast } from "sonner";

import { preloadAllEditorFonts } from "@/lib/brochure/editor/editor-fonts";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/observability";

import BrochureEditorCanvas from "@/lib/brochure/editor/BrochureEditorCanvas";
import BrochureEditorProperties from "@/lib/brochure/editor/BrochureEditorProperties";
import BrochureEditorPalette from "@/lib/brochure/editor/BrochureEditorPalette";
import BrochureEditorPages from "@/lib/brochure/editor/BrochureEditorPages";
import { EDITOR_SEED_VERSION, seedBrochureDocument, type TemplateSeedInput } from "@/lib/brochure/editor/editor-templates";
import type { BrochureSectionId, BrochureTheme } from "@/lib/brochure/brochure-templates";
import {
  addElement,
  addPage,
  generateId,
  newPage,
  removePage,
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
} from "@/lib/brochure/editor/editor-document";
import {
  alignElements,
  copyElements,
  distributeElements,
  duplicateElements,
  groupElements,
  movePage,
  pasteElements,
  reorderElements,
  selectionBounds,
  selectionHasGroup,
  translateElements,
  ungroupElements,
  type AlignAxis,
  type LayerOp,
} from "@/lib/brochure/editor/editor-operations";
import { useHistory } from "@/lib/brochure/editor/editor-history";
import { downloadDocumentAsPdf } from "@/lib/brochure/editor/editor-pdf";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Brochure_Theme currently selected in the configurator — drives
   *  the cover style, accent/font resolution, and which agenda layout
   *  the seed uses, so the editor opens with the SAME visual theme the
   *  live preview shows (Requirement: editor/preview parity). */
  theme: BrochureTheme;
  /** The resolved (included, in render order) Section_Layout ids the
   *  live preview is currently showing — the seed builds exactly one
   *  editor page per id here, in this order, so the editor can never
   *  show a different set/order of pages than the preview/export. */
  resolvedSectionIds: BrochureSectionId[];
  seed: TemplateSeedInput;
  /** Load an existing document (from Supabase) instead of seeding from
   *  a template. `null` triggers the template seed. */
  initialDocument?: BrochureDocument | null;
  /** Called when the user clicks Save. Parent persists to Supabase and
   *  can return a Promise for a spinner. */
  onSaveDocument?: (doc: BrochureDocument) => Promise<void> | void;
}

export default function BrochureEditorDialog({
  open,
  onOpenChange,
  theme,
  resolvedSectionIds,
  seed,
  initialDocument,
  onSaveDocument,
}: Props) {
  // A saved document is "stale" when it was seeded by an OLDER version
  // of `seedBrochureDocument` than what's running now (or has no
  // `templateVersion` at all — every document saved before this
  // versioning existed). This is the actual root-cause fix for a real
  // bug: previously `initialDocument` unconditionally won over a fresh
  // seed, forever — so every time the seed's layout was corrected to
  // better match the live jsPDF preview, an organizer who'd already
  // saved from the editor kept seeing the stale pre-fix layout
  // indefinitely, with the live preview (always regenerated from
  // current code) and the saved editor document (frozen at save time)
  // silently and permanently diverging. There was no way for the
  // organizer to know why, or to fix it themselves short of a manual
  // "Reset to template" click they'd have no reason to make.
  // NOTE — this is now advisory only, and deliberately so.
  //
  // It used to DISCARD the organizer's saved document and silently re-seed.
  // That behaviour existed to hide a symptom of the old dual-renderer
  // architecture: the theme-driven jsPDF pipeline drew the preview while the
  // editor drew from the document, so every time the mirrored seed layout was
  // corrected, an already-saved document froze at the old layout and drifted
  // from the preview forever.
  //
  // The renderers are now unified — `resolveBrochureDocument` makes the saved
  // document the single source for the preview, the canvas AND the export — so
  // a "stale" document is no longer inconsistent with anything. It is simply
  // the organizer's own work, authored against an earlier template. Throwing
  // that away without asking is strictly worse than keeping it: the drift it
  // was protecting against cannot happen any more.
  //
  // The flag is kept only to OFFER a refresh via the existing, undoable
  // "Reset to template" button.
  const isOlderTemplateVersion =
    !!initialDocument &&
    (initialDocument.templateVersion === undefined ||
      initialDocument.templateVersion < EDITOR_SEED_VERSION);

  // Initial document is computed once when the dialog first opens.
  // Re-opening resets to a fresh copy so switching templates works.
  const initial = useMemo<BrochureDocument | null>(() => {
    // A saved document ALWAYS wins now, regardless of template version. The
    // previous `&& !isStaleSavedDocument` guard silently replaced the
    // organizer's work on open; see the comment on `isOlderTemplateVersion`.
    if (initialDocument) return initialDocument;
    if (!open) return null;
    return seedBrochureDocument(seed, theme, resolvedSectionIds);
    // Only re-seed when the theme, section list, or seed shape changes;
    // ignore `open` toggling so mid-session close→reopen keeps user
    // edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    theme,
    resolvedSectionIds,
    seed.eventTitle,
    seed.coverImageUrl,
    seed.logoUrl,
    seed.organizerLogoUrl,
    initialDocument,
  ]);

  // Non-destructive notice. The saved document is loaded as-is; this only
  // mentions that a newer starting template exists and points at the
  // (undoable) "Reset to template" button. Nothing is discarded.
  useEffect(() => {
    if (open && isOlderTemplateVersion) {
      toast.info("A newer starting template is available", {
        description:
          "Your saved layout has been kept exactly as you left it. Use \"Reset to template\" if you'd rather start from the current design — it's undoable.",
      });
    }
    // Fire once per dialog open, not on every dep change within an
    // open session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const history = useHistory<BrochureDocument | null>(initial);
  const doc = history.value;

  const [activePageId, setActivePageId] = useState<string | null>(
    initial?.pages[0]?.id ?? null
  );
  /**
   * Multi-selection. A "card" in the seeded templates is several loose
   * primitives, so grabbing a set of them is the only way to move or resize a
   * card as a unit without introducing a nested `group` element kind into the
   * document model (which would have to be threaded through the canvas
   * renderer, the PDF exporter, the properties panel and every seed builder).
   */
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * The properties panel edits ONE element's kind-specific fields, so it stays
   * single-selection. With 2+ selected it shows its page-level empty state,
   * which is the honest thing to show — there is no meaningful "font size" for
   * a mixed selection of a rect and two text runs.
   */
  const selectedElementId = selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const hasSelection = selectedElementIds.length > 0;
  const hasMultiSelection = selectedElementIds.length > 1;

  // On template swap (or first mount), reset the history and select
  // the first page.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      history.reset(initial);
      setActivePageId(initial.pages[0]?.id ?? null);
      setSelectedElementIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open]);

  // Preload the curated Google Fonts catalog once per dialog open so
  // subsequent picks in the font dropdown apply instantly on the
  // canvas and appear correctly in the PDF export.
  useEffect(() => {
    if (!open) return;
    void preloadAllEditorFonts();
  }, [open]);

  const setDoc = useCallback(
    (next: BrochureDocument) => history.set(next),
    [history]
  );

  // ─── Element mutations ──────────────────────────────────────────────────
  const handleAddElement = useCallback(
    (element: BrochureElement) => {
      if (!doc || !activePageId) return;
      const next = addElement(doc, activePageId, element);
      setDoc(next);
      // Find the just-added element (last one in the target page) so we
      // can select it after commit.
      const page = next.pages.find((p) => p.id === activePageId);
      const last = page?.elements[page.elements.length - 1];
      if (last) setSelectedElementIds([last.id]);
    },
    [doc, activePageId, setDoc]
  );

  // Selects the copies rather than leaving the originals selected, so
  // duplicate-then-drag works without an intermediate click.
  const handleDuplicateSelected = useCallback(() => {
    if (!doc || !activePageId || !hasSelection) return;
    const { doc: next, newIds } = duplicateElements(doc, activePageId, selectedElementIds);
    if (newIds.length === 0) return;
    setDoc(next);
    setSelectedElementIds(newIds);
  }, [doc, activePageId, hasSelection, selectedElementIds, setDoc]);

  const handleDeleteSelected = useCallback(() => {
    if (!doc || !activePageId || !hasSelection) return;
    const doomed = new Set(selectedElementIds);
    setDoc({
      ...doc,
      pages: doc.pages.map((p) =>
        p.id === activePageId
          ? { ...p, elements: p.elements.filter((el) => !doomed.has(el.id)) }
          : p
      ),
      updatedAt: new Date().toISOString(),
    });
    setSelectedElementIds([]);
  }, [doc, activePageId, hasSelection, selectedElementIds, setDoc]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!doc || !activePageId || !hasSelection) return;
      setDoc(translateElements(doc, activePageId, selectedElementIds, dx, dy));
    },
    [doc, activePageId, hasSelection, selectedElementIds, setDoc]
  );

  // ─── Layer / align / distribute ─────────────────────────────────────────
  //
  // The document model always carried `zIndex`, but there was no UI to change
  // it: an element added later was permanently in front of one added earlier,
  // which makes a template uneditable in practice (you could not put a caption
  // over an image, or push a background panel behind text).

  const handleReorder = useCallback(
    (op: LayerOp) => {
      if (!doc || !activePageId || !hasSelection) return;
      setDoc(reorderElements(doc, activePageId, selectedElementIds, op));
    },
    [doc, activePageId, hasSelection, selectedElementIds, setDoc]
  );

  const handleAlign = useCallback(
    (axis: AlignAxis) => {
      if (!doc || !activePageId || !hasSelection) return;
      setDoc(alignElements(doc, activePageId, selectedElementIds, axis));
    },
    [doc, activePageId, hasSelection, selectedElementIds, setDoc]
  );

  const handleDistribute = useCallback(
    (direction: "horizontal" | "vertical") => {
      if (!doc || !activePageId) return;
      setDoc(distributeElements(doc, activePageId, selectedElementIds, direction));
    },
    [doc, activePageId, selectedElementIds, setDoc]
  );

  // Grouping tags the selection with a shared id so it selects, moves and
  // resizes as one card. The seeded templates pre-group their cards; this is for
  // arrangements the organizer builds themselves.
  const handleGroup = useCallback(() => {
    if (!doc || !activePageId || selectedElementIds.length < 2) return;
    setDoc(groupElements(doc, activePageId, selectedElementIds));
    toast.success("Grouped", {
      description: "These now move and resize together. Alt-click to edit one piece.",
    });
  }, [doc, activePageId, selectedElementIds, setDoc]);

  const handleUngroup = useCallback(() => {
    if (!doc || !activePageId || !hasSelection) return;
    setDoc(ungroupElements(doc, activePageId, selectedElementIds));
  }, [doc, activePageId, hasSelection, selectedElementIds, setDoc]);

  // ─── Clipboard ──────────────────────────────────────────────────────────
  //
  // A ref rather than state: nothing renders from the clipboard, so storing it
  // in state would re-render the whole editor on every copy for no benefit.
  // Deliberately an in-editor clipboard rather than the system one — reading
  // `navigator.clipboard` needs a permission prompt and can only carry text, so
  // round-tripping elements through it would mean serialising to a string and
  // guessing whether an arbitrary paste came from us.
  const clipboardRef = useRef<BrochureElement[]>([]);

  const handleCopy = useCallback(() => {
    if (!doc || !activePageId || !hasSelection) return false;
    const page = doc.pages.find((p) => p.id === activePageId);
    if (!page) return false;
    clipboardRef.current = copyElements(page, selectedElementIds);
    return clipboardRef.current.length > 0;
  }, [doc, activePageId, hasSelection, selectedElementIds]);

  const handleCut = useCallback(() => {
    if (handleCopy()) handleDeleteSelected();
  }, [handleCopy, handleDeleteSelected]);

  // Pastes onto the ACTIVE page, so copy here / switch page / paste there is how
  // an element moves between pages.
  const handlePaste = useCallback(() => {
    if (!doc || !activePageId || clipboardRef.current.length === 0) return;
    const { doc: next, newIds } = pasteElements(doc, activePageId, clipboardRef.current);
    if (newIds.length === 0) return;
    setDoc(next);
    setSelectedElementIds(newIds);
  }, [doc, activePageId, setDoc]);

  const handleMovePage = useCallback(
    (pageId: string, direction: "earlier" | "later") => {
      if (!doc) return;
      setDoc(movePage(doc, pageId, direction));
    },
    [doc, setDoc]
  );

  const handleRenameDocument = useCallback(
    (title: string) => {
      if (!doc) return;
      setDoc({ ...doc, title, updatedAt: new Date().toISOString() });
    },
    [doc, setDoc]
  );

  const handleSelectAllOnPage = useCallback(() => {
    if (!doc || !activePageId) return;
    const page = doc.pages.find((p) => p.id === activePageId);
    if (!page) return;
    setSelectedElementIds(page.elements.map((el) => el.id));
  }, [doc, activePageId]);

  // ─── Page mutations ─────────────────────────────────────────────────────
  const handleAddPage = useCallback(() => {
    if (!doc) return;
    // Inherit the current page's dimensions and background rather than always
    // producing A4. `newPage()` is hardcoded to A4, and the exporter honours
    // per-page size — so adding a page to, say, an Instagram-story document
    // silently produced a PDF with one A4 sheet wedged into it.
    const current = doc.pages.find((p) => p.id === activePageId);
    const base = newPage();
    const page = current
      ? { ...base, width: current.width, height: current.height, background: current.background }
      : base;
    const next = addPage(doc, page);
    setDoc(next);
    setActivePageId(page.id);
    setSelectedElementIds([]);
  }, [doc, activePageId, setDoc]);

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      if (!doc) return;
      const source = doc.pages.find((p) => p.id === pageId);
      if (!source) return;
      const cloned: BrochurePage = {
        ...source,
        id: generateId("page"),
        // Each element also needs a fresh id so selecting the clone
        // doesn't select the original.
        elements: source.elements.map((el) => ({
          ...el,
          id: generateId(el.kind),
        } as BrochureElement)),
      };
      setDoc(addPage(doc, cloned));
      setActivePageId(cloned.id);
      setSelectedElementIds([]);
    },
    [doc, setDoc]
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (!doc) return;
      const next = removePage(doc, pageId);
      setDoc(next);
      // If the removed page was active, fall back to the first
      // remaining page.
      if (pageId === activePageId) {
        setActivePageId(next.pages[0]?.id ?? null);
      }
      setSelectedElementIds([]);
    },
    [doc, activePageId, setDoc]
  );

  // ─── Global keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const isTypingElement =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (isTypingElement) return;

      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history.undo();
      } else if (
        (isMeta && e.shiftKey && e.key.toLowerCase() === "z") ||
        (isMeta && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        history.redo();
      } else if (isMeta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (isMeta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAllOnPage();
      } else if (isMeta && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopy();
      } else if (isMeta && e.key.toLowerCase() === "x") {
        e.preventDefault();
        handleCut();
      } else if (isMeta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePaste();
      } else if (isMeta && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleUngroup();
      } else if (isMeta && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleGroup();
        // Matched on `e.code`, not `e.key`. `e.key` reports the SHIFTED
        // character, so `Cmd+Shift+]` arrives as "}" — comparing against "]"
        // never matched, nothing called preventDefault, and the browser's
        // next-tab shortcut fired instead, navigating away from the editor.
      } else if (isMeta && e.shiftKey && e.code === "BracketRight") {
        e.preventDefault();
        handleReorder("front");
      } else if (isMeta && e.shiftKey && e.code === "BracketLeft") {
        e.preventDefault();
        handleReorder("back");
      } else if (isMeta && e.code === "BracketRight") {
        e.preventDefault();
        handleReorder("forward");
      } else if (isMeta && e.code === "BracketLeft") {
        e.preventDefault();
        handleReorder("backward");
      } else if (e.key === "Escape") {
        // Only clear the selection; the Dialog's own handler closes the editor
        // when there's nothing selected to clear.
        if (hasSelection) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedElementIds([]);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (hasSelection) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (e.key.startsWith("Arrow")) {
        if (!hasSelection) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
        else if (e.key === "ArrowRight") nudgeSelected(step, 0);
        else if (e.key === "ArrowUp") nudgeSelected(0, -step);
        else if (e.key === "ArrowDown") nudgeSelected(0, step);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    open,
    history,
    hasSelection,
    handleDuplicateSelected,
    handleDeleteSelected,
    handleSelectAllOnPage,
    handleReorder,
    handleGroup,
    handleUngroup,
    handleCopy,
    handleCut,
    handlePaste,
    nudgeSelected,
  ]);

  // ─── Export / save ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!doc) return;
    setIsExporting(true);
    try {
      const filename = `${(doc.title || "brochure").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.pdf`;
      await downloadDocumentAsPdf(doc, filename);
      toast.success("Brochure exported");
    } catch (err) {
      logger.error("brochure editor export failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [doc]);

  const handleSave = useCallback(async () => {
    if (!doc || !onSaveDocument) return;
    setIsSaving(true);
    try {
      await onSaveDocument(doc);
      toast.success("Brochure saved");
    } catch (err) {
      logger.error("brochure editor save failed", {
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [doc, onSaveDocument]);

  // ─── Reset to template ─────────────────────────────────────────────────
  //
  // When an organizer saved a brochure document in an EARLIER release
  // (before the current seed layout was authored), reopening the editor
  // silently loads that stale saved document via `initialDocument` —
  // producing visible drift between the live preview (always re-generated
  // from current code) and the editor canvas (loaded from disk).
  //
  // This handler discards whatever's currently in the editor and rebuilds
  // a fresh document from the CURRENT seed + theme + resolved section
  // list, then commits it through the history stack so the previous
  // state is still undoable. It doesn't auto-save — the organizer has to
  // click "Save" to persist the reset. That's deliberate: an accidental
  // reset click shouldn't blow away weeks of edits without a chance to
  // undo.
  const handleResetToTemplate = useCallback(() => {
    const fresh = seedBrochureDocument(seed, theme, resolvedSectionIds);
    history.set(fresh);
    setActivePageId(fresh.pages[0]?.id ?? null);
    setSelectedElementIds([]);
    toast.success("Reset to template", {
      description: "Save to keep the fresh layout, or Undo to restore your edits.",
    });
  }, [seed, theme, resolvedSectionIds, history]);

  const activePage = useMemo(
    () => (doc && activePageId ? doc.pages.find((p) => p.id === activePageId) : null),
    [doc, activePageId]
  );

  /**
   * Size of the current selection in millimetres.
   *
   * Worth surfacing because the canvas is scaled to fit the viewport, so
   * on-screen size tells the organizer nothing about how big something will be
   * on the printed page — which is exactly what they need when resizing an
   * image or matching two cards.
   */
  const selectionSize = useMemo(() => {
    if (!activePage || selectedElementIds.length === 0) return null;
    return selectionBounds(activePage, selectedElementIds);
  }, [activePage, selectedElementIds]);

  const selectionIsGrouped = useMemo(
    () => (activePage ? selectionHasGroup(activePage, selectedElementIds) : false),
    [activePage, selectedElementIds],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-background">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[13px] font-semibold shrink-0">Brochure editor</span>
            {/* Editable, because the title names the exported PDF file. It was
                previously static text set only by the template seed, so the
                organizer had no say in what they downloaded. */}
            <Input
              value={doc?.title ?? ""}
              onChange={(e) => handleRenameDocument(e.target.value)}
              disabled={!doc}
              placeholder="Untitled brochure"
              aria-label="Brochure title"
              title="Brochure title — also names the exported PDF"
              className="h-7 w-[240px] text-[12px] border-transparent hover:border-border focus-visible:border-border bg-transparent px-2"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={history.undo}
              disabled={!history.canUndo}
              className="h-8 w-8 p-0"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={history.redo}
              disabled={!history.canRedo}
              className="h-8 w-8 p-0"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetToTemplate}
              disabled={!doc}
              className="h-8 gap-1.5 text-[12px]"
              title="Rebuild the current page from the live preview template. Undoable."
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to template
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            {onSaveDocument && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || !doc}
                className="h-8 gap-1.5 text-[12px]"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting || !doc}
              className="h-8 gap-1.5 text-[12px]"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Object toolbar — layer order, alignment, distribution.
            Its own row rather than crammed into the title bar: these are the
            operations an organizer reaches for continuously while laying out a
            page, so they need to be visible at all times rather than hidden
            behind a menu. */}
        {doc && activePageId && (
          <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border shrink-0 bg-muted/30 overflow-x-auto">
            <span className="text-[11px] text-muted-foreground mr-1 shrink-0">
              {selectedElementIds.length === 0
                ? "Nothing selected"
                : selectedElementIds.length === 1
                  ? "1 selected"
                  : `${selectedElementIds.length} selected`}
            </span>
            {selectionSize && (
              <span className="text-[11px] text-muted-foreground/80 tabular-nums shrink-0">
                {Math.round(selectionSize.width)} × {Math.round(selectionSize.height)} mm
              </span>
            )}

            <ToolbarDivider />
            <ToolbarButton
              icon={<BringToFront className="h-3.5 w-3.5" />}
              label="Bring to front (Ctrl+Shift+])"
              disabled={!hasSelection}
              onClick={() => handleReorder("front")}
            />
            <ToolbarButton
              icon={<ArrowUp className="h-3.5 w-3.5" />}
              label="Bring forward (Ctrl+])"
              disabled={!hasSelection}
              onClick={() => handleReorder("forward")}
            />
            <ToolbarButton
              icon={<ArrowDown className="h-3.5 w-3.5" />}
              label="Send backward (Ctrl+[)"
              disabled={!hasSelection}
              onClick={() => handleReorder("backward")}
            />
            <ToolbarButton
              icon={<SendToBack className="h-3.5 w-3.5" />}
              label="Send to back (Ctrl+Shift+[)"
              disabled={!hasSelection}
              onClick={() => handleReorder("back")}
            />

            <ToolbarDivider />
            {/* With one element selected these align to the PAGE; with 2+ they
                align to the selection's bounding box. */}
            <ToolbarButton
              icon={<AlignStartVertical className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Align left edges" : "Align to page left"}
              disabled={!hasSelection}
              onClick={() => handleAlign("left")}
            />
            <ToolbarButton
              icon={<AlignCenterVertical className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Centre horizontally" : "Centre on page"}
              disabled={!hasSelection}
              onClick={() => handleAlign("hcenter")}
            />
            <ToolbarButton
              icon={<AlignEndVertical className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Align right edges" : "Align to page right"}
              disabled={!hasSelection}
              onClick={() => handleAlign("right")}
            />
            <ToolbarButton
              icon={<AlignStartHorizontal className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Align top edges" : "Align to page top"}
              disabled={!hasSelection}
              onClick={() => handleAlign("top")}
            />
            <ToolbarButton
              icon={<AlignCenterHorizontal className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Centre vertically" : "Centre on page"}
              disabled={!hasSelection}
              onClick={() => handleAlign("vcenter")}
            />
            <ToolbarButton
              icon={<AlignEndHorizontal className="h-3.5 w-3.5" />}
              label={hasMultiSelection ? "Align bottom edges" : "Align to page bottom"}
              disabled={!hasSelection}
              onClick={() => handleAlign("bottom")}
            />

            <ToolbarDivider />
            {/* Needs 3+ — with two elements there is no interior gap. */}
            <ToolbarButton
              icon={<Columns3 className="h-3.5 w-3.5" />}
              label="Distribute horizontally (equal gaps, needs 3+)"
              disabled={selectedElementIds.length < 3}
              onClick={() => handleDistribute("horizontal")}
            />
            <ToolbarButton
              icon={<Rows3 className="h-3.5 w-3.5" />}
              label="Distribute vertically (equal gaps, needs 3+)"
              disabled={selectedElementIds.length < 3}
              onClick={() => handleDistribute("vertical")}
            />

            <ToolbarDivider />
            <ToolbarButton
              icon={<Group className="h-3.5 w-3.5" />}
              label="Group into a card (Ctrl+G) — moves and resizes as one"
              disabled={selectedElementIds.length < 2}
              onClick={handleGroup}
            />
            <ToolbarButton
              icon={<Ungroup className="h-3.5 w-3.5" />}
              label="Ungroup (Ctrl+Shift+G)"
              disabled={!selectionIsGrouped}
              onClick={handleUngroup}
            />

            <ToolbarDivider />
            <ToolbarButton
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Duplicate (Ctrl+D)"
              disabled={!hasSelection}
              onClick={handleDuplicateSelected}
            />
            <ToolbarButton
              icon={<ClipboardCopy className="h-3.5 w-3.5" />}
              label="Copy (Ctrl+C) — paste on any page to move it there"
              disabled={!hasSelection}
              onClick={handleCopy}
            />
            <ToolbarButton
              icon={<Scissors className="h-3.5 w-3.5" />}
              label="Cut (Ctrl+X)"
              disabled={!hasSelection}
              onClick={handleCut}
            />
            <ToolbarButton
              icon={<ClipboardPaste className="h-3.5 w-3.5" />}
              label="Paste onto this page (Ctrl+V)"
              onClick={handlePaste}
            />

            <span className="text-[11px] text-muted-foreground ml-auto pl-3 shrink-0">
              {selectionIsGrouped
                ? "Card selected — Alt-click a piece to edit it on its own"
                : "Shift-click or drag on empty space to select several"}
            </span>
          </div>
        )}

        {/* Main workspace */}
        {doc && activePageId && activePage ? (
          <>
            <div className="flex-1 min-h-0 flex">
              <BrochureEditorPalette
                pageWidth={activePage.width}
                pageHeight={activePage.height}
                defaultFontFamily={seed.fontFamily}
                onAddElement={handleAddElement}
              />
              <div className="flex-1 min-w-0 relative">
                <BrochureEditorCanvas
                  document={doc}
                  onChange={setDoc}
                  activePageId={activePageId}
                  selectedElementIds={selectedElementIds}
                  onSelect={setSelectedElementIds}
                />
              </div>
              <BrochureEditorProperties
                document={doc}
                activePageId={activePageId}
                selectedElementId={selectedElementId}
                onChange={setDoc}
                onSelect={(id) => setSelectedElementIds(id ? [id] : [])}
              />
            </div>
            <BrochureEditorPages
              document={doc}
              activePageId={activePageId}
              onSelectPage={(id) => {
                setActivePageId(id);
                setSelectedElementIds([]);
              }}
              onAddPage={handleAddPage}
              onDuplicatePage={handleDuplicatePage}
              onDeletePage={handleDeletePage}
              onMovePage={handleMovePage}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
            Loading template…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Object toolbar primitives ─────────────────────────────────────────────

/**
 * Icon-only toolbar button.
 *
 * `label` drives both the native tooltip and `aria-label` — icon-only controls
 * are unusable with a screen reader otherwise, and this row is entirely
 * icon-only because there are fourteen of them.
 */
function ToolbarButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 p-0 shrink-0"
      title={label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-1 shrink-0" aria-hidden="true" />;
}
