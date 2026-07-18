// Feature: event-brochure-generator, Property 27: Agenda rows are sorted by start time and never empty-table
//
// Validates: Requirements 3.1, 3.4, 3.5
//
// For any list of sessions with arbitrary `start_time` values (including an
// empty list), the agenda row-builder produces rows ordered by `start_time`
// ascending, and for an empty input list produces either no Agenda_Section
// or an explicit "no sessions scheduled" row — never a section marked as a
// data table with zero rows.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildAgendaRows, buildAgendaSectionContent, type AgendaSessionInput } from "../brochure-sections";

const arbSession: fc.Arbitrary<AgendaSessionInput> = fc
  .record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 40 }),
    start: fc.date({ min: new Date("2020-01-01T00:00:00.000Z"), max: new Date("2030-01-01T00:00:00.000Z") }),
    durationMinutes: fc.integer({ min: 5, max: 240 }),
    speakerNames: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 4 }),
  })
  .map((s) => ({
    id: s.id,
    title: s.title,
    start_time: s.start.toISOString(),
    end_time: new Date(s.start.getTime() + s.durationMinutes * 60_000).toISOString(),
    speakerNames: s.speakerNames,
  }));

describe("Property 27: Agenda rows are sorted by start time and never empty-table", () => {
  it("produces rows ordered by start_time ascending", () => {
    fc.assert(
      fc.property(fc.array(arbSession, { maxLength: 30 }), (sessions) => {
        const rows = buildAgendaRows(sessions);

        expect(rows.length).toBe(sessions.length);

        const sortedStartTimes = [...sessions]
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
          .map((s) => s.title);

        expect(rows.map((r) => r.title)).toEqual(sortedStartTimes);
      }),
      { numRuns: 100 }
    );
  });

  it("never produces a data table with zero rows for an empty session list", () => {
    const content = buildAgendaSectionContent([]);
    expect(content.rows).toEqual([]);
    expect(content.emptyMessage).toBeTruthy();
  });

  it("does not set emptyMessage when there is at least one session", () => {
    fc.assert(
      fc.property(fc.array(arbSession, { minLength: 1, maxLength: 20 }), (sessions) => {
        const content = buildAgendaSectionContent(sessions);
        expect(content.emptyMessage).toBeUndefined();
        expect(content.rows.length).toBe(sessions.length);
      }),
      { numRuns: 100 }
    );
  });
});
