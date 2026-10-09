import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  aggregateRows, attendanceOf, attributionKey, formatMobile, hasAttended, leadDisplayName, rowKey,
  type UtmClick, type UtmLead,
} from "../utm-data";
import { exportLeadsCsv, exportSummaryCsv, fileSlug } from "../utm-export";

const lead = (over: Partial<UtmLead> = {}): UtmLead => ({
  id: "r1", name: "Abhishek Singh", title: "Mr", first_name: "Abhishek", last_name: "Singh",
  email: "abhishek@example.com", mobile_country_code: "+91", mobile_number: "9082109032",
  company: "ArcelorMittal", designation: "CFO", industry: "Steel", company_employee_count: "1000+",
  company_website: "https://example.com", linkedin_url: "https://linkedin.com/in/x",
  ticket_type: "general", status: "confirmed", approval_status: "approved", amount_paid: 0,
  checked_in: false, checked_in_at: null, attendance_state: "never", last_out_at: null, total_minutes: 0,
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  created_at: "2026-10-01T09:30:00Z",
  ...over,
});
const click = (s: string | null, m: string | null, c: string | null): UtmClick =>
  ({ utm_source: s, utm_medium: m, utm_campaign: c, created_at: "2026-10-02T00:00:00Z" });

describe("aggregateRows — mirrors event_utm_summary", () => {
  it("treats missing UTM values as (direct) / (none)", () => {
    const rows = aggregateRows([], [lead(), lead({ id: "r2" })]);
    expect(rows).toEqual([
      { utm_source: "(direct)", utm_medium: "(none)", utm_campaign: "(none)", clicks: 0, registrations: 2, conversion_rate: 0 },
    ]);
  });

  it("joins clicks and registrations of the same link and computes conversion to 1 decimal", () => {
    const rows = aggregateRows(
      [click("whatsapp", "referral", "launch"), click("whatsapp", "referral", "launch"), click("whatsapp", "referral", "launch")],
      [lead({ utm_source: "whatsapp", utm_medium: "referral", utm_campaign: "launch" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clicks: 3, registrations: 1, conversion_rate: 33.3 });
  });

  it("keeps click-only and registration-only links, sorted by registrations then clicks", () => {
    const rows = aggregateRows(
      [click("email", "broadcast", "a"), click("sms", "paid", "b"), click("sms", "paid", "b")],
      [lead({ utm_source: "qr", utm_medium: "organic", utm_campaign: "c" })],
    );
    expect(rows.map((r) => r.utm_source)).toEqual(["qr", "sms", "email"]);
    expect(rows[0].conversion_rate).toBe(0); // no clicks → 0, never a division by zero
  });

  it("uses the same key for a lead and its summary row", () => {
    const l = lead({ utm_source: "email", utm_medium: "broadcast", utm_campaign: "x" });
    const [row] = aggregateRows([], [l]);
    expect(attributionKey(l)).toBe(rowKey(row));
    expect(attributionKey(lead())).toBe(rowKey({ utm_source: "(direct)", utm_medium: "(none)", utm_campaign: "(none)" }));
  });
});

describe("lead helpers", () => {
  it("derives attendance from attendance_state, falling back to checked_in", () => {
    expect(attendanceOf(lead({ attendance_state: "inside" }))).toBe("Checked in");
    expect(attendanceOf(lead({ attendance_state: "outside" }))).toBe("Left");
    expect(attendanceOf(lead({ attendance_state: "never" }))).toBe("Not checked in");
    expect(attendanceOf(lead({ attendance_state: null, checked_in: true }))).toBe("Checked in");
    expect(hasAttended(lead({ attendance_state: "outside" }))).toBe(true);
    expect(hasAttended(lead())).toBe(false);
  });

  it("formats mobiles so a spreadsheet won't treat them as a formula or number", () => {
    expect(formatMobile(lead())).toBe("(+91) 9082109032");
    expect(formatMobile(lead({ mobile_country_code: "971" }))).toBe("(+971) 9082109032");
    expect(formatMobile(lead({ mobile_country_code: null }))).toBe("9082109032");
    expect(formatMobile(lead({ mobile_number: null }))).toBe("");
  });

  it("falls back to first + last name when name is empty", () => {
    expect(leadDisplayName(lead({ name: "" }))).toBe("Abhishek Singh");
    expect(leadDisplayName(lead({ name: null, first_name: null, last_name: null }))).toBe("—");
  });
});

describe("CSV exports", () => {
  let captured = "";
  const OriginalBlob = globalThis.Blob;

  beforeEach(() => {
    captured = "";
    // Capture the CSV text instead of downloading it.
    globalThis.Blob = class extends OriginalBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        captured = parts.map(String).join("");
      }
    } as typeof Blob;
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.Blob = OriginalBlob;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const lines = () => captured.replace(/^﻿/, "").split("\r\n");

  it("exports every lead field in one flat table", () => {
    exportLeadsCsv(
      [lead({ attendance_state: "inside", checked_in: true, checked_in_at: "2026-10-16T04:10:00Z", total_minutes: 95, amount_paid: 1500 })],
      "leads.csv",
    );
    expect(captured.startsWith("﻿")).toBe(true); // BOM so Excel reads UTF-8
    const [header, row] = lines();
    expect(header).toBe(
      "Title,First name,Last name,Full name,Email,Mobile,Company,Designation,Industry,Company size,Company website,LinkedIn," +
      "Ticket type,Registration status,Approval,Amount paid,Attendance,Checked in at,Last checked out at,Minutes attended,Registered at," +
      "UTM source,UTM medium,UTM campaign,UTM content,UTM term",
    );
    const cells = row.split(",");
    expect(cells.length).toBe(header.split(",").length);
    expect(cells.slice(0, 12)).toEqual([
      "Mr", "Abhishek", "Singh", "Abhishek Singh", "abhishek@example.com", "(+91) 9082109032",
      "ArcelorMittal", "CFO", "Steel", "1000+", "https://example.com", "https://linkedin.com/in/x",
    ]);
    expect(cells[15]).toBe("1500");
    expect(cells[16]).toBe("Checked in");
    expect(cells[19]).toBe("95");
    expect(cells.slice(21, 24)).toEqual(["(direct)", "(none)", "(none)"]);
  });

  it("neutralises values a spreadsheet would run as a formula", () => {
    exportLeadsCsv([lead({ name: "=HYPERLINK(\"http://evil\")", company: "+SUM(A1)", designation: "@cmd" })], "leads.csv");
    const row = lines()[1];
    expect(row).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(row).toContain("'+SUM(A1)");
    expect(row).toContain("'@cmd");
  });

  it("exports one row per link in the summary", () => {
    exportSummaryCsv([{
      utm_source: "whatsapp", utm_medium: "referral", utm_campaign: "launch", label: "Group share",
      utm_content: null, utm_term: null, clicks: 10, registrations: 4, checked_in: 3, conversion_rate: 40, revenue: 0,
      url: "https://illuxus.com/e/x?utm_source=whatsapp",
    }], "summary.csv");
    const [header, row] = lines();
    expect(header).toBe("Source,Medium,Campaign,Label,Content,Term,Clicks,Registrations,Checked in,Conversion %,Revenue,Tracked link");
    expect(row).toBe("whatsapp,referral,launch,Group share,,,10,4,3,40,0,https://illuxus.com/e/x?utm_source=whatsapp");
  });

  it("builds safe file name slugs", () => {
    expect(fileSlug("(direct)-(none)-(none)")).toBe("direct-none-none");
    expect(fileSlug("")).toBe("utm");
  });
});
