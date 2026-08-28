/**
 * Regression tests for `isRetryableSmtpError` — the classifier that decides
 * whether a failed SMTP send gets another attempt.
 *
 * Why this is worth testing directly: the function is small but both of its
 * failure modes are expensive and silent.
 *
 *   - Misclassifying a PERMANENT error as retryable makes every hard bounce
 *     cost 3x the time budget inside a batch that runs in a single
 *     edge-function invocation with a wall-clock limit, and repeatedly
 *     retrying a 550 damages sender reputation with the relay.
 *   - Misclassifying a TRANSIENT error as permanent silently loses real mail.
 *     That is the bug the retry logic was added to fix: before it, one
 *     connection reset marked a recipient `failed` forever with no retry.
 *
 * Neither failure surfaces as an exception or a test failure elsewhere, so
 * the classification rules are pinned here.
 *
 * `isRetryableSmtpError` is pure and takes a string, so it is testable
 * without Deno, a socket, or a relay.
 */

import { describe, it, expect } from "vitest";

import { backoffDelayMs, isRetryableSmtpError } from "../smtp-retry";

describe("isRetryableSmtpError — transient (must retry)", () => {
  // RFC 5321 4yz: transient negative completion. The relay is explicitly
  // telling us to come back later.
  it.each([
    ["421 Service not available, closing transmission channel", "421 shutdown"],
    ["450 Requested mail action not taken: mailbox unavailable", "450 busy mailbox"],
    ["451 Requested action aborted: local error in processing", "451 local error"],
    ["452 Requested action not taken: insufficient system storage", "452 out of storage"],
    ["454 TLS not available due to temporary reason", "454 temp TLS"],
    ["421-4.7.0 Try again later, closing connection", "Gmail deferral"],
  ])("retries %s (%s)", (message) => {
    expect(isRetryableSmtpError(message)).toBe(true);
  });

  // Transport-level failures. No SMTP conversation completed, so nothing was
  // delivered and re-sending cannot duplicate mail.
  it.each([
    ["read ECONNRESET", "peer reset the socket"],
    ["connect ECONNREFUSED 10.0.0.1:587", "relay refused — :587 must not read as a 5xx code"],
    ["connect ECONNREFUSED smtp.example.com:465", "relay refused — :465 must not read as a 4xx code"],
    ["connect ETIMEDOUT", "connect timeout"],
    ["getaddrinfo ENOTFOUND smtp.example.com", "DNS miss"],
    ["getaddrinfo EAI_AGAIN smtp.example.com", "transient DNS — the case a fresh client re-resolves"],
    ["write EPIPE", "broken pipe"],
    ["Connection closed unexpectedly", "abrupt close"],
    ["socket hang up", "socket failure"],
    ["TLS handshake failed", "TLS negotiation"],
    ["Operation timed out", "generic timeout"],
  ])("retries %s (%s)", (message) => {
    expect(isRetryableSmtpError(message)).toBe(true);
  });
});

describe("isRetryableSmtpError — permanent (must NOT retry)", () => {
  // RFC 5321 5yz: permanent negative completion. Retrying cannot help.
  it.each([
    ["550 5.1.1 The email account does not exist", "unknown mailbox"],
    ["551 User not local", "not local"],
    ["552 Requested mail action aborted: exceeded storage allocation", "over quota"],
    ["553 Requested action not taken: mailbox name not allowed", "bad mailbox name"],
    ["554 5.7.1 Message rejected as spam", "rejected as spam"],
    ["500 Syntax error, command unrecognized", "protocol error"],
  ])("does not retry %s (%s)", (message) => {
    expect(isRetryableSmtpError(message)).toBe(false);
  });

  // Auth / configuration. Deterministic — a wrong password is wrong on every
  // attempt, so retrying only delays the operator seeing the real problem.
  it.each([
    ["535-5.7.8 Username and Password not accepted", "bad credentials"],
    ["534-5.7.9 Application-specific password required", "Gmail app password"],
    ["530 5.7.0 Must issue a STARTTLS command first", "TLS policy"],
    ["538 Encryption required for requested authentication mechanism", "encryption required"],
    ["Authentication failed", "generic auth failure"],
    ["SMTP not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD", "missing secrets"],
  ])("does not retry %s (%s)", (message) => {
    expect(isRetryableSmtpError(message)).toBe(false);
  });

  it("does not retry an unrecognised error", () => {
    // Fail-fast default. An unknown message must not silently triple the cost
    // of every send in a batch.
    expect(isRetryableSmtpError("something entirely unexpected happened")).toBe(false);
    expect(isRetryableSmtpError("")).toBe(false);
  });
});

