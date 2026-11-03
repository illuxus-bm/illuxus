import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/event-routes", () => ({
  eventPublicUrl: (e: { id: string; slug?: string }) => `https://illuxus.com/events/${e.slug ?? e.id}`,
}));

import { utmLinkUrl } from "@/components/event/utm/utm-link-url";
import { captureUtm, clearStoredUtm } from "@/lib/utm";

const event = { eventId: "e1", eventSlug: "taxtech-summit-awards-mumbai-edition" };

describe("tracked links don't repeat the event slug", () => {
  it("leaves out a campaign equal to the event slug", () => {
    const url = new URL(utmLinkUrl(event, {
      utm_source: "manual", utm_medium: "organic", utm_campaign: "taxtech-summit-awards-mumbai-edition", utm_term: "Aman",
    }));
    expect(url.pathname).toContain("taxtech-summit-awards-mumbai-edition");
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.get("utm_term")).toBe("Aman");
  });

  it("keeps any other campaign", () => {
    const url = new URL(utmLinkUrl(event, { utm_source: "email", utm_medium: "broadcast", utm_campaign: "early-bird" }));
    expect(url.searchParams.get("utm_campaign")).toBe("early-bird");
  });
});

describe("captureUtm fallback", () => {
  afterEach(() => clearStoredUtm());

  it("fills the campaign from the event when a tagged link leaves it out", () => {
    const utm = captureUtm("?utm_source=manual&utm_medium=organic&utm_term=Aman", false, { utm_campaign: event.eventSlug });
    expect(utm).toEqual({ utm_source: "manual", utm_medium: "organic", utm_term: "Aman", utm_campaign: event.eventSlug });
  });

  it("never overrides a campaign in the URL, and adds nothing to an untagged visit", () => {
    expect(captureUtm("?utm_source=a&utm_campaign=b", false, { utm_campaign: "slug" }).utm_campaign).toBe("b");
    clearStoredUtm();
    expect(captureUtm("", false, { utm_campaign: "slug" })).toEqual({});
  });
});
