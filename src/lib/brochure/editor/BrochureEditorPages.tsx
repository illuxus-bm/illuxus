/**
 * BrochureEditorPages — bottom bar with page thumbnails + add-page /
 * duplicate-page / delete-page controls. Clicking a thumbnail switches
 * the active page; buttons at the end append / duplicate / remove
 * pages.
 *
 * Thumbnails are cheap SVG placeholders keyed on page id + a running
 * "text preview" pulled from the first text element on the page. A
 * real image thumbnail render would require running the full Konva
 * export pipeline per page, which is too expensive to run on every
 * document mutation; the SVG placeholder is precise enough for
 * navigation.
 */
import { Plus, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { BrochureDocument, BrochurePage } from "./editor-document";

interface Props {
  document: BrochureDocument;
  activePageId: string;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
}

export default function BrochureEditorPages({
  document: doc,
  activePageId,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
}: Props) {
  return (
    <div className="h-24 border-t border-border bg-background flex items-center gap-2 px-3 overflow-x-auto shrink-0">
      {doc.pages.map((page, idx) => (
        <PageThumbnail
          key={page.id}
          page={page}
          index={idx}
          isActive={page.id === activePageId}
          onSelect={() => onSelectPage(page.id)}
        />
      ))}
      <div className="flex flex-col gap-1 pl-2 border-l border-border h-full py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onAddPage}
          title="Add page"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onDuplicatePage(activePageId)}
          title="Duplicate current page"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => onDeletePage(activePageId)}
          title="Delete current page"
          disabled={doc.pages.length <= 1}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
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
  // Very rough "preview": show first text element content truncated,
  // plus a color swatch derived from the background type.
  const firstText = page.elements.find((el) => el.kind === "text");
  const previewText =
    firstText && firstText.kind === "text" ? firstText.content.slice(0, 24) : "";
  const bg =
    page.background.type === "solid"
      ? page.background.color
      : page.background.type === "gradient"
        ? page.background.top
        : "#f3f4f6";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-shrink-0 h-full w-14 rounded border transition-colors flex flex-col items-center justify-between py-1 text-[9px] ${
        isActive
          ? "border-primary ring-1 ring-primary bg-primary/5"
          : "border-border hover:bg-muted/40"
      }`}
      style={{ borderColor: isActive ? undefined : "hsl(var(--border))" }}
    >
      <span className="text-muted-foreground">{index + 1}</span>
      <div
        className="w-9 h-11 rounded-sm shadow-sm border border-black/10"
        style={{ backgroundColor: bg }}
      />
      <span className="text-muted-foreground truncate w-full text-center px-1">
        {previewText || "Page"}
      </span>
    </button>
  );
}
