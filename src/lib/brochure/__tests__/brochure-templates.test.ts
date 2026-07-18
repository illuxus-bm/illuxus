// Example-based unit tests for src/lib/brochure/brochure-templates.ts
//
// Covers `resolveFontFamilyForPdf`'s bucket mapping for every
// `FONT_OPTIONS` entry (a fixed lookup table — exhaustive example coverage
// is the right tool, not a property), `isAuthorizedForBrochureGeneration`'s
// owner/admin/neither cases, and `saveBrochurePrefs`/`readBrochurePrefs`'s
// round-trip.

import { describe, expect, it } from "vitest";

import { FONT_OPTIONS } from "@/components/event/page-form/presets";
import { buildDefaultConfig } from "@/components/event/page-form/types";

import {
  isAuthorizedForBrochureGeneration,
  readBrochurePrefs,
  resolveFontFamilyForPdf,
  saveBrochurePrefs,
} from "../brochure-templates";

describe("resolveFontFamilyForPdf", () => {
  const EXPECTED: Record<string, "helvetica" | "times" | "courier"> = {
    Poppins: "helvetica",
    Inter: "helvetica",
    "Playfair Display": "times",
    Merriweather: "times",
    Roboto: "helvetica",
    Lato: "helvetica",
    "Open Sans": "helvetica",
    Montserrat: "helvetica",
    Raleway: "helvetica",
    "JetBrains Mono": "courier",
    "Space Grotesk": "courier",
  };

  it("maps every FONT_OPTIONS entry to its expected base-14 bucket", () => {
    for (const font of FONT_OPTIONS) {
      expect(resolveFontFamilyForPdf(font)).toBe(EXPECTED[font]);
    }
  });

  it("defaults to helvetica for undefined or unrecognized font families", () => {
    expect(resolveFontFamilyForPdf(undefined)).toBe("helvetica");
    expect(resolveFontFamilyForPdf("Some Unknown Font")).toBe("helvetica");
  });
});

describe("isAuthorizedForBrochureGeneration", () => {
  it("authorizes the owning organizer", () => {
    expect(isAuthorizedForBrochureGeneration("owner-1", "owner-1", false)).toBe(true);
  });

  it("authorizes a platform admin who is not the owner", () => {
    expect(isAuthorizedForBrochureGeneration("owner-1", "someone-else", true)).toBe(true);
  });

  it("denies a non-owner, non-admin requester", () => {
    expect(isAuthorizedForBrochureGeneration("owner-1", "someone-else", false)).toBe(false);
  });
});

describe("saveBrochurePrefs / readBrochurePrefs round-trip", () => {
  it("reads back exactly what was saved, without mutating the original config", () => {
    const config = buildDefaultConfig();
    const prefs = {
      themeId: "modern-minimal",
      colorOverride: { primaryColor: "#123456", accentColor: "#abcdef", fontFamily: "Inter" },
      sectionLayout: [
        { id: "cover" as const, included: true },
        { id: "agenda" as const, included: false },
      ],
    };

    const updated = saveBrochurePrefs(config, prefs);

    expect(readBrochurePrefs(updated)).toStrictEqual(prefs);
    // Original config's brochurePrefs is untouched (pure — new object returned).
    expect(readBrochurePrefs(config)).toStrictEqual({});
  });

  it("returns undefined when no brochurePrefs have been saved", () => {
    const config = buildDefaultConfig();
    config.brochurePrefs = undefined;
    expect(readBrochurePrefs(config)).toBeUndefined();
  });
});
