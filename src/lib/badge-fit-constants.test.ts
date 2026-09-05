/**
 * Drift-guard unit tests for the badge auto-fit engine constants.
 *
 * Every constant is pinned to its documented value from
 * `.kiro/specs/thermal-badge-centering/design.md` (§Named Constants). If a
 * downstream change reduces the padding, raises the QR floor, or tightens
 * a role's legibility floor without updating the design document, this
 * test file surfaces the drift immediately.
 *
 * Task 2 of the thermal-badge-centering bugfix (.kiro/specs).
 */
import { describe, expect, it } from "vitest";

import {
  CENTER_TOLERANCE_MM,
  FLOOR_PT_BY_ROLE,
  LINE_HEIGHT_MM_PER_PT,
  MEASUREMENT_SAFETY_PAD_MM,
  MIN_PAD_MM,
  MM_PER_CSS_PX,
  QR_MIN_MM,
  SHRINK_STEP_PT,
} from "./badge-fit-constants";

describe("badge-fit-constants", () => {
  it("MIN_PAD_MM equals 2.5", () => {
    expect(MIN_PAD_MM).toBe(2.5);
  });

  it("QR_MIN_MM equals 14", () => {
    expect(QR_MIN_MM).toBe(14);
  });

  it("CENTER_TOLERANCE_MM equals 0.5", () => {
    expect(CENTER_TOLERANCE_MM).toBe(0.5);
  });

  it("SHRINK_STEP_PT equals 0.5", () => {
    expect(SHRINK_STEP_PT).toBe(0.5);
  });

  it("MEASUREMENT_SAFETY_PAD_MM equals 1.0", () => {
    expect(MEASUREMENT_SAFETY_PAD_MM).toBe(1.0);
  });

  it("LINE_HEIGHT_MM_PER_PT equals 1.1 * 25.4 / 72", () => {
    expect(LINE_HEIGHT_MM_PER_PT).toBeCloseTo(1.1 * (25.4 / 72), 12);
  });

  it("MM_PER_CSS_PX equals 25.4 / 96", () => {
    expect(MM_PER_CSS_PX).toBeCloseTo(25.4 / 96, 12);
  });

  it("FLOOR_PT_BY_ROLE.name equals 8", () => {
    expect(FLOOR_PT_BY_ROLE.name).toBe(8);
  });

  it("FLOOR_PT_BY_ROLE.nameLabel equals 8", () => {
    expect(FLOOR_PT_BY_ROLE.nameLabel).toBe(8);
  });

  it.each([
    "company",
    "companyLabel",
    "title",
    "event",
    "org",
    "meta",
    "ticket",
    "eventDate",
    "customText",
  ])("FLOOR_PT_BY_ROLE.%s equals 6 (secondary role floor)", (role) => {
    expect(FLOOR_PT_BY_ROLE[role]).toBe(6);
  });

  it("FLOOR_PT_BY_ROLE is frozen (no runtime mutation possible)", () => {
    expect(Object.isFrozen(FLOOR_PT_BY_ROLE)).toBe(true);
  });
});
