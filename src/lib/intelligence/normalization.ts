/**
 * Normalising what people type about themselves and their companies, so
 * records can be compared. Every function keeps the original apart: callers
 * store what was entered and compare the keys returned here.
 *
 * The keys only ever propose a match (identity-resolution.ts decides what a
 * match is worth). Two rules hold throughout:
 *   • an address is compared as typed, case aside — Gmail dots and
 *     `+tags` are NOT removed, because they can be different mailboxes;
 *   • a company key is for finding candidates, never for merging — two
 *     legal entities can share a name.
 *
 * The SQL functions in migration 060 (`norm_email`, `norm_phone`,
 * `company_name_key`, …) implement the same rules for the database; the
 * shared vectors in __tests__/normalization.test.ts pin both.
 */
import { isValidEmailFormat } from "@/lib/email-format";
import { COUNTRIES } from "@/lib/phone-country";

/** NFKC folds full-width and compatibility characters; whitespace collapses. */
export function cleanText(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

/** Lower case with accents removed: "Zoë Müller" → "zoe muller". */
export function foldText(raw: string | null | undefined): string {
  return cleanText(raw).normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

// ── Email ────────────────────────────────────────────────────────────────────

/**
 * Comparison form of an email address — trimmed and lower-cased, nothing
 * else — or null when it isn't a plausible address.
 */
export function normalizeEmailKey(raw: string | null | undefined): string | null {
  const email = cleanText(raw).toLowerCase();
  return isValidEmailFormat(email) ? email : null;
}

/** The domain of a valid address, e.g. "acme.com". */
export function emailDomain(raw: string | null | undefined): string | null {
  const email = normalizeEmailKey(raw);
  return email ? email.slice(email.lastIndexOf("@") + 1) : null;
}

/** Mail providers whose domain says nothing about the person's company. */
export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "rediffmail.com", "zoho.com", "zohomail.in", "yandex.com", "gmx.com", "mail.com",
]);

export const isPersonalEmailDomain = (domain: string | null | undefined): boolean =>
  !!domain && PERSONAL_EMAIL_DOMAINS.has(domain.toLowerCase());

// ── Phone ────────────────────────────────────────────────────────────────────

const KNOWN_DIALS = new Set(COUNTRIES.map((c) => c.dial));

/**
 * "+91", "91", "0091", "IN" → "+91". Null when it is none of those.
 * ISO codes resolve through the app's country list.
 */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const text = cleanText(raw).toUpperCase();
  if (!text) return null;
  const iso = COUNTRIES.find((c) => c.code === text);
  if (iso) return iso.dial;
  const digits = text.replace(/^00/, "").replace(/[^\d]/g, "");
  if (!/^\d{1,4}$/.test(digits) || /[^\d+\s()-]/.test(text.replace(/^00/, ""))) return null;
  return `+${digits}`;
}

export interface NormalizedPhone {
  /** "+919876543210" — the comparison key. */
  e164: string;
  countryCode: string;
  national: string;
}

/**
 * A phone number as `+<country><number>`. Accepts spaces, dashes, dots and
 * brackets, a leading `+` or `00` that carries its own country code, and a
 * national trunk `0` ("09876 543210" with +91). Null when the result is
 * not 6–15 digits or no country code can be found.
 */
export function normalizePhone(
  countryCode: string | null | undefined,
  number: string | null | undefined,
): NormalizedPhone | null {
  const raw = cleanText(number);
  if (!raw || /[a-z]/i.test(raw.replace(/\s*(ext|x)\.?\s*\d+$/i, ""))) return null;
  const withoutExtension = raw.replace(/\s*(ext|x)\.?\s*\d+$/i, "");
  let digits = withoutExtension.replace(/[\s().-]/g, "");
  let cc: string | null = null;

  if (digits.startsWith("+") || digits.startsWith("00")) {
    digits = digits.replace(/^(\+|00)/, "");
    if (!/^\d+$/.test(digits)) return null;
    // The number carries its own country code: take the known dial code
    // that prefixes it, else trust the one the form supplied if it fits.
    const given = normalizeCountryCode(countryCode);
    const prefixes = [...KNOWN_DIALS, ...(given ? [given] : [])]
      .map((d) => d.slice(1))
      .filter((d) => digits.startsWith(d))
      .sort((a, b) => b.length - a.length);
    if (!prefixes.length) return null;
    cc = `+${prefixes[0]}`;
    digits = digits.slice(prefixes[0].length);
  } else {
    if (!/^\d+$/.test(digits)) return null;
    cc = normalizeCountryCode(countryCode);
    if (!cc) return null;
    // "+91 09876…" or a bare "0" trunk prefix — the 0 is not part of the number.
    digits = digits.replace(/^0+/, "");
    // Someone typed the country code into the number field as well.
    const ccDigits = cc.slice(1);
    if (digits.length > 10 && digits.startsWith(ccDigits)) digits = digits.slice(ccDigits.length);
  }

  const total = cc.length - 1 + digits.length;
  if (digits.length < 6 || total > 15) return null;
  return { e164: `${cc}${digits}`, countryCode: cc, national: digits };
}

