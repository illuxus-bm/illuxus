/**
 * Sharing an event's participant data with a sponsor (migration 069). Every
 * call is checked on the server: sharing needs the event owner or an
 * organisation admin, reading needs that, or an accepted member of the
 * sponsor's team on that event while the share is active.
 */
import { supabaseRpc } from "@/lib/observability";

export interface ShareField { key: string; label: string; contact: boolean }

export interface ShareSummary {
  id: string; version: number; status: "active" | "superseded" | "revoked"; allow_export: boolean; includes_without_permission: boolean;
  record_count: number; with_email: number; with_mobile: number; with_both: number; without_contact: number; without_permission: number;
  shared_before_end: boolean; shared_at: string; revoked_at: string | null; revoke_reason: string | null;
}

export interface SharePreview {
  event: { id: string; title: string; date: string | null; end_date: string | null; ended: boolean; asks_consent: boolean };
  sponsor: { id: string; name: string; title: string | null; title_label: string | null };
  eligible: number; with_permission: number; without_permission: number;
  with_email: number; with_mobile: number; with_both: number; without_contact: number;
  fields: ShareField[]; not_collected: string[];
  current: ShareSummary | null;
}

export type ShareHistoryEntry = ShareSummary & { shared_by_email: string | null; views: number; exports: number; last_opened: string | null };

export interface ReceivedShare {
  id: string; version: number; event_id: string; event: string; event_date: string | null; title: string | null; title_label: string | null;
  sponsor: string; record_count: number; with_email: number; with_mobile: number; shared_at: string; shared_by: string | null;
  allow_export: boolean; status: string;
}

export type ShareRow = Record<string, string | number | null | undefined>;
export interface ShareRowsPage { total: number; fields: ShareField[]; reader: "organiser" | "sponsor"; rows: ShareRow[] }
export type ShareInfo = ShareSummary & { reader: "organiser" | "sponsor"; event: string; event_date: string | null; title: string | null; title_label: string | null; sponsor: string };

async function call<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseRpc<T>(name, params);
  if (error) throw new Error((error as { message?: string }).message || "Request failed");
  return data as T;
}

export const dataSharing = {
  preview: (eventSponsorId: string) => call<SharePreview>("organizer_sponsor_share_preview", { _event_sponsor: eventSponsorId }),
  share: (eventSponsorId: string, o: { beforeEnd: boolean; allowExport: boolean; includeWithoutPermission: boolean }) =>
    call<string>("organizer_share_sponsor_data", {
      _event_sponsor: eventSponsorId, _share_before_end: o.beforeEnd, _allow_export: o.allowExport, _include_without_permission: o.includeWithoutPermission,
    }),
  revoke: (shareId: string, reason?: string) => call<void>("organizer_revoke_sponsor_data", { _share: shareId, _reason: reason || null }),
  statusForEvent: (eventId: string) =>
    call<Array<{ event_sponsor_id: string; sponsor_id: string; share: ShareSummary | null }>>("organizer_sponsor_share_status", { _event: eventId }),
  history: (eventSponsorId: string) => call<ShareHistoryEntry[]>("organizer_sponsor_share_history", { _event_sponsor: eventSponsorId }),
  received: () => call<ReceivedShare[]>("sponsor_shared_datasets"),
  info: (shareId: string) => call<ShareInfo>("shared_dataset_info", { _share: shareId }),
  rows: (shareId: string, f: { q?: string; filter?: string; sort?: string; dir?: "asc" | "desc"; limit?: number; offset?: number }) =>
    call<ShareRowsPage>("shared_dataset_rows", {
      _share: shareId, _q: f.q ?? "", _filter: f.filter ?? "all", _sort: f.sort ?? "full_name", _dir: f.dir ?? "asc", _limit: f.limit ?? 25, _offset: f.offset ?? 0,
    }),
  export: (shareId: string) => call<{ fields: ShareField[]; rows: ShareRow[] }>("shared_dataset_export", { _share: shareId }),
};

/** A cell as it reads in a table or a file. */
export function formatShareValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if ((key === "registered_at" || key === "checked_in_at") && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
  return String(value);
}

/** CSV with every field, in the order shared. Quotes and line breaks are escaped. */
export function toCsv(fields: ShareField[], rows: ShareRow[]): string {
  // A value starting with = + - or @ could run as a formula in a spreadsheet, so it is
  // marked as text. Phone numbers (+ and digits only) can't, and stay as they are.
  const risky = (v: string) => /^[=+\-@]/.test(v) && !/^\+[\d\s]+$/.test(v);
  const cell = (v: string) => {
    const safe = risky(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) || risky(v) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [fields.map((f) => cell(f.label)).join(","), ...rows.map((r) => fields.map((f) => cell(formatShareValue(f.key, r[f.key]))).join(","))].join("\r\n");
}
