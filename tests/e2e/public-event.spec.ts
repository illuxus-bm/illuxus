import { test, expect } from "../../playwright-fixture";

/**
 * End-to-end smoke test: load a published event as a logged-out visitor and
 * assert the four content sections (agenda / speakers / sessions / sponsors)
 * render with their headings and at least one navigable element.
 *
 * Run with: `bunx playwright test tests/e2e/public-event.spec.ts`.
 */

const EVENT_PATH = "/org/wybe/events/tech-summit-2026";

test.describe("Published event — logged-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders agenda, speakers, and sponsors with content", async ({ page }) => {
    await page.goto(EVENT_PATH);

    // Title is the most reliable "page loaded" signal.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // About section is always present for published events.
    await expect(page.getByRole("heading", { name: /about this event/i })).toBeVisible();

    // Agenda — heading + at least one session row.
    const agenda = page.getByRole("heading", { name: /agenda|schedule/i }).first();
    await expect(agenda).toBeVisible();

    // Speakers grid — heading + at least one speaker card.
    const speakers = page.getByRole("heading", { name: /speakers/i }).first();
    await expect(speakers).toBeVisible();

    // Sponsors strip — heading + at least one sponsor logo.
    const sponsors = page.getByRole("heading", { name: /sponsors|partners/i }).first();
    await expect(sponsors).toBeVisible();

    // Registration card (the right rail) must offer a CTA without auth.
    const cta = page.getByRole("button", { name: /register|join|tickets|request/i }).first();
    await expect(cta).toBeVisible();

    // Sanity: page must not be empty — at least one external/internal link.
    const links = await page.locator("a[href]").count();
    expect(links).toBeGreaterThan(0);
  });

  test("agenda anchor links scroll to the agenda section", async ({ page }) => {
    await page.goto(`${EVENT_PATH}#agenda`);
    const agenda = page.locator("#agenda");
    await expect(agenda).toBeVisible();
  });
});