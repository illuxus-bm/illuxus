import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";

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

    const url = Deno.env.get("LIVEKIT_WS_URL")!.replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(Deno.env.get("LIVEKIT_API_KEY")!, Deno.env.get("LIVEKIT_API_SECRET")!, { identity: "server" });
    at.addGrant({ roomAdmin: true, room: session.livekit_room });
    const jwt = await at.toJwt();

    if (action === "promote") {
      // Cap check
      const list = await fetch(`${url}/twirp/livekit.RoomService/ListParticipants`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
        body: JSON.stringify({ room: session.livekit_room }),
      }).then(r => r.json()).catch(() => ({ participants: [] }));
      const pubCount = (list.participants || []).filter((p: any) => p.permission?.canPublish).length;
      if (pubCount >= MAX) return j({ error: "Stage is full (10/10)" }, 409);
      if (!self) {
        await supabase.from("webinar_stage_requests").update({ status: "accepted" })
          .eq("session_id", session_id).eq("user_id", target_user_id);
      }
    } else {
      if (!self) {
        await supabase.from("webinar_stage_requests").update({ status: "cancelled" })
          .eq("session_id", session_id).eq("user_id", target_user_id);
      }
    }

    const can = action === "promote";
    await fetch(`${url}/twirp/livekit.RoomService/UpdateParticipant`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        room: session.livekit_room,
        identity: target_user_id,
        permission: { can_publish: can, can_subscribe: true, can_publish_data: true },
      }),
    });
    return j({ ok: true });
  } catch (e) { return j({ error: String(e) }, 500); }
  function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});