// ── Names ────────────────────────────────────────────────────────────────────

const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|shri|smt|er|adv|ca)\.?$/i;

/** A display name tidied but otherwise as entered: "  dr.  priya   RAO " → "dr. priya RAO". */
export const cleanName = (raw: string | null | undefined): string => cleanText(raw);

/**
 * Comparison key for a personal name: accents and punctuation removed,
 * leading titles dropped, lower case. "Dr. Zoë O'Brien-Smith" → "zoe obrien smith".
 */
export function personNameKey(raw: string | null | undefined): string {
  const words = foldText(raw)
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && HONORIFIC.test(words[0])) words.shift();
  return words.join(" ");
}

// ── Web addresses ───────────────────────────────────────────────────────────

/**
 * Canonical LinkedIn profile or company URL — https, www host, lower-case
 * handle, no query or trailing slash — or null when it is not one.
 * "in.linkedin.com/in/Priya-Rao/?trk=x" → "https://www.linkedin.com/in/priya-rao".
 */
export function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = url.pathname.match(/^\/(in|pub|company|school)\/([^/?#]+)/i);
  if (!match) return null;
  let handle: string;
  try {
    handle = decodeURIComponent(match[2]).toLowerCase();
  } catch {
    return null;
  }
  return `https://www.linkedin.com/${match[1].toLowerCase()}/${encodeURIComponent(handle)}`;
}

export interface NormalizedWebsite {
  /** "https://acme.com" — the site as a link. */
  url: string;
  /** "acme.com" — the comparison key; `www.` removed. */
  domain: string;
}

/** A company website as a link and a domain key, or null. Paths are dropped. */
export function normalizeWebsite(raw: string | null | undefined): NormalizedWebsite | null {
  const text = cleanText(raw);
  if (!text || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const domain = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || /^\d+(\.\d+){3}$/.test(domain)) return null;
  return { url: `https://${domain}`, domain };
}

// ── Companies ────────────────────────────────────────────────────────────────

/** Legal-form words, removed from the end of a company name for comparison. */
const LEGAL_SUFFIXES = [
  "private limited", "pvt ltd", "pvt", "limited", "ltd", "llp", "llc", "inc", "incorporated",
  "corporation", "corp", "company", "co", "plc", "gmbh", "ag", "sa", "bv", "nv", "pte", "pty",
  "sarl", "srl", "spa", "oy", "ab", "as", "kk",
].sort((a, b) => b.length - a.length);

/**
 * Comparison key for a company name: accents, punctuation and trailing
 * legal forms removed, "&" read as "and". "Tata Consultancy Services Ltd."
 * and "TATA CONSULTANCY SERVICES LIMITED" share "tata consultancy services".
 * For finding candidates only — similar names never prove the same entity.
 */
export function companyNameKey(raw: string | null | undefined): string {
  let key = foldText(raw)
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (key.endsWith(` ${suffix}`) && key.length > suffix.length + 1) {
        key = key.slice(0, -(suffix.length + 1)).trim();
        stripped = true;
        break;
      }
    }
  }
  return key.replace(/^the /, "");
}

// ── Designations ─────────────────────────────────────────────────────────────

/** Abbreviations expanded so "Sr. Mgr - Mktg" and "Senior Manager, Marketing" compare equal. */
const DESIGNATION_WORDS: Record<string, string> = {
  sr: "senior", snr: "senior", jr: "junior", asst: "assistant", assoc: "associate", mgr: "manager",
  mngr: "manager", dir: "director", exec: "executive", vp: "vice president", svp: "senior vice president",
  evp: "executive vice president", avp: "assistant vice president", gm: "general manager",
  agm: "assistant general manager", dgm: "deputy general manager", md: "managing director",
  ceo: "chief executive officer", cto: "chief technology officer", cfo: "chief financial officer",
  coo: "chief operating officer", cmo: "chief marketing officer", cio: "chief information officer",
  chro: "chief human resources officer", hr: "human resources", mktg: "marketing", engg: "engineering",
  eng: "engineer", dev: "developer", ops: "operations", biz: "business", bd: "business development",
  pm: "product manager", hod: "head of department", intl: "international", natl: "national",
};

export interface StandardDesignation {
  /** As entered, tidied. */
  display: string;
  /** Expanded and lower-cased, for comparison: "senior manager marketing". */
  key: string;
}

export function standardizeDesignation(raw: string | null | undefined): StandardDesignation {
  const display = cleanText(raw);
  const key = foldText(display)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => DESIGNATION_WORDS[w] ?? w)
    .join(" ");
  return { display, key };
}

// ── Similarity ───────────────────────────────────────────────────────────────

/**
 * Jaro–Winkler similarity in [0, 1]; 1 means identical. Used to rank
 * possible matches on names, never to decide one.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (!bHit[j] && a[i] === b[j]) { aHit[i] = bHit[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
