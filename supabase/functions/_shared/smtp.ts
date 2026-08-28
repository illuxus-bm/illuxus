/**
 * Shared SMTP transport for Supabase edge functions.
 *
 * Designed as a 1-for-1 replacement for `sendViaResend(...)` so the callers
 * don't need to know which transport is in use. The same payload shape
 * (`from`, `to`, `subject`, `html`, `text`, optional `reply_to`) goes in,
 * the same `{ ok, error? }` discriminated union comes out.
 *
 * ── Why SMTP ─────────────────────────────────────────────────────────────
 * Switching from Resend to a generic SMTP relay (Gmail, SES, Mailgun, ...)
 * lets the platform run on whatever email pipeline the operator already
 * trusts, and removes the Resend API dependency for organisers who want
 * full control over delivery.
 *
 * ── Required Supabase secrets ────────────────────────────────────────────
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       465 (SSL) or 587 (STARTTLS). Default 465.
 *   SMTP_USERNAME   the SMTP login — usually the full mailbox address
 *   SMTP_PASSWORD   for Gmail, a 16-char *App Password* (NOT the account
 *                   password). Generate at https://myaccount.google.com/apppasswords
 *                   after enabling 2-Step Verification.
 *   SMTP_FROM       optional. e.g. "Illuxus <noreply@yourdomain.com>". When
 *                   unset, defaults to SMTP_USERNAME. Gmail in particular
 *                   rewrites the From address to the authenticated user, so
 *                   you can only set a display name, not a different mailbox.
 *
 * ── Gmail caveats (read these) ───────────────────────────────────────────
 *   • Free Gmail accounts cap at ~500 outbound emails / day. Google
 *     Workspace caps at 2000 / day. For higher volume use a Workspace
 *     account or switch to a dedicated relay (SES, Postmark, SendGrid).
 *   • The From mailbox must match SMTP_USERNAME. You CAN customise the
 *     display name (e.g. "Illuxus <events@yourgmail.com>") but you CANNOT
 *     spoof a different domain — Gmail rewrites it before delivery.
 *   • If you see `534-5.7.9 Application-specific password required`, you
 *     pasted the regular Gmail password. Generate an App Password instead.
 *   • For very small volumes, you can also use Gmail's smtp-relay.gmail.com
 *     on port 587 with `SMTP_HOST=smtp-relay.gmail.com` — same auth, but
 *     intended for transactional mail from apps you own.
 */

// denomailer is the most maintained SMTP client for Deno. Pinned to a
// minor so an upstream breaking change can't silently brick deployments.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Retry decision logic lives in a Deno-free module so it can be unit-tested
// with vitest — this file's remote URL import makes it unloadable by Node.
// See `smtp-retry.ts` and `__tests__/smtp-retry.test.ts`.
import { backoffDelayMs, isRetryableSmtpError } from "./smtp-retry.ts";

export interface SmtpEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

/**
 * Build an SMTPClient from env. Throws when required secrets are missing
 * so the caller can return a deterministic 500 instead of timing out.
 */
function buildClient(): SMTPClient {
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const username = Deno.env.get("SMTP_USERNAME");
  const password = Deno.env.get("SMTP_PASSWORD");

  if (!host || !username || !password) {
    throw new Error("SMTP not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD in Supabase secrets.");
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`SMTP_PORT must be a positive number (got ${Deno.env.get("SMTP_PORT")}).`);
  }

  return new SMTPClient({
    connection: {
      hostname: host,
      port,
      // 465 → implicit TLS (SMTPS). 587 / 25 → opportunistic STARTTLS.
      // denomailer reads `tls` to decide; for STARTTLS we leave it off so
      // the client upgrades cleanly after EHLO.
      tls: port === 465,
      auth: { username, password },
    },
  });
}

