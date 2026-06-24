/**
 * send-communication-email — self-contained Dashboard build (SMTP transport).
 *
 * Paste THIS file's contents into the Dashboard editor for the
 * `send-communication-email` function and click Deploy. The repo version
 * splits CORS / SMTP / logger into ../_shared/* modules; this file inlines
 * them so the Dashboard editor can bundle a single source.
 *
 * Required Supabase secrets:
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       465 (SSL) or 587 (STARTTLS)
 *   SMTP_USERNAME   the SMTP login (full mailbox)
 *   SMTP_PASSWORD   Gmail App Password (16 chars), NOT the account password
 *   SMTP_FROM       optional, e.g. "Illuxus <events@yourdomain.com>"
 *
 * Request body:
 *   { communication_id: string, batch_size?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// ───── CORS ─────────────────────────────────────────────────────────────────

const DEV_ORIGINS = new Set<string>([
  "http://localhost:5173", "http://localhost:8080",
  "http://127.0.0.1:5173", "http://127.0.0.1:8080",
]);
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-correlation-id";
const stripSlash = (s: string) => s.endsWith("/") ? s.slice(0, -1) : s;

function envAllowedOrigins(): Set<string> {
  const set = new Set<string>(DEV_ORIGINS);
  for (const o of (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    set.add(stripSlash(o));
  }
  for (const host of [Deno.env.get("PUBLIC_DOMAIN") || Deno.env.get("VITE_PUBLIC_DOMAIN"),
                      Deno.env.get("PUBLIC_PUBLISHED_HOST") || Deno.env.get("VITE_PUBLIC_PUBLISHED_HOST")]) {
    if (!host) continue;
    const t = stripSlash(host).trim();
    if (!t) continue;
    set.add(t.startsWith("http") ? t : `https://${t}`);
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
  // Vercel production + preview deployments share the *.vercel.app suffix.
  // Allow any subdomain so each new branch deploy doesn't need an
  // ALLOWED_ORIGINS update.
  const isVercel = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  if (origin && (allowed.has(stripSlash(origin)) || isVercel)) {
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

// ───── SMTP helpers ─────────────────────────────────────────────────────────

interface SmtpEmailPayload {
  from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string;
}

function smtpConfigured(): boolean {
  return !!(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USERNAME") && Deno.env.get("SMTP_PASSWORD"));
}

function buildSmtpClient(): SMTPClient {
  const host = Deno.env.get("SMTP_HOST")!;
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const username = Deno.env.get("SMTP_USERNAME")!;
  const password = Deno.env.get("SMTP_PASSWORD")!;
  return new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username, password } },
  });
}

async function sendViaSmtp(payload: SmtpEmailPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: SMTPClient | null = null;
  try {
    client = buildSmtpClient();
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
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  } finally {
    if (client) { try { await client.close(); } catch { /* noop */ } }
  }
}

function defaultFromAddress(displayName = "Illuxus"): string {
  const explicit = Deno.env.get("SMTP_FROM") ?? Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("RESEND_FROM");
  const username = Deno.env.get("SMTP_USERNAME") ?? "";
  const from = explicit || username || `${displayName} <noreply@example.com>`;
  if (from.includes("<")) return from;
  return `${displayName} <${from}>`;
}

// ───── Tiny structured logger ───────────────────────────────────────────────

const fnName = "send-communication-email";
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

// ───── Plain-text → HTML helper ─────────────────────────────────────────────

function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escaped.split(/\n{2,}/).map((para) =>
    `<p>${para.replace(/\n/g, "<br>")}</p>`
  ).join("\n");
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6">${html}</body></html>`;
}

// ───── Handler ──────────────────────────────────────────────────────────────

interface RecipientRow {
  id: string;
  email: string | null;
  name: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
}

