import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { event_id, record_enabled = false } = await req.json();
    if (!event_id) return j({ error: "event_id required" }, 400);

    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) return j({ error: "Unauthenticated" }, 401);

    const { data: ev } = await supabase.from("events").select("id, user_id").eq("id", event_id).maybeSingle();
    if (!ev) return j({ error: "Event not found" }, 404);
    if (ev.user_id !== user.id) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roles) return j({ error: "Forbidden" }, 403);
    }

    // Reuse latest scheduled or live session if exists
    const { data: existing } = await supabase
      .from("webinar_sessions").select("*")
      .eq("event_id", event_id).in("status", ["scheduled", "live"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return j({ session: existing });

    const room = `event-${event_id.slice(0, 8)}-${Date.now().toString(36)}`;

    // Create room via LiveKit
    const url = Deno.env.get("LIVEKIT_WS_URL")!.replace(/^wss?:\/\//, "https://");
    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY")!,
      Deno.env.get("LIVEKIT_API_SECRET")!,
      { identity: "server" }
    );
    at.addGrant({ roomCreate: true });
    const adminJwt = await at.toJwt();
    await fetch(`${url}/twirp/livekit.RoomService/CreateRoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminJwt}` },
      body: JSON.stringify({ name: room, empty_timeout: 600, max_participants: 10000, metadata: JSON.stringify({ mode: "livestream", max_publishers: 10 }) }),
    });

    const { data: session, error } = await supabase.from("webinar_sessions").insert({
      event_id, livekit_room: room, status: "scheduled", record_enabled, created_by: user.id,
    }).select().single();
    if (error) return j({ error: error.message }, 500);

    return j({ session });
  } catch (e) {
    console.error(e);
    return j({ error: String(e) }, 500);
  }
  function j(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});