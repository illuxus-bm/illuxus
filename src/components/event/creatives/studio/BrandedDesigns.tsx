/**
 * Branded designs — make share-ready event graphics on any screen.
 *
 * Instead of filling slots in a fixed template, the organiser picks WHAT the
 * graphic is about (the event, a speaker, the line-up, a partner) and the
 * studio composes it from the event's own material: its banner, speaker
 * photos, partner logos, and colours taken from the banner. Design, colours,
 * type and wording can all be changed, with a live preview, in five sizes.
 *
 * Layout: on a phone the preview sits on top with the controls in tabs below
 * and the actions pinned to the bottom of the screen; on larger screens the
 * controls sit beside a sticky preview.
 */
import { useEffect, useMemo, useState } from "react";
import { zipSync } from "fflate";
import { Check, Download, ImageIcon, Images, Loader2, Mic, Handshake, Save, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildCreativeAssetRecord, insertCreativeAssetRecord, uploadCreativeAsset,
} from "@/lib/creatives/creative-storage";
import { designsFor, type StudioKind } from "@/lib/creatives/studio/studio-designs";
import { STUDIO_KITS } from "@/lib/creatives/studio/studio-kits";
import { FONT_PAIRS, type Img, type StudioAssets, type StudioContent } from "@/lib/creatives/studio/studio-draw";
import {
  buildPaletteSet, customPalette, extractImageColors, type StudioPalette,
} from "@/lib/creatives/studio/studio-palette";
import {
  STUDIO_SIZES, exportStudioPng, formatStudioDate, loadStudioImage, sizeById, studioFilename,
  type StudioSpec,
} from "@/lib/creatives/studio/studio-render";
import { StudioPreview, StudioThumb } from "./StudioCanvas";

interface EventInfo {
  title: string;
  date: string | null;
  timezone: string | null;
  venue: string | null;
  location: string | null;
  bannerUrl: string | null;
  orgName: string;
  orgLogoUrl: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}
interface Person { id: string; name: string; role: string; company: string; photoUrl: string | null }
interface Partner { id: string; name: string; tier: string; logoUrl: string | null }

const KINDS: { id: StudioKind; label: string; icon: typeof ImageIcon; eyebrow: string; tagline: string; cta: string }[] = [
  { id: "event", label: "Event", icon: Sparkles, eyebrow: "You're invited", tagline: "", cta: "Register now" },
  { id: "speaker", label: "Speaker", icon: Mic, eyebrow: "Speaker", tagline: "", cta: "" },
  { id: "lineup", label: "Line-up", icon: Users, eyebrow: "Speaker line-up", tagline: "", cta: "Register now" },
  { id: "sponsor", label: "Partner", icon: Handshake, eyebrow: "Our partner", tagline: "Proud to partner with", cta: "" },
];

const FIELD = "h-11 sm:h-9 text-base sm:text-[13px]";
const LABEL = "text-[12px] sm:text-[11px] text-muted-foreground";
const MAX_LINEUP = 8;
const DEFAULT_THEME_PRIMARY = "#6366f1";

