import { describe, it, expect } from "vitest";
import { computeEventDays, isDayInRange, buildSessionPayload } from "../session-day-utils";

describe("computeEventDays", () => {
  it("returns single day for single-day event", () => {
    const days = computeEventDays("2026-06-15T10:00:00Z");
    expect(days).toHaveLength(1);
  });

  it("returns all days inclusive for multi-day event", () => {
    const days = computeEventDays("2026-06-15T09:00:00", "2026-06-17T18:00:00");
    expect(days).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
  });

  it("handles month boundary", () => {
    const days = computeEventDays("2026-01-30T09:00:00", "2026-02-02T18:00:00");
    expect(days).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });

  it("handles year boundary", () => {
    const days = computeEventDays("2026-12-31T09:00:00", "2027-01-02T18:00:00");
    expect(days).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("returns empty for missing start", () => {
    expect(computeEventDays(null)).toEqual([]);
    expect(computeEventDays("")).toEqual([]);
  });

  it("recomputes when end date shrinks", () => {
    const before = computeEventDays("2026-06-15T09:00:00", "2026-06-18T18:00:00");
    const after = computeEventDays("2026-06-15T09:00:00", "2026-06-16T18:00:00");
    expect(before).toHaveLength(4);
    expect(after).toEqual(["2026-06-15", "2026-06-16"]);
  });

  it("does NOT roll single-day event to two days when stored as UTC midnight (timezone bug)", () => {
    // Supabase stores dates as UTC ISO strings. If event is on 2025-07-04 and
    // start = "2025-07-04T00:00:00Z" and end_date = "2025-07-04T18:29:59Z",
    // a naive new Date() + getDate() would shift to the next day in UTC+5:30.
    // The fix strips T and beyond so the date portion is used directly.
    const days = computeEventDays("2025-07-04T00:00:00Z", "2025-07-04T18:29:59Z");
    expect(days).toEqual(["2025-07-04"]);
  });

  it("does NOT roll a 1-day event to 2 days when end_date midnight is next-day UTC", () => {
    // end_date set to "2025-07-04T23:59:00+05:30" stored as "2025-07-04T18:29:00Z"
    const days = computeEventDays("2025-07-04T03:30:00Z", "2025-07-04T18:29:00Z");
    expect(days).toEqual(["2025-07-04"]);
  });
});

describe("isDayInRange", () => {
  const days = ["2026-06-15", "2026-06-16", "2026-06-17"];

  it("accepts each day in range", () => {
    for (const d of days) expect(isDayInRange(d, days)).toBe(true);
  });

  it("rejects day before start", () => {
    expect(isDayInRange("2026-06-14", days)).toBe(false);
  });

  it("rejects day after end", () => {
    expect(isDayInRange("2026-06-18", days)).toBe(false);
  });

  it("is permissive when no event days known", () => {
    expect(isDayInRange("2099-01-01", [])).toBe(true);
  });
});

describe("buildSessionPayload", () => {
  const eventId = "evt-1";
  const eventDays = ["2026-06-15", "2026-06-16", "2026-06-17"];
  const baseForm = {
    title: "Opening Keynote",
    description: "",
    session_type: "keynote",
    start_time: "09:00",
    end_time: "10:00",
    location: "Main Hall",
    speaker_ids: ["spk-1", "spk-2"],
    date: "2026-06-16",
  };

  it("rejects when required fields missing", () => {
    const r = buildSessionPayload({ form: { ...baseForm, title: "  " }, eventId, eventDays });
    expect(r).toEqual({ ok: false, error: "missing_required" });
  });

  it("rejects day outside range", () => {
    const r = buildSessionPayload({
      form: { ...baseForm, date: "2026-06-20" },
      eventId,
      eventDays,
    });
    expect(r).toEqual({ ok: false, error: "out_of_range" });
  });

  it("rejects day before range", () => {
    const r = buildSessionPayload({
      form: { ...baseForm, date: "2026-06-14" },
      eventId,
      eventDays,
    });
    expect(r.ok).toBe(false);
  });

  it("composes start_time/end_time from selected date, not eventDate", () => {
    const r = buildSessionPayload({ form: baseForm, eventId, eventDays });
    expect(r.ok).toBe(true);
    expect(r.payload?.start_time).toBe("2026-06-16T09:00:00");
    expect(r.payload?.end_time).toBe("2026-06-16T10:00:00");
    expect(r.payload?.speaker_id).toBe("spk-1");
    expect(r.sessionDate).toBe("2026-06-16");
  });

  it("falls back to eventDays[0] when form.date is empty", () => {
    const r = buildSessionPayload({
      form: { ...baseForm, date: "" },
      eventId,
      eventDays,
    });
    expect(r.ok).toBe(true);
    expect(r.sessionDate).toBe("2026-06-15");
  });

  it("accepts session on a single-day event", () => {
    const r = buildSessionPayload({
      form: { ...baseForm, date: "2026-06-15" },
      eventId,
      eventDays: ["2026-06-15"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects session on wrong day for single-day event", () => {
    const r = buildSessionPayload({
      form: { ...baseForm, date: "2026-06-16" },
      eventId,
      eventDays: ["2026-06-15"],
    });
    expect(r.ok).toBe(false);
  });
});