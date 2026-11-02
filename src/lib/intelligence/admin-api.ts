/**
 * The Intelligence Centre's calls (migrations 064 to 067). Every function checks the
 * Super Admin role on the server; nothing here relies on the page being
 * hidden. Errors come back as thrown Errors with the server's message.
 */
import { supabaseRpc } from "@/lib/observability";

export type Entity = "person" | "company";

/** A partnership title for display: the words for a custom one, capitalised for a preset. */
export const sponsorshipTitle = (tier: string | null | undefined, label: string | null | undefined) =>
  tier === "custom" ? label || "Custom" : tier ? tier[0].toUpperCase() + tier.slice(1) : "—";

async function call<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseRpc<T>(name, params);
  if (error) throw new Error((error as { message?: string }).message || "Request failed");
  return data as T;
}

export interface Overview {
  people: { contacts: number; unverified: number; incomplete: number; without_company: number; with_account: number; quality: number };
  companies: { companies: number; missing_domain: number; provisional: number; incomplete: number };
  duplicate_contacts: number;
  duplicate_companies: number;
  flagged: number;
  corrections_open: number;
  corrections_safe: number;
  association_suggestions: number;
  merges: number;
  sponsors_unconnected: number;
  sponsors_repeats: number;
  sponsor_identities: number;
  event_sponsorships: number;
  merge_recommendations: number;
}

export interface Page<T> { rows: T[]; total: number }

export interface ListQuery {
  q?: string; filter?: string; limit?: number; offset?: number;
  sort?: string; dir?: "asc" | "desc"; country?: string; industry?: string;
}

/** Search functions report the total on each row; a page past the end has none. */
const paged = <T extends { total: number }>(rows: T[] | null): Page<T> => ({ rows: rows ?? [], total: rows?.[0]?.total ?? 0 });

export interface ContactRow {
  person_id: string; display_name: string | null; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; company: string | null; designation: string | null;
  has_account: boolean; registrations: number; created_at: string; updated_at: string; total: number;
}

export interface CompanyRow {
  company_id: string; name: string; website: string | null; industry: string | null; hq_country: string | null;
  verification_status: string; source: string; contacts: number; entry_count: number; domains: string[];
  created_at: string; updated_at: string; total: number;
}

export interface SponsorRow {
  id: string; name: string; email: string | null; website: string | null; logo_url: string | null;
  company_id: string | null; company: string | null; same_company: number; same_owner: string[]; events: number; team: number; created_by: string | null;
  sponsorships: Array<{ id: string; event: string; date: string | null; tier: string | null; tier_label: string | null }>;
}

export interface SponsorCompanyRow {
  key: string; company_id: string | null; name: string; record_count: number; domains: string[]; organisations: number; team: number;
  records: Array<{ id: string; name: string; email: string | null; website: string | null; owner: string | null; events: number; team: number }>;
  /** Sets of records that can become one. Records outside them belong to other organisations. */
  combine_sets: string[][];
  sponsorships: Array<{ id: string; event: string; date: string | null; tier: string | null; tier_label: string | null; sponsor_id: string; owner: string | null }>;
}

export interface SponsorMergePreview {
  records: Array<{
    id: string; name: string; email: string | null; website: string | null; logo_url: string | null; description: string | null;
    company: string | null; owner: string | null; created_at: string; team: number;
    events: Array<{ event: string; date: string | null; tier: string | null; tier_label: string | null }>;
  }>;
  same_owner: boolean; same_company: boolean; conflicts: string[]; repeats: number;
}

export interface SponsorReviewItem {
  kind: string; title: string; detail: string; company_id: string | null; sponsor_ids: string[]; person_ids: string[];
}

export interface HistoryEntry {
  id: string; field: string; old_value: string | null; new_value: string | null; source: string;
  reason: string | null; actor_id: string | null; merge_id: string | null; reverted_at: string | null; created_at: string;
}

export interface Suggestion {
  id: string; entity_type: Entity; entity_id: string; field: string; kind: string;
  current_value: string | null; suggested_value: string | null; reason: string; confidence: number;
  evidence: string | null; safe: boolean; status: string; label?: string | null; created_at: string;
}

export interface DuplicatePair {
  id: string; score: number; reasons: string[]; status: string;
  a: Record<string, unknown> & { id: string; name: string | null };
  b: Record<string, unknown> & { id: string; name: string | null };
}

export type Detail = Record<string, unknown> & { history: HistoryEntry[]; suggestions: Suggestion[] };

