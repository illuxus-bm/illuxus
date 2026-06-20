import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Save, ExternalLink, Rocket, Upload, Loader2, X, Code2, Copy, Check, AtSign, AlertCircle, Crop } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import type { ThemeConfig, PageBuilderState } from "./types";
import { orgPublicUrl, PROJECT_CUSTOM_DOMAIN, PROJECT_PUBLISHED_HOST } from "@/lib/event-routes";
import {
  sanitizeHandleInput,
  validateHandle,
  preferredPublicHost,
  publicUrlFor,
} from "@/lib/workspace-handle";
import CoverCropDialog from "@/components/event/CoverCropDialog";

/**
 * Lu.ma-style organization landing page customization.
 * Only exposes the levers that matter for an attendee-first profile:
 *   • Cover image (banner above the avatar)
 *   • Bio / about copy under the org name
 *   • Theme: accent + background + text colors and font
 *
 * Stored in `organizations.landing_config` (PageBuilderState shape):
 *   { theme, blocks: [], cover, bio, accentLink }
 * `blocks` is kept as an empty array for backwards compatibility with
 * the legacy renderer; the public page now ignores blocks entirely.
 */

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#0f172a",
  secondaryColor: "#1e293b",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  accentColor: "#6366f1",
  fontFamily: "Inter",
};

const FONT_OPTIONS = [
  "Inter", "DM Sans", "Space Grotesk", "Sora", "Plus Jakarta Sans",
  "Manrope", "Outfit", "Urbanist",
];

const THEME_PRESETS: { name: string; theme: Partial<ThemeConfig> }[] = [
  { name: "Light",    theme: { primaryColor: "#0f172a", accentColor: "#6366f1", backgroundColor: "#ffffff", textColor: "#0f172a" } },
  { name: "Cream",    theme: { primaryColor: "#1f1300", accentColor: "#d97706", backgroundColor: "#fbf7f0", textColor: "#1f1300" } },
  { name: "Mint",     theme: { primaryColor: "#064e3b", accentColor: "#10b981", backgroundColor: "#f0fdf4", textColor: "#064e3b" } },
  { name: "Sky",      theme: { primaryColor: "#0c4a6e", accentColor: "#0ea5e9", backgroundColor: "#f0f9ff", textColor: "#0c4a6e" } },
  { name: "Rose",     theme: { primaryColor: "#1a1a2e", accentColor: "#f43f5e", backgroundColor: "#fff1f2", textColor: "#1a1a2e" } },
  { name: "Midnight", theme: { primaryColor: "#f9fafb", accentColor: "#818cf8", backgroundColor: "#0b0f1a", textColor: "#f9fafb" } },
];

interface ExtendedConfig extends PageBuilderState {
  cover?: string;
  bio?: string;
  accentLink?: { label?: string; url?: string };
}

function buildDefaultState(): ExtendedConfig {
  return { theme: { ...DEFAULT_THEME }, blocks: [], cover: "", bio: "", accentLink: { label: "", url: "" } };
}

/**
 * Upload a file to the public `site-assets` bucket and return its public URL.
 * Same pattern used by the Site Editor — keeps cache-busting via unique paths.
 */
