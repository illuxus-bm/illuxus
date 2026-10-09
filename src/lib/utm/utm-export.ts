/**
 * CSV exports for the UTM analytics page.
 *
 * Each export is ONE flat table (a header row + one row per record) so it
 * opens cleanly in Excel / Sheets and can be sorted, filtered and pivoted.
 * Files start with a UTF-8 BOM so Excel reads non-ASCII names correctly.
 */
import { buildCsvDocument } from "./csv-escape";
import { attendanceOf, formatMobile, leadDisplayName, type UtmLead } from "./utm-data";

/** Spreadsheet apps run cells starting with = + - @ as formulas; lead fields
 *  are typed by the public, so neutralise those on the way out. */
function safeCell(v: unknown): unknown {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** "2026-10-16 09:40" in local time — sortable, and unambiguous across locales. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function downloadCsv(filename: string, headers: readonly string[], rows: readonly (readonly unknown[])[]): void {
  const csv = buildCsvDocument(headers, rows.map((r) => r.map(safeCell)));
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const fileSlug = (s: string) =>
  s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "utm";

const today = () => stamp(new Date().toISOString()).slice(0, 10);

const LEAD_HEADERS = [
  "Title", "First name", "Last name", "Full name", "Email", "Mobile",
  "Company", "Designation", "Industry", "Company size", "Company website", "LinkedIn",
  "Ticket type", "Registration status", "Approval", "Amount paid",
  "Attendance", "Checked in at", "Last checked out at", "Minutes attended", "Registered at",
  "UTM source", "UTM medium", "UTM campaign", "UTM content", "UTM term",
] as const;

/** Every lead detail we hold, one row per registration. */
export function exportLeadsCsv(leads: readonly UtmLead[], filename: string): void {
  const rows = leads.map((l) => [
    l.title, l.first_name, l.last_name, leadDisplayName(l), l.email, formatMobile(l),
    l.company, l.designation, l.industry, l.company_employee_count, l.company_website, l.linkedin_url,
    l.ticket_type, l.status, l.approval_status ?? "approved", Number(l.amount_paid ?? 0),
    attendanceOf(l), stamp(l.checked_in_at), stamp(l.last_out_at), Number(l.total_minutes ?? 0), stamp(l.created_at),
    l.utm_source ?? "(direct)", l.utm_medium ?? "(none)", l.utm_campaign ?? "(none)", l.utm_content, l.utm_term,
  ]);
  downloadCsv(filename, LEAD_HEADERS, rows);
}

export interface SummaryExportRow {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  label: string | null;
  utm_content: string | null;
  utm_term: string | null;
  clicks: number;
  registrations: number;
  checked_in: number;
  conversion_rate: number;
  revenue: number;
  url: string | null;
}

/** Performance per link (source + medium + campaign), one row each. */
export function exportSummaryCsv(rows: readonly SummaryExportRow[], filename: string): void {
  downloadCsv(
    filename,
    ["Source", "Medium", "Campaign", "Label", "Content", "Term", "Clicks", "Registrations", "Checked in", "Conversion %", "Revenue", "Tracked link"],
    rows.map((r) => [
      r.utm_source, r.utm_medium, r.utm_campaign, r.label, r.utm_content, r.utm_term,
      r.clicks, r.registrations, r.checked_in, r.conversion_rate, r.revenue, r.url,
    ]),
  );
}

export const leadsFilename = (scope: string) => `utm-leads-${fileSlug(scope)}-${today()}.csv`;
export const summaryFilename = (scope: string) => `utm-summary-${fileSlug(scope)}-${today()}.csv`;
