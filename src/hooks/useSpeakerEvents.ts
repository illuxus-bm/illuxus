import { useQuery } from "@tanstack/react-query";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import type { SpeakerPortalEvent, SpeakerPortalEventDetails } from "@/types/portals";

/**
 * Fetches all events where the current user is assigned as a speaker.
 * Speakers are matched by email (speakers.email = auth.users.email).
 */
export function useSpeakerEvents() {
  const { user } = useAuth();

  return useQuery<SpeakerPortalEvent[]>({
    queryKey: ["speaker-events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabaseRpc("speaker_portal_events" as never);
      if (error) throw error;
      return ((data as unknown as SpeakerPortalEvent[]) ?? []);
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
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
