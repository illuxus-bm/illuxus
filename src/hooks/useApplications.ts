import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  MyApplications,
  SpeakerApplication,
  SponsorApplication,
} from "@/types/applications";

/**
 * Returns the current user's speaker and sponsor applications.
 * Uses direct table queries (RLS policies allow users to see their own apps).
 */
export function useMyApplications() {
  const { user } = useAuth();
  return useQuery<MyApplications>({
    queryKey: ["my-applications", user?.id],
    queryFn: async () => {
      if (!user) return { speaker: [], sponsor: [] };
      const [speakerRes, sponsorRes] = await Promise.all([
        supabase
          .from("speaker_applications" as never)
          .select("id, event_id, session_title, expertise, status, rejection_reason, created_at, updated_at, events(title, date, image_url)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("sponsor_applications" as never)
          .select("id, event_id, company_name, sponsorship_tier, status, rejection_reason, created_at, updated_at, events(title, date, image_url)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      type SpeakerRow = {
        id: string; event_id: string; session_title: string; expertise: string | null;
        status: string; rejection_reason: string | null; created_at: string; updated_at: string;
        events: { title: string; date: string | null; image_url: string | null } | null;
      };
      type SponsorRow = {
        id: string; event_id: string; company_name: string; sponsorship_tier: string | null;
        status: string; rejection_reason: string | null; created_at: string; updated_at: string;
        events: { title: string; date: string | null; image_url: string | null } | null;
      };

      const speaker = ((speakerRes.data ?? []) as unknown as SpeakerRow[]).map((r) => ({
        id: r.id,
        event_id: r.event_id,
        event_title: r.events?.title ?? "Unknown event",
        event_date: r.events?.date ?? null,
        image_url: r.events?.image_url ?? null,
        session_title: r.session_title,
        expertise: r.expertise,
        status: r.status as MyApplications["speaker"][number]["status"],
        rejection_reason: r.rejection_reason,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      const sponsor = ((sponsorRes.data ?? []) as unknown as SponsorRow[]).map((r) => ({
        id: r.id,
        event_id: r.event_id,
        event_title: r.events?.title ?? "Unknown event",
        event_date: r.events?.date ?? null,
        image_url: r.events?.image_url ?? null,
        company_name: r.company_name,
        sponsorship_tier: r.sponsorship_tier,
        status: r.status as MyApplications["sponsor"][number]["status"],
        rejection_reason: r.rejection_reason,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      return { speaker, sponsor };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

/**
 * Has the current user already applied as a speaker for this event?
 */
export function useMySpeakerApplication(eventId: string | undefined) {
  const { user } = useAuth();
  return useQuery<SpeakerApplication | null>({
    queryKey: ["my-speaker-application", user?.id, eventId],
    queryFn: async () => {
      if (!user || !eventId) return null;
      const { data, error } = await supabase
        .from("speaker_applications" as never)
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        // 406 returns no rows — treat as no application
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return (data as unknown as SpeakerApplication) ?? null;
    },
    enabled: !!user && !!eventId,
    staleTime: 30_000,
  });
}

export function useMySponsorApplication(eventId: string | undefined) {
  const { user } = useAuth();
  return useQuery<SponsorApplication | null>({
    queryKey: ["my-sponsor-application", user?.id, eventId],
    queryFn: async () => {
      if (!user || !eventId) return null;
      const { data, error } = await supabase
        .from("sponsor_applications" as never)
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return (data as unknown as SponsorApplication) ?? null;
    },
    enabled: !!user && !!eventId,
    staleTime: 30_000,
  });
}

/**
 * Organizer view — list all applications for an event.
 */
export function useEventSpeakerApplications(eventId: string | undefined) {
  return useQuery<SpeakerApplication[]>({
    queryKey: ["event-speaker-applications", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("speaker_applications" as never)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as SpeakerApplication[]) ?? []);
    },
    enabled: !!eventId,
    staleTime: 15_000,
  });
}

export function useEventSponsorApplications(eventId: string | undefined) {
  return useQuery<SponsorApplication[]>({
    queryKey: ["event-sponsor-applications", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("sponsor_applications" as never)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown as SponsorApplication[]) ?? []);
    },
    enabled: !!eventId,
    staleTime: 15_000,
  });
}

/**
 * Mutations: approve/reject/submit.
 */
export function useApproveSpeakerApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appId: string) => {
      const { data, error } = await supabase.rpc("approve_speaker_application" as never, { _app_id: appId } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_, appId) => {
      qc.invalidateQueries({ queryKey: ["event-speaker-applications"] });
      qc.invalidateQueries({ queryKey: ["my-speaker-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      // Notify the user — touch app id to silence linter
      void appId;
    },
  });
}

export function useRejectSpeakerApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ appId, reason }: { appId: string; reason?: string }) => {
      const { error } = await supabase.rpc("reject_speaker_application" as never, { _app_id: appId, _reason: reason || null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-speaker-applications"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });
}

export function useApproveSponsorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appId: string) => {
      const { data, error } = await supabase.rpc("approve_sponsor_application" as never, { _app_id: appId } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsor-applications"] });
      qc.invalidateQueries({ queryKey: ["my-sponsor-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
    },
  });
}

export function useRejectSponsorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ appId, reason }: { appId: string; reason?: string }) => {
      const { error } = await supabase.rpc("reject_sponsor_application" as never, { _app_id: appId, _reason: reason || null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsor-applications"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });
}
