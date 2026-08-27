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
 * shortcuts:
 *   - Delete / Backspace  — delete the selected element
 *   - Cmd/Ctrl-Z          — undo
 *   - Cmd/Ctrl-Shift-Z    — redo (also Cmd/Ctrl-Y)
 *   - Cmd/Ctrl-D          — duplicate the selected element
 *   - Arrow keys          — nudge selected element by 1 mm (10 mm with Shift)
 *
 * Export renders each page to a Konva canvas at print DPI and stamps
 * into a jsPDF, then triggers a browser download. Save persists the
 * document JSON via `onSaveDocument` (owned by the parent, which
 * writes to `events.page_config.brochureDocument`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Undo2, Redo2, Download, Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { preloadAllEditorFonts } from "@/lib/brochure/editor/editor-fonts";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  findElement,
  generateId,
  newPage,
  removePage,
  updateElement,
  type BrochureDocument,
  type BrochureElement,
  type BrochurePage,
} from "@/lib/brochure/editor/editor-document";
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
  const isStaleSavedDocument =
    !!initialDocument &&
    (initialDocument.templateVersion === undefined ||
      initialDocument.templateVersion < EDITOR_SEED_VERSION);

  // Initial document is computed once when the dialog first opens.
  // Re-opening resets to a fresh copy so switching templates works.
  // A stale saved document (see above) is treated the same as "no
  // saved document" — always re-seeded from current code rather than
  // trusted verbatim.
  const initial = useMemo<BrochureDocument | null>(() => {
    if (initialDocument && !isStaleSavedDocument) return initialDocument;
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
    isStaleSavedDocument,
  ]);

  // Surface the auto-reseed to the organizer once per dialog open —
  // silently discarding a previously-saved layout without any
  // explanation would be confusing (and indistinguishable from a bug)
  // if they'd made custom edits on top of the old seed they wanted to
  // keep. They can still Undo back to nothing (there's nothing to undo
  // TO here since this IS the initial state) — practically, this is a
  // one-time notice: Save afterwards to adopt the corrected layout, or
  // manually rebuild anything from their old version they want to
  // preserve.
  useEffect(() => {
    if (open && isStaleSavedDocument) {
      toast.info("Brochure layout updated", {
        description:
          "This brochure was last edited with an older layout. We've refreshed it to match the current live preview — Save to keep it.",
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // On template swap (or first mount), reset the history and select
  // the first page.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      history.reset(initial);
      setActivePageId(initial.pages[0]?.id ?? null);
      setSelectedElementId(null);
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
      if (last) setSelectedElementId(last.id);
    },
    [doc, activePageId, setDoc]
  );

  const handleDuplicateSelected = useCallback(() => {
    if (!doc || !activePageId || !selectedElementId) return;
    const el = findElement(doc, activePageId, selectedElementId);
    if (!el) return;
    // Clone with a new id and offset the position slightly so the
    // duplicate is visually distinct.
    const clone: BrochureElement = {
      ...el,
      id: generateId(el.kind),
      x: el.x + 4,
      y: el.y + 4,
    } as BrochureElement;
    handleAddElement(clone);
  }, [doc, activePageId, selectedElementId, handleAddElement]);

  const handleDeleteSelected = useCallback(() => {
    if (!doc || !activePageId || !selectedElementId) return;
    setDoc({
      ...doc,
      pages: doc.pages.map((p) =>
        p.id === activePageId
          ? { ...p, elements: p.elements.filter((el) => el.id !== selectedElementId) }
          : p
      ),
      updatedAt: new Date().toISOString(),
    });
    setSelectedElementId(null);
  }, [doc, activePageId, selectedElementId, setDoc]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!doc || !activePageId || !selectedElementId) return;
      const el = findElement(doc, activePageId, selectedElementId);
      if (!el) return;
      setDoc(updateElement(doc, activePageId, selectedElementId, {
        x: el.x + dx,
        y: el.y + dy,
      }));
    },
    [doc, activePageId, selectedElementId, setDoc]
  );

  // ─── Page mutations ─────────────────────────────────────────────────────
  const handleAddPage = useCallback(() => {
    if (!doc) return;
    const page = newPage();
    const next = addPage(doc, page);
    setDoc(next);
    setActivePageId(page.id);
    setSelectedElementId(null);
  }, [doc, setDoc]);

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
      setSelectedElementId(null);
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
      setSelectedElementId(null);
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
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedElementId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (e.key.startsWith("Arrow")) {
        if (!selectedElementId) return;
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
  }, [open, history, selectedElementId, handleDuplicateSelected, handleDeleteSelected, nudgeSelected]);

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
    setSelectedElementId(null);
    toast.success("Reset to template", {
      description: "Save to keep the fresh layout, or Undo to restore your edits.",
    });
  }, [seed, theme, resolvedSectionIds, history]);

  const activePage = useMemo(
    () => (doc && activePageId ? doc.pages.find((p) => p.id === activePageId) : null),
    [doc, activePageId]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-background">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold">Brochure editor</span>
            <span className="text-[11px] text-muted-foreground truncate max-w-[300px]">
              {doc?.title ?? "Loading…"}
            </span>
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
                  selectedElementId={selectedElementId}
                  onSelect={setSelectedElementId}
                />
              </div>
              <BrochureEditorProperties
                document={doc}
                activePageId={activePageId}
                selectedElementId={selectedElementId}
                onChange={setDoc}
                onSelect={setSelectedElementId}
              />
            </div>
            <BrochureEditorPages
              document={doc}
              activePageId={activePageId}
              onSelectPage={(id) => {
                setActivePageId(id);
                setSelectedElementId(null);
              }}
              onAddPage={handleAddPage}
              onDuplicatePage={handleDuplicatePage}
              onDeletePage={handleDeletePage}
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