describe("isRetryableSmtpError — precedence", () => {
  it("treats an auth failure carrying a 4xx code as permanent", () => {
    // This is why the auth check runs BEFORE the generic 4yz rule. Some
    // relays report credential problems with a transient-looking code; the
    // generic rule alone would retry a wrong password three times.
    expect(isRetryableSmtpError("454 4.7.0 Temporary authentication failure")).toBe(false);
    expect(isRetryableSmtpError("421 Authentication required")).toBe(false);
  });

  it("treats a permanent 5xx as permanent even when it mentions a socket", () => {
    // The 5xx rule must win over the transport-level keyword list, otherwise
    // "550 ... socket" would be misread as a connection error and retried.
    expect(isRetryableSmtpError("550 rejected; closing socket")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isRetryableSmtpError("READ ECONNRESET")).toBe(true);
    expect(isRetryableSmtpError("Authentication Failed")).toBe(false);
  });

  it("does not mistake a port number for an SMTP reply code", () => {
    // Regression: a naive \b5\d\d\b matched the PORT in
    // "connect ECONNREFUSED 10.0.0.1:587", classifying a transient
    // connection-refused error as a permanent 5xx. Mail was silently dropped
    // instead of retried, and :587/:465 are the two standard SMTP ports so
    // this hit the common case.
    expect(isRetryableSmtpError("connect ECONNREFUSED 10.0.0.1:587")).toBe(true);
    expect(isRetryableSmtpError("connect ETIMEDOUT 192.168.1.1:465")).toBe(true);
    expect(isRetryableSmtpError("socket hang up on relay:534")).toBe(true);
  });

  it("does not mistake an enhanced status code for a second reply code", () => {
    // "550 5.1.1 ..." carries both a reply code and a dotted enhanced status.
    // Only the leading 550 should drive the decision.
    expect(isRetryableSmtpError("550 5.1.1 no such user")).toBe(false);
    expect(isRetryableSmtpError("450 4.2.1 mailbox busy")).toBe(true);
  });
});

describe("backoffDelayMs", () => {
  // `random` is injected so these are exact equalities rather than range
  // checks — a range assertion would still pass if the exponential term were
  // dropped entirely.
  const noJitter = () => 0;
  const fullJitter = () => 1;

  it("grows exponentially from the base delay", () => {
    expect(backoffDelayMs(1, 200, noJitter)).toBe(200); // 200 * 2^0
    expect(backoffDelayMs(2, 200, noJitter)).toBe(400); // 200 * 2^1
    expect(backoffDelayMs(3, 200, noJitter)).toBe(800); // 200 * 2^2
  });

  it("adds at most one base interval of jitter", () => {
    expect(backoffDelayMs(1, 200, fullJitter)).toBe(400); // 200 + 200
    expect(backoffDelayMs(2, 200, fullJitter)).toBe(600); // 400 + 200
  });

  it("keeps the real jittered delay inside its expected window", () => {
    // With genuine Math.random, attempt 2 at base 200 must land in [400, 600).
    for (let i = 0; i < 50; i++) {
      const d = backoffDelayMs(2, 200);
      expect(d).toBeGreaterThanOrEqual(400);
      expect(d).toBeLessThan(600);
    }
  });

  it("clamps at 5s so a slow relay cannot eat the invocation budget", () => {
    // An edge function has a wall-clock limit and `send-communication-email`
    // loops a batch inside ONE invocation, so unbounded growth would starve
    // later recipients.
    expect(backoffDelayMs(20, 1_000, fullJitter)).toBe(5_000);
    expect(backoffDelayMs(99, 2_000, noJitter)).toBe(5_000);
  });

  it("treats attempt numbers below 1 as the first attempt", () => {
    // Defensive: a 0 or negative attempt must not produce a fractional or
    // negative delay, which would make the retry loop spin.
    expect(backoffDelayMs(0, 200, noJitter)).toBe(200);
    expect(backoffDelayMs(-5, 200, noJitter)).toBe(200);
  });
});
