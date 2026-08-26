/**
 * BrochureConfiguratorDialog — the Brochure_Configurator UI for the
 * Event Brochure Generator.
 *
 * Mirrors `CreativeGeneratorDialog.tsx`'s two-pane dialog structure: a
 * scrollable left settings pane (Brochure_Theme picker, color/font
 * overrides, section reorder/include list, "save as event default"
 * toggle) and a right pane hosting the live `BrochurePreviewFrame`.
 *
 * On open, fetches everything the brochure needs for `eventId` — the event
 * row, sessions (with per-session speaker names resolved via the
 * `session_speakers` join, falling back to each session's legacy
 * `speaker_id` column exactly like `SessionManagement.tsx`'s `fetchData`),
 * linked speakers (`event_speakers` -> `speakers`), and linked sponsors
 * (`event_sponsors` -> `sponsors`) — never throwing; a failed query is
 * logged and degrades to an empty array/`null` so the dialog still opens
 * (Requirements 1.1, 3.2, 3.3, 7.1).
 *
 * The Brochure_Theme, color/font override, and Section_Layout selections
 * hydrate once (the first time the dialog opens in this component's
 * lifetime) from `readBrochurePrefs(normalizeConfig(eventPageConfig))`,
 * falling back to `BROCHURE_THEMES[0]` + `DEFAULT_SECTION_LAYOUT` — and
 * then persist across further open/close cycles within the same session,
 * since re-hydrating on every re-open would silently discard an organizer's
 * in-progress (not-yet-saved) choices. Purely transient state (the "save as
 * event default" checkbox, in-flight generation/progress) resets on every
 * open, mirroring `CreativeGeneratorDialog.tsx`'s open-reset effect.
 *
 * Color/font overrides are applied ONLY to the generated PDF via
 * `BrochureThemeOverride` — never written back to `eventPageConfig.theme`
 * (Requirement 1.4).
 *
 * The primary "Download brochure" action calls `downloadBrochurePdf`,
 * driving a `Progress` bar from its `onProgress` callback (Requirement
 * 9.3). A failure is caught, logged via
 * `logger.error("brochure generation failed", { event_id, error_message })`,
 * and surfaced as a `toast.error` while the dialog stays open so the
 * organizer can retry (Requirements 9.1, 9.2).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

import BrochureSectionList from "./BrochureSectionList";
import BrochurePreviewFrame from "./BrochurePreviewFrame";
import BrochureEditorDialog from "./BrochureEditorDialog";

import {
  BROCHURE_THEMES,
  CORPORATE_BOLD_SECTION_LAYOUT,
  DEFAULT_SECTION_LAYOUT,
  POSTER_BOLD_SECTION_LAYOUT,
  readBrochurePrefs,
  resolveBrochureTheme,
  resolveSectionLayout,
  saveBrochurePrefs,
  type BrochureTheme,
  type BrochureThemeOverride,
  type EventThemeInput,
  type SectionLayout,
} from "@/lib/brochure/brochure-templates";
import { downloadBrochurePdf, type BrochureGenerationInput } from "@/lib/brochure/brochure-pdf";
import type {
  AgendaSessionInput,
  SpeakerInput,
  SponsorInput,
  VenueLogisticsInput,
} from "@/lib/brochure/brochure-sections";
import { COLOR_SWATCHES, FONT_OPTIONS } from "@/components/event/page-form/presets";
import { normalizeConfig, type DateVenueData, type EventPageConfig } from "@/components/event/page-form/types";

interface BrochureConfiguratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventPageConfig: EventPageConfig; // for reading/writing brochurePrefs and theme colors
  onConfigChange: (config: EventPageConfig) => void; // caller persists via supabase.from("events").update({ page_config })
}

/** Raw `events` columns the Cover_Section and Venue_Logistics_Section need. */
interface BrochureEventRow {
  title: string;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  image_url: string | null;
  banner_landscape_url: string | null;
  banner_portrait_url: string | null;
}

/** Raw `sessions` row shape needed to resolve the Agenda_Section's
 *  per-session speaker names (session_speakers join + legacy `speaker_id`
 *  fallback). */
interface SessionRow {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  speaker_id: string | null;
}

/**
 * Fetches every entity the brochure needs for `eventId`: the event row,
 * sessions (with speaker names resolved via the `session_speakers` join,
 * falling back to each session's own legacy `speaker_id` column when no
 * `session_speakers` rows exist for it — mirroring `SessionManagement.tsx`'s
 * `fetchData` exactly:
 * `linkMap.get(s.id) || (s.speaker_id ? [s.speaker_id] : [])`), linked
 * speakers (`event_speakers` -> `speakers`, ordered by `display_order`),
 * and linked sponsors (`event_sponsors` -> `sponsors`, ordered by
 * `display_order`). Any dangling speaker reference (a speaker id with no
 * matching `speakers` row) is filtered out of a session's `speakerNames`
 * before it reaches `buildAgendaRows`. Never throws — a failed query is
 * logged via `logger.error` and degrades to an empty array/`null` so the
 * dialog still opens.
 */