async function uploadOrgAsset(file: File | Blob, prefix: string, forceExt?: string): Promise<string> {
  const ext = forceExt || (file instanceof File ? (file.name.split(".").pop()?.toLowerCase() || "jpg") : "jpg");
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("site-assets")
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(`${error.message} (path: ${path})`);
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

export default function OrgPageForm() {
  const { org, refreshOrg } = useOrg();
  const { toast } = useToast();
  const [state, setState] = useState<ExtendedConfig>(buildDefaultState);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<string>("");
  const lastSavedLogoRef = useRef<string>("");
  const [handleDraft, setHandleDraft] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [savingHandle, setSavingHandle] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [embedFilter, setEmbedFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [view, setView] = useState<"edit" | "preview">("edit");

  // Load Google Font dynamically when the theme fontFamily changes
  useEffect(() => {
    if (!state.theme.fontFamily) return;
    const fontName = state.theme.fontFamily.trim();
    const systemFonts = ["sans-serif", "serif", "monospace", "Arial", "Helvetica", "Times New Roman", "Courier New", "Inter"];
    if (systemFonts.includes(fontName)) return;

    const linkId = `google-font-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [state.theme.fontFamily]);

  useEffect(() => {
    if (!org) return;
    const cfg = (org as { landing_config?: unknown }).landing_config as ExtendedConfig | null;
    const initial: ExtendedConfig = {
      theme: { ...DEFAULT_THEME, ...(cfg?.theme || {}) },
      blocks: [],
      cover: cfg?.cover || "",
      bio: cfg?.bio || "",
      accentLink: cfg?.accentLink || { label: "", url: "" },
    };
    setState(initial);
    const initialLogo = (org as { logo_url?: string | null }).logo_url || "";
    setLogoUrl(initialLogo);
    lastSavedLogoRef.current = initialLogo;
    lastSavedRef.current = JSON.stringify(initial);
    setHandleDraft(((org as { subdomain?: string | null }).subdomain || org.slug || "").toLowerCase());
    setLoaded(true);
  }, [org]);

  const dirty = loaded && (
    JSON.stringify(state) !== lastSavedRef.current ||
    logoUrl !== lastSavedLogoRef.current
  );

  const setTheme = (patch: Partial<ThemeConfig>) =>
    setState(s => ({ ...s, theme: { ...s.theme, ...patch } }));

  const handleSave = useCallback(async () => {
    if (!org) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ landing_config: state as never, logo_url: logoUrl || null })
      .eq("id", org.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    lastSavedRef.current = JSON.stringify(state);
    lastSavedLogoRef.current = logoUrl;
    toast({ title: "Saved", description: "Profile updated." });
    await refreshOrg();
  }, [org, state, logoUrl, toast, refreshOrg]);

  const togglePublish = async () => {
    if (!org) return;
    if (dirty) await handleSave();
    const next = !(org as { landing_published?: boolean }).landing_published;
    const { error } = await supabase
      .from("organizations")
      .update({ landing_published: next })
      .eq("id", org.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "Published" : "Unpublished",
      description: next
        ? `Your page is live at /org/${(org as { subdomain?: string | null }).subdomain || org.slug}`
        : "Your page is no longer publicly visible.",
    });
    await refreshOrg();
  };

  if (!org || !loaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading editor…</div>;
  }

  const isPublished = !!(org as { landing_published?: boolean }).landing_published;
  const handle = (org as { subdomain?: string | null }).subdomain || org.slug;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-4 lg:-m-6">
      {/* Toolbar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between gap-2 px-3 sm:px-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold hidden md:block">Profile page</h2>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              isPublished
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isPublished ? "Live" : "Draft"}
          </span>
          {dirty && (
            <span className="text-[11px] text-muted-foreground hidden lg:inline">· Unsaved changes</span>
          )}
          {dirty && (
            <span
              className="lg:hidden h-1.5 w-1.5 rounded-full bg-amber-500"
              title="Unsaved changes"
            />
          )}
        </div>
        <div className="flex gap-1 p-0.5 rounded-md bg-muted/50">
          {(["edit", "preview"] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 h-6 rounded text-[11px] font-medium capitalize transition-colors ${
                view === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px] gap-1 px-2 sm:px-3"
            asChild
            title="Open"
          >
            <a href={orgPublicUrl(handle)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">Open</span>
            </a>
          </Button>
          <Button
            size="sm"
            className="h-7 text-[12px] gap-1 px-2 sm:px-3"
            onClick={handleSave}
            disabled={saving || !dirty}
            title={saving ? "Saving…" : dirty ? "Save" : "Saved"}
          >
            <Save className="h-3 w-3" />
            <span className="hidden sm:inline">{saving ? "Saving…" : dirty ? "Save" : "Saved"}</span>
          </Button>
          <Button
            size="sm"
            variant={isPublished ? "outline" : "default"}
            className="h-7 text-[12px] gap-1 px-2 sm:px-3"
            onClick={togglePublish}
            title={isPublished ? "Unpublish" : "Publish"}
          >
            <Rocket className="h-3 w-3" />
            <span className="hidden md:inline">{isPublished ? "Unpublish" : "Publish"}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "edit" ? (
        <aside className="h-full overflow-y-auto bg-card p-6 space-y-6 w-full">
          <Section title="Branding" hint="Your logo and banner appear at the top of your public profile.">
            <ImageUploadField
              label="Logo"
              hint="Square image (1:1). Recommended 512×512."
              aspect="square"
              value={logoUrl}
              onChange={setLogoUrl}
              prefix={`org-${org.id}/logo`}
            />
            <ImageUploadField
              label="Cover banner"
              hint="Wide image (4:1). Recommended 1600×400."
              aspect="banner"
              value={state.cover || ""}
              onChange={v => setState(s => ({ ...s, cover: v }))}
              prefix={`org-${org.id}/cover`}
            />
          </Section>

          <Section title="About" hint="Shown directly under your organization name on the profile page.">
            <FieldTextarea
              label="Bio"
              value={state.bio || ""}
              placeholder="Tell people who you are and what kind of events you host."
              rows={4}
              onChange={v => setState(s => ({ ...s, bio: v }))}
            />
            <div className="grid grid-cols-[1fr_1.5fr] gap-2">
              <FieldText
                label="Link label"
                value={state.accentLink?.label || ""}
                placeholder="Website"
                onChange={v => setState(s => ({ ...s, accentLink: { ...(s.accentLink || {}), label: v } }))}
              />
              <FieldText
                label="Link URL"
                value={state.accentLink?.url || ""}
                placeholder="https://…"
                onChange={v => setState(s => ({ ...s, accentLink: { ...(s.accentLink || {}), url: v } }))}
              />
            </div>
          </Section>

          <Section title="URL & Embed" hint="Your public landing page URL and an embeddable event widget for any external site.">
            {(() => {
              const currentHost = typeof window !== "undefined" ? window.location.host : "";
              const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
              const preferred = preferredPublicHost({
                currentHost,
                customDomain: PROJECT_CUSTOM_DOMAIN,
                publishedHost: PROJECT_PUBLISHED_HOST,
              });
              const effective = handleDraft || handle;
              const primaryUrl = publicUrlFor(preferred.host, effective, protocol);
              const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/org-events`;
              const embedScriptUrl = `${protocol}//${preferred.host}/embed.js`;
              const embedSnippet = `<div id="my-events"></div>
<script
  src="${embedScriptUrl}"
  data-org="${effective}"
  data-fn="${fnUrl}"
  data-target="my-events"
  data-filter="${embedFilter}"
  data-limit="10"
  data-theme="light"
  data-api="${protocol}//${preferred.host}"
  defer
></script>`;

              const onHandleChange = (raw: string) => {
                const next = sanitizeHandleInput(raw);
                setHandleDraft(next);
                if (!next) return setHandleError(null);
                const r = validateHandle(next);
                setHandleError(r.ok ? null : r.message);
              };

              const saveHandle = async () => {
                if (!org) return;
                const cleaned = handleDraft.trim().toLowerCase();
                const r = validateHandle(cleaned);
                if (!r.ok) {
                  setHandleError(r.message);
                  toast({ title: "Invalid handle", description: r.message, variant: "destructive" });
                  return;
                }
                setSavingHandle(true);
                const { data: clash } = await supabase
                  .from("organizations")
                  .select("id")
                  .or(`subdomain.eq.${cleaned},slug.eq.${cleaned}`)
                  .neq("id", org.id)
                  .maybeSingle();
                if (clash) {
                  setSavingHandle(false);
                  const msg = `"${cleaned}" is already taken.`;
                  setHandleError(msg);
                  toast({ title: "Handle taken", description: msg, variant: "destructive" });
                  return;
                }
                const { error } = await supabase
                  .from("organizations")
                  .update({ subdomain: cleaned })
                  .eq("id", org.id);
                setSavingHandle(false);
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                  return;
                }
                setHandleError(null);
                toast({ title: "Saved", description: `Live at ${preferred.host}/org/${cleaned}.` });
                await refreshOrg();
              };

              const copy = async (text: string, key: string) => {
                await navigator.clipboard.writeText(text);
                setCopied(key);
                setTimeout(() => setCopied(null), 1500);
              };

              return (
                <>
                  <div className="space-y-1">
                    <Label className="text-[11px] flex items-center gap-1"><AtSign className="h-3 w-3" /> Workspace handle</Label>
                    <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                      <span className="px-2 inline-flex items-center text-[11px] text-muted-foreground bg-muted font-mono border-r border-input shrink-0">
                        {preferred.host}/org/
                      </span>
                      <input
                        value={handleDraft}
                        onChange={e => onHandleChange(e.target.value)}
                        placeholder="acme"
                        className="flex-1 min-w-0 h-8 px-2 text-[12px] font-mono bg-transparent outline-none"
                        aria-invalid={!!handleError}
                      />
                      <button
                        onClick={() => copy(primaryUrl, "url")}
                        className="px-2 inline-flex items-center text-muted-foreground hover:text-foreground bg-muted/50 border-l border-input shrink-0"
                        title="Copy URL"
                        type="button"
                      >
                        {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {handleError ? (
                      <p className="text-[11px] text-destructive flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        {handleError}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">2–40 chars · lowercase letters, numbers, hyphens.</p>
                    )}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={saveHandle}
                        disabled={savingHandle || !!handleError || handleDraft === handle}
                      >
                        {savingHandle ? "Saving…" : "Save URL"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] flex items-center gap-1"><Code2 className="h-3 w-3" /> Embed widget</Label>
                    <div className="flex gap-1 p-0.5 rounded-md bg-muted/50 w-fit">
                      {(["upcoming", "past", "all"] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setEmbedFilter(f)}
                          className={`px-2.5 h-6 rounded text-[11px] font-medium capitalize ${
                            embedFilter === f ? "bg-card shadow-sm" : "text-muted-foreground"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <pre className="bg-muted/50 border border-border rounded-md p-2.5 text-[10px] font-mono overflow-x-auto whitespace-pre">
{embedSnippet}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copy(embedSnippet, "snippet")}
                        className="absolute top-1.5 right-1.5 h-6 px-1.5 rounded bg-card border border-border text-[10px] flex items-center gap-1"
                      >
                        {copied === "snippet" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied === "snippet" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </Section>

          <Section title="Theme" hint="Colors apply to the public profile and event pages.">
            <div>
              <Label className="text-[11px] text-muted-foreground">Presets</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {THEME_PRESETS.map(p => {
                  const active =
                    state.theme.accentColor.toLowerCase() === (p.theme.accentColor || "").toLowerCase()
                    && state.theme.backgroundColor.toLowerCase() === (p.theme.backgroundColor || "").toLowerCase();
                  return (
                    <button
                      key={p.name}
                      onClick={() => setTheme(p.theme)}
                      className={`rounded-md border p-2 text-left transition-colors ${active ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40"}`}
                      title={p.name}
                    >
                      <div
                        className="h-8 rounded mb-1.5 flex items-center justify-center"
                        style={{ background: p.theme.backgroundColor }}
                      >
                        <span className="h-3 w-3 rounded-full mr-1" style={{ background: p.theme.accentColor }} />
                        <span className="h-3 w-3 rounded-full" style={{ background: p.theme.textColor }} />
                      </div>
                      <p className="text-[10px] font-medium truncate">{p.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <ColorRow label="Accent"     value={state.theme.accentColor}     onChange={v => setTheme({ accentColor: v, primaryColor: v })} />
            <ColorRow label="Background" value={state.theme.backgroundColor} onChange={v => setTheme({ backgroundColor: v })} />
            <ColorRow label="Text"       value={state.theme.textColor}       onChange={v => setTheme({ textColor: v })} />

            <div>
              <Label className="text-[11px] text-muted-foreground">Font family</Label>
              <select
                value={state.theme.fontFamily}
                onChange={e => setTheme({ fontFamily: e.target.value })}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background text-[12px] px-2"
              >
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </Section>

          <div className="rounded-lg border border-border/60 p-3 bg-muted/40">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Live data</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Your upcoming and past events appear automatically below your profile — no setup needed.
            </p>
          </div>
        </aside>
        ) : (
        <main className="h-full overflow-y-auto bg-muted/30">
          <div className="w-full min-h-full">
            <ProfilePreview state={state} org={{ ...org, logo_url: logoUrl }} />
          </div>
        </main>
        )}
      </div>
    </div>
  );
}

/* ─── Preview ─── */

function ProfilePreview({
  state,
  org,
}: {
  state: ExtendedConfig;
  org: { name: string; logo_url?: string | null; slug: string };
}) {
  const { theme } = state;
  return (
    <div
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: theme.fontFamily + ", sans-serif",
      }}
    >
      <div
        className="w-full aspect-[4/1] overflow-hidden flex items-center justify-center"
        style={
          state.cover
            ? { backgroundColor: theme.backgroundColor }
            : { background: `linear-gradient(135deg, ${theme.accentColor}33, ${theme.accentColor}10)` }
        }
      >
        {state.cover && (
          <img
            src={state.cover}
            alt={`${org.name} cover`}
            className="h-full w-full object-contain"
          />
        )}
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="-mt-12 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 pb-6 border-b" style={{ borderColor: `${theme.textColor}12` }}>
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt={org.name}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-cover shrink-0"
              style={{
                background: theme.backgroundColor,
                boxShadow: `0 0 0 4px ${theme.backgroundColor}, 0 12px 28px -12px rgba(0,0,0,0.35)`,
              }}
            />
          ) : (
            <div
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shrink-0"
              style={{
                backgroundColor: theme.accentColor,
                boxShadow: `0 0 0 4px ${theme.backgroundColor}, 0 12px 28px -12px rgba(0,0,0,0.35)`,
              }}
            >
              {org.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] sm:text-4xl font-bold tracking-tight leading-tight truncate">{org.name}</h1>
          </div>
        </div>
        {(state.bio || state.accentLink?.url) && (
          <div className="mt-5 max-w-2xl">
            {state.bio && (
              <p className="text-[14px] leading-[1.65] opacity-80 whitespace-pre-line">{state.bio}</p>
            )}
        {state.accentLink?.url && (
          <a
            href={state.accentLink.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-3 text-[13px] font-medium underline underline-offset-4"
            style={{ color: theme.accentColor }}
          >
            {state.accentLink.label || state.accentLink.url}
          </a>
        )}
          </div>
        )}

        <div className="mt-8 pb-12">
          <p
            className="text-[11px] uppercase tracking-widest font-semibold mb-3"
            style={{ color: `${theme.textColor}80` }}
          >
            Upcoming events
          </p>
          <div
            className="rounded-xl border border-dashed p-6 text-center text-[12px]"
            style={{ borderColor: `${theme.textColor}20`, color: `${theme.textColor}80` }}
          >
            Live events from your workspace appear here on the public page.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Field primitives ─── */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Input value={value} onChange={e => onChange(e.target.value)} className="h-7 w-[88px] text-[10px] font-mono" />
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-7 w-7 rounded border border-border cursor-pointer" />
      </div>
    </div>
  );
}

function FieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="h-8 text-[12px]" />
    </div>
  );
}

function FieldTextarea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Textarea value={value} placeholder={placeholder} rows={rows} onChange={e => onChange(e.target.value)} className="text-[12px]" />
    </div>
  );
}

/**
 * Image picker with preview + upload to `site-assets`.
 * `aspect="square"` shows a 1:1 thumbnail; `aspect="banner"` shows a wide one.
 */
function ImageUploadField({
  label, hint, value, onChange, prefix, aspect, maxBytes = 4 * 1024 * 1024,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  prefix: string;
  aspect: "square" | "banner";
  maxBytes?: number;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error("Could not read file"));
      fr.readAsDataURL(file);
    });

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Please choose an image.", variant: "destructive" });
      return;
    }
    if (file.size > maxBytes) {
      toast({
        title: "File too large",
        description: `Maximum ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }
    
    try {
      const dataUrl = await fileToDataUrl(file);
      setCropSrc(dataUrl);
      setCropOpen(true);
    } catch (err) {
      toast({ title: "Read failed", description: "Could not read image file.", variant: "destructive" });
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setUploading(true);
    try {
      const url = await uploadOrgAsset(blob, prefix, "jpg");
      onChange(url);
      setCropOpen(false);
      setCropSrc(null);
      toast({ title: "Uploaded", description: "Remember to save your changes." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onCropClick = () => {
    if (value) {
      setCropSrc(value);
      setCropOpen(true);
    }
  };

  const previewClass =
    aspect === "square"
      ? "h-20 w-20 rounded-lg"
      : "h-20 w-full rounded-lg";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-[11px]">{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className={aspect === "square" ? "flex items-start gap-3" : "space-y-2"}>
        <div
          className={`${previewClass} relative overflow-hidden border border-border bg-muted/40 flex items-center justify-center shrink-0`}
          style={aspect === "banner" ? { aspectRatio: "4 / 1", height: "auto" } : undefined}
        >
          {value ? (
            <>
              <img src={value} alt={label} className="absolute inset-0 h-full w-full object-contain" />
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-background"
                title="Remove image"
                aria-label={`Remove ${label.toLowerCase()}`}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">No image</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <label className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-input bg-background hover:bg-muted cursor-pointer text-[12px] font-medium gap-1.5 w-full">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : value ? "Replace Image" : "Upload Image"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={e => { onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
            />
          </label>
          {value && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[12px] gap-1.5"
              onClick={onCropClick}
            >
              <Crop className="h-3.5 w-3.5" /> Crop
            </Button>
          )}
        </div>
      </div>
      <CoverCropDialog
        open={cropOpen}
        src={cropSrc}
        aspect={aspect === "square" ? 1 : 4}
        onCancel={() => { setCropOpen(false); setCropSrc(null); }}
        onConfirm={handleCropConfirm}
        busy={uploading}
      />
    </div>
  );
}
