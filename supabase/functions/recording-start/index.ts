import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { session_id } = await req.json();
    if (!session_id) return j({ error: "session_id required" }, 400);
    const auth = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return j({ error: "Unauthenticated" }, 401);

    const { data: session } = await supabase.from("webinar_sessions")
      .select("id, event_id, livekit_room, status, egress_id").eq("id", session_id).maybeSingle();
    if (!session) return j({ error: "Not found" }, 404);
    if (session.status !== "live") return j({ error: "Session is not live yet" }, 409);
    if (session.egress_id) return j({ ok: true, egress_id: session.egress_id, already: true });

    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    if (ev?.user_id !== user.id) {
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!r) return j({ error: "Forbidden" }, 403);
    }

    const url = Deno.env.get("LIVEKIT_WS_URL")!.replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(Deno.env.get("LIVEKIT_API_KEY")!, Deno.env.get("LIVEKIT_API_SECRET")!, { identity: "server" });
    at.addGrant({ roomRecord: true, room: session.livekit_room });
    const jwt = await at.toJwt();
    const res = await fetch(`${url}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
      body: JSON.stringify({
        room_name: session.livekit_room,
        layout: "speaker",
        file_outputs: [{ filepath: `${session.livekit_room}/recording.mp4` }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return j({ error: `Egress start failed: ${txt}` }, 502);
    }
    const data = await res.json();
    const egressId = data.egress_id || null;
    await supabase.from("webinar_sessions").update({
      egress_id: egressId,
      record_enabled: true,
    }).eq("id", session_id);
    return j({ ok: true, egress_id: egressId });
  } catch (e) { return j({ error: String(e) }, 500); }
  function j(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});