/** Start of a yyyy-mm-dd day in the viewer's time zone; `days` later for an inclusive end date. */
function dayStart(day?: string, days = 0): string | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const intel = {
  overview: (f: { from?: string | null; to?: string | null; country?: string | null; industry?: string | null } = {}) =>
    call<Overview>("intel_overview", { _from: f.from || null, _to: f.to || null, _country: f.country || null, _industry: f.industry || null }),
  searchContacts: (f: ListQuery = {}) =>
    call<ContactRow[]>("intel_search_contacts", {
      _q: f.q ?? "", _limit: f.limit ?? 25, _offset: f.offset ?? 0, _filter: f.filter ?? "all",
      _sort: f.sort ?? "updated", _dir: f.dir ?? "desc", _country: f.country || null,
    }).then(paged),
  searchCompanies: (f: ListQuery = {}) =>
    call<CompanyRow[]>("intel_search_companies", {
      _q: f.q ?? "", _limit: f.limit ?? 25, _offset: f.offset ?? 0, _filter: f.filter ?? "all",
      _sort: f.sort ?? "entries", _dir: f.dir ?? "desc", _country: f.country || null, _industry: f.industry || null,
    }).then(paged),
  sponsors: (f: ListQuery = {}) =>
    call<Page<SponsorRow>>("intel_search_sponsors", { _q: f.q ?? "", _limit: f.limit ?? 25, _offset: f.offset ?? 0, _filter: f.filter ?? "all" }),
  connectSponsor: (sponsor: string, company: string | null, reason?: string) =>
    call<void>("intel_connect_sponsor", { _sponsor: sponsor, _company: company, _reason: reason || null }),
  sponsorCompanies: (f: ListQuery = {}) =>
    call<Page<SponsorCompanyRow> & { combinable: number }>("intel_sponsor_companies", { _q: f.q ?? "", _limit: f.limit ?? 25, _offset: f.offset ?? 0, _filter: f.filter ?? "all" }),
  combineAllSponsorRepeats: (reason?: string) =>
    call<{ merged: number; skipped: Array<{ name: string; reason: string }> }>("intel_combine_all_sponsor_repeats", { _reason: reason || null }),
  sponsorMergePreview: (survivor: string, others: string[]) =>
    call<SponsorMergePreview>("intel_sponsor_merge_preview", { _survivor: survivor, _others: others }),
  mergeSponsors: (survivor: string, others: string[], reason: string) =>
    call<string>("intel_merge_sponsors", { _survivor: survivor, _others: others, _reason: reason }),
  consolidateSponsors: (company: string, reason: string) =>
    call<{ merged: number; skipped: Array<{ reason: string }> }>("intel_consolidate_company_sponsors", { _company: company, _reason: reason }),
  moveSponsorship: (eventSponsor: string, company: string, reason?: string) =>
    call<string>("intel_move_sponsorship", { _event_sponsor: eventSponsor, _company: company, _reason: reason || null }),
  sponsorReview: (kind: string | null, limit = 25, offset = 0) =>
    call<Page<SponsorReviewItem> & { counts: Record<string, number> }>("intel_sponsor_review", { _kind: kind, _limit: limit, _offset: offset }),
  contact: (id: string) => call<Detail>("intel_contact_detail", { _id: id }),
  company: (id: string) => call<Detail>("intel_company_detail", { _id: id }),
  updateContact: (id: string, changes: Record<string, string | null>, reason?: string) =>
    call<number>("intel_update_contact", { _id: id, _changes: changes, _reason: reason || null }),
  updateCompany: (id: string, changes: Record<string, string | null>, reason?: string) =>
    call<number>("intel_update_company", { _id: id, _changes: changes, _reason: reason || null }),
  contactIdentifier: (id: string, op: string, value: string, countryCode?: string) =>
    call<void>("intel_contact_identifier", { _id: id, _op: op, _value: value, _country_code: countryCode || null, _reason: null }),
  companyIdentifier: (id: string, op: string, value: string, kind?: string) =>
    call<void>("intel_company_identifier", { _id: id, _op: op, _value: value, _kind: kind || null, _reason: null }),
  refreshDuplicates: (entity: Entity) =>
    call<number>(entity === "person" ? "intel_refresh_person_duplicates" : "intel_refresh_company_duplicates"),
  duplicates: (entity: Entity, status = "open", minScore = 0, limit = 25, offset = 0) =>
    call<Page<DuplicatePair>>("intel_duplicate_queue", { _entity: entity, _status: status, _min_score: minScore, _limit: limit, _offset: offset }),
  setDuplicateStatus: (entity: Entity, id: string, status: string) =>
    call<void>("intel_set_duplicate_status", { _entity: entity, _id: id, _status: status, _reason: null }),
  setDuplicateStatuses: (entity: Entity, ids: string[], status: string) =>
    call<number>("intel_set_duplicate_statuses", { _entity: entity, _ids: ids, _status: status, _reason: null }),
  mergePreview: (entity: Entity, survivor: string, others: string[]) =>
    call<Record<string, number | boolean>>("intel_merge_preview", { _entity: entity, _survivor: survivor, _others: others }),
  mergePeople: (survivor: string, others: string[], choices: Record<string, string | null>, reason: string) =>
    call<string>("intel_merge_people", { _survivor: survivor, _others: others, _choices: choices, _reason: reason }),
  mergeCompanies: (survivor: string, others: string[], choices: Record<string, string | null>, reason: string, allowDistinct: boolean) =>
    call<string>("intel_merge_companies", { _survivor: survivor, _others: others, _choices: choices, _reason: reason, _allow_distinct: allowDistinct }),
  revertMerge: (id: string) => call<void>("intel_revert_merge", { _merge: id, _reason: null }),
  revertChange: (id: string) => call<void>("intel_revert_change", { _history: id, _reason: null }),
  generateCorrections: () => call<number>("intel_generate_corrections"),
  corrections: (status = "open", entity: Entity | null = null, kind: string | null = null, limit = 25, offset = 0) =>
    call<Page<Suggestion> & { safe_total: number }>("intel_corrections", { _status: status, _entity: entity, _kind: kind, _limit: limit, _offset: offset }),
  reviewCorrection: (id: string, approve: boolean, value?: string | null) =>
    call<string>("intel_review_correction", { _id: id, _approve: approve, _value: value ?? null, _reason: null }),
  bulkApproveSafe: (ids: string[]) => call<number>("intel_bulk_approve_safe", { _ids: ids }),
  approveAllSafe: (entity: Entity | null = null, kind: string | null = null) =>
    call<number>("intel_approve_all_safe", { _entity: entity, _kind: kind }),
  audit: (f: { entity?: Entity | null; action?: string | null; from?: string; to?: string; limit?: number; offset?: number; mergeOffset?: number } = {}) =>
    call<{ events: Array<Record<string, unknown>>; total: number; merges: Array<Record<string, unknown>>; merges_total: number }>("intel_audit_history", {
      _entity: f.entity || null, _entity_id: null, _action: f.action || null, _from: dayStart(f.from), _to: dayStart(f.to, 1),
      _limit: f.limit ?? 25, _offset: f.offset ?? 0, _merge_offset: f.mergeOffset ?? 0,
    }),
};

