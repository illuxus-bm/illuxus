import { describe, it, expect } from "vitest";
import { formatMoney, formatPriceOrFree } from "@/lib/currency";

describe("formatMoney", () => {
  it("renders INR with ₹ symbol", () => {
    expect(formatMoney(1500, "INR")).toMatch(/₹\s?1,500/);
  });
  it("defaults to INR when no currency is provided", () => {
    expect(formatMoney(99)).toMatch(/₹/);
  });
  it("renders USD with $ symbol", () => {
    expect(formatMoney(29, "USD")).toBe("$29");
  });
  it("coerces numeric strings", () => {
    expect(formatMoney("250")).toMatch(/250/);
  });
  it("falls back to 0 for nullish input", () => {
    expect(formatMoney(null)).toMatch(/0/);
  });
});

describe("formatPriceOrFree", () => {
  it("returns Free for null", () => {
    expect(formatPriceOrFree(null)).toBe("Free");
  });
  it("returns Free for zero", () => {
    expect(formatPriceOrFree(0)).toBe("Free");
  });
  it("formats positive amounts", () => {
    expect(formatPriceOrFree(500)).toMatch(/₹\s?500/);
  });
});