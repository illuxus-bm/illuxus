/**
 * PrintBadgesDialog — settings + font style print dialog.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Printer, Trash2, Plus, FlaskConical, ChevronDown, ChevronUp,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildPrintHtml, printBadges,
  type BadgeData, type PrintMode, type PrintSize, type PrintUnit,
} from "@/lib/print-badges";
import { loadSizes, saveSizes, badgeSizeMm, type SavedSize } from "@/lib/badge-design";

// ─── Font options ─────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  "Inter", "Arial", "Helvetica", "Roboto", "DM Sans",
  "Space Grotesk", "Poppins", "Montserrat", "Outfit",
  "Plus Jakarta Sans", "Manrope", "Urbanist", "Sora",
  "Playfair Display", "Merriweather", "Georgia", "Times New Roman",
  "Courier New", "Roboto Mono",
];

const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 42, 48];

export interface FontStyle {
  family: string;
  sizePt: number;
  companySizePt: number;   // separate font size for company line
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: "left" | "center" | "right" | "justify";
  wordSpacingPt: number;
  scalePct: number;
  color: string;
}

function defaultFontStyle(): FontStyle {
  return {
    family: "Inter",
    sizePt: 22,
    companySizePt: 12,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    align: "center",
    wordSpacingPt: 0,
    scalePct: 100,
    color: "#111111",
  };
}

// ─── Persisted preferences ────────────────────────────────────────────────────

const PREF_KEY = "lovable.print-badges.v2";

type Prefs = {
  mode: PrintMode;
  size: PrintSize;
  copies: number;
  cw: number;
  ch: number;
  cu: PrintUnit;
  thermalMode: boolean;
  font: FontStyle;
};

function loadPrefs(): Partial<Prefs> {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
}

// ─── Options ──────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { v: PrintMode; label: string; sub: string }[] = [
  { v: "badge", label: "Badge",     sub: "Full badge card" },
  { v: "name",  label: "Name only", sub: "Name + company" },
];

const SIZE_OPTIONS: { v: PrintSize; label: string; sub: string }[] = [
  { v: "a6",          label: "A6 single",     sub: "148 × 105 mm · 1/page" },
  { v: "a4-2up",      label: "A4 · 2-up",     sub: "186 × 134 mm · 2/page" },
  { v: "avery-3x8",   label: "Avery 3×8",     sub: "63 × 34 mm · 24/sheet" },
  { v: "thermal-50",  label: "Thermal 50 mm", sub: "50 × 80 mm" },
  { v: "thermal-58",  label: "Thermal 58 mm", sub: "58 × 80 mm" },
  { v: "thermal-80",  label: "Thermal 80 mm", sub: "80 × 100 mm" },
  { v: "thermal-100", label: "Thermal 100 mm", sub: "100 × 150 mm" },
  { v: "custom",      label: "Custom",        sub: "Enter W × H" },
];

// ─── FontStylePanel ───────────────────────────────────────────────────────────

function ToggleBtn({
  active, onClick, children, title,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode; title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-8 w-9 flex items-center justify-center rounded border text-[13px] transition-colors ${
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function FontStylePanel({
  font, onChange,
}: {
  font: FontStyle;
  onChange: (f: FontStyle) => void;
}) {
  const set = (patch: Partial<FontStyle>) => onChange({ ...font, ...patch });
  const [sizeStr, setSizeStr] = useState(String(font.sizePt));
  const [coSizeStr, setCoSizeStr] = useState(String(font.companySizePt ?? 12));
  const [wsStr,   setWsStr  ] = useState(String(font.wordSpacingPt));
  const [scStr,   setScStr  ] = useState(String(font.scalePct));

  // Keep string state in sync when font changes from outside
  useEffect(() => { setSizeStr(String(font.sizePt)); },      [font.sizePt]);
  useEffect(() => { setCoSizeStr(String(font.companySizePt ?? 12)); }, [font.companySizePt]);
  useEffect(() => { setWsStr(String(font.wordSpacingPt)); }, [font.wordSpacingPt]);
  useEffect(() => { setScStr(String(font.scalePct)); },      [font.scalePct]);

  return (
    <div className="space-y-3 pt-1">
      {/* Row 1: Family + Name size + Company size */}
      <div className="flex gap-2">
        <select
          value={font.family}
          onChange={(e) => set({ family: e.target.value })}
          className="flex-1 h-9 rounded-md border border-input bg-background text-[13px] px-2"
          style={{ fontFamily: font.family }}
          aria-label="Font family"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
        <div className="flex flex-col gap-0.5">
          <select
            value={font.sizePt}
            onChange={(e) => { const v = Number(e.target.value); setSizeStr(String(v)); set({ sizePt: v }); }}
            className="w-16 h-[18px] rounded border border-input bg-background text-[10px] px-1"
            aria-label="Name font size"
            title="Name size (pt)"
          >
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={font.companySizePt ?? 12}
            onChange={(e) => { const v = Number(e.target.value); setCoSizeStr(String(v)); set({ companySizePt: v }); }}
            className="w-16 h-[18px] rounded border border-input bg-background text-[10px] px-1"
            aria-label="Company font size"
            title="Company size (pt)"
          >
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex justify-between text-[8px] text-muted-foreground px-0.5">
            <span>Name</span><span>Co.</span>
          </div>
        </div>
      </div>

      {/* Row 2: Alignment */}
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
          Text alignment
        </Label>
        <div className="flex gap-1.5">
          {(["left", "center", "right", "justify"] as const).map((a) => {
            const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : a === "right" ? AlignRight : AlignJustify;
            return (
              <ToggleBtn key={a} active={font.align === a} onClick={() => set({ align: a })} title={a.charAt(0).toUpperCase() + a.slice(1)}>
                <Icon className="h-3.5 w-3.5" />
              </ToggleBtn>
            );
          })}
        </div>
      </div>

      {/* Row 3: Word spacing + Scale */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Word space (pt)
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              inputMode="decimal"
              value={wsStr}
              onChange={(e) => setWsStr(e.target.value)}
              onBlur={() => {
                const v = parseFloat(wsStr);
                if (!isNaN(v)) set({ wordSpacingPt: v });
                else setWsStr(String(font.wordSpacingPt));
              }}
              className="h-8 text-[13px]"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">pt</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Scale (%)
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              inputMode="decimal"
              value={scStr}
              onChange={(e) => setScStr(e.target.value)}
              onBlur={() => {
                const v = parseFloat(scStr);
                if (!isNaN(v) && v > 0) set({ scalePct: v });
                else setScStr(String(font.scalePct));
              }}
              className="h-8 text-[13px]"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">%</span>
          </div>
        </div>
      </div>

      {/* Row 4: Style toggles + Color */}
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 block">
          Style
        </Label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ToggleBtn active={font.bold}          onClick={() => set({ bold:          !font.bold          })} title="Bold">
            <span className="font-bold">B</span>
          </ToggleBtn>
          <ToggleBtn active={font.italic}        onClick={() => set({ italic:        !font.italic        })} title="Italic">
            <span className="italic">I</span>
          </ToggleBtn>
          <ToggleBtn active={font.underline}     onClick={() => set({ underline:     !font.underline     })} title="Underline">
            <span className="underline">U</span>
          </ToggleBtn>
          <ToggleBtn active={font.strikethrough} onClick={() => set({ strikethrough: !font.strikethrough })} title="Strikethrough">
            <span className="line-through">S</span>
          </ToggleBtn>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">Color</Label>
            <input
              type="color"
              value={font.color}
              onChange={(e) => set({ color: e.target.value })}
              className="h-8 w-10 rounded border border-border cursor-pointer p-0.5 bg-background"
              aria-label="Font color"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  badges: BadgeData[];
  eventId: string;
  eventTitle?: string;
  defaultMode?: PrintMode;
}

