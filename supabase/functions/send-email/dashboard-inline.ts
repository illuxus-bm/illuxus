/**
 * send-email — self-contained Dashboard build (SMTP transport).
 *
 * Paste the contents of THIS file into the Dashboard editor for the
 * `send-email` function and click Deploy. The repo version splits CORS /
 * SMTP into ../_shared/* modules; this file inlines them.
 *
 * Required Supabase secrets:
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       465 (SSL) or 587 (STARTTLS)
 *   SMTP_USERNAME   the SMTP login (full mailbox)
 *   SMTP_PASSWORD   Gmail App Password — NOT the account password
 *   SMTP_FROM       optional, e.g. "Illuxus <noreply@yourdomain.com>"
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;padding:0 24px">
    <p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>
  </div></body></html>`;
}

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

// ───── Handler ──────────────────────────────────────────────────────────────

interface RecipientRow {
  id: string;
  email: string | null;
  name: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  email_status: string | null;
  email_sent_at: string | null;
}

interface CommunicationRow {
  id: string; org_id: string; event_id: string | null; community_id: string | null;
  subject: string; body_text: string; body_html: string | null;
  sent_at: string | null; channels: string[];
}

function needsProviderSend(row: RecipientRow, commSentAt: string | null): boolean {
  if (!row.email) return false;
  if (row.email_status === "pending") return true;
  if (row.email_status === "sending") return false;
  if (row.email_status === "failed") return false;
  if (row.email_status === "sent" && commSentAt && row.email_sent_at === commSentAt) return true;
  return false;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handlePreflight(req, cors);
  if (preflight) return preflight;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!smtpConfigured()) {
      return json({ error: "Email not configured: set SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD in Supabase secrets first." }, 500);
    }

    const { communication_id } = await req.json() as { communication_id: string };
    if (!communication_id) return json({ error: "communication_id is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: commRaw, error: commErr } = await supabase
      .from("communications")
      .select("id, org_id, event_id, community_id, subject, body_text, body_html, sent_at, channels")
      .eq("id", communication_id)
      .maybeSingle();
    if (commErr || !commRaw) return json({ error: "Communication not found" }, 404);
    const comm = commRaw as unknown as CommunicationRow;
    if (!comm.channels.includes("email")) {
      return json({ error: "This communication does not include the email channel" }, 400);
    }

    const { data: org } = await supabase
      .from("organizations").select("name, billing_email").eq("id", comm.org_id).maybeSingle();
    let fromName = org?.name ?? "Illuxus";
    if (comm.event_id) {
      const { data: ev } = await supabase
        .from("events").select("title").eq("id", comm.event_id).maybeSingle();
      if (ev?.title) fromName = ev.title;
    }
    const from = defaultFromAddress(fromName);
    const replyTo = org?.billing_email ?? undefined;

    const { data: rowsRaw } = await supabase
      .from("communication_recipients")
      .select("id, email, name, rendered_subject, rendered_body, email_status, email_sent_at")
      .eq("communication_id", communication_id);

    const rows = ((rowsRaw ?? []) as RecipientRow[]).filter((r) => needsProviderSend(r, comm.sent_at));

    let sent = 0, failed = 0;
    const errors: Array<{ recipient_id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const to = row.email!.trim().toLowerCase();
      const subject = row.rendered_subject ?? comm.subject;
      const bodyText = row.rendered_body ?? comm.body_text;
      const bodyHtml = comm.body_html ?? textToHtml(bodyText);

      await supabase.from("communication_recipients").update({ email_status: "sending" }).eq("id", row.id);
      const result = await sendViaSmtp({
        from, to: [to], subject,
        html: bodyHtml.includes("<") ? bodyHtml : textToHtml(bodyText),
        text: bodyText,
        ...(replyTo ? { reply_to: replyTo } : {}),
      });
      if (!result.ok) {
        await supabase.from("communication_recipients")
          .update({ email_status: "failed", error_message: result.error.slice(0, 500) }).eq("id", row.id);
        failed += 1;
        errors.push({ recipient_id: row.id, error: result.error.slice(0, 200) });
        continue;
      }
      await supabase.from("communication_recipients")
        .update({ email_status: "sent", email_sent_at: now, error_message: null }).eq("id", row.id);
      sent += 1;
    }

    if (sent + failed > 0) {
      await supabase.from("communications")
        .update({ sent_count: sent, failed_count: failed, updated_at: now }).eq("id", communication_id);
    }

    return json({ sent, failed, errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
