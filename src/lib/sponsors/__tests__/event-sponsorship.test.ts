import { beforeEach, describe, expect, it, vi } from "vitest";

const results = vi.hoisted(() => ({ queue: [] as Array<{ data: unknown; error: unknown }>, selects: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = {
        select: (cols: string) => { results.selects.push(cols); return chain; },
        eq: () => chain,
        order: async () => results.queue.shift(),
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/observability", () => ({ supabaseRpc: vi.fn() }));

import { fetchEventSponsorLinks, withEventSponsorship } from "../event-sponsorship";

describe("withEventSponsorship", () => {
  const sponsor = { id: "s1", tier: "gold", tier_label: null as string | null, logo_url: "https://l/usual.png" };
  it("uses the event's own title and logo", () => {
    expect(withEventSponsorship(sponsor, { sponsor_id: "s1", display_order: 0, tier: "custom", tier_label: "Knowledge Partner", logo_url: "https://l/event.png" }))
      .toMatchObject({ tier: "custom", tier_label: "Knowledge Partner", logo_url: "https://l/event.png" });
  });
  it("keeps the sponsor's logo when the event has none", () => {
    expect(withEventSponsorship(sponsor, { sponsor_id: "s1", display_order: 0, tier: "platinum", tier_label: null, logo_url: null }))
      .toMatchObject({ tier: "platinum", logo_url: "https://l/usual.png" });
  });
  it("doesn't let a preset title inherit an old custom label", () => {
    expect(withEventSponsorship({ ...sponsor, tier: "custom", tier_label: "Old" }, { sponsor_id: "s1", display_order: 0, tier: "gold", tier_label: null }))
      .toMatchObject({ tier: "gold", tier_label: null });
  });
  it("leaves the sponsor as it is without per-event columns or a link", () => {
    expect(withEventSponsorship(sponsor, { sponsor_id: "s1", display_order: 0 })).toEqual(sponsor);
    expect(withEventSponsorship(sponsor, undefined)).toEqual(sponsor);
  });
});

describe("fetchEventSponsorLinks", () => {
  beforeEach(() => { results.queue = []; results.selects = []; });
  it("returns the links with their titles", async () => {
    results.queue.push({ data: [{ sponsor_id: "s1", display_order: 0, tier: "gold" }], error: null });
    const r = await fetchEventSponsorLinks("e1");
    expect(r.data[0].tier).toBe("gold");
    expect(results.selects).toHaveLength(1);
  });
  it("still returns the links if the database hasn't got the new columns yet", async () => {
    results.queue.push({ data: null, error: { code: "42703", message: "column event_sponsors.tier does not exist" } });
    results.queue.push({ data: [{ sponsor_id: "s1", display_order: 0 }], error: null });
    const r = await fetchEventSponsorLinks("e1");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ sponsor_id: "s1", display_order: 0 }]);
  });
});
