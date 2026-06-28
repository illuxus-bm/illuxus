/**
 * Lightweight Markdown renderer + stripper for the unified About/description field.
 *
 * Why not pull in marked / micromark
 * ----------------------------------
 * The Event editor's About field only ever needs the toolbar's vocabulary:
 * bold, italic, headings (#/##/###), bullet/numbered lists, links, blockquote,
 * paragraphs, and line breaks. That's a small enough surface that a ~70-line
 * regex pass keeps bundle size flat and keeps the markdown round-trippable
 * with the editor's toolbar.
 *
 * Safety
 * ------
 * - We HTML-escape every character before doing any markdown transformation,
 *   so an organiser typing `<script>alert(1)</script>` ends up as the literal
 *   text — no parsed tag survives.
 * - Link `href` attributes are filtered to http(s)/mailto/tel/anchor refs
 *   only; everything else (javascript:, data:, etc.) is collapsed to "#".
 * - The output is also passed through DOMPurify so any future regex slip-up
 *   can't expose XSS surface. The two layers compose: even if one fails
 *   open, the other catches it.
 *
 * The companion `stripMarkdown` produces a plain-text preview for og:description
 * and event listing snippets without dragging the full renderer along.
 */

import { sanitizeHtml } from "./sanitize-html";

/** Escape HTML special chars so user input can't inject tags. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Restrict link hrefs to safe protocols. Returns "#" for anything else. */
function safeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  // Allow anchor-only refs.
  if (trimmed.startsWith("#")) return trimmed;
  // Allow protocol-relative + relative paths.
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed;
  // Match common safe protocols. Reject `javascript:`, `data:`, etc.
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return "#";
}

/**
 * Render a small subset of Markdown to HTML. The output is sanitised before
 * being returned so callers can drop it straight into
 * `dangerouslySetInnerHTML` without additional cleanup.
 *
 * Supported:
 *   - Headings:        `# H1`, `## H2`, `### H3`
 *   - Blockquote:      `> quoted line`
 *   - Bold:            `**bold**`
 *   - Italic:          `*italic*`
 *   - Bullet list:     `- item`
 *   - Numbered list:   `1. item`
 *   - Links:           `[text](https://…)`
 *   - Paragraphs separated by blank lines, hard breaks via single newline.
 */
export function renderMarkdown(md: string): string {
  if (!md) return "";

  // 1. Escape HTML first so user input can't inject tags downstream.
  let html = escapeHtml(md);

  // 2. Block-level transforms that anchor at start-of-line.
  html = html
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // 3. Inline transforms — bold first so `**` doesn't get eaten by italic.
  html = html
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    // Links — sanitize the href via safeHref().
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      (_m, label, url) =>
        `<a href="${escapeHtml(safeHref(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );

  // 4. Lists — scan line by line, collapse consecutive items into <ul>/<ol>.
  const lines = html.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  for (const line of lines) {
    const ulMatch = /^- (.+)$/.exec(line);
    const olMatch = /^\d+\. (.+)$/.exec(line);
    if (ulMatch) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${olMatch[1]}</li>`);
    } else {
      closeLists();
      out.push(line);
    }
  }
  closeLists();
  html = out.join("\n");

  // 5. Paragraphs — split on blank lines, wrap non-block content in <p>.
  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Already a block-level construct? Keep as-is.
      if (/^<(h[1-3]|ul|ol|blockquote)/i.test(trimmed)) return trimmed;
      // Inside a paragraph, single newlines become <br/>.
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  // 6. Defense-in-depth: pass through the same DOMPurify policy that guards
  // Custom HTML blocks. Stripping anything not in the allow-list also
  // means a future renderer bug can't accidentally introduce script tags.
  return sanitizeHtml(html);
}

/**
 * Strip Markdown syntax to plain text. Used for og:description, event
 * listing snippets, and any preview surface that can't render HTML.
 *
 * The output collapses whitespace and is safe to truncate with `slice(0, n)`.
 */
export function stripMarkdown(md: string): string {
  if (!md) return "";
  return md
    // Drop leading heading + blockquote markers.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    // Bold + italic.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Links → just the label.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // List markers.
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    // Inline code / code fences.
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect whether `input` already contains HTML block-level markup. This is
 * the discriminator that lets `renderRichText`/`stripRichText` accept either
 * the legacy Markdown format (everything saved before the WYSIWYG ship) or
 * the new WYSIWYG HTML format. We look for any of the prose tags the
 * sanitizer allows; if none of them appear the content is treated as
 * Markdown so historical event descriptions keep rendering correctly.
 */
function looksLikeHtml(input: string): boolean {
  return /<\s*(p|div|span|h[1-6]|ul|ol|li|blockquote|strong|em|b|i|u|s|a|br|hr|table)\b/i.test(input);
}

/**
 * Render organiser-supplied content to safe HTML. Accepts either the
 * legacy Markdown format or the new WYSIWYG HTML format and dispatches to
 * the right pipeline; output is always sanitised before being returned.
 */
export function renderRichText(input: string): string {
  if (!input) return "";
  if (looksLikeHtml(input)) return sanitizeHtml(input);
  return renderMarkdown(input);
}

/**
 * Strip rich-text markup (HTML or Markdown) to plain text. Used by
 * og:description, listing snippets, and the OG image card — surfaces that
 * can't render HTML and need a flat string safe to truncate.
 *
 * The HTML branch is intentionally regex-based (no `document` calls) so it
 * stays usable from Edge runtimes that don't have a DOM. Numeric character
 * references and the named entities the renderer emits are decoded back to
 * their literal characters.
 */
export function stripRichText(input: string): string {
  if (!input) return "";
  if (!looksLikeHtml(input)) return stripMarkdown(input);
  return input
    // Block-closing tags become spaces so adjacent paragraphs don't collide.
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|td|th)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    // Drop every remaining tag. The `>?` makes the closing optional so
    // malformed fragments like `</a` (no terminating `>`) get stripped
    // too — without this guard a sanitiser bypass could leak markup
    // through stripRichText into og:description.
    .replace(/<[^>]*>?/g, "")
    // Decode the entities our renderer / sanitizer emit.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}
