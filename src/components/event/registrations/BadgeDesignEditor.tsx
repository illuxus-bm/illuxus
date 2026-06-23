import { useRef } from "react";
import {
  ArrowLeft, FlaskConical, Printer, Upload, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  LAYOUT_PRESETS, BADGE_FONT_OPTIONS, NAME_DESIGNS, defaultBgTransform, applyPreset,
  type BadgeDesign, type ElementKey, type LayoutPresetId, type NameDesignId,
  type BgTransform, type FrontBgStyle, frontBgStyleToCss, fileToDataUrl,
} from "@/lib/badge-design";
import type { PrintMode } from "@/lib/print-badges";
import BadgeDesignerCanvas from "./BadgeDesignerCanvas";

const ELEMENT_KEYS: ElementKey[] = [
  "name", "company", "qr", "title", "email",
  "ticket", "eventTitle", "eventDate", "orgName", "customText",
];
const ELEMENT_LABELS: Record<ElementKey, string> = {
  name: "Name", company: "Company", qr: "QR code", title: "Job title",
  email: "Email", ticket: "Ticket / role", eventTitle: "Event title",
  eventDate: "Event date", orgName: "Organisation", customText: "Custom text",
};

interface Props {
  design: BadgeDesign;
  onDesignChange: (d: BadgeDesign) => void;
  mode: PrintMode;
  widthMm: number;
  heightMm: number;
  badgeCount: number;
  eventTitle?: string;
  sampleName?: string;
  sampleCompany?: string;
  nameDesignId: NameDesignId;
  onNameDesignChange: (id: NameDesignId) => void;
  onBack: () => void;
  onTestPrint: () => void;
  onPrint: () => void;
}

export default function BadgeDesignEditor({
  design, onDesignChange, mode, widthMm, heightMm,
  badgeCount, eventTitle, sampleName, sampleCompany,
  nameDesignId, onNameDesignChange,
  onBack, onTestPrint, onPrint,
}: Props) {
  const total = badgeCount;

  const updateEl = (k: ElementKey, patch: Partial<BadgeDesign["elements"]["name"]>) => {
    onDesignChange({ ...design, elements: { ...design.elements, [k]: { ...design.elements[k], ...patch } } });
  };
  const alignEl = (k: ElementKey, axis: "x" | "y", v: number) => updateEl(k, { [axis]: v });

  const uploadImage = async (key: "frontBg" | "backBg", file?: File | null) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    onDesignChange({ ...design, [key]: url });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0 bg-background">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1.5 text-[13px]">
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Button>
        <div className="flex-1 text-[13px] font-semibold text-center truncate">
          Badge Designer
          {eventTitle && <span className="text-muted-foreground font-normal"> · {eventTitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onTestPrint} className="gap-1.5 text-[12px]">
            <FlaskConical className="h-3.5 w-3.5" /> Test print
          </Button>
          <Button size="sm" onClick={onPrint} disabled={total === 0} className="gap-1.5 text-[12px]">
            <Printer className="h-3.5 w-3.5" /> Print {total > 0 ? `(${total})` : ""}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-border p-3 space-y-4 hidden sm:block">
          <LeftPanelContents
            design={design}
            onDesignChange={onDesignChange}
            mode={mode}
            widthMm={widthMm}
            heightMm={heightMm}
            nameDesignId={nameDesignId}
            onNameDesignChange={onNameDesignChange}
            sampleName={sampleName}
            sampleCompany={sampleCompany}
            updateEl={updateEl}
            alignEl={alignEl}
            uploadImage={uploadImage}
          />
        </aside>

        {/* Canvas centre */}
        <main className="flex-1 overflow-hidden flex flex-col items-center justify-center bg-muted/30 p-4 gap-3">
          <div className="w-full max-w-xl flex-1 flex flex-col items-center justify-center min-h-0">
            <BadgeDesignerCanvas
              design={design}
              onChange={onDesignChange}
              widthMm={widthMm}
              heightMm={heightMm}
              sampleName={sampleName}
              sampleCompany={sampleCompany ?? "Acme Inc."}
              showGrid
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Drag elements to reposition · snap guides at center and edges · what you see prints 1:1
          </p>
        </main>
      </div>

      {/* Mobile bottom panel trigger */}
      <div className="sm:hidden fixed bottom-4 right-4 z-10">
        <MobileSheet
          design={design}
          onDesignChange={onDesignChange}
          mode={mode}
          widthMm={widthMm}
          heightMm={heightMm}
          nameDesignId={nameDesignId}
          onNameDesignChange={onNameDesignChange}
          sampleName={sampleName}
          sampleCompany={sampleCompany}
          updateEl={updateEl}
          alignEl={alignEl}
          uploadImage={uploadImage}
        />
      </div>
    </div>
  );
}

