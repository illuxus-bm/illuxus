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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

import BrochureSectionList from "./BrochureSectionList";
import BrochurePreviewFrame from "./BrochurePreviewFrame";

import {
  BROCHURE_THEMES,
  DEFAULT_SECTION_LAYOUT,
  readBrochurePrefs,
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
}

/** Raw `sessions` row shape needed to resolve the Agenda_Section's
 *  per-session speaker names (session_speakers join + legacy `speaker_id`
 *  fallback). */
interface SessionRow {
  id: string;
  title: string;
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
      .select("title, date, end_date, venue, location, image_url, banner_landscape_url")
      .eq("id", eventId)
      .single(),
    supabase
      .from("sessions")
      .select("id, title, start_time, end_time, speaker_id")
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
  const hydratedRef = useRef(false);

  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

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
    setSectionLayout(prefs?.sectionLayout ?? DEFAULT_SECTION_LAYOUT);
    hydratedRef.current = true;
  }, [open, eventPageConfig]);

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
      },
      sessions,
      speakers,
      sponsors,
      venueLogistics,
      theme: selectedTheme,
      eventTheme,
      themeOverride,
      sectionLayout,
    }),
    [event, sessions, speakers, sponsors, venueLogistics, selectedTheme, eventTheme, themeOverride, sectionLayout]
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
              {/* BROCHURE THEME */}
              <section>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Brochure theme
                </Label>
                <RadioGroup
                  value={selectedTheme.id}
                  onValueChange={(v) => {
                    const theme = BROCHURE_THEMES.find((t) => t.id === v);
                    if (theme) setSelectedTheme(theme);
                  }}
                  className="grid grid-cols-1 gap-2"
                >
                  {BROCHURE_THEMES.map((theme) => (
                    <label
                      key={theme.id}
                      className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                        selectedTheme.id === theme.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <RadioGroupItem value={theme.id} className="sr-only" />
                      <div className="text-[13px] font-medium leading-tight">{theme.name}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight">{theme.description}</div>
                    </label>
                  ))}
                </RadioGroup>
              </section>

              {/* COLOR / FONT OVERRIDES */}
              <section>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Color & font overrides
                </Label>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Primary color</span>
                    <div className="grid grid-cols-8 gap-1">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setThemeOverride((prev) => ({
                              ...prev,
                              primaryColor: prev.primaryColor?.toLowerCase() === c.toLowerCase() ? undefined : c,
                            }))
                          }
                          className={`h-4 w-4 rounded-sm border transition-transform hover:scale-110 ${
                            themeOverride.primaryColor?.toLowerCase() === c.toLowerCase()
                              ? "ring-1 ring-offset-1 ring-primary border-primary"
                              : "border-black/10"
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Primary color ${c}`}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Accent color</span>
                    <div className="grid grid-cols-8 gap-1">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setThemeOverride((prev) => ({
                              ...prev,
                              accentColor: prev.accentColor?.toLowerCase() === c.toLowerCase() ? undefined : c,
                            }))
                          }
                          className={`h-4 w-4 rounded-sm border transition-transform hover:scale-110 ${
                            themeOverride.accentColor?.toLowerCase() === c.toLowerCase()
                              ? "ring-1 ring-offset-1 ring-primary border-primary"
                              : "border-black/10"
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Accent color ${c}`}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
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
            <Button size="sm" onClick={handleGenerate} disabled={loading || isGenerating} className="gap-1.5">
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download brochure
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
