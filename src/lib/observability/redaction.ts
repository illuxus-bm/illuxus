// Pure recursive PII-redaction routine for the Observability Foundation.
//
// Strips emails, JWTs, and E.164 phone numbers from string values, and
// collapses the value of any deny-listed key (case-insensitive substring
// match) to the literal string `'[redacted]'` regardless of value type.
// Bounds recursion at depth 6 with `'[truncated]'` and replaces cycles
// (or DAG re-encounters) with `'[circular]'`. Designed so the Logger
// can call it on every record before fan-out without any mutation of
// the input value.
//
// Source of truth: design.md "Redaction" section.
// Validates: requirements 3.1-3.9, 4.3, 8.7, 10.5, 11.2.

/** Hard recursion cap. Values nested beyond this are returned as `'[truncated]'`. */
const MAX_DEPTH = 6;

/** Email pattern. Loose RFC 5322 (local + domain + 2-char tld). */
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;

/** JWT pattern. Header starts with `eyJ` (base64 of `{"`) followed by two more base64url segments. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/**
 * E.164-shaped phone number. Optional leading `+`, then 7 to 17 digits with
 * spaces / dashes / parens / dots as separators. Negative lookarounds prevent
 * eating into surrounding digit runs (so a 20-digit ID is not mis-detected as
 * a phone).
 */
const PHONE_RE = /(?<!\d)\+?\d[\d\s().-]{6,18}\d(?!\d)/g;

/**
 * The exact regex set the Logger uses to scrub PII from string values.
 *
 * Exposed as a frozen object so tests can reference the same patterns the
 * implementation walks (rather than re-deriving regexes from prose) and so
 * documentation generators can surface the active redaction policy.
 */
export const REDACTION_REGEX: Readonly<{
  email: RegExp;
  jwt: RegExp;
  phone: RegExp;
}> = Object.freeze({
  email: EMAIL_RE,
  jwt: JWT_RE,
  phone: PHONE_RE,
});

/**
 * Deny-listed key fragments. A field whose key contains any of these
 * substrings (case-insensitive) has its value replaced with the literal
 * string `'[redacted]'` regardless of value type.
 *
 * Order is irrelevant — we test each fragment with `String.prototype.includes`.
 */
const DENY_KEY_FRAGMENTS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'p_token',
  'p_password',
];

function isDenyListedKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (let i = 0; i < DENY_KEY_FRAGMENTS.length; i++) {
    if (lower.includes(DENY_KEY_FRAGMENTS[i])) return true;
  }
  return false;
}

/**
 * Substitute every email / JWT / E.164 phone substring inside `s`.
 *
 * The three patterns do not collide on the shape of one another's
 * replacements (each replacement contains square brackets and a hyphen,
 * which are forbidden by every other pattern's character class), so a
 * single pass per pattern suffices and order between them is irrelevant.
 */
function redactString(s: string): string {
  return s
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(JWT_RE, '[redacted-token]')
    .replace(PHONE_RE, '[redacted-phone]');
}

/**
 * Pure recursive redactor. Walks `value` up to depth {@link MAX_DEPTH},
 * replacing depth overflows with `'[truncated]'` and any object/array
 * already encountered earlier in the same walk with `'[circular]'`.
 *
 * Behaviour, in order of test:
 *   1. `depth > 6` → return `'[truncated]'`
 *   2. string → email/JWT/phone substring substitution
 *   3. number / boolean / bigint / symbol / null / undefined → returned unchanged
 *   4. cycle / DAG re-encounter → `'[circular]'`
 *   5. `Error` instance → `{ name, message: redact(message), stack: redact(stack) }`
 *   6. `Array` → element-wise recursion at `depth + 1`
 *   7. plain object → walk own enumerable string keys; deny-listed keys
 *      collapse to `'[redacted]'`, other keys recurse on their value at
 *      `depth + 1`
 *
 * Must remain pure — no mutation of the input, no I/O, no globals beyond
 * the regex constants above.
 *
 * @param value Any input.
 * @param depth Current recursion depth; callers SHOULD omit (defaults to 0).
 * @param seen  Cycle-detection set; callers SHOULD omit.
 */
export function redact(
  value: unknown,
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  // 1. Depth cap. Bounds worst-case work at O(n) for a tree of n nodes
  //    within depth 6, regardless of total input size.
  if (depth > MAX_DEPTH) return '[truncated]';

  // 2. Strings: redact in place by pattern substitution.
  if (typeof value === 'string') {
    return redactString(value);
  }

  // 3. Other primitives pass through unchanged.
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol') {
    return value;
  }

  // From here on `value` is an object of some kind (object, array,
  // Error, function, …). Cycle / DAG re-encounter detection.
  const obj = value as object;
  if (seen.has(obj)) return '[circular]';
  seen.add(obj);

  // 5. Errors: preserve `name` and recurse on `message` / `stack` as strings.
  if (value instanceof Error) {
    const message = typeof value.message === 'string' ? value.message : '';
    const stack = typeof value.stack === 'string' ? value.stack : '';
    return {
      name: value.name,
      message: redactString(message),
      stack: redactString(stack),
    };
  }

  // 6. Arrays: element-wise recursion.
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = redact(value[i], depth + 1, seen);
    }
    return out;
  }

  // 7. Plain objects (including Object.create(null)). We walk only own
  //    enumerable string keys to avoid leaking inherited or symbol-keyed
  //    data into the redacted output. Non-plain objects (functions,
  //    Map, Set, …) fall into this branch and produce `{}` because
  //    `Object.keys` does not enumerate their internal slots — a safe
  //    no-leak default for inputs we do not explicitly model.
  const out: Record<string, unknown> = {};
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (isDenyListedKey(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redact(source[key], depth + 1, seen);
  }
  return out;
}

/**
 * `redact()` wrapped in a try/catch. Used by the Logger as the only
 * call site of redaction so that a malformed input (a throwing getter,
 * a `Proxy` whose `ownKeys` trap throws, a bigint serialization
 * failure, etc.) cannot turn a log emit into a thrown exception.
 *
 * On a throw, returns a sanitized envelope `{ redaction_error: true,
 * message }` so the Logger can still emit a meaningful warn record.
 * `message` carries the original input only when it was already a
 * string; for every other input shape `message` is the empty string,
 * so callers can rely on the field's presence and type.
 *
 * Validates: REQ 4.3 (redaction failure surfaces a `redaction_error`
 * record without throwing).
 */
export function safeRedact(value: unknown): unknown {
  try {
    return redact(value);
  } catch {
    return {
      redaction_error: true,
      message: typeof value === 'string' ? value : '',
    };
  }
}
