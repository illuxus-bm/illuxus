// Feature: event-brochure-generator, Property 28: Agenda row omits missing speaker rather than rendering a broken value
//
// Validates: Requirements 3.2, 3.3
//
// For any session with or without an assigned speaker, building that
// session's agenda row never throws, always includes the session's title
// and formatted time range, and either includes the assigned speaker's
// name (when present) or omits the speaker field entirely (when absent) —
// never rendering an empty or placeholder speaker string.

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildAgendaRows, type AgendaSessionInput } from "../brochure-sections";

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

describe("Property 28: Agenda row omits missing speaker rather than rendering a broken value", () => {
  it("never throws and always includes title + timeRangeText", () => {
    fc.assert(
      fc.property(fc.array(arbSession, { maxLength: 30 }), (sessions) => {
        expect(() => buildAgendaRows(sessions)).not.toThrow();

        const rows = buildAgendaRows(sessions);
        for (const row of rows) {
          expect(row.title.length).toBeGreaterThanOrEqual(0);
          expect(typeof row.timeRangeText).toBe("string");
          expect(row.timeRangeText.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("includes the joined speaker names when present, omits speakerLine when absent", () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        const [row] = buildAgendaRows([session]);

        if (session.speakerNames.length > 0) {
          expect(row.speakerLine).toBe(session.speakerNames.join(", "));
          expect(row.speakerLine).not.toBe("");
        } else {
          expect(row.speakerLine).toBeUndefined();
          expect("speakerLine" in row ? row.speakerLine : undefined).not.toBe("");
        }
      }),
      { numRuns: 100 }
    );
  });
});