export default function PrintBadgesDialog({
  open, onOpenChange, badges, eventId, eventTitle, defaultMode = "badge",
}: Props) {
  const p = loadPrefs();

  const [mode,        setMode       ] = useState<PrintMode >(p.mode        ?? defaultMode);
  const [size,        setSize       ] = useState<PrintSize >(p.size        ?? "a4-2up");
  const [copies,      setCopies     ] = useState<number    >(p.copies      ?? 1);
  const [cw,          setCw         ] = useState<number    >(p.cw          ?? 4);
  const [ch,          setCh         ] = useState<number    >(p.ch          ?? 3);
  const [cu,          setCu         ] = useState<PrintUnit >(p.cu          ?? "in");
  const [thermalMode, setThermalMode] = useState<boolean   >(p.thermalMode ?? false);
  const [sizes,       setSizes      ] = useState<SavedSize[]>(() => loadSizes());
  const [font,        setFont       ] = useState<FontStyle >(p.font        ?? defaultFontStyle());
  const [fontOpen,    setFontOpen   ] = useState(true);

  // Raw string values for numeric inputs — avoids mid-keystroke clamping
  const [cwStr, setCwStr] = useState(String(p.cw ?? 4));
  const [chStr, setChStr] = useState(String(p.ch ?? 3));

  useEffect(() => { setCwStr(String(cw)); }, [cw]);
  useEffect(() => { setChStr(String(ch)); }, [ch]);

  useEffect(() => {
    if (!open) return;
    const prefs = loadPrefs();
    setMode(defaultMode ?? prefs.mode ?? "badge");
    setSize(prefs.size ?? "a4-2up");
    const pCopies = prefs.copies ?? 1;
    const pCw = prefs.cw ?? 4;
    const pCh = prefs.ch ?? 3;
    const pCu = prefs.cu ?? "in";
    setCopies(pCopies);
    setCw(pCw); setCwStr(String(pCw));
    setCh(pCh); setChStr(String(pCh));
    setCu(pCu);
    setThermalMode(prefs.thermalMode ?? false);
    setFont(prefs.font ?? defaultFontStyle());
    setSizes(loadSizes());
  }, [open, defaultMode]);

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      mode, size, copies, cw, ch, cu, thermalMode, font,
    }));
  }, [mode, size, copies, cw, ch, cu, thermalMode, font]);

  const dims = useMemo(
    () => badgeSizeMm(size, { width: cw, height: ch, unit: cu }),
    [size, cw, ch, cu],
  );
  const total = badges.length * copies;
  const isThermalSize = size.startsWith("thermal-");

  // ── Print ──────────────────────────────────────────────────────────────────

  const runPrint = async (rows: BadgeData[]) => {
    try {
      await printBadges(rows, {
        mode, size, copies, eventTitle,
        custom: size === "custom" ? { width: cw, height: ch, unit: cu } : undefined,
        thermalMode: thermalMode || isThermalSize,
        font,
      });
    } catch (err) {
      if ((err as Error).message === "popup-blocked") {
        toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to print badges." });
      } else {
        toast.error("Failed to open print preview");
      }
    }
  };

  const handlePrint     = async () => { await runPrint(badges); onOpenChange(false); };
  const handleTestPrint = async () => {
    const sample = badges[0] ?? {
      name: "Jane Doe", email: "jane@example.com", company: "Acme Inc.",
      ticket_type: "general", qr_payload: "TEST-CODE", event_title: eventTitle,
    };
    await runPrint([sample]);
  };

  // ── Custom size presets ────────────────────────────────────────────────────

  const matchingSizeIdx = sizes.findIndex((s) => s.w === cw && s.h === ch && s.unit === cu);

  const saveCurrentSize = () => {
    const name = window.prompt("Name this size", `${cw}×${ch} ${cu}`);
    if (!name?.trim()) return;
    const next = [...sizes, { name: name.trim(), w: cw, h: ch, unit: cu }];
    setSizes(next); saveSizes(next);
    toast.success("Size saved");
  };

  const applyPreset = (s: SavedSize) => {
    setCw(s.w); setCwStr(String(s.w));
    setCh(s.h); setChStr(String(s.h));
    setCu(s.unit); setSize("custom");
  };

  const deletePreset = (i: number) => {
    const next = sizes.filter((_, idx) => idx !== i);
    setSizes(next); saveSizes(next);
  };

  // ── Live preview ──────────────────────────────────────────────────────────

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const refreshPreview = useMemo(
    () => async () => {
      setPreviewLoading(true);
      try {
        const sample = badges[0] ?? {
          name: "Jane Doe", email: "jane@example.com", company: "Acme Inc.",
          ticket_type: "general", qr_payload: "PREVIEW", event_title: eventTitle,
        };
        const html = await buildPrintHtml([sample], {
          mode, size, copies: 1, eventTitle,
          custom: size === "custom" ? { width: cw, height: ch, unit: cu } : undefined,
          thermalMode: thermalMode || isThermalSize,
          font,
        });
        setPreviewHtml(html);
      } finally {
        setPreviewLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, size, cw, ch, cu, thermalMode, isThermalSize, font, eventTitle, badges],
  );

  // Refresh preview when key settings change (debounced 400ms)
  useEffect(() => {
    if (!previewOpen) return;
    const t = setTimeout(() => { void refreshPreview(); }, 400);
    return () => clearTimeout(t);
  }, [refreshPreview, previewOpen]);

  // Write HTML into the iframe when it changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHtml) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden">

        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0 space-y-0.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" /> Print settings
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {badges.length} attendee{badges.length === 1 ? "" : "s"} selected
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* TYPE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Type</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as PrintMode)} className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <label key={opt.v} className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${mode === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                  <RadioGroupItem value={opt.v} className="sr-only" />
                  <div className="text-[13px] font-medium leading-tight">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{opt.sub}</div>
                </label>
              ))}
            </RadioGroup>
          </section>

          {/* FONT STYLE */}
          <section className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setFontOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-[12px] font-semibold">Font Style</span>
              {fontOpen
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {fontOpen && (
              <div className="px-3 pb-3 pt-1">
                <FontStylePanel font={font} onChange={setFont} />
              </div>
            )}
          </section>

          {/* LABEL SIZE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Label size</Label>
            <RadioGroup value={size} onValueChange={(v) => setSize(v as PrintSize)} className="grid grid-cols-2 gap-2">
              {SIZE_OPTIONS.map((opt) => (
                <label key={opt.v} className={`border rounded-lg px-3 py-2 cursor-pointer transition-colors ${size === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                  <RadioGroupItem value={opt.v} className="sr-only" />
                  <div className="text-[13px] font-medium leading-tight">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{opt.sub}</div>
                </label>
              ))}
            </RadioGroup>

            {size === "custom" && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end border border-border rounded-lg p-3 bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Width</Label>
                    <Input type="text" inputMode="decimal" value={cwStr}
                      onChange={(e) => setCwStr(e.target.value)}
                      onBlur={() => { const v = parseFloat(cwStr); if (!isNaN(v) && v > 0) setCw(v); else setCwStr(String(cw)); }}
                      className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Height</Label>
                    <Input type="text" inputMode="decimal" value={chStr}
                      onChange={(e) => setChStr(e.target.value)}
                      onBlur={() => { const v = parseFloat(chStr); if (!isNaN(v) && v > 0) setCh(v); else setChStr(String(ch)); }}
                      className="h-8 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit</Label>
                    <select value={cu} onChange={(e) => setCu(e.target.value as PrintUnit)}
                      className="h-8 text-[13px] border border-input bg-background rounded-md px-2">
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-[12px]" onClick={saveCurrentSize}>
                    <Plus className="h-3 w-3" /> Save
                  </Button>
                </div>
                {sizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {sizes.map((s, i) => (
                      <div key={i} className={`group inline-flex items-center gap-1 border rounded-full pl-2.5 pr-1 py-0.5 text-[11px] ${i === matchingSizeIdx ? "border-primary bg-primary/5 text-primary" : "border-border bg-background"}`}>
                        <button type="button" onClick={() => applyPreset(s)} className="font-medium">
                          {s.name} <span className="text-muted-foreground font-normal">· {s.w}×{s.h} {s.unit}</span>
                        </button>
                        <button type="button" onClick={() => deletePreset(i)} className="opacity-50 hover:opacity-100 p-0.5" aria-label="Delete saved size">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {size !== "custom" && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Badge dimensions: {dims.w.toFixed(0)} × {dims.h.toFixed(0)} mm
              </p>
            )}
          </section>

          {/* PREVIEW */}
          <section className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-[12px] font-semibold">Preview</span>
              <div className="flex items-center gap-1.5">
                {previewLoading && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
                {previewOpen
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {previewOpen && (
              <div className="relative bg-muted/20 flex items-center justify-center p-3 min-h-[140px]">
                {previewHtml ? (
                  <iframe
                    ref={iframeRef}
                    title="Badge preview"
                    className="rounded border border-border/50 shadow-sm bg-white"
                    style={{ width: "100%", height: "180px", border: "none" }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Generating preview…
                  </div>
                )}
              </div>
            )}
          </section>

          {/* COPIES */}
          <section>
            <Label htmlFor="copies" className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Copies per attendee</Label>
            <Input
              id="copies" type="number" min={1} max={10} value={copies}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setCopies(Math.max(1, Math.min(10, v))); }}
              className="h-8 w-28 text-[13px]"
            />
          </section>

          {/* THERMAL MODE */}
          <section className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox checked={thermalMode} onCheckedChange={(v) => setThermalMode(!!v)} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-[12px] font-medium">Thermal printer mode</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Strips backgrounds and colours. Use with USB or Bluetooth thermal printers for crisp black-and-white output.
                </div>
              </div>
            </label>
            {(thermalMode || isThermalSize) && (
              <p className="text-[10.5px] text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
                <strong className="text-foreground">In the browser print dialog:</strong>{" "}
                choose your printer, set Margins to <em>None</em>, Scale to <em>100%</em>, and disable Headers and footers.
              </p>
            )}
          </section>

        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-between gap-2 flex-wrap">
          <span className="text-[12px] text-muted-foreground self-center">
            <span className="font-medium text-foreground">{total}</span>{" "}label{total === 1 ? "" : "s"} total
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={handleTestPrint} className="gap-1.5 text-[12px]">
              <FlaskConical className="h-3.5 w-3.5" /> Test print
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handlePrint} disabled={badges.length === 0} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
