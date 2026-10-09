// deno-lint-ignore-file no-explicit-any
/**
 * Agora token signer — Supabase edge function.
 *
 * Issues RTC tokens (the live A/V channel) and RTM tokens (chat / data
 * sidecar). The App Certificate never leaves this function — frontends see
 * only the signed token strings and their expiry.
 *
 * AUTHORISATION. `verify_jwt` only proves the request carries a project JWT
 * (the public anon key is one), so this function decides for itself who may
 * join and who may publish — the same rules as `livekit-token`:
 *   • The RTC channel must be a webinar session id.
 *   • PUBLISH (role "publisher"): a manager of the session's event, the
 *     session's creator, or a speaker of that session (signed in, or holding
 *     the speaker invite token).
 *   • VIEW (role "subscriber"): anyone who may publish, a signed-in user with
 *     an approved registration for the event, or a guest holding that event's
 *     join token.
 *   • Signed-in callers get a token for their own user id only; guests must
 *     use a "guest-…" id, so nobody can join under another user's identity.
 * Previously any caller could mint a publisher token for any channel.
 *
 * Required Supabase secrets:
 *   AGORA_APP_ID
 *   AGORA_APP_CERTIFICATE
 *
 * Request shape (POST):
 *   {
 *     "type": "rtc" | "rtm" | "both",
 *     "channel": string,            // RTC: the webinar session id
 *     "uid": number | string,       // numeric or user-account
 *     "role": "publisher" | "subscriber",  // RTC only
 *     "expireSeconds"?: number,     // default 3600
 *     "rtmUserId"?: string,         // RTM only — defaults to String(uid)
 *     "speaker_token"?: string,     // guest speaker invite (?speaker=…)
 *     "join_token"?: string,        // guest attendee join link (?join=…)
 *   }
 *
 * Response:
 *   { rtc?: { token, expireAtSeconds, uid }, rtm?: { token, expireAtSeconds, userId } }
 *
 * Errors are returned as `{ error: string }` with an appropriate HTTP status.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RtcRole, RtcTokenBuilder, RtmTokenBuilder } from "npm:agora-token@2.0.5";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getCallerUser, getManagedEvent, isUuid, serviceClient } from "../_shared/auth.ts";

const DEFAULT_EXPIRE_SECONDS = 3600;
const MAX_EXPIRE_SECONDS = 24 * 3600;

interface TokenRequest {
  type: "rtc" | "rtm" | "both";
  channel?: string;
  uid?: number | string;
  role?: "publisher" | "subscriber";
  expireSeconds?: number;
  rtmUserId?: string;
  speaker_token?: string;
  join_token?: string;
}

type Access = "publish" | "view" | "none" | "no-session";

/** What the caller may do in the webinar session behind `sessionId`. */
async function sessionAccess(
  admin: SupabaseClient,
  callerId: string | null,
  sessionId: string,
  speakerToken: string | undefined,
  joinToken: string | undefined,
): Promise<Access> {
  if (!isUuid(sessionId)) return "no-session";
  const { data: s } = await admin
    .from("webinar_sessions").select("id, event_id, created_by").eq("id", sessionId).maybeSingle();
  const session = s as { id: string; event_id: string; created_by: string | null } | null;
  if (!session) return "no-session";

  if (callerId) {
    if (session.created_by === callerId) return "publish";
    if (await getManagedEvent(admin, callerId, session.event_id)) return "publish";
    const { data: sp } = await admin
      .from("webinar_speakers").select("id").eq("session_id", sessionId).eq("user_id", callerId).limit(1);
    if (sp?.length) return "publish";
  }
  if (speakerToken) {
    const { data: sp } = await admin
      .from("webinar_speakers").select("id").eq("session_id", sessionId).eq("invite_token", speakerToken).limit(1);
    if (sp?.length) return "publish";
  }
  if (joinToken) {
    const { data: reg } = await admin
      .from("registrations").select("id").eq("join_token", joinToken).eq("event_id", session.event_id).limit(1);
    if (reg?.length) return "view";
  }
  if (callerId) {
    const { data: reg } = await admin
      .from("registrations").select("id")
      .eq("event_id", session.event_id).eq("user_id", callerId).eq("approval_status", "approved").limit(1);
    if (reg?.length) return "view";
  }
  return "none";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;

  const jsonResponse = (status: number, body: Record<string, unknown>): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

  // ── Who is asking, and what may they do? ─────────────────────────────────
  const admin = serviceClient();
  const caller = await getCallerUser(req, admin);
  const speakerToken = typeof body.speaker_token === "string" && body.speaker_token ? body.speaker_token : undefined;
  const joinToken = typeof body.join_token === "string" && body.join_token ? body.join_token : undefined;

  let access: Access = "none";
  if (typeof body.channel === "string" && body.channel) {
    try {
      access = await sessionAccess(admin, caller?.id ?? null, body.channel, speakerToken, joinToken);
    } catch (err) {
      return jsonResponse(500, { error: "access check failed", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  // Bind the Agora identity to the caller so one participant can't join as another.
  const identityError = (id: unknown): string | null => {
    if (caller) return String(id) === caller.id ? null : "uid must be your own user id";
    return typeof id === "string" && id.startsWith("guest-") ? null : "guests must use a guest- uid";
  };

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
    if (access === "no-session") return jsonResponse(404, { error: "Session not found" });
    if (access === "none") {
      return jsonResponse(caller || speakerToken || joinToken ? 403 : 401, {
        error: caller || speakerToken || joinToken ? "You don't have access to this session" : "Sign in or use your join link",
      });
    }
    if (role === "publisher" && access !== "publish") {
      return jsonResponse(403, { error: "Only hosts and speakers can publish in this session" });
    }
    const idErr = identityError(uid);
    if (idErr) return jsonResponse(403, { error: idErr });

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
    // RTM logs a user in app-wide: require a signed-in caller, or a guest who
    // has proven access to a session above.
    if (!caller && access !== "publish" && access !== "view") {
      return jsonResponse(401, { error: "Sign in or use your join link" });
    }
    const idErr = identityError(userId);
    if (idErr) return jsonResponse(403, { error: idErr });
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
