/**
 * send-event-email — self-contained Dashboard build.
 *
 * The repo version splits CORS / Resend / logger into ../_shared/* modules,
 * but the Supabase Dashboard editor only deploys this single file, so we
 * inline the helpers here. Paste the contents of THIS file into the
 * Dashboard "Edit function" view for `send-event-email` and click Deploy.
 *
 * Required Supabase secrets:
 *   RESEND_API_KEY     — from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL  — e.g. "Illuxus <noreply@eliteform.in>"
 *
 * Optional:
 *   ALLOWED_ORIGINS    — comma-separated extra origins for CORS allowlist
 *   PUBLIC_DOMAIN / VITE_PUBLIC_DOMAIN
 *   PUBLIC_PUBLISHED_HOST / VITE_PUBLIC_PUBLISHED_HOST
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ────────────────────────────────────────────────────────────────────────────
// CORS helpers (inlined from ../_shared/cors.ts)
// ────────────────────────────────────────────────────────────────────────────

const DEV_ORIGINS = new Set<string>([
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
]);

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-correlation-id";

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function envAllowedOrigins(): Set<string> {
  const set = new Set<string>(DEV_ORIGINS);
  const fromSecret = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of fromSecret) set.add(stripTrailingSlash(o));
  const publicDomain = Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN");
  const publishedHost = Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST");
  for (const host of [publicDomain, publishedHost]) {
    if (!host) continue;
    const trimmed = stripTrailingSlash(host).trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) set.add(trimmed);
    else set.add(`https://${trimmed}`);
  }
  return set;
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin") ?? "";
  const allowed = envAllowedOrigins();
  if (origin && allowed.has(stripTrailingSlash(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    headers["Access-Control-Allow-Origin"] = "null";
  }
  return headers;
}

function handlePreflight(req: Request, cors: Record<string, string>): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: cors });
}

// ────────────────────────────────────────────────────────────────────────────
// Resend helpers (inlined from ../_shared/resend.ts)
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string, footer?: string): string {
  const footerHtml = footer ?? "You received this email because you are registered for an event on Illuxus.";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 40px auto; padding: 0 24px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb;
              font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>
    <div class="footer">${escapeHtml(footerHtml)}</div>
  </div>
</body>
</html>`;
}

interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
}

async function sendViaResend(
  apiKey: string,
  payload: ResendEmailPayload,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `${res.status} ${errText.slice(0, 500)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id };
}

function defaultFromAddress(displayName = "Illuxus"): string {
  // Accept either secret name. `RESEND_FROM_EMAIL` is the original; `RESEND_FROM`
  // is the shorter alias already used elsewhere in the project (see
  // send-communication-email). Whichever you set in Supabase secrets is fine.
  const from =
    Deno.env.get("RESEND_FROM_EMAIL") ??
    Deno.env.get("RESEND_FROM") ??
    "Illuxus <onboarding@resend.dev>";
  if (from.includes("<")) return from;
  return `${displayName} <${from}>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Tiny structured logger (inlined from ../_shared/edge-logger.ts, trimmed)
// ────────────────────────────────────────────────────────────────────────────

const fnName = "send-event-email";
function emit(level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, fn: fnName, msg, ...(fields ?? {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
const log = {
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
function toErrorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error_name: err.name, error_message: err.message, error_stack: err.stack };
  return { error_message: String(err) };
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { event_id, email_id, subject, body: emailBody, recipient_emails } =
      (await req.json()) as {
        event_id: string;
        email_id: string;
        subject: string;
        body: string;
        recipient_emails: string[];
      };

    if (!event_id || !email_id || !subject || !emailBody) {
      return json({ error: "Missing required fields: event_id, email_id, subject, body" }, 400);
    }
    if (!Array.isArray(recipient_emails) || recipient_emails.length === 0) {
      return json({ error: "recipient_emails must be a non-empty array" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const isSystem = event_id === "support" || event_id === "invite";

    if (!isSystem) {
      const { data: emailRecord, error: fetchErr } = await supabase
        .from("event_emails")
        .select("id, status")
        .eq("id", email_id)
        .eq("event_id", event_id)
        .maybeSingle();

      if (fetchErr || !emailRecord) {
        return json({ error: "Email record not found or access denied" }, 403);
      }
    }

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("domain_configured, send_ticket_emails, send_approval_emails")
      .eq("singleton", true)
      .maybeSingle();

    if (!emailSettings?.domain_configured) {
      log.warn("domain not configured", { hint: "verify your domain in Resend first" });
    }

    let fromName = "Illuxus";
    let replyTo: string | undefined;

    if (!isSystem) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("title, org_id")
        .eq("id", event_id)
        .maybeSingle();

      fromName = eventRow?.title ?? fromName;

      if (eventRow?.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name, billing_email")
          .eq("id", eventRow.org_id)
          .maybeSingle();
        if (org?.name) fromName = org.name;
        if (org?.billing_email) replyTo = org.billing_email;
      }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const from = defaultFromAddress(fromName);
    const htmlContent = textToHtml(emailBody);
    const normalizedRecipients = [
      ...new Set(recipient_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    ];

    if (!resendApiKey) {
      log.info("not delivered — no API key", {
        subject,
        recipient_count: normalizedRecipients.length,
        recipient_excerpt: normalizedRecipients.slice(0, 5),
      });

      if (!isSystem) {
        await supabase
          .from("event_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", email_id);
      }

      return json({
        success: true,
        sent: normalizedRecipients.length,
        failed: 0,
        provider: "console",
        note: "RESEND_API_KEY not set — email logged only. Add the secret in Supabase Dashboard → Edge Functions → Secrets.",
      });
    }

    const BATCH_SIZE = 50;
    const failures: string[] = [];

    for (let i = 0; i < normalizedRecipients.length; i += BATCH_SIZE) {
      const batch = normalizedRecipients.slice(i, i + BATCH_SIZE);
      const result = await sendViaResend(resendApiKey, {
        from,
        to: batch,
        subject,
        html: htmlContent,
        text: emailBody,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });

      if (!result.ok) {
        log.error("resend batch failed", {
          batch_index: i / BATCH_SIZE + 1,
          error_message: result.error,
        });
        failures.push(...batch);
      }
    }

    if (failures.length > 0 && failures.length === normalizedRecipients.length) {
      if (!isSystem) {
        await supabase
          .from("event_emails")
          .update({ status: "draft", sent_at: null })
          .eq("id", email_id);
      }
      return json(
        {
          error:
            "All email batches failed. Check RESEND_API_KEY and domain verification in Resend.",
          failed_count: failures.length,
        },
        500,
      );
    }

    if (!isSystem) {
      await supabase
        .from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", email_id);
    }

    return json({
      success: true,
      sent: normalizedRecipients.length - failures.length,
      failed: failures.length,
      provider: "resend",
    });
  } catch (err) {
    log.error("unexpected error", toErrorFields(err));
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
