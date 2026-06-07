import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Save, GripVertical, Palette, Layout, Type, Image as ImageIcon,
  Mic2, Clock, Award, Ticket, ChevronUp, ChevronDown,
  RotateCcw, ExternalLink, Smartphone, Monitor, Sparkles,
  Check, Eye, EyeOff, Globe, Link2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useOrg } from "@/contexts/OrgContext";
import { eventPublicPath, eventPublicUrl } from "@/lib/event-routes";
import { useAuth } from "@/contexts/AuthContext";
import EventCoverPicker from "@/components/event/EventCoverPicker";
import EventBannerPicker from "@/components/event/EventBannerPicker";

interface SectionConfig {
  id: string;
  type: string;
  enabled: boolean;
  order: number;
}

interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}

interface PageConfig {
  sections: SectionConfig[];
  theme: ThemeConfig;
}

const defaultConfig: PageConfig = {
  sections: [
    { id: "hero", type: "hero", enabled: true, order: 0 },
    { id: "about", type: "about", enabled: true, order: 1 },
    { id: "speakers", type: "speakers", enabled: true, order: 2 },
    { id: "schedule", type: "schedule", enabled: true, order: 3 },
    { id: "sponsors", type: "sponsors", enabled: true, order: 4 },
    { id: "cta", type: "cta", enabled: true, order: 5 },
  ],
  theme: {
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    backgroundColor: "#ffffff",
    textColor: "#1a1a2e",
    accentColor: "#f59e0b",
    fontFamily: "Inter",
  },
};

const sectionMeta: Record<string, { icon: React.ElementType; label: string; desc: string }> = {
  hero: { icon: ImageIcon, label: "Hero Banner", desc: "Cover, title & CTA" },
  about: { icon: Type, label: "About", desc: "Event description" },
  speakers: { icon: Mic2, label: "Speakers", desc: "Profiles & bios" },
  schedule: { icon: Clock, label: "Schedule", desc: "Agenda timeline" },
  sponsors: { icon: Award, label: "Sponsors", desc: "Logo showcase" },
  cta: { icon: Ticket, label: "Register CTA", desc: "Call-to-action" },
};

const fontOptions = [
  "Inter", "DM Sans", "Space Grotesk", "Sora", "Plus Jakarta Sans",
  "Manrope", "Outfit", "Urbanist",
];

const presetThemes = [
  { name: "Indigo", primary: "#6366f1", secondary: "#8b5cf6", accent: "#f59e0b", bg: "#ffffff", text: "#1a1a2e" },
  { name: "Emerald", primary: "#10b981", secondary: "#059669", accent: "#f97316", bg: "#ffffff", text: "#064e3b" },
  { name: "Rose", primary: "#f43f5e", secondary: "#e11d48", accent: "#8b5cf6", bg: "#ffffff", text: "#1a1a2e" },
  { name: "Ocean", primary: "#0ea5e9", secondary: "#0284c7", accent: "#f59e0b", bg: "#f0f9ff", text: "#0c4a6e" },
  { name: "Dark", primary: "#a78bfa", secondary: "#7c3aed", accent: "#fbbf24", bg: "#0f0f23", text: "#e2e8f0" },
  { name: "Midnight", primary: "#60a5fa", secondary: "#3b82f6", accent: "#f472b6", bg: "#111827", text: "#f9fafb" },
];

interface Props {
  eventId: string;
}

