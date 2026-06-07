import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SiteContainer, SITE_CONTAINER_CLASS } from "@/components/layout/SiteContainer";

describe("SiteContainer (gutter contract)", () => {
  it("renders with the canonical gutter classes", () => {
    const { container } = render(<SiteContainer>hi</SiteContainer>);
    const el = container.querySelector("[data-site-container]");
    expect(el).not.toBeNull();
    expect(el!.className).toContain("max-w-6xl");
    expect(el!.className).toContain("mx-auto");
    expect(el!.className).toContain("px-4");
    expect(el!.className).toContain("sm:px-6");
  });
  it("snapshot the resolved class string so unintentional drift fails CI", () => {
    expect(SITE_CONTAINER_CLASS).toMatchInlineSnapshot(
      `"mx-auto w-full max-w-6xl px-4 sm:px-6"`,
    );
  });
  it("merges extra classes after the base tokens", () => {
    const { container } = render(<SiteContainer className="py-2">x</SiteContainer>);
    const el = container.querySelector("[data-site-container]")!;
    expect(el.className).toContain("py-2");
    expect(el.className.startsWith("mx-auto")).toBe(true);
  });
  it("renders as the requested tag", () => {
    const { container } = render(<SiteContainer as="section">x</SiteContainer>);
    expect(container.querySelector("section")).not.toBeNull();
  });
});