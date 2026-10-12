import { describe, expect, it } from "vitest";
import { brandAssetPath, emptyBrandKit, isPreviewable, parseBrandKit, toBrandSnapshot, type BrandAsset } from "@/lib/brand-kit";

const asset = (name: string, type = "image/png"): BrandAsset => ({
  url: `https://cdn.example.com/${name}`, path: `brand-kits/org/${name}`, name, size: 10, type, uploadedAt: "2026-10-12T00:00:00.000Z",
});

describe("brand kit snapshot", () => {
  it("reads nothing useful as an empty kit", () => {
    expect(parseBrandKit(null)).toEqual(emptyBrandKit());
    expect(parseBrandKit("nope")).toEqual(emptyBrandKit());
    expect(parseBrandKit({ logos: { cmyk: { url: "javascript:alert(1)" } }, colors: [{ hex: "red" }] })).toEqual(emptyBrandKit());
  });

  it("reads a kit saved by the creatives feature", () => {
    const kit = parseBrandKit({ primaryColor: "#112233", accentColor: "#AABBCC", fontFamily: "Poppins" });
    expect(kit.colors).toEqual([{ name: "Primary", hex: "#112233" }, { name: "Accent", hex: "#aabbcc" }]);
    expect(kit.headingFont).toBe("Poppins");
  });

  it("round-trips and keeps keys it does not own", () => {
    const kit = emptyBrandKit();
    kit.logos.cmyk = asset("logo-cmyk.pdf", "application/pdf");
    kit.logos.white = asset("logo-white.svg", "image/svg+xml");
    kit.colors = [{ name: "Navy", hex: "#0a1f44" }, { name: "Gold", hex: "#d4a017" }];
    kit.headingFont = " Montserrat ";
    kit.resources = [asset("guide.zip", "application/zip")];
    const snapshot = toBrandSnapshot(kit, { preferredTemplateIds: ["a"] });
    expect(snapshot.preferredTemplateIds).toEqual(["a"]);
    expect(snapshot.primaryColor).toBe("#0a1f44");
    expect(snapshot.accentColor).toBe("#d4a017");
    expect(snapshot.fontFamily).toBe("Montserrat");
    // The CMYK PDF can't be shown by a browser, so the white SVG is the usable logo.
    expect(snapshot.logoUrl).toBe("https://cdn.example.com/logo-white.svg");
    expect(parseBrandKit(snapshot)).toEqual({ ...kit, headingFont: "Montserrat" });
  });

  it("knows which files a browser can preview", () => {
    expect(isPreviewable(asset("a.png"))).toBe(true);
    expect(isPreviewable(asset("a.SVG", ""))).toBe(true);
    expect(isPreviewable(asset("a.pdf", "application/pdf"))).toBe(false);
    expect(isPreviewable(asset("a.ai", ""))).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });

  it("builds a safe storage path", () => {
    expect(brandAssetPath("org-1", "cmyk", "Biz Millennium — Logo (CMYK).AI", 5)).toBe("brand-kits/org-1/cmyk-5-biz-millennium-logo-cmyk.ai");
    expect(brandAssetPath("org-1", "file", "../../etc/passwd", 5)).toBe("brand-kits/org-1/file-5-passwd");
  });
});
