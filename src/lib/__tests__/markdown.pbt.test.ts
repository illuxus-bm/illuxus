import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  renderMarkdown,
  renderRichText,
  stripMarkdown,
  stripRichText,
} from "../markdown";

/**
 * Property tests for the rich-text helpers added alongside the WYSIWYG
 * editor swap. The legacy `renderMarkdown` / `stripMarkdown` functions
 * still need to behave; the new `renderRichText` / `stripRichText` add an
 * HTML-aware branch on top.
 *
 * These properties keep us honest about the two correctness pillars:
 *   1. Safety  — output never contains `<script>` / `<iframe>` / event
 *      handler attributes, regardless of input.
 *   2. Routing — input lacking HTML tags routes to the markdown branch;
 *      input with prose tags routes to the sanitise-only branch.
 */

describe("renderRichText / stripRichText", () => {
  it("never produces script or iframe tags from any string", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const html = renderRichText(s);
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toMatch(/<iframe/i);
        expect(html).not.toMatch(/\son\w+=/i); // event handler attrs
      }),
      { numRuns: 100 },
    );
  });

  it("stripRichText output never contains angle brackets from any HTML input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        // Wrap in HTML so the looksLikeHtml gate fires for every case.
        const html = `<p>${s}</p>`;
        const stripped = stripRichText(html);
        // After stripping + entity decoding the literal `<` / `>` are
        // allowed (they're text content), but no tag-shaped pattern
        // should survive.
        expect(stripped).not.toMatch(/<\s*\w+/);
        expect(stripped).not.toMatch(/<\s*\//);
      }),
      { numRuns: 100 },
    );
  });

  it("routes plain markdown through the markdown renderer", () => {
    expect(renderRichText("**hello**")).toBe(renderMarkdown("**hello**"));
    expect(renderRichText("*world*")).toBe(renderMarkdown("*world*"));
    expect(renderRichText("# Heading")).toBe(renderMarkdown("# Heading"));
  });

  it("preserves bold and italic round-trips from the WYSIWYG editor", () => {
    // The editor emits sanitised HTML; renderRichText should pass it
    // through without escaping the tags.
    const editorHtml = "<p><strong>bold</strong> and <em>italic</em></p>";
    const rendered = renderRichText(editorHtml);
    expect(rendered).toContain("<strong>bold</strong>");
    expect(rendered).toContain("<em>italic</em>");
  });

  it("stripRichText decodes entities the WYSIWYG editor emits", () => {
    // The browser's contentEditable normalises `&` typed in the editor
    // into the `&amp;` entity wrapped in a paragraph. stripRichText must
    // decode it on the way back out for OG descriptions.
    const editorHtml = "<p>Fish &amp; chips</p>";
    expect(stripRichText(editorHtml)).toBe("Fish & chips");
  });

  it("stripRichText collapses adjacent paragraphs to a single space", () => {
    const html = "<p>Line one</p><p>Line two</p>";
    expect(stripRichText(html)).toBe("Line one Line two");
  });

  it("legacy stripMarkdown still works on plain markdown", () => {
    expect(stripMarkdown("**hi**")).toBe("hi");
    expect(stripMarkdown("# Title\n\nBody")).toBe("Title Body");
  });

  it("returns empty string for empty / nullish input", () => {
    expect(renderRichText("")).toBe("");
    expect(stripRichText("")).toBe("");
  });
});
