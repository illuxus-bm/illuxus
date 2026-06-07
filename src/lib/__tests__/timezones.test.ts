import { describe, it, expect } from "vitest";
import { isValidTimezone, COMMON_TIMEZONES } from "@/lib/timezones";

describe("isValidTimezone", () => {
  it("accepts common IANA ids", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(isValidTimezone(tz.id)).toBe(true);
    }
  });
  it("accepts UTC and Etc zones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Etc/GMT+5")).toBe(true);
  });
  it("rejects bogus strings", () => {
    expect(isValidTimezone("Not/A_Zone")).toBe(false);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("kolkata")).toBe(false);
  });
  it("rejects empty / nullish", () => {
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});