/**
 * Open-redirect-safe validation for user-supplied post-login destinations.
 *
 * ## The vulnerability this replaces
 *
 * `LoginPage.tsx` accepted a `?next=<path>` parameter and validated it with a
 * string-prefix check:
 *
 *     if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
 *
 * That correctly rejects `https://evil.com` and `//evil.com`, but it is a
 * prefix check on a value that is later handed to `window.location.assign()`,
 * where the browser applies full WHATWG URL parsing. Under that parsing a
 * BACKSLASH is normalised to a forward slash before the authority is
 * determined, so several payloads pass the prefix check and still leave the
 * origin. Verified against Node's WHATWG `URL` implementation, resolving
 * against `https://illuxus.com`:
 *
 *     "/dashboard"      -> https://illuxus.com   (safe)
 *     "//evil.com"      -> blocked by prefix check
 *     "/\evil.com"      -> https://evil.com      ESCAPES
 *     "/%5Cevil.com"    -> https://evil.com      ESCAPES  (encoded backslash)
 *     "/\/evil.com"     -> https://evil.com      ESCAPES
 *     "/\t/evil.com"    -> https://evil.com      ESCAPES  (tab is stripped,
 *                                                          revealing `//`)
 *
 * Exploit: send a victim `https://illuxus.com/login?next=/\evil.com`. The link
 * is genuinely on the real domain, so it survives inspection; after the victim
 * authenticates, `window.location.assign` lands them on the attacker's page,
 * which can impersonate the app to harvest credentials or a session.
 *
 * This is aggravated by `react-router` 6.30.1, which carries its own advisories
 * for open redirect via backslash in `<Link>`/`useNavigate` and for
 * protocol-relative reinterpretation (fixed in 6.30.2). Upgrading the library
 * alone would NOT close this hole, because the unsafe value originates in
 * application code.
 *
 * ## The fix
 *
 * Resolve the candidate against the current origin and compare origins. That
 * delegates to the same parser the browser will use at navigation time, so it
 * cannot drift from it — which is precisely the failure mode of a hand-rolled
 * prefix check. Control characters are rejected up front because URL parsers
 * strip tab/CR/LF, which can smuggle an authority delimiter past any
 * inspection of the raw string.
 *
 * Pure and dependency-free, so it is unit-testable — see
 * `__tests__/safe-redirect.test.ts`.
 */

/**
 * ASCII control characters. URL parsers silently strip tab (0x09), line feed
 * (0x0A) and carriage return (0x0D) *before* parsing, so `"/\t/evil.com"`
 * becomes `"//evil.com"` — a protocol-relative URL — after stripping. Rejecting
 * the whole class is cheaper and safer than trying to enumerate which ones the
 * current parser strips.
 */
// eslint-disable-next-line no-control-regex -- matching control characters IS the intent here; see above
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Validates a user-supplied redirect target and returns a same-origin,
 * path-only string safe to navigate to, or `null` when it must be rejected.
 *
 * Returns only `pathname + search + hash` — never an absolute URL — so the
 * result cannot carry an origin even if a future caller concatenates it.
 *
 * @param raw    the untrusted value, e.g. `searchParams.get("next")`. May be
 *               percent-encoded; decoded once here.
 * @param origin the origin to consider internal. Defaults to
 *               `window.location.origin`; injectable for tests and SSR.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  origin?: string,
): string | null {
  if (!raw) return null;

  // Resolve the trust anchor. With no DOM and no explicit origin there is
  // nothing to validate against, so fail closed.
  const base =
    origin ??
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : null);
  if (!base) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding. Reject rather than fall back to the raw
    // value, which would reintroduce the encoded-backslash bypass.
    return null;
  }

  // Reject control characters before any structural check — see CONTROL_CHARS.
  if (CONTROL_CHARS.test(decoded)) return null;

  // Must be a site-relative path. This is not the security boundary (the
  // origin comparison below is), but it rejects absolute and scheme-relative
  // inputs early and keeps the contract obvious.
  if (!decoded.startsWith("/")) return null;

  // Backslashes have no legitimate place in an in-app route here and are the
  // exact character the browser normalises into an authority delimiter.
  // Rejected explicitly so intent is clear at the call site, rather than
  // relying solely on the origin comparison to catch them.
  if (decoded.includes("\\")) return null;

  let resolved: URL;
  try {
    resolved = new URL(decoded, base);
  } catch {
    return null;
  }

  // THE security boundary: whatever the parser made of the input, it must
  // still point at us.
  if (resolved.origin !== new URL(base).origin) return null;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
