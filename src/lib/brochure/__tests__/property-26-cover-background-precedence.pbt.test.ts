// Feature: event-brochure-generator, Property 26: Cover background source precedence
//
// Validates: Requirements 2.3, 2.4
//
// For any combination of a defined/undefined `image_url`, a
// defined/undefined `banner_landscape_url`, and a Brochure_Theme's default
// background, the cover background-selection function deterministically
// chooses `image_url` when defined, else `banner_landscape_url` when
// defined, else the Brochure_Theme's default background — and always
// resolves to exactly one source.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { resolveCoverBackground } from "../brochure-sections";

const arbOptionalUrl = fc.option(fc.webUrl(), { nil: undefined });

describe("Property 26: Cover background source precedence", () => {
  it("chooses image_url when defined, else banner_landscape_url, else theme-default", () => {
    fc.assert(
      fc.property(arbOptionalUrl, arbOptionalUrl, (imageUrl, bannerLandscapeUrl) => {
        const result = resolveCoverBackground(imageUrl, bannerLandscapeUrl);

        if (imageUrl) {
          expect(result).toEqual({ type: "image", url: imageUrl });
        } else if (bannerLandscapeUrl) {
          expect(result).toEqual({ type: "image", url: bannerLandscapeUrl });
        } else {
          expect(result).toEqual({ type: "theme-default" });
        }
      }),
      { numRuns: 100 }
    );
  });

  it("always resolves to exactly one source", () => {
    fc.assert(
      fc.property(arbOptionalUrl, arbOptionalUrl, (imageUrl, bannerLandscapeUrl) => {
        const result = resolveCoverBackground(imageUrl, bannerLandscapeUrl);
        const isImage = result.type === "image";
        const isThemeDefault = result.type === "theme-default";
        expect(isImage || isThemeDefault).toBe(true);
        expect(isImage && isThemeDefault).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("also treats null the same as undefined for both fields", () => {
    fc.assert(
      fc.property(arbOptionalUrl, arbOptionalUrl, (imageUrl, bannerLandscapeUrl) => {
        const withUndefined = resolveCoverBackground(imageUrl, bannerLandscapeUrl);
        const withNull = resolveCoverBackground(imageUrl ?? null, bannerLandscapeUrl ?? null);
        expect(withNull).toEqual(withUndefined);
      }),
      { numRuns: 100 }
    );
  });
});