// ─── Shared left-panel props ────────────────────────────────────────────────
interface PanelProps {
  design: BadgeDesign;
  onDesignChange: (d: BadgeDesign) => void;
  mode: PrintMode;
  widthMm: number;
  heightMm: number;
  nameDesignId: NameDesignId;
  onNameDesignChange: (id: NameDesignId) => void;
  sampleName?: string;
  sampleCompany?: string;
  updateEl: (k: ElementKey, patch: Partial<BadgeDesign["elements"]["name"]>) => void;
  alignEl: (k: ElementKey, axis: "x" | "y", v: number) => void;
  uploadImage: (key: "frontBg" | "backBg", file?: File | null) => Promise<void>;
}

function LeftPanelContents({ design, onDesignChange, mode, widthMm, heightMm,
  nameDesignId, onNameDesignChange, sampleName, sampleCompany,
  updateEl, alignEl, uploadImage }: PanelProps) {
  return (
    <>
      {/* Presets */}
      <section>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
          Layout presets
        </Label>
        <div className="space-y-1.5">
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Apply ${p.name} preset`}
              onClick={() => onDesignChange(applyPreset(design, p.id as LayoutPresetId))}
              className="w-full flex items-center gap-2.5 border border-border rounded-lg p-2 hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              {/* Live miniature thumbnail */}
              <div className="w-[52px] h-[72px] overflow-hidden rounded border border-border pointer-events-none shrink-0 bg-muted">
                <div style={{ transform: "scale(0.28)", transformOrigin: "top left",
                  width: `${widthMm * 3.78}px`, height: `${heightMm * 3.78}px` }}>
                  <BadgeDesignerCanvas
                    design={applyPreset(design, p.id as LayoutPresetId)}
                    onChange={() => {}}
                    widthMm={widthMm}
                    heightMm={heightMm}
                    sampleName={sampleName}
                    sampleCompany={sampleCompany ?? "Acme Inc."}
                    showGrid={false}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold leading-tight">{p.name}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{p.description}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Name designs section (name mode only) */}
      {mode === "name" && (
        <>
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
              Name designs
            </Label>
            <div className="space-y-1.5">
              {NAME_DESIGNS.map((nd) => (
                <button
                  key={nd.id}
                  type="button"
                  aria-label={`Apply ${nd.name} name design`}
                  onClick={() => onNameDesignChange(nd.id)}
                  className={`w-full flex items-center gap-2.5 border rounded-lg p-2 transition-colors text-left ${nameDesignId === nd.id ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary/5"}`}
                >
                  <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ background: nd.accentColor }}>
                    {nd.id === "monogram" ? "Aa" : nd.id === "bold" ? "BB" : nd.id === "ticket-stub" ? "T" : nd.id === "event-card" ? "E" : "S"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold leading-tight">{nd.name}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{nd.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <div className="h-px bg-border" />
        </>
      )}

      {/* Elements */}
      {mode === "badge" && (
        <section>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Elements</Label>
          <div className="space-y-2">
            {ELEMENT_KEYS.map((k) => (
              <ElementControl
                key={k}
                elementKey={k}
                el={design.elements[k]}
                updateEl={updateEl}
                alignEl={alignEl}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ─── Bottom panel (background + back side + full-bleed) ─────────────────────
// This is rendered as a bottom bar inside the canvas column via a separate
// exported component so the dialog can inject it below the canvas.

export function BadgeDesignBottomPanel({
  design, onDesignChange, uploadImage,
}: {
  design: BadgeDesign;
  onDesignChange: (d: BadgeDesign) => void;
  uploadImage: (key: "frontBg" | "backBg", file?: File | null) => Promise<void>;
}) {
  const bgStyle = design.frontBgStyle ?? { type: "none" as const };

  return (
    <div className="flex flex-wrap items-start gap-4 px-4 py-3 border-t border-border bg-background text-[12px]">
      {/* Background */}
      <div className="space-y-1.5 min-w-[200px]">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground block">Background</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1 text-[11px] border border-border rounded-md px-2 py-1 cursor-pointer hover:bg-muted/40">
            <Upload className="h-3 w-3" /> {design.frontBg ? "Replace" : "Upload"}
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => uploadImage("frontBg", e.target.files?.[0])} />
          </label>
          {design.frontBg && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
              onClick={() => onDesignChange({ ...design, frontBg: "" })}>Remove</Button>
          )}
        </div>

        {/* bg style controls — shown when no image */}
        {!design.frontBg && (
          <div className="space-y-1.5 pt-1">
            <div className="flex gap-1">
              {(["none", "solid", "gradient"] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => onDesignChange({ ...design, frontBgStyle: { ...bgStyle, type: t } })}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${bgStyle.type === t ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`}>
                  {t === "none" ? "None" : t === "solid" ? "Solid" : "Gradient"}
                </button>
              ))}
            </div>
            {bgStyle.type === "solid" && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">Color</Label>
                <input type="color" value={bgStyle.color ?? "#ffffff"}
                  onChange={(e) => onDesignChange({ ...design, frontBgStyle: { ...bgStyle, color: e.target.value } })}
                  className="h-7 w-9 rounded border border-border cursor-pointer"
                  aria-label="Background solid color" />
              </div>
            )}
            {bgStyle.type === "gradient" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">From</Label>
                    <input type="color" value={bgStyle.gradientFrom ?? "#667eea"}
                      onChange={(e) => onDesignChange({ ...design, frontBgStyle: { ...bgStyle, gradientFrom: e.target.value } })}
                      className="h-7 w-9 rounded border border-border cursor-pointer"
                      aria-label="Gradient start color" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">To</Label>
                    <input type="color" value={bgStyle.gradientTo ?? "#764ba2"}
                      onChange={(e) => onDesignChange({ ...design, frontBgStyle: { ...bgStyle, gradientTo: e.target.value } })}
                      className="h-7 w-9 rounded border border-border cursor-pointer"
                      aria-label="Gradient end color" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Angle</span>
                    <span className="tabular-nums">{bgStyle.gradientAngle ?? 135}°</span>
                  </div>
                  <input type="range" min={0} max={360} step={5}
                    value={bgStyle.gradientAngle ?? 135}
                    onChange={(e) => onDesignChange({ ...design, frontBgStyle: { ...bgStyle, gradientAngle: Number(e.target.value) } })}
                    className="w-full accent-primary"
                    aria-label="Gradient angle" />
                </div>
                <div className="h-6 w-full rounded border border-border"
                  style={{ background: frontBgStyleToCss(bgStyle) }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Back side */}
      <div className="space-y-1.5 min-w-[180px]">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground block">Back side</Label>
        <RadioGroup value={design.back} onValueChange={(v) => onDesignChange({ ...design, back: v as BadgeDesign["back"] })} className="space-y-1">
          {[{ v: "none", t: "Single sided" }, { v: "same", t: "Same as front" }, { v: "static", t: "Static design" }].map((opt) => (
            <label key={opt.v} className={`flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer text-[12px] ${design.back === opt.v ? "border-primary bg-primary/5" : "border-border"}`}>
              <RadioGroupItem value={opt.v} />
              {opt.t}
            </label>
          ))}
        </RadioGroup>
        {design.back === "static" && (
          <div className="flex items-center gap-2 mt-1">
            <label className="inline-flex items-center gap-1 text-[11px] border border-border rounded-md px-2 py-1 cursor-pointer hover:bg-muted/40">
              <ImageIcon className="h-3 w-3" /> {design.backBg ? "Replace back" : "Upload back"}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => uploadImage("backBg", e.target.files?.[0])} />
            </label>
            {design.backBg && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                onClick={() => onDesignChange({ ...design, backBg: "" })}>Remove</Button>
            )}
          </div>
        )}
      </div>

      {/* Full bleed */}
      <div className="flex items-center gap-2 pt-5">
        <Checkbox checked={!!design.fullBleed}
          onCheckedChange={(v) => onDesignChange({ ...design, fullBleed: !!v })}
          id="full-bleed-editor" />
        <label htmlFor="full-bleed-editor" className="text-[12px] cursor-pointer">
          <span className="font-medium">Full-bleed</span> · one badge per page
        </label>
      </div>
    </div>
  );
}

// ─── Element control card ────────────────────────────────────────────────────

function ElementControl({
  elementKey: k, el, updateEl, alignEl,
}: {
  elementKey: ElementKey;
  el: BadgeDesign["elements"]["name"];
  updateEl: (k: ElementKey, patch: Partial<BadgeDesign["elements"]["name"]>) => void;
  alignEl: (k: ElementKey, axis: "x" | "y", v: number) => void;
}) {
  return (
    <div className="border border-border rounded-lg p-2 space-y-1.5">
      <label className="flex items-center justify-between text-[12px] font-medium cursor-pointer">
        <span>{ELEMENT_LABELS[k]}</span>
        <Checkbox checked={el.enabled}
          onCheckedChange={(v) => updateEl(k, { enabled: !!v })}
          aria-label={`Toggle ${ELEMENT_LABELS[k]} element`} />
      </label>
      {el.enabled && (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <Input type="number" min={6} max={80} value={el.size}
              onChange={(e) => updateEl(k, { size: Math.max(6, Math.min(80, Number(e.target.value) || 12)) })}
              className="h-7 text-[12px]"
              title={k === "qr" ? "Size in mm" : "Size in pt"}
              aria-label={`${ELEMENT_LABELS[k]} font size`} />
            {k !== "qr" ? (
              <input type="color" value={el.color}
                onChange={(e) => updateEl(k, { color: e.target.value })}
                className="h-7 w-9 rounded border border-border cursor-pointer"
                aria-label={`${ELEMENT_LABELS[k]} color`} />
            ) : <span className="text-[10px] text-muted-foreground px-1">mm</span>}
          </div>

          {k !== "qr" && (
            <div className="space-y-1.5 pt-1 border-t border-border/60">
              {(k === "customText" || k === "ticket") && (
                <Input placeholder={k === "customText" ? "Custom text" : "e.g. VIP, Speaker"}
                  value={el.staticText ?? ""}
                  onChange={(e) => updateEl(k, { staticText: e.target.value })}
                  className="h-7 text-[12px]" />
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <select value={el.fontFamily || "Inter"}
                  onChange={(e) => updateEl(k, { fontFamily: e.target.value as typeof BADGE_FONT_OPTIONS[number] })}
                  className="h-7 rounded border border-border bg-background text-[11px] px-1"
                  aria-label={`${ELEMENT_LABELS[k]} font family`}>
                  {BADGE_FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={el.fontWeight ?? 400}
                  onChange={(e) => updateEl(k, { fontWeight: Number(e.target.value) })}
                  className="h-7 rounded border border-border bg-background text-[11px] px-1"
                  aria-label={`${ELEMENT_LABELS[k]} font weight`}>
                  {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button type="button"
                  onClick={() => updateEl(k, { italic: !el.italic })}
                  aria-label={`${ELEMENT_LABELS[k]} italic`}
                  className={`h-6 w-6 rounded border text-[11px] italic ${el.italic ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                  I
                </button>
                <select value={el.align ?? "center"}
                  onChange={(e) => updateEl(k, { align: e.target.value as "left" | "center" | "right" })}
                  className="h-6 rounded border border-border bg-background text-[10px] px-1"
                  aria-label={`${ELEMENT_LABELS[k]} text align`}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <select value={el.transform ?? "none"}
                  onChange={(e) => updateEl(k, { transform: e.target.value as "none" | "uppercase" | "lowercase" | "capitalize" })}
                  className="h-6 rounded border border-border bg-background text-[10px] px-1 flex-1"
                  aria-label={`${ELEMENT_LABELS[k]} text transform`}>
                  <option value="none">Aa</option>
                  <option value="uppercase">AA</option>
                  <option value="lowercase">aa</option>
                  <option value="capitalize">Aa Bb</option>
                </select>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Letter spacing</span>
                  <span className="tabular-nums">{(el.letterSpacing ?? 0).toFixed(2)}em</span>
                </div>
                <input type="range" min={-0.05} max={0.3} step={0.01}
                  value={el.letterSpacing ?? 0}
                  onChange={(e) => updateEl(k, { letterSpacing: Number(e.target.value) })}
                  className="w-full h-3 accent-primary"
                  aria-label={`${ELEMENT_LABELS[k]} letter spacing`} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5 pt-1">
            <AlignBtn icon={<AlignLeft className="h-3 w-3" />}         onClick={() => alignEl(k, "x", 10)} label="Align left" />
            <AlignBtn icon={<AlignCenter className="h-3 w-3" />}       onClick={() => alignEl(k, "x", 50)} label="Align H-center" />
            <AlignBtn icon={<AlignRight className="h-3 w-3" />}        onClick={() => alignEl(k, "x", 90)} label="Align right" />
            <span className="mx-0.5 w-px h-4 bg-border" />
            <AlignBtn icon={<AlignStartVertical className="h-3 w-3" />}  onClick={() => alignEl(k, "y", 10)} label="Align top" />
            <AlignBtn icon={<AlignCenterVertical className="h-3 w-3" />} onClick={() => alignEl(k, "y", 50)} label="Align V-center" />
            <AlignBtn icon={<AlignEndVertical className="h-3 w-3" />}    onClick={() => alignEl(k, "y", 90)} label="Align bottom" />
          </div>
        </>
      )}
    </div>
  );
}

function AlignBtn({ icon, onClick, label }: { icon: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="h-6 w-6 inline-flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-muted text-muted-foreground hover:text-foreground">
      {icon}
    </button>
  );
}

// ─── Mobile sheet ─────────────────────────────────────────────────────────────
// A simple slide-up panel triggered by a floating "Design" button on mobile.

function MobileSheet(props: PanelProps) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        size="sm"
        className="shadow-lg gap-1.5"
        onClick={() => ref.current?.showModal()}
      >
        Design
      </Button>
      {/* Using a native <dialog> for focus trapping on mobile */}
      <dialog
        ref={ref}
        className="fixed bottom-0 left-0 right-0 m-0 w-full max-h-[75vh] bg-background border-t border-border rounded-t-xl p-0 overflow-hidden"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="p-3 overflow-y-auto max-h-[75vh] space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold">Design</span>
            <Button size="sm" variant="ghost" onClick={() => ref.current?.close()}>Close</Button>
          </div>
          <LeftPanelContents {...props} />
        </div>
      </dialog>
    </>
  );
}
