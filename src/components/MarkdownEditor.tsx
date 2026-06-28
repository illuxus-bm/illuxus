import { useCallback, useRef, useState } from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, Quote, Eye, Pencil,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Lightweight Markdown editor — textarea + toolbar + preview toggle.
 *
 * Designed for the event page editor's About field. The editor stores the
 * raw Markdown source string; the preview tab renders it through
 * `renderMarkdown` (safe HTML) wrapped in Tailwind Typography classes.
 *
 * Toolbar buttons insert formatting at the current cursor position so the
 * organiser doesn't need to remember Markdown syntax to format text.
 */

interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Used for the autosave hint under the toolbar — optional. */
  hint?: string;
  /** Label shown above the editor; useful when no `<Label>` is rendered. */
  label?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 10,
  hint,
  label,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  /**
   * Wrap the current selection (or insert at the caret) with the given
   * prefix/suffix. Re-focuses the textarea and keeps the cursor where the
   * user expects after the edit.
   */
  const wrap = useCallback(
    (prefix: string, suffix: string = "", placeholder = "") => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const before = value.slice(0, start);
      const selected = value.slice(start, end) || placeholder;
      const after = value.slice(end);
      const next = `${before}${prefix}${selected}${suffix}${after}`;
      onChange(next);
      // Restore cursor position after React applies the new value.
      requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        const cursor = start + prefix.length + selected.length;
        node.setSelectionRange(cursor, cursor);
      });
    },
    [value, onChange],
  );

  /**
   * Prefix the line at the caret (or each line in the selection) with a
   * leading token like `## ` or `- ` for block formatting.
   */
  const prefixLines = useCallback(
    (token: string) => {
      const el = ref.current;
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      // Expand selection to whole lines.
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf("\n") + 1;
      const after = value.slice(end);
      const lineEndOffset = after.indexOf("\n");
      const lineEnd = lineEndOffset === -1 ? value.length : end + lineEndOffset;
      const block = value.slice(lineStart, lineEnd);
      const updated = block
        .split("\n")
        .map((line) => (line.trim() ? `${token}${line}` : line))
        .join("\n");
      const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
      onChange(next);
      requestAnimationFrame(() => ref.current?.focus());
    },
    [value, onChange],
  );

  const insertLink = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const url = window.prompt("Enter link URL", "https://");
    if (!url) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end) || "link text";
    const next = `${value.slice(0, start)}[${selected}](${url})${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => ref.current?.focus());
  }, [value, onChange]);

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium">{label}</span>
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </div>
      )}
      <div className="rounded-md border border-input bg-background">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted/30 flex-wrap">
          <ToolbarButton title="Bold (Ctrl+B)" onClick={() => wrap("**", "**", "bold")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Italic (Ctrl+I)" onClick={() => wrap("*", "*", "italic")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Heading 1" onClick={() => prefixLines("# ")}>
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 2" onClick={() => prefixLines("## ")}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" onClick={() => prefixLines("### ")}>
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Bullet list" onClick={() => prefixLines("- ")}>
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Numbered list" onClick={() => prefixLines("1. ")}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Link" onClick={insertLink}>
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Quote" onClick={() => prefixLines("> ")}>
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="ml-auto inline-flex rounded-md border border-border p-0.5 bg-background">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`px-2 h-6 text-[11px] rounded inline-flex items-center gap-1 ${
                mode === "edit" ? "bg-secondary font-medium" : "text-muted-foreground"
              }`}
              aria-pressed={mode === "edit"}
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`px-2 h-6 text-[11px] rounded inline-flex items-center gap-1 ${
                mode === "preview" ? "bg-secondary font-medium" : "text-muted-foreground"
              }`}
              aria-pressed={mode === "preview"}
            >
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>
        </div>

        {/* Body */}
        {mode === "edit" ? (
          <Textarea
            ref={ref}
            value={value}
            placeholder={placeholder ?? "Write a few paragraphs about your event. Markdown supported — try **bold**, *italic*, or # heading."}
            rows={rows}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                wrap("**", "**", "bold");
              } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
                e.preventDefault();
                wrap("*", "*", "italic");
              }
            }}
            className="text-[13px] font-mono border-0 focus-visible:ring-0 rounded-none rounded-b-md min-h-[180px]"
          />
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none px-3 py-3 min-h-[180px] text-[13px]"
            // renderMarkdown sanitises via DOMPurify before returning.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || `<p class="text-muted-foreground italic">Nothing to preview yet.</p>` }}
          />
        )}
      </div>
      {hint && !label && (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ToolbarButton({
  title, onClick, children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-6 w-6"
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />;
}
