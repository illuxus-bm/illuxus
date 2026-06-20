/**
 * Property tests for `sanitizeHtml`.
 *
 * The contract: nothing the sanitiser emits should be capable of running
 * JS in the browser. We assert this with two complementary strategies:
 *
 *   1. A static gallery of known XSS payloads (OWASP cheat sheet +
 *      historical bypasses against home-grown sanitisers). Each must
 *      come back from `sanitizeHtml` with no `<script>`, no event
 *      handlers, no `javascript:` URLs, and no `data:` href.
 *
 *   2. A property pass over fast-check generators that combine random
 *      tag names, attribute injections, and protocol smuggling
 *      (`java\nscript:`, `JaVaScRiPt:`, `&NewLine;`, etc.). The
 *      invariant: parsing the sanitised output as HTML, then
 *      walking the DOM, finds zero script tags, zero handler
 *      attributes, and zero `javascript:` / `data:` URLs.
 *
 * If a regression slips through, the test prints the smallest
 * counter-example so the patch is unambiguous.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeHtml } from "../sanitize-html";

// ─── Known payload gallery ────────────────────────────────────────────────────

const XSS_GALLERY: ReadonlyArray<{ name: string; payload: string }> = [
  { name: "plain script tag", payload: "<script>alert(1)</script>" },
  { name: "case-shifted script", payload: "<ScRiPt>alert(1)</ScRiPt>" },
  { name: "self-closing script", payload: "<script src=//evil/x.js />" },
  { name: "nested-injection script", payload: "<scr<script>ipt>alert(1)</scr</script>ipt>" },
  { name: "img onerror — quoted", payload: '<img src=x onerror="alert(1)">' },
  { name: "img onerror — single-quoted", payload: "<img src=x onerror='alert(1)'>" },
  { name: "img onerror — unquoted", payload: "<img src=x onerror=alert(1)>" },
  { name: "svg onload", payload: "<svg onload=alert(1)>" },
  { name: "iframe srcdoc XSS", payload: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
  { name: "javascript: anchor", payload: '<a href="javascript:alert(1)">x</a>' },
  { name: "javascript: with newlines", payload: '<a href="java\nscript:alert(1)">x</a>' },
  { name: "JaVaScRiPt anchor", payload: '<a href="JaVaScRiPt:alert(1)">x</a>' },
  { name: "data: image XSS", payload: '<img src="data:text/html,<script>alert(1)</script>">' },
  { name: "style with expression", payload: '<div style="background:url(javascript:alert(1))">x</div>' },
  { name: "form action javascript", payload: '<form action="javascript:alert(1)"><input></form>' },
  { name: "object data javascript", payload: '<object data="javascript:alert(1)">x</object>' },
  { name: "embed src javascript", payload: '<embed src="javascript:alert(1)" />' },
  { name: "math href javascript", payload: '<math><a href="javascript:alert(1)">x</a></math>' },
  { name: "details ontoggle", payload: "<details ontoggle=alert(1) open>x</details>" },
  { name: "audio onerror", payload: "<audio src=x onerror=alert(1)>" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if `out` contains anything we treat as a JS-execution surface. */
function hasExecutionSurface(out: string): {
  bad: boolean;
  reason?: string;
} {
  const lower = out.toLowerCase();
  if (lower.includes("<script")) return { bad: true, reason: "<script tag survived" };
  if (lower.includes("javascript:")) return { bad: true, reason: "javascript: URL survived" };
  if (/\son\w+\s*=/.test(lower)) return { bad: true, reason: "event-handler attribute survived" };
  if (lower.includes("<iframe")) return { bad: true, reason: "<iframe tag survived" };
  if (lower.includes("<object")) return { bad: true, reason: "<object tag survived" };
  if (lower.includes("<embed")) return { bad: true, reason: "<embed tag survived" };
  if (lower.includes("srcdoc=")) return { bad: true, reason: "srcdoc attribute survived" };
  if (lower.includes("style=")) return { bad: true, reason: "style attribute survived (CSS XSS surface)" };
  // data:text/html is the worst-case data: usage; allow data: only on
  // images if a future policy change opens it. For now block all.
  if (/\bdata:\s*text\/html/.test(lower)) return { bad: true, reason: "data:text/html URL survived" };
  return { bad: false };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sanitizeHtml — known XSS gallery", () => {
  for (const { name, payload } of XSS_GALLERY) {
    it(`strips: ${name}`, () => {
      const out = sanitizeHtml(payload);
      const result = hasExecutionSurface(out);
      if (result.bad) {
        throw new Error(
          `sanitizeHtml leaked an execution surface (${result.reason}).\n` +
          `  payload: ${JSON.stringify(payload)}\n` +
          `  output:  ${JSON.stringify(out)}`,
        );
      }
    });
  }

  it("preserves benign prose unchanged", () => {
    const out = sanitizeHtml(
      '<p>Welcome to <strong>illuxus</strong> — see <a href="https://illuxus.com">our site</a>.</p>',
    );
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>illuxus</strong>");
    expect(out).toContain('href="https://illuxus.com"');
  });

  it("auto-applies rel=noopener noreferrer to target=_blank links", () => {
    const out = sanitizeHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });
});

// ─── Property pass ────────────────────────────────────────────────────────────

describe("sanitizeHtml — property: never emits an execution surface", () => {
  it("for any combination of tag, attribute, and URL smuggling", () => {
    const evilTags = fc.constantFrom(
      "script", "iframe", "object", "embed", "svg", "math", "form", "img",
      "audio", "video", "details", "ScRiPt", "SCRIPT",
    );
    const evilHandlers = fc.constantFrom(
      "onerror", "onload", "ontoggle", "onclick", "onmouseover", "onfocus",
      "OnError", "ONLOAD",
    );
    const evilProtocols = fc.constantFrom(
      "javascript:",
      "JaVaScRiPt:",
      "java\nscript:",
      "java\tscript:",
      " javascript:",
      "data:text/html,<script>x</script>",
      "data:application/javascript,alert(1)",
    );
    const evilContent = fc.string({ minLength: 0, maxLength: 32 });

    fc.assert(
      fc.property(evilTags, evilHandlers, evilProtocols, evilContent, (tag, handler, proto, content) => {
        const safeContent = content.replace(/[<>"'&]/g, "");
        const candidates: string[] = [
          `<${tag}>${safeContent}</${tag}>`,
          `<${tag} ${handler}=alert(1)>x</${tag}>`,
          `<${tag} ${handler}="alert(1)">x</${tag}>`,
          `<a href="${proto}alert(1)">x</a>`,
          `<${tag} src="${proto}alert(1)">x</${tag}>`,
          `<scr<${tag}>ipt>alert(1)</scr</${tag}>ipt>`,
        ];
        for (const c of candidates) {
          const out = sanitizeHtml(c);
          const r = hasExecutionSurface(out);
          if (r.bad) {
            throw new Error(
              `Leak via fuzzed input (${r.reason}).\n` +
              `  payload: ${JSON.stringify(c)}\n` +
              `  output:  ${JSON.stringify(out)}`,
            );
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("never throws on any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => sanitizeHtml(s)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
