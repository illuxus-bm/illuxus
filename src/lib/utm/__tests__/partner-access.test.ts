import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  approvalLabel, buildPartnerExport, fillDailySeries, isPartnerFeatureMissing, linkLabel, partnerErrorMessage,
  PARTNER_NEEDS_DB_UPDATE,
} from "../partner-access";

const row = {
  name: "Nina Shah", email: "nina@novacorp.com", company: "Nova Corp", designation: null,
  registered_at: "2026-10-09T10:00:00Z", approval_status: "declined", checked_in: true, checked_in_at: "2026-10-19T04:30:00Z",
};
const all = { can_register: true, can_view_approval: true, can_view_checkin: true, can_export: true };

describe("partner export", () => {
  it("includes approval and check-in columns when the share allows them", () => {
    const { headers, rows } = buildPartnerExport(all, [row]);
    expect(headers).toEqual(["Name", "Email", "Company", "Designation", "Registered at", "Approval", "Checked in", "Checked in at"]);
    expect(rows[0].slice(0, 4)).toEqual(["Nina Shah", "nina@novacorp.com", "Nova Corp", ""]);
    expect(rows[0][5]).toBe("Rejected");
    expect(rows[0][6]).toBe("Yes");
    expect(rows[0]).toHaveLength(headers.length);
  });

  it("leaves out columns the share doesn't include", () => {
    const { headers, rows } = buildPartnerExport({ ...all, can_view_approval: false, can_view_checkin: false }, [row]);
    expect(headers).toEqual(["Name", "Email", "Company", "Designation", "Registered at"]);
    expect(rows[0]).toHaveLength(5);
    expect(rows[0].join("|")).not.toMatch(/Rejected|Yes/);
  });

  it("keeps approval but drops check-in independently", () => {
    const { headers } = buildPartnerExport({ ...all, can_view_checkin: false }, []);
    expect(headers).toContain("Approval");
    expect(headers).not.toContain("Checked in");
  });
});

describe("partner helpers", () => {
  it("labels approval states the way people read them", () => {
    expect(approvalLabel("declined")).toBe("Rejected");
    expect(approvalLabel("pending")).toBe("Pending");
    expect(approvalLabel("approved")).toBe("Approved");
    expect(approvalLabel(null)).toBe("");
  });

  it("describes a link without empty parts", () => {
    expect(linkLabel({ utm_source: "agency-a", utm_medium: "referral", utm_campaign: "cfo" })).toBe("agency-a / referral / cfo");
    expect(linkLabel({ utm_source: "qr", utm_medium: "(none)", utm_campaign: "(none)" })).toBe("qr");
  });

  it("recognises a missing database function and explains it", () => {
    const missing = { code: "PGRST202", message: "Could not find the function public.partner_utm_grants in the schema cache" };
    expect(isPartnerFeatureMissing(missing)).toBe(true);
    expect(partnerErrorMessage(missing)).toBe(PARTNER_NEEDS_DB_UPDATE);
    expect(isPartnerFeatureMissing({ code: "42501", message: "Not authorised" })).toBe(false);
    expect(partnerErrorMessage({ code: "23505", message: "This email is already registered for the event" })).toBe("This email is already registered for the event");
  });
});

describe("daily series", () => {
  const p = (day: string, registrations: number, check_ins: number | null = 0) => ({ day, clicks: 0, registrations, check_ins });

  it("fills quiet days with zeros so the chart doesn't join distant points", () => {
    const out = fillDailySeries([p("2026-10-01", 2), p("2026-10-04", 5)]);
    expect(out.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(out.map((d) => d.registrations)).toEqual([2, 0, 0, 5]);
  });

  it("crosses month ends correctly", () => {
    expect(fillDailySeries([p("2026-02-27", 1), p("2026-03-02", 1)]).map((d) => d.day))
      .toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("keeps check-ins hidden (null) on filled days when the share can't see them", () => {
    const out = fillDailySeries([p("2026-10-01", 1, null), p("2026-10-03", 1, null)]);
    expect(out.every((d) => d.check_ins === null)).toBe(true);
  });

  it("limits a long history to the most recent days", () => {
    const out = fillDailySeries([p("2025-01-01", 1), p("2026-10-09", 1)], 30);
    expect(out).toHaveLength(30);
    expect(out[out.length - 1].day).toBe("2026-10-09");
  });

  it("returns nothing for no activity", () => {
    expect(fillDailySeries([])).toEqual([]);
  });
});
