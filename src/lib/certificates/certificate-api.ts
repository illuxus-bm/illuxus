/**
 * Certificates: reading and writing templates, issuing, revoking and
 * emailing. The rules (who may do what, which attendees are eligible, which
 * template may be used where) live in the database — migration 047 — and are
 * re-checked there whatever this file sends.
 */
import { supabase } from "@/integrations/supabase/client";
import { cloneDesign, parseDesign, type CertificateDesign, type PartnerLogoRef } from "./certificate-design";
import { verificationUrl } from "./certificate-pdf";
import { formatEventDateRange, type CertificateValues } from "./certificate-fields";

// The new tables aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

export type TemplateStatus = "draft" | "published" | "archived";

export interface TemplateRow {
  id: string;
  org_id: string;
  event_id: string | null;
  name: string;
  category: string | null;
  orientation: "landscape" | "portrait";
  source_template: string | null;
  design: CertificateDesign;
  status: TemplateStatus;
  current_version: number;
  published_version_id: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface CertificateRow {
  id: string;
  event_id: string;
  registration_id: string | null;
  template_version_id: string;
  code: string;
  recipient_name: string;
  recipient_email: string | null;
  field_values: Record<string, string>;
  status: "issued" | "revoked";
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  emailed_at: string | null;
  email_count: number;
}

export interface Registrant {
  id: string;
  name: string;
  email: string;
  designation: string | null;
  company: string | null;
  ticket_type: string | null;
  checked_in: boolean;
  eligible: boolean;
}

export type Audience = "all" | "checked_in";

/** Turns "table missing" into something an organiser can act on. */
export function explainError(message: string): string {
  if (/certificate_templates|certificates|publish_certificate_template|issue_certificates|schema cache|PGRST20[25]|42P01|42883/i.test(message) && /does not exist|not find|schema cache|PGRST/i.test(message)) {
    return "Certificates aren't switched on for this workspace yet — database update 047 still needs to be applied.";
  }
  return message.replace(/^.*?ERROR:\s*/, "");
}

const fail = (error: { message: string } | null | undefined): never => {
  throw new Error(explainError(error?.message ?? "Something went wrong"));
};

const TEMPLATE_COLUMNS = "id, org_id, event_id, name, category, orientation, source_template, design, settings, status, current_version, published_version_id, published_at, updated_at, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTemplate(row: any): TemplateRow | null {
  const design = parseDesign(row.design, row.settings);
  if (!design) return null;
  return { ...row, design } as TemplateRow;
}

export async function loadTemplates(orgId: string): Promise<TemplateRow[]> {
  const { data, error } = await db.from("certificate_templates").select(TEMPLATE_COLUMNS).eq("org_id", orgId).order("updated_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as unknown[]).map(toTemplate).filter((t): t is TemplateRow => t !== null);
}

export async function createTemplate(args: {
  orgId: string; eventId: string | null; name: string; category: string | null; source: string | null; design: CertificateDesign;
}): Promise<TemplateRow> {
  const page = args.design.document.pages[0];
  const { data, error } = await db.from("certificate_templates").insert({
    org_id: args.orgId,
    event_id: args.eventId,
    name: args.name.trim().slice(0, 120) || "Untitled certificate",
    category: args.category,
    orientation: page.width >= page.height ? "landscape" : "portrait",
    source_template: args.source,
    design: args.design.document,
    settings: args.design.settings,
  }).select(TEMPLATE_COLUMNS).single();
  if (error) fail(error);
  return toTemplate(data)!;
}

export async function saveTemplate(id: string, patch: { name?: string; design?: CertificateDesign; eventId?: string | null }): Promise<TemplateRow> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 120) || "Untitled certificate";
  if (patch.eventId !== undefined) update.event_id = patch.eventId;
  if (patch.design) {
    const page = patch.design.document.pages[0];
    update.design = patch.design.document;
    update.settings = patch.design.settings;
    update.orientation = page.width >= page.height ? "landscape" : "portrait";
  }
  const { data, error } = await db.from("certificate_templates").update(update).eq("id", id).select(TEMPLATE_COLUMNS);
  if (error) fail(error);
  if (!data || data.length === 0) throw new Error("You don't have permission to change this template.");
  return toTemplate(data[0])!;
}

export async function setArchived(id: string, archived: boolean): Promise<TemplateRow> {
  // Un-archiving sends "draft"; the database puts a previously published template back to "published".
  const { data, error } = await db.from("certificate_templates").update({ status: archived ? "archived" : "draft" }).eq("id", id).select(TEMPLATE_COLUMNS);
  if (error) fail(error);
  if (!data || data.length === 0) throw new Error("You don't have permission to change this template.");
  return toTemplate(data[0])!;
}

