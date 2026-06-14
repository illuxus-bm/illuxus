import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/observability";
import type {
  MyApplications,
  SpeakerApplication,
  SponsorApplication,
  ApplicationStatus,
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
/**
 * Approve speaker application — does everything client-side to avoid RPC version drift.
 * The organizer can directly insert into speakers + event_speakers via RLS policies.
 */
export function useApproveSpeakerApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appId: string) => {
      // 1. Fetch the application details
      const { data: app, error: fetchErr } = await supabase
        .from("speaker_applications" as never)
        .select("*")
        .eq("id", appId)
        .single();
      if (fetchErr || !app) throw fetchErr || new Error("Application not found");

      const a = app as unknown as SpeakerApplication;

      // 2. Get the current user (the organizer doing the approving)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 3. Find or create the speakers row (owned by the organizer)
      let speakerId: string;
      const { data: existingSpeaker } = await supabase
        .from("speakers" as never)
        .select("id")
        .eq("user_id", user.id)
        .ilike("email", a.email)
        .maybeSingle();

      if (existingSpeaker) {
        speakerId = (existingSpeaker as unknown as { id: string }).id;
      } else {
        const { data: newSpeaker, error: speakerErr } = await supabase
          .from("speakers" as never)
          .insert({
            user_id: user.id,
            name: a.full_name,
            email: a.email,
            bio: a.bio,
            company: a.company,
            designation: a.job_title,
            linkedin_url: a.linkedin_url,
            mobile_country_code: a.mobile_country_code,
            mobile_number: a.mobile_number,
          } as never)
          .select("id")
          .single();
        if (speakerErr || !newSpeaker) throw speakerErr || new Error("Could not create speaker");
        speakerId = (newSpeaker as unknown as { id: string }).id;
      }

      // 4. Link to event (idempotent — UNIQUE constraint will protect against duplicates)
      const { error: linkErr } = await supabase
        .from("event_speakers" as never)
        .upsert({ event_id: a.event_id, speaker_id: speakerId } as never, {
          onConflict: "event_id,speaker_id",
        });
      if (linkErr) throw linkErr;

      // 5. Update application status
      const { error: updateErr } = await supabase
        .from("speaker_applications" as never)
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (updateErr) throw updateErr;

      // 6. Best-effort notification (non-fatal if app_notifications table doesn't exist yet)
      try {
        const { data: ev } = await supabase.from("events").select("title").eq("id", a.event_id).maybeSingle();
        await supabase.from("app_notifications" as never).insert({
          user_id: a.user_id,
          type: "speaker_approved",
          title: "Speaker application approved",
          body: `You have been approved as a speaker for ${ev?.title ?? "an event"}.`,
          link: "/speaker",
        } as never);
      } catch { /* notification is best-effort */ }

      return speakerId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-speaker-applications"] });
      qc.invalidateQueries({ queryKey: ["my-speaker-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["speaker-events"] });
    },
  });
}

