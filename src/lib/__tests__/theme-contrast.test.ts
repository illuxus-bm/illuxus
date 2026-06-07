import { describe, expect, it } from "vitest";
import {
  perceivedLuminance,
  readableOn,
  surfaceTokens,
  validateTheme,
  wcagContrast,
} from "@/lib/theme-contrast";
import { THEME_PRESETS } from "@/components/event/page-form/presets";

/**
 * Automated WCAG-inspired contrast audit for every shipped theme preset.
 *
 * We assert:
 *   - body copy clears the WCAG 2.x AA 4.5:1 ratio against the preset bg
 *   - `readableOn` flips polarity at the actual perceptual midpoint so the
 *     light/dark fallback used in the renderer stays correct
 *   - `surfaceTokens` returns the correct base channel (white vs black) so
 *     borders and tinted backgrounds stay visible on every preset
 */
describe("theme-contrast", () => {
  describe("wcagContrast", () => {
    it("returns 21 for pure black/white", () => {
      expect(wcagContrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    });
    it("returns 1 for identical colours", () => {
      expect(wcagContrast("#3b82f6", "#3b82f6")).toBe(1);
    });
  });

  describe("preset audit", () => {
    for (const preset of THEME_PRESETS) {
      it(`[${preset.id}] text passes WCAG AA on its background`, () => {
        const ratio = wcagContrast(preset.theme.backgroundColor, preset.theme.textColor);
        expect(
          ratio,
          `Preset "${preset.name}" has text/bg ratio ${ratio.toFixed(2)}:1 (<4.5)`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it(`[${preset.id}] surfaceTokens use the contrast-correct base channel`, () => {
        const bg = preset.theme.backgroundColor;
        const tokens = surfaceTokens(bg);
        const isLight = perceivedLuminance(bg) > 0.55;
        // Light bg -> deepen with black alpha; dark bg -> lift with white alpha.
        expect(tokens.border).toContain(isLight ? "0,0,0" : "255,255,255");
        expect(tokens.surface).toContain(isLight ? "0,0,0" : "255,255,255");
        expect(tokens.divider).toContain(isLight ? "0,0,0" : "255,255,255");
        // A tinted surface placed on the preset bg must remain perceivable —
        // i.e. the tint base must contrast with the bg (otherwise it'd be invisible).
        const tintColor = isLight ? "#000000" : "#ffffff";
        expect(wcagContrast(bg, tintColor)).toBeGreaterThan(3);
      });

      it(`[${preset.id}] readableOn matches the preset's own text polarity`, () => {
        const expected = readableOn(preset.theme.backgroundColor);
        const isLight = perceivedLuminance(preset.theme.backgroundColor) > 0.55;
        expect(expected).toBe(isLight ? "#0a0a0a" : "#fafafa");
      });
    }
  });

  describe("validateTheme", () => {
    it("repairs a low-contrast text/bg pair", () => {
      const res = validateTheme({
        primaryColor: "#ec4899",
        backgroundColor: "#ffffff",
        textColor: "#fef3c7", // cream on white — unreadable
      });
      expect(res.fixes.length).toBeGreaterThan(0);
      expect(wcagContrast(res.theme.backgroundColor, res.theme.textColor)).toBeGreaterThanOrEqual(4.5);
    });

    it("leaves a compliant theme untouched", () => {
      const compliant = {
        primaryColor: "#3b82f6",
        backgroundColor: "#ffffff",
        textColor: "#0a0a0a",
      };
      const res = validateTheme(compliant);
      expect(res.fixes).toEqual([]);
      expect(res.theme).toEqual(compliant);
    });
  });
});