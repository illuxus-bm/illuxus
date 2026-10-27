import { useQuery } from "@tanstack/react-query";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import type { SpeakerPortalEvent, SpeakerPortalEventDetails } from "@/types/portals";

/**
 * Fetches all events where the current user is assigned as a speaker.
 * Speakers are matched by user_id or email (speakers.email = auth.users.email).
 *
 * The RPC returns one row per (event, speaker record). A user often has
 * several speaker records — one per organizer that added them — so the
 * same event can come back more than once. Rows are merged per event
 * here: duplicate cards inflated the counts and, sharing a React key,
 * left stale cards on screen when switching the Upcoming / Past tabs.
 */
export function useSpeakerEvents() {
  const { user } = useAuth();

  return useQuery<SpeakerPortalEvent[]>({
    queryKey: ["speaker-events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabaseRpc("speaker_portal_events" as never);
      if (error) throw error;
      return dedupeByEvent((data as unknown as SpeakerPortalEvent[]) ?? []);
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

/** One row per event; session counts from each speaker record are added up. */
function dedupeByEvent(rows: SpeakerPortalEvent[]): SpeakerPortalEvent[] {
  const byEvent = new Map<string, SpeakerPortalEvent>();
  for (const row of rows) {
    const existing = byEvent.get(row.event_id);
    if (existing) {
      existing.session_count = Number(existing.session_count || 0) + Number(row.session_count || 0);
    } else {
      byEvent.set(row.event_id, { ...row, session_count: Number(row.session_count || 0) });
    }
  }
  return Array.from(byEvent.values());
}

/**
 * Fetches detailed information for a single speaking event:
 * event details, speaker profile, assigned sessions, and audience analytics.
 */
export function useSpeakerEventDetails(eventId: string | undefined) {
  const { user } = useAuth();

  return useQuery<SpeakerPortalEventDetails | null>({
    queryKey: ["speaker-event-details", user?.id, eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabaseRpc("speaker_portal_event_details" as never, { _eid: eventId } as never);
      if (error) throw error;
      return (data as unknown as SpeakerPortalEventDetails) ?? null;
    },
    enabled: !!user && !!eventId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