const SMTP_CHUNK_LIMIT = 50;

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Single top-level catch so any unexpected throw returns a useful error
  // body instead of a generic 500. The `step` field tells us which line
  // broke during debugging.
  let step = "init";
  try {
    step = "read-secrets";
    if (!smtpConfigured()) {
      log.error("missing secrets", {
        hasHost: !!Deno.env.get("SMTP_HOST"),
        hasUser: !!Deno.env.get("SMTP_USERNAME"),
        hasPass: !!Deno.env.get("SMTP_PASSWORD"),
      });
      return json({
        error: "SMTP not configured: set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD secrets first.",
        step,
      }, 500);
    }
    const from = defaultFromAddress();

    step = "parse-body";
    const body = await req.json() as { communication_id?: string; batch_size?: number };
    const communication_id = body.communication_id;
    if (!communication_id) {
      return json({ error: "communication_id is required", step }, 400);
    }
    const limit = Math.min(Math.max(1, body.batch_size ?? SMTP_CHUNK_LIMIT), SMTP_CHUNK_LIMIT);

    step = "create-client";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      log.error("missing supabase env", { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
      return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing", step }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    step = "read-pending-rows";
    const { data: rowsRaw, error: rowsErr } = await supabase
      .from("communication_recipients")
      .select("id, email, name, rendered_subject, rendered_body")
      .eq("communication_id", communication_id)
      .eq("email_status", "pending")
      .not("email", "is", null)
      .limit(limit);

    if (rowsErr) {
      log.error("read-pending-rows failed", { error_message: rowsErr.message, error_code: rowsErr.code });
      return json({ error: `Read recipients failed: ${rowsErr.message}`, step }, 500);
    }
    const rows = (rowsRaw ?? []) as RecipientRow[];
    log.info("read-pending-rows", { count: rows.length, communication_id });

    if (rows.length === 0) {
      // Best-effort: refresh parent counts even when nothing was sent.
      await supabase.rpc(
        "communications_recompute_email_counts" as never,
        { _communication_id: communication_id } as never,
      );
      return json({ sent: 0, failed: 0, remaining: 0, errors: [] });
    }

    step = "mark-sending";
    const ids = rows.map((r) => r.id);
    const { error: markErr } = await supabase
      .from("communication_recipients")
      .update({ email_status: "sending" })
      .in("id", ids);
    if (markErr) {
      log.error("mark-sending failed", { error_message: markErr.message, error_code: markErr.code });
      return json({ error: `Mark sending failed: ${markErr.message}`, step }, 500);
    }

    step = "smtp-send-loop";
    // SMTP relays don't support batch sends — open one session per recipient.
    // For Gmail this is fine up to a few hundred per minute; if higher
    // throughput is needed, swap the transport for SES / SendGrid.
    let sent = 0;
    let failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const to = (row.email || "").trim().toLowerCase();
      if (!to) {
        await supabase
          .from("communication_recipients")
          .update({ email_status: "failed", error_message: "Recipient has no email" })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: "Recipient has no email" });
        continue;
      }
      const subject  = row.rendered_subject ?? "";
      const bodyText = row.rendered_body ?? "";
      const result = await sendViaSmtp({
        from,
        to: [to],
        subject,
        html: textToHtml(bodyText),
        text: bodyText,
      });
      if (result.ok) {
        await supabase
          .from("communication_recipients")
          .update({ email_status: "sent", email_sent_at: now })
          .eq("id", row.id);
        sent += 1;
      } else {
        log.error("smtp send failed", { recipient_id: row.id, error_message: result.error });
        await supabase
          .from("communication_recipients")
          .update({ email_status: "failed", error_message: result.error.slice(0, 500) })
          .eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error });
      }
    }

    step = "recompute-counts";
    await supabase.rpc(
      "communications_recompute_email_counts" as never,
      { _communication_id: communication_id } as never,
    );

    step = "count-remaining";
    const { count: remaining } = await supabase
      .from("communication_recipients")
      .select("id", { count: "exact", head: true })
      .eq("communication_id", communication_id)
      .eq("email_status", "pending");

    return json({ sent, failed, remaining: remaining ?? 0, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error("unhandled error", { step, error_message: msg, error_stack: stack });
    return json({ error: msg, step }, 500);
  }
});