export async function duplicateTemplate(row: TemplateRow, eventId: string | null): Promise<TemplateRow> {
  const name = `${row.name} (copy)`.slice(0, 120);
  return createTemplate({ orgId: row.org_id, eventId, name, category: row.category, source: row.source_template, design: cloneDesign(row.design, name) });
}

export async function publishTemplate(id: string): Promise<{ versionId: string; version: number }> {
  const { data, error } = await db.rpc("publish_certificate_template", { _template_id: id });
  if (error) fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  return { versionId: row.version_id, version: row.version };
}

const versionCache = new Map<string, CertificateDesign>();
/** The frozen design of a published version (what issued certificates use). */
export async function loadVersionDesign(versionId: string): Promise<CertificateDesign> {
  const hit = versionCache.get(versionId);
  if (hit) return hit;
  const { data, error } = await db.from("certificate_template_versions").select("design, settings").eq("id", versionId).single();
  if (error) fail(error);
  const design = parseDesign(data.design, data.settings);
  if (!design) throw new Error("This certificate's design could not be read.");
  versionCache.set(versionId, design);
  return design;
}

/** The sponsors and partners attached to this event — and only this event. */
export async function loadEventPartners(eventId: string): Promise<PartnerLogoRef[]> {
  const { data, error } = await supabase
    .from("event_sponsors")
    .select("sponsor_id, tier_override, display_order, sponsors:sponsor_id(id, name, logo_url, tier, tier_label)")
    .eq("event_id", eventId)
    .order("display_order", { ascending: true });
  if (error) fail(error);
  type Row = { sponsor_id: string; tier_override: string | null; sponsors: { id: string; name: string; logo_url: string | null; tier: string; tier_label: string | null } | null };
  return ((data ?? []) as unknown as Row[]).flatMap((r) => {
    const s = Array.isArray(r.sponsors) ? r.sponsors[0] : r.sponsors;
    if (!s) return [];
    const logo = s.logo_url && /^https:\/\//i.test(s.logo_url) ? s.logo_url : "";
    return [{ sponsorId: s.id, name: s.name, logoUrl: logo, tier: r.tier_override || s.tier_label || s.tier }];
  });
}

/** Everyone registered for the event, marked eligible the same way the server decides. */
export async function loadRegistrants(eventId: string): Promise<Registrant[]> {
  const { data, error } = await supabase
    .from("registrations")
    .select("id, name, first_name, last_name, email, designation, company, ticket_type, checked_in, status, approval_status, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) fail(error);
  type Row = { id: string; name: string; first_name: string | null; last_name: string | null; email: string; designation: string | null; company: string | null; ticket_type: string | null; checked_in: boolean; status: string; approval_status: string };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.name || r.email,
    email: r.email,
    designation: r.designation,
    company: r.company,
    ticket_type: r.ticket_type,
    checked_in: r.checked_in === true,
    eligible: r.status !== "cancelled" && r.approval_status === "approved",
  }));
}

export const inAudience = (r: Registrant, audience: Audience): boolean => r.eligible && (audience === "all" || r.checked_in);

export interface EventContext {
  id: string;
  title: string;
  org_id: string | null;
  org_name: string;
  date: string | null;
  end_date: string | null;
  timezone: string | null;
  venue: string | null;
  location: string | null;
}

/**
 * What a certificate would say for this attendee — the same values the
 * server stores when it issues one, so a preview with real data matches.
 */
export function previewValues(r: Registrant, ev: EventContext, certificateType: string): CertificateValues {
  const venue = [ev.venue, ev.location].map((s) => s?.trim()).filter(Boolean).join(", ");
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return {
    participant_name: r.name,
    participant_designation: r.designation?.trim() || undefined,
    participant_company: r.company?.trim() || undefined,
    ticket_type: r.ticket_type?.trim() || undefined,
    event_name: ev.title,
    event_date: formatEventDateRange(ev.date, ev.end_date, ev.timezone || "UTC"),
    event_venue: venue || undefined,
    organization_name: ev.org_name,
    certificate_type: certificateType,
    issue_date: today,
  };
}

