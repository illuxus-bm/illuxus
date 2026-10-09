/**
 * Partner UTM sharing — client side of migration 040.
 *
 * An organiser shares ONE tracked link (source + medium + campaign of an
 * event) with an external partner. The partner signs in with a normal
 * account and gets a dashboard limited to that link's participants.
 *
 * Nothing here is a security boundary: every function below calls a database
 * function that re-checks the caller's grant and permissions on each call and
 * derives the event and UTM values from the grant itself. The client only
 * ever passes a grant id.
 */
import { supabase } from "@/integrations/supabase/client";
import { publicOrigin } from "@/lib/publicUrl";
import { downloadCsv, fileSlug } from "@/lib/utm/utm-export";

export interface PartnerPermissions {
  can_register: boolean;
  can_view_approval: boolean;
  can_view_checkin: boolean;
  can_export: boolean;
}

export const DEFAULT_PARTNER_PERMISSIONS: PartnerPermissions = {
  can_register: true,
  can_view_approval: true,
  can_view_checkin: true,
  can_export: false,
};

export const PERMISSION_OPTIONS: { key: keyof PartnerPermissions; label: string; hint: string }[] = [
  { key: "can_register", label: "Register participants", hint: "Add people under this link from their dashboard" },
  { key: "can_view_approval", label: "See approval status", hint: "Pending, approved or declined" },
  { key: "can_view_checkin", label: "See check-in status", hint: "Live check-ins on event day" },
  { key: "can_export", label: "Export their list", hint: "Download this link's participants as CSV" },
];

export interface PartnerLinkStats {
  total: number;
  approved: number | null;
  pending: number | null;
  declined: number | null;
  waitlisted: number | null;
  checked_in: number | null;
  not_checked_in: number | null;
}

/** A share as the organiser sees it. */
export interface PartnerShare extends PartnerPermissions {
  id: string;
  event_id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  invited_email: string;
  partner_name: string | null;
  status: "pending" | "accepted" | "revoked";
  granted_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  stats: PartnerLinkStats;
  registered_by_partner: number;
  /** Only on the response of a share call. */
  has_account?: boolean;
  created?: boolean;
  event_title?: string | null;
}

/** A shared link as the partner sees it. Carries no event id and no other link. */
export interface PartnerGrant extends PartnerPermissions {
  id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  label: string | null;
  link_url: string | null;
  event: {
    title: string;
    date: string | null;
    end_date: string | null;
    timezone: string | null;
    venue: string | null;
    location: string | null;
    event_format: string | null;
    status: string;
    requires_approval: boolean;
    organizer_name: string | null;
    description?: string | null;
    image_url?: string | null;
  };
  stats: PartnerLinkStats;
}

/** Day-by-day activity and top companies of one shared link (migration 042). */
export interface PartnerAnalytics {
  clicks: number;
  timezone: string;
  series: { day: string; clicks: number; registrations: number; check_ins: number | null }[];
  top_companies: { company: string; registrations: number }[];
}

export interface PartnerParticipant {
  id: string;
  name: string;
  email: string;
  company: string | null;
  designation: string | null;
  registered_at: string;
  added_by_you: boolean;
  /** NULL when the grant doesn't include approval / check-in visibility. */
  approval_status: string | null;
  approved_at: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
}

export interface ParticipantQuery {
  search?: string;
  approval?: string;
  checkin?: string;
  from?: string | null;
  to?: string | null;
  limit: number;
  offset: number;
}

type RpcError = { code?: string; message?: string };

/** PostgREST / Postgres "no such function" — migration 040 hasn't been run. */
export const isPartnerFeatureMissing = (e: RpcError | null | undefined) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message ?? ""));

export const PARTNER_NEEDS_DB_UPDATE =
  "Partner sharing needs a one-time database update: run supabase/migrations/040_utm_partner_access.sql in the Supabase SQL Editor.";

/** Message safe to show: our own database messages are written for people. */
export function partnerErrorMessage(e: RpcError | null | undefined): string {
  if (!e) return "Something went wrong";
  if (isPartnerFeatureMissing(e)) return PARTNER_NEEDS_DB_UPDATE;
  return e.message || "Something went wrong";
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, (args ?? {}) as never);
  if (error) throw error;
  return data as T;
}

