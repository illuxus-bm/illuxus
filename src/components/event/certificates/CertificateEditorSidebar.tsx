/**
 * Left panel of the certificate editor: layouts, backgrounds, Brand Kit logos,
 * the event's partners, the three signature slots, dynamic fields and extra
 * elements. Every control edits the design through the pure functions in
 * `certificate-design.ts`, so the canvas, the layers list and the PDF all see
 * the same result.
 */
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, Building2, Circle, Diamond, Handshake, Heading1, ImagePlus, LayoutTemplate, Minus, PenLine, Shapes, Square, Star,
  Trash2, Type, Upload, Wallpaper,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { newImageElement, newShapeElement, newTextElement, updateElement, type BrochureElement, type ImageElement, type PageBackground } from "@/lib/brochure/editor/editor-document";
import { placedImageSizeMm, readImageFile } from "@/lib/brochure/editor/editor-image-file";
import { isPreviewable, LOGO_SLOTS, type BrandKit } from "@/lib/brand-kit";
import { CERTIFICATE_FIELDS, fieldToken, type CertificateFieldKey } from "@/lib/certificates/certificate-fields";
import { BACKGROUNDS, BACKGROUND_CATEGORIES } from "@/lib/certificates/certificate-backgrounds";
import { TEMPLATES, TEMPLATE_CATEGORIES, buildTemplate } from "@/lib/certificates/certificate-templates";
import {
  BG_IMAGE_ID, MAX_SIGNATURES, ORG_LOGO_ID, applyBackground, backgroundResolutionWarning, movePartner, pageOf, removeBackgroundImage,
  setBackgroundImage, setOrgLogo, setPartners, setQrEnabled, syncPartners, syncSignatures, updateSignature,
  type CertificateDesign, type PartnerLogoRef,
} from "@/lib/certificates/certificate-design";
import { useThumbnail } from "./useThumbnail";

export type SidebarTab = "layouts" | "background" | "logos" | "partners" | "signatures" | "fields" | "elements";