const tierLabel = (tier: string) => {
  const t = tier.trim();
  if (!t) return "Our partner";
  return /partner|sponsor/i.test(t) ? t : `${t.charAt(0).toUpperCase()}${t.slice(1)} partner`;
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function BrandedDesigns({ eventId, onSaved }: { eventId: string; onSaved?: () => void }) {
  const { user } = useAuth();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<StudioKind>("event");
  const [designId, setDesignId] = useState("");
  /** Which visual style the design picker is showing ("all" = every style). */
  const [styleId, setStyleId] = useState("all");
  const [paletteId, setPaletteId] = useState<string | null>(null);
  const [custom, setCustom] = useState({ primary: "#4f46e5", accent: "#f59e0b", light: false });
  const [fontId, setFontId] = useState("modern");
  const [sizeId, setSizeId] = useState("square");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [lineupIds, setLineupIds] = useState<string[]>([]);
  const [partnerId, setPartnerId] = useState<string>("");
  /** The organiser's wording, per kind, layered over the event's own values. */
  const [text, setText] = useState<Partial<Record<StudioKind, Partial<StudioContent>>>>({});
  const [images, setImages] = useState<Record<string, Img | null>>({});
  const [busy, setBusy] = useState<"" | "download" | "all" | "save">("");

  /* ── Load the event's material ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: ev, error } = await supabase
        .from("events")
        .select("title, date, timezone, venue, location, banner_landscape_url, image_url, org_id, page_config")
        .eq("id", eventId)
        .maybeSingle();
      if (!alive) return;
      if (error || !ev) { setLoadError(error?.message ?? "Event not found"); return; }
      const e = ev as Record<string, unknown>;
      const theme = ((e.page_config as { theme?: { primaryColor?: string; accentColor?: string } } | null)?.theme) ?? {};
      let orgName = "", orgLogoUrl: string | null = null;
      if (e.org_id) {
        const { data: org } = await supabase.from("organizations").select("name, logo_url").eq("id", e.org_id as string).maybeSingle();
        orgName = (org as { name?: string } | null)?.name ?? "";
        orgLogoUrl = (org as { logo_url?: string | null } | null)?.logo_url ?? null;
      }
      const [es, ep] = await Promise.all([
        supabase.from("event_speakers").select("speaker_id, display_order").eq("event_id", eventId).order("display_order"),
        supabase.from("event_sponsors").select("sponsor_id, display_order").eq("event_id", eventId).order("display_order"),
      ]);
      const speakerIds = ((es.data ?? []) as { speaker_id: string }[]).map((r) => r.speaker_id);
      const sponsorIds = ((ep.data ?? []) as { sponsor_id: string }[]).map((r) => r.sponsor_id);
      const [sp, pa] = await Promise.all([
        speakerIds.length ? supabase.from("speakers").select("id, name, photo_url, designation, company").in("id", speakerIds) : Promise.resolve({ data: [] }),
        sponsorIds.length ? supabase.from("sponsors").select("id, name, logo_url, tier, tier_label").in("id", sponsorIds) : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      const byId = <T extends { id: string }>(rows: T[], ids: string[]) => ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as T[];
      const ppl = byId((sp.data ?? []) as { id: string; name: string; photo_url: string | null; designation: string | null; company: string | null }[], speakerIds)
        .map((r) => ({ id: r.id, name: r.name, role: r.designation ?? "", company: r.company ?? "", photoUrl: r.photo_url }));
      const prt = byId((pa.data ?? []) as { id: string; name: string; logo_url: string | null; tier: string | null; tier_label: string | null }[], sponsorIds)
        .map((r) => ({ id: r.id, name: r.name, tier: r.tier_label || r.tier || "", logoUrl: r.logo_url }));
      setEvent({
        title: (e.title as string) ?? "", date: (e.date as string) ?? null, timezone: (e.timezone as string) ?? null,
        venue: (e.venue as string) ?? null, location: (e.location as string) ?? null,
        bannerUrl: (e.banner_landscape_url as string) || (e.image_url as string) || null,
        orgName, orgLogoUrl,
        // The page builder's untouched default isn't the organiser's brand.
        brandPrimary: theme.primaryColor && theme.primaryColor.toLowerCase() !== DEFAULT_THEME_PRIMARY ? theme.primaryColor : null,
        brandAccent: theme.accentColor ?? null,
      });
      setPeople(ppl);
      setPartners(prt);
      setSpeakerId(ppl[0]?.id ?? "");
      setLineupIds(ppl.slice(0, MAX_LINEUP).map((p) => p.id));
      setPartnerId(prt[0]?.id ?? "");
    })().catch((err) => { if (alive) setLoadError(err instanceof Error ? err.message : "Couldn't load the event"); });
    return () => { alive = false; };
  }, [eventId]);

  const speaker = people.find((p) => p.id === speakerId) ?? null;
  const partner = partners.find((p) => p.id === partnerId) ?? null;
  const lineup = useMemo(() => lineupIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[], [lineupIds, people]);

  /* ── Images (loaded once per URL, shared by preview, thumbnails and export) ── */
  const wanted = useMemo(() => {
    const urls = new Set<string>();
    const add = (u?: string | null) => { if (u) urls.add(u); };
    add(event?.bannerUrl); add(event?.orgLogoUrl); add(speaker?.photoUrl); add(partner?.logoUrl);
    lineup.forEach((p) => add(p.photoUrl));
    return [...urls];
  }, [event, speaker, partner, lineup]);
  useEffect(() => {
    let alive = true;
    wanted.filter((u) => !(u in images)).forEach((u) => {
      void loadStudioImage(u).then((img) => { if (alive) setImages((prev) => ({ ...prev, [u]: img })); });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const img = (url?: string | null) => (url ? images[url] ?? null : null);

  /* ── Colours ── */
  const banner = img(event?.bannerUrl);
  const palettes = useMemo(() => {
    const fromBanner = banner ? extractImageColors(banner as HTMLImageElement) : null;
    return buildPaletteSet({ banner: fromBanner, brandPrimary: event?.brandPrimary, brandAccent: event?.brandAccent });
  }, [banner, event?.brandPrimary, event?.brandAccent]);
  const palette: StudioPalette = paletteId === "custom"
    ? customPalette(custom.primary, custom.accent, custom.light)
    : palettes.find((p) => p.id === paletteId) ?? palettes[0];

  /* ── Content ── */
  const kindMeta = KINDS.find((k) => k.id === kind)!;
  const designs = designsFor(kind);
  const design = designs.find((d) => d.id === designId) ?? designs[0];
  const shownDesigns = styleId === "all" ? designs : designs.filter((d) => d.kit.id === styleId);
  const size = sizeById(sizeId);
  const fonts = FONT_PAIRS.find((f) => f.id === fontId) ?? FONT_PAIRS[0];

  const content: StudioContent = useMemo(() => {
    const o = text[kind] ?? {};
    const pick = (key: keyof StudioContent, fallback: string) => (typeof o[key] === "string" ? (o[key] as string) : fallback);
    const venue = [event?.venue, event?.location].filter(Boolean).join(", ");
    return {
      eventTitle: pick("eventTitle", event?.title ?? ""),
      tagline: pick("tagline", kindMeta.tagline),
      dateLabel: pick("dateLabel", formatStudioDate(event?.date, event?.timezone)),
      venueLabel: pick("venueLabel", venue),
      cta: pick("cta", kindMeta.cta),
      eyebrow: pick("eyebrow", kind === "sponsor" && partner ? tierLabel(partner.tier) : kindMeta.eyebrow),
      orgName: event?.orgName ?? "",
      speaker: speaker ? { name: speaker.name, role: speaker.role, company: speaker.company } : null,
      speakers: lineup.map((p) => ({ name: p.name, role: [p.role, p.company].filter(Boolean).join(", ") })),
      sponsor: partner ? { name: partner.name, tier: partner.tier } : null,
    };
  }, [text, kind, event, kindMeta, speaker, partner, lineup]);

  const assets: StudioAssets = {
    banner, orgLogo: img(event?.orgLogoUrl), photo: img(speaker?.photoUrl),
    photos: lineup.map((p) => img(p.photoUrl)), sponsorLogo: img(partner?.logoUrl),
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spec: StudioSpec = useMemo(() => ({ design, palette, fonts, content, assets }), [design, palette, fonts, content, images, speakerId, partnerId, lineupIds]);

  const setField = (key: keyof StudioContent, value: string) =>
    setText((prev) => ({ ...prev, [kind]: { ...(prev[kind] ?? {}), [key]: value } }));
  const switchKind = (k: StudioKind) => { setKind(k); setDesignId(designsFor(k)[0].id); };

  /* ── What's missing for this kind ── */
  const blocker =
    kind === "speaker" && people.length === 0 ? "Add speakers to this event to make speaker graphics."
    : kind === "lineup" && people.length === 0 ? "Add speakers to this event to make a line-up graphic."
    : kind === "sponsor" && partners.length === 0 ? "Add sponsors to this event to make partner graphics."
    : null;

  /* ── Actions ── */
  const nameParts = () => [event?.title, kind === "speaker" ? speaker?.name : kind === "sponsor" ? partner?.name : kind === "lineup" ? "line-up" : null, design.name];
  const explain = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return /taint|insecure|cross-origin/i.test(msg)
      ? "One of the images (banner, photo or logo) is hosted somewhere that doesn't allow it to be exported. Re-upload it to Illuxus and try again."
      : msg;
  };

  const downloadOne = async () => {
    if (busy) return;
    setBusy("download");
    try {
      download(await exportStudioPng(spec, size), studioFilename(nameParts(), size));
      toast.success("Downloaded", { description: `${size.name} · ${size.width}×${size.height}` });
    } catch (e) { toast.error("Couldn't create the image", { description: explain(e) }); }
    finally { setBusy(""); }
  };

  const downloadAll = async () => {
    if (busy) return;
    setBusy("all");
    try {
      const files: Record<string, Uint8Array> = {};
      for (const s of STUDIO_SIZES) {
        const blob = await exportStudioPng(spec, s);
        files[studioFilename(nameParts(), s)] = new Uint8Array(await blob.arrayBuffer());
      }
      download(new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }), studioFilename(nameParts(), { ...size, id: "all-sizes" }).replace(/\.png$/, ".zip"));
      toast.success("All sizes downloaded", { description: `${STUDIO_SIZES.length} images in one zip file` });
    } catch (e) { toast.error("Couldn't create the images", { description: explain(e) }); }
    finally { setBusy(""); }
  };

  const saveToLibrary = async () => {
    if (busy || !user) return;
    setBusy("save");
    try {
      const blob = await exportStudioPng(spec, size);
      const filename = `${Date.now()}-${studioFilename(nameParts(), size)}`;
      const { assetUrl, storagePath } = await uploadCreativeAsset(eventId, filename, blob);
      const asSpeaker = kind === "speaker" && speaker;
      const asSponsor = kind === "sponsor" && partner;
      await insertCreativeAssetRecord(buildCreativeAssetRecord({
        eventId,
        creativeType: asSpeaker ? "speaker" : asSponsor ? "sponsor" : "event",
        speakerId: asSpeaker ? speaker.id : undefined,
        sponsorId: asSponsor ? partner.id : undefined,
        templateId: `studio:${design.id}`,
        platformFormat: size.id,
        assetUrl, storagePath,
        createdBy: user.id,
        metadata: { studio: true, kind, design: design.id, palette: palette.id, fonts: fonts.id, width: size.width, height: size.height },
      } as Parameters<typeof buildCreativeAssetRecord>[0]));
      toast.success("Saved to your library");
      onSaved?.();
    } catch (e) {
      logger.error("studio save failed", { event_id: eventId, error_message: e instanceof Error ? e.message : String(e) });
      toast.error("Couldn't save to the library", { description: explain(e) });
    } finally { setBusy(""); }
  };

  /* ── Render ── */
  if (loadError) return <p className="py-12 text-center text-[13px] text-destructive">Couldn't load this event: {loadError}</p>;
  if (!event) {
    return <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your event…</div>;
  }

  const actions = (
    <>
      <Button className="h-11 sm:h-9 gap-1.5 flex-1 sm:flex-none" onClick={() => void downloadOne()} disabled={!!busy || !!blocker}>
        {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
      </Button>
      <Button variant="outline" className="h-11 sm:h-9 gap-1.5 flex-1 sm:flex-none" onClick={() => void saveToLibrary()} disabled={!!busy || !!blocker}>
        {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
      </Button>
      <Button variant="outline" className="h-11 sm:h-9 gap-1.5 px-3 sm:px-4" onClick={() => void downloadAll()} disabled={!!busy || !!blocker} title="Download every size as a zip" aria-label="Download all sizes">
        {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />} <span className="hidden sm:inline">All sizes</span>
      </Button>
    </>
  );

  return (
    <div className="pb-20 lg:pb-0">
      {/* What is this graphic about */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="What to create">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => switchKind(k.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 h-10 sm:h-9 text-[13px] font-medium transition-colors ${kind === k.id ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
          >
            <k.icon className="h-3.5 w-3.5" /> {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {/* Preview — first on phones, right-hand and sticky on large screens */}
        <div className="lg:order-2 lg:sticky lg:top-[calc(var(--app-header-h,4rem)+1rem)] space-y-3 min-w-0">
          {blocker ? (
            <div className="rounded-xl border border-dashed border-border py-14 px-4 text-center text-[13px] text-muted-foreground">{blocker}</div>
          ) : (
            <StudioPreview spec={spec} size={size} />
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-1 justify-start sm:justify-center" role="radiogroup" aria-label="Size">
            {STUDIO_SIZES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={sizeId === s.id}
                onClick={() => setSizeId(s.id)}
                title={s.hint}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors ${sizeId === s.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"}`}
              >
                <span className="block text-[12px] font-medium leading-tight">{s.name}</span>
                <span className="block text-[10px] text-muted-foreground leading-tight">{s.width}×{s.height}</span>
              </button>
            ))}
          </div>
          <div className="hidden lg:flex justify-center gap-2">{actions}</div>
        </div>

        {/* Controls */}
        <div className="lg:order-1 min-w-0">
          <Tabs defaultValue="design">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="colours">Colours</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>

            <TabsContent value="design" className="space-y-4 mt-4">
              {kind === "speaker" && people.length > 0 && (
                <div className="space-y-1.5">
                  <Label className={LABEL}>Speaker</Label>
                  <Select value={speakerId} onValueChange={setSpeakerId}>
                    <SelectTrigger className={FIELD} aria-label="Speaker"><SelectValue /></SelectTrigger>
                    <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {kind === "sponsor" && partners.length > 0 && (
                <div className="space-y-1.5">
                  <Label className={LABEL}>Partner</Label>
                  <Select value={partnerId} onValueChange={(id) => { setPartnerId(id); setText((prev) => ({ ...prev, sponsor: { ...(prev.sponsor ?? {}), eyebrow: undefined } })); }}>
                    <SelectTrigger className={FIELD} aria-label="Partner"><SelectValue /></SelectTrigger>
                    <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {kind === "lineup" && people.length > 0 && (
                <fieldset className="space-y-1.5">
                  <legend className={LABEL}>Speakers to include ({lineup.length} of {MAX_LINEUP} max)</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
                    {people.map((p) => {
                      const checked = lineupIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 py-1.5 text-[13px] cursor-pointer min-w-0">
                          <Checkbox
                            checked={checked}
                            disabled={!checked && lineupIds.length >= MAX_LINEUP}
                            onCheckedChange={(c) => setLineupIds((prev) => (c === true ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={LABEL}>Design</p>
                  <p className="text-[11px] text-muted-foreground">{shownDesigns.length} of {designs.length} designs</p>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="radiogroup" aria-label="Style">
                  {[{ id: "all", name: "All styles" }, ...STUDIO_KITS].map((k) => (
                    <button
                      key={k.id}
                      role="radio"
                      aria-checked={styleId === k.id}
                      onClick={() => setStyleId(k.id)}
                      className={`shrink-0 rounded-full border px-3 h-9 sm:h-8 text-[12px] font-medium transition-colors ${styleId === k.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {k.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-[26rem] lg:max-h-[30rem] overflow-y-auto overscroll-contain rounded-lg border border-border p-2" role="radiogroup" aria-label="Design">
                  {shownDesigns.map((d) => (
                    <button
                      key={d.id}
                      role="radio"
                      aria-checked={design.id === d.id}
                      onClick={() => setDesignId(d.id)}
                      className={`relative rounded-lg border p-1.5 text-left transition-colors ${design.id === d.id ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-foreground/40"}`}
                    >
                      <StudioThumb spec={{ ...spec, design: d }} size={STUDIO_SIZES[0]} />
                      <span className="block mt-1.5 text-[11px] font-medium leading-tight truncate">{d.layout.name}</span>
                      <span className="block text-[10px] text-muted-foreground leading-tight truncate">{d.kit.name}</span>
                      {design.id === d.id && <span className="absolute top-2.5 right-2.5 h-4 w-4 rounded-full bg-foreground text-background flex items-center justify-center"><Check className="h-3 w-3" /></span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className={LABEL}>Type style</p>
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Type style">
                  {FONT_PAIRS.map((f) => (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={fontId === f.id}
                      onClick={() => setFontId(f.id)}
                      className={`rounded-lg border h-11 sm:h-10 text-[13px] transition-colors ${fontId === f.id ? "border-foreground bg-foreground/5 font-semibold" : "border-border hover:border-foreground/40"}`}
                      style={{ fontFamily: `"${f.display}", sans-serif` }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="colours" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2" role="radiogroup" aria-label="Colour palette">
                {palettes.map((p) => {
                  const active = paletteId !== "custom" && palette.id === p.id;
                  return (
                    <button
                      key={p.id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPaletteId(p.id)}
                      className={`rounded-lg border p-1.5 text-left transition-colors ${active ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-foreground/40"}`}
                    >
                      <span className="relative block h-10 rounded-md overflow-hidden ring-1 ring-black/10" style={{ background: `linear-gradient(135deg, ${p.bg}, ${p.bg2})` }}>
                        <span className="absolute right-1.5 bottom-1.5 h-4 w-4 rounded-full ring-2 ring-white/70" style={{ background: p.accent }} />
                      </span>
                      <span className="block mt-1 text-[11px] font-medium leading-tight truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className={`rounded-lg border p-3 space-y-3 ${paletteId === "custom" ? "border-foreground" : "border-border"}`}>
                <p className="text-[13px] font-medium">Your own colours</p>
                <div className="grid grid-cols-2 gap-3">
                  {([["primary", "Main colour"], ["accent", "Accent colour"]] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 min-w-0">
                      <input
                        type="color"
                        value={custom[key]}
                        onChange={(e) => { setCustom((c) => ({ ...c, [key]: e.target.value })); setPaletteId("custom"); }}
                        className="h-11 w-12 sm:h-9 sm:w-10 shrink-0 rounded-md border border-border bg-transparent p-0.5 cursor-pointer"
                        aria-label={label}
                      />
                      <span className="text-[12px] text-muted-foreground truncate">{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <Checkbox checked={custom.light} onCheckedChange={(c) => { setCustom((v) => ({ ...v, light: c === true })); setPaletteId("custom"); }} />
                  Light background
                </label>
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-3 mt-4">
              {([
                ["eyebrow", "Label", "e.g. Keynote speaker"],
                ["eventTitle", "Event name", ""],
                ["tagline", kind === "sponsor" ? "Headline" : "Tagline", kind === "sponsor" ? "e.g. Proud to partner with" : "A short line about the event"],
                ["dateLabel", "Date", "e.g. 16 Oct 2026"],
                ["venueLabel", "Venue", "e.g. JW Marriott, Pune"],
                ...(kind === "event" || kind === "lineup" ? [["cta", "Button text", "Leave empty to hide the button"] as const] : []),
              ] as const).map(([key, label, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`studio-${key}`} className={LABEL}>{label}</Label>
                  <Input id={`studio-${key}`} value={content[key] as string} onChange={(e) => setField(key, e.target.value)} placeholder={placeholder} className={FIELD} maxLength={140} />
                </div>
              ))}
              <p className="text-[12px] text-muted-foreground">
                Empty fields are left out of the design. {kind === "speaker" ? "Speaker name, role and company come from the speaker's profile." : ""}
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Phone: actions always within reach */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex gap-2">
        {actions}
      </div>
    </div>
  );
}
