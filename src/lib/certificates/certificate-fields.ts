/**
 * Dynamic certificate fields.
 *
 * A text element on a certificate may contain `{{field_key}}` tokens. The
 * keys come from an explicit allowlist — anything else is reported as an
 * error when the template is published, and rendered as empty text, so a
 * template can never reach into data it was not meant to see.
 *
 * The values themselves are produced on the server when a certificate is
 * issued (`issue_certificates`, migration 047) and stored with the
 * certificate, so a reprint shows exactly what was issued.
 */

export const CERTIFICATE_FIELDS = [
  { key: "participant_name", label: "Participant name", required: true, sample: "Aarav Mehta" },
  { key: "event_name", label: "Event name", sample: "Global Leadership Summit 2026" },
  { key: "event_date", label: "Event date", sample: "14–15 November 2026" },
  { key: "certificate_type", label: "Certificate type", sample: "Certificate of Participation" },
  { key: "issue_date", label: "Issue date", sample: "16 November 2026" },
  { key: "certificate_id", label: "Certificate ID", sample: "ILX-7Q4M-2KD9" },
  { key: "organization_name", label: "Organization name", sample: "Acme Events" },
  { key: "participant_designation", label: "Participant designation", sample: "Head of Product" },
  { key: "participant_company", label: "Participant company", sample: "Northwind Labs" },
  { key: "ticket_type", label: "Ticket type", sample: "Delegate" },
  { key: "event_venue", label: "Event venue", sample: "Jio World Centre, Mumbai" },
] as const;

export type CertificateFieldKey = (typeof CERTIFICATE_FIELDS)[number]["key"];
export type CertificateValues = Partial<Record<CertificateFieldKey, string>>;

const FIELD_KEYS = new Set<string>(CERTIFICATE_FIELDS.map((f) => f.key));
export const isCertificateField = (key: string): key is CertificateFieldKey => FIELD_KEYS.has(key);

export const fieldToken = (key: CertificateFieldKey): string => `{{${key}}}`;
export const fieldLabel = (key: string): string => CERTIFICATE_FIELDS.find((f) => f.key === key)?.label ?? key;

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Every token key used in `text`, known or not, in order of appearance. */
export function findTokens(text: string): string[] {
  return Array.from(text.matchAll(TOKEN_RE), (m) => m[1]);
}

/** Token keys in `text` that are not on the allowlist. */
export function unknownTokens(text: string): string[] {
  return findTokens(text).filter((k) => !isCertificateField(k));
}

/**
 * Replaces each token with its value. Unknown tokens and missing values
 * become empty text — never the raw `{{…}}` — and whitespace left behind by
 * an empty value is tidied so "Head of  at " does not appear.
 */
export function resolveTokens(text: string, values: CertificateValues): string {
  const out = text.replace(TOKEN_RE, (_, key: string) => (isCertificateField(key) ? values[key] ?? "" : ""));
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([,·|])/g, "$1").replace(/^[\s,·|–-]+|[\s,·|–-]+$/g, "").trim())
    .join("\n");
}

/** Realistic records for previewing a design before anyone is issued one. */
export const SAMPLE_PARTICIPANTS: { label: string; values: CertificateValues }[] = [
  {
    label: "Typical participant",
    values: Object.fromEntries(CERTIFICATE_FIELDS.map((f) => [f.key, f.sample])) as CertificateValues,
  },
  {
    label: "Long name",
    values: {
      ...Object.fromEntries(CERTIFICATE_FIELDS.map((f) => [f.key, f.sample])),
      participant_name: "Dr. Venkataraghavan Subramaniam Krishnamoorthy-Iyengar",
      participant_designation: "Senior Vice President, Global Infrastructure & Platform Engineering",
      participant_company: "International Consolidated Technology Holdings Pvt. Ltd.",
    } as CertificateValues,
  },
  {
    label: "Missing optional fields",
    values: {
      participant_name: "Li Wei",
      event_name: "Global Leadership Summit 2026",
      event_date: "14–15 November 2026",
      certificate_type: "Certificate of Participation",
      issue_date: "16 November 2026",
      certificate_id: "ILX-3HZP-8RW1",
      organization_name: "Acme Events",
    },
  },
];

/** Formats an event's start/end as "14 November 2026" or "14–15 November 2026". */
export function formatEventDateRange(start: string | null | undefined, end: string | null | undefined, timeZone = "UTC"): string {
  const s = start ? new Date(start) : null;
  if (!s || Number.isNaN(s.getTime())) return "";
  const e = end ? new Date(end) : null;
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(d); } catch { return new Intl.DateTimeFormat("en-GB", opts).format(d); }
  };
  const full = (d: Date) => fmt(d, { day: "numeric", month: "long", year: "numeric" });
  if (!e || Number.isNaN(e.getTime()) || full(s) === full(e)) return full(s);
  const sameMonth = fmt(s, { month: "long", year: "numeric" }) === fmt(e, { month: "long", year: "numeric" });
  if (sameMonth) return `${fmt(s, { day: "numeric" })}–${full(e)}`;
  const sameYear = fmt(s, { year: "numeric" }) === fmt(e, { year: "numeric" });
  return sameYear ? `${fmt(s, { day: "numeric", month: "long" })} – ${full(e)}` : `${full(s)} – ${full(e)}`;
}
