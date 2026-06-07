import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Plus, Trash2, RotateCcw, Eye, ExternalLink, Layers, Send, GitCompareArrows, X,
  Upload, Loader2, CheckCircle2, FileEdit,
} from "lucide-react";
import {
  DEFAULT_SITE_CONTENT, SECTION_ORDER, SiteContentMap, SiteSection,
  FEATURE_ICON_OPTIONS,
} from "@/lib/site-content";
import { useSiteContent } from "@/hooks/useSiteContent";
import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

// ---------------- Reusable form atoms ----------------

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-[13px]"
    />
  );
}

function AreaField({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <Textarea
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="text-[13px] resize-none"
    />
  );
}

function ListCard({
  index, title, onRemove, children,
}: { index: number; title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2.5 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} #{index + 1}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {children}
    </div>
  );
}

// ---------------- Section editors ----------------

type SetSection<S extends SiteSection> = (updater: (prev: SiteContentMap[S]) => SiteContentMap[S]) => void;

/**
 * Upload a file to the public `site-assets` bucket and return its public URL.
 * Uses a unique filename to avoid CDN cache collisions when an asset is replaced.
 */
async function uploadSiteAsset(file: File, prefix: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("site-assets")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
  return data.publicUrl;
}

/** TextField + "Upload" button. Validates file size and type, then writes the resulting URL. */
function ImageUrlField({
  value, onChange, prefix, accept = "image/*", maxBytes = 2 * 1024 * 1024, placeholder,
}: {
  value: string;
  onChange: (url: string) => void;
  prefix: string;
  accept?: string;
  maxBytes?: number;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > maxBytes) {
      toast.error(`File too large (max ${(maxBytes / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadSiteAsset(file, prefix);
      onChange(url);
      toast.success("Uploaded — remember to save & publish");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-[13px] flex-1"
      />
      <label className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-muted cursor-pointer text-[12px] font-medium gap-1.5 shrink-0">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Upload"}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          disabled={uploading}
          onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
        />
      </label>
    </div>
  );
}

function IdentityEditor({ value, set }: { value: SiteContentMap["identity"]; set: SetSection<"identity"> }) {
  return (
    <div className="space-y-4">
      <Field label="Site title" hint="Shown in the browser tab and used as the default <title> for SEO and social cards.">
        <TextField value={value.siteTitle} onChange={(v) => set((p) => ({ ...p, siteTitle: v }))} placeholder="My Product — Tagline" />
      </Field>
      <Field label="Meta description" hint="Used by search engines and social previews. Aim for 150–160 characters.">
        <AreaField value={value.metaDescription} onChange={(v) => set((p) => ({ ...p, metaDescription: v }))} rows={3} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Author"><TextField value={value.author} onChange={(v) => set((p) => ({ ...p, author: v }))} /></Field>
        <Field label="Theme color" hint="Used by mobile browsers as the address bar tint.">
          <ColorField value={value.themeColor} onChange={(v) => set((p) => ({ ...p, themeColor: v }))} />
        </Field>
      </div>
      <Field label="Canonical site URL" hint="Optional. Absolute URL used for canonical + og:url tags.">
        <TextField value={value.siteUrl} onChange={(v) => set((p) => ({ ...p, siteUrl: v }))} placeholder="https://example.com" />
      </Field>
      <Field label="Social share image (Open Graph / Twitter)" hint="Absolute URL. Recommended size: 1200×630.">
        <ImageUrlField
          value={value.ogImageUrl}
          onChange={(v) => set((p) => ({ ...p, ogImageUrl: v }))}
          prefix="og"
          accept="image/png,image/jpeg,image/webp"
          maxBytes={3 * 1024 * 1024}
          placeholder="https://.../og-image.png"
        />
        {value.ogImageUrl && (
          <img
            src={value.ogImageUrl}
            alt="OG preview"
            className="mt-2 rounded-md border border-border max-h-32 object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </Field>
    </div>
  );
}

function LogoPaddingRow({
  label, value, onChange, min = 0, max = 32,
}: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const [draft, setDraft] = useState<string>(String(value));
  // Keep the visible text in sync when the value changes from outside (slider, +/-)
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const c = clamp(n);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => onChange(clamp(value - 1))}
            aria-label={`Decrease ${label.toLowerCase()}`}
          >
            <span className="text-sm leading-none">−</span>
          </Button>
          <Input
            type="number"
            min={min}
            max={max}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="h-6 w-14 text-[12px] text-center px-1"
          />
          <span className="text-[11px] text-muted-foreground">px</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => onChange(clamp(value + 1))}
            aria-label={`Increase ${label.toLowerCase()}`}
          >
            <span className="text-sm leading-none">+</span>
          </Button>
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([n]) => onChange(n)}
      />
    </div>
  );
}

function LogoSizeInput({ value, onChange, min = 16, max = 80 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isNaN(n)) { setDraft(String(value)); return; }
    const c = clamp(n);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
      }}
      className="h-6 w-14 text-[12px] text-center px-1"
    />
  );
}

function NavbarEditor({ value, set }: { value: SiteContentMap["navbar"]; set: SetSection<"navbar"> }) {
  return (
    <div className="space-y-4">
      <Field label="Brand name">
        <TextField value={value.brandName} onChange={(v) => set((p) => ({ ...p, brandName: v }))} />
      </Field>
      <Field label="Header logo (light mode)" hint="Optional. When set, replaces the text logo in the navbar on light backgrounds. Recommended height ≤ 64px (PNG/SVG).">
        <ImageUrlField
          value={value.logoUrl ?? ""}
          onChange={(v) => set((p) => ({ ...p, logoUrl: v }))}
          prefix="navbar-logo"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          maxBytes={1 * 1024 * 1024}
          placeholder="https://.../logo.svg"
        />
        {value.logoUrl && (
          <>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground rounded-md border border-border bg-muted/30 p-3">
              <img
                src={value.logoUrl}
                alt="Logo preview"
                style={{ height: `${value.logoHeight ?? 32}px` }}
                className="w-auto max-w-[220px] object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span className="ml-auto">Preview at {value.logoHeight ?? 32}px</span>
              <button
                type="button"
                className="text-[11px] text-destructive hover:underline"
                onClick={() => set((p) => ({ ...p, logoUrl: "" }))}
              >
                Remove
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[12px] font-medium">Logo size</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => set((p) => ({ ...p, logoHeight: Math.max(16, (p.logoHeight ?? 32) - 2) }))}
                    aria-label="Decrease logo size"
                  >
                    <span className="text-sm leading-none">−</span>
                  </Button>
                  <LogoSizeInput
                    value={value.logoHeight ?? 32}
                    onChange={(n) => set((p) => ({ ...p, logoHeight: n }))}
                  />
                  <span className="text-[11px] text-muted-foreground">px</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => set((p) => ({ ...p, logoHeight: Math.min(80, (p.logoHeight ?? 32) + 2) }))}
                    aria-label="Increase logo size"
                  >
                    <span className="text-sm leading-none">+</span>
                  </Button>
                </div>
              </div>
              <Slider
                min={16}
                max={80}
                step={1}
                value={[value.logoHeight ?? 32]}
                onValueChange={([n]) => set((p) => ({ ...p, logoHeight: n }))}
              />
              <p className="text-[11px] text-muted-foreground">
                The header automatically pads taller logos so nothing clips.
              </p>

              <div className="pt-3 mt-3 border-t border-border space-y-3">
                <Label className="text-[12px] font-medium">Logo spacing</Label>
                <LogoPaddingRow
                  label="Padding top"
                  value={value.logoPaddingTop ?? 0}
                  onChange={(n) => set((p) => ({ ...p, logoPaddingTop: n }))}
                />
                <LogoPaddingRow
                  label="Padding bottom"
                  value={value.logoPaddingBottom ?? 0}
                  onChange={(n) => set((p) => ({ ...p, logoPaddingBottom: n }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Fine-tune vertical spacing without resizing the logo. 0–32 px each side.
                </p>
              </div>
            </div>
          </>
        )}
      </Field>
      <Field label="Header logo (dark mode)" hint="Optional. Used when the dark theme is active. Falls back to the light-mode logo when empty — upload a light-on-dark variant for best contrast.">
        <ImageUrlField
          value={value.logoUrlDark ?? ""}
          onChange={(v) => set((p) => ({ ...p, logoUrlDark: v }))}
          prefix="navbar-logo-dark"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          maxBytes={1 * 1024 * 1024}
          placeholder="https://.../logo-dark.svg"
        />
        {value.logoUrlDark && (
          <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground rounded-md border border-border bg-neutral-900 p-3">
            <img
              src={value.logoUrlDark}
              alt="Dark mode logo preview"
              style={{ height: `${value.logoHeight ?? 32}px` }}
              className="w-auto max-w-[220px] object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            <span className="ml-auto text-neutral-300">Dark preview</span>
            <button
              type="button"
              className="text-[11px] text-destructive hover:underline"
              onClick={() => set((p) => ({ ...p, logoUrlDark: "" }))}
            >
              Remove
            </button>
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sign in label">
          <TextField value={value.signInLabel} onChange={(v) => set((p) => ({ ...p, signInLabel: v }))} />
        </Field>
        <Field label="CTA label">
          <TextField value={value.ctaLabel} onChange={(v) => set((p) => ({ ...p, ctaLabel: v }))} />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Nav links</Label>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => set((p) => ({ ...p, links: [...p.links, { label: "New link", href: "#" }] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {value.links.map((link, i) => (
          <ListCard key={i} index={i} title="Link" onRemove={() => set((p) => ({ ...p, links: p.links.filter((_, idx) => idx !== i) }))}>
            <div className="grid grid-cols-2 gap-2">
              <TextField value={link.label} onChange={(v) => set((p) => ({ ...p, links: p.links.map((l, idx) => idx === i ? { ...l, label: v } : l) }))} placeholder="Label" />
              <TextField value={link.href} onChange={(v) => set((p) => ({ ...p, links: p.links.map((l, idx) => idx === i ? { ...l, href: v } : l) }))} placeholder="#section or /path" />
            </div>
          </ListCard>
        ))}
      </div>
    </div>
  );
}

function HeroEditor({ value, set }: { value: SiteContentMap["hero"]; set: SetSection<"hero"> }) {
  const theme = value.theme ?? {
    mode: "preset" as const,
    background: "#0b0b1a",
    gradientFrom: "#1a1a3a",
    gradientTo: "#0b0b1a",
    textColor: "#ffffff",
    accentColor: "#f97316",
  };
  const setTheme = (patch: Partial<typeof theme>) =>
    set((p) => ({ ...p, theme: { ...theme, ...patch } }));

  return (
    <div className="space-y-4">
      <Field label="Badge"><TextField value={value.badge} onChange={(v) => set((p) => ({ ...p, badge: v }))} /></Field>
      <Field label="Title"><AreaField value={value.title} onChange={(v) => set((p) => ({ ...p, title: v }))} rows={2} /></Field>
      <Field label="Subtitle"><AreaField value={value.subtitle} onChange={(v) => set((p) => ({ ...p, subtitle: v }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary CTA label"><TextField value={value.primaryCtaLabel} onChange={(v) => set((p) => ({ ...p, primaryCtaLabel: v }))} /></Field>
        <Field label="Primary CTA link"><TextField value={value.primaryCtaHref} onChange={(v) => set((p) => ({ ...p, primaryCtaHref: v }))} /></Field>
        <Field label="Secondary CTA label"><TextField value={value.secondaryCtaLabel} onChange={(v) => set((p) => ({ ...p, secondaryCtaLabel: v }))} /></Field>
        <Field label="Secondary CTA link"><TextField value={value.secondaryCtaHref} onChange={(v) => set((p) => ({ ...p, secondaryCtaHref: v }))} /></Field>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </Label>
        </div>
        <Field label="Background style" hint="Preset uses the cosmic Illuxus gradient. Solid and Gradient use your colors below.">
          <Select value={theme.mode} onValueChange={(v) => setTheme({ mode: v as typeof theme.mode })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="preset" className="text-[12px]">Preset (Illuxus cosmic)</SelectItem>
              <SelectItem value="solid" className="text-[12px]">Solid color</SelectItem>
              <SelectItem value="gradient" className="text-[12px]">Gradient</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {theme.mode === "solid" && (
          <Field label="Background color">
            <ColorField value={theme.background} onChange={(v) => setTheme({ background: v })} />
          </Field>
        )}

        {theme.mode === "gradient" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gradient from">
              <ColorField value={theme.gradientFrom} onChange={(v) => setTheme({ gradientFrom: v })} />
            </Field>
            <Field label="Gradient to">
              <ColorField value={theme.gradientTo} onChange={(v) => setTheme({ gradientTo: v })} />
            </Field>
          </div>
        )}

        {theme.mode !== "preset" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Text color">
              <ColorField value={theme.textColor} onChange={(v) => setTheme({ textColor: v })} />
            </Field>
            <Field label="Accent color" hint="Highlights the first word of the headline.">
              <ColorField value={theme.accentColor} onChange={(v) => setTheme({ accentColor: v })} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

/** Color input combining a native picker with a free-form text field. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Native <input type="color"> only accepts hex. Pass through if hex, else fallback.
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 rounded-md border border-input bg-background cursor-pointer p-1"
        aria-label="Pick color"
      />
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#0b0b1a or hsl(...)"
        className="h-9 text-[13px] font-mono"
      />
    </div>
  );
}

function FeaturesEditor({ value, set }: { value: SiteContentMap["features"]; set: SetSection<"features"> }) {
  return (
    <div className="space-y-4">
      <Field label="Eyebrow"><TextField value={value.eyebrow} onChange={(v) => set((p) => ({ ...p, eyebrow: v }))} /></Field>
      <Field label="Title"><TextField value={value.title} onChange={(v) => set((p) => ({ ...p, title: v }))} /></Field>
      <Field label="Subtitle"><AreaField value={value.subtitle} onChange={(v) => set((p) => ({ ...p, subtitle: v }))} /></Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Features</Label>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => set((p) => ({ ...p, items: [...p.items, { title: "New feature", description: "", icon: "Sparkles" }] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {value.items.map((item, i) => (
          <ListCard key={i} index={i} title="Feature" onRemove={() => set((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }))}>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <TextField value={item.title} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, title: v } : it) }))} placeholder="Title" />
              <Select value={item.icon} onValueChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, icon: v } : it) }))}>
                <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEATURE_ICON_OPTIONS.map((icon) => (
                    <SelectItem key={icon} value={icon} className="text-[12px]">{icon}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AreaField value={item.description} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, description: v } : it) }))} placeholder="Description" rows={2} />
          </ListCard>
        ))}
      </div>
    </div>
  );
}

function PricingEditor({ value, set }: { value: SiteContentMap["pricing"]; set: SetSection<"pricing"> }) {
  return (
    <div className="space-y-4">
      <Field label="Eyebrow"><TextField value={value.eyebrow} onChange={(v) => set((p) => ({ ...p, eyebrow: v }))} /></Field>
      <Field label="Title"><TextField value={value.title} onChange={(v) => set((p) => ({ ...p, title: v }))} /></Field>
      <Field label="Subtitle"><AreaField value={value.subtitle} onChange={(v) => set((p) => ({ ...p, subtitle: v }))} /></Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Plans</Label>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => set((p) => ({
            ...p,
            plans: [...p.plans, { name: "New plan", price: "$0", period: "", description: "", highlight: false, ctaLabel: "Choose", ctaHref: "/login", features: [] }],
          }))}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {value.plans.map((plan, i) => (
          <ListCard key={i} index={i} title="Plan" onRemove={() => set((p) => ({ ...p, plans: p.plans.filter((_, idx) => idx !== i) }))}>
            <div className="grid grid-cols-2 gap-2">
              <TextField value={plan.name} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, name: v } : pl) }))} placeholder="Name" />
              <TextField value={plan.description} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, description: v } : pl) }))} placeholder="Description" />
              <TextField value={plan.price} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, price: v } : pl) }))} placeholder="Price ($29)" />
              <TextField value={plan.period} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, period: v } : pl) }))} placeholder="Period (/mo)" />
              <TextField value={plan.ctaLabel} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, ctaLabel: v } : pl) }))} placeholder="CTA label" />
              <TextField value={plan.ctaHref} onChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, ctaHref: v } : pl) }))} placeholder="CTA link" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-[11px] text-muted-foreground">Highlight as popular</Label>
              <Switch checked={plan.highlight} onCheckedChange={(v) => set((p) => ({ ...p, plans: p.plans.map((pl, idx) => idx === i ? { ...pl, highlight: v } : pl) }))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Features</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => set((p) => ({
                  ...p,
                  plans: p.plans.map((pl, idx) => idx === i ? { ...pl, features: [...pl.features, ""] } : pl),
                }))}>
                  <Plus className="h-3 w-3 mr-1" /> Add feature
                </Button>
              </div>
              {plan.features.map((feat, fi) => (
                <div key={fi} className="flex gap-1.5">
                  <TextField value={feat} onChange={(v) => set((p) => ({
                    ...p,
                    plans: p.plans.map((pl, idx) => idx === i ? { ...pl, features: pl.features.map((f, fIdx) => fIdx === fi ? v : f) } : pl),
                  }))} placeholder="Feature" />
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive shrink-0" onClick={() => set((p) => ({
                    ...p,
                    plans: p.plans.map((pl, idx) => idx === i ? { ...pl, features: pl.features.filter((_, fIdx) => fIdx !== fi) } : pl),
                  }))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ListCard>
        ))}
      </div>
    </div>
  );
}

function TestimonialsEditor({ value, set }: { value: SiteContentMap["testimonials"]; set: SetSection<"testimonials"> }) {
  return (
    <div className="space-y-4">
      <Field label="Eyebrow"><TextField value={value.eyebrow} onChange={(v) => set((p) => ({ ...p, eyebrow: v }))} /></Field>
      <Field label="Title"><TextField value={value.title} onChange={(v) => set((p) => ({ ...p, title: v }))} /></Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Testimonials</Label>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => set((p) => ({ ...p, items: [...p.items, { quote: "", author: "", role: "", avatarUrl: "" }] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {value.items.map((item, i) => (
          <ListCard key={i} index={i} title="Testimonial" onRemove={() => set((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }))}>
            <AreaField value={item.quote} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, quote: v } : it) }))} placeholder="Quote" />
            <div className="grid grid-cols-2 gap-2">
              <TextField value={item.author} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, author: v } : it) }))} placeholder="Author" />
              <TextField value={item.role} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, role: v } : it) }))} placeholder="Role / company" />
            </div>
            <TextField value={item.avatarUrl} onChange={(v) => set((p) => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, avatarUrl: v } : it) }))} placeholder="Avatar URL (optional)" />
          </ListCard>
        ))}
      </div>
    </div>
  );
}

function CTAEditor({ value, set }: { value: SiteContentMap["cta"]; set: SetSection<"cta"> }) {
  return (
    <div className="space-y-4">
      <Field label="Title"><TextField value={value.title} onChange={(v) => set((p) => ({ ...p, title: v }))} /></Field>
      <Field label="Subtitle"><AreaField value={value.subtitle} onChange={(v) => set((p) => ({ ...p, subtitle: v }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary CTA label"><TextField value={value.primaryCtaLabel} onChange={(v) => set((p) => ({ ...p, primaryCtaLabel: v }))} /></Field>
        <Field label="Primary CTA link"><TextField value={value.primaryCtaHref} onChange={(v) => set((p) => ({ ...p, primaryCtaHref: v }))} /></Field>
        <Field label="Secondary CTA label"><TextField value={value.secondaryCtaLabel} onChange={(v) => set((p) => ({ ...p, secondaryCtaLabel: v }))} /></Field>
        <Field label="Secondary CTA link"><TextField value={value.secondaryCtaHref} onChange={(v) => set((p) => ({ ...p, secondaryCtaHref: v }))} /></Field>
      </div>
    </div>
  );
}

function FooterEditor({ value, set }: { value: SiteContentMap["footer"]; set: SetSection<"footer"> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand name"><TextField value={value.brandName} onChange={(v) => set((p) => ({ ...p, brandName: v }))} /></Field>
        <Field label="Tagline"><TextField value={value.tagline} onChange={(v) => set((p) => ({ ...p, tagline: v }))} /></Field>
      </div>
      <Field label="Copyright"><TextField value={value.copyright} onChange={(v) => set((p) => ({ ...p, copyright: v }))} /></Field>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium">Footer columns</Label>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => set((p) => ({ ...p, columns: [...p.columns, { title: "New column", links: [] }] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add column
          </Button>
        </div>
        {value.columns.map((col, ci) => (
          <ListCard key={ci} index={ci} title="Column" onRemove={() => set((p) => ({ ...p, columns: p.columns.filter((_, idx) => idx !== ci) }))}>
            <TextField value={col.title} onChange={(v) => set((p) => ({ ...p, columns: p.columns.map((c, idx) => idx === ci ? { ...c, title: v } : c) }))} placeholder="Column title" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Links</Label>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => set((p) => ({
                  ...p,
                  columns: p.columns.map((c, idx) => idx === ci ? { ...c, links: [...c.links, { label: "", href: "#" }] } : c),
                }))}>
                  <Plus className="h-3 w-3 mr-1" /> Add link
                </Button>
              </div>
              {col.links.map((link, li) => (
                <div key={li} className="flex gap-1.5">
                  <TextField value={link.label} onChange={(v) => set((p) => ({
                    ...p,
                    columns: p.columns.map((c, idx) => idx === ci ? { ...c, links: c.links.map((l, lIdx) => lIdx === li ? { ...l, label: v } : l) } : c),
                  }))} placeholder="Label" />
                  <TextField value={link.href} onChange={(v) => set((p) => ({
                    ...p,
                    columns: p.columns.map((c, idx) => idx === ci ? { ...c, links: c.links.map((l, lIdx) => lIdx === li ? { ...l, href: v } : l) } : c),
                  }))} placeholder="URL" />
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive shrink-0" onClick={() => set((p) => ({
                    ...p,
                    columns: p.columns.map((c, idx) => idx === ci ? { ...c, links: c.links.filter((_, lIdx) => lIdx !== li) } : c),
                  }))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ListCard>
        ))}
      </div>
    </div>
  );
}

// ---------------- Live preview ----------------

// Render only the active section in the preview. We rely on SiteContentProvider
// to feed the components — since the editor temporarily mutates context-level
// content via local state, we instead render with a local override provider.
function PreviewPane({ active }: { active: SiteSection }) {
  // The real landing components read from useSiteContent(). To preview the
  // *unsaved* draft, we shadow the provider by mounting a sub-provider.
  return (
    <div className="origin-top-left scale-[0.65] w-[154%] -mt-2 pointer-events-none select-none">
      <div className="bg-background min-h-[600px]">
        {active === "identity" && (
          <div className="p-8 text-[13px] text-muted-foreground">
            <p className="font-semibold text-foreground mb-2">Site identity</p>
            <p>
              Site identity controls the browser tab title, favicon, meta description,
              and social share image. These do not render on the page itself — open the
              homepage in a new tab and inspect the tab/share preview after publishing.
            </p>
          </div>
        )}
        {active === "navbar" && (
          <div className="relative">
            <SiteHeader />
          </div>
        )}
        {active === "hero" && <HeroSection />}
        {active === "features" && <FeaturesSection />}
        {active === "pricing" && <PricingSection />}
        {active === "testimonials" && <TestimonialsSection />}
        {active === "cta" && <CTASection />}
        {active === "footer" && <Footer />}
      </div>
    </div>
  );
}

// ---------------- Page ----------------

const SECTION_LABELS: Record<SiteSection, string> = {
  identity: "Site identity",
  navbar: "Navigation",
  hero: "Hero",
  features: "Features",
  pricing: "Pricing",
  testimonials: "Testimonials",
  cta: "Call to action",
  footer: "Footer",
};

export default function SiteEditorPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { content: liveContent, refresh } = useSiteContent();

  // Live = currently published. Draft = unpublished staging version (server-side per section).
  const [draft, setDraft] = useState<SiteContentMap>(liveContent);
  const [draftSections, setDraftSections] = useState<Set<SiteSection>>(new Set());
  const [active, setActive] = useState<SiteSection>("hero");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [dirty, setDirty] = useState<Set<SiteSection>>(new Set());
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null);

  // Load drafts from DB; fall back to live for sections without a draft.
  const loadDrafts = async () => {
    const { data } = await supabase
      .from("site_content")
      .select("section, content, draft_content");
    const next: SiteContentMap = { ...liveContent };
    const draftSet = new Set<SiteSection>();
    if (data) {
      for (const row of data) {
        const section = row.section as SiteSection;
        if (!(section in next)) continue;
        if (row.draft_content) {
          (next as any)[section] = {
            ...(DEFAULT_SITE_CONTENT as any)[section],
            ...(row.draft_content as any),
          };
          draftSet.add(section);
        }
      }
    }
    setDraft(next);
    setDraftSections(draftSet);
    setDirty(new Set());
  };

  // Initial hydrate from liveContent only on first render. After that, drafts
  // are the source of truth; refreshing liveContent (e.g. after publish) must
  // not clobber unsaved edits to other sections.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current) {
      setDraft(liveContent);
      hydratedRef.current = true;
    }
  }, [liveContent]);

  useEffect(() => {
    if (isAdmin) loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const updateSection = <S extends SiteSection>(section: S, updater: (prev: SiteContentMap[S]) => SiteContentMap[S]) => {
    setDraft((prev) => ({ ...prev, [section]: updater(prev[section]) }));
    setDirty((prev) => new Set(prev).add(section));
  };

  // Auto-save: debounce 1.5s after last edit. Only clears the sections that
  // were actually persisted, so concurrent edits during the save aren't lost.
  // On error, surfaces a single toast so failures aren't silent.
  const autoSaveErrorShownRef = useRef(false);
  useEffect(() => {
    if (dirty.size === 0) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const snapshot = Array.from(dirty);
      setAutoSaving(true);
      const saved: SiteSection[] = [];
      for (const s of snapshot) {
        const { error } = await supabase.rpc("save_site_draft", {
          _section: s,
          _content: draft[s] as any,
        });
        if (cancelled) return;
        if (error) {
          if (!autoSaveErrorShownRef.current) {
            autoSaveErrorShownRef.current = true;
            toast.error(`Auto-save failed: ${error.message}. Use Save draft to retry.`);
          }
          break;
        }
        saved.push(s);
      }
      setAutoSaving(false);
      if (saved.length > 0) {
        autoSaveErrorShownRef.current = false;
        setDraftSections((prev) => {
          const next = new Set(prev);
          saved.forEach((s) => next.add(s));
          return next;
        });
        setDirty((prev) => {
          const next = new Set(prev);
          saved.forEach((s) => next.delete(s));
          return next;
        });
        setLastAutoSavedAt(new Date());
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [draft, dirty]);

  const handleSave = async () => {
    setSaving(true);
    const sections = Array.from(dirty);
    if (sections.length === 0) sections.push(active);

    for (const s of sections) {
      const { error } = await supabase.rpc("save_site_draft", {
        _section: s,
        _content: draft[s] as any,
      });
      if (error) {
        setSaving(false);
        toast.error(error.message || `Failed to save ${s}`);
        return;
      }
    }
    setSaving(false);
    toast.success("Draft saved");
    setDraftSections((prev) => {
      const next = new Set(prev);
      sections.forEach((s) => next.add(s));
      return next;
    });
    setDirty(new Set());
  };

  const handlePublishActive = async () => {
    setPublishing(true);
    const { error } = await supabase.rpc("publish_site_section", { _section: active });
    setPublishing(false);
    if (error) {
      toast.error(error.message || "Failed to publish");
      return;
    }
    toast.success(`Published "${SECTION_LABELS[active]}" to the live site`);
    setDraftSections((prev) => {
      const next = new Set(prev);
      next.delete(active);
      return next;
    });
    setCompareOpen(false);
    refresh();
  };

  const handlePublishAll = async () => {
    setPublishing(true);
    for (const s of Array.from(draftSections)) {
      const { error } = await supabase.rpc("publish_site_section", { _section: s });
      if (error) {
        toast.error(`Failed to publish ${s}: ${error.message}`);
        setPublishing(false);
        return;
      }
    }
    setPublishing(false);
    toast.success("All drafts published");
    setDraftSections(new Set());
    refresh();
  };

  const handleDiscardActive = async () => {
    setDiscarding(true);
    const { error } = await supabase.rpc("discard_site_draft", { _section: active });
    setDiscarding(false);
    if (error) {
      toast.error(error.message || "Failed to discard");
      return;
    }
    toast.success("Draft discarded");
    setDraft((prev) => ({ ...prev, [active]: liveContent[active] }));
    setDraftSections((prev) => {
      const next = new Set(prev);
      next.delete(active);
      return next;
    });
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(active);
      return next;
    });
  };

  const handleResetSection = () => {
    setDraft((prev) => ({ ...prev, [active]: DEFAULT_SITE_CONTENT[active] }));
    setDirty((prev) => new Set(prev).add(active));
  };

  // Local preview override: temporarily replace context value so preview
  // reflects the unsaved draft.
  const PreviewContext = useMemo(() => {
    // Re-import the provider's context module would be heavy; instead we render
    // the section components directly with a small wrapper that injects draft
    // via a portal-like approach. Simpler: we mount a SiteContentProvider that
    // ignores the DB (not possible without rewriting). So we use a CSS-scaled
    // preview using *live* content for now and a "live preview" button.
    return null;
  }, [draft]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const totalDirty = dirty.size;
  const totalDrafts = draftSections.size;
  const activeHasDraft = draftSections.has(active);
  const activeIsDirty = dirty.has(active);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-8 -ml-2">
              <Link to="/dashboard/admin">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to admin
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-foreground/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">Landing page editor</h1>
                <p className="text-[11px] text-muted-foreground">
                  Customize every section of the public homepage
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 text-[12px]">
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open homepage
              </a>
            </Button>
            {activeHasDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareOpen(true)}
                className="h-8 text-[12px]"
              >
                <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" /> Compare
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-[12px]"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : totalDirty > 0 ? `Save draft (${totalDirty})` : "Save draft"}
            </Button>
            <Button
              size="sm"
              onClick={() => setPublishConfirmOpen(true)}
              disabled={publishing || totalDrafts === 0}
              className="h-8 text-[12px]"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {publishing ? "Publishing…" : totalDrafts > 0 ? `Publish all (${totalDrafts})` : "Publish"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap text-[12px]">
          <div className="flex items-center gap-3">
            {totalDrafts > 0 ? (
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-foreground/80">
                  <strong className="font-semibold">{totalDrafts}</strong> section{totalDrafts === 1 ? "" : "s"} with unpublished drafts
                </span>
              </div>
            ) : (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-foreground/80">All sections are published</span>
              </div>
            )}
          </div>
          {/* Fixed-height status row to prevent layout shift as state changes */}
          <div className="text-muted-foreground flex items-center gap-1.5 h-5 min-w-[220px] justify-end">
            {autoSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Auto-saving draft…</span>
              </>
            ) : dirty.size > 0 ? (
              <span className="opacity-70">Pending auto-save…</span>
            ) : lastAutoSavedAt ? (
              <span className="opacity-70">Draft auto-saved at {lastAutoSavedAt.toLocaleTimeString()}</span>
            ) : (
              <span className="opacity-0">placeholder</span>
            )}
          </div>
        </div>

        {/* 3-column layout: section nav | editor | preview */}
        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr] gap-4">
          {/* Section nav */}
          <div className="border border-border rounded-xl bg-card p-2 h-fit">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">Sections</div>
            <div className="space-y-0.5">
              {SECTION_ORDER.map((s) => {
                const hasDraft = draftSections.has(s);
                const isDirty = dirty.has(s);
                const isActive = active === s;
                const status: "draft" | "published" = hasDraft || isDirty ? "draft" : "published";
                return (
                  <button
                    key={s}
                    onClick={() => setActive(s)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title={status === "draft" ? "Has unpublished changes" : "Published"}
                  >
                    <span className="truncate">{SECTION_LABELS[s]}</span>
                    {status === "draft" ? (
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-amber-500/10 text-amber-600"
                      }`}>
                        <span className="h-1 w-1 rounded-full bg-current" /> Draft
                      </span>
                    ) : (
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}>
                        <span className="h-1 w-1 rounded-full bg-current" /> Live
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor */}
          <div className="border border-border rounded-xl bg-card p-4 space-y-4 min-h-[500px]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{SECTION_LABELS[active]}</h2>
                {activeHasDraft || activeIsDirty ? (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[10px] uppercase font-semibold tracking-wider gap-1">
                    <FileEdit className="h-2.5 w-2.5" /> Draft
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px] uppercase font-semibold tracking-wider gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Published
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {activeHasDraft && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-muted-foreground"
                      disabled={discarding}
                      onClick={handleDiscardActive}
                    >
                      <X className="h-3 w-3 mr-1" /> Discard draft
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={publishing}
                      onClick={handlePublishActive}
                    >
                      <Send className="h-3 w-3 mr-1" /> Publish this section
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground" onClick={handleResetSection}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </div>
            </div>

            {active === "navbar" && <NavbarEditor value={draft.navbar} set={(u) => updateSection("navbar", u)} />}
            {active === "identity" && <IdentityEditor value={draft.identity} set={(u) => updateSection("identity", u)} />}
            {active === "hero" && <HeroEditor value={draft.hero} set={(u) => updateSection("hero", u)} />}
            {active === "features" && <FeaturesEditor value={draft.features} set={(u) => updateSection("features", u)} />}
            {active === "pricing" && <PricingEditor value={draft.pricing} set={(u) => updateSection("pricing", u)} />}
            {active === "testimonials" && <TestimonialsEditor value={draft.testimonials} set={(u) => updateSection("testimonials", u)} />}
            {active === "cta" && <CTAEditor value={draft.cta} set={(u) => updateSection("cta", u)} />}
            {active === "footer" && <FooterEditor value={draft.footer} set={(u) => updateSection("footer", u)} />}
          </div>

          {/* Live preview (saved version) */}
          <div className="border border-border rounded-xl bg-card overflow-hidden h-fit lg:sticky lg:top-16">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12px] font-medium">Live preview (published)</span>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{SECTION_LABELS[active]}</span>
            </div>
            <div className="overflow-hidden h-[560px]">
              <PreviewPane active={active} />
            </div>
            {(totalDirty > 0 || activeHasDraft) && (
              <div className="border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                {activeHasDraft
                  ? "This preview shows the published version. Use Compare to review the draft."
                  : "Unsaved changes. Save draft, then publish to update this preview."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Compare draft vs published — {SECTION_LABELS[active]}</DialogTitle>
            <DialogDescription>
              Review every field side by side before publishing to the live site.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-auto">
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                Published (live)
              </div>
              <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap break-words">
                {JSON.stringify(liveContent[active], null, 2)}
              </pre>
            </div>
            <div className="border border-amber-500/30 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-amber-500/10 text-[11px] font-semibold uppercase tracking-wider text-amber-700 border-b border-amber-500/30">
                Draft (preview)
              </div>
              <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap break-words">
                {JSON.stringify(draft[active], null, 2)}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOpen(false)}>Close</Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={async () => { await handleDiscardActive(); setCompareOpen(false); }}
              disabled={discarding}
            >
              <X className="h-3.5 w-3.5 mr-1.5" /> Discard draft
            </Button>
            <Button onClick={handlePublishActive} disabled={publishing}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {publishing ? "Publishing…" : "Publish to live"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {totalDrafts} section{totalDrafts === 1 ? "" : "s"} to the live site?</AlertDialogTitle>
            <AlertDialogDescription>
              The following section{totalDrafts === 1 ? "" : "s"} will go live immediately and replace the currently published version:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="border border-border rounded-md divide-y divide-border bg-muted/30 max-h-60 overflow-auto">
            {Array.from(draftSections).map((s) => (
              <li key={s} className="px-3 py-2 flex items-center gap-2 text-[13px]">
                <FileEdit className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="font-medium">{SECTION_LABELS[s]}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Draft → Live</span>
              </li>
            ))}
            {draftSections.size === 0 && (
              <li className="px-3 py-2 text-[12px] text-muted-foreground">No drafts to publish.</li>
            )}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing || totalDrafts === 0}
              onClick={async (e) => {
                e.preventDefault();
                await handlePublishAll();
                setPublishConfirmOpen(false);
              }}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {publishing ? "Publishing…" : `Publish ${totalDrafts} section${totalDrafts === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}