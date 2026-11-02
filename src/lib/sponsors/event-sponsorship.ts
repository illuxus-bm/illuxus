/**
 * A sponsor's title and logo belong to the event they sponsor (migration 066):
 * one company can be a Platinum Partner on one event and a Knowledge Partner on
 * the next. `event_sponsors` holds those per event; anything showing a sponsor on
 * an event reads them from here.
 */
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";

export interface EventSponsorLink {
  id?: string;
  sponsor_id: string;
  display_order: number;
  tier?: string | null;
  tier_label?: string | null;
  logo_url?: string | null;
}

/**
 * An event's sponsor links, in display order. If the database doesn't have the
 * per-event columns yet this returns the links without them, so a public event
 * page never loses its sponsors over a pending database update.
 */
export async function fetchEventSponsorLinks(eventId: string) {
  const full = await supabase
    .from("event_sponsors")
    .select("id, sponsor_id, display_order, tier, tier_label, logo_url")
    .eq("event_id", eventId)
    .order("display_order");
  if (!full.error) return { data: (full.data ?? []) as EventSponsorLink[], error: null };
  const basic = await supabase
    .from("event_sponsors")
    .select("id, sponsor_id, display_order")
    .eq("event_id", eventId)
    .order("display_order");
  return { data: (basic.data ?? []) as EventSponsorLink[], error: basic.error };
}

/** The sponsor as this event shows it: the event's own title and logo win. */
export function withEventSponsorship<T extends { tier?: string | null; tier_label?: string | null; logo_url?: string | null }>(
  sponsor: T,
  link: EventSponsorLink | undefined,
): T {
  if (!link) return sponsor;
  return {
    ...sponsor,
    ...(link.tier ? { tier: link.tier, tier_label: link.tier_label ?? null } : {}),
    ...(link.logo_url ? { logo_url: link.logo_url } : {}),
  };
}

export type SponsorshipAccess = "commercial" | "manage";

export interface EventSponsorshipRow {
  event_sponsor_id: string; sponsor_id: string; company_id: string | null; company: string | null;
  tier: string | null; tier_label: string | null; logo_url: string | null; package: string | null; status: string;
  commercial_value: number | null; currency: string | null;
  contacts: Array<{ id: string; name: string; role: string | null }>;
}

export interface SponsorshipDetail {
  access: SponsorshipAccess;
  sponsor: { id: string; name: string; email: string | null; website: string | null; logo_url: string | null; description: string | null };
  company: { id: string; name: string; website: string | null; industry: string | null; description: string | null; domains: string[] } | null;
  sponsorship: {
    id: string; event_id: string; tier: string | null; tier_label: string | null; logo_url: string | null;
    package: string | null; deliverables: string | null; status: string; notes: string | null;
    commercial_value: number | null; currency: string | null; contract_url: string | null; payment_status: string | null;
  };
  team: Array<{
    id: string; person_id: string | null; name: string | null; email: string; designation: string | null; accepted_at: string | null;
    invite_token: string; assigned: boolean; role_label: string | null; responsibilities: string | null;
  }>;
  history: Array<{ event_sponsor_id: string; event_id: string; event: string; date: string | null; tier: string | null; tier_label: string | null }>;
}

export interface KnownContact {
  member_id: string; person_id: string | null; name: string | null; email: string;
  designation: string | null; phone: string | null; assigned: boolean;
}

export interface NewContact {
  title?: string | null; first_name: string; last_name: string; email: string; designation?: string;
  mobile_country_code?: string; mobile_number?: string; linkedin_url?: string; role_label?: string;
}

export interface SponsorOptionRecord {
  sponsor_id: string; name: string; company_id: string | null; company: string | null; website: string | null; has_website?: boolean; email: string | null;
  logo_url: string | null; tier: string | null; tier_label: string | null; events: number; on_event: boolean;
}
export interface SponsorOptionCompany { company_id: string; name: string; website: string | null; logo_url?: string | null; verified: boolean }
export interface SponsorOptions { records: SponsorOptionRecord[]; companies: SponsorOptionCompany[]; exact: boolean }
export interface AddedSponsor {
  event_sponsor_id: string; sponsor_id: string; name: string; email: string | null; company_id: string | null; company: string | null; created: boolean;
}

async function call<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseRpc<T>(name, params);
  if (error) throw new Error((error as { message?: string }).message || "Request failed");
  return data as T;
}

export const sponsorship = {
  /** The organisation's sponsors and known companies, to add to this event. */
  options: (eventId: string, q: string) => call<SponsorOptions>("organizer_sponsor_options", { _event: eventId, _q: q, _limit: 12 }),
  /** Reuses the organisation's record for that company, or makes one. */
  addToEvent: (eventId: string, f: {
    sponsorId?: string; companyId?: string; name?: string; tier: string; tierLabel: string | null;
    email?: string; website?: string; logo_url?: string; description?: string;
  }) => call<AddedSponsor>("organizer_add_event_sponsor", {
    _event: eventId, _sponsor: f.sponsorId ?? null, _company: f.companyId ?? null, _name: f.name ?? null, _tier: f.tier, _tier_label: f.tierLabel,
    _email: f.email || null, _website: f.website || null, _logo_url: f.logo_url || null, _description: f.description || null,
  }),
  forEvent: (eventId: string) => call<EventSponsorshipRow[]>("organizer_event_sponsorships", { _event: eventId }),
  detail: (id: string) => call<SponsorshipDetail>("organizer_sponsorship_detail", { _event_sponsor: id }),
  update: (id: string, changes: Record<string, unknown>) => call<void>("organizer_update_sponsorship", { _event_sponsor: id, _changes: changes }),
  /** The company is never sent: the server takes it from the sponsorship. */
  addContact: (id: string, c: NewContact) => call<{ member_id: string; sponsor_id: string; existing: boolean }>("organizer_add_sponsor_contact", {
    _event_sponsor: id, _first_name: c.first_name, _last_name: c.last_name, _email: c.email, _designation: c.designation ?? null,
    _phone_cc: c.mobile_country_code ?? null, _phone: c.mobile_number ?? null, _linkedin: c.linkedin_url ?? null,
    _title: c.title ?? null, _role_label: c.role_label ?? null,
  }),
  searchContacts: (id: string, q: string) => call<KnownContact[]>("organizer_search_company_contacts", { _event_sponsor: id, _q: q, _limit: 20 }),
  assignContact: (id: string, memberId: string, role?: string) =>
    call<{ member_id: string; new_member: boolean; sponsor_id: string }>("organizer_assign_sponsor_contact", { _event_sponsor: id, _member: memberId, _role_label: role ?? null }),
  setContact: (id: string, memberId: string, role: string | null, remove = false) =>
    call<void>("organizer_set_sponsor_contact", { _event_sponsor: id, _member: memberId, _role_label: role, _responsibilities: null, _remove: remove }),
};
