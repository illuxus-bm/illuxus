import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { periodStart } from "../parts";

describe("periodStart", () => {
  const today = new Date(2026, 10, 2);
  it("all time has no start", () => expect(periodStart("all", today)).toBe(""));
  it("counts today as the first of the days", () => expect(periodStart("7d", today)).toBe("2026-10-27"));
  it("30 days crosses the month", () => expect(periodStart("30d", today)).toBe("2026-10-04"));
  it("this year starts on 1 January", () => expect(periodStart("ytd", today)).toBe("2026-01-01"));
});
