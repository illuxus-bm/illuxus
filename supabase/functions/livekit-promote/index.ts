import { createClient } from "../_vendor/esm.sh/@supabase/supabase-js@2.108.1/_entry.mjs";
import { AccessToken } from "../_vendor/esm.sh/livekit-server-sdk@2.9.7/_entry.mjs";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { sessionMeetsTwoFactor } from "../_shared/auth.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("livekit-promote");

const MAX = 10;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id, target_user_id: targetIn, action, self } = await req.json(); // action: 'promote' | 'demote'
    const auth = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return j({ error: "Unauthenticated" }, 401);
    if (!sessionMeetsTwoFactor(user, auth.replace("Bearer ", ""))) return j({ error: "Two-factor verification required" }, 401);

    const { data: session } = await supabase.from("webinar_sessions").select("id, event_id, livekit_room").eq("id", session_id).maybeSingle();
    if (!session) return j({ error: "Not found" }, 404);
    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    const isHost = ev?.user_id === user.id;
    let isPlatformAdmin = false;
    if (!isHost) {
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
      isPlatformAdmin = !!r;
    }
    const target_user_id = self ? user.id : targetIn;
    if (!target_user_id) return j({ error: "target_user_id required" }, 400);

    // Self-promote/demote: caller must be an invited speaker (or host).
    if (self) {
      if (!isHost && !isPlatformAdmin) {
        const { data: sp } = await supabase.from("webinar_speakers")
          .select("id").eq("session_id", session_id).eq("user_id", user.id).maybeSingle();
        if (!sp) return j({ error: "Not a speaker on this session" }, 403);
      }
    } else if (!isHost && !isPlatformAdmin) {
      return j({ error: "Forbidden" }, 403);
    }

    // The decision is recorded first, so it works whichever video provider
    // the event uses: on Agora, `agora-token` lets an accepted attendee
    // publish and their page switches them onto the stage. LiveKit, when it
    // is configured, is updated as well, but an unreachable LiveKit server no
    // longer blocks the change.
    const lkBase = (Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL") || "").replace(/^wss?:\/\//, "https://");
    const lkKey = Deno.env.get("LIVEKIT_API_KEY");
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET");
    let jwt: string | null = null;
    if (lkBase && lkKey && lkSecret) {
      const at = new AccessToken(lkKey, lkSecret, { identity: "server" });
      at.addGrant({ roomAdmin: true, room: session.livekit_room });
      jwt = await at.toJwt();
    }
    const twirp = async (method: string, body: unknown) => {
      if (!jwt) return null;
      try {
        const r = await fetch(`${lkBase}/twirp/livekit.RoomService/${method}`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
          body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
        });
        return r.ok ? await r.json() : null;
      } catch (e) {
        log.warn("livekit unreachable", { method, ...toErrorFields(e) });
        return null;
      }
    };

    if (action === "promote") {
      // Cap check: attendees already brought on stage, or LiveKit's own count.
      const { count } = await supabase.from("webinar_stage_requests")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session_id).eq("status", "accepted");
      const list = await twirp("ListParticipants", { room: session.livekit_room }) as { participants?: { permission?: { canPublish?: boolean } }[] } | null;
      const lkCount = (list?.participants ?? []).filter((p) => p.permission?.canPublish).length;
      if (!self && Math.max(count ?? 0, lkCount) >= MAX) return j({ error: `Stage is full (${MAX}/${MAX})` }, 409);
      if (!self) {
        await supabase.from("webinar_stage_requests").update({ status: "accepted" })
          .eq("session_id", session_id).eq("user_id", target_user_id);
      }
    } else if (!self) {
      await supabase.from("webinar_stage_requests").update({ status: "cancelled" })
        .eq("session_id", session_id).eq("user_id", target_user_id);
    }

    const can = action === "promote";
    await twirp("UpdateParticipant", {
      room: session.livekit_room,
      identity: target_user_id,
      permission: { can_publish: can, can_subscribe: true, can_publish_data: true },
    });
    return j({ ok: true });
  } catch (e) {
    // Details stay in the logs; callers get a generic message.
    log.error("unhandled error", toErrorFields(e));
    return j({ error: "Something went wrong. Please try again." }, 500);
  }
  function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});