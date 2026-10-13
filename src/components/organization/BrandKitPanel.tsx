/**
 * BrandKitPanel — the workspace's brand kit: logo files (CMYK, white, black,
 * icon), colours, fonts, the brand guidelines and any other brand files.
 *
 * Files upload as soon as they are picked, but nothing is part of the kit
 * until Save is pressed. Owners and admins can edit; everyone else in the
 * workspace sees the kit and can download from it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  brandAssetPaths, deleteBrandAssetFiles, emptyBrandKit, formatBytes, isHex, isPreviewable, loadBrandKit,
  MAX_BRAND_COLORS, MAX_BRAND_RESOURCES, saveBrandKit, uploadBrandAsset,
  type BrandAsset, type BrandKit, type LogoSlot,
} from "@/lib/brand-kit";

const LOGOS: { slot: LogoSlot; title: string; hint: string; stage: string }[] = [
  { slot: "cmyk", title: "CMYK logo", hint: "For print. PDF, AI, EPS or TIFF.", stage: "bg-white" },
  { slot: "white", title: "White logo", hint: "For dark backgrounds. SVG or PNG.", stage: "bg-neutral-900" },
  { slot: "black", title: "Black logo", hint: "For light backgrounds. SVG or PNG.", stage: "bg-white" },
  { slot: "icon", title: "Icon / mark", hint: "Square symbol or favicon.", stage: "bg-neutral-100" },
];
const LOGO_ACCEPT = ".svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps,.tif,.tiff,.psd";
const CARD = "bg-card border border-border rounded-lg p-4 sm:p-5";

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.slice(0, 5).toUpperCase() : "FILE");

function FileRow({ asset, onRemove }: { asset: BrandAsset; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-semibold text-muted-foreground">
        {extensionOf(asset.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{asset.name}</p>
        <p className="text-[11px] text-muted-foreground">{formatBytes(asset.size)}</p>
      </div>
      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Download" aria-label={`Download ${asset.name}`}>
        <a href={asset.url} download={asset.name} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
      </Button>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" title="Remove" aria-label={`Remove ${asset.name}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function BrandKitPanel({ orgId, userId, canEdit }: { orgId: string; userId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [kit, setKit] = useState<BrandKit>(emptyBrandKit);
  const [saved, setSaved] = useState<{ id: string | null; kit: BrandKit; snapshot: unknown } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Where the next picked file goes. */
  const target = useRef<{ slot: LogoSlot | "guidelines" | "resource"; accept: string }>({ slot: "resource", accept: "" });

  useEffect(() => {
    let alive = true;
    setSaved(null);
    setLoadError(null);
    loadBrandKit(orgId)
      .then((loaded) => { if (alive) { setSaved(loaded); setKit(loaded.kit); } })
      .catch((err: unknown) => { if (alive) setLoadError(err instanceof Error ? err.message : "Could not load the brand kit"); });
    return () => { alive = false; };
  }, [orgId]);

  const dirty = useMemo(() => !!saved && JSON.stringify(kit) !== JSON.stringify(saved.kit), [kit, saved]);

  // Leaving with unsaved changes loses them — let the browser ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pick = (slot: LogoSlot | "guidelines" | "resource", accept: string) => {
    target.current = { slot, accept };
    if (fileInput.current) {
      fileInput.current.accept = accept;
      fileInput.current.multiple = slot === "resource";
      fileInput.current.click();
    }
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const { slot } = target.current;
    setUploading(slot);
    try {
      if (slot === "resource") {
        const room = MAX_BRAND_RESOURCES - kit.resources.length;
        if (files.length > room) toast({ title: `Only ${Math.max(room, 0)} more file${room === 1 ? "" : "s"} can be added`, variant: "destructive" });
        const added: BrandAsset[] = [];
        for (const file of files.slice(0, Math.max(room, 0))) added.push(await uploadBrandAsset(orgId, "file", file));
        if (added.length) setKit((k) => ({ ...k, resources: [...k.resources, ...added] }));
      } else {
        const asset = await uploadBrandAsset(orgId, slot, files[0]);
        setKit((k) => (slot === "guidelines" ? { ...k, guidelines: asset } : { ...k, logos: { ...k.logos, [slot]: asset } }));
      }
    } catch (err) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!saved || saving) return;
    const badColor = kit.colors.find((c) => !isHex(c.hex));
    if (badColor) {
      toast({ title: "Check the colours", description: `"${badColor.hex}" isn't a hex colour like #1A2B3C.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await saveBrandKit({ orgId, userId, id: saved.id, kit, previousSnapshot: saved.snapshot });
      // Files that were replaced or removed are no longer referenced anywhere.
      const kept = new Set(brandAssetPaths(kit));
      void deleteBrandAssetFiles(brandAssetPaths(saved.kit).filter((p) => !kept.has(p)));
      setSaved({ id: result.id, kit, snapshot: result.snapshot });
      toast({ title: "Brand kit saved" });
    } catch (err) {
      toast({ title: "Could not save the brand kit", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setColor = (index: number, patch: Partial<{ name: string; hex: string }>) =>
    setKit((k) => ({ ...k, colors: k.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));

  if (loadError) {
    return <div className={`${CARD} text-[13px] text-destructive`}>Could not load the brand kit: {loadError}</div>;
  }
  if (!saved) {
    return <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the brand kit…</div>;
  }

  const busy = uploading !== null || saving;

  return (
    <div className="space-y-4 pb-20">
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => void handleFiles(e)} />

      {/* Logos */}
      <section className={CARD}>
        <h2 className="text-sm font-semibold">Logos</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">One file for each use, so the right logo is always to hand.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          {LOGOS.map(({ slot, title, hint, stage }) => {
            const asset = kit.logos[slot];
            return (
              <div key={slot} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border">
                <div className={`flex h-32 items-center justify-center p-4 ${stage}`}>
                  {uploading === slot ? (
                    <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                  ) : asset && isPreviewable(asset) ? (
                    <img loading="lazy" decoding="async" src={asset.url} alt={title} className="max-h-full max-w-full object-contain" />
                  ) : asset ? (
                    <span className="flex flex-col items-center gap-1 text-neutral-500">
                      <FileText className="h-7 w-7" />
                      <span className="text-[11px] font-semibold">{extensionOf(asset.name)} file</span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-neutral-400">Not added yet</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 border-t border-border p-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{title}</p>
                    <p className="truncate text-[11px] text-muted-foreground" title={asset?.name}>{asset ? asset.name : hint}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-1">
                    {canEdit && (
                      <Button type="button" variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-[12px]" disabled={busy} onClick={() => pick(slot, LOGO_ACCEPT)}>
                        <Upload className="h-3.5 w-3.5" /> {asset ? "Replace" : "Upload"}
                      </Button>
                    )}
                    {asset && (
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Download" aria-label={`Download ${title}`}>
                        <a href={asset.url} download={asset.name} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                      </Button>
                    )}
                    {asset && canEdit && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" title="Remove" aria-label={`Remove ${title}`} onClick={() => setKit((k) => ({ ...k, logos: { ...k.logos, [slot]: null } }))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colours */}
        <section className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Colours</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">The first is your primary colour, the second your accent.</p>
            </div>
            {canEdit && kit.colors.length < MAX_BRAND_COLORS && (
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-[12px]" onClick={() => setKit((k) => ({ ...k, colors: [...k.colors, { name: "", hex: "#000000" }] }))}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {kit.colors.length === 0 && <p className="text-[12px] text-muted-foreground">No colours added yet.</p>}
            {kit.colors.map((color, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="color"
                  value={isHex(color.hex) ? color.hex : "#000000"}
                  disabled={!canEdit}
                  onChange={(e) => setColor(index, { hex: e.target.value })}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-default"
                  aria-label={`Colour ${index + 1}`}
                />
                <Input value={color.name} disabled={!canEdit} onChange={(e) => setColor(index, { name: e.target.value })} placeholder={index === 0 ? "Primary" : index === 1 ? "Accent" : "Name"} maxLength={40} className="h-9 min-w-0 flex-1 text-[13px]" aria-label={`Colour ${index + 1} name`} />
                <Input value={color.hex} disabled={!canEdit} onChange={(e) => setColor(index, { hex: e.target.value.trim() })} maxLength={7} className="h-9 w-[92px] shrink-0 font-mono text-[12px] uppercase" aria-label={`Colour ${index + 1} hex`} />
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" title="Remove" aria-label={`Remove colour ${index + 1}`} onClick={() => setKit((k) => ({ ...k, colors: k.colors.filter((_, i) => i !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Typography and voice */}
        <section className={CARD}>
          <h2 className="text-sm font-semibold">Fonts and voice</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Upload the font files themselves under Other brand files.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="brand-heading-font" className="text-[13px]">Heading font</Label>
              <Input id="brand-heading-font" value={kit.headingFont} disabled={!canEdit} onChange={(e) => setKit((k) => ({ ...k, headingFont: e.target.value }))} placeholder="e.g. Montserrat" maxLength={80} className="mt-1 h-9 text-sm" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="brand-body-font" className="text-[13px]">Body font</Label>
              <Input id="brand-body-font" value={kit.bodyFont} disabled={!canEdit} onChange={(e) => setKit((k) => ({ ...k, bodyFont: e.target.value }))} placeholder="e.g. Inter" maxLength={80} className="mt-1 h-9 text-sm" />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="brand-tagline" className="text-[13px]">Tagline</Label>
              <Input id="brand-tagline" value={kit.tagline} disabled={!canEdit} onChange={(e) => setKit((k) => ({ ...k, tagline: e.target.value }))} placeholder="The line that goes with your name" maxLength={200} className="mt-1 h-9 text-sm" />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="brand-notes" className="text-[13px]">Usage notes</Label>
              <Textarea id="brand-notes" value={kit.notes} disabled={!canEdit} onChange={(e) => setKit((k) => ({ ...k, notes: e.target.value }))} placeholder="Clear space, minimum size, what not to do with the logo, tone of voice…" maxLength={4000} rows={4} className="mt-1 text-sm" />
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Guidelines */}
        <section className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Brand guidelines</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Your brand book, usually a PDF.</p>
            </div>
            {canEdit && (
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-[12px]" disabled={busy} onClick={() => pick("guidelines", ".pdf,.doc,.docx,.ppt,.pptx,.key,.zip")}>
                {uploading === "guidelines" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {kit.guidelines ? "Replace" : "Upload"}
              </Button>
            )}
          </div>
          <div className="mt-4">
            {kit.guidelines
              ? <FileRow asset={kit.guidelines} onRemove={canEdit ? () => setKit((k) => ({ ...k, guidelines: null })) : undefined} />
              : <p className="text-[12px] text-muted-foreground">No guidelines added yet.</p>}
          </div>
        </section>

        {/* Other files */}
        <section className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Other brand files</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Font files, alternate logos, patterns, templates, photos. Up to 25 MB each.</p>
            </div>
            {canEdit && kit.resources.length < MAX_BRAND_RESOURCES && (
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-[12px]" disabled={busy} onClick={() => pick("resource", "")}>
                {uploading === "resource" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add files
              </Button>
            )}
          </div>
          <div className="mt-4 divide-y divide-border">
            {kit.resources.length === 0 && <p className="text-[12px] text-muted-foreground">No files added yet.</p>}
            {kit.resources.map((asset) => (
              <FileRow key={asset.path || asset.url} asset={asset} onRemove={canEdit ? () => setKit((k) => ({ ...k, resources: k.resources.filter((r) => r !== asset) })) : undefined} />
            ))}
          </div>
        </section>
      </div>

      {canEdit && (
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <p className="min-w-0 truncate text-[12px] text-muted-foreground">
            {dirty ? "You have unsaved changes." : saved.id ? "All changes saved." : "Add your brand's files, then save."}
          </p>
          <Button type="button" size="sm" className="h-9 shrink-0 gap-1.5 text-[13px]" disabled={!dirty || busy} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save brand kit
          </Button>
        </div>
      )}
    </div>
  );
}