const EventDesignPage = ({ eventId }: Props) => {
  const [config, setConfig] = useState<PageConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [activeTab, setActiveTab] = useState<"sections" | "theme">("sections");
  const [eventTitle, setEventTitle] = useState("Event");
  const [eventDate, setEventDate] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventImageUrl, setEventImageUrl] = useState<string>("");
  const [bannerLandscapeUrl, setBannerLandscapeUrl] = useState<string>("");
  const [bannerPortraitUrl, setBannerPortraitUrl] = useState<string>("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const { org } = useOrg();
  const { user } = useAuth();
  const orgHandle =
    (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("events").select("title, date, venue, location, description, page_config, slug, image_url, banner_landscape_url, banner_portrait_url").eq("id", eventId).single().then(({ data }) => {
      if (data) {
        setEventTitle(data.title);
        setEventDate(data.date);
        setEventVenue([data.venue, data.location].filter(Boolean).join(" · "));
        setEventDescription(data.description || "");
        setEventSlug((data as any).slug || "");
        setSavedSlug((data as any).slug || "");
        setEventImageUrl((data as any).image_url || "");
        setBannerLandscapeUrl((data as any).banner_landscape_url || "");
        setBannerPortraitUrl((data as any).banner_portrait_url || "");
        if (data.page_config) {
          const pc = data.page_config as unknown as PageConfig;
          setConfig({
            sections: pc.sections || defaultConfig.sections,
            theme: { ...defaultConfig.theme, ...(pc.theme || {}) },
          });
        }
      }
      setLoaded(true);
    });
  }, [eventId]);

  const saveSlug = async () => {
    const cleaned = eventSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!cleaned) { setSlugError("Slug can't be empty."); return; }
    setSlugSaving(true);
    setSlugError(null);
    const { data, error } = await supabase.from("events")
      .update({ slug: cleaned })
      .eq("id", eventId)
      .select("slug")
      .single();
    setSlugSaving(false);
    if (error) {
      setSlugError(error.message);
      return;
    }
    const finalSlug = (data as any)?.slug || cleaned;
    setEventSlug(finalSlug);
    setSavedSlug(finalSlug);
    toast({
      title: "URL updated",
      description:
        finalSlug !== cleaned
          ? `Adjusted to "${finalSlug}" to keep it unique.`
          : `Now reachable at ${eventPublicPath({ id: eventId, slug: finalSlug }, orgHandle)}`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("events").update({
      page_config: JSON.parse(JSON.stringify(config)),
    }).eq("id", eventId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Saved", description: "Page design updated successfully." });
    setSaving(false);
  };

  const sortedSections = [...config.sections].sort((a, b) => a.order - b.order);

  const toggleSection = (id: string) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s),
    }));
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    setConfig(prev => {
      const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(s => s.id === id);
      const target = idx + dir;
      if (target < 0 || target >= sorted.length) return prev;
      const newSections = sorted.map((s, i) => {
        if (i === idx) return { ...s, order: target };
        if (i === target) return { ...s, order: idx };
        return { ...s, order: i };
      });
      return { ...prev, sections: newSections };
    });
  };

  const updateTheme = (key: keyof ThemeConfig, value: string) => {
    setActivePreset(null);
    setConfig(prev => ({ ...prev, theme: { ...prev.theme, [key]: value } }));
  };

  const applyPreset = (preset: typeof presetThemes[0]) => {
    setActivePreset(preset.name);
    setConfig(prev => ({
      ...prev,
      theme: {
        ...prev.theme,
        primaryColor: preset.primary,
        secondaryColor: preset.secondary,
        accentColor: preset.accent,
        backgroundColor: preset.bg,
        textColor: preset.text,
      },
    }));
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setConfig(prev => {
      const sorted = [...prev.sections].sort((a, b) => a.order - b.order);
      const fromIdx = sorted.findIndex(s => s.id === dragId);
      const toIdx = sorted.findIndex(s => s.id === targetId);
      const reordered = [...sorted];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return { ...prev, sections: reordered.map((s, i) => ({ ...s, order: i })) };
    });
    setDragId(null);
  };

  if (!loaded) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading designer...</p>
      </div>
    </div>
  );

  const theme = config.theme;
  const enabledCount = config.sections.filter(s => s.enabled).length;

  return (
    <div className="max-w-[1300px] space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Page Designer</h2>
            <p className="text-[12px] text-muted-foreground">{enabledCount} sections active · Drag to reorder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5 rounded-lg" asChild>
            <a
              href={eventPublicUrl({ id: eventId, slug: savedSlug || null }, orgHandle)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </a>
          </Button>
          <Button size="sm" className="h-8 text-[12px] gap-1.5 rounded-lg" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        {/* Left panel */}
        <div className="space-y-4">
          {/* Page URL */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[12px] font-medium">Public URL</p>
            </div>
            <div className="flex items-center">
              <span className="px-2 h-8 inline-flex items-center text-[11px] text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md whitespace-nowrap">
                /{orgHandle || "<workspace>"}/events/
              </span>
              <Input
                value={eventSlug}
                onChange={(e) => {
                  setSlugError(null);
                  setEventSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="my-event-name"
                className="h-8 text-[12px] font-mono rounded-l-none rounded-r-none border-r-0"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-l-none text-[11px] px-2.5"
                onClick={saveSlug}
                disabled={slugSaving || !eventSlug || eventSlug === savedSlug}
              >
                {slugSaving ? "…" : "Save"}
              </Button>
            </div>
            {slugError ? (
              <p className="text-[11px] text-destructive mt-1.5">{slugError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Lowercase letters, numbers, hyphens. A unique suffix is added automatically if it's already taken.
              </p>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted/60 border border-border">
            {([
              { key: "sections" as const, icon: Layout, label: "Sections" },
              { key: "theme" as const, icon: Palette, label: "Theme" },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[12px] font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sections panel */}
          {activeTab === "sections" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {/* Banner image — hero/landing/lobby */}
              <div className="rounded-xl border border-border bg-card p-3 mb-2">
                <div className="mb-3">
                  <h3 className="text-[12px] font-semibold tracking-tight">Event banner</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Shown on the public event page hero, landing page and live waiting room. Mobile falls back to landscape if portrait is empty.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EventBannerPicker
                    eventId={eventId}
                    userId={user?.id ?? ""}
                    label="Desktop (16:9)"
                    aspect={16 / 9}
                    aspectLabel="16:9 (landscape)"
                    recommendedPx="1920×1080 px"
                    outputLongSide={1920}
                    variant="landscape"
                    imageUrl={bannerLandscapeUrl}
                    onChange={async (url) => {
                      setBannerLandscapeUrl(url);
                      const { error } = await supabase.from("events").update({ banner_landscape_url: url || null }).eq("id", eventId);
                      if (error) toast({ title: "Banner update failed", description: error.message, variant: "destructive" });
                      else toast({ title: url ? "Desktop banner updated" : "Desktop banner removed" });
                    }}
                  />
                  <EventBannerPicker
                    eventId={eventId}
                    userId={user?.id ?? ""}
                    label="Mobile (4:5)"
                    aspect={4 / 5}
                    aspectLabel="4:5 (portrait)"
                    recommendedPx="1080×1350 px"
                    outputLongSide={1350}
                    variant="portrait"
                    imageUrl={bannerPortraitUrl}
                    onChange={async (url) => {
                      setBannerPortraitUrl(url);
                      const { error } = await supabase.from("events").update({ banner_portrait_url: url || null }).eq("id", eventId);
                      if (error) toast({ title: "Banner update failed", description: error.message, variant: "destructive" });
                      else toast({ title: url ? "Mobile banner updated" : "Mobile banner removed" });
                    }}
                  />
                </div>
              </div>

              {/* Cover image — square listing thumbnail */}
              <div className="rounded-xl border border-border bg-card p-3 mb-2">
                <div className="mb-3">
                  <h3 className="text-[12px] font-semibold tracking-tight">Listing thumbnail (1:1)</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Square cover used in event lists, profile previews and social cards. Not used as the page banner.
                  </p>
                </div>
                <EventCoverPicker
                  eventId={eventId}
                  userId={user?.id ?? ""}
                  imageUrl={eventImageUrl}
                  onChange={async (url) => {
                    setEventImageUrl(url);
                    const { error } = await supabase
                      .from("events")
                      .update({ image_url: url || null })
                      .eq("id", eventId);
                    if (error) {
                      toast({ title: "Cover update failed", description: error.message, variant: "destructive" });
                    } else {
                      toast({ title: url ? "Cover updated" : "Cover removed" });
                    }
                  }}
                />

                {/* Live public hero preview */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Public hero preview</p>
                    <span className="text-[10px] text-muted-foreground">1:1</span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-3 items-start rounded-xl bg-muted/30 p-3">
                    <div
                      className="aspect-square w-full rounded-lg overflow-hidden border border-border"
                      style={{
                        background: eventImageUrl
                          ? `url(${eventImageUrl}) center/cover no-repeat`
                          : `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
                      }}
                    >
                      {!eventImageUrl && (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-white/70" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[14px] font-bold leading-tight line-clamp-2"
                        style={{ fontFamily: theme.fontFamily, color: theme.textColor }}
                      >
                        {eventTitle}
                      </p>
                      {eventDate && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {new Date(eventDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                      )}
                      {eventVenue && (
                        <p className="text-[11px] text-muted-foreground truncate">{eventVenue}</p>
                      )}
                      <button
                        type="button"
                        className="mt-2 inline-flex h-6 items-center px-2.5 rounded-md text-[11px] font-semibold text-white"
                        style={{ backgroundColor: theme.accentColor }}
                      >
                        Register
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Square cover preview — used in event lists, profile cards and social previews.
                  </p>
                </div>
              </div>
              {sortedSections.map((section, idx) => {
                const meta = sectionMeta[section.type];
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={section.id}
                    layout
                    draggable
                    onDragStart={() => handleDragStart(section.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(section.id)}
                    className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-grab active:cursor-grabbing ${
                      dragId === section.id
                        ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/5 scale-[1.02] z-10"
                        : section.enabled
                        ? "border-border bg-card hover:border-foreground/10 hover:shadow-sm"
                        : "border-border/40 bg-muted/20 opacity-50"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0 transition-colors" />
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        backgroundColor: section.enabled ? `${theme.primaryColor}12` : undefined,
                        color: section.enabled ? theme.primaryColor : undefined,
                      }}
                    >
                      <Icon className={`h-4 w-4 ${!section.enabled ? 'text-muted-foreground/40' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium leading-tight">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{meta.desc}</p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => moveSection(section.id, -1)} disabled={idx === 0} className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-20 transition-colors">
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moveSection(section.id, 1)} disabled={idx === sortedSections.length - 1} className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-20 transition-colors">
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <Switch checked={section.enabled} onCheckedChange={() => toggleSection(section.id)} className="scale-[0.7] flex-shrink-0" />
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* Theme panel */}
          {activeTab === "theme" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {/* Presets */}
              <div>
                <p className="text-[12px] font-medium text-foreground mb-3">Presets</p>
                <div className="grid grid-cols-3 gap-2">
                  {presetThemes.map((preset) => {
                    const isActive = activePreset === preset.name;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 group ${
                          isActive
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-transparent bg-card hover:bg-muted/50 hover:border-border"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </div>
                        )}
                        <div className="flex gap-1">
                          {[preset.primary, preset.secondary, preset.accent].map((c, i) => (
                            <div key={i} className="h-6 w-6 rounded-full shadow-sm border border-border/30 transition-transform group-hover:scale-110" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom colors */}
              <div>
                <p className="text-[12px] font-medium text-foreground mb-3">Custom Colors</p>
                <div className="space-y-2">
                  {([
                    ["primaryColor", "Primary"] as const,
                    ["secondaryColor", "Secondary"] as const,
                    ["accentColor", "Accent"] as const,
                    ["backgroundColor", "Background"] as const,
                    ["textColor", "Text"] as const,
                  ]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-5 w-5 rounded-md border border-border/50 shadow-sm" style={{ backgroundColor: theme[key] }} />
                        <Label className="text-[12px] text-muted-foreground">{label}</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="text"
                          value={theme[key]}
                          onChange={(e) => updateTheme(key, e.target.value)}
                          className="h-7 w-[76px] text-[10px] text-center font-mono bg-muted/50 border-border/50 rounded-md"
                        />
                        <div className="relative">
                          <input
                            type="color"
                            value={theme[key]}
                            onChange={(e) => updateTheme(key, e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-7 h-7"
                          />
                          <div className="h-7 w-7 rounded-md border border-border/50 cursor-pointer hover:border-foreground/20 transition-colors" style={{ backgroundColor: theme[key] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Font */}
              <div>
                <p className="text-[12px] font-medium text-foreground mb-3">Typography</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {fontOptions.map((font) => (
                    <button
                      key={font}
                      onClick={() => updateTheme("fontFamily", font)}
                      className={`relative px-3 py-2.5 rounded-lg text-[12px] border-2 transition-all duration-200 ${
                        theme.fontFamily === font
                          ? "border-primary bg-primary/5 text-foreground font-medium"
                          : "border-transparent bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {theme.fontFamily === font && (
                        <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-2 w-2 text-primary-foreground" />
                        </div>
                      )}
                      {font}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[12px] gap-1.5 w-full rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => { setConfig(prev => ({ ...prev, theme: defaultConfig.theme })); setActivePreset(null); }}
              >
                <RotateCcw className="h-3 w-3" /> Reset to defaults
              </Button>
            </motion.div>
          )}
        </div>

        {/* Right panel — Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[12px] font-medium text-muted-foreground">Live Preview</p>
            </div>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border">
              {([
                { key: "desktop" as const, icon: Monitor, label: "Desktop" },
                { key: "mobile" as const, icon: Smartphone, label: "Mobile" },
              ]).map(mode => (
                <button
                  key={mode.key}
                  onClick={() => setPreviewMode(mode.key)}
                  className={`h-7 px-2.5 rounded-md text-[11px] flex items-center gap-1.5 transition-all duration-200 ${
                    previewMode === mode.key
                      ? "bg-card text-foreground shadow-sm border border-border/50"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <mode.icon className="h-3 w-3" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl overflow-hidden border border-border shadow-sm transition-all duration-500 ${
            previewMode === "mobile" ? "max-w-[390px] mx-auto" : ""
          }`}>
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-chart-3/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-accent/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-background border border-border/50 text-[10px] text-muted-foreground font-mono">
                  <Globe className="h-3 w-3" />
                  yourevent.com
                </div>
              </div>
            </div>

            {/* Preview content */}
            <div
              className="overflow-y-auto"
              style={{
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
                fontFamily: theme.fontFamily + ", sans-serif",
                maxHeight: "65vh",
              }}
            >
              <AnimatePresence mode="sync">
                {sortedSections.filter(s => s.enabled).map((section) => (
                  <motion.div
                    key={section.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <PreviewSection
                      type={section.type}
                      theme={theme}
                      eventTitle={eventTitle}
                      eventDate={eventDate}
                      eventVenue={eventVenue}
                      eventDescription={eventDescription}
                      previewMode={previewMode}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {enabledCount === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <EyeOff className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No sections enabled</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Toggle sections on from the left panel</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Preview Section Renderers ─── */

function PreviewSection({ type, theme, eventTitle, eventDate, eventVenue, eventDescription, previewMode }: {
  type: string;
  theme: ThemeConfig;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventDescription: string;
  previewMode: string;
}) {
  const m = previewMode === "mobile";

  switch (type) {
    case "hero":
      return (
        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}>
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-10" style={{ backgroundColor: theme.accentColor }} />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full opacity-10" style={{ backgroundColor: theme.accentColor }} />
          <div className={`relative ${m ? "px-6 py-14" : "px-14 py-24"}`}>
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase mb-5" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)" }}>
                <Sparkles className="h-3 w-3" />
                Upcoming Event
              </div>
              <h1 className={`font-extrabold text-white leading-[1.1] mb-4 ${m ? "text-3xl" : "text-5xl"}`} style={{ fontFamily: theme.fontFamily }}>
                {eventTitle}
              </h1>
              <div className="flex flex-wrap gap-4 text-white/75 text-[13px] mb-8">
                {eventDate && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(eventDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {eventVenue && (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {eventVenue}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button className="px-7 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.03] shadow-lg" style={{ backgroundColor: theme.accentColor, color: "#fff" }}>
                  Register Now
                </button>
                <button className="px-7 py-3 rounded-xl text-sm font-medium border border-white/25 text-white/90 hover:bg-white/10 transition-all">
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>
      );

    case "about":
      return (
        <div className={`${m ? "px-6 py-10" : "px-14 py-16"}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: theme.primaryColor }}>About</span>
          </div>
          <h2 className={`font-bold mb-4 ${m ? "text-xl" : "text-2xl"}`} style={{ color: theme.textColor }}>About This Event</h2>
          <p className="text-[14px] leading-[1.8] opacity-60 max-w-2xl" style={{ color: theme.textColor }}>
            {eventDescription || "Join us for an incredible experience featuring world-class speakers, hands-on workshops, and networking opportunities. This event brings together industry leaders and innovators to share insights and shape the future."}
          </p>
          <div className={`grid gap-4 mt-8 ${m ? "grid-cols-1" : "grid-cols-3"}`}>
            {[
              { num: "500+", label: "Attendees" },
              { num: "20+", label: "Speakers" },
              { num: "3", label: "Days" },
            ].map((stat, i) => (
              <div key={i} className="text-center p-4 rounded-xl" style={{ backgroundColor: `${theme.primaryColor}08` }}>
                <p className="text-2xl font-bold" style={{ color: theme.primaryColor }}>{stat.num}</p>
                <p className="text-[12px] mt-1 opacity-50" style={{ color: theme.textColor }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "speakers":
      return (
        <div className={`${m ? "px-6 py-10" : "px-14 py-16"}`} style={{ backgroundColor: `${theme.primaryColor}04` }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: theme.primaryColor }}>Speakers</span>
          </div>
          <h2 className={`font-bold mb-6 ${m ? "text-xl" : "text-2xl"}`} style={{ color: theme.textColor }}>Meet Our Speakers</h2>
          <div className={`grid gap-4 ${m ? "grid-cols-1" : "grid-cols-3"}`}>
            {[
              { name: "Sarah Johnson", role: "CEO, TechCorp", initials: "SJ" },
              { name: "Alex Chen", role: "CTO, InnovateLabs", initials: "AC" },
              { name: "Maria Garcia", role: "VP Design, Creative", initials: "MG" },
            ].map((speaker, i) => (
              <div key={i} className="rounded-2xl p-5 border transition-all hover:shadow-md" style={{ borderColor: `${theme.primaryColor}12`, backgroundColor: theme.backgroundColor }}>
                <div className="h-14 w-14 rounded-2xl mb-4 flex items-center justify-center text-white text-base font-bold" style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}>
                  {speaker.initials}
                </div>
                <p className="text-[14px] font-semibold" style={{ color: theme.textColor }}>{speaker.name}</p>
                <p className="text-[12px] opacity-50 mt-0.5" style={{ color: theme.textColor }}>{speaker.role}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "schedule":
      return (
        <div className={`${m ? "px-6 py-10" : "px-14 py-16"}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-8 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: theme.primaryColor }}>Schedule</span>
          </div>
          <h2 className={`font-bold mb-6 ${m ? "text-xl" : "text-2xl"}`} style={{ color: theme.textColor }}>Event Schedule</h2>
          <div className="space-y-3">
            {[
              { time: "9:00 AM", title: "Registration & Coffee", type: "break", duration: "60 min" },
              { time: "10:00 AM", title: "Opening Keynote", type: "keynote", duration: "90 min" },
              { time: "11:30 AM", title: "Workshop: Building at Scale", type: "workshop", duration: "90 min" },
              { time: "1:00 PM", title: "Networking Lunch", type: "break", duration: "60 min" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-sm group" style={{ borderColor: `${theme.primaryColor}10`, backgroundColor: theme.backgroundColor }}>
                <div className="text-right w-16 flex-shrink-0">
                  <span className="text-[12px] font-mono font-medium" style={{ color: theme.primaryColor }}>{item.time}</span>
                  <p className="text-[10px] opacity-40" style={{ color: theme.textColor }}>{item.duration}</p>
                </div>
                <div className="relative flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full border-2 transition-transform group-hover:scale-125" style={{ borderColor: item.type === "break" ? theme.accentColor : theme.primaryColor, backgroundColor: `${item.type === "break" ? theme.accentColor : theme.primaryColor}30` }} />
                  {i < 3 && <div className="w-px h-6 absolute top-4" style={{ backgroundColor: `${theme.primaryColor}15` }} />}
                </div>
                <div className="flex-1">
                  <span className="text-[13px] font-medium" style={{ color: theme.textColor }}>{item.title}</span>
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: `${theme.primaryColor}08`, color: theme.primaryColor }}>{item.type}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "sponsors":
      return (
        <div className={`${m ? "px-6 py-10" : "px-14 py-16"}`} style={{ backgroundColor: `${theme.secondaryColor}04` }}>
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-1 w-8 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: theme.primaryColor }}>Sponsors</span>
              <div className="h-1 w-8 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
            </div>
            <h2 className={`font-bold ${m ? "text-xl" : "text-2xl"}`} style={{ color: theme.textColor }}>Our Sponsors</h2>
          </div>
          <div className={`grid gap-4 ${m ? "grid-cols-2" : "grid-cols-4"}`}>
            {[
              { name: "Acme Corp", tier: "Platinum" },
              { name: "TechFlow", tier: "Gold" },
              { name: "DataSync", tier: "Gold" },
              { name: "CloudBase", tier: "Silver" },
            ].map((sponsor, i) => (
              <div key={i} className="rounded-2xl p-6 border flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md" style={{ borderColor: `${theme.primaryColor}10`, backgroundColor: theme.backgroundColor }}>
                <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: `linear-gradient(135deg, ${[theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.primaryColor][i]}, ${[theme.secondaryColor, theme.primaryColor, theme.primaryColor, theme.accentColor][i]})` }}>
                  {sponsor.name.charAt(0)}
                </div>
                <span className="text-[13px] font-semibold mt-1" style={{ color: theme.textColor }}>{sponsor.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${theme.primaryColor}08`, color: theme.primaryColor }}>{sponsor.tier}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "cta":
      return (
        <div className={`relative overflow-hidden ${m ? "px-6 py-14" : "px-14 py-20"} text-center`} style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }}>
          <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-10" style={{ backgroundColor: theme.accentColor }} />
          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full opacity-10" style={{ backgroundColor: theme.accentColor }} />
          <div className="relative">
            <h2 className={`font-extrabold text-white mb-3 ${m ? "text-2xl" : "text-3xl"}`}>Ready to Join?</h2>
            <p className="text-white/60 text-[14px] mb-8 max-w-md mx-auto">Don't miss out on this incredible opportunity. Secure your spot before tickets sell out.</p>
            <button className="px-10 py-3.5 rounded-xl text-sm font-bold text-white shadow-xl transition-all hover:scale-[1.03] hover:shadow-2xl" style={{ backgroundColor: theme.accentColor }}>
              Register Now →
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default EventDesignPage;
