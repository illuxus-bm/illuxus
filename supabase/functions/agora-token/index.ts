// deno-lint-ignore-file no-explicit-any
/**
 * Agora token signer — Supabase edge function.
 *
 * Issues both RTC tokens (for the live A/V channel) and RTM tokens (for
 * the chat / data sidecar) given an authenticated request from the
 * frontend. The App Certificate never leaves this function — frontends
 * see only the signed token strings and their expiry.
 *
 * ## Authorization (SECURITY-CRITICAL — do not remove)
 *
 * This function previously trusted `channel`, `uid`, and `role` straight
 * from the request body with no identity check at all. `verify_jwt = true`
 * does not help: the gateway only validates that the bearer token is
 * signed by the project JWT secret, and the public anon key in the browser
 * bundle satisfies that. The result was that any internet caller could
 * mint a **publisher** token for any channel under any uid — i.e. publish
 * audio/video into a live webinar and impersonate an arbitrary participant.
 *
 * The channel, the participant identity, and the publish privilege are now
 * all derived SERVER-SIDE from the caller's JWT and the webinar session
 * they asked for. The body's `uid` and `role` are ignored. The role model
 * mirrors `livekit-token/index.ts`, which is the reference implementation
 * for webinar authorization in this project:
 *
 *   - publisher — event owner, session creator, or a `webinar_speakers` row
 *                 for this session matching the caller
 *   - subscriber — caller has an `approved` registration for the event
 *   - 403       — everyone else
 *
 * Required Supabase secrets:
 *   AGORA_APP_ID
 *   AGORA_APP_CERTIFICATE
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Request shape (POST):
 *   {
 *     "type": "rtc" | "rtm" | "both",
 *     "session_id": string,         // preferred. `channel` accepted as an alias.
 *     "channel": string,            // legacy alias for session_id
 *     "expireSeconds"?: number,     // default 3600, capped at 24h
 *   }
 *
 * `uid` and `role` in the body are accepted but IGNORED — both are
 * resolved server-side. They remain in the type only to document that the
 * old client shape still parses.
 *
 * Response:
 *   { rtc?: { token, expireAtSeconds, uid }, rtm?: { token, expireAtSeconds, userId },
 *     role: "publisher" | "subscriber" }
 *
 * Errors are returned as `{ error: string }` with an appropriate HTTP
 * status.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RtcRole, RtcTokenBuilder, RtmTokenBuilder } from "npm:agora-token@2.0.5";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import {
  isPlatformAdmin,
  requireUser,
  type MinimalSupabaseClient,
} from "../_shared/auth.ts";

const log = createEdgeLogger("agora-token");

const DEFAULT_EXPIRE_SECONDS = 3600;
const MAX_EXPIRE_SECONDS = 24 * 3600;

interface TokenRequest {
  type: "rtc" | "rtm" | "both";
  /** Preferred field. `channel` is accepted as a legacy alias. */
  session_id?: string;
  channel?: string;
  /**
   * Registration join link (`registrations.join_token`). Authenticates a
   * GUEST viewer who has no Supabase session — the public live page
   * explicitly supports this (`src/pages/EventLivePage.tsx`: "Guests with a
   * unique join link or speaker invite link can enter without signing in").
   * Grants subscriber only.
   */
  join_token?: string;
  /**
   * Speaker invite link (`webinar_speakers.invite_token`). Authenticates an
   * invited speaker who has not signed in. Grants publisher.
   */
  speaker_token?: string;
  /** IGNORED — resolved from the caller's JWT. Kept so old payloads parse. */
  uid?: number | string;
  /** IGNORED — resolved from the caller's session membership. */
  role?: "publisher" | "subscriber";
  expireSeconds?: number;
  rtmUserId?: string;
}

/** Outcome of resolving who the caller is and what they may do. */
interface ResolvedGrant {
  role: "publisher" | "subscriber";
  /** Agora user-account string. A real auth uid, or a `guest-`/`speaker-`
   *  prefixed synthetic id for token-authenticated callers. Prefixing keeps
   *  synthetic ids from ever colliding with a uuid auth id. */
  identity: string;
}

/**
 * Resolves a GUEST caller from an invite/join token, with no Supabase
 * session required. This is what keeps the public live page working for
 * link-based attendees after the authorization fix.
 *
 * A token is a bearer credential in its own right: `registrations.join_token`
 * and `webinar_speakers.invite_token` are unguessable server-generated
 * values, and both are already used exactly this way by `livekit-token`.
 * Crucially, each token is bound to a specific session/event, so it cannot
 * be replayed against a different channel.
 *
 * Returns `null` when neither token is present or neither matches.
 */
async function resolveTokenGrant(
  supabase: MinimalSupabaseClient,
  sessionId: string,
  eventId: string,
  speakerToken: string,
  joinToken: string,
): Promise<ResolvedGrant | null> {
  // Invited speaker — may publish. Scoped to this session by the query.
  if (speakerToken) {
    const { data: sp } = await supabase
      .from("webinar_speakers")
      .select("id")
      .eq("session_id", sessionId)
      .eq("invite_token", speakerToken)
      .maybeSingle();
    if (sp?.id) {
      return { role: "publisher", identity: `speaker-${sp.id}` };
    }
  }

  // Registration join link — subscriber only. The `event_id` equality check
  // is what stops a join token for event A being replayed to listen in on
  // event B's session.
  if (joinToken) {
    const { data: reg } = await supabase
      .from("registrations")
      .select("id, event_id")
      .eq("join_token", joinToken)
      .maybeSingle();
    if (reg?.id && reg.event_id === eventId) {
      return { role: "subscriber", identity: `guest-${reg.id}` };
    }
  }

  return null;
}

