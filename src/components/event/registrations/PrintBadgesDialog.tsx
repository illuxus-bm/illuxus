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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Printer, Trash2, Plus, FlaskConical,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, RefreshCw,
  Download, ChevronDown, FileText, FileImage, RotateCcw, Save, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  buildPrintHtml, printBadges, printCalibration, normalizePrintSize, DEFAULT_PRINT_SIZE,
  DEFAULT_BAND_COLORS, sanitizeBandColors, bandTextColor, type BandColors,
  type BadgeData, type PrintMode, type PrintOptions, type PrintSize, type PrintUnit,
} from "@/lib/print-badges";
import { downloadBadges, type BadgeExportFormat } from "@/lib/badge-export";
import { loadBandPresets, saveBandPresets, sameBandColors, type BandColorPreset } from "@/lib/badge-band-presets";
import type { FitWarning } from "@/lib/fit-engine";
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
  /** Print the attendee's check-in QR code under the company name. */
  showQr?: boolean;
  /** Participant band colours last used (validated on load). */
  bandColors?: BandColors;
  /** Thermal print-head DPI — see `PrintOptions.thermalDpi` in
   *  `print-badges.ts`. Persisted per browser so an organizer with a
   *  specific printer doesn't re-pick it every session. */
  thermalDpi: 203 | 300;
  /**
   * Per-printer hardware-margin compensation, in millimeters. Populated
   * by the organizer after printing the calibration sheet: `topMm` shifts
   * every badge DOWN by that many mm; `leftMm` shifts it RIGHT. Applied
   * only when thermal mode is active. Existing prefs blobs without this
   * field load as `undefined` and preserve today's rendering behavior
   * (bugfix.md 3.1).
   */
  thermalOffset?: { topMm: number; leftMm: number };
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
  { v: "thermal-4x5", label: "4 × 5 in",       sub: "101.6 × 127 mm · label printer (default)" },
  { v: "thermal-4x6", label: "4 × 6 in",       sub: "101.6 × 152.4 mm · helett H30C, Dymo 4XL" },
  { v: "a6",          label: "A6",             sub: "105 × 148 mm · badge-holder insert" },
  { v: "a4-4up",      label: "A4 · 4 per sheet", sub: "105 × 148 mm · office printer, cut to size" },
  { v: "custom",      label: "Custom",         sub: "Enter W × H" },
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
      {/* Row 1: Family, then name / company sizes */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Font</Label>
        <select
          value={font.family}
          onChange={(e) => set({ family: e.target.value })}
          className="w-full h-9 rounded-md border border-input bg-background text-[13px] px-2"
          style={{ fontFamily: font.family }}
          aria-label="Font family"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name size (pt)</Label>
          <select
            value={font.sizePt}
            onChange={(e) => { const v = Number(e.target.value); setSizeStr(String(v)); set({ sizePt: v }); }}
            className="w-full h-9 rounded-md border border-input bg-background text-[13px] px-2"
            aria-label="Name font size"
          >
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Company size (pt)</Label>
          <select
            value={font.companySizePt ?? 12}
            onChange={(e) => { const v = Number(e.target.value); setCoSizeStr(String(v)); set({ companySizePt: v }); }}
            className="w-full h-9 rounded-md border border-input bg-background text-[13px] px-2"
            aria-label="Company font size"
          >
            {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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

// ─── BandColorsPanel ──────────────────────────────────────────────────────────

const BAND_ROWS: { key: keyof BandColors; label: string; hint: string }[] = [
  { key: "attendee", label: "Attendee", hint: "Attendees and named ticket types" },
  { key: "speaker",  label: "Speaker",  hint: "Speakers" },
  { key: "partner",  label: "Partner",  hint: "Sponsors and partners" },
];

function BandColorsPanel({
  colors, onChange, presets, onPresetsChange,
}: {
  colors: BandColors;
  onChange: (c: BandColors) => void;
  presets: BandColorPreset[];
  onPresetsChange: (p: BandColorPreset[]) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [hexDraft, setHexDraft] = useState<BandColors>(colors);
  useEffect(() => { setHexDraft(colors); }, [colors]);

  const isDefault = sameBandColors(colors, DEFAULT_BAND_COLORS);
  const savePreset = () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const next = [...presets.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase()), { name: trimmed, colors }];
    onPresetsChange(next);
    setNaming(false);
    setName("");
    toast.success(`Saved preset "${trimmed}"`);
  };

  const chip = (label: string, c: BandColors, active: boolean, onApply: () => void, onDelete?: () => void) => (
    <div
      key={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2 py-1 text-[12px] transition-colors",
        active ? "border-primary bg-primary/5 text-primary" : "border-border bg-background hover:bg-muted/50",
      )}
    >
      <button type="button" onClick={onApply} className="inline-flex items-center gap-1.5 font-medium">
        <span className="flex -space-x-1">
          {(["attendee", "speaker", "partner"] as const).map((k) => (
            <span key={k} className="h-3.5 w-3.5 rounded-full border border-background" style={{ background: c[k] }} />
          ))}
        </span>
        {label}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} className="opacity-50 hover:opacity-100" aria-label={`Delete preset ${label}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {BAND_ROWS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center gap-3">
            <div
              className="flex-1 min-w-0 h-9 rounded-md flex items-center justify-center text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ background: colors[key], color: bandTextColor(colors[key]) }}
              title={hint}
            >
              {label}
            </div>
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
              className="h-9 w-10 shrink-0 rounded-md border border-border cursor-pointer p-0.5 bg-background"
              aria-label={`${label} band colour`}
            />
            <Input
              value={hexDraft[key]}
              onChange={(e) => setHexDraft({ ...hexDraft, [key]: e.target.value })}
              onBlur={() => {
                const v = hexDraft[key].trim();
                const hex = v.startsWith("#") ? v : `#${v}`;
                const next = sanitizeBandColors({ ...colors, [key]: hex });
                if (next[key] === hex.toLowerCase()) onChange(next);
                else setHexDraft(colors);
              }}
              className="h-9 w-[92px] shrink-0 font-mono text-[12px] uppercase"
              aria-label={`${label} band colour hex`}
              maxLength={7}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Presets</div>
        <div className="flex flex-wrap gap-1.5">
          {chip("Default", DEFAULT_BAND_COLORS, isDefault, () => onChange(DEFAULT_BAND_COLORS))}
          {presets.map((p, i) =>
            chip(
              p.name,
              p.colors,
              sameBandColors(colors, p.colors),
              () => onChange(p.colors),
              () => onPresetsChange(presets.filter((_, idx) => idx !== i)),
            ),
          )}
        </div>
        {naming ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); savePreset(); }
                if (e.key === "Escape") { setNaming(false); setName(""); }
              }}
              placeholder="Preset name, e.g. CFO Connect"
              className="h-9 text-[13px]"
              maxLength={40}
            />
            <Button size="sm" className="h-9" onClick={savePreset} disabled={!name.trim()}>Save</Button>
            <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => { setNaming(false); setName(""); }} aria-label="Cancel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={() => setNaming(true)}>
              <Save className="h-3.5 w-3.5" /> Save as preset
            </Button>
            {!isDefault && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px]" onClick={() => onChange(DEFAULT_BAND_COLORS)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        )}
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
  const [size,        setSize       ] = useState<PrintSize >(normalizePrintSize(p.size));
  const [copies,      setCopies     ] = useState<number    >(p.copies      ?? 1);
  const [cw,          setCw         ] = useState<number    >(p.cw          ?? 4);
  const [ch,          setCh         ] = useState<number    >(p.ch          ?? 3);
  const [cu,          setCu         ] = useState<PrintUnit >(p.cu          ?? "in");
  const [thermalMode, setThermalMode] = useState<boolean   >(p.thermalMode ?? false);
  const [showQr,      setShowQr     ] = useState<boolean   >(p.showQr      ?? false);
  const [bandColors,  setBandColors ] = useState<BandColors>(sanitizeBandColors(p.bandColors));
  const [bandPresets, setBandPresets] = useState<BandColorPreset[]>(() => loadBandPresets());
  const updateBandPresets = (next: BandColorPreset[]) => { setBandPresets(next); saveBandPresets(next); };
  // Phones show one pane at a time; md+ shows settings and preview side by side.
  const [mobilePane, setMobilePane] = useState<"settings" | "preview">("settings");
  const [thermalDpi,  setThermalDpi ] = useState<203 | 300 >(p.thermalDpi  ?? 203);
  const [thermalOffsetTop, setThermalOffsetTop] = useState<number>(p.thermalOffset?.topMm ?? 0);
  const [thermalOffsetLeft, setThermalOffsetLeft] = useState<number>(p.thermalOffset?.leftMm ?? 0);
  const [sizes,       setSizes      ] = useState<SavedSize[]>(() => loadSizes());
  const [font,        setFont       ] = useState<FontStyle >(p.font        ?? defaultFontStyle());
  // Fit warnings surfaced from the last `buildPrintHtml` preview run. Empty
  // by default; populated when the fit engine had to shrink or hard-break a
  // value (bugfix.md 2.4).
  const [previewWarnings, setPreviewWarnings] = useState<FitWarning[]>([]);
  // Raw string state for thermal-offset inputs — same pattern as other
  // numeric fields in this dialog to avoid mid-keystroke clamping.
  const [thermalOffsetTopStr,  setThermalOffsetTopStr ] = useState(String(p.thermalOffset?.topMm  ?? 0));
  const [thermalOffsetLeftStr, setThermalOffsetLeftStr] = useState(String(p.thermalOffset?.leftMm ?? 0));

  // Raw string values for numeric inputs — avoids mid-keystroke clamping
  const [cwStr, setCwStr] = useState(String(p.cw ?? 4));
  const [chStr, setChStr] = useState(String(p.ch ?? 3));

  useEffect(() => { setCwStr(String(cw)); }, [cw]);
  useEffect(() => { setChStr(String(ch)); }, [ch]);

  useEffect(() => {
    if (!open) return;
    const prefs = loadPrefs();
    setMode(defaultMode ?? prefs.mode ?? "badge");
    setSize(normalizePrintSize(prefs.size ?? DEFAULT_PRINT_SIZE));
    const pCopies = prefs.copies ?? 1;
    const pCw = prefs.cw ?? 4;
    const pCh = prefs.ch ?? 3;
    const pCu = prefs.cu ?? "in";
    setCopies(pCopies);
    setCw(pCw); setCwStr(String(pCw));
    setCh(pCh); setChStr(String(pCh));
    setCu(pCu);
    setThermalMode(prefs.thermalMode ?? false);
    setShowQr(prefs.showQr ?? false);
    setBandColors(sanitizeBandColors(prefs.bandColors));
    setBandPresets(loadBandPresets());
    setMobilePane("settings");
    setThermalDpi(prefs.thermalDpi ?? 203);
    const offTop = prefs.thermalOffset?.topMm ?? 0;
    const offLeft = prefs.thermalOffset?.leftMm ?? 0;
    setThermalOffsetTop(offTop); setThermalOffsetTopStr(String(offTop));
    setThermalOffsetLeft(offLeft); setThermalOffsetLeftStr(String(offLeft));
    setFont(prefs.font ?? defaultFontStyle());
    setSizes(loadSizes());
  }, [open, defaultMode]);

  useEffect(() => {
    // Only persist thermalOffset when either component is non-zero — keeps
    // existing prefs blobs identical for the common "no offset needed" case.
    const thermalOffset =
      thermalOffsetTop !== 0 || thermalOffsetLeft !== 0
        ? { topMm: thermalOffsetTop, leftMm: thermalOffsetLeft }
        : undefined;
    localStorage.setItem(PREF_KEY, JSON.stringify({
      mode, size, copies, cw, ch, cu, thermalMode, showQr, bandColors, thermalDpi, thermalOffset, font,
    }));
  }, [mode, size, copies, cw, ch, cu, thermalMode, showQr, bandColors, thermalDpi, thermalOffsetTop, thermalOffsetLeft, font]);

  const dims = useMemo(
    () => badgeSizeMm(size, { width: cw, height: ch, unit: cu }),
    [size, cw, ch, cu],
  );
  const total = badges.length * copies;
  const isThermalSize = size.startsWith("thermal-") || size === "custom";

  // ── Print ──────────────────────────────────────────────────────────────────

  // One options object for print, preview and download, so a downloaded
  // badge is exactly what would print.
  const printOptions = useMemo<PrintOptions>(() => {
    const thermalActive = thermalMode || isThermalSize;
    return {
      mode, size, copies, eventTitle,
      custom: size === "custom" ? { width: cw, height: ch, unit: cu } : undefined,
      thermalMode,
      showQr,
      bandColors,
      thermalDpi: thermalActive ? thermalDpi : undefined,
      thermalOffset:
        thermalActive && (thermalOffsetTop !== 0 || thermalOffsetLeft !== 0)
          ? { topMm: thermalOffsetTop, leftMm: thermalOffsetLeft }
          : undefined,
      font,
    };
  }, [mode, size, copies, eventTitle, cw, ch, cu, thermalMode, isThermalSize, showQr, bandColors, thermalDpi, thermalOffsetTop, thermalOffsetLeft, font]);

  const runPrint = async (rows: BadgeData[]) => {
    try {
      await printBadges(rows, printOptions);
    } catch (err) {
      if ((err as Error).message === "popup-blocked") {
        toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to print badges." });
      } else {
        toast.error("Failed to open print preview");
      }
    }
  };

  const handleCalibrationPrint = async () => {
    try {
      await printCalibration({
        size,
        custom: size === "custom" ? { width: cw, height: ch, unit: cu } : undefined,
        thermalDpi: (thermalMode || isThermalSize) ? thermalDpi : undefined,
      });
    } catch (err) {
      if ((err as Error).message === "popup-blocked") {
        toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to print the calibration sheet." });
      } else {
        toast.error("Failed to open calibration print");
      }
    }
  };

  const handlePrint     = async () => { await runPrint(badges); onOpenChange(false); };

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async (format: BadgeExportFormat) => {
    if (badges.length === 0 || downloading) return;
    setDownloading(true);
    const label = format === "pdf" ? "PDF" : "JPG";
    const id = toast.loading(`Preparing ${label}…`, {
      description: badges.length > 1 ? `0 of ${badges.length} badges` : undefined,
    });
    try {
      await downloadBadges(badges, printOptions, format, (done, totalBadges) => {
        if (totalBadges > 1) {
          toast.loading(`Preparing ${label}…`, { id, description: `${done} of ${totalBadges} badges` });
        }
      });
      toast.success(`${label} downloaded`, {
        id,
        description: format === "jpg" && badges.length > 1 ? "Saved as a ZIP of JPG files." : undefined,
      });
    } catch (err) {
      toast.error(`Couldn't create the ${label}`, {
        id,
        description: (err as Error)?.message || "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };
  const handleTestPrint = async () => {
    const sample = badges[0] ?? {
      name: "Jane Doe", email: "jane@example.com", company: "Acme Inc.",
      ticket_type: "general", participant_type: "Attendee", qr_payload: "TEST-CODE", event_title: eventTitle,
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

  // The parent rebuilds `badges` on every render (e.g. each realtime
  // registration update). Key the preview on the sample's content instead of
  // the array's identity, otherwise every parent render rebuilt the preview
  // and rewrote the iframe, re-fetching the banner and fonts each time.
  const sampleKey = JSON.stringify(badges[0] ?? null);
  const sample = useMemo<BadgeData>(
    () => badges[0] ?? {
      name: "Jane Doe", email: "jane@example.com", company: "Acme Inc.",
      ticket_type: "general", participant_type: "Attendee", qr_payload: "PREVIEW", event_title: eventTitle,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sampleKey, eventTitle],
  );

  const refreshPreview = useMemo(
    () => async () => {
      setPreviewLoading(true);
      try {
        // previewFit scales the badge down so the WHOLE label is visible
        // inside the preview pane instead of being cropped at physical size.
        const { html, warnings } = await buildPrintHtml([sample], { ...printOptions, copies: 1, previewFit: true });
        setPreviewHtml(html);
        setPreviewWarnings(warnings);
      } finally {
        setPreviewLoading(false);
      }
    },
    [sample, printOptions],
  );

  // Last HTML written into the current iframe — reset when the dialog closes
  // because the iframe is unmounted with it.
  const writtenHtmlRef = useRef("");
  useEffect(() => {
    if (!open) writtenHtmlRef.current = "";
  }, [open]);

  // Warm the browser cache with the banner as soon as the dialog opens.
  useEffect(() => {
    if (open && sample.banner_url) new Image().src = sample.banner_url;
  }, [open, sample.banner_url]);

  // Render immediately on open; debounce later setting changes. Nothing is
  // rendered while the dialog is closed.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void refreshPreview(); }, writtenHtmlRef.current ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, refreshPreview]);

  // Write HTML into the iframe when it changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!open || !iframe || !previewHtml || previewHtml === writtenHtmlRef.current) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    writtenHtmlRef.current = previewHtml;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [open, previewHtml]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:h-auto sm:max-h-[94vh] sm:w-[96vw] sm:max-w-6xl sm:rounded-lg sm:border">

        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border shrink-0 space-y-0.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base pr-8">
            <Printer className="h-4 w-4" /> Print badges
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {badges.length} attendee{badges.length === 1 ? "" : "s"} selected · {total} label{total === 1 ? "" : "s"}
          </DialogDescription>
          {/* Phone-only pane switcher */}
          <div className="md:hidden grid grid-cols-2 gap-1 p-1 mt-3 bg-muted rounded-lg" role="tablist" aria-label="Print dialog view">
            {(["settings", "preview"] as const).map((pane) => (
              <button
                key={pane}
                type="button"
                role="tab"
                aria-selected={mobilePane === pane}
                onClick={() => setMobilePane(pane)}
                className={cn(
                  "h-8 rounded-md text-[13px] font-medium transition-colors",
                  mobilePane === pane ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {pane === "settings" ? "Settings" : "Preview"}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">

          {/* LEFT — settings (scrollable) */}
          <div className={cn(
            "overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5 md:border-r border-border min-h-0",
            mobilePane !== "settings" && "max-md:hidden",
          )}>

          {/* TYPE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Type</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as PrintMode)} className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                // `relative` is REQUIRED: RadioGroupItem is `sr-only`, which is
                // `position:absolute`. Without a positioned ancestor the radio
                // escapes to the `fixed` DialogContent, so its box detaches
                // from this card and stops scrolling with the settings pane.
                // Radix focuses that radio on selection, and the browser then
                // scrolls the pane to reveal the off-screen phantom — the whole
                // dialog appears to jump. Keeping the radio inside the label
                // box prevents it.
                <label key={opt.v} className={`relative border rounded-lg px-3 py-2 cursor-pointer transition-colors ${mode === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                  <RadioGroupItem value={opt.v} className="sr-only" />
                  <div className="text-[13px] font-medium leading-tight">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{opt.sub}</div>
                </label>
              ))}
            </RadioGroup>
          </section>

          {/* LABEL SIZE */}
          <section>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">Label size</Label>
            <RadioGroup value={size} onValueChange={(v) => setSize(v as PrintSize)} className="grid grid-cols-2 gap-2">
              {SIZE_OPTIONS.map((opt) => (
                // `relative` required — see the TYPE_OPTIONS comment above.
                <label key={opt.v} className={`relative border rounded-lg px-3 py-2 cursor-pointer transition-colors ${size === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
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

          {/* PARTICIPANT BAND COLOURS — default badge layout only */}
          {mode === "badge" && (
            <section className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border">
                <span className="text-[12px] font-semibold">Participant band colours</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">The strip at the bottom of the badge. Saved for next time.</p>
              </div>
              <div className="p-3">
                <BandColorsPanel
                  colors={bandColors}
                  onChange={(c) => setBandColors(sanitizeBandColors(c))}
                  presets={bandPresets}
                  onPresetsChange={updateBandPresets}
                />
              </div>
            </section>
          )}

          {/* QR CODE */}
          <section>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox checked={showQr} onCheckedChange={(v) => setShowQr(!!v)} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-[12px] font-medium">Include check-in QR code</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Adds the attendee's QR under their company so staff can scan badges at the door.
                </div>
              </div>
            </label>
          </section>

          {/* FONT STYLE */}
          <section className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 border-b border-border">
              <span className="text-[12px] font-semibold">Font Style</span>
            </div>
            <div className="px-3 pb-3 pt-1">
              <FontStylePanel font={font} onChange={setFont} />
            </div>
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
                <div className="text-[12px] font-medium">Black &amp; white (thermal printer)</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Converts the banner to greyscale and prints the participant band in black. Use with monochrome thermal printers.
                </div>
              </div>
            </label>

            {(thermalMode || isThermalSize) && (
              <>
                {/* PRINT-HEAD DPI (thermal only). Matching this to the printer's
                    physical head resolution makes QR codes render dot-for-dot
                    without downsampling, which fixes the most common "QR won't
                    scan" and blurry-text symptoms on 4×6 direct-thermal
                    printers. */}
                <div className="border-t border-border/50 pt-2 space-y-1">
                  <Label className="text-[10.5px] font-medium">Print-head DPI</Label>
                  <RadioGroup
                    value={String(thermalDpi)}
                    onValueChange={(v) => setThermalDpi(Number(v) as 203 | 300)}
                    className="grid grid-cols-2 gap-2"
                  >
                    {/* `relative` required — see the TYPE_OPTIONS comment above.
                        This is the group where the jump was reported: switching
                        203 -> 300 DPI focused a radio whose phantom box sat
                        ~512px below its card, yanking the settings pane. */}
                    <label
                      className={`relative border rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${thermalDpi === 203 ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                    >
                      <RadioGroupItem value="203" className="sr-only" />
                      <div className="text-[12px] font-medium leading-tight">203 DPI</div>
                      <div className="text-[10.5px] text-muted-foreground leading-tight">helett H30C, Dymo, Zebra ZP450</div>
                    </label>
                    {/* `relative` required — see the TYPE_OPTIONS comment above. */}
                    <label
                      className={`relative border rounded-lg px-3 py-1.5 cursor-pointer transition-colors ${thermalDpi === 300 ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                    >
                      <RadioGroupItem value="300" className="sr-only" />
                      <div className="text-[12px] font-medium leading-tight">300 DPI</div>
                      <div className="text-[10.5px] text-muted-foreground leading-tight">Zebra ZD421, TSC TX300</div>
                    </label>
                  </RadioGroup>
                </div>

                <p className="text-[10.5px] text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
                  <strong className="text-foreground">In the browser print dialog:</strong>{" "}
                  select your thermal printer, set Margins to <em>None</em>, Scale to <em>100%</em>, disable Headers and footers, and confirm the paper size matches your label (e.g. <em>4×6 in</em> for the helett H30C).
                </p>

                {/* CALIBRATION — prints a known-dimension test sheet so the
                    organizer can measure their actual output vs. requested. */}
                <div className="border-t border-border/50 pt-2 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium">Not printing at the right size?</div>
                      <div className="text-[10.5px] text-muted-foreground leading-snug mt-0.5">
                        Print a calibration sheet, measure the outer frame with a ruler, and
                        set the browser print dialog's <em>Scale</em> to <em>(requested ÷ measured) × 100%</em>.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCalibrationPrint}
                      className="h-8 gap-1.5 text-[11px] shrink-0"
                      title="Prints a labelled 50mm ruler + 25mm reference QR so you can verify the printer output"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      Calibration print
                    </Button>
                  </div>
                </div>

                {/* THERMAL HARDWARE-MARGIN OFFSET — bugfix.md 2.11.
                    Thermal print heads have small unprintable strips at the
                    edges that the browser cannot see. After running the
                    calibration print above, the organizer measures how far
                    the frame sits from the physical label edge on the top
                    and left sides, and enters those millimeter values here.
                    The badge renderer then shifts content DOWN and RIGHT by
                    that amount so the printed result lands centered on the
                    physical label. Leaving both at 0 preserves the current
                    (uncompensated) rendering. */}
                <div className="border-t border-border/50 pt-2 space-y-1.5">
                  <div className="text-[11px] font-medium">Thermal offset (measured)</div>
                  <div className="text-[10.5px] text-muted-foreground leading-snug">
                    After the calibration print, measure the gap between the outer frame
                    and the physical label edge and enter the values in millimeters. Use
                    positive numbers to shift content down / right; zero leaves the
                    print uncompensated.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Top offset (mm)
                      </Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={thermalOffsetTopStr}
                        onChange={(e) => setThermalOffsetTopStr(e.target.value)}
                        onBlur={() => {
                          const v = parseFloat(thermalOffsetTopStr);
                          if (!isNaN(v)) setThermalOffsetTop(v);
                          else setThermalOffsetTopStr(String(thermalOffsetTop));
                        }}
                        className="h-8 text-[13px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Left offset (mm)
                      </Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={thermalOffsetLeftStr}
                        onChange={(e) => setThermalOffsetLeftStr(e.target.value)}
                        onBlur={() => {
                          const v = parseFloat(thermalOffsetLeftStr);
                          if (!isNaN(v)) setThermalOffsetLeft(v);
                          else setThermalOffsetLeftStr(String(thermalOffsetLeft));
                        }}
                        className="h-8 text-[13px]"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          </div>

          {/* RIGHT — live preview (full height) */}
          <div className={cn(
            "flex flex-col bg-muted/20 min-h-0",
            mobilePane !== "preview" && "max-md:hidden",
          )}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/60 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold">Live preview</span>
                {previewLoading && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {dims.w.toFixed(0)} × {dims.h.toFixed(0)} mm
              </span>
            </div>
            {/* Fit warnings — bugfix.md 2.4. Surfaces every value the fit
                engine had to shrink to its legibility floor or hard-break
                at the grapheme boundary. Empty on short-fit inputs so this
                pill never appears when nothing was reflowed. */}
            {previewWarnings.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-amber-50 dark:bg-amber-950/30 space-y-1 shrink-0">
                <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                  Some text was shrunk to fit
                </div>
                <ul className="text-[10.5px] text-amber-900/80 dark:text-amber-200/80 space-y-0.5">
                  {previewWarnings.slice(0, 5).map((w, i) => (
                    <li key={`${w.role}-${i}`} className="leading-tight">
                      <span className="font-medium">{w.role}</span>
                      {w.reason === "hardBreak" ? " — hard-broken at grapheme boundary" : " — reduced to legibility floor"}
                      {": "}
                      <span className="italic">
                        {w.text.length > 40 ? `${w.text.slice(0, 40)}…` : w.text}
                      </span>
                    </li>
                  ))}
                  {previewWarnings.length > 5 && (
                    <li className="text-amber-900/60 dark:text-amber-200/60 italic">
                      …and {previewWarnings.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex-1 min-h-0 p-4 flex items-stretch justify-stretch overflow-hidden">
              {previewHtml ? (
                <iframe
                  ref={iframeRef}
                  title="Badge preview"
                  className="rounded border border-border/50 shadow-sm bg-white w-full h-full"
                  style={{ border: "none" }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Generating preview…
                </div>
              )}
            </div>
          </div>

        </div>

        <DialogFooter className="px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border bg-background sm:bg-muted/30 shrink-0 flex-col sm:flex-row sm:justify-between gap-2 sm:space-x-0">
          <span className="hidden sm:block text-[12px] text-muted-foreground self-center">
            <span className="font-medium text-foreground">{total}</span>{" "}label{total === 1 ? "" : "s"} total
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button size="sm" variant="outline" onClick={handleTestPrint} className="h-10 sm:h-9 gap-1.5 text-[13px] sm:text-[12px] sm:border-transparent sm:bg-transparent sm:shadow-none sm:hover:bg-accent">
              <FlaskConical className="h-3.5 w-3.5" /> Test print
            </Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="hidden sm:inline-flex">Cancel</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={badges.length === 0 || downloading} className="h-10 sm:h-9 gap-1.5">
                  {downloading
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />}
                  Download
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => void handleDownload("pdf")} className="gap-2 text-[13px]">
                  <FileText className="h-3.5 w-3.5" /> Save as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleDownload("jpg")} className="gap-2 text-[13px]">
                  <FileImage className="h-3.5 w-3.5" /> Save as JPG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={handlePrint} disabled={badges.length === 0} className="col-span-2 h-11 sm:h-9 gap-1.5 text-[14px] sm:text-[13px]">
              <Printer className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Print {total > 1 ? `${total} badges` : "badge"}
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