/** Fields Super Admin edits on a contact, with labels. */
export const PERSON_FIELDS: Array<[string, string]> = [
  ["first_name", "First name"], ["last_name", "Last name"], ["display_name", "Display name"],
  ["designation", "Designation"], ["department", "Department"], ["city", "City"], ["country", "Country"],
];

/** Fields Super Admin edits on a company, with labels. */
export const COMPANY_FIELDS: Array<[string, string]> = [
  ["name", "Canonical name"], ["legal_name", "Legal name"], ["common_name", "Commonly used name"], ["website", "Website"],
  ["industry", "Industry"], ["sub_industry", "Sub-industry"], ["description", "Description"],
  ["employee_range", "Employees"], ["revenue_range", "Revenue (sourced)"], ["hq_city", "HQ city"], ["hq_country", "Country"],
  ["registered_address", "Registered address"], ["company_type", "Company type"], ["company_status", "Status"],
  ["verification_status", "Verification"],
];

/** The spec's bands; scores are recommendations, never proof. */
export function confidenceBand(score: number): { label: string; tone: "high" | "mid" | "low" } {
  if (score >= 95) return { label: "Very high", tone: "high" };
  if (score >= 80) return { label: "High", tone: "high" };
  if (score >= 60) return { label: "Possible", tone: "mid" };
  return { label: "Low", tone: "low" };
}

const REASONS: Record<string, string> = {
  phone: "Same phone number", linkedin: "Same LinkedIn profile", same_name: "Same name", swapped_name: "First and last name swapped",
  same_company: "Same company", same_designation: "Same designation", name_company: "Same name at the same company",
  verified_email_same_account: "Address verified by the same account", alias: "Name is another's alias",
  initials: "Name is the other's initials", different_domains: "Different website domains", similar_name: "Nearly the same name",
};
export const reasonLabel = (r: string) => REASONS[r] ?? r.replace(/_/g, " ");

/** Values to choose between when merging: each record's value, distinct, survivor's first. */
export function mergeOptions(records: Array<Record<string, unknown>>, field: string, survivorIndex: number): string[] {
  const out: string[] = [];
  const order = [survivorIndex, ...records.map((_, i) => i).filter((i) => i !== survivorIndex)];
  for (const i of order) {
    const v = records[i]?.[field];
    const s = v === null || v === undefined ? "" : String(v);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
