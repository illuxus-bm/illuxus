import { describe, expect, it } from "vitest";
import { safeEmbedUrl, safeUrl } from "@/lib/safe-url";

describe("safeUrl", () => {
  it("keeps ordinary links", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("mailto:hi@example.com")).toBe("mailto:hi@example.com");
    expect(safeUrl("tel:+911234567890")).toBe("tel:+911234567890");
    expect(safeUrl("/events/abc")).toBe("/events/abc");
    expect(safeUrl("#tickets")).toBe("#tickets");
  });

  it("refuses script and other dangerous schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)",
      "\u0000javascript:alert(1)",
      "jav&#x09;ascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example.com",
      "/\\evil.example.com",
    ]) {
      expect(safeUrl(bad), bad).toBeUndefined();
    }
  });

  it("handles empty and non-string input", () => {
    expect(safeUrl("")).toBeUndefined();
    expect(safeUrl("   ")).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl(42)).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });
});

describe("safeEmbedUrl", () => {
  it("allows https embeds only", () => {
    expect(safeEmbedUrl("https://www.youtube.com/embed/x")).toBe("https://www.youtube.com/embed/x");
    expect(safeEmbedUrl("http://example.com")).toBeUndefined();
    expect(safeEmbedUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeEmbedUrl("data:text/html,x")).toBeUndefined();
  });
});
