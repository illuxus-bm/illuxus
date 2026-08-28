/**
 * Regression tests for `safeInternalPath` — the open-redirect guard on the
 * post-login `?next=` destination.
 *
 * These pin a CONFIRMED, exploitable vulnerability. The previous validator in
 * `LoginPage.tsx` was a string-prefix check:
 *
 *     if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
 *
 * It rejected `https://evil.com` and `//evil.com` but passed `/\evil.com`,
 * because the value was then handed to `window.location.assign()`, where the
 * browser normalises a backslash into a forward slash before determining the
 * authority. Resolving `/\evil.com` against `https://illuxus.com` yields origin
 * `https://evil.com`.
 *
 * Exploit: `https://illuxus.com/login?next=/\evil.com` is a link on the real
 * domain that lands the victim on an attacker page *after* they authenticate —
 * a high-quality phishing primitive.
 *
 * The `bypasses` block below is the important one. If any assertion there
 * regresses, the open redirect is back.
 */

import { describe, it, expect } from "vitest";

import { safeInternalPath } from "../safe-redirect";

const ORIGIN = "https://illuxus.com";

describe("safeInternalPath — accepts legitimate in-app destinations", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/t/abc-123", "/t/abc-123"],
    ["/org/acme/events/summit", "/org/acme/events/summit"],
    ["/dashboard?tab=events", "/dashboard?tab=events"],
    ["/dashboard#section", "/dashboard#section"],
    ["/dashboard?a=1&b=2#top", "/dashboard?a=1&b=2#top"],
  ])("accepts %s", (input, expected) => {
    expect(safeInternalPath(input, ORIGIN)).toBe(expected);
  });

  it("accepts a percent-encoded path and returns it decoded-then-normalised", () => {
    // The real caller receives `?next=` already URL-encoded.
    expect(safeInternalPath("%2Fdashboard", ORIGIN)).toBe("/dashboard");
  });

  it("normalises traversal within the origin rather than rejecting it", () => {
    // `/a/../b` is still same-origin; the parser collapses it. Returning the
    // normalised form is correct and avoids surprising the caller.
    expect(safeInternalPath("/a/../b", ORIGIN)).toBe("/b");
  });
});

describe("safeInternalPath — blocks the confirmed bypasses (REGRESSION GUARD)", () => {
  // Each of these PASSED the old prefix check and resolved to https://evil.com.
  it.each([
    ["/\\evil.com", "literal backslash — the primary bypass"],
    ["/%5Cevil.com", "percent-encoded backslash"],
    ["/\\/evil.com", "backslash then slash"],
    ["/\t/evil.com", "tab is stripped by the URL parser, revealing //"],
    ["/\n/evil.com", "line feed is stripped by the URL parser"],
    ["/\r/evil.com", "carriage return is stripped by the URL parser"],
  ])("blocks %s (%s)", (payload) => {
    expect(safeInternalPath(payload, ORIGIN)).toBeNull();
  });

  it("proves the blocked payloads really did escape the origin", () => {
    // Guards the TEST itself: if a future URL-parser change stopped resolving
    // these off-origin, the assertions above would still pass but would no
    // longer be testing anything. This asserts the threat is real.
    for (const payload of ["/\\evil.com", "/\\/evil.com"]) {
      expect(new URL(payload, ORIGIN).origin).toBe("https://evil.com");
    }
  });
});

describe("safeInternalPath — blocks conventional off-origin targets", () => {
  it.each([
    ["https://evil.com", "absolute https"],
    ["http://evil.com", "absolute http"],
    ["//evil.com", "protocol-relative"],
    ["%2F%2Fevil.com", "encoded protocol-relative"],
    ["https://illuxus.com.evil.com/x", "suffix-confusion domain"],
    ["javascript:alert(1)", "javascript scheme"],
    ["data:text/html,<script>alert(1)</script>", "data scheme"],
    ["mailto:a@b.co", "mailto scheme"],
    ["dashboard", "bare relative path with no leading slash"],
  ])("blocks %s (%s)", (payload) => {
    expect(safeInternalPath(payload, ORIGIN)).toBeNull();
  });

  it("blocks a same-host target on a different scheme", () => {
    // Downgrading https -> http is still an origin change.
    expect(safeInternalPath("http://illuxus.com/dashboard", ORIGIN)).toBeNull();
  });
});

describe("safeInternalPath — fails closed on unusable input", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
    ["", "empty string"],
  ])("returns null for %s (%s)", (payload) => {
    expect(safeInternalPath(payload as string | null, ORIGIN)).toBeNull();
  });

  it("returns null for malformed percent-encoding", () => {
    // `decodeURIComponent("%")` throws. Falling back to the raw value here
    // would reintroduce the encoded-backslash bypass, so this must reject.
    expect(safeInternalPath("%", ORIGIN)).toBeNull();
    expect(safeInternalPath("/%E0%A4%A", ORIGIN)).toBeNull();
  });

  it("returns null when no origin can be determined", () => {
    // No explicit origin and no DOM (vitest runs jsdom, so pass an empty
    // string to simulate the un-resolvable case). Must fail closed rather
    // than trusting the input.
    expect(safeInternationalPathWithNoBase()).toBeNull();
  });
});

/** Helper for the no-origin case, kept out of the table for clarity. */
function safeInternationalPathWithNoBase(): string | null {
  // Passing an explicitly invalid base makes `new URL(base)` throw inside the
  // guard, which must be treated as "cannot validate" -> reject.
  return safeInternalPath("/dashboard", "not-a-valid-origin");
}