export function useRejectSpeakerApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ appId, reason }: { appId: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: app } = await supabase
        .from("speaker_applications" as never)
        .select("user_id, event_id")
        .eq("id", appId)
        .single();
      const a = app as unknown as { user_id: string; event_id: string } | null;

      const { error } = await supabase
        .from("speaker_applications" as never)
        .update({
          status: "rejected",
          rejection_reason: reason ?? null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (error) throw error;

      // Best-effort notification
      if (a) {
        try {
          const { data: ev } = await supabase.from("events").select("title").eq("id", a.event_id).maybeSingle();
          await supabase.from("app_notifications" as never).insert({
            user_id: a.user_id,
            type: "speaker_rejected",
            title: "Speaker application not approved",
            body: `Your speaker application for ${ev?.title ?? "the event"} was not approved.${reason ? " Reason: " + reason : ""}`,
            link: "/u/me/applications",
          } as never);
        } catch { /* best-effort */ }
      }
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
      // 1. Fetch the application
      const { data: app, error: fetchErr } = await supabase
        .from("sponsor_applications" as never)
        .select("*")
        .eq("id", appId)
        .single();
      if (fetchErr || !app) throw fetchErr || new Error("Application not found");

      const a = app as unknown as SponsorApplication;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 2. Create sponsor row owned by the organizer
      const { data: newSponsor, error: sponsorErr } = await supabase
        .from("sponsors" as never)
        .insert({
          user_id: user.id,
          name: a.company_name,
          email: a.contact_email,
          logo_url: a.logo_url,
          website: a.company_website,
          tier: a.sponsorship_tier ?? "bronze",
          description: a.company_description,
        } as never)
        .select("id")
        .single();
      if (sponsorErr || !newSponsor) throw sponsorErr || new Error("Could not create sponsor");
      const sponsorId = (newSponsor as unknown as { id: string }).id;

      // 3. Link to event
      const { error: linkErr } = await supabase
        .from("event_sponsors" as never)
        .upsert({ event_id: a.event_id, sponsor_id: sponsorId } as never, {
          onConflict: "event_id,sponsor_id",
        });
      if (linkErr) throw linkErr;

      // 4. Auto-accept the applicant as a sponsor member (gives them portal access)
      const { error: memberErr } = await supabase
        .from("sponsor_members" as never)
        .upsert({
          sponsor_id: sponsorId,
          user_id: a.user_id,
          email: a.contact_email,
          display_name: a.contact_name,
          role: "admin",
          accepted_at: new Date().toISOString(),
          designation: a.contact_designation,
          mobile_country_code: a.contact_mobile_country_code,
          mobile_number: a.contact_mobile_number,
        } as never, {
          onConflict: "sponsor_id,email",
        });
      if (memberErr) {
        logger.warn("sponsor members upsert failed", {
          error_message: memberErr.message,
        });
      }

      // 5. Update application status
      const { error: updateErr } = await supabase
        .from("sponsor_applications" as never)
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (updateErr) throw updateErr;

      // 6. Best-effort notification
      try {
        const { data: ev } = await supabase.from("events").select("title").eq("id", a.event_id).maybeSingle();
        await supabase.from("app_notifications" as never).insert({
          user_id: a.user_id,
          type: "sponsor_approved",
          title: "Sponsor application approved",
          body: `Your company has been approved as a sponsor for ${ev?.title ?? "an event"}.`,
          link: "/sponsor",
        } as never);
      } catch { /* best-effort */ }

      return sponsorId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsor-applications"] });
      qc.invalidateQueries({ queryKey: ["my-sponsor-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["sponsor-events"] });
    },
  });
}

export function useRejectSponsorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ appId, reason }: { appId: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: app } = await supabase
        .from("sponsor_applications" as never)
        .select("user_id, event_id")
        .eq("id", appId)
        .single();
      const a = app as unknown as { user_id: string; event_id: string } | null;

      const { error } = await supabase
        .from("sponsor_applications" as never)
        .update({
          status: "rejected",
          rejection_reason: reason ?? null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (error) throw error;

      if (a) {
        try {
          const { data: ev } = await supabase.from("events").select("title").eq("id", a.event_id).maybeSingle();
          await supabase.from("app_notifications" as never).insert({
            user_id: a.user_id,
            type: "sponsor_rejected",
            title: "Sponsor application not approved",
            body: `Your sponsor application for ${ev?.title ?? "the event"} was not approved.${reason ? " Reason: " + reason : ""}`,
            link: "/u/me/applications",
          } as never);
        } catch { /* best-effort */ }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsor-applications"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    },
  });
}


// ─── Status-change mutations ──────────────────────────────────────────────────
// Lets organisers revise a previously made decision (e.g. approve → reject,
// rejected → pending, etc.) from the per-event applications panel.
//
// Side-effect rules:
//   - Transitioning OUT of "approved": delete the linked event_speakers /
//     event_sponsors row (and the matching webinar_speakers row, if any).
//     The speaker / sponsor record itself is NOT deleted because it may be
//     attached to other events or kept in the organiser's address book.
//   - Transitioning INTO "approved": run the same speaker/sponsor creation
//     and event linking logic the original approve mutation uses (idempotent
//     thanks to the unique constraints).
//   - Transitions between non-approved states (pending ↔ under_review ↔
//     rejected) only update the status row.
// In all cases we send a best-effort notification to the applicant so they
// see the revised decision in their /u/me/applications view.

