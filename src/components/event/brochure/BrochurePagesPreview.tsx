/**
 * BrochurePagesPreview — every page of the brochure, drawn as images.
 *
 * Each page goes through `renderPageToCanvas`, the renderer the PDF export
 * and the editor's thumbnails use, so this is the brochure itself at screen
 * size. It replaces a PDF embedded in an iframe, which showed one page at a
 * time behind the browser's own viewer chrome and not at all where the
 * browser has no built-in PDF viewer.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import type { BrochureDocument, BrochurePage } from "@/lib/brochure/editor/editor-document";
import { collectDocumentFontFamilies } from "@/lib/brochure/editor/editor-document";
import { ensureFontLoaded, onFontLoaded } from "@/lib/brochure/editor/editor-fonts";
import { renderPageToCanvas } from "@/lib/brochure/editor/editor-pdf";

/** Sharp enough to read body copy at the width the preview column gives a page. */
const PREVIEW_PAGE_DPI = 96;
/** Lets a burst of typing settle before the pages are redrawn. */
const REDRAW_DELAY_MS = 350;

function PageImage({ page, index, epoch }: { page: BrochurePage; index: number; epoch: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      renderPageToCanvas(page, PREVIEW_PAGE_DPI)
        .then((source) => {
          const canvas = canvasRef.current;
          if (cancelled || !canvas) return;
          canvas.width = source.width;
          canvas.height = source.height;
          canvas.getContext("2d")?.drawImage(source, 0, 0);
          setDrawn(true);
        })
        .catch(() => {
          // A page that fails to draw stays blank; the others still show.
        });
    }, REDRAW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, epoch]);

  return (
    <figure className="mx-auto w-full max-w-[520px]">
      <div className="relative overflow-hidden rounded-sm bg-white shadow-md" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
        <canvas ref={canvasRef} className="block h-full w-full" />
        {!drawn && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      <figcaption className="mt-1.5 text-center text-[11px] text-muted-foreground">Page {index + 1}</figcaption>
    </figure>
  );
}

export default function BrochurePagesPreview({ document }: { document: BrochureDocument | null }) {
  // Bumped whenever a web font finishes loading, so pages first drawn in a
  // fallback face are redrawn in the real one.
  const [epoch, setEpoch] = useState(0);
  useEffect(() => onFontLoaded(() => setEpoch((n) => n + 1)), []);
  useEffect(() => {
    if (!document) return;
    for (const family of collectDocumentFontFamilies(document)) void ensureFontLoaded(family);
  }, [document]);

  if (!document) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Building the brochure…
      </div>
    );
  }
  return (
    <div className="h-full w-full space-y-5 overflow-y-auto px-2 py-1">
      {document.pages.map((page, index) => (
        <PageImage key={page.id} page={page} index={index} epoch={epoch} />
      ))}
    </div>
  );
}
