import { createClient } from "../_vendor/esm.sh/@supabase/supabase-js@2.108.1/_entry.mjs";
import { AccessToken } from "../_vendor/esm.sh/livekit-server-sdk@2.9.7/_entry.mjs";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { sessionMeetsTwoFactor } from "../_shared/auth.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import { eventHasFeature, featureNotIncluded } from "../_shared/entitlements.ts";
import { hlsPlaybackUrl } from "../_shared/webinar-hls.ts";

const log = createEdgeLogger("livekit-token");

const MAX_PUBLISHERS = 10;

function cleanName(raw: string | null | undefined): string {
  if (!raw) return "Guest";
  const s = String(raw).trim();
  if (!s) return "Guest";
  // If it looks like an email, drop the @domain part and tidy separators.
  if (/@/.test(s)) {
    const local = s.split("@")[0]!;
    return local
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Guest";
  }
  return s;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id, speaker_token, join_token, browser_session_id, fingerprint } = await req.json();
    if (!session_id) {
      return json({ error: "session_id required" }, 400);
    }

    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The session decides which event's registrations count (a join link
    // for one event must not open another event's webinar).
    const { data: session } = await supabase
      .from("webinar_sessions")
      .select("id, livekit_room, event_id, status, created_by")
      .eq("id", session_id).maybeSingle();
    if (!session) return json({ error: "Session not found" }, 404);

    let userId: string | null = null;
    let userEmail: string | null = null;
    let displayName: string | null = null;
    if (jwt) {
      const { data: { user } } = await supabase.auth.getUser(jwt);
      if (user && sessionMeetsTwoFactor(user, jwt)) {
        userId = user.id;
        userEmail = user.email ?? null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, last_name, username")
          .eq("user_id", user.id)
          .maybeSingle();
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
        displayName =
          (fullName || null) ??
          profile?.display_name ??
          profile?.username ??
          cleanName(userEmail);
      }
    }

    let registrationId: string | null = null;
    let guestIdentity: string | null = null;
    // Resolve speaker invite early so unauthenticated speakers can join via link.
    type SpeakerRow = { id: string; role: string; display_name: string | null; email: string | null; user_id?: string | null };
    let speakerRow: SpeakerRow | null = null;
    if (speaker_token && session_id) {
      const { data: sp } = await supabase
        .from("webinar_speakers")
        .select("id, role, display_name, email, user_id")
        .eq("session_id", session_id)
        .eq("invite_token", speaker_token)
        .maybeSingle();
      if (sp) {
        speakerRow = sp as SpeakerRow;
        if (!userId) {
          guestIdentity = `speaker-${sp.id}`;
          const spName = sp.display_name?.trim();
          displayName = spName || cleanName(sp.email);
          userEmail = sp.email ?? null;
        }
      }
    }
    // If a join_token is supplied, it authenticates the participant — no login required.
    if (join_token) {
      const { data: reg } = await supabase
        .from("registrations")
        .select("id, event_id, user_id, active_session_id, name, email")
        .eq("join_token", join_token)
        .eq("event_id", session.event_id)
        .eq("approval_status", "approved")
        .neq("status", "cancelled")
        .maybeSingle();
      if (!reg) return json({ error: "Invalid join link" }, 403);
      // Resolve canonical browser session id (server-side fallback so a cleared
      // localStorage / new device with the same fingerprint isn't self-kicked).
      let resolvedBsid = browser_session_id || crypto.randomUUID();
      if (browser_session_id) {
        const { data: r } = await supabase.rpc("resolve_browser_session", {
          _jt: join_token,
          _csid: browser_session_id,
          _fp: fingerprint || null,
        });
        if (typeof r === "string") resolvedBsid = r;
      }
      if (reg.active_session_id && reg.active_session_id !== resolvedBsid) {
        return json({ error: "Link in use on another device" }, 409);
      }
      registrationId = reg.id;
      await supabase.from("registrations")
        .update({ active_session_id: resolvedBsid, active_session_started_at: new Date().toISOString() })
        .eq("id", reg.id);
      if (!userId) {
        guestIdentity = `guest-${reg.id}`;
        displayName = reg.name?.trim() || cleanName(reg.email);
        userEmail = reg.email ?? null;
      }
    }

    if (!userId && !guestIdentity) return json({ error: "Unauthenticated" }, 401);

    if (!(await eventHasFeature(supabase, session.event_id, "webinar"))) {
      return json(featureNotIncluded("webinar", "the webinar studio"), 403);
    }

    // Determine role server-side
    const { data: ev } = await supabase
      .from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    const isOwner = ev?.user_id === userId;

    let role: "host" | "cohost" | "speaker" | "viewer" = "viewer";
    let canPublish = false;

    if (userId && (isOwner || session.created_by === userId)) {
      role = "host";
      canPublish = true;
    } else if (speakerRow) {
      role = speakerRow.role as typeof role;
      canPublish = true;
      const spName = speakerRow.display_name?.trim();
      if (spName) displayName = spName;
      else if (!displayName || displayName === "Guest") displayName = cleanName(speakerRow.email);
      await supabase.from("webinar_speakers")
        .update({ accepted_at: new Date().toISOString(), user_id: userId ?? speakerRow.user_id ?? null })
        .eq("id", speakerRow.id);
    } else if (userId) {
      // Approved speaker by user_id?
      const { data: sp } = await supabase
        .from("webinar_speakers").select("id, role")
        .eq("session_id", session_id).eq("user_id", userId).maybeSingle();
      if (sp) { role = sp.role as typeof role; canPublish = true; }
    }

    // If publishing, check 10-cap via LiveKit RoomService
    if (canPublish) {
      const count = await getPublisherCount(session.livekit_room);
      if (count >= MAX_PUBLISHERS) {
        canPublish = false;
        role = "viewer";
      }
    } else if (!registrationId) {
      // No join_token — verify approved registration for logged-in viewers
      if (!userId) return json({ error: "Join link required" }, 403);
      const { data: reg } = await supabase
        .from("registrations").select("id")
        .eq("event_id", session.event_id).eq("user_id", userId)
        .eq("approval_status", "approved").maybeSingle();
      if (!reg && !isOwner) return json({ error: "Not registered or not approved" }, 403);
    }

    // A viewer the host brought on stage (an accepted raise-hand) publishes
    // too. HLS viewers aren't in the room, so this token is how they get on
    // stage; the role stays "viewer".
    if (!canPublish && userId) {
      const { data: accepted } = await supabase
        .from("webinar_stage_requests").select("id")
        .eq("session_id", session_id).eq("user_id", userId).eq("status", "accepted").maybeSingle();
      if (accepted && (await getPublisherCount(session.livekit_room)) < MAX_PUBLISHERS) canPublish = true;
    }

    // Final safety net — never let an email appear as a participant name.
    displayName = cleanName(displayName ?? userEmail);

    // Viewers watch the composed stream from the CDN instead of joining the
    // room. Each request doubles as an attendance heartbeat.
    const playbackUrl = canPublish ? null : hlsPlaybackUrl(session.livekit_room);
    if (playbackUrl) {
      if (session.status === "live") {
        await recordHlsViewer(supabase, session.id, userId ?? guestIdentity!, userId, displayName);
      }
      return json({
        mode: "hls",
        playback_url: playbackUrl,
        role,
        can_publish: false,
        room: session.livekit_room,
        registration_id: registrationId,
      });
    }

    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
      {
        identity: userId ?? guestIdentity!,
        name: displayName,
        metadata: JSON.stringify({ role, user_id: userId, registration_id: registrationId }),
      }
    );
    at.addGrant({
      room: session.livekit_room,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: role === "host",
    });
    const token = await at.toJwt();
    return json({
      mode: "rtc",
      token,
      ws_url: Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL"),
      role,
      can_publish: canPublish,
      room: session.livekit_room,
      registration_id: registrationId,
    });
  } catch (e) {
    log.error("unhandled error", toErrorFields(e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getPublisherCount(room: string): Promise<number> {
  try {
    const url = (Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL"))!.replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
      { identity: "server" }
    );
    at.addGrant({ roomAdmin: true, room });
    const jwt = await at.toJwt();
    const res = await fetch(`${url}/twirp/livekit.RoomService/ListParticipants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({ room }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const participants = (data.participants || []) as Array<{ permission?: { canPublish?: boolean } }>;
    return participants.filter(p => p.permission?.canPublish).length;
  } catch { return 0; }
}

/**
 * Attendance for HLS viewers, who never appear in LiveKit's webhooks. The
 * first request opens a row; later ones (the player's heartbeat) move
 * `duration_seconds` forward. livekit-webhook closes the row at that mark
 * when the room finishes.
 */
async function recordHlsViewer(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  identity: string,
  userId: string | null,
  displayName: string,
): Promise<void> {
  try {
    const { data: open } = await supabase.from("webinar_attendance")
      .select("id, joined_at").eq("session_id", sessionId).eq("identity", identity).is("left_at", null)
      .order("joined_at", { ascending: false }).limit(1).maybeSingle();
    if (open) {
      const seconds = Math.max(0, Math.round((Date.now() - Date.parse(open.joined_at)) / 1000));
      await supabase.from("webinar_attendance").update({ duration_seconds: seconds }).eq("id", open.id);
      return;
    }
    await supabase.from("webinar_attendance").insert({
      session_id: sessionId, identity, user_id: userId, display_name: displayName,
      role: "viewer", duration_seconds: 0,
    });
    const { data: s } = await supabase.from("webinar_sessions").select("viewer_peak").eq("id", sessionId).maybeSingle();
    if (s) await supabase.from("webinar_sessions").update({ viewer_peak: (s.viewer_peak || 0) + 1 }).eq("id", sessionId);
  } catch (e) {
    log.error("hls attendance failed", toErrorFields(e));
  }
}
