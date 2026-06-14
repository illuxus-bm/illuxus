// deno-lint-ignore-file no-explicit-any
/**
 * Agora token signer — Supabase edge function.
 *
 * Issues both RTC tokens (for the live A/V channel) and RTM tokens (for
 * the chat / data sidecar) given an authenticated request from the
 * frontend. The App Certificate never leaves this function — frontends
 * see only the signed token strings and their expiry.
 *
 * Required Supabase secrets:
 *   AGORA_APP_ID
 *   AGORA_APP_CERTIFICATE
 *
 * Request shape (POST):
 *   {
 *     "type": "rtc" | "rtm" | "both",
 *     "channel": string,            // RTC only
 *     "uid": number | string,       // numeric or user-account
 *     "role": "publisher" | "subscriber",  // RTC only
 *     "expireSeconds"?: number,     // default 3600
 *     "rtmUserId"?: string,         // RTM only — defaults to String(uid)
 *   }
 *
 * Response:
 *   { rtc?: { token, expireAtSeconds, uid }, rtm?: { token, expireAtSeconds, userId } }
 *
 * Errors are returned as `{ error: string }` with an appropriate HTTP
 * status. The function is intentionally stateless so it can sit behind
 * Supabase's edge runtime auth (verify_jwt = true in config.toml).
 */

import { RtcRole, RtcTokenBuilder, RtmTokenBuilder } from "npm:agora-token@2.0.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_EXPIRE_SECONDS = 3600;
const MAX_EXPIRE_SECONDS = 24 * 3600;

interface TokenRequest {
  type: "rtc" | "rtm" | "both";
  channel?: string;
  uid?: number | string;
  role?: "publisher" | "subscriber";
  expireSeconds?: number;
  rtmUserId?: string;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const appId = Deno.env.get("AGORA_APP_ID");
  const appCertificate = Deno.env.get("AGORA_APP_CERTIFICATE");
  if (!appId || !appCertificate) {
    return jsonResponse(500, {
      error: "Agora not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE secrets.",
    });
  }

  let body: TokenRequest;
  try {
    body = (await req.json()) as TokenRequest;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const type = body.type;
  if (type !== "rtc" && type !== "rtm" && type !== "both") {
    return jsonResponse(400, { error: "type must be 'rtc' | 'rtm' | 'both'" });
  }

  const requestedExpire = Number(body.expireSeconds ?? DEFAULT_EXPIRE_SECONDS);
  if (!Number.isFinite(requestedExpire) || requestedExpire <= 0) {
    return jsonResponse(400, { error: "expireSeconds must be > 0" });
  }
  const expireSeconds = Math.min(requestedExpire, MAX_EXPIRE_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + expireSeconds;

  const out: Record<string, unknown> = {};

  // ── RTC token ────────────────────────────────────────────────────────────
  if (type === "rtc" || type === "both") {
    const channel = body.channel;
    const uid = body.uid;
    const role = body.role;
    if (!channel || typeof channel !== "string") {
      return jsonResponse(400, { error: "channel required for rtc token" });
    }
    if (uid === undefined || uid === null) {
      return jsonResponse(400, { error: "uid required for rtc token" });
    }
    if (role !== "publisher" && role !== "subscriber") {
      return jsonResponse(400, { error: "role must be 'publisher' | 'subscriber'" });
    }
    const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    try {
      const token = typeof uid === "string"
        ? RtcTokenBuilder.buildTokenWithUserAccount(
            appId,
            appCertificate,
            channel,
            uid,
            rtcRole,
            expireAt,
            expireAt,
          )
        : RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channel,
            Number(uid),
            rtcRole,
            expireAt,
            expireAt,
          );
      out.rtc = { token, expireAtSeconds: expireAt, uid };
    } catch (err) {
      return jsonResponse(500, {
        error: "rtc token signing failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── RTM token ────────────────────────────────────────────────────────────
  if (type === "rtm" || type === "both") {
    const userId = body.rtmUserId ?? (body.uid !== undefined ? String(body.uid) : undefined);
    if (!userId) {
      return jsonResponse(400, { error: "rtmUserId (or uid) required for rtm token" });
    }
    try {
      const token = RtmTokenBuilder.buildToken(
        appId,
        appCertificate,
        userId,
        expireAt,
      );
      out.rtm = { token, expireAtSeconds: expireAt, userId };
    } catch (err) {
      return jsonResponse(500, {
        error: "rtm token signing failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return jsonResponse(200, out);
});
