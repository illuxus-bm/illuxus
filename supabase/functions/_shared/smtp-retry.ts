/**
 * Pure retry policy for the SMTP transport.
 *
 * ## Why this is a separate module
 *
 * `smtp.ts` imports `denomailer` from `https://deno.land/x/...`. A remote URL
 * import is fine under Deno but unresolvable by Node, so anything importing
 * `smtp.ts` cannot be unit-tested with vitest. Keeping the decision logic here
 * — with zero imports and no Deno globals — makes it testable, which matters
 * because both misclassification directions are silent and expensive:
 *
 *   - Treating a PERMANENT failure as retryable makes every hard bounce cost
 *     3x the time budget inside a batch that runs in one edge-function
 *     invocation under a wall-clock limit, and hammering a 550 damages sender
 *     reputation with the relay.
 *   - Treating a TRANSIENT failure as permanent silently loses real mail.
 *     That was the original bug: a single connection reset marked a recipient
 *     `failed` in `communication_recipients.email_status` forever, with no
 *     retry and no log.
 *
 * This mirrors how the project already separates pure logic from side effects
 * (see `src/lib/attendance/applyAttendance.ts`, a pure port of a SQL helper
 * covered by property tests).
 *
 * Tested by `__tests__/smtp-retry.test.ts`.
 */

/**
 * Decides whether a failed send is worth another attempt, from the error
 * message alone.
 *
 * Classification, in precedence order:
 *   1. Auth / configuration failures — never retried. Deterministic: a wrong
 *      `SMTP_PASSWORD` will still be wrong on attempt three. Checked FIRST
 *      because some relays report credential problems with a transient-looking
 *      4xx code, which rule 3 would otherwise treat as retryable.
 *   2. SMTP 5yz permanent negative replies — never retried. Placed before the
 *      transport keywords so "550 rejected; closing socket" is not misread as
 *      a socket error.
 *   3. SMTP 4yz transient negative replies — retried. The relay is explicitly
 *      asking us to come back later.
 *   4. Socket / DNS / TLS errors, which carry no SMTP code — retried. No SMTP
 *      conversation completed, so nothing was delivered and a retry cannot
 *      duplicate mail.
 *   5. Anything unrecognised — NOT retried, so a novel permanent error cannot
 *      silently triple the cost of every send.
 */
/**
 * Matches a 3-digit SMTP reply code beginning with `first`, while refusing to
 * match digits embedded in an address or a dotted status code.
 *
 * A naive `\b5\d\d\b` is wrong: in `connect ECONNREFUSED 10.0.0.1:587` the
 * PORT matches, so a connection-refused error — which is transient and should
 * be retried — gets classified as a permanent 5xx and the mail is dropped.
 * `:587` and `:465` are the two most common SMTP ports, so this was not a
 * theoretical edge case.
 *
 * The lookarounds require the code to stand alone:
 *   - `(?<![\d.:])` rejects a preceding digit, dot, or colon, which is what
 *     excludes `:587` (port) and `10.0.0.1` (address octets).
 *   - `(?![\d.])` rejects a following digit or dot, which excludes the
 *     enhanced status codes in replies like `550 5.1.1 ...` (the `5.1.1` must
 *     not be read as a second reply code).
 */
function hasReplyCode(message: string, first: "4" | "5"): boolean {
  return new RegExp(`(?<![\\d.:])${first}\\d\\d(?![\\d.])`).test(message);
}

export function isRetryableSmtpError(message: string): boolean {
  const m = message.toLowerCase();

  // 1. Auth / config — permanent.
  if (
    /(?<![\d.:])(535|534|530|538)(?![\d.])/.test(m) ||
    m.includes("authentication") ||
    m.includes("auth failed") ||
    m.includes("application-specific password") ||
    m.includes("username and password not accepted") ||
    m.includes("not configured")
  ) {
    return false;
  }

  // 2. Permanent negative completion (RFC 5321 §4.2.1: 5yz).
  if (hasReplyCode(m, "5")) return false;

  // 3. Transient negative completion (4yz).
  if (hasReplyCode(m, "4")) return true;

  // 4. Transport-level.
  if (
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("ehostunreach") ||
    m.includes("enetunreach") ||
    m.includes("enotfound") ||
    m.includes("eai_again") ||
    m.includes("epipe") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("connection closed") ||
    m.includes("connection reset") ||
    m.includes("socket") ||
    m.includes("tls") ||
    m.includes("handshake")
  ) {
    return true;
  }

  // 5. Unknown — fail fast.
  return false;
}

/**
 * Exponential backoff with additive jitter, clamped.
 *
 * `attempt` is 1-based, so the first retry waits roughly `baseMs`.
 *
 * Jitter is what stops a batch of recipients that all hit the same transient
 * relay failure from reconnecting in lockstep and re-triggering it. The clamp
 * keeps a slow relay from consuming the invocation's whole wall-clock budget.
 *
 * Pure and deterministic given `random`, which is injectable so tests can pin
 * the value instead of tolerating a range.
 */
export function backoffDelayMs(
  attempt: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exponential = baseMs * Math.pow(2, safeAttempt - 1);
  const jitter = random() * baseMs;
  return Math.min(exponential + jitter, 5_000);
}
