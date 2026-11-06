import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability", () => ({ supabaseRpc: vi.fn() }));

import { formatShareValue, toCsv } from "../data-sharing";

const fields = [
  { key: "full_name", label: "Full name", contact: false },
  { key: "email", label: "Email", contact: true },
  { key: "mobile", label: "Mobile", contact: true },
  { key: "company", label: "Company", contact: false },
];

describe("toCsv", () => {
  it("keeps every field, in order, with labels", () => {
    const csv = toCsv(fields, [{ full_name: "Pat Kumar", email: "pat@acme.test", mobile: "+91 9876500011", company: "Acme" }]);
    expect(csv.split("\r\n")).toEqual(["Full name,Email,Mobile,Company", "Pat Kumar,pat@acme.test,+91 9876500011,Acme"]);
  });
  it("leaves phone numbers as they are", () => {
    expect(toCsv(fields, [{ mobile: "+44 20 7946 0000" }]).split("\r\n")[1]).toBe(",,+44 20 7946 0000,");
  });
  it("stops a value running as a spreadsheet formula", () => {
    expect(toCsv(fields, [{ company: '=HYPERLINK("x")' }]).split("\r\n")[1]).toBe(',,,"\'=HYPERLINK(""x"")"');
    expect(toCsv(fields, [{ company: "+cmd" }]).split("\r\n")[1]).toBe(",,,\"'+cmd\"");
  });
  it("stops formulas behind a tab, a NUL or a full-width sign (QA audit F-11)", () => {
    const row = (company: string) => toCsv(fields, [{ company }]).split("\r\n").slice(1).join("\r\n");
    expect(row("\t=cmd|' /C calc'!A0")).toBe(",,,\"'\t=cmd|' /C calc'!A0\"");
    expect(row("\0@SUM(1+1)")).toBe(",,,\"'\0@SUM(1+1)\"");
    expect(row("＝1+1")).toBe(",,,\"'＝1+1\"");
    expect(row("－2+3")).toBe(",,,\"'－2+3\"");
    expect(row("\r\n=1+1")).toBe(",,,\"'\r\n=1+1\"");
  });
  it("marks a formula in any field, not only free text", () => {
    expect(toCsv(fields, [{ full_name: "=1+1", email: "@x" }]).split("\r\n")[1]).toBe("\"'=1+1\",\"'@x\",,");
  });
  it("quotes commas and line breaks", () => {
    expect(toCsv(fields, [{ company: "Acme, Inc.\nIndia" }]).split("\r\n").slice(1).join("\r\n")).toBe(',,,"Acme, Inc.\nIndia"');
  });
  it("leaves a missing value empty", () => {
    expect(toCsv(fields, [{ full_name: "No Contact" }]).split("\r\n")[1]).toBe("No Contact,,,");
  });
});

describe("formatShareValue", () => {
  it("formats dates and leaves the rest", () => {
    expect(formatShareValue("registered_at", "2026-01-10T10:00:00Z")).not.toBe("2026-01-10T10:00:00Z");
    expect(formatShareValue("company", "Acme")).toBe("Acme");
    expect(formatShareValue("email", null)).toBe("");
  });
});
