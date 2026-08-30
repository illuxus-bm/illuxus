/**
 * BrochurePreviewFrame — live, debounced `<iframe>` preview of the brochure
 * PDF being configured in `BrochureConfiguratorDialog`.
 *
 * Mirrors `CreativePreviewCanvas.tsx`'s (and `PrintBadgesDialog.tsx`'s)
 * exact debounce pattern: a `useMemo`-wrapped async `refreshPreview`
 * function paired with a `useEffect` that debounces re-invoking it by
 * 400ms whenever `refreshPreview`'s deps change, clearing the pending
 * timer on the next change/unmount. Unlike those two precedents,
 * `refreshPreview` here calls `buildDocumentPreviewUrl` — the same renderer
 * that backs the editor canvas and the final PDF export, just at
 * `PREVIEW_DPI` instead of `EXPORT_DPI` — rather than drawing onto a canvas
 * or writing HTML into an iframe document. Preview, canvas and export
 * therefore cannot diverge: they are one code path at three resolutions.
 *
 * This used to call `buildBrochurePreviewUrl` from `brochure-pdf.ts`, a
 * SECOND, theme-driven renderer that never read the editor document at all.
 * That is what made an organizer's saved edits invisible in both the preview
 * and the download; see `resolve-document.ts` for the full history.
 *
 * `buildDocumentPreviewUrl` returns a `blob:` object URL
 * (`doc.output("bloburl")`). The PREVIOUS url must be revoked via
 * `URL.revokeObjectURL` before a new one replaces it — and on unmount — to
 * avoid leaking blob URLs on every settings change; tracked in a `useRef`
 * since it's an imperative side effect, not render state.
 *
 * Fallback: `navigator.pdfViewerEnabled === false` means the current
 * browser/webview has no built-in inline PDF viewer (notably some mobile
 * in-app browsers), so an `<iframe src="blob:...">` would render blank. In
 * that case an "Open in new tab" button (`window.open(blobUrl, "_blank")`)
 * is rendered instead of the iframe — a documented, deliberate scope
 * decision (see design.md's Components section) rather than building a
 * second, canvas-based preview renderer that would need to be kept
 * pixel-for-pixel consistent with the real jsPDF output.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";
import { buildDocumentPreviewUrl } from "@/lib/brochure/editor/editor-pdf";
import type { BrochureDocument } from "@/lib/brochure/editor/editor-document";

interface BrochurePreviewFrameProps {
  /**
   * The resolved Brochure_Document to preview — the organizer's saved
   * WYSIWYG document when one exists, otherwise a fresh template seed. See
   * `resolveBrochureDocument`.
   *
   * This replaced a `BrochureGenerationInput` prop that was rendered by the
   * theme-driven jsPDF pipeline. That pipeline shares no code with the
   * editor's Konva renderer, so the preview and the editor canvas were two
   * different pictures of nominally the same brochure and drifted apart
   * every time either side changed. Previewing the document through the
   * SAME renderer the export uses removes the divergence structurally.
   *
   * `null` while the event data is still loading.
   */
  document: BrochureDocument | null;
}

export default function BrochurePreviewFrame({ document: brochureDocument }: BrochurePreviewFrameProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  /**
   * Terminal render failure.
   *
   * Without this the pane fell back to its "Generating preview…" spinner on any
   * failure — so a render error looked identical to a slow render, forever. The
   * `toast` alone isn't enough: it disappears after a few seconds and leaves the
   * organizer watching a spinner that will never resolve.
   */
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const refreshPreview = useMemo(
    () => async () => {
      if (!brochureDocument) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        // Rendered at PREVIEW_DPI (the default) rather than the 300 DPI
        // export resolution — same layout, ~7x cheaper to rasterise, which
        // is what keeps a 400ms-debounced live preview usable.
        const nextUrl = await buildDocumentPreviewUrl(brochureDocument);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("brochure preview generation failed", { error_message: message });
        setPreviewError(message);
        toast.error("Couldn't generate the brochure preview");
      } finally {
        setPreviewLoading(false);
      }
    },
    // The parent keeps this reference stable via `useMemo`, so the debounce
    // below only re-fires when the document actually changes.
    [brochureDocument],
  );

  // Refresh preview when key settings change (debounced 400ms) — mirrors
  // CreativePreviewCanvas.tsx's / PrintBadgesDialog.tsx's refreshPreview
  // debounce exactly.
  useEffect(() => {
    const t = setTimeout(() => { void refreshPreview(); }, 400);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  // Revoke whatever blob URL is currently held on unmount.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // `Navigator.pdfViewerEnabled` (Chrome/Firefox/Edge) reports whether the
  // browser has a built-in inline PDF viewer; `false` means an
  // `<iframe src="blob:...">` would render blank.
  const pdfViewerUnavailable = typeof navigator !== "undefined" && navigator.pdfViewerEnabled === false;

  // A failed render with nothing previously rendered is terminal until the
  // organizer retries, so say so instead of spinning.
  if (previewError && !previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 w-full h-full text-center px-6">
        <p className="text-[13px] text-muted-foreground">Couldn&apos;t render the preview</p>
        <p className="text-[11px] text-muted-foreground/80 max-w-[280px] break-words">
          {previewError}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refreshPreview()}
          disabled={previewLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${previewLoading ? "animate-spin" : ""}`} />
          Try again
        </Button>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 w-full h-full text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        {/* Distinguish "no document yet" from "rendering one": the first is
            waiting on the event query, the second on the rasteriser. */}
        <span className="text-[12px]">
          {brochureDocument ? "Generating preview…" : "Loading event data…"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {pdfViewerUnavailable ? (
        <div className="flex flex-col items-center justify-center gap-3 w-full h-full text-center px-6">
          <p className="text-[13px] text-muted-foreground">
            Live preview isn't available on this browser
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => window.open(previewUrl, "_blank")}>
            Open in new tab
          </Button>
        </div>
      ) : (
        <iframe src={previewUrl} className="w-full h-full border border-border rounded" title="Brochure preview" />
      )}
      {previewLoading && (
        <div className="absolute top-2 right-2">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        </div>
      )}
    </div>
  );
}
