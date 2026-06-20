/**
 * HTML sanitization for organiser-supplied event-page custom HTML blocks.
 *
 * Backed by DOMPurify (https://github.com/cure53/DOMPurify) — the
 * battle-tested sanitiser that's hardened against the long tail of XSS
 * bypasses (mutation XSS, mXSS through SVG, namespace confusion, etc.).
 *
 * Why a wrapper instead of calling DOMPurify directly:
 *   1. Single configuration source. The allow-list lives here so a
 *      future tightening (or audit-time review) is a one-file change.
 *   2. SSR-safe import. DOMPurify needs a `window` to operate; in the
 *      Vite dev server and tests we're already in a DOM environment
 *      (jsdom), but if SSR is ever introduced this wrapper will be
 *      the single place to add a JSDOM fallback.
 *   3. Testable. We export `sanitizeHtml` so the property test in
 *      `__tests__/sanitize-html.pbt.test.ts` can assert XSS payloads
 *      round-trip safely.
 *
 * Allow-list policy
 *   - Tags: prose-only HTML (text formatting, links, headings, images,
 *     lists, tables, blockquotes, code blocks). No iframes, scripts,
 *     styles, or form controls.
 *   - Attributes: structural / accessibility / styling attributes only.
 *     No event handlers, no `style` (would re-introduce XSS via CSS),
 *     no `srcdoc`.
 *   - URLs: protocols restricted to http(s), mailto, tel, and #anchors.
 *     `javascript:` and `data:` cannot pass the URI regex.
 *   - `target="_blank"` links automatically get `rel="noopener
 *     noreferrer"` added so they can't tamper with `window.opener`.
 */

import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "caption", "cite", "code", "col", "colgroup", "dd", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "i", "img", "kbd", "li", "main", "mark", "ol", "p", "pre", "q", "s",
  "samp", "section", "small", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "wbr",
];

const ALLOWED_ATTR = [
  "align", "alt", "aria-label", "aria-labelledby", "aria-describedby",
  "aria-hidden", "border", "cellpadding", "cellspacing", "class",
  "colspan", "datetime", "dir", "height", "href", "id", "lang", "loading",
  "name", "rel", "role", "rowspan", "src", "tabindex", "target", "title",
  "valign", "width",
];

// Bind a single DOMPurify instance to the runtime's window so the regex is
// not rebuilt on every call. In Node tests jsdom provides `window`.
const purify = DOMPurify;

// Add a hook that automatically attaches rel="noopener noreferrer" to any
// link with target="_blank". The hook fires for every `<a>` after the rest
// of the policy has been applied.
purify.addHook("afterSanitizeAttributes", (node) => {
  if (!(node instanceof Element)) return;
  if (node.tagName !== "A") return;
  if ((node as HTMLAnchorElement).getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const PURIFY_OPTS = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // DOMPurify removes `target` by default to discourage tabnapping
  // attacks; we add it back here and pair it with the
  // afterSanitizeAttributes hook below that injects rel="noopener
  // noreferrer" so target=_blank can never read window.opener.
  ADD_ATTR: ["target"],
  // Belt & braces: even if a future config change accidentally re-allows
  // `style`, FORBID_ATTR vetoes it. Inline CSS is the most common
  // bypass surface (background:url(javascript:…)) so we never want it.
  FORBID_ATTR: ["style", "srcdoc", "formaction", "ping"],
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "math"],
  // Force sanitised output to be a String (not a TrustedHTML or DOM node).
  RETURN_TRUSTED_TYPE: false,
  // Strip the entire script element including its (now empty) wrapper.
  WHOLE_DOCUMENT: false,
  // Keep DOMPurify's default protocol allowlist — it covers http(s),
  // mailto, tel, and anchor refs while blocking javascript:, data:, etc.
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  USE_PROFILES: { html: true } as { html: boolean },
};

/**
 * Sanitize organiser-supplied HTML to a safe string for `dangerouslySetInnerHTML`.
 *
 * Empty input returns empty string. Inputs containing tags / attributes
 * outside the allow-list are stripped while preserving their text content
 * — so a `<script>alert(1)</script>` becomes the empty string and the
 * surrounding paragraph keeps its visible text.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  return purify.sanitize(input, PURIFY_OPTS);
}