async function fetchBrochureData(eventId: string): Promise<{
  event: BrochureEventRow | null;
  sessions: AgendaSessionInput[];
  speakers: SpeakerInput[];
  sponsors: SponsorInput[];
}> {
  const [eventRes, sessionsRes, eventSpeakersRes, eventSponsorsRes] = await Promise.all([
    supabase
      .from("events")
      .select("title, date, end_date, venue, location, image_url, banner_landscape_url, banner_portrait_url")
      .eq("id", eventId)
      .single(),
    supabase
      .from("sessions")
      .select("id, title, description, start_time, end_time, speaker_id")
      .eq("event_id", eventId)
      .order("start_time"),
    supabase.from("event_speakers").select("speaker_id, display_order").eq("event_id", eventId).order("display_order"),
    supabase.from("event_sponsors").select("sponsor_id, display_order").eq("event_id", eventId).order("display_order"),
  ]);

  if (eventRes.error) {
    logger.error("brochure configurator event fetch failed", {
      event_id: eventId,
      error_message: eventRes.error.message,
    });
  }
  if (sessionsRes.error) {
    logger.error("brochure configurator sessions fetch failed", {
      event_id: eventId,
      error_message: sessionsRes.error.message,
    });
  }
  if (eventSpeakersRes.error) {
    logger.error("brochure configurator event speakers fetch failed", {
      event_id: eventId,
      error_message: eventSpeakersRes.error.message,
    });
  }
  if (eventSponsorsRes.error) {
    logger.error("brochure configurator event sponsors fetch failed", {
      event_id: eventId,
      error_message: eventSponsorsRes.error.message,
    });
  }

  const sessionRows = (sessionsRes.data ?? []) as SessionRow[];

  // session_speakers join, falling back to each session's legacy
  // `speaker_id` column when no session_speakers rows exist for it —
  // mirrors SessionManagement.tsx's fetchData exactly.
  const linkMap = new Map<string, string[]>();
  if (sessionRows.length > 0) {
    const { data: ss, error: ssError } = await supabase
      .from("session_speakers")
      .select("session_id, speaker_id")
      .in(
        "session_id",
        sessionRows.map((s) => s.id)
      );
    if (ssError) {
      logger.error("brochure configurator session_speakers fetch failed", {
        event_id: eventId,
        error_message: ssError.message,
      });
    }
    (ss ?? []).forEach((r) => {
      const arr = linkMap.get(r.session_id) || [];
      arr.push(r.speaker_id);
      linkMap.set(r.session_id, arr);
    });
  }

  const sessionSpeakerIds = sessionRows.map((s) => ({
    session: s,
    speakerIds: linkMap.get(s.id) || (s.speaker_id ? [s.speaker_id] : []),
  }));

  // Resolve every referenced speaker id (session_speakers rows + legacy
  // fallback ids) to a name, filtering out any dangling reference (a
  // speaker that was deleted/unlinked) BEFORE it reaches `buildAgendaRows`.
  const allSessionSpeakerIds = Array.from(new Set(sessionSpeakerIds.flatMap(({ speakerIds }) => speakerIds)));
  const sessionSpeakerNames = new Map<string, string>();
  if (allSessionSpeakerIds.length > 0) {
    const { data: nameRows, error: nameError } = await supabase
      .from("speakers")
      .select("id, name")
      .in("id", allSessionSpeakerIds);
    if (nameError) {
      logger.error("brochure configurator session speaker names fetch failed", {
        event_id: eventId,
        error_message: nameError.message,
      });
    }
    (nameRows ?? []).forEach((s) => sessionSpeakerNames.set(s.id, s.name));
  }

  const sessions: AgendaSessionInput[] = sessionSpeakerIds.map(({ session, speakerIds }) => ({
    id: session.id,
    title: session.title,
    description: session.description,
    start_time: session.start_time,
    end_time: session.end_time,
    speakerNames: speakerIds
      .map((id) => sessionSpeakerNames.get(id))
      .filter((name): name is string => !!name),
  }));

  // event_speakers -> speakers (Speakers_Section source), ordered by
  // display_order.
  const eventSpeakerLinks = eventSpeakersRes.data ?? [];
  let speakers: SpeakerInput[] = [];
  if (eventSpeakerLinks.length > 0) {
    const ids = eventSpeakerLinks.map((l) => l.speaker_id);
    const { data: speakerRows, error: speakerError } = await supabase
      .from("speakers")
      .select("id, name, photo_url, title, designation, company")
      .in("id", ids);
    if (speakerError) {
      logger.error("brochure configurator speakers fetch failed", {
        event_id: eventId,
        error_message: speakerError.message,
      });
    }
    const orderMap = new Map(eventSpeakerLinks.map((l, i) => [l.speaker_id, l.display_order ?? i]));
    speakers = (speakerRows ?? [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        photo_url: s.photo_url,
        title: s.title,
        designation: s.designation,
        company: s.company,
        display_order: orderMap.get(s.id) ?? 0,
      }))
      .sort((a, b) => a.display_order - b.display_order);
  }

  // event_sponsors -> sponsors (Sponsors_Section source), ordered by
  // display_order.
  const eventSponsorLinks = eventSponsorsRes.data ?? [];
  let sponsors: SponsorInput[] = [];
  if (eventSponsorLinks.length > 0) {
    const ids = eventSponsorLinks.map((l) => l.sponsor_id);
    const { data: sponsorRows, error: sponsorError } = await supabase
      .from("sponsors")
      .select("id, name, logo_url, tier")
      .in("id", ids);
    if (sponsorError) {
      logger.error("brochure configurator sponsors fetch failed", {
        event_id: eventId,
        error_message: sponsorError.message,
      });
    }
    const orderMap = new Map(eventSponsorLinks.map((l, i) => [l.sponsor_id, l.display_order ?? i]));
    sponsors = (sponsorRows ?? [])
      .map((s) => ({
        id: s.id,
        name: s.name,
        logo_url: s.logo_url,
        tier: s.tier,
        display_order: orderMap.get(s.id) ?? 0,
      }))
      .sort((a, b) => a.display_order - b.display_order);
  }

  return {
    event: (eventRes.data as BrochureEventRow | null) ?? null,
    sessions,
    speakers,
    sponsors,
  };
}