export function useChangeSpeakerApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appId,
      newStatus,
      reason,
    }: {
      appId: string;
      newStatus: ApplicationStatus;
      reason?: string;
    }) => {
      const { data: app, error: fetchErr } = await supabase
        .from("speaker_applications" as never)
        .select("*")
        .eq("id", appId)
        .single();
      if (fetchErr || !app) throw fetchErr || new Error("Application not found");
      const a = app as unknown as SpeakerApplication;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const wasApproved = a.status === "approved";
      const willBeApproved = newStatus === "approved";

      // Revoking approval — drop the event link (and webinar_speakers entry).
      if (wasApproved && !willBeApproved) {
        const { data: spk } = await supabase
          .from("speakers" as never)
          .select("id")
          .eq("user_id", user.id)
          .ilike("email", a.email)
          .maybeSingle();
        const speakerId = (spk as { id: string } | null)?.id ?? null;
        if (speakerId) {
          await supabase
            .from("event_speakers" as never)
            .delete()
            .eq("event_id", a.event_id)
            .eq("speaker_id", speakerId);
        }
        const { data: sess } = await supabase
          .from("webinar_sessions" as never)
          .select("id")
          .eq("event_id", a.event_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const sessionId = (sess as { id: string } | null)?.id ?? null;
        if (sessionId && a.email) {
          await supabase
            .from("webinar_speakers" as never)
            .delete()
            .eq("session_id", sessionId)
            .eq("email", a.email);
        }
      }

      // Granting approval — create / locate the speaker record and link them.
      if (willBeApproved && !wasApproved) {
        let speakerId: string;
        const { data: existing } = await supabase
          .from("speakers" as never)
          .select("id")
          .eq("user_id", user.id)
          .ilike("email", a.email)
          .maybeSingle();
        if (existing) {
          speakerId = (existing as unknown as { id: string }).id;
        } else {
          const { data: created, error: spkErr } = await supabase
            .from("speakers" as never)
            .insert({
              user_id: user.id,
              name: a.full_name,
              email: a.email,
              bio: a.bio,
              company: a.company,
              designation: a.job_title,
              linkedin_url: a.linkedin_url,
              mobile_country_code: a.mobile_country_code,
              mobile_number: a.mobile_number,
            } as never)
            .select("id")
            .single();
          if (spkErr || !created) throw spkErr || new Error("Could not create speaker");
          speakerId = (created as unknown as { id: string }).id;
        }
        const { error: linkErr } = await supabase
          .from("event_speakers" as never)
          .upsert({ event_id: a.event_id, speaker_id: speakerId } as never, {
            onConflict: "event_id,speaker_id",
          });
        if (linkErr) throw linkErr;
      }

      const { error: updateErr } = await supabase
        .from("speaker_applications" as never)
        .update({
          status: newStatus,
          rejection_reason:
            newStatus === "rejected" ? (reason ?? a.rejection_reason ?? null) : null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (updateErr) throw updateErr;

      try {
        const { data: ev } = await supabase
          .from("events")
          .select("title")
          .eq("id", a.event_id)
          .maybeSingle();
        const eventTitle = (ev as { title?: string } | null)?.title ?? "an event";
        const notif = buildSpeakerStatusNotif(newStatus, eventTitle, reason);
        if (notif) {
          await supabase.from("app_notifications" as never).insert({
            user_id: a.user_id,
            ...notif,
          } as never);
        }
      } catch {
        /* notification is best-effort */
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-speaker-applications"] });
      qc.invalidateQueries({ queryKey: ["my-speaker-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["speaker-events"] });
    },
  });
}

export function useChangeSponsorApplicationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appId,
      newStatus,
      reason,
    }: {
      appId: string;
      newStatus: ApplicationStatus;
      reason?: string;
    }) => {
      const { data: app, error: fetchErr } = await supabase
        .from("sponsor_applications" as never)
        .select("*")
        .eq("id", appId)
        .single();
      if (fetchErr || !app) throw fetchErr || new Error("Application not found");
      const a = app as unknown as SponsorApplication;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const wasApproved = a.status === "approved";
      const willBeApproved = newStatus === "approved";

      // Revoking approval — drop the event link.
      if (wasApproved && !willBeApproved) {
        const { data: sp } = await supabase
          .from("sponsors" as never)
          .select("id")
          .eq("user_id", user.id)
          .ilike("email", a.contact_email)
          .maybeSingle();
        const sponsorId = (sp as { id: string } | null)?.id ?? null;
        if (sponsorId) {
          await supabase
            .from("event_sponsors" as never)
            .delete()
            .eq("event_id", a.event_id)
            .eq("sponsor_id", sponsorId);
        }
      }

      // Granting approval — recreate the sponsor record + link.
      if (willBeApproved && !wasApproved) {
        const { data: created, error: spErr } = await supabase
          .from("sponsors" as never)
          .insert({
            user_id: user.id,
            name: a.company_name,
            email: a.contact_email,
            logo_url: a.logo_url,
            website: a.company_website,
            tier: a.sponsorship_tier ?? "bronze",
            description: a.company_description,
          } as never)
          .select("id")
          .single();
        if (spErr || !created) throw spErr || new Error("Could not create sponsor");
        const sponsorId = (created as unknown as { id: string }).id;

        const { error: linkErr } = await supabase
          .from("event_sponsors" as never)
          .upsert({ event_id: a.event_id, sponsor_id: sponsorId } as never, {
            onConflict: "event_id,sponsor_id",
          });
        if (linkErr) throw linkErr;

        const { error: memberErr } = await supabase
          .from("sponsor_members" as never)
          .upsert(
            {
              sponsor_id: sponsorId,
              user_id: a.user_id,
              email: a.contact_email,
              display_name: a.contact_name,
              role: "admin",
              accepted_at: new Date().toISOString(),
              designation: a.contact_designation,
              mobile_country_code: a.contact_mobile_country_code,
              mobile_number: a.contact_mobile_number,
            } as never,
            { onConflict: "sponsor_id,email" },
          );
        if (memberErr) {
          logger.warn("sponsor members upsert failed", {
            error_message: memberErr.message,
          });
        }
      }

      const { error: updateErr } = await supabase
        .from("sponsor_applications" as never)
        .update({
          status: newStatus,
          rejection_reason:
            newStatus === "rejected" ? (reason ?? a.rejection_reason ?? null) : null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", appId);
      if (updateErr) throw updateErr;

      try {
        const { data: ev } = await supabase
          .from("events")
          .select("title")
          .eq("id", a.event_id)
          .maybeSingle();
        const eventTitle = (ev as { title?: string } | null)?.title ?? "an event";
        const notif = buildSponsorStatusNotif(newStatus, eventTitle, reason);
        if (notif) {
          await supabase.from("app_notifications" as never).insert({
            user_id: a.user_id,
            ...notif,
          } as never);
        }
      } catch {
        /* notification is best-effort */
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-sponsor-applications"] });
      qc.invalidateQueries({ queryKey: ["my-sponsor-application"] });
      qc.invalidateQueries({ queryKey: ["my-applications"] });
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["sponsor-events"] });
    },
  });
}

