import { createClient } from "../_vendor/esm.sh/@supabase/supabase-js@2.108.1/_entry.mjs";
import { AccessToken } from "../_vendor/esm.sh/livekit-server-sdk@2.9.7/_entry.mjs";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import { sessionMeetsTwoFactor } from "../_shared/auth.ts";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";
import { hlsEnabled, startHlsEgress } from "../_shared/webinar-hls.ts";

const log = createEdgeLogger("livekit-go-live");

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handlePreflight(req, corsHeaders);
  if (preflight) return preflight;
  try {
    const { session_id } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return j({ error: "Unauthenticated" }, 401);
    if (!sessionMeetsTwoFactor(user, auth.replace("Bearer ", ""))) return j({ error: "Two-factor verification required" }, 401);

    const { data: session } = await supabase.from("webinar_sessions").select("id, event_id, livekit_room, record_enabled").eq("id", session_id).maybeSingle();
    if (!session) return j({ error: "Not found" }, 404);
    const { data: ev } = await supabase.from("events").select("user_id").eq("id", session.event_id).maybeSingle();
    if (ev?.user_id !== user.id) {
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
      if (!r) return j({ error: "Forbidden" }, 403);
    }

    // Recording is now host-controlled via the recording-start / recording-stop
    // functions. Just flip the session to live here.
    await supabase.from("webinar_sessions").update({
      status: "live",
      started_at: new Date().toISOString(),
    }).eq("id", session_id);

    // Viewers watch over HLS, not in the room: start their stream now. The
    // session is live either way; `hls.started` tells the studio whether
    // the audience has something to watch.
    let hls: { started: boolean } | null = null;
    if (hlsEnabled()) {
      const at = new AccessToken(Deno.env.get("LIVEKIT_API_KEY")!, Deno.env.get("LIVEKIT_API_SECRET")!, { identity: "server" });
      at.addGrant({ roomRecord: true, room: session.livekit_room });
      const started = await startHlsEgress(session.livekit_room, await at.toJwt());
      if (started.error) log.error("hls egress start failed", { error_message: started.error });
      hls = { started: !!started.egress_id };
    }
    return j({ ok: true, hls });
  } catch (e) {
    // Details stay in the logs; callers get a generic message.
    log.error("unhandled error", toErrorFields(e));
    return j({ error: "Something went wrong. Please try again." }, 500);
  }
  function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});