import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WebhookReceiver } from "https://esm.sh/livekit-server-sdk@2.9.7";
import { createEdgeLogger, toErrorFields } from "../_shared/edge-logger.ts";

const log = createEdgeLogger("livekit-webhook");

const receiver = new WebhookReceiver(
  Deno.env.get("LIVEKIT_API_KEY")!,
  Deno.env.get("LIVEKIT_API_SECRET")!,
);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const body = await req.text();
    const auth = req.headers.get("Authorization") || "";
    const event = await receiver.receive(body, auth);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const room = event.room?.name;
    if (!room) return new Response("ok");

    if (event.event === "room_finished") {
      await supabase.from("webinar_sessions").update({
        status: "ended", ended_at: new Date().toISOString(),
      }).eq("livekit_room", room);
      // Close any open attendance rows for this session
      const { data: s } = await supabase.from("webinar_sessions").select("id").eq("livekit_room", room).maybeSingle();
      if (s) {
        const now = new Date().toISOString();
        const { data: open } = await supabase.from("webinar_attendance").select("id, joined_at").eq("session_id", s.id).is("left_at", null);
        for (const row of open || []) {
          const dur = Math.max(0, Math.round((Date.parse(now) - Date.parse(row.joined_at)) / 1000));
          await supabase.from("webinar_attendance").update({ left_at: now, duration_seconds: dur }).eq("id", row.id);
        }
      }
    } else if (event.event === "egress_ended") {
      const file = (event as any).egressInfo?.fileResults?.[0]?.location || (event as any).egressInfo?.file?.location;
      if (file) {
        await supabase.from("webinar_sessions").update({ recording_url: file }).eq("livekit_room", room);
      }
    } else if (event.event === "participant_joined") {
      const { data: s } = await supabase.from("webinar_sessions").select("id, viewer_peak, publisher_peak").eq("livekit_room", room).maybeSingle();
      if (s) {
        const p = (event as any).participant || {};
        const isPub = p.permission?.canPublish;
        const identity = p.identity || crypto.randomUUID();
        const name = p.name || null;
        let userId: string | null = null;
        try { if (identity && identity.length >= 32) userId = identity; } catch { /* ignore */ }
        // Insert attendance row (idempotent for currently-open identity)
        const { data: existing } = await supabase.from("webinar_attendance")
          .select("id").eq("session_id", s.id).eq("identity", identity).is("left_at", null).maybeSingle();
        if (!existing) {
          await supabase.from("webinar_attendance").insert({
            session_id: s.id, identity, user_id: userId, display_name: name,
            role: isPub ? "speaker" : "viewer",
          });
        }
        if (isPub) {
          await supabase.from("webinar_sessions").update({ publisher_peak: Math.max(s.publisher_peak, s.publisher_peak + 1) }).eq("id", s.id);
        } else {
          await supabase.from("webinar_sessions").update({ viewer_peak: Math.max(s.viewer_peak, s.viewer_peak + 1) }).eq("id", s.id);
        }
      }
    } else if (event.event === "participant_left") {
      const { data: s } = await supabase.from("webinar_sessions").select("id, attendance_minutes").eq("livekit_room", room).maybeSingle();
      if (s) {
        const p = (event as any).participant || {};
        const identity = p.identity;
        if (identity) {
          const { data: row } = await supabase.from("webinar_attendance")
            .select("id, joined_at").eq("session_id", s.id).eq("identity", identity).is("left_at", null)
            .order("joined_at", { ascending: false }).limit(1).maybeSingle();
          if (row) {
            const now = new Date().toISOString();
            const dur = Math.max(0, Math.round((Date.parse(now) - Date.parse(row.joined_at)) / 1000));
            await supabase.from("webinar_attendance").update({ left_at: now, duration_seconds: dur }).eq("id", row.id);
            await supabase.from("webinar_sessions").update({ attendance_minutes: (s.attendance_minutes || 0) + Math.round(dur / 60) }).eq("id", s.id);
          }
        }
      }
    }
    return new Response("ok");
  } catch (e) {
    log.error("webhook error", toErrorFields(e));
    return new Response("ok");
  }
});