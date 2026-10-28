import { supabase } from "@/integrations/supabase/client";

/** The reactions the live stage offers; the database accepts only these. */
export const REACTIONS = ["👏", "❤️", "🔥", "😂", "🎉", "👍"] as const;

/**
 * Posts a reaction to a live session through `webinar_react`, which checks
 * the sender belongs to it. A guest without an account is identified by the
 * personal link they opened the session with (`?join=` or `?speaker=`).
 * Resolves to an error message, or null once it is posted.
 */
export async function sendReaction(sessionId: string, emoji: string): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const { error } = await supabase.rpc("webinar_react" as never, {
    _session_id: sessionId,
    _emoji: emoji,
    _join_token: params.get("join"),
    _speaker_token: params.get("speaker"),
  } as never);
  return error ? error.message : null;
}