/**
 * Pick a default `From` address from env. Mirrors the Resend helper's
 * fallback chain so existing code paths stay intact.
 *
 *   1. SMTP_FROM           — full "Name <addr@host>" or bare addr@host
 *   2. RESEND_FROM_EMAIL   — kept for backwards compat with older deploys
 *   3. RESEND_FROM         — short alias used by send-communication-email
 *   4. SMTP_USERNAME       — last-resort fallback so we never blank the From
 */
export function defaultFromAddress(displayName = "Illuxus"): string {
  const explicit =
    Deno.env.get("SMTP_FROM") ??
    Deno.env.get("RESEND_FROM_EMAIL") ??
    Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || `${displayName} <noreply@example.com>`;
  if (from.includes("<")) return from;
  return `${displayName} <${from}>`;
}

// ── Retry policy ────────────────────────────────────────────────────────────
//
// Sends used to be a single attempt: one transient blip (connection reset, a
// relay's momentary 421, a DNS hiccup) permanently marked the recipient
// `failed` in `communication_recipients.email_status`, and nothing ever
// retried it. For a 500-recipient campaign that quietly loses real mail.
//
// Budget is deliberately small. `send-communication-email` loops over a batch
// within ONE edge-function invocation, which has a wall-clock limit, so the
// worst case has to stay bounded: 3 attempts with ~200ms and ~400ms waits adds
// at most ~600ms plus jitter per recipient, and only for recipients that
// actually fail transiently.
const SMTP_MAX_ATTEMPTS = (() => {
  const raw = Number(Deno.env.get("SMTP_MAX_ATTEMPTS"));
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 5) : 3;
})();

const SMTP_RETRY_BASE_MS = (() => {
  const raw = Number(Deno.env.get("SMTP_RETRY_BASE_MS"));
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 2_000) : 200;
})();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Send a single email via SMTP, retrying transient failures.
 *
 * A fresh client is built per attempt and closed in `finally`. That matters:
 * denomailer's client holds a socket, and after a connection-level error the
 * socket is unusable, so reusing it across attempts would fail identically
 * every time. Building fresh also re-resolves DNS, which is what makes a
 * retry useful after an `EAI_AGAIN`.
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, error }` with a
 * single-line message. On exhaustion the message is prefixed with the attempt
 * count so operators can distinguish "failed once, permanently" from "failed
 * repeatedly, transiently" in the logs.
 */
export async function sendViaSmtp(
  payload: SmtpEmailPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastError = "unknown SMTP failure";

  for (let attempt = 1; attempt <= SMTP_MAX_ATTEMPTS; attempt++) {
    let client: SMTPClient | null = null;
    try {
      client = buildClient();
      await client.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        content: payload.text,
        html: payload.html,
        ...(payload.reply_to ? { replyTo: payload.reply_to } : {}),
      });
      return { ok: true };
    } catch (err) {
      lastError = (err instanceof Error ? err.message : String(err)).slice(0, 500);

      const retryable = isRetryableSmtpError(lastError);
      const hasAttemptsLeft = attempt < SMTP_MAX_ATTEMPTS;
      if (!retryable || !hasAttemptsLeft) {
        return {
          ok: false,
          error: attempt > 1 ? `${lastError} (after ${attempt} attempts)` : lastError,
        };
      }
    } finally {
      // denomailer requires explicit close — leaking the socket can cause
      // subsequent invocations to hang while waiting for a connection slot.
      if (client) {
        try { await client.close(); } catch { /* noop */ }
      }
    }

    await sleep(backoffDelayMs(attempt, SMTP_RETRY_BASE_MS));
  }

  return { ok: false, error: `${lastError} (after ${SMTP_MAX_ATTEMPTS} attempts)` };
}

/**
 * Quick check: are the bare-minimum SMTP secrets present? Useful for the
 * "console fallback" branch in callers that want a friendlier 500 message
 * before they try to open a connection.
 */
export function smtpConfigured(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

/** Re-exported helper so callers can keep using the same import path. */
export { textToHtml } from "./resend.ts";