export default function BrochureConfiguratorDialog({
  open,
  onOpenChange,
  eventId,
  eventPageConfig,
  onConfigChange,
}: BrochureConfiguratorDialogProps) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<BrochureEventRow | null>(null);
  const [sessions, setSessions] = useState<AgendaSessionInput[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerInput[]>([]);
  const [sponsors, setSponsors] = useState<SponsorInput[]>([]);

  const [selectedTheme, setSelectedTheme] = useState<BrochureTheme>(BROCHURE_THEMES[0]);
  const [themeOverride, setThemeOverride] = useState<BrochureThemeOverride>({});
  const [sectionLayout, setSectionLayout] = useState<SectionLayout>(DEFAULT_SECTION_LAYOUT);
  // Poster_Bold-only content payload. Backed by
  // `eventPageConfig.brochurePrefs.posterContent`; edits in this dialog
  // flow through the same `saveBrochurePrefs` path as `sectionLayout` /
  // `themeOverride` when "save as event default" is on.
  type PosterContent = NonNullable<
    NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]
  >;
  const [posterContent, setPosterContent] = useState<PosterContent>({});
  const hydratedRef = useRef(false);

  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  // Editor dialog visibility — opened via the "Open in Editor" footer
  // button. Separate from the configurator dialog's own open state so
  // both can be up simultaneously (though the editor renders inside the
  // configurator's dialog tree so keyboard focus stays local).
  const [editorOpen, setEditorOpen] = useState(false);

  // Fetch every entity the brochure needs whenever the dialog opens — the
  // organizer may have edited sessions/speakers/sponsors elsewhere since
  // the last time this dialog was open (Requirements 1.1, 3.2, 3.3, 7.1).
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    fetchBrochureData(eventId).then((data) => {
      if (!mounted) return;
      setEvent(data.event);
      setSessions(data.sessions);
      setSpeakers(data.speakers);
      setSponsors(data.sponsors);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [open, eventId]);

  // Hydrate the persisted theme/override/section-layout selections from the
  // event's saved brochurePrefs the FIRST time the dialog opens in this
  // component's lifetime — once hydrated, these three stay as whatever the
  // organizer has since chosen, even across further open/close cycles
  // within the same session, so an in-progress (not-yet-saved) choice is
  // never silently discarded just because the dialog was closed and
  // reopened.
  useEffect(() => {
    if (!open || hydratedRef.current) return;
    const prefs = readBrochurePrefs(normalizeConfig(eventPageConfig));
    const theme = (prefs?.themeId && BROCHURE_THEMES.find((t) => t.id === prefs.themeId)) || BROCHURE_THEMES[0];
    setSelectedTheme(theme);
    setThemeOverride(prefs?.colorOverride ?? {});
    // Poster_Bold events default to the Poster_Bold layout preset (which
    // has every section on) rather than the base DEFAULT_SECTION_LAYOUT
    // (which has the three Poster_Bold-only sections off) — the intent
    // when picking Poster_Bold is almost always "give me the full poster
    // spread", not "the same layout as a Classic Editorial brochure".
    const fallbackLayout =
      theme.id === "poster-bold"
        ? POSTER_BOLD_SECTION_LAYOUT
        : theme.id === "corporate-bold"
          ? CORPORATE_BOLD_SECTION_LAYOUT
          : DEFAULT_SECTION_LAYOUT;
    setSectionLayout(prefs?.sectionLayout ?? fallbackLayout);
    setPosterContent(prefs?.posterContent ?? {});
    hydratedRef.current = true;
  }, [open, eventPageConfig]);

  // Explicit theme-picker handler (distinct from the hydration effect
  // above): when the organizer picks a new theme from the RadioGroup,
  // switch to that theme's matching section-layout preset so its
  // theme-specific pages (Poster_Bold's Abstract / Why Sponsor / Pricing)
  // are on by default — mirroring the same preset-seeding rule the
  // hydration effect applies on first open. Color/font overrides and
  // posterContent copy are preserved across the switch so re-picking a
  // theme doesn't discard anything the organizer already typed in.
  const handleThemeChange = (next: BrochureTheme) => {
    setSelectedTheme(next);
    setSectionLayout(
      next.id === "poster-bold"
        ? POSTER_BOLD_SECTION_LAYOUT
        : next.id === "corporate-bold"
          ? CORPORATE_BOLD_SECTION_LAYOUT
          : DEFAULT_SECTION_LAYOUT,
    );
  };

  // Reset purely transient (non-persisted) state whenever the dialog
  // re-opens — mirrors CreativeGeneratorDialog's open-reset effect. The
  // hydrated theme/override/sectionLayout are deliberately NOT reset here.
  useEffect(() => {
    if (!open) return;
    setSaveAsDefault(false);
    setIsGenerating(false);
    setProgress(null);
  }, [open]);

  const dateVenueData = useMemo<DateVenueData>(() => {
    const section = eventPageConfig.sections.find((s) => s.id === "dateVenue");
    return (section?.data as DateVenueData | undefined) ?? {};
  }, [eventPageConfig.sections]);

  const venueLogistics: VenueLogisticsInput = useMemo(
    () => ({
      venue: event?.venue ?? null,
      location: event?.location ?? null,
      mapEmbedUrl: dateVenueData.mapEmbedUrl ?? null,
      parkingNotes: dateVenueData.parkingNotes ?? null,
      transitNotes: dateVenueData.transitNotes ?? null,
    }),
    [event?.venue, event?.location, dateVenueData]
  );

  const eventTheme: EventThemeInput = useMemo(
    () => ({
      primaryColor: eventPageConfig.theme?.primaryColor,
      accentColor: eventPageConfig.theme?.accentColor,
      fontFamily: eventPageConfig.theme?.fontFamily,
    }),
    [eventPageConfig.theme?.primaryColor, eventPageConfig.theme?.accentColor, eventPageConfig.theme?.fontFamily]
  );

  // Resolved colors (theme default -> event theme -> organizer override),
  // exactly the same precedence `buildBrochureDocument` applies via
  // `resolveBrochureTheme` for the PDF export. Passed into the editor's
  // seed so "Open in Editor" reflects the SAME accent/font the live
  // preview is currently showing, instead of the theme's raw defaults
  // (Requirement: editor/preview parity).
  const resolvedColors = useMemo(
    () => resolveBrochureTheme(selectedTheme, eventTheme, themeOverride),
    [selectedTheme, eventTheme, themeOverride]
  );

  // The resolved (included, in render order) section id list — computed
  // via the SAME `resolveSectionLayout` the PDF export uses, so the
  // editor's seed builds exactly the pages the live preview is showing,
  // in the same order.
  const resolvedSectionIds = useMemo(() => resolveSectionLayout(sectionLayout), [sectionLayout]);

  // The full resolved generation input — recomputed whenever any selection
  // or fetched entity changes, and passed unchanged to BOTH
  // BrochurePreviewFrame (live preview) and downloadBrochurePdf (export),
  // so the two can never diverge (Requirement 8.1, 8.2).
  const generationInput = useMemo<BrochureGenerationInput>(
    () => ({
      event: {
        title: event?.title ?? "",
        date: event?.date ?? new Date().toISOString(),
        end_date: event?.end_date ?? null,
        venue: event?.venue ?? null,
        location: event?.location ?? null,
        image_url: event?.image_url ?? null,
        banner_landscape_url: event?.banner_landscape_url ?? null,
        // Portrait banner is preferred as the cover hero (A4 is
        // portrait; the mobile-view banner slots in without heavy
        // cropping). buildCoverContent's resolveCoverBackground picks
        // this first when defined, falling back to image_url and
        // banner_landscape_url in that order.
        banner_portrait_url: event?.banner_portrait_url ?? null,
      },
      sessions,
      speakers,
      sponsors,
      venueLogistics,
      theme: selectedTheme,
      eventTheme,
      themeOverride,
      sectionLayout,
      // Poster_Bold / Corporate_Bold-only fields are only populated when
      // one of those themes is active; the Sponsorship_Packages table
      // below is always populated regardless of theme since it's not
      // gated to a specific theme in the renderer (Requirement: renders
      // on any theme). `undefined` on any individual field is safe —
      // every content builder treats an empty/absent field as "no
      // content" and the section is skipped.
      posterContent: {
        ...(selectedTheme.id === "poster-bold" || selectedTheme.id === "corporate-bold"
          ? {
              logoUrl: posterContent.logoUrl ?? null,
              organizerLogoUrl: posterContent.organizerLogoUrl ?? null,
              socialLinks: posterContent.socialLinks ?? null,
              coverTagline: posterContent.coverTagline ?? null,
              coverPills: posterContent.coverPills ?? null,
              abstract: {
                abstract: posterContent.abstract,
                featured: posterContent.featured,
                learningOutcomes: posterContent.learningOutcomes,
              },
              whySponsor: { items: posterContent.whySponsor },
              pricing: {
                cards: posterContent.pricingCards,
                showRegistrationForm: posterContent.registrationForm,
              },
              focusOfSummit: { items: posterContent.focusOfSummit },
              whoShouldAttend: {
                description: posterContent.whoShouldAttendDescription,
                items: posterContent.whoShouldAttendItems,
              },
              solutionProviders: {
                description: posterContent.solutionProvidersDescription,
              },
              highlights: {
                leftTitle: posterContent.whyMattersTitle,
                leftItems: posterContent.whyMattersItems,
                rightTitle: posterContent.whatYouWillGainTitle,
                rightItems: posterContent.whatYouWillGainItems,
              },
            }
          : {}),
        sponsorshipPackages: {
          title: posterContent.sponsorshipPackagesTitle,
          benefits: posterContent.sponsorshipBenefits,
          tiers: posterContent.sponsorshipTiers,
        },
      },
    }),
    [event, sessions, speakers, sponsors, venueLogistics, selectedTheme, eventTheme, themeOverride, sectionLayout, posterContent]
  );

  const includedCount = sectionLayout.filter((s) => s.included).length;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress({ completed: 0, total: includedCount });
    try {
      // Persist the "save as default" preference once, before generation.
      if (saveAsDefault) {
        onConfigChange(
          saveBrochurePrefs(eventPageConfig, {
            themeId: selectedTheme.id,
            colorOverride: themeOverride,
            sectionLayout,
            posterContent:
              selectedTheme.id === "poster-bold" || selectedTheme.id === "corporate-bold"
                ? posterContent
                : undefined,
          })
        );
      }

      await downloadBrochurePdf(
        {
          ...generationInput,
          onProgress: (completed, total) => setProgress({ completed, total }),
        },
        generationInput.event.title
      );

      toast.success("Brochure ready", { description: "Your download should start automatically." });
    } catch (err) {
      const error_message = err instanceof Error ? err.message : String(err);
      logger.error("brochure generation failed", { event_id: eventId, error_message });
      toast.error("Failed to generate brochure", { description: error_message });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[96vw] p-0 gap-0 max-h-[94vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0 space-y-0.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Generate brochure
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Configure a printable, branded PDF brochure for this event
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
            Loading brochure data…
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* LEFT — settings (scrollable) */}
            <div className="overflow-y-auto px-5 py-4 space-y-5 md:border-r border-border min-h-0">
              {/* BROCHURE THEME — Classic Editorial and Poster Bold ship
                  today; picking a theme also seeds the matching section
                  layout preset (see the theme-change effect below) so an
                  organizer switching to Poster Bold gets its Abstract /
                  Why Sponsor / Pricing pages on by default. Any further
                  custom look — fonts, colors, layout — remains available
                  in the editor from either seed. */}
              <section>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Brochure theme
                </Label>
                <RadioGroup
                  value={selectedTheme.id}
                  onValueChange={(id) => {
                    const next = BROCHURE_THEMES.find((t) => t.id === id);
                    if (next) handleThemeChange(next);
                  }}
                  className="grid grid-cols-2 gap-2"
                >
                  {BROCHURE_THEMES.map((t) => (
                    <label
                      key={t.id}
                      className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                        selectedTheme.id === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <RadioGroupItem value={t.id} className="sr-only" />
                      <div className="text-[13px] font-medium leading-tight">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {t.description}
                      </div>
                    </label>
                  ))}
                </RadioGroup>
                <div className="text-[10px] text-muted-foreground/80 mt-1.5">
                  Any custom look — fonts, colors, layout — is also available in the editor.
                </div>
              </section>

              {/* COLOR / FONT OVERRIDES */}
              <section>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Color & font overrides
                </Label>
                <div className="space-y-4">
                  <SwatchGroup
                    label="Primary color"
                    swatches={COLOR_SWATCHES}
                    selected={themeOverride.primaryColor}
                    onSelect={(c) =>
                      setThemeOverride((prev) => ({
                        ...prev,
                        primaryColor: prev.primaryColor?.toLowerCase() === c.toLowerCase() ? undefined : c,
                      }))
                    }
                    onClear={() => setThemeOverride((prev) => ({ ...prev, primaryColor: undefined }))}
                  />
                  <SwatchGroup
                    label="Accent color"
                    swatches={COLOR_SWATCHES}
                    selected={themeOverride.accentColor}
                    onSelect={(c) =>
                      setThemeOverride((prev) => ({
                        ...prev,
                        accentColor: prev.accentColor?.toLowerCase() === c.toLowerCase() ? undefined : c,
                      }))
                    }
                    onClear={() => setThemeOverride((prev) => ({ ...prev, accentColor: undefined }))}
                  />
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Font family</Label>
                    <Select
                      value={themeOverride.fontFamily ?? "__default"}
                      onValueChange={(v) =>
                        setThemeOverride((prev) => ({
                          ...prev,
                          fontFamily: v === "__default" ? undefined : v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default">Use event theme font</SelectItem>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Overrides only apply to the generated brochure — they don't change this event's page theme.
                  </p>
                </div>
              </section>

              {/* SECTIONS */}
              <section>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Sections
                </Label>
                <BrochureSectionList layout={sectionLayout} onChange={setSectionLayout} />
              </section>

              {/* Content editor for Poster_Bold and Corporate_Bold. Both
                  themes source their extra content from the same
                  brochurePrefs.posterContent bag; the panel below
                  conditionally reveals subsections based on which theme
                  is active so an organizer only fills in what actually
                  renders. */}
              {(selectedTheme.id === "poster-bold" || selectedTheme.id === "corporate-bold") && (
                <PosterBoldContentPanel
                  value={posterContent}
                  onChange={setPosterContent}
                  themeId={selectedTheme.id}
                />
              )}

              {/* Sponsorship Packages — a benefits × tiers comparison
                  table available on EVERY theme, unlike the Poster_Bold /
                  Corporate_Bold panel above. Only shown once the
                  organizer has toggled the "Sponsorship Packages" row on
                  in the Sections list, so the editor doesn't clutter the
                  panel for organizers who don't need this page. */}
              {sectionLayout.some((s) => s.id === "sponsorshipPackages" && s.included) && (
                <SponsorshipPackagesEditor value={posterContent} onChange={setPosterContent} />
              )}

              {/* PROGRESS */}
              {isGenerating && progress && (
                <section className="space-y-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium">Generating…</span>
                    <span className="text-muted-foreground">
                      {progress.completed} of {progress.total} sections
                    </span>
                  </div>
                  <Progress value={progress.total > 0 ? (progress.completed / progress.total) * 100 : 0} />
                </section>
              )}

              {/* SAVE AS DEFAULT */}
              <section className="border border-border rounded-lg p-3 bg-muted/30">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={saveAsDefault}
                    onCheckedChange={(v) => setSaveAsDefault(!!v)}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="text-[12px] font-medium">Save as event default</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      Use this theme, color/font overrides, and section layout by default next time you generate a
                      brochure for this event.
                    </div>
                  </div>
                </label>
              </section>
            </div>

            {/* RIGHT — live preview */}
            <div className="flex flex-col bg-muted/20 min-h-0 border-t md:border-t-0 border-border">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/60 shrink-0">
                <span className="text-[12px] font-semibold">Live preview</span>
              </div>
              <div className="flex-1 min-h-0 p-4 flex items-center justify-center overflow-hidden">
                <BrochurePreviewFrame input={generationInput} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-between gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground self-center">
            {includedCount} section{includedCount === 1 ? "" : "s"} included
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditorOpen(true)}
              disabled={loading}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open in Editor
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={loading || isGenerating} className="gap-1.5">
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download brochure
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* WYSIWYG editor — opens as a separate dialog with the current
          theme seeded as a live document. Save flows back through
          `onConfigChange` so the parent persists to Supabase via
          `events.page_config.brochurePrefs.editorDocument`. */}
      {editorOpen && event && (
        <BrochureEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          // Seed the editor from the SAME theme + resolved section list +
          // resolved colors the live preview is currently showing, so the
          // two can never diverge (Requirement: editor/preview parity).
          theme={selectedTheme}
          resolvedSectionIds={resolvedSectionIds}
          seed={{
            eventTitle: event.title,
            dateText: (() => {
              try {
                const d = new Date(event.date);
                return `${d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}  |  ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })} onwards`;
              } catch {
                return event.date;
              }
            })(),
            venueText: event.venue ?? event.location ?? "",
            // Prefer the mobile / portrait banner (matches the event's
            // mobile-view hero); fall back through image_url, then the
            // landscape banner as last-resort so the cover always has
            // something to render.
            coverImageUrl:
              event.banner_portrait_url ?? event.image_url ?? event.banner_landscape_url ?? "",
            logoUrl: posterContent.logoUrl,
            organizerLogoUrl: posterContent.organizerLogoUrl,
            coverTagline: posterContent.coverTagline,
            coverPills: posterContent.coverPills,
            abstract: posterContent.abstract,
            featured: posterContent.featured,
            learningOutcomes: posterContent.learningOutcomes,
            numberedItems:
              selectedTheme.id === "corporate-bold"
                ? posterContent.focusOfSummit
                : posterContent.whySponsor,
            pricingCards: posterContent.pricingCards,
            showRegistrationForm: posterContent.registrationForm,
            accentColor: resolvedColors.accentColor,
            fontFamily: resolvedColors.fontFamily,
            // Content-page data — the shared seed uses these to build
            // Agenda / Speakers / Sponsors / Venue pages that match the
            // preview one-to-one so the editor and the live preview
            // show the SAME set of pages.
            sessions,
            speakers,
            sponsors,
            venueLogistics,
            sponsorshipPackages: {
              title: posterContent.sponsorshipPackagesTitle,
              benefits: posterContent.sponsorshipBenefits,
              tiers: posterContent.sponsorshipTiers,
            },
          }}
          initialDocument={
            eventPageConfig.brochurePrefs?.editorDocument
              ? (eventPageConfig.brochurePrefs.editorDocument as unknown as import("@/lib/brochure/editor/editor-document").BrochureDocument)
              : null
          }
          onSaveDocument={async (doc) => {
            // Persist through the existing page-config path so autosave
            // reuses the same debounced update pipeline the rest of the
            // dialog uses.
            onConfigChange({
              ...eventPageConfig,
              brochurePrefs: {
                ...(eventPageConfig.brochurePrefs ?? {}),
                editorDocument: {
                  id: doc.id,
                  title: doc.title,
                  pages: doc.pages as unknown[],
                  createdAt: doc.createdAt,
                  updatedAt: doc.updatedAt,
                },
              },
            });
          }}
        />
      )}
    </Dialog>
  );
}

/**
 * A labelled row of clickable color swatches with a "reset to default"
 * affordance. Extracted from the inline duplication that had two nearly
 * identical 32-swatch grids stacked back-to-back — with 32 swatches in
 * an 8-column grid that gave four cramped rows per palette, doubled to
 * eight rows once primary and accent were both shown. Rendering these
 * in a 16-column grid halves that to two rows per palette and gives each
 * swatch enough breathing room to be picked at a glance.
 */
function SwatchGroup({
  label,
  swatches,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  swatches: string[];
  selected: string | undefined;
  onSelect: (color: string) => void;
  onClear: () => void;
}) {
  const hasSelection = !!selected;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {hasSelection && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Reset
          </button>
        )}
      </div>
      <div className="grid grid-cols-16 gap-1.5" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {swatches.map((c) => {
          const isSelected = selected?.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                isSelected
                  ? "ring-2 ring-offset-1 ring-primary border-primary"
                  : "border-black/10 dark:border-white/15"
              }`}
              style={{ backgroundColor: c }}
              aria-label={`${label} ${c}`}
              title={c}
            />
          );
        })}
      </div>
    </div>
  );
}


// ─── PosterBoldContentPanel ─────────────────────────────────────────────────

/**
 * Organizer form for the extra content used by the Poster_Bold theme:
 * cover/organizer logos, social media links, page 2's Abstract + Featured
 * + Learning Outcomes, page 3's Why Sponsor value props, and page 5's
 * pricing cards + registration form toggle.
 *
 * Kept in this file (as a local component) rather than a separate module
 * because it's tightly coupled to the parent dialog's state shape and
 * has no reusable surface outside of it. Every field is optional; the
 * pure content builders in `brochure-sections.ts` drop empty entries so
 * the organizer can populate as much or as little as they like.
 */
function PosterBoldContentPanel({
  value,
  onChange,
  themeId,
}: {
  value: NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>;
  onChange: (v: NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>) => void;
  themeId: string;
}) {
  type PC = NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>;
  const set = <K extends keyof PC>(key: K, next: PC[K]) => onChange({ ...value, [key]: next });

  // Arrays are edited as newline-delimited textareas for simplicity —
  // one line per item. Empty lines are stripped by the pure builders.
  const linesToArray = (raw: string): string[] =>
    raw.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
  const arrayToLines = (arr: string[] | undefined) => (arr ?? []).join("\n");

  const isPosterBold = themeId === "poster-bold";
  const isCorporateBold = themeId === "corporate-bold";
  const panelLabel = isCorporateBold ? "Corporate Bold content" : "Poster Bold content";

  return (
    <section className="space-y-3 border border-dashed border-primary/40 rounded-lg p-3 bg-primary/5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {panelLabel}
        </Label>
        <span className="text-[10px] text-muted-foreground">
          Only used by this theme
        </span>
      </div>

      {/* Logos + social */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Header wordmark URL</Label>
          <Input
            className="h-8 text-[12px]"
            value={value.logoUrl ?? ""}
            placeholder="https://…/logo.png"
            onChange={(e) => set("logoUrl", e.target.value || undefined)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Organizer footer logo URL</Label>
          <Input
            className="h-8 text-[12px]"
            value={value.organizerLogoUrl ?? ""}
            placeholder="https://…/org.png"
            onChange={(e) => set("organizerLogoUrl", e.target.value || undefined)}
          />
        </div>
      </div>
      <SocialLinksEditor
        value={value.socialLinks ?? []}
        onChange={(v) => set("socialLinks", v.length > 0 ? v : undefined)}
      />

      {/* Abstract + Featured + Learning Outcomes */}
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Abstract (page 2, top card)</Label>
          <Textarea
            className="text-[12px] min-h-[70px]"
            value={value.abstract ?? ""}
            placeholder="High-level description of the event…"
            onChange={(e) => set("abstract", e.target.value || undefined)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Featured (page 2, middle card)</Label>
          <Textarea
            className="text-[12px] min-h-[70px]"
            value={value.featured ?? ""}
            placeholder="What's featured / included…"
            onChange={(e) => set("featured", e.target.value || undefined)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Learning Outcomes (one per line, up to 6)</Label>
          <Textarea
            className="text-[12px] min-h-[70px]"
            value={arrayToLines(value.learningOutcomes)}
            placeholder={"Master AI-Driven DevOps\nOptimize Cloud Costs with FinOps\n…"}
            onChange={(e) => {
              const next = linesToArray(e.target.value).slice(0, 6);
              set("learningOutcomes", next.length > 0 ? next : undefined);
            }}
          />
        </div>
      </div>

      {/* Cover extras — shared by both Poster_Bold and Corporate_Bold. */}
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Cover tagline pill (optional)</Label>
          <Input
            className="h-8 text-[12px]"
            value={value.coverTagline ?? ""}
            placeholder="The Next Big Shift"
            onChange={(e) => set("coverTagline", e.target.value || undefined)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Cover chip labels (one per line)</Label>
          <Textarea
            className="text-[12px] min-h-[52px]"
            value={arrayToLines(value.coverPills)}
            placeholder={"Autonomy\nGovernance\nCapital"}
            onChange={(e) => {
              const next = linesToArray(e.target.value);
              set("coverPills", next.length > 0 ? next : undefined);
            }}
          />
        </div>
      </div>

      {/* Poster_Bold-only sections (Why Sponsor + Pricing) */}
      {isPosterBold && (
        <>
          <div className="space-y-1">
            <Label className="text-[11px]">Why Sponsor? (numbered items, one per line)</Label>
            <Textarea
              className="text-[12px] min-h-[80px]"
              value={arrayToLines(value.whySponsor)}
              placeholder={"Connect with CIOs, CTOs, DevOps leaders…\nShowcase your solutions…"}
              onChange={(e) => {
                const next = linesToArray(e.target.value);
                set("whySponsor", next.length > 0 ? next : undefined);
              }}
            />
          </div>
          <PricingCardsEditor
            value={value.pricingCards ?? []}
            onChange={(v) => set("pricingCards", v.length > 0 ? v : undefined)}
          />
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <Checkbox
              checked={value.registrationForm === true}
              onCheckedChange={(v) => set("registrationForm", v === true ? true : undefined)}
            />
            Include blank registration form on the pricing page
          </label>
        </>
      )}

      {/* Corporate_Bold-only sections (Focus of Summit, Who Should
          Attend, Solution Providers, Highlights) */}
      {isCorporateBold && (
        <>
          <div className="space-y-1">
            <Label className="text-[11px]">Focus of the Summit (bulleted, one per line)</Label>
            <Textarea
              className="text-[12px] min-h-[80px]"
              value={arrayToLines(value.focusOfSummit)}
              placeholder={"Understand how autonomous AI systems reshape financial governance…\nExplore advanced scenario modeling…"}
              onChange={(e) => {
                const next = linesToArray(e.target.value);
                set("focusOfSummit", next.length > 0 ? next : undefined);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Who should attend? — description</Label>
            <Textarea
              className="text-[12px] min-h-[60px]"
              value={value.whoShouldAttendDescription ?? ""}
              placeholder="The conference provides an opportunity for attendees to network…"
              onChange={(e) =>
                set("whoShouldAttendDescription", e.target.value || undefined)
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Who should attend? — bullet list (one per line)</Label>
            <Textarea
              className="text-[12px] min-h-[68px]"
              value={arrayToLines(value.whoShouldAttendItems)}
              placeholder={"CFOs | Global CFOs | Group CFOs\nDirector — Finance\nVP Finance"}
              onChange={(e) => {
                const next = linesToArray(e.target.value);
                set("whoShouldAttendItems", next.length > 0 ? next : undefined);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Solution Providers — description</Label>
            <Textarea
              className="text-[12px] min-h-[68px]"
              value={value.solutionProvidersDescription ?? ""}
              placeholder="Invoicing, Expense Management, Accounting, Accounts Payable Automation…"
              onChange={(e) =>
                set("solutionProvidersDescription", e.target.value || undefined)
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">"Why it matters" — title</Label>
              <Input
                className="h-8 text-[12px]"
                value={value.whyMattersTitle ?? ""}
                placeholder="Why Finance 6.0 Matters"
                onChange={(e) => set("whyMattersTitle", e.target.value || undefined)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">"What you'll gain" — title</Label>
              <Input
                className="h-8 text-[12px]"
                value={value.whatYouWillGainTitle ?? ""}
                placeholder="What You Will Gain"
                onChange={(e) => set("whatYouWillGainTitle", e.target.value || undefined)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">"Why it matters" — bullets</Label>
              <Textarea
                className="text-[12px] min-h-[80px]"
                value={arrayToLines(value.whyMattersItems)}
                placeholder={"The acceleration of autonomous systems…"}
                onChange={(e) => {
                  const next = linesToArray(e.target.value);
                  set("whyMattersItems", next.length > 0 ? next : undefined);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">"What you'll gain" — bullets</Label>
              <Textarea
                className="text-[12px] min-h-[80px]"
                value={arrayToLines(value.whatYouWillGainItems)}
                placeholder={"Frameworks for governing AI-driven financial systems…"}
                onChange={(e) => {
                  const next = linesToArray(e.target.value);
                  set("whatYouWillGainItems", next.length > 0 ? next : undefined);
                }}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** Editor for the four supported social platforms — one row per
 *  platform with a URL input. Empty URLs drop the row from the payload
 *  so the caller ends up with only populated links. */
function SocialLinksEditor({
  value,
  onChange,
}: {
  value: NonNullable<
    NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>["socialLinks"]
  >;
  onChange: (
    v: NonNullable<
      NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>["socialLinks"]
    >,
  ) => void;
}) {
  const platforms: Array<"linkedin" | "instagram" | "facebook" | "twitter"> = [
    "linkedin",
    "instagram",
    "facebook",
    "twitter",
  ];
  const urlFor = (p: string) => value.find((l) => l.platform === p)?.url ?? "";
  const setUrl = (p: "linkedin" | "instagram" | "facebook" | "twitter", url: string) => {
    const trimmed = url.trim();
    const other = value.filter((l) => l.platform !== p);
    onChange(trimmed ? [...other, { platform: p, url: trimmed }] : other);
  };
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">Social links (cover footer)</Label>
      <div className="grid grid-cols-2 gap-2">
        {platforms.map((p) => (
          <Input
            key={p}
            className="h-8 text-[12px]"
            value={urlFor(p)}
            placeholder={`${p} URL`}
            onChange={(e) => setUrl(p, e.target.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** Editor for pricing cards. Adds a card via a button, edits fields
 *  inline, and lets the organizer remove a card via a small "Remove"
 *  link. Discounts are edited as newline-delimited lines for simplicity. */
function PricingCardsEditor({
  value,
  onChange,
}: {
  value: NonNullable<
    NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>["pricingCards"]
  >;
  onChange: (
    v: NonNullable<
      NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>["pricingCards"]
    >,
  ) => void;
}) {
  const updateAt = (
    idx: number,
    patch: Partial<{
      title: string;
      subtitle: string | null;
      price: string;
      discounts: string[] | null;
    }>,
  ) => {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const addOne = () =>
    onChange([...value, { title: "", price: "", discounts: [] }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">Pricing cards</Label>
        <button
          type="button"
          onClick={addOne}
          className="text-[11px] text-primary hover:underline"
        >
          + Add card
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No pricing cards yet. Add one to enable the pricing page.
        </p>
      ) : (
        value.map((card, idx) => (
          <div key={idx} className="border border-border rounded-md p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Card {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="text-[11px] text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="h-8 text-[12px]"
                placeholder="Title (e.g. Individual)"
                value={card.title}
                onChange={(e) => updateAt(idx, { title: e.target.value })}
              />
              <Input
                className="h-8 text-[12px]"
                placeholder="Subtitle (e.g. Early Bird: ₹12,500/-)"
                value={card.subtitle ?? ""}
                onChange={(e) => updateAt(idx, { subtitle: e.target.value || null })}
              />
            </div>
            <Input
              className="h-8 text-[12px]"
              placeholder="Price (e.g. ₹15,000/-)"
              value={card.price}
              onChange={(e) => updateAt(idx, { price: e.target.value })}
            />
            <Textarea
              className="text-[12px] min-h-[52px]"
              placeholder="Discounts, one per line (optional)"
              value={(card.discounts ?? []).join("\n")}
              onChange={(e) => {
                const next = e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                updateAt(idx, { discounts: next.length > 0 ? next : null });
              }}
            />
          </div>
        ))
      )}
    </div>
  );
}

// ─── SponsorshipPackagesEditor ───────────────────────────────────────────────

/**
 * Organizer form for the Sponsorship_Packages comparison table — matches
 * reference sponsorship-deck brochures ("Premium Partnership Packages"
 * with Presenting/Co-Presenting/Knowledge Partner columns). Unlike
 * `PosterBoldContentPanel`, this editor is available on EVERY theme.
 *
 * The table is authored as a shared list of benefit row labels plus a
 * list of tier columns, each carrying one cell value per benefit row
 * (aligned by index). A cell's value cycles through four states via a
 * single click: empty → check → cross → free text → empty — matching
 * how the reference brochures mix checkmarks, crosses, and short text
 * values ("10 meetings", "Top Position") in the same table.
 */
function SponsorshipPackagesEditor({
  value,
  onChange,
}: {
  value: NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>;
  onChange: (v: NonNullable<NonNullable<EventPageConfig["brochurePrefs"]>["posterContent"]>) => void;
}) {
  const title = value.sponsorshipPackagesTitle ?? "";
  const benefits = value.sponsorshipBenefits ?? [];
  const tiers = value.sponsorshipTiers ?? [];

  const setTitle = (v: string) => onChange({ ...value, sponsorshipPackagesTitle: v || undefined });

  const setBenefits = (next: string[]) => onChange({ ...value, sponsorshipBenefits: next });

  const addBenefit = () => setBenefits([...benefits, ""]);
  const updateBenefit = (idx: number, text: string) => {
    const next = benefits.slice();
    next[idx] = text;
    setBenefits(next);
  };
  const removeBenefit = (idx: number) => {
    setBenefits(benefits.filter((_, i) => i !== idx));
    // Keep every tier's cells aligned to the new (shorter) benefit list.
    onChange({
      ...value,
      sponsorshipBenefits: benefits.filter((_, i) => i !== idx),
      sponsorshipTiers: tiers.map((t) => ({
        ...t,
        cells: (t.cells ?? []).filter((_, i) => i !== idx),
      })),
    });
  };

  const setTiers = (next: typeof tiers) => onChange({ ...value, sponsorshipTiers: next });

  const addTier = () =>
    setTiers([...tiers, { name: "", price: "", cells: benefits.map(() => null) }]);
  const updateTierField = (idx: number, patch: Partial<{ name: string; price: string }>) => {
    const next = tiers.slice();
    next[idx] = { ...next[idx], ...patch };
    setTiers(next);
  };
  const removeTier = (idx: number) => setTiers(tiers.filter((_, i) => i !== idx));

  /** Cycles one cell's value: empty (null) → check (true) → cross
   *  (false) → back to empty. Free-text values are entered via the
   *  small inline input that appears when a cell is in "text" mode
   *  (toggled by a long-press-free right-click-free affordance: a
   *  small "Aa" button next to the cell). */
  const cycleCell = (tierIdx: number, benefitIdx: number) => {
    const next = tiers.slice();
    const tier = { ...next[tierIdx] };
    const cells = (tier.cells ?? []).slice();
    while (cells.length <= benefitIdx) cells.push(null);
    const current = cells[benefitIdx];
    cells[benefitIdx] = current === null || current === undefined ? true : current === true ? false : null;
    tier.cells = cells;
    next[tierIdx] = tier;
    setTiers(next);
  };

  const setCellText = (tierIdx: number, benefitIdx: number, text: string) => {
    const next = tiers.slice();
    const tier = { ...next[tierIdx] };
    const cells = (tier.cells ?? []).slice();
    while (cells.length <= benefitIdx) cells.push(null);
    cells[benefitIdx] = text;
    tier.cells = cells;
    next[tierIdx] = tier;
    setTiers(next);
  };

  const cellLabel = (v: string | boolean | null | undefined): string =>
    v === true ? "✓" : v === false ? "✗" : typeof v === "string" && v.length > 0 ? v : "—";
  const cellClass = (v: string | boolean | null | undefined): string =>
    v === true
      ? "text-emerald-600 font-semibold"
      : v === false
        ? "text-destructive font-semibold"
        : typeof v === "string" && v.length > 0
          ? "text-foreground"
          : "text-muted-foreground/50";

  return (
    <section className="space-y-3 border border-dashed border-primary/40 rounded-lg p-3 bg-primary/5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Sponsorship packages
        </Label>
        <span className="text-[10px] text-muted-foreground">Available on any theme</span>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">Table title</Label>
        <Input
          className="h-8 text-[12px]"
          value={title}
          placeholder="Premium Partnership Packages"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Benefit rows */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Benefit rows</Label>
          <button type="button" onClick={addBenefit} className="text-[11px] text-primary hover:underline">
            + Add row
          </button>
        </div>
        {benefits.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No benefit rows yet. Add one to start building the table.
          </p>
        ) : (
          <div className="space-y-1">
            {benefits.map((b, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  className="h-7 text-[12px] flex-1"
                  value={b}
                  placeholder="e.g. Exhibit Table Space"
                  onChange={(e) => updateBenefit(idx, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeBenefit(idx)}
                  className="text-[11px] text-destructive hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tier columns */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Package tiers (columns)</Label>
          <button type="button" onClick={addTier} className="text-[11px] text-primary hover:underline">
            + Add tier
          </button>
        </div>
        {tiers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No tiers yet. Add one (e.g. "Presenting Partner") to enable the table.
          </p>
        ) : (
          tiers.map((tier, tierIdx) => (
            <div key={tierIdx} className="border border-border rounded-md p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Tier {tierIdx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeTier(tierIdx)}
                  className="text-[11px] text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  className="h-8 text-[12px]"
                  placeholder="Tier name (e.g. Presenting Partner)"
                  value={tier.name}
                  onChange={(e) => updateTierField(tierIdx, { name: e.target.value })}
                />
                <Input
                  className="h-8 text-[12px]"
                  placeholder="Price (e.g. INR 8,00,000 + GST)"
                  value={tier.price ?? ""}
                  onChange={(e) => updateTierField(tierIdx, { price: e.target.value })}
                />
              </div>
              {benefits.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-muted-foreground">
                    Click a cell to cycle ✓ / ✗ / blank, or type text for a custom value.
                  </p>
                  {benefits.map((b, benefitIdx) => (
                    <div key={benefitIdx} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground flex-1 truncate" title={b}>
                        {b || `Row ${benefitIdx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => cycleCell(tierIdx, benefitIdx)}
                        className={`h-6 w-8 shrink-0 border border-border rounded text-[11px] ${cellClass(
                          tier.cells?.[benefitIdx]
                        )}`}
                        title="Click to cycle ✓ / ✗ / blank"
                      >
                        {cellLabel(tier.cells?.[benefitIdx])}
                      </button>
                      <Input
                        className="h-6 w-24 text-[10px] shrink-0"
                        placeholder="or text…"
                        value={typeof tier.cells?.[benefitIdx] === "string" ? (tier.cells?.[benefitIdx] as string) : ""}
                        onChange={(e) => setCellText(tierIdx, benefitIdx, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
