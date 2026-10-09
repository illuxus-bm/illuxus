/**
 * Data access and aggregation for the per-event UTM analytics page.
 *
 * Grouping mirrors the `event_utm_summary` RPC exactly — missing UTM values
 * count as "(direct)" / "(none)" and cancelled registrations are excluded —
 * so numbers computed here (date-filtered rows, the registrations pop-up,
 * exports) always agree with the summary table.
 */
import { supabase } from "@/integrations/supabase/client";

export interface UtmRow {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  clicks: number;
  registrations: number;
  conversion_rate: number;
}

/** One registration with everything an organiser needs to follow up a lead. */
export interface UtmLead {
  id: string;
  name: string | null;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  company: string | null;
  designation: string | null;
  industry: string | null;
  company_employee_count: string | null;
  company_website: string | null;
  linkedin_url: string | null;
  ticket_type: string | null;
  status: string | null;
  approval_status: string | null;
  amount_paid: number | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  attendance_state: string | null;
  last_out_at: string | null;
  total_minutes: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_at: string;
}

export interface UtmClick {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
}

const LEAD_COLUMNS =
  "id, name, title, first_name, last_name, email, mobile_country_code, mobile_number, company, designation, " +
  "industry, company_employee_count, company_website, linkedin_url, ticket_type, status, approval_status, " +
  "amount_paid, checked_in, checked_in_at, attendance_state, last_out_at, total_minutes, " +
  "utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at";

// PostgREST returns at most 1000 rows per request; page through so large
// events aren't silently truncated.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type PageResult = { data: unknown; error: { message: string } | null };

async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Every non-cancelled registration of the event, newest first. */
export function fetchEventLeads(eventId: string): Promise<UtmLead[]> {
  return fetchAllPages<UtmLead>((from, to) =>
    supabase
      .from("registrations")
      .select(LEAD_COLUMNS as never)
      .eq("event_id", eventId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Link clicks recorded for the event since `sinceIso`. */
export function fetchEventClicksSince(eventId: string, sinceIso: string): Promise<UtmClick[]> {
  return fetchAllPages<UtmClick>((from, to) =>
    supabase
      .from("utm_clicks" as never)
      .select("utm_source, utm_medium, utm_campaign, created_at")
      .eq("event_id", eventId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

const SEP = "\u0001";
export const utmKey = (source: string, medium: string, campaign: string) => `${source}${SEP}${medium}${SEP}${campaign}`;
export const rowKey = (r: Pick<UtmRow, "utm_source" | "utm_medium" | "utm_campaign">) =>
  utmKey(r.utm_source, r.utm_medium, r.utm_campaign);
/** The summary row a lead or click belongs to. */
export const attributionKey = (x: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }) =>
  utmKey(x.utm_source ?? "(direct)", x.utm_medium ?? "(none)", x.utm_campaign ?? "(none)");

/** Build summary rows from raw clicks + leads (same maths as the RPC). */
export function aggregateRows(clicks: readonly UtmClick[], leads: readonly UtmLead[]): UtmRow[] {
  const map = new Map<string, UtmRow>();
  const rowFor = (x: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }) => {
    const key = attributionKey(x);
    let row = map.get(key);
    if (!row) {
      row = {
        utm_source: x.utm_source ?? "(direct)",
        utm_medium: x.utm_medium ?? "(none)",
        utm_campaign: x.utm_campaign ?? "(none)",
        clicks: 0,
        registrations: 0,
        conversion_rate: 0,
      };
      map.set(key, row);
    }
    return row;
  };
  for (const c of clicks) rowFor(c).clicks += 1;
  for (const l of leads) rowFor(l).registrations += 1;
  const rows = [...map.values()];
  for (const r of rows) r.conversion_rate = r.clicks === 0 ? 0 : Math.round((r.registrations / r.clicks) * 1000) / 10;
  return rows.sort((a, b) => b.registrations - a.registrations || b.clicks - a.clicks);
}

export type AttendanceLabel = "Checked in" | "Left" | "Not checked in";

export function attendanceOf(lead: Pick<UtmLead, "attendance_state" | "checked_in">): AttendanceLabel {
  const state = lead.attendance_state ?? (lead.checked_in ? "inside" : "never");
  if (state === "inside") return "Checked in";
  if (state === "outside") return "Left";
  return "Not checked in";
}

/** Attended at any point (currently inside, or checked in and left). */
export const hasAttended = (lead: Pick<UtmLead, "attendance_state" | "checked_in">) => attendanceOf(lead) !== "Not checked in";

/** "(+91) 9082109032" — parenthesised so spreadsheets don't read it as a formula or a number. */
export function formatMobile(lead: Pick<UtmLead, "mobile_country_code" | "mobile_number">): string {
  const number = (lead.mobile_number ?? "").trim();
  if (!number) return "";
  const code = (lead.mobile_country_code ?? "").trim();
  return code ? `(${code.startsWith("+") ? code : `+${code}`}) ${number}` : number;
}

export function leadDisplayName(lead: Pick<UtmLead, "name" | "first_name" | "last_name">): string {
  return (lead.name ?? "").trim() || [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || "—";
}