/**
 * Resolves a SIGNED-IN caller's Agora privilege for a webinar session.
 *
 * Returns the effective role, or `null` when the caller has no right to
 * be in the channel at all. Mirrors `livekit-token`'s ladder so the two
 * providers cannot drift into different authorization answers.
 */
async function resolveSessionRole(
  supabase: MinimalSupabaseClient,
  userId: string,
  sessionId: string,
): Promise<{ role: "publisher" | "subscriber"; eventId: string } | null> {
  const { data: session } = await supabase
    .from("webinar_sessions")
    .select("id, event_id, created_by")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: ev } = await supabase
    .from("events")
    .select("user_id")
    .eq("id", session.event_id)
    .maybeSingle();

  // Host: event owner or the person who opened the session.
  if (ev?.user_id === userId || session.created_by === userId) {
    return { role: "publisher", eventId: session.event_id };
  }

  // Invited / approved speaker for this specific session.
  const { data: speaker } = await supabase
    .from("webinar_speakers")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (speaker) return { role: "publisher", eventId: session.event_id };

  // Approved attendee — may listen, never publish.
  const { data: reg } = await supabase
    .from("registrations")
    .select("id")
    .eq("event_id", session.event_id)
    .eq("user_id", userId)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (reg) return { role: "subscriber", eventId: session.event_id };

  // Platform admins can observe any session for support purposes.
  if (await isPlatformAdmin(supabase, userId)) {
    return { role: "subscriber", eventId: session.event_id };
  }

  return null;
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

  // ── Authorization — MUST run before any token is signed ──────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, { error: "Supabase not configured for agora-token" });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // `session_id` is preferred; `channel` is the legacy field the existing
  // client sends (it already passes the session id there).
  const sessionId = (body.session_id ?? body.channel ?? "").trim();
  if (!sessionId) {
    return jsonResponse(400, { error: "session_id required" });
  }

  // The session must exist before either authorization path runs — the guest
  // path needs its `event_id` to bind a join token to the right event.
  const { data: sessionRow } = await supabase
    .from("webinar_sessions")
    .select("id, event_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow?.event_id) {
    // 403 rather than 404 so session ids cannot be enumerated.
    return jsonResponse(403, { error: "Forbidden" });
  }
  const eventId = sessionRow.event_id as string;

  const speakerToken = (body.speaker_token ?? "").trim();
  const joinToken = (body.join_token ?? "").trim();

  let grant: ResolvedGrant | null = null;

  // ── Path 1: token-authenticated guest (no Supabase session) ──────────────
  // Tried first because these callers have no JWT at all, so `requireUser`
  // would reject them. The public live page relies on this.
  if (speakerToken || joinToken) {
    grant = await resolveTokenGrant(
      supabase,
      sessionId,
      eventId,
      speakerToken,
      joinToken,
    );
  }

  // ── Path 2: signed-in user ───────────────────────────────────────────────
  if (!grant) {
    const caller = await requireUser(req, supabase);
    if (!caller.ok) {
      log.warn("unauthenticated token request rejected", { status: caller.status });
      return jsonResponse(caller.status, { error: caller.error });
    }
    const resolved = await resolveSessionRole(supabase, caller.user.id, sessionId);
    if (!resolved) {
      log.warn("forbidden token request rejected", {
        actor_id: caller.user.id,
        session_id: sessionId,
      });
      return jsonResponse(403, { error: "Forbidden" });
    }
    grant = { role: resolved.role, identity: caller.user.id };
  }

  // Server-derived, never client-supplied. The channel is the session id and
  // the identity comes from the resolved grant, so a caller cannot publish
  // into a channel they were not authorized for or masquerade as another
  // participant.
  const channel = sessionId;
  const identity = grant.identity;
  const role = grant.role;

  log.info("token issued", {
    actor_id: identity,
    session_id: sessionId,
    role,
    token_type: type,
  });

  const out: Record<string, unknown> = { role };

  // ── RTC token ────────────────────────────────────────────────────────────
  if (type === "rtc" || type === "both") {
    const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    try {
      // Always the user-account form — the identity is a uuid string, and
      // pinning it to the caller's auth uid is what prevents impersonation.
      const token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCertificate,
        channel,
        identity,
        rtcRole,
        expireAt,
        expireAt,
      );
      out.rtc = { token, expireAtSeconds: expireAt, uid: identity };
    } catch (err) {
      log.error("rtc token signing failed", toErrorFields(err));
      return jsonResponse(500, { error: "rtc token signing failed" });
    }
  }

  // ── RTM token ────────────────────────────────────────────────────────────
  if (type === "rtm" || type === "both") {
    try {
      const token = RtmTokenBuilder.buildToken(
        appId,
        appCertificate,
        identity,
        expireAt,
      );
      out.rtm = { token, expireAtSeconds: expireAt, userId: identity };
    } catch (err) {
      log.error("rtm token signing failed", toErrorFields(err));
      return jsonResponse(500, { error: "rtm token signing failed" });
    }
  }

  return jsonResponse(200, out);
});
