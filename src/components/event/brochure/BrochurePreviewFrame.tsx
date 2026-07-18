/**
 * BrochurePreviewFrame — live, debounced `<iframe>` preview of the brochure
 * PDF being configured in `BrochureConfiguratorDialog`.
 *
 * Mirrors `CreativePreviewCanvas.tsx`'s (and `PrintBadgesDialog.tsx`'s)
 * exact debounce pattern: a `useMemo`-wrapped async `refreshPreview`
 * function paired with a `useEffect` that debounces re-invoking it by
 * 400ms whenever `refreshPreview`'s deps change, clearing the pending
 * timer on the next change/unmount. Unlike those two precedents,
 * `refreshPreview` here calls `buildBrochurePreviewUrl` (the SAME function
 * that backs the final PDF export — see `brochure-pdf.ts`'s module header)
 * rather than drawing onto a canvas or writing HTML into an iframe
 * document, so the preview and the export can never diverge by
 * construction (Property 39 reinforced at the assembly layer).
 *
 * `buildBrochurePreviewUrl` returns a `blob:` object URL
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
import { buildBrochurePreviewUrl, type BrochureGenerationInput } from "@/lib/brochure/brochure-pdf";

interface BrochurePreviewFrameProps {
  /** The full resolved generation input (theme, color/font overrides,
   *  Section_Layout, and every fetched entity) assembled by the parent
   *  `BrochureConfiguratorDialog`. */
  input: BrochureGenerationInput;
}

export default function BrochurePreviewFrame({ input }: BrochurePreviewFrameProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const refreshPreview = useMemo(
    () => async () => {
      setPreviewLoading(true);
      try {
        const nextUrl = await buildBrochurePreviewUrl(input);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
      } catch (err) {
        logger.error("brochure preview generation failed", {
          error_message: err instanceof Error ? err.message : String(err),
        });
        toast.error("Couldn't generate the brochure preview");
      } finally {
        setPreviewLoading(false);
      }
    },
    // `input` bundles every selection that affects the preview (theme,
    // color/font overrides, Section_Layout, and every fetched entity) —
    // the parent `BrochureConfiguratorDialog` is responsible for keeping
    // this reference stable (e.g. via its own `useMemo`) across renders
    // that don't actually change any of those values, mirroring how
    // `CreativePreviewCanvas`'s deps array lists each individual selection
    // prop rather than a single compound object.
    [input],
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

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 w-full h-full text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-[12px]">Generating preview…</span>
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
