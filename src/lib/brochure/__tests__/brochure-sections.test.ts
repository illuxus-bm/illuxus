// Example-based unit tests for src/lib/brochure/brochure-sections.ts edge
// cases not already exercised by the property tests in this directory.
//
// Validates: Requirements 3.2, 3.3, 5.1

import { describe, expect, it } from "vitest";

import {
  buildAgendaRows,
  buildCoverContent,
  buildVenueLogisticsContent,
  groupSponsorsByTierOrdered,
  type AgendaSessionInput,
  type SponsorInput,
} from "../brochure-sections";

describe("brochure-sections edge cases", () => {
  it("omits speakerLine for a session with an empty speakerNames array", () => {
    const session: AgendaSessionInput = {
      id: "s1",
      title: "Opening Keynote",
      start_time: "2025-06-01T09:00:00.000Z",
      end_time: "2025-06-01T10:00:00.000Z",
      speakerNames: [],
    };

    const [row] = buildAgendaRows([session]);

    expect(row.speakerLine).toBeUndefined();
    expect(row.title).toBe("Opening Keynote");
  });

  it("includes speakerLine for a session with speakers", () => {
    const session: AgendaSessionInput = {
      id: "s2",
      title: "Panel Discussion",
      start_time: "2025-06-01T11:00:00.000Z",
      end_time: "2025-06-01T12:00:00.000Z",
      speakerNames: ["Jane Doe", "John Smith"],
    };

    const [row] = buildAgendaRows([session]);

    expect(row.speakerLine).toBe("Jane Doe, John Smith");
  });

  it("includes a trimmed description when present, omits it when absent/empty", () => {
    const withDescription: AgendaSessionInput = {
      id: "s3",
      title: "Panel Discussion 1",
      description: "  AI is reshaping the software delivery lifecycle.  ",
      start_time: "2025-06-01T11:00:00.000Z",
      end_time: "2025-06-01T12:00:00.000Z",
      speakerNames: [],
    };
    const withoutDescription: AgendaSessionInput = {
      id: "s4",
      title: "Networking Break",
      description: "   ",
      start_time: "2025-06-01T12:00:00.000Z",
      end_time: "2025-06-01T12:30:00.000Z",
      speakerNames: [],
    };

    const [row1, row2] = buildAgendaRows([withDescription, withoutDescription]);

    expect(row1.description).toBe("AI is reshaping the software delivery lifecycle.");
    expect(row2.description).toBeUndefined();
  });

  it("groups a sponsor whose tier doesn't match any known literal into 'custom'", () => {
    const sponsors: SponsorInput[] = [
      { id: "sp1", name: "Acme Corp", tier: "diamond", display_order: 0 },
      { id: "sp2", name: "Widgets Inc", tier: "platinum", display_order: 1 },
    ];

    const groups = groupSponsorsByTierOrdered(sponsors);

    const customGroup = groups.find((g) => g.tier === "custom");
    expect(customGroup).toBeDefined();
    expect(customGroup?.label).toBe("Custom");
    expect(customGroup?.sponsors.map((s) => s.name)).toEqual(["Acme Corp"]);

    const platinumGroup = groups.find((g) => g.tier === "platinum");
    expect(platinumGroup?.sponsors.map((s) => s.name)).toEqual(["Widgets Inc"]);

    // platinum ranks before custom.
    expect(groups.map((g) => g.tier)).toEqual(["platinum", "custom"]);
  });

  it("buildCoverContent composes date formatting and background resolution", () => {
    const content = buildCoverContent({
      title: "Annual Tech Summit",
      date: "2025-09-01T00:00:00.000Z",
      end_date: "2025-09-03T00:00:00.000Z",
      image_url: "https://example.com/cover.jpg",
      banner_landscape_url: null,
    });

    expect(content.title).toBe("Annual Tech Summit");
    expect(content.dateText).toContain(" - ");
    expect(content.background).toEqual({ type: "image", url: "https://example.com/cover.jpg" });
  });

  it("buildVenueLogisticsContent returns null when everything is empty", () => {
    expect(buildVenueLogisticsContent({})).toBeNull();
    expect(
      buildVenueLogisticsContent({ venue: "", location: null, parkingNotes: "   ", transitNotes: undefined })
    ).toBeNull();
  });
});
