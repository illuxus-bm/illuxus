/**
 * BrochureEditorPages — bottom bar with page thumbnails + add-page /
 * duplicate-page / delete-page controls. Clicking a thumbnail switches
 * the active page; buttons at the end add / duplicate / remove pages.
 *
 * Each thumbnail is the page itself, drawn by the same renderer as the
 * export at a very low resolution. A page object is replaced only when
 * that page changes, so editing one page re-renders one thumbnail, and
 * the render waits for a pause in editing — which is what makes a real
 * picture affordable here.
 */
import { useEffect, useState } from "react";
import { Plus, Copy, Trash2, ChevronLeft, ChevronRight, LayoutTemplate } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { BrochureDocument, BrochurePage } from "./editor-document";
import { onFontLoaded } from "./editor-fonts";
import { renderPageToCanvas } from "./editor-pdf";

/** A ready-made page the organizer can add, e.g. "Agenda" or "Pricing". */
export interface TemplatePageOption {
  id: string;
  label: string;
}

interface Props {
  document: BrochureDocument;
  activePageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onMovePage: (id: string, direction: "earlier" | "later") => void;
  /** Template pages offered in the "add page" menu. */
  templatePages?: TemplatePageOption[];
  onAddTemplatePage?: (id: string) => void;
}

export default function BrochureEditorPages({
  document: doc,
  activePageId,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
  templatePages = [],
  onAddTemplatePage,
}: Props) {
  const activeIndex = doc.pages.findIndex((p) => p.id === activePageId);
  return (
    <div className="h-28 border-t border-border bg-background flex items-center gap-2 px-3 overflow-x-auto shrink-0">
      {doc.pages.map((page, idx) => (
        <PageThumbnail
          key={page.id}
          page={page}
          index={idx}
          isActive={page.id === activePageId}
          onSelect={() => onSelectPage(page.id)}
        />
      ))}

      {/* Reordering. Without this a multi-page brochure could not be
          resequenced at all. */}
      <div className="flex flex-col gap-1 pl-2 border-l border-border h-full py-2 shrink-0 justify-center">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onMovePage(activePageId, "earlier")}
          title="Move current page earlier"
          aria-label="Move current page earlier"
          disabled={activeIndex <= 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onMovePage(activePageId, "later")}
          title="Move current page later"
          aria-label="Move current page later"
          disabled={activeIndex === -1 || activeIndex >= doc.pages.length - 1}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-col gap-1 pl-2 border-l border-border h-full py-2 shrink-0 justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Add page" aria-label="Add page">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-[200px]">
            <DropdownMenuItem onClick={onAddPage}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              Blank page
            </DropdownMenuItem>
            {templatePages.length > 0 && onAddTemplatePage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  From the template
                </DropdownMenuLabel>
                {templatePages.map((option) => (
                  <DropdownMenuItem key={option.id} onClick={() => onAddTemplatePage(option.id)}>
                    <LayoutTemplate className="h-3.5 w-3.5 mr-2" />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onDuplicatePage(activePageId)}
          title="Duplicate current page"
          aria-label="Duplicate current page"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => onDeletePage(activePageId)}
          title="Delete current page"
          aria-label="Delete current page"
          disabled={doc.pages.length <= 1}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Resolution of a thumbnail render. An A4 page is ~150 × 210 px at this. */
const THUMBNAIL_DPI = 18;
/** How long a page must go unchanged before its thumbnail is redrawn. */
const THUMBNAIL_DELAY_MS = 350;

/**
 * Low-resolution picture of `page`, or `null` until the first render lands.
 *
 * Keyed on the page OBJECT: the document is immutable, so an edit replaces
 * only the page it touched, and only that thumbnail's effect re-runs. The
 * previous picture stays up until the new one is ready, so thumbnails don't
 * flicker while typing.
 */
function usePageThumbnail(page: BrochurePage): string | null {
  const [src, setSrc] = useState<string | null>(null);
  // Redraw once fonts arrive — the first render usually beats them, and would
  // otherwise leave every thumbnail set in the fallback font.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => onFontLoaded(() => setFontEpoch((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      renderPageToCanvas(page, THUMBNAIL_DPI)
        .then((canvas) => {
          if (!cancelled) setSrc(canvas.toDataURL("image/png"));
        })
        .catch(() => {
          // A thumbnail is a convenience; a page that won't render (a
          // cross-origin image tainting the canvas) keeps its placeholder.
        });
    }, THUMBNAIL_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, fontEpoch]);

  return src;
}

function PageThumbnail({
  page,
  index,
  isActive,
  onSelect,
}: {
  page: BrochurePage;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const src = usePageThumbnail(page);
  const placeholder =
    page.background.type === "solid"
      ? page.background.color
      : page.background.type === "gradient"
        ? page.background.top
        : "#f3f4f6";
  // Thumbnails share a height and take their width from the page's own
  // proportions, so a landscape page looks landscape.
  const height = 76;
  const width = Math.max(28, Math.round((height * page.width) / page.height));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Page ${index + 1}`}
      aria-current={isActive ? "page" : undefined}
      className={`flex-shrink-0 rounded border p-1 transition-colors flex flex-col items-center gap-0.5 text-[9px] ${
        isActive ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div
        className="rounded-sm shadow-sm border border-black/10 overflow-hidden"
        style={{ width, height, backgroundColor: placeholder }}
      >
        {src && <img src={src} alt="" width={width} height={height} className="block w-full h-full" draggable={false} />}
      </div>
      <span className="text-muted-foreground tabular-nums">{index + 1}</span>
    </button>
  );
}
