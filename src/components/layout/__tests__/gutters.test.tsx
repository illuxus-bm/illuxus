import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SITE_CONTAINER_CLASS } from "@/components/layout/SiteContainer";

const repoRoot = path.resolve(__dirname, "../../../..");

function readSource(rel: string) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf-8");
}

describe("header + footer gutter parity", () => {
  it("SiteHeader uses SiteContainer", () => {
    const src = readSource("src/components/SiteHeader.tsx");
    expect(src).toContain('from "@/components/layout/SiteContainer"');
    expect(src).toContain("<SiteContainer");
    expect(src).not.toMatch(/container mx-auto/);
  });
  it("Footer uses SiteContainer", () => {
    const src = readSource("src/components/Footer.tsx");
    expect(src).toContain('from "@/components/layout/SiteContainer"');
    expect(src).toContain("<SiteContainer");
    expect(src).not.toMatch(/container mx-auto/);
  });
  it("the shared token still resolves to the documented gutters", () => {
    expect(SITE_CONTAINER_CLASS).toContain("max-w-6xl");
    expect(SITE_CONTAINER_CLASS).toContain("px-4");
    expect(SITE_CONTAINER_CLASS).toContain("sm:px-6");
  });
  it("legacy gutter patterns are not present in landing-page components", () => {
    const files = [
      "src/components/HeroSection.tsx",
      "src/components/FeaturesSection.tsx",
      "src/components/PricingSection.tsx",
      "src/components/TestimonialsSection.tsx",
      "src/components/CTASection.tsx",
      "src/components/EventsShowcase.tsx",
      "src/components/EmailVerificationBanner.tsx",
      "src/components/PreviewHostBanner.tsx",
    ];
    for (const f of files) {
      const src = readSource(f);
      expect(src, `${f} should not use bespoke container`).not.toMatch(/container mx-auto/);
      expect(src, `${f} should not use max-w-7xl chrome wrapper`).not.toMatch(/max-w-7xl mx-auto px-/);
    }
  });
});