const TABS: { id: SidebarTab; label: string; icon: typeof LayoutTemplate }[] = [
  { id: "layouts", label: "Layouts", icon: LayoutTemplate },
  { id: "background", label: "Background", icon: Wallpaper },
  { id: "logos", label: "Logos", icon: Building2 },
  { id: "partners", label: "Partners", icon: Handshake },
  { id: "signatures", label: "Signatures", icon: PenLine },
  { id: "fields", label: "Text & fields", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
];

type Make = (w: number, h: number, ink: string, accent: string) => BrochureElement;
const ADDABLE: { label: string; icon: typeof Type; make: Make }[] = [
  { label: "Heading", icon: Heading1, make: (w, h, ink) => newTextElement({ x: w / 2 - 70, y: h / 2 - 8, width: 140, height: 12, content: "Heading", fontSize: 28, fontWeight: "bold", color: ink, align: "center" }) },
  { label: "Text", icon: Type, make: (w, h, ink) => newTextElement({ x: w / 2 - 50, y: h / 2 - 4, width: 100, height: 7, content: "Your text here", fontSize: 12, color: ink, align: "center" }) },
  { label: "Line", icon: Minus, make: (w, h, _ink, accent) => newShapeElement({ shape: "line", x: w / 2 - 40, y: h / 2, width: 80, height: 2, fill: "transparent", stroke: accent, strokeWidth: 0.5 }) },
  { label: "Border", icon: Square, make: (w, h, _ink, accent) => ({ ...newShapeElement({ x: 14, y: 14, width: w - 28, height: h - 28, fill: "transparent", stroke: accent, strokeWidth: 0.6 }), locked: true }) },
  { label: "Box", icon: Square, make: (w, h, _ink, accent) => newShapeElement({ x: w / 2 - 25, y: h / 2 - 15, width: 50, height: 30, fill: accent, cornerRadius: 2 }) },
  { label: "Circle", icon: Circle, make: (w, h, _ink, accent) => newShapeElement({ shape: "ellipse", x: w / 2 - 12, y: h / 2 - 12, width: 24, height: 24, fill: accent }) },
  { label: "Star", icon: Star, make: (w, h, _ink, accent) => newShapeElement({ shape: "star", x: w / 2 - 8, y: h / 2 - 8, width: 16, height: 16, fill: accent }) },
  { label: "Diamond", icon: Diamond, make: (w, h, _ink, accent) => newShapeElement({ shape: "diamond", x: w / 2 - 6, y: h / 2 - 6, width: 12, height: 12, fill: accent }) },
  { label: "Image", icon: ImagePlus, make: (w, h) => newShapeElement({ x: w / 2, y: h / 2, width: 1, height: 1 }) },
];

const LOGO_LABELS: Record<string, string> ={ cmyk: "Primary", white: "Light / white", black: "Dark / mono", icon: "Icon" };
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

interface Props {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  design: CertificateDesign;
  onChange: (design: CertificateDesign) => void;
  brandKit: BrandKit | null;
  brandKitError: string | null;
  partners: PartnerLogoRef[];
  /** The one selected text element, if any — fields are inserted into it. */
  selectedTextId: string | null;
  onAddElement: (el: BrochureElement) => void;
  onApplyLayout: (templateId: string) => void;
  onSelect: (ids: string[]) => void;
}

function Section({ title, children, hint }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {hint && <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Warning = ({ children }: { children: ReactNode }) => (
  <p className="flex gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-300">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    <span>{children}</span>
  </p>
);

function bgSwatch(bg: PageBackground): React.CSSProperties {
  if (bg.type === "solid") return { background: bg.color };
  if (bg.type === "gradient") return { background: `linear-gradient(180deg, ${bg.top}, ${bg.bottom})` };
  return { background: "#e5e7eb" };
}

function LayoutCard({ id, name, onPick }: { id: string; name: string; onPick: () => void }) {
  const url = useThumbnail(`tpl:${id}`, () => {
    const spec = TEMPLATES.find((t) => t.id === id);
    return spec ? buildTemplate(spec) : null;
  });
  return (
    <button type="button" onClick={onPick} className="group text-left">
      <div className="aspect-[297/210] overflow-hidden rounded-md border border-border bg-muted/40 group-hover:ring-2 group-hover:ring-primary/40">
        {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <div className="h-full w-full animate-pulse bg-muted" />}
      </div>
      <p className="mt-1 truncate text-[11.5px] font-medium">{name}</p>
    </button>
  );
}

export default function CertificateEditorSidebar(props: Props) {
  const { tab, onTab, design, onChange, brandKit, partners } = props;
  const page = pageOf(design);
  const [layoutCategory, setLayoutCategory] = useState<string>("all");
  const [bgWarning, setBgWarning] = useState<string | null>(null);
  const bgInput = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const sigInputs = useRef<(HTMLInputElement | null)[]>([]);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const ink = design.settings.signatureStyle.color;
  const accent = design.settings.signatureStyle.lineColor;

  const addImage = async (file: File) => {
    const read = await readImageFile(file);
    if (read.status === "rejected") { toast.error(read.title, { description: read.description }); return; }
    const size = placedImageSizeMm(read.width, read.height, page.width, page.height, 0.3);
    props.onAddElement(newImageElement({ x: (page.width - size.width) / 2, y: (page.height - size.height) / 2, ...size, src: read.dataUrl, fit: "contain" }));
  };
  const [sigWarnings, setSigWarnings] = useState<(string | null)[]>([null, null, null]);

  const bgImage = page.elements.find((e) => e.id === BG_IMAGE_ID) as ImageElement | undefined;
  const orgLogo = page.elements.find((e) => e.id === ORG_LOGO_ID) as ImageElement | undefined;
  const patchBgImage = (patch: Partial<ImageElement>) =>
    onChange({ ...design, document: updateElement(design.document, page.id, BG_IMAGE_ID, patch) });

  const uploadBackground = async (file: File) => {
    const read = await readImageFile(file);
    if (read.status === "rejected") { toast.error(read.title, { description: read.description }); return; }
    setBgWarning(backgroundResolutionWarning(read.width, read.height, page));
    onChange(setBackgroundImage(design, read.dataUrl));
  };

  const uploadLogo = async (file: File) => {
    const read = await readImageFile(file);
    if (read.status === "rejected") { toast.error(read.title, { description: read.description }); return; }
    onChange(setOrgLogo(design, read.dataUrl, read.width, read.height));
  };

  const uploadSignature = async (slot: number, file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error("Use a PNG, JPG or WebP image of the signature."); return; }
    if (file.size > MAX_SIGNATURE_BYTES) { toast.error("Signature images can be at most 2 MB."); return; }
    const read = await readImageFile(file);
    if (read.status === "rejected") { toast.error(read.title, { description: read.description }); return; }
    setSigWarnings((w) => w.map((x, i) => (i === slot ? (file.type === "image/jpeg" ? "JPG has no transparent background, so a white box may show behind the signature. A transparent PNG looks best." : null) : x)));
    onChange(updateSignature(design, slot, { imageSrc: read.dataUrl }));
  };

  const togglePartner = (id: string, on: boolean) => {
    const current = design.settings.partners.map((p) => p.sponsorId);
    const next = on ? [...current, id] : current.filter((x) => x !== id);
    onChange(setPartners(design, next, partners));
  };

  const insertField = (key: CertificateFieldKey) => {
    const token = fieldToken(key);
    const target = props.selectedTextId ? page.elements.find((e) => e.id === props.selectedTextId) : undefined;
    if (target && target.kind === "text") {
      const content = target.content.trim() ? `${target.content} ${token}` : token;
      onChange({ ...design, document: updateElement(design.document, page.id, target.id, { content }) });
      return;
    }
    const width = key === "participant_name" ? page.width * 0.7 : 110;
    props.onAddElement(newTextElement({
      x: (page.width - width) / 2, y: page.height / 2 - 6, width, height: key === "participant_name" ? 16 : 7,
      content: token, fontFamily: design.settings.signatureStyle.fontFamily, fontSize: key === "participant_name" ? 32 : 12,
      fontWeight: key === "participant_name" ? "bold" : "normal", color: design.settings.signatureStyle.color, align: "center",
    }));
  };

  const enabledCount = design.settings.signatures.filter((s) => s.enabled).length;
  const chosen = new Set(design.settings.partners.map((p) => p.sponsorId));
  const otherBrandAssets = brandKit ? brandKit.resources.filter((r) => isPreviewable(r)) : [];

  return (
    <div className="flex h-full min-h-0 shrink-0 border-r border-border bg-card">
      <nav className="flex w-[68px] shrink-0 flex-col gap-0.5 border-r border-border p-1.5" aria-label="Design tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10.5px] leading-tight transition-colors",
              tab === t.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden />
            <span className="text-center">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="w-[284px] min-h-0 overflow-y-auto p-4 space-y-6">
        {tab === "layouts" && (
          <Section title="Layouts" hint="Switch to another design. Your logo, partners and signatures come with you.">
            <Select value={layoutCategory} onValueChange={setLayoutCategory}>
              <SelectTrigger className="h-8 text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2.5">
              {TEMPLATES.filter((t) => layoutCategory === "all" || t.category === layoutCategory).map((t) => (
                <LayoutCard key={t.id} id={t.id} name={t.name} onPick={() => props.onApplyLayout(t.id)} />
              ))}
            </div>
          </Section>
        )}

        {tab === "background" && (
          <>
            <Section title="Your own image" hint="Upload a background for this certificate only — it isn't added to any library.">
              <input ref={bgInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadBackground(f); }} />
              <Button size="sm" variant="outline" className="w-full h-8 gap-1.5 text-[12.5px]" onClick={() => bgInput.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> {bgImage ? "Replace image" : "Upload image"}
              </Button>
              {bgWarning && <Warning>{bgWarning}</Warning>}
              {bgImage && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[12px]">Fit</Label>
                    <Select value={bgImage.fit} onValueChange={(v) => patchBgImage({ fit: v as ImageElement["fit"] })}>
                      <SelectTrigger className="h-7 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cover">Fill page</SelectItem>
                        <SelectItem value="contain">Fit inside</SelectItem>
                        <SelectItem value="fill">Stretch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {([
                    ["Opacity", "opacity", 0.1, 1, 0.05, bgImage.opacity],
                    ["Horizontal position", "focalX", 0, 1, 0.01, bgImage.focalX ?? 0.5],
                    ["Vertical position", "focalY", 0, 1, 0.01, bgImage.focalY ?? 0.5],
                    ["Zoom", "zoom", 1, 3, 0.05, bgImage.zoom ?? 1],
                  ] as const).map(([label, key, min, max, step, value]) => (
                    <div key={key}>
                      <Label className="text-[12px]">{label}</Label>
                      <Slider className="mt-2" min={min} max={max} step={step} value={[value]} onValueChange={([v]) => patchBgImage({ [key]: v } as Partial<ImageElement>)} />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="h-7 w-full gap-1.5 text-[12px] text-destructive hover:text-destructive" onClick={() => { setBgWarning(null); onChange(removeBackgroundImage(design)); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove image
                  </Button>
                </div>
              )}
            </Section>
            <Section title="Page colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Page colour"
                  value={page.background.type === "solid" ? page.background.color : "#ffffff"}
                  onChange={(e) => onChange({ ...design, document: { ...design.document, pages: [{ ...page, background: { type: "solid", color: e.target.value } }] } })}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                />
                <span className="text-[11.5px] text-muted-foreground">Used behind any decoration and image.</span>
              </div>
            </Section>
            {BACKGROUND_CATEGORIES.map((cat) => (
              <Section key={cat} title={cat}>
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUNDS.filter((b) => b.category === cat).map((b) => (
                    <button key={b.id} type="button" onClick={() => onChange(applyBackground(design, b))} className="text-left" title={b.name}>
                      <div
                        className={cn("aspect-[297/210] rounded border border-border", design.settings.backgroundId === b.id && "ring-2 ring-primary")}
                        style={bgSwatch(b.background)}
                      />
                      <p className="mt-1 truncate text-[10.5px] text-muted-foreground">{b.name}</p>
                    </button>
                  ))}
                </div>
              </Section>
            ))}
          </>
        )}

        {tab === "logos" && (
          <>
            <Section title="Brand Kit" hint="Logos already in your organisation's Brand Kit.">
              {props.brandKitError && <Warning>{props.brandKitError}</Warning>}
              {brandKit && LOGO_SLOTS.some((s) => isPreviewable(brandKit.logos[s])) ? (
                <div className="grid grid-cols-2 gap-2">
                  {LOGO_SLOTS.map((slot) => {
                    const a = brandKit.logos[slot];
                    if (!a || !isPreviewable(a)) return null;
                    return (
                      <button key={slot} type="button" onClick={() => onChange(setOrgLogo(design, a.url))} className={cn("rounded-md border border-border p-2 text-left hover:border-primary/50", orgLogo?.src === a.url && "ring-2 ring-primary")}>
                        <div className={cn("flex h-14 items-center justify-center rounded", slot === "white" ? "bg-slate-800" : "bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px]")}>
                          <img src={a.url} alt="" className="max-h-12 max-w-full object-contain" />
                        </div>
                        <p className="mt-1 text-[11px] font-medium">{LOGO_LABELS[slot]}</p>
                      </button>
                    );
                  })}
                </div>
              ) : !props.brandKitError ? (
                <p className="text-[12px] text-muted-foreground">
                  No logos in the Brand Kit yet. <Link to="/dashboard/organization?tab=brand" className="underline underline-offset-2">Add them to the Brand Kit</Link> to reuse them everywhere, or upload one for this certificate below.
                </p>
              ) : null}
              {otherBrandAssets.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {otherBrandAssets.map((a) => (
                    <button key={a.path || a.url} type="button" onClick={() => onChange(setOrgLogo(design, a.url))} className="rounded border border-border p-1.5 hover:border-primary/50" title={a.name}>
                      <img src={a.url} alt={a.name} className="h-10 w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </Section>
            <Section title="Upload for this certificate">
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} />
              <Button size="sm" variant="outline" className="w-full h-8 gap-1.5 text-[12.5px]" onClick={() => logoInput.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5" /> Upload a logo
              </Button>
            </Section>
            {orgLogo && (
              <Section title="On the certificate">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-[12px]" onClick={() => props.onSelect([ORG_LOGO_ID])}>Select to move</Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-destructive hover:text-destructive" onClick={() => onChange({ ...design, document: { ...design.document, pages: [{ ...page, elements: page.elements.filter((e) => e.id !== ORG_LOGO_ID) }] } })}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </Section>
            )}
          </>
        )}

        {tab === "partners" && (
          <Section title="Event partners" hint="Sponsors and partners attached to this event. Logos appear in a strip, in the order below.">
            {partners.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">This event has no sponsors or partners yet. Add them under <span className="font-medium">Sponsors</span> in the event menu.</p>
            ) : (
              <div className="space-y-1.5">
                {partners.map((p) => (
                  <label key={p.sponsorId} className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={chosen.has(p.sponsorId)} onCheckedChange={(v) => togglePartner(p.sponsorId, v === true)} />
                    <div className="flex h-7 w-12 shrink-0 items-center justify-center rounded bg-white">
                      {p.logoUrl ? <img src={p.logoUrl} alt="" className="max-h-6 max-w-11 object-contain" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label="No logo" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{p.name}</p>
                      <p className="truncate text-[11px] capitalize text-muted-foreground">{p.tier}{!p.logoUrl ? " · no logo on file" : ""}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {design.settings.partners.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-[12px] font-medium">Order on the certificate</p>
                {design.settings.partners.map((p, i) => (
                  <div key={p.sponsorId} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-4 text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => onChange(movePartner(design, p.sponsorId, -1))} aria-label={`Move ${p.name} left`}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === design.settings.partners.length - 1} onClick={() => onChange(movePartner(design, p.sponsorId, 1))} aria-label={`Move ${p.name} right`}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                <label className="flex items-center justify-between gap-2 pt-1 text-[12.5px]">
                  Show partner names under logos
                  <Switch checked={design.settings.showPartnerNames} onCheckedChange={(v) => onChange(syncPartners({ ...design, settings: { ...design.settings, showPartnerNames: v } }))} />
                </label>
                {design.settings.partners.length > 6 && <Warning>With many partners the logos get small. Consider only the headline partners.</Warning>}
              </div>
            )}
          </Section>
        )}

        {tab === "signatures" && (
          <>
            <Section
              title={`Signatures · ${enabledCount} of ${MAX_SIGNATURES}`}
              hint="Up to three. Each slot is optional and independent; switched-off slots leave no gap or empty line. Only upload signatures you are authorised to use."
            >
              <Button size="sm" variant="outline" className="h-7 w-full text-[12px]" disabled={enabledCount === 0} onClick={() => onChange(syncSignatures(design, true))}>
                Arrange evenly
              </Button>
            </Section>
            {design.settings.signatures.map((s, i) => (
              <div key={i} className={cn("rounded-lg border p-3 space-y-2.5", s.enabled ? "border-border" : "border-dashed border-border/70")}>
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold">Signature {i + 1}</p>
                  <Switch checked={s.enabled} onCheckedChange={(v) => onChange(updateSignature(design, i, { enabled: v }))} aria-label={`Show signature ${i + 1}`} />
                </div>
                {s.enabled && (
                  <>
                    <input ref={(el) => { sigInputs.current[i] = el; }} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadSignature(i, f); }} />
                    <div className="flex items-center gap-2">
                      <div className="flex h-12 flex-1 items-center justify-center rounded border border-border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:10px_10px]">
                        {s.imageSrc ? <img src={s.imageSrc} alt={`Signature ${i + 1}`} className="max-h-11 max-w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">No image</span>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => sigInputs.current[i]?.click()}>{s.imageSrc ? "Replace" : "Upload"}</Button>
                        {s.imageSrc && <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onChange(updateSignature(design, i, { imageSrc: "" }))}>Remove</Button>}
                      </div>
                    </div>
                    {sigWarnings[i] && <Warning>{sigWarnings[i]}</Warning>}
                    {!s.imageSrc && <p className="text-[11px] text-amber-700 dark:text-amber-400">No signature image — only the line and name will print.</p>}
                    <div>
                      <Label className="text-[11.5px]">Signatory name</Label>
                      <Input value={s.name} maxLength={120} onChange={(e) => onChange(updateSignature(design, i, { name: e.target.value }))} className={cn("mt-1 h-8 text-[12.5px]", !s.name.trim() && "border-destructive/60")} />
                      {!s.name.trim() && <p className="mt-1 text-[11px] text-destructive">Needed before publishing.</p>}
                    </div>
                    <div>
                      <Label className="text-[11.5px]">Designation</Label>
                      <Input value={s.designation} maxLength={160} onChange={(e) => onChange(updateSignature(design, i, { designation: e.target.value }))} className="mt-1 h-8 text-[12.5px]" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[11.5px]">Organisation</Label>
                        <Switch checked={s.showOrganization} onCheckedChange={(v) => onChange(updateSignature(design, i, { showOrganization: v }))} aria-label="Show organisation" />
                      </div>
                      {s.showOrganization && <Input value={s.organization} maxLength={160} onChange={(e) => onChange(updateSignature(design, i, { organization: e.target.value }))} className="mt-1 h-8 text-[12.5px]" />}
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {tab === "fields" && (
          <>
            <Section title="Certificate type" hint="Fills the “Certificate type” field.">
              <Input value={design.settings.certificateType} maxLength={120} onChange={(e) => onChange({ ...design, settings: { ...design.settings, certificateType: e.target.value } })} className="h-8 text-[12.5px]" />
            </Section>
            <Section title="Dynamic fields" hint={props.selectedTextId ? "Click a field to add it to the selected text box." : "Click a field to add it as a new text box, or select a text box first to insert into it."}>
              <div className="space-y-1">
                {CERTIFICATE_FIELDS.map((f) => (
                  <button key={f.key} type="button" onClick={() => insertField(f.key)} className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted">
                    <span className="text-[12.5px]">{f.label}{"required" in f && f.required ? <span className="text-destructive"> *</span> : null}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{f.sample}</span>
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}

        {tab === "elements" && (
          <>
            <Section title="Verification QR code" hint="Links to a page where anyone can confirm the certificate is genuine.">
              <label className="flex items-center justify-between text-[12.5px]">
                Show QR code
                <Switch checked={design.settings.qr.enabled} onCheckedChange={(v) => onChange(setQrEnabled(design, v))} />
              </label>
            </Section>
            <Section title="Add" hint="Text, lines, shapes and borders. Use the layers panel on the right to order, lock or hide them.">
              <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addImage(f); }} />
              <div className="grid grid-cols-3 gap-1.5">
                {ADDABLE.map((a) => (
                  <button key={a.label} type="button" onClick={() => (a.label === "Image" ? imageInput.current?.click() : props.onAddElement(a.make(page.width, page.height, ink, accent)))}
                    className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-2.5 text-[11px] hover:bg-muted">
                    <a.icon className="h-4 w-4" aria-hidden />
                    {a.label}
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
