/**
 * whatsapp-webhook
 *
 * Receives Meta's WhatsApp Cloud API delivery callbacks.
 *
 *   GET  → verification handshake (`hub.mode=subscribe` + `hub.verify_token`)
 *   POST → message status events: sent / delivered / read / failed
 *
 * Security posture: Meta calls this endpoint from public IPs with no
 * browser involved, so the CORS `allowAny` posture is intentional.
 * The security boundary is TWO shared secrets:
 *   1. `WHATSAPP_VERIFY_TOKEN` (handshake only, GET) — the string Meta
 *      echoes back on subscription setup.
 *   2. `WHATSAPP_APP_SECRET` (every POST) — Meta HMAC-SHA256-signs
 *      each webhook payload with the app secret and sends the digest
 *      in the `X-Hub-Signature-256: sha256=<hex>` header. We recompute
 *      it here and reject the request on mismatch.
 *
 * Without signature verification anyone can POST arbitrary "delivered"
 * / "read" / "failed" events to this endpoint and corrupt the delivery
 * status of any recipient row within the 7-day matching window. That
 * was the state before this file added HMAC verification.
 *
 * Required env (Supabase secrets):
 *   WHATSAPP_VERIFY_TOKEN  — random string you also paste into Meta's
 *                            webhook config so Meta proves it's us.
 *   WHATSAPP_APP_SECRET    — the WhatsApp Business app's App Secret
 *                            (Meta Business Manager → System User /
 *                            App Settings → App Secret). Used for
 *                            X-Hub-Signature-256 verification on POST.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("whatsapp-webhook");

// Meta's WhatsApp servers POST verification + delivery events to this
// endpoint with no browser involved. Origin checking is meaningless
// here — the security boundary is the verify_token + signature header.
// Pass allowAny + GET so the verification handshake works.
function corsFor(req: Request) {
  return buildCorsHeaders(req, { allowAny: true, methods: "GET, POST, OPTIONS" });
}

function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Timing-safe hex string comparison. `crypto.subtle.timingSafeEqual`
 * exists on Node but not on Deno's Web Crypto — we implement the same
 * O(n) constant-time compare here so an attacker can't derive digest
 * bytes from response-time differences.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header against an HMAC-SHA256
 * of the raw request body using the App Secret. Returns `true` iff the
 * header is present, well-formed, and cryptographically matches.
 *
 * Follows Meta's Webhooks documentation:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
 *
 * A failed check is not automatically logged (the caller does that
 * with the appropriate context); this helper is pure so it's easy to
 * unit-test.
 */
async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const expectedHex = signatureHeader.slice(prefix.length).toLowerCase();
  // Meta's signatures are always 64 hex chars (SHA-256). Reject
  // anything else without doing crypto work so a malformed header
  // can't be used to time-probe the compare loop.
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const actualHex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(actualHex, expectedHex);
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  // ── Verification handshake ────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected  = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (!expected) {
      log.error("verify token not set");
      return new Response("verify token not configured on server", {
        status: 500, headers: corsHeaders,
      });
    }

    if (mode === "subscribe" && token && token === expected) {
      log.info("verification successful");
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    log.warn("verification rejected", { hasMode: !!mode, hasToken: !!token, match: token === expected });
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  // ── Status events ─────────────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      // Read the RAW body first so we can compute HMAC over the exact
      // bytes Meta signed. `req.json()` after this on the same request
      // would throw (body already consumed), so we `JSON.parse` the
      // stored string instead.
      const rawBody = await req.text();

      // Signature verification. Reject with 401 when the App Secret is
      // unset or the header doesn't match — Meta will retry on 4xx/5xx
      // so no delivery events are lost while an operator fixes the
      // configuration; leaving the endpoint unauthenticated (the pre-
      // fix state) meant anyone with the URL could inject fake
      // delivered/read/failed events for any recipient in the last 7
      // days.
      const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
      if (!appSecret) {
        log.error("app secret not configured — refusing to process webhook", {
          reason: "WHATSAPP_APP_SECRET env var is missing",
        });
        return new Response(
          JSON.stringify({
            error: "WHATSAPP_APP_SECRET not configured on server",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const signatureHeader = req.headers.get("x-hub-signature-256");
      const signatureOk = await verifyMetaSignature(rawBody, signatureHeader, appSecret);
      if (!signatureOk) {
        log.warn("signature verification failed", {
          has_header: !!signatureHeader,
          body_bytes: rawBody.length,
        });
        return new Response(
          JSON.stringify({ error: "invalid signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const payload = JSON.parse(rawBody) as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              statuses?: Array<{
                id: string;
                status: "sent" | "delivered" | "read" | "failed";
                recipient_id: string;
                timestamp: string;
                errors?: Array<{ code: number; title: string; message?: string }>;
              }>;
            };
          }>;
        }>;
      };

      let processed = 0;
      let unmatched = 0;
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const statuses = change.value?.statuses ?? [];
          for (const s of statuses) {
            const phone = normalisePhone(s.recipient_id);
            if (!phone) continue;

            // Match by digit-suffix to be tolerant of leading +/spaces in our
            // stored phone column. Narrow by recent rows (last 7 days) to
            // avoid stamping unrelated historical sends.
            const { data: candidates } = await supabase
              .from("communication_recipients")
              .select("id, phone, created_at")
              .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .order("created_at", { ascending: false })
              .limit(200);

            const target = (candidates ?? []).find(
              (c) => normalisePhone(c.phone as string | null) === phone,
            );
            if (!target) { unmatched += 1; continue; }

            const errMsg = s.errors && s.errors.length > 0
              ? `${s.errors[0].code}: ${s.errors[0].title}${s.errors[0].message ? ` — ${s.errors[0].message}` : ""}`
              : null;

            await supabase.rpc("_whatsapp_recipient_update" as never, {
              _recipient_id: target.id,
              _status: s.status,
              _error: errMsg,
            } as never);
            processed += 1;
          }
        }
      }
      log.info("processed", { processed, unmatched });
      return new Response(JSON.stringify({ processed, unmatched }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("post failed", toErrorFields(err));
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("method not allowed", { status: 405, headers: corsHeaders });
});
