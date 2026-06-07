import { test, expect } from "../../playwright-fixture";

/**
 * Visual regression for the shared quick-view dialogs.
 *
 * Renders both `SponsorQuickViewDialog` and `SpeakerQuickViewDialog` via the
 * dev-only `/__preview/quick-views` page and snapshots each across themes,
 * common viewports, and two browser zoom levels.
 *
 * Run with: `bunx playwright test tests/visual/quick-views.spec.ts`.
 * Baselines live next to this file under `__screenshots__/`.
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 768 },
] as const;

const THEMES = ["light", "dark"] as const;
const ZOOMS = [1, 1.5] as const;

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    for (const zoom of ZOOMS) {
      test(`quick views @ ${theme} ${vp.name} zoom=${zoom}`, async ({ page }) => {
        await page.addInitScript((t) => {
          window.localStorage.setItem("app-theme", t);
        }, theme);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/__preview/quick-views");
        await page.evaluate((z) => {
          (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
        }, zoom);

        for (const kind of ["sponsor", "speaker"]) {
          const dialog = page.locator(`[data-testid="quick-view-${kind}"]`).first();
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveScreenshot(
            `${kind}-${theme}-${vp.name}-z${String(zoom).replace(".", "_")}.png`,
            { maxDiffPixelRatio: 0.01, animations: "disabled" },
          );
        }
      });
    }
  }
}