export async function issueCertificates(eventId: string, versionId: string, audience: Audience, registrationIds: string[] | null): Promise<{ certificateId: string; registrationId: string; code: string; created: boolean }[]> {
  const { data, error } = await db.rpc("issue_certificates", { _event_id: eventId, _version_id: versionId, _audience: audience, _registration_ids: registrationIds });
  if (error) fail(error);
  return ((data ?? []) as { certificate_id: string; registration_id: string; code: string; created: boolean }[]).map((r) => ({
    certificateId: r.certificate_id, registrationId: r.registration_id, code: r.code, created: r.created,
  }));
}

export async function loadCertificates(eventId: string): Promise<CertificateRow[]> {
  const { data, error } = await db.from("certificates")
    .select("id, event_id, registration_id, template_version_id, code, recipient_name, recipient_email, field_values, status, issued_at, revoked_at, revoked_reason, emailed_at, email_count")
    .eq("event_id", eventId).order("issued_at", { ascending: false });
  if (error) fail(error);
  return (data ?? []) as CertificateRow[];
}

export async function revokeCertificate(id: string, reason: string): Promise<void> {
  const { error } = await db.rpc("revoke_certificate", { _certificate_id: id, _reason: reason });
  if (error) fail(error);
}

export interface PublicCertificate {
  found: boolean;
  status?: "issued" | "revoked";
  code?: string;
  recipient_name?: string;
  event_name?: string;
  organization_name?: string;
  issued_at?: string;
  revoked_at?: string;
  field_values?: Record<string, string>;
  design?: unknown;
  settings?: unknown;
}

export async function getPublicCertificate(code: string): Promise<PublicCertificate> {
  const { data, error } = await db.rpc("get_certificate_public", { _code: code });
  if (error) fail(error);
  return (data ?? { found: false }) as PublicCertificate;
}

export function certificateEmail(cert: Pick<CertificateRow, "recipient_name" | "code" | "field_values">, eventTitle: string, orgName: string): { subject: string; body: string } {
  const url = verificationUrl(cert.code);
  const first = cert.recipient_name.split(" ")[0] || "there";
  return {
    subject: `Your certificate for ${eventTitle}`,
    body: [
      `Hi ${first},`,
      "",
      `Thank you for being part of ${eventTitle}. Your certificate is ready.`,
      "",
      `View and download it here: ${url}`,
      "",
      `Certificate ID: ${cert.code}`,
      "Anyone can confirm it's genuine by scanning the QR code on the certificate or opening the link above.",
      "",
      `— ${orgName}`,
    ].join("\n"),
  };
}

/**
 * Emails each recipient their own link through the existing event email
 * function (which only delivers to this event's registrants). Returns how
 * many were sent.
 */
export async function emailCertificates(args: {
  eventId: string; eventTitle: string; orgName: string; userId: string | null; certificates: CertificateRow[];
  onProgress?: (done: number, total: number) => void;
}): Promise<{ sent: number; failed: { name: string; error: string }[] }> {
  const list = args.certificates.filter((c) => c.status === "issued" && c.recipient_email);
  if (list.length === 0) return { sent: 0, failed: [] };
  const sample = certificateEmail(list[0], args.eventTitle, args.orgName);
  const { data: record, error } = await db.from("event_emails").insert({
    event_id: args.eventId,
    subject: sample.subject,
    body: "Personal certificate links (one email per recipient).",
    recipient_filter: "certificates",
    recipients: `${list.length} certificate recipient${list.length === 1 ? "" : "s"}`,
    status: "draft",
    created_by: args.userId,
  }).select("id").single();
  if (error || !record) fail(error);

  const sentIds: string[] = [];
  const failed: { name: string; error: string }[] = [];
  let done = 0;
  const queue = list.slice();
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const mail = certificateEmail(c, args.eventTitle, args.orgName);
      const { data, error: fnError } = await supabase.functions.invoke("send-event-email", {
        body: { event_id: args.eventId, email_id: record!.id, subject: mail.subject, body: mail.body, recipient_emails: [c.recipient_email] },
      });
      const result = data as { success?: boolean; sent?: number; error?: string; provider?: string } | null;
      if (!fnError && result?.success && result.provider !== "console" && (result.sent ?? 0) > 0) sentIds.push(c.id);
      else failed.push({ name: c.recipient_name, error: result?.provider === "console" ? "email isn't set up (SMTP)" : result?.error || fnError?.message || "not delivered" });
      done += 1;
      args.onProgress?.(done, list.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (sentIds.length) {
    const { error: recErr } = await db.rpc("record_certificate_emails", { _certificate_ids: sentIds });
    if (recErr) fail(recErr);
  }
  return { sent: sentIds.length, failed };
}
