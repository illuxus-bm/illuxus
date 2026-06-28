import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { renderRichText } from "@/lib/markdown";

/**
 * Unified rich-text editor for the event About field (and any future
 * organiser-facing prose surface).
 *
 * Why WYSIWYG instead of Markdown-source-with-Preview-tab
 * -------------------------------------------------------
 * The previous incarnation stored Markdown and rendered a Preview pane.
 * That implementation kept failing usability — organisers clicked `Bold`,
 * saw `**word**` in the textarea, and reported "bold doesn't work". So we
 * swapped the surface to a `contentEditable` div backed by the (deprecated
 * but still universally supported) `document.execCommand` formatting API.
 *
 * Storage stays backward-compatible: the component still accepts either
 * legacy Markdown OR HTML via the `value` prop. On mount we route the
 * string through `renderRichText`, which auto-detects HTML vs Markdown and
 * sets the editor's `innerHTML` accordingly. The component always emits
 * sanitised HTML, so older Markdown descriptions get upgraded the first
 * time an organiser edits them.
 *
 * Security
 * --------
 * Every change emitted upstream is run through DOMPurify (`sanitizeHtml`),
 * so even if a clever paste introduces unsafe markup the saved value
 * stays in the allow-list. Pasted HTML is also sanitised on entry so
 * weird fonts/colours from external sources never leak into the editor.
 */

interface MarkdownEditorProps {
  /** HTML or legacy Markdown. Legacy Markdown is auto-upgraded on first save. */
  value: string;
  /** Always called with sanitised HTML. */
  onChange: (v: string) => void;
  placeholder?: string;
  /** Min visual height in rows; mapped to a min-height in px. */
  rows?: number;
  /** Used for the autosave hint under the toolbar — optional. */
  hint?: string;
  /** Label shown above the editor; useful when no `<Label>` is rendered. */
  label?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write a few paragraphs about your event…",
  rows = 10,
  hint,
  label,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Track the HTML we just emitted so React re-renders triggered by our own
  // onChange don't reset the editor's innerHTML mid-typing (which would
  // collapse the caret to the start of the document).
  const lastEmittedRef = useRef<string>("");
  const [isEmpty, setIsEmpty] = useState(true);

  // Sync external `value` into the editor when it differs from what we
  // last emitted. The lastEmittedRef gate is what keeps the cursor from
  // jumping on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = renderRichText(value || "");
    if (html === lastEmittedRef.current) {
      // Our own emit() is bouncing back; ignore.
      return;
    }
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
    setIsEmpty(!el.textContent?.trim());
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeHtml(el.innerHTML);
    lastEmittedRef.current = html;
    setIsEmpty(!el.textContent?.trim());
    onChange(html);
  }, [onChange]);

  /**
   * Run a formatting command against the current selection. `execCommand`
   * is deprecated but remains the shortest path to a WYSIWYG that "just
   * applies" formatting to the selection — the modern Selection/Range
   * dance to wrap nodes correctly is far longer than this whole file.
   */
  const exec = useCallback(
    (cmd: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(cmd, false, arg);
      emit();
    },
    [emit],
  );

  const onBold = useCallback(() => exec("bold"), [exec]);
  const onItalic = useCallback(() => exec("italic"), [exec]);
  const onH1 = useCallback(() => exec("formatBlock", "H1"), [exec]);
  const onH2 = useCallback(() => exec("formatBlock", "H2"), [exec]);
  const onH3 = useCallback(() => exec("formatBlock", "H3"), [exec]);
  const onUl = useCallback(() => exec("insertUnorderedList"), [exec]);
  const onOl = useCallback(() => exec("insertOrderedList"), [exec]);
  const onQuote = useCallback(() => exec("formatBlock", "BLOCKQUOTE"), [exec]);

  const onLink = useCallback(() => {
    const url = window.prompt("Enter link URL", "https://");
    if (!url) return;
    exec("createLink", url);
  }, [exec]);

  /**
   * Strip styling from pasted content so the editor never inherits the
   * source page's fonts / colours / structural markup. We sanitise on
   * entry instead of trusting that the next save round-trip will catch
   * everything (it would, but pasted weirdness flickering on screen is
   * its own UX issue).
   */
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      if (html) {
        document.execCommand("insertHTML", false, sanitizeHtml(html));
      } else if (text) {
        const escaped = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        document.execCommand("insertHTML", false, escaped);
      }
      emit();
    },
    [emit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // execCommand picks up Ctrl/Cmd+B and Ctrl/Cmd+I natively in every
      // major browser, but emit() doesn't fire without an input event so
      // we still need to force a sync after the keypress.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "b" || k === "i") {
          // Defer to next tick so the browser's own handler runs first.
          requestAnimationFrame(emit);
        }
      }
    },
    [emit],
  );

  const minHeight = `${Math.max(rows * 22, 180)}px`;

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium">{label}</span>
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </div>
      )}
      <div className="rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
        {/* Toolbar — onMouseDown prevents focus from leaving the editor so
            the current selection survives the button click. Without this
            execCommand would have nothing to operate on. */}
        <div
          className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted/30 flex-wrap"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolbarButton title="Bold (Ctrl+B)" onClick={onBold}>
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Italic (Ctrl+I)" onClick={onItalic}>
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Heading 1" onClick={onH1}>
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 2" onClick={onH2}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" onClick={onH3}>
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Bullet list" onClick={onUl}>
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Numbered list" onClick={onOl}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton title="Link" onClick={onLink}>
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Quote" onClick={onQuote}>
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {/* Editable surface. The relative wrapper hosts the placeholder
            overlay; we drive the placeholder ourselves because
            `[contenteditable=""]:empty:before` is unreliable across
            browsers — Safari often leaves a stray `<br>` that defeats
            `:empty`. */}
        <div className="relative">
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={emit}
            onBlur={emit}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            role="textbox"
            aria-multiline="true"
            aria-label={label || "Rich text editor"}
            data-testid="markdown-editor-surface"
            className="prose prose-sm dark:prose-invert max-w-none px-3 py-3 text-[13px] focus:outline-none [&_p]:my-2 [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_ul]:my-2 [&_ol]:my-2 [&_blockquote]:my-2"
            style={{ minHeight }}
          />
          {isEmpty && (
            <div
              className="pointer-events-none absolute left-3 top-3 text-[13px] text-muted-foreground select-none"
              aria-hidden="true"
            >
              {placeholder}
            </div>
          )}
        </div>
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