function buildSpeakerStatusNotif(
  status: ApplicationStatus,
  eventTitle: string,
  reason?: string,
): { type: string; title: string; body: string; link: string } | null {
  switch (status) {
    case "approved":
      return {
        type: "speaker_approved",
        title: "Speaker application approved",
        body: `You have been approved as a speaker for ${eventTitle}.`,
        link: "/speaker",
      };
    case "rejected":
      return {
        type: "speaker_rejected",
        title: "Speaker application not approved",
        body: `Your speaker application for ${eventTitle} was not approved.${
          reason ? " Reason: " + reason : ""
        }`,
        link: "/u/me/applications",
      };
    case "under_review":
      return {
        type: "speaker_under_review",
        title: "Speaker application under review",
        body: `Your speaker application for ${eventTitle} is being reviewed.`,
        link: "/u/me/applications",
      };
    case "pending":
      return {
        type: "speaker_pending",
        title: "Speaker application reopened",
        body: `Your speaker application for ${eventTitle} is back in the pending queue.`,
        link: "/u/me/applications",
      };
    default:
      return null;
  }
}

function buildSponsorStatusNotif(
  status: ApplicationStatus,
  eventTitle: string,
  reason?: string,
): { type: string; title: string; body: string; link: string } | null {
  switch (status) {
    case "approved":
      return {
        type: "sponsor_approved",
        title: "Sponsor application approved",
        body: `Your company has been approved as a sponsor for ${eventTitle}.`,
        link: "/sponsor",
      };
    case "rejected":
      return {
        type: "sponsor_rejected",
        title: "Sponsor application not approved",
        body: `Your sponsor application for ${eventTitle} was not approved.${
          reason ? " Reason: " + reason : ""
        }`,
        link: "/u/me/applications",
      };
    case "under_review":
      return {
        type: "sponsor_under_review",
        title: "Sponsor application under review",
        body: `Your sponsor application for ${eventTitle} is being reviewed.`,
        link: "/u/me/applications",
      };
    case "pending":
      return {
        type: "sponsor_pending",
        title: "Sponsor application reopened",
        body: `Your sponsor application for ${eventTitle} is back in the pending queue.`,
        link: "/u/me/applications",
      };
    default:
      return null;
  }
}
