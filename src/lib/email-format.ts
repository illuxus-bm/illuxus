/**
 * Single source of truth for email format validation across the app.
 *
 * Why a dedicated module?
 * ─────────────────────────
 * Before this helper existed, every entry point that accepted a free-form
 * email (workspace invitations, sponsor team members, speaker / sponsor
 * applications, CSV imports, etc.) wrote its own ad-hoc regex — or skipped
 * validation entirely. Some called Zod's `.email()`, some checked `.trim()`,
 * some just sent whatever the user typed straight to the SMTP edge function.
 * That meant typos like `foo@gmail.con` or `name.gmail.com` (missing `@`)
 * sometimes reached the participant's inbox as bounces and sometimes
 * silently failed in the function.
 *
 * Pattern
 * ───────
 * The regex is intentionally practical, not RFC-5322-strict. Real email
 * addresses can contain arbitrary punctuation and quoted local parts, but
 * no real product accepts the long-tail forms — every major email service
 * rejects them too. The chosen shape:
 *
 *   local-part @ domain . tld(min 2 chars)
 *
 *   - local-part: letters, digits, dot, underscore, hyphen, plus, percent
 *   - domain:     letters, digits, dot, hyphen
 *   - tld:        2+ letters (so "in", "com", "co", "info", etc. all pass)
 *
 * This matches everything users in India + globally actually type
 * (`name@gmail.com`, `name+tag@company.co.in`, `name@sjcem.edu.in`, …) and
 * rejects everything that's obviously malformed.
 *
 * Use `isValidEmailFormat(raw)` everywhere a user-typed email is captured.
 * Pair it with `normalizeEmail(raw)` before persisting / comparing.
 */

// Conservative, practical email regex. See module-level comment for design
// rationale. Anchored at both ends so partial matches inside other strings
// can't slip through.
// `-` is placed last in each character class so it is a literal hyphen rather
// than a range, which is why it needs no backslash. The previous `\-` escapes
// were no-ops (flagged by `no-useless-escape`); removing them does not change
// what this matches — verified equivalent across the local-part, subdomain,
// hyphenated-domain, plus-tag, and underscore cases.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Return true when `value` looks like a deliverable email address. The check
 * is format-only; it does NOT confirm the mailbox exists. Empty / null /
 * whitespace-only inputs return false.
 */
export function isValidEmailFormat(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // Disallow consecutive dots in the local-part or domain — most providers
  // reject these even though the regex above would let them through, and
  // they're almost always a typo (e.g. "foo..bar@gmail.com").
  if (/\.{2,}/.test(trimmed)) return false;
  return EMAIL_RE.test(trimmed);
}

/**
 * Normalise an email for storage and lookup: trim outer whitespace and
 * lowercase. Returns an empty string for nullish input rather than `null`
 * so callers can use the result directly in DB columns typed as text.
 */
export function normalizeEmail(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

/**
 * Throw a typed error when the input is not a valid email. Useful as a
 * single-line guard at the top of a submit handler. The thrown error's
 * `message` is suitable for display in a toast.
 */
export class EmailFormatError extends Error {
  constructor(value?: string) {
    super(
      value
        ? `"${value}" is not a valid email address. Use the format name@domain.tld (for example name@gmail.com).`
        : "Enter a valid email address (name@domain.tld).",
    );
    this.name = "EmailFormatError";
  }
}

export function assertEmailFormat(value: string | null | undefined): string {
  const normalized = normalizeEmail(value);
  if (!isValidEmailFormat(normalized)) throw new EmailFormatError(normalized || undefined);
  return normalized;
}