/* ── Organiser ─────────────────────────────────────────────────────────── */

export const listPartnerShares = (eventId: string) =>
  rpc<PartnerShare[]>("utm_partner_list", { _event_id: eventId }).then((d) => d ?? []);

export const sharePartnerLink = (
  eventId: string,
  link: { utm_source: string; utm_medium: string; utm_campaign: string },
  email: string,
  permissions: PartnerPermissions,
) =>
  rpc<PartnerShare>("utm_partner_share", {
    _event_id: eventId,
    _utm_source: link.utm_source,
    _utm_medium: link.utm_medium,
    _utm_campaign: link.utm_campaign,
    _email: email,
    _permissions: permissions,
  });

export const updatePartnerShare = (accessId: string, permissions: PartnerPermissions) =>
  rpc<PartnerShare>("utm_partner_update", { _access_id: accessId, _permissions: permissions });

export const revokePartnerShare = (accessId: string) =>
  rpc<PartnerShare>("utm_partner_revoke", { _access_id: accessId });

/** Where a partner goes to open what was shared (signs in / signs up first if needed). */
export const partnerDashboardUrl = () => `${publicOrigin()}/login?next=${encodeURIComponent("/partner")}`;

/**
 * Email the invitation. Returns null when delivered, otherwise a short reason.
 * The share already exists either way — the partner sees it on their Partner
 * dashboard as soon as they sign in with the invited address.
 */
export async function sendPartnerInviteEmail(
  share: Pick<PartnerShare, "id" | "event_id" | "invited_email" | "utm_source" | "utm_campaign">,
  eventTitle: string | null | undefined,
  inviterEmail: string | null | undefined,
): Promise<string | null> {
  const title = eventTitle?.trim() || "an event";
  try {
    const { data, error } = await supabase.functions.invoke("send-event-email", {
      body: {
        event_id: "partner-invite",
        target_event_id: share.event_id,
        email_id: share.id,
        subject: `You've been given partner access for ${title} on Illuxus`,
        body:
          `Hi!\n\n${inviterEmail || "The organiser"} has shared a registration link for "${title}" with you ` +
          `(source: ${share.utm_source}).\n\n` +
          `Open your Partner dashboard to see the people registered through your link, their approval and ` +
          `check-in status, and to register participants yourself:\n${partnerDashboardUrl()}\n\n` +
          `Sign in with this email address (${share.invited_email}). If you don't have an Illuxus account yet, ` +
          `you can create one from the same page.\n\nBest,\nThe Illuxus Team`,
        recipient_emails: [share.invited_email],
      },
    });
    type SendResult = { success?: boolean; sent?: number; provider?: string; note?: string; error?: string };
    if (error) {
      let note = error.message || "the email service returned an error";
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        try {
          const parsed = JSON.parse(await ctx.text()) as SendResult;
          if (parsed.error) note = parsed.error;
        } catch { /* keep generic note */ }
      }
      return note;
    }
    const result = (data ?? null) as SendResult | null;
    if (result?.error) return result.error;
    if (result?.provider === "console") return result.note ?? "email isn't configured";
    if (result?.success && (result.sent ?? 0) > 0) return null;
    return "the email service returned an unexpected response";
  } catch (e) {
    return e instanceof Error ? e.message : "the email service is unreachable";
  }
}

/* ── Partner ───────────────────────────────────────────────────────────── */

export async function partnerHasAccess(): Promise<boolean> {
  const { data, error } = await supabase.rpc("partner_utm_has_access" as never);
  return !error && data === true; // fail closed
}

export const fetchPartnerGrants = () => rpc<PartnerGrant[]>("partner_utm_grants").then((d) => d ?? []);

export const fetchPartnerAnalytics = (accessId: string) =>
  rpc<PartnerAnalytics>("partner_utm_analytics", { _access_id: accessId }).then((d) => ({
    clicks: Number(d?.clicks ?? 0),
    timezone: d?.timezone ?? "UTC",
    series: (d?.series ?? []).map((p) => ({
      day: p.day,
      clicks: Number(p.clicks ?? 0),
      registrations: Number(p.registrations ?? 0),
      check_ins: p.check_ins === null || p.check_ins === undefined ? null : Number(p.check_ins),
    })),
    top_companies: (d?.top_companies ?? []).map((c) => ({ company: c.company, registrations: Number(c.registrations ?? 0) })),
  }));

