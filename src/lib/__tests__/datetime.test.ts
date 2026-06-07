import { describe, it, expect } from "vitest";
import {
  formatEventDate,
  formatEventTime,
  formatEventDateTime,
  formatEventRange,
  tzAbbreviation,
  DEFAULT_TZ,
} from "@/lib/datetime";

const REF = "2026-06-01T12:00:00Z";

describe("datetime helpers", () => {
  it("formats a date in the event's timezone", () => {
    expect(formatEventDate(REF, "Asia/Kolkata")).toBe("Mon, Jun 1");
    expect(formatEventDate(REF, "America/Los_Angeles")).toBe("Mon, Jun 1");
  });
  it("formats a time in the event's timezone", () => {
    expect(formatEventTime(REF, "Asia/Kolkata")).toBe("5:30 PM");
    expect(formatEventTime(REF, "America/Los_Angeles")).toBe("5:00 AM");
  });
  it("falls back to the default tz when none is given", () => {
    expect(formatEventTime(REF, null)).toBe(formatEventTime(REF, DEFAULT_TZ));
  });
  it("falls back to default tz on invalid tz id", () => {
    expect(formatEventTime(REF, "Not/A_Zone")).toBe(formatEventTime(REF, DEFAULT_TZ));
  });
  it("includes a tz label in formatEventDateTime", () => {
    const out = formatEventDateTime(REF, "Asia/Kolkata");
    expect(out).toContain("5:30 PM");
    expect(out).toMatch(/IST|GMT/);
  });
  it("renders same-day ranges compactly", () => {
    const end = "2026-06-01T14:00:00Z";
    const out = formatEventRange(REF, end, "Asia/Kolkata");
    expect(out).toContain("5:30 PM");
    expect(out).toContain("7:30 PM");
    expect(out).toContain("–");
  });
  it("renders cross-day ranges as full datetimes", () => {
    const end = "2026-06-02T14:00:00Z";
    const out = formatEventRange(REF, end, "Asia/Kolkata");
    expect(out).toContain("→");
  });
  it("returns empty string for invalid dates", () => {
    expect(formatEventTime("not-a-date", "Asia/Kolkata")).toBe("");
    expect(formatEventDate("not-a-date", "Asia/Kolkata")).toBe("");
    expect(tzAbbreviation("not-a-date", "Asia/Kolkata")).toBe("");
  });
});