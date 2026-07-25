/**
 * BrochureEditorDialog — Phase 1 of the WYSIWYG brochure editor.
 *
 * Opens as a large dialog with:
 *  - Centre: the interactive Konva canvas (`BrochureEditorCanvas`)
 *    rendering the active page.
 *  - Right: a properties panel (`BrochureEditorProperties`) for the
 *    currently-selected element (or page-level fields when nothing is
 *    selected).
 *  - Top: a small toolbar showing the document title and a Close
 *    button. Undo/redo, add-element palette, page management, and PDF
 *    export live in later phases.
 *
 * Phase 1 loads a document from a template preset the first time the
 * dialog opens (Poster Bold cover for now). Edits are in-memory only —
 * closing the dialog discards them unless the caller supplies an
 * `onDocumentPersist` prop (Phase 2 wires this to Supabase).
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import BrochureEditorCanvas from "@/lib/brochure/editor/BrochureEditorCanvas";
import BrochureEditorProperties from "@/lib/brochure/editor/BrochureEditorProperties";
import { seedPosterBoldCover, seedCorporateBoldCover, type TemplateSeedInput } from "@/lib/brochure/editor/editor-templates";
import type { BrochureDocument } from "@/lib/brochure/editor/editor-document";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which template to seed the document from on first open. */
  templateId: "poster-bold" | "corporate-bold";
  seed: TemplateSeedInput;
}

export default function BrochureEditorDialog({ open, onOpenChange, templateId, seed }: Props) {
  const [doc, setDoc] = useState<BrochureDocument | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Seed the document the first time the dialog opens for this template.
  const templateKey = useMemo(() => `${templateId}:${seed.eventTitle}`, [templateId, seed.eventTitle]);
  useEffect(() => {
    if (!open) return;
    if (doc) return;
    const seeded =
      templateId === "corporate-bold" ? seedCorporateBoldCover(seed) : seedPosterBoldCover(seed);
    setDoc(seeded);
    setActivePageId(seeded.pages[0].id);
    setSelectedElementId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateKey]);

  // When the dialog closes, wipe local state so re-opening starts
  // fresh. Once persistence lands (Phase 2), replace this with a load
  // from Supabase.
  useEffect(() => {
    if (open) return;
    setDoc(null);
    setActivePageId(null);
    setSelectedElementId(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-background">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold">
              Brochure editor
            </span>
            <span className="text-[11px] text-muted-foreground">
              {doc?.title ?? "Loading…"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden md:inline">
              Click to select · Drag handles to resize · Drag element to move
            </span>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main workspace */}
        {doc && activePageId ? (
          <div className="flex-1 min-h-0 flex">
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
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
            Loading template…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
