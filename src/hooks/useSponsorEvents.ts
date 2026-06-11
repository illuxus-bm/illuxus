import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SponsorPortalEvent, SponsorPortalPerson } from "@/types/portals";

/**
 * Fetches all events where the current user is assigned as a sponsor member.
 */
export function useSponsorEvents() {
  const { user } = useAuth();

  return useQuery<SponsorPortalEvent[]>({
    queryKey: ["sponsor-events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sponsor_portal_events" as never);
      if (error) throw error;
      return ((data as unknown as SponsorPortalEvent[]) ?? []);
    },
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

/**
 * Fetches the people list (speakers + attendees) for a sponsored event.
 */
export function useSponsorEventPeople(eventId: string | undefined) {
  const { user } = useAuth();

  return useQuery<SponsorPortalPerson[]>({
    queryKey: ["sponsor-event-people", user?.id, eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase.rpc("sponsor_portal_people" as never, { _eid: eventId } as never);
      if (error) throw error;
      return ((data as unknown as SponsorPortalPerson[]) ?? []);
    },
    enabled: !!user && !!eventId,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
  });
}