/**
 * Fill the gaps of a daily series so a chart shows quiet days as zero rather
 * than joining distant points. Returns at most `maxDays` most recent days.
 */
export function fillDailySeries(series: PartnerAnalytics["series"], maxDays = 90): PartnerAnalytics["series"] {
  if (series.length === 0) return [];
  const byDay = new Map(series.map((p) => [p.day, p]));
  const hasCheckIns = series.some((p) => p.check_ins !== null);
  const parse = (d: string) => { const [y, m, day] = d.split("-").map(Number); return Date.UTC(y, m - 1, day); };
  const end = parse(series[series.length - 1].day);
  const start = Math.max(parse(series[0].day), end - (maxDays - 1) * 86_400_000);
  const out: PartnerAnalytics["series"] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, clicks: 0, registrations: 0, check_ins: hasCheckIns ? 0 : null });
  }
  return out;
}

export const fetchPartnerParticipants = (accessId: string, q: ParticipantQuery) =>
  rpc<{ total: number; rows: PartnerParticipant[] }>("partner_utm_participants", {
    _access_id: accessId,
    _search: q.search?.trim() || null,
    _approval: q.approval && q.approval !== "all" ? q.approval : null,
    _checkin: q.checkin && q.checkin !== "all" ? q.checkin : null,
    _from: q.from || null,
    _to: q.to || null,
    _limit: q.limit,
    _offset: q.offset,
  }).then((d) => ({ total: Number(d?.total ?? 0), rows: d?.rows ?? [] }));

export const registerPartnerParticipant = (accessId: string, person: Record<string, string>) =>
  rpc<{ id: string; name: string; email: string; approval_status: string | null }>(
    "partner_utm_register", { _access_id: accessId, _person: person },
  );

type ExportRow = Pick<PartnerParticipant, "name" | "email" | "company" | "designation" | "registered_at" | "approval_status" | "checked_in" | "checked_in_at">;

const stamp = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Header + rows for the partner export. Columns follow the grant's permissions. */
export function buildPartnerExport(grant: PartnerPermissions, rows: readonly ExportRow[]): { headers: string[]; rows: string[][] } {
  const headers = ["Name", "Email", "Company", "Designation", "Registered at"];
  if (grant.can_view_approval) headers.push("Approval");
  if (grant.can_view_checkin) headers.push("Checked in", "Checked in at");
  return {
    headers,
    rows: rows.map((r) => {
      const out = [r.name, r.email, r.company ?? "", r.designation ?? "", stamp(r.registered_at)];
      if (grant.can_view_approval) out.push(approvalLabel(r.approval_status));
      if (grant.can_view_checkin) out.push(r.checked_in ? "Yes" : "No", stamp(r.checked_in_at));
      return out;
    }),
  };
}

/** Download every participant of the shared link (the database refuses without the export permission). */
export async function exportPartnerParticipants(grant: PartnerGrant): Promise<number> {
  const data = (await rpc<ExportRow[]>("partner_utm_export", { _access_id: grant.id })) ?? [];
  const { headers, rows } = buildPartnerExport(grant, data);
  downloadCsv(`partner-${fileSlug(`${grant.event.title}-${grant.utm_source}`)}.csv`, headers, rows);
  return rows.length;
}

/** The app stores "declined"; partners and organisers read "Rejected". */
export function approvalLabel(status: string | null | undefined): string {
  switch (status) {
    case "approved": return "Approved";
    case "pending": return "Pending";
    case "declined": return "Rejected";
    case "waitlisted": return "Waitlisted";
    default: return "";
  }
}

/** "source / medium / campaign", leaving out empty parts. */
export const linkLabel = (l: { utm_source: string; utm_medium: string; utm_campaign: string }) =>
  [l.utm_source, l.utm_medium, l.utm_campaign].filter((p) => p && p !== "(none)").join(" / ");
