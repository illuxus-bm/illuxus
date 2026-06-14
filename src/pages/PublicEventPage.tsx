import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import {
  RendererEvent, RendererSpeaker, RendererSession, RendererSponsor,
} from "@/components/event/page-form/PublicEventRenderer";
import { normalizeConfig } from "@/components/event/page-form/types";
import { checkRouteParam, isUuid } from "@/lib/event-routes";
import PreviewHostBanner from "@/components/PreviewHostBanner";
import SiteHeader from "@/components/SiteHeader";
import EventRsvpCard from "@/components/EventRsvpCard";
import EventPagePreview from "@/components/event/page-form/EventPagePreview";
import { EventApplicationButtons } from "@/components/applications/EventApplicationButtons";
import LiveStatusBanner from "@/components/event/LiveStatusBanner";
import { useTheme } from "@/contexts/ThemeContext";
import { validateTheme } from "@/lib/theme-contrast";

// Sponsors are ordered purely by their display_order in event_sponsors,
// which the organizer controls via drag-and-drop (both within tiers and across tier groups).

interface AttendeeSample { name: string | null; avatar_url: string | null }

const PublicEventPage = () => {
  const { id, eventSlug, orgSlug } = useParams<{ id?: string; eventSlug?: string; orgSlug?: string }>();
  const location = useLocation();
  const { theme: appTheme } = useTheme();
  const [event, setEvent] = useState<(RendererEvent & { page_config: unknown }) | null>(null);
  const [speakers, setSpeakers] = useState<RendererSpeaker[]>([]);
  const [sessions, setSessions] = useState<RendererSession[]>([]);
  const [sponsors, setSponsors] = useState<RendererSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [org, setOrg] = useState<{ name: string; logo_url: string | null; slug: string; subdomain?: string | null } | null>(null);
  const [going, setGoing] = useState<{ count: number; sample: AttendeeSample[] }>({ count: 0, sample: [] });

  // Robust hash scroll: wait for the target element to mount (sessions/sections
  // can arrive after first paint), then smooth-scroll and flash a highlight.
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    if (!hash || loading) return;
    let cancelled = false;
    let frames = 0;
    const maxFrames = 60; // ~1s at 60fps
    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.remove("agenda-flash");
        // force reflow so the animation can restart on repeat clicks
        void el.offsetWidth;
        el.classList.add("agenda-flash");
        window.setTimeout(() => el.classList.remove("agenda-flash"), 1800);
        return;
      }
      if (frames++ < maxFrames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [location.hash, location.key, loading, sessions.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // /events/:id — id may be a UUID or a slug (after slug-editing feature)
      if (id) {
        // Public URLs should always be slugs after slug-editing — log when we see a UUID.
        checkRouteParam("/events/:id", "id", id, "slug");
        if (isUuid(id)) {
          if (!cancelled) setResolvedId(id);
        } else {
          const { data } = await supabaseRpc("get_event_by_slug", { _slug: id });
          const row = (data && data[0]) || null;
          if (!cancelled) {
            if (row?.id) setResolvedId(row.id);
            else setLoading(false);
          }
        }
        return;
      }
      // /org/:orgSlug/events/:eventSlug — always a slug
      if (eventSlug) {
        checkRouteParam("/org/:orgSlug/events/:eventSlug", "eventSlug", eventSlug, "slug");
        checkRouteParam("/org/:orgSlug/events/:eventSlug", "orgSlug", orgSlug, "slug");
        const { data } = await supabaseRpc("get_event_by_slug", {
          _slug: eventSlug, _org_slug: orgSlug ?? undefined,
        });
        const row = (data && data[0]) || null;
        if (!cancelled) {
          if (row?.id) setResolvedId(row.id);
          else setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id, eventSlug, orgSlug]);

  useEffect(() => {
    if (!resolvedId) return;
    loadAll(resolvedId);
    // Realtime: refresh when speakers/sponsors/sessions/event change.
    const debounce = (fn: () => void) => {
      let t: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(fn, 250);
      };
    };
    const refresh = debounce(() => loadAll(resolvedId));
    const ch = supabase
      .channel(`public-event-${resolvedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_speakers", filter: `event_id=eq.${resolvedId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_sponsors", filter: `event_id=eq.${resolvedId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `event_id=eq.${resolvedId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${resolvedId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "speakers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sponsors" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId]);

  const loadAll = useCallback(async (eid: string) => {
    const [evRes, spkRel, sesRes, spRel, attRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", eid).single(),
      supabase.from("event_speakers").select("speaker_id, display_order").eq("event_id", eid).order("display_order"),
      supabase.from("sessions").select("*").eq("event_id", eid).order("start_time"),
      supabase.from("event_sponsors").select("sponsor_id, display_order").eq("event_id", eid).order("display_order"),
      supabaseRpc("get_event_attendees_public", { _event_id: eid, _limit: 12 }),
    ]);

    if (evRes.data) setEvent(evRes.data as never);
    const sessList = (sesRes.data as RendererSession[]) || [];
    if (sessList.length) {
      const { data: ss } = await supabase
        .from("session_speakers")
        .select("session_id, speaker_id")
        .in("session_id", sessList.map((s) => s.id));
      const map = new Map<string, string[]>();
      (ss || []).forEach((r: any) => {
        const arr = map.get(r.session_id) || [];
        arr.push(r.speaker_id);
        map.set(r.session_id, arr);
      });
      sessList.forEach((s) => { s.speaker_ids = map.get(s.id) || (s.speaker_id ? [s.speaker_id] : []); });
    }
    setSessions(sessList);

    const spkRows = (spkRel.data || []) as Array<{ speaker_id: string; display_order: number }>;
    const spkIds = spkRows.map((s) => s.speaker_id);
    if (spkIds.length) {
      const { data } = await supabase.from("speakers").select("*").in("id", spkIds);
      const orderMap = new Map(spkRows.map((r, i) => [r.speaker_id, i]));
      const sorted = ((data as RendererSpeaker[]) || []).slice().sort(
        (a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999)
      );
      setSpeakers(sorted);
    } else {
      setSpeakers([]);
    }

    const spRows = (spRel.data || []) as Array<{ sponsor_id: string; display_order: number }>;
    const spIds = spRows.map((s) => s.sponsor_id);
    if (spIds.length) {
      const { data } = await supabase.from("sponsors").select("*").in("id", spIds);
      const orderMap = new Map(spRows.map((r, i) => [r.sponsor_id, i]));
      const sorted = (data || []).slice().sort(
        (a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999)
      );
      setSponsors(sorted as RendererSponsor[]);
    } else {
      setSponsors([]);
    }

    const attRow = (attRes.data && (attRes.data as unknown as Array<{ going_count: number; attendees: AttendeeSample[] }>)[0]) || null;
    if (attRow) {
      setGoing({
        count: Number(attRow.going_count) || 0,
        sample: Array.isArray(attRow.attendees) ? attRow.attendees : [],
      });
    }

    const orgId = (evRes.data as { org_id?: string | null } | null)?.org_id;
    if (orgId) {
      const { data: orgRows } = await supabaseRpc("get_public_org_brief", { _org_id: orgId });
      const orgRow = Array.isArray(orgRows) ? orgRows[0] : orgRows;
      if (orgRow) setOrg(orgRow as { name: string; logo_url: string | null; slug: string; subdomain?: string | null });
    }

    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="pt-10 container mx-auto px-4 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-10">
          <Skeleton className="aspect-[4/5] md:aspect-[16/9] rounded-2xl" />
          <div>
            <Skeleton className="h-10 w-2/3 mb-4" />
            <Skeleton className="h-5 w-1/2 mb-2" />
            <Skeleton className="h-5 w-1/3 mb-6" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="pt-16 container mx-auto px-4 text-center">
          <p className="text-muted-foreground">Event not found.</p>
          <Button variant="ghost" asChild className="mt-4">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const config = normalizeConfig((event as { page_config: unknown }).page_config);
  // Guard against unreadable organizer-picked theme combos (e.g. cream text on
  // a pale background). Falls back to a contrast-safe text colour when the
  // chosen pair fails WCAG AA. See `src/lib/theme-contrast.ts`.
  config.theme = { ...config.theme, ...validateTheme(config.theme).theme };
  // App-level dark mode: only adapt when the organizer chose a LIGHT preset.
  // Dark presets (Carbon, Neon Night, Tech Cyan, Violet Dark…) already define
  // their own dark palette and must be honored as-is so the preset identity
  // is preserved end-to-end. For light presets in app dark mode we swap to a
  // neutral dark canvas so visitors aren't blinded, but keep the preset's
  // primary/accent so the brand stays intact.
  if (appTheme === "dark") {
    const hex = (config.theme.backgroundColor || "#ffffff").replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16) || 255;
    const g = parseInt(full.slice(2, 4), 16) || 255;
    const b = parseInt(full.slice(4, 6), 16) || 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const isLightPreset = lum > 0.55;
    if (isLightPreset) {
      config.theme = {
        ...config.theme,
        backgroundColor: "#0a0a0a",
        textColor: "#fafafa",
      };
      config.sections = config.sections.map((section) => {
        if (!section.themeOverride) return section;
        const { backgroundColor: _bg, textColor: _tx, ...rest } = section.themeOverride;
        return { ...section, themeOverride: Object.keys(rest).length ? rest : undefined };
      });
    }
  }
  const eventExt = event as RendererEvent & {
    page_config: unknown; timezone?: string | null; requires_approval?: boolean | null;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: config.theme.backgroundColor }}>
      <PreviewHostBanner />
      {event.id && (
        <LiveStatusBanner
          eventId={event.id}
          eventDate={event.date}
          eventFormat={(event as { event_format?: string | null }).event_format}
          eventSlug={event.slug}
        />
      )}
      {/* Header (and any future footer) must NOT inherit the event's
          design theme — keep them in the app's default chrome so they stay
          readable across every preset and in both light/dark app modes. */}
      <SiteHeader
        homeHref={(org?.subdomain || org?.slug) ? `/org/${org?.subdomain || org?.slug}` : "/"}
      />

      <EventPagePreview
        config={config}
        event={eventExt}
        speakers={speakers}
        sessions={sessions}
        sponsors={sponsors}
        org={org}
        going={going}
        darkMode={appTheme === "dark"}
        registrationSlot={<EventRsvpCard event={event as never} accentColor={config.theme.primaryColor} />}
      />

      {/* Speaker & Sponsor application CTAs — shown to logged-in attendees */}
      {event && eventExt.status === "published" && (
        <div className="max-w-4xl mx-auto px-4 py-2">
          <EventApplicationButtons
            eventId={event.id}
            eventOwnerId={(event as { user_id?: string }).user_id ?? null}
            speakerEnabled={(event as { speaker_applications_enabled?: boolean | null }).speaker_applications_enabled ?? true}
            sponsorEnabled={(event as { sponsor_applications_enabled?: boolean | null }).sponsor_applications_enabled ?? true}
          />
        </div>
      )}
    </div>
  );
};

export default PublicEventPage;
