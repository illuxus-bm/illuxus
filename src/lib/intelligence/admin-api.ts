/**
 * The Intelligence Centre's calls (migration 064). Every function checks the
 * Super Admin role on the server; nothing here relies on the page being
 * hidden. Errors come back as thrown Errors with the server's message.
 */
import { supabaseRpc } from "@/lib/observability";

export type Entity = "person" | "company";

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
}

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

export const intel = {
  overview: (f: { from?: string | null; to?: string | null; country?: string | null; industry?: string | null } = {}) =>
    call<Overview>("intel_overview", { _from: f.from || null, _to: f.to || null, _country: f.country || null, _industry: f.industry || null }),
  searchContacts: (q: string, filter = "all", offset = 0) =>
    call<ContactRow[]>("intel_search_contacts", { _q: q, _limit: 50, _offset: offset, _filter: filter }),
  searchCompanies: (q: string, filter = "all", offset = 0) =>
    call<CompanyRow[]>("intel_search_companies", { _q: q, _limit: 50, _offset: offset, _filter: filter }),
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
  duplicates: (entity: Entity, status = "open", minScore = 0) =>
    call<DuplicatePair[]>("intel_duplicate_queue", { _entity: entity, _status: status, _min_score: minScore, _limit: 200 }),
  setDuplicateStatus: (entity: Entity, id: string, status: string) =>
    call<void>("intel_set_duplicate_status", { _entity: entity, _id: id, _status: status, _reason: null }),
  mergePreview: (entity: Entity, survivor: string, others: string[]) =>
    call<Record<string, number | boolean>>("intel_merge_preview", { _entity: entity, _survivor: survivor, _others: others }),
  mergePeople: (survivor: string, others: string[], choices: Record<string, string | null>, reason: string) =>
    call<string>("intel_merge_people", { _survivor: survivor, _others: others, _choices: choices, _reason: reason }),
  mergeCompanies: (survivor: string, others: string[], choices: Record<string, string | null>, reason: string, allowDistinct: boolean) =>
    call<string>("intel_merge_companies", { _survivor: survivor, _others: others, _choices: choices, _reason: reason, _allow_distinct: allowDistinct }),
  revertMerge: (id: string) => call<void>("intel_revert_merge", { _merge: id, _reason: null }),
  revertChange: (id: string) => call<void>("intel_revert_change", { _history: id, _reason: null }),
  generateCorrections: () => call<number>("intel_generate_corrections"),
  corrections: (status = "open", entity: Entity | null = null, kind: string | null = null) =>
    call<Suggestion[]>("intel_corrections", { _status: status, _entity: entity, _kind: kind, _limit: 500 }),
  reviewCorrection: (id: string, approve: boolean, value?: string | null) =>
    call<string>("intel_review_correction", { _id: id, _approve: approve, _value: value ?? null, _reason: null }),
  bulkApproveSafe: (ids: string[]) => call<number>("intel_bulk_approve_safe", { _ids: ids }),
  audit: (f: { entity?: Entity | null; action?: string | null } = {}) =>
    call<{ events: Array<Record<string, unknown>>; merges: Array<Record<string, unknown>> }>("intel_audit_history", {
      _entity: f.entity || null, _entity_id: null, _action: f.action || null, _from: null, _to: null, _limit: 300,
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
  initials: "Name is the other's initials", different_domains: "Different website domains",
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
