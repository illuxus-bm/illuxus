import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Printer, Upload, Trash2, Plus,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  printBadges, type BadgeData, type PrintMode, type PrintSize, type PrintUnit,
} from "@/lib/print-badges";
import {
  loadDesign, saveDesign, loadSizes, saveSizes, fileToDataUrl, badgeSizeMm,
  type BadgeDesign, type SavedSize,
  type NameDesignId,
} from "@/lib/badge-design";
import BadgeDesignEditor from "./BadgeDesignEditor";

const PREF_KEY = "lovable.print-badges.v1";
type Prefs = { mode: PrintMode; size: PrintSize; copies: number; cw: number; ch: number; cu: PrintUnit; thermalMode: boolean };

function loadPrefs(): Partial<Prefs> {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  badges: BadgeData[];
  eventId: string;
  eventTitle?: string;
  defaultMode?: PrintMode;
}

const TYPE_OPTIONS: { v: PrintMode; t: string; d: string }[] = [
  { v: "badge", t: "Badge", d: "Designable card" },
  { v: "name",  t: "Name only", d: "Name + company" },
];

const SIZE_OPTIONS: { v: PrintSize; t: string; d: string }[] = [
  { v: "a6",          t: "A6 single",     d: "1/page" },
  { v: "a4-2up",      t: "A4 · 2-up",     d: "2/page" },
  { v: "avery-3x8",   t: "Avery 3×8",     d: "24/sheet" },
  { v: "thermal-50",  t: "Thermal 50mm",  d: "50 × 80 mm" },
  { v: "thermal-58",  t: "Thermal 58mm",  d: "58 × 80 mm" },
  { v: "thermal-80",  t: "Thermal 80mm",  d: "80 × 100 mm" },
  { v: "thermal-100", t: "Thermal 100mm", d: "100 × 150 mm" },
  { v: "custom",      t: "Custom",        d: "W × H" },
];


export default function PrintBadgesDialog({ open, onOpenChange, badges, eventId, eventTitle, defaultMode = "badge" }: Props) {
  const prefs = loadPrefs();
  const [mode, setMode] = useState<PrintMode>(prefs.mode ?? defaultMode);
  const [size, setSize] = useState<PrintSize>(prefs.size ?? "a4-2up");
  const [copies, setCopies] = useState<number>(prefs.copies ?? 1);
  const [cw, setCw] = useState<number>(prefs.cw ?? 4);
  const [ch, setCh] = useState<number>(prefs.ch ?? 3);
  const [cu, setCu] = useState<PrintUnit>(prefs.cu ?? "in");
  const [thermalMode, setThermalMode] = useState<boolean>(prefs.thermalMode ?? false);
  const [design, setDesign] = useState<BadgeDesign>(() => loadDesign(eventId));
  const [sizes, setSizes] = useState<SavedSize[]>(() => loadSizes());
  const [tab, setTab] = useState<"settings" | "design">("settings");
  const [nameDesignId, setNameDesignId] = useState<NameDesignId>("simple");
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const p = loadPrefs();
      setMode(defaultMode ?? p.mode ?? "badge");
      setSize(p.size ?? "a4-2up");
      setCopies(p.copies ?? 1);
      setCw(p.cw ?? 4);
      setCh(p.ch ?? 3);
      setCu(p.cu ?? "in");
      setThermalMode(p.thermalMode ?? false);
      setDesign(loadDesign(eventId));
      setSizes(loadSizes());
      setTab("settings");
      setEditorOpen(false);
    }
  }, [open, defaultMode, eventId]);

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify({ mode, size, copies, cw, ch, cu, thermalMode }));
  }, [mode, size, copies, cw, ch, cu, thermalMode]);

  useEffect(() => { saveDesign(eventId, design); }, [eventId, design]);

  // Pre-load all badge fonts so the live design canvas shows the chosen
  // typeface even before the user opens the print preview window.
  useEffect(() => {
    const id = "badge-fonts-link";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Urbanist:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;500;600;700&family=Lato:wght@400;700&family=Montserrat:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@400;500;700;800&family=Merriweather:wght@400;700&family=Source+Sans+Pro:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  const total = badges.length * copies;
  const dims = useMemo(
    () => badgeSizeMm(size, { width: cw, height: ch, unit: cu }),
    [size, cw, ch, cu]
  );

  const runPrint = async (rows: BadgeData[]) => {
    try {
      await printBadges(rows, {
        mode, size, copies, eventTitle,
        custom: size === "custom" ? { width: cw, height: ch, unit: cu } : undefined,
        design: mode === "badge" ? design : undefined,
        thermalMode,
        nameDesign: mode === "name" ? nameDesignId : undefined,
      });
    } catch (err) {
      if ((err as Error).message === "popup-blocked") {
        toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to print badges." });
      } else {
        toast.error("Failed to open print preview");
      }
    }
  };

  const handlePrint = async () => { await runPrint(badges); onOpenChange(false); };

  const handleTestPrint = async () => {
    const sample: BadgeData = badges[0] ?? {
      name: "Jane Doe", email: "jane@example.com", company: "Acme Inc.",
      ticket_type: "general", qr_payload: "TEST-CODE", event_title: eventTitle,
    };
    await runPrint([sample]);
  };

  const uploadImage = async (key: "frontBg" | "backBg", file?: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Image must be under 4 MB"); return; }
    const url = await fileToDataUrl(file);
    setDesign((d) => ({ ...d, [key]: url }));
  };

  const saveCurrentSize = () => {
    const name = window.prompt("Name this size", `${cw}×${ch} ${cu}`);
    if (!name) return;
    const next = [...sizes, { name: name.trim(), w: cw, h: ch, unit: cu }];
    setSizes(next); saveSizes(next);
    toast.success("Size saved");
  };

  const applySize = (s: SavedSize) => { setCw(s.w); setCh(s.h); setCu(s.unit); setSize("custom"); };
  const deleteSize = (i: number) => {
    const next = sizes.filter((_, idx) => idx !== i);
    setSizes(next); saveSizes(next);
  };

  const matchingSizeIdx = sizes.findIndex((s) => s.w === cw && s.h === ch && s.unit === cu);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[88vh] flex flex-col overflow-hidden">
        {/* Full-screen design editor — rendered on top inside the dialog so focus trapping is inherited */}
        {editorOpen && (
          <BadgeDesignEditor
            design={design}
            onDesignChange={setDesign}
            mode={mode}
            widthMm={dims.w}
            heightMm={dims.h}
            badgeCount={badges.length * copies}
            eventTitle={eventTitle}
            sampleName={badges[0]?.name}
            sampleCompany={badges[0]?.company ?? undefined}
            nameDesignId={nameDesignId}
            onNameDesignChange={setNameDesignId}
            onBack={() => { setEditorOpen(false); setTab("settings"); }}
            onTestPrint={handleTestPrint}
            onPrint={async () => { await handlePrint(); }}
          />
        )}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0 space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" /> Print settings
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {badges.length} attendee{badges.length === 1 ? "" : "s"} selected
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "settings" | "design")} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3 shrink-0">
            <TabsList className="grid grid-cols-2 w-full max-w-xs h-9 mx-auto">
              <TabsTrigger value="settings" className="text-[12px] h-7 px-3">Settings</TabsTrigger>
              <TabsTrigger
                value="design"
                disabled={mode !== "badge" && mode !== "name"}
                className="text-[12px] h-7 px-3"
                onClick={(e) => {
                  if (mode === "badge" || mode === "name") {
                    e.preventDefault();
                    setEditorOpen(true);
                  }
                }}
              >
                Design
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="settings" className="flex-1 overflow-y-auto px-5 py-4 space-y-4 mt-0">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Type</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as PrintMode)} className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <label key={opt.v} className={`border rounded-lg px-3 py-2 cursor-pointer text-[13px] transition-colors ${mode === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                    <RadioGroupItem value={opt.v} className="sr-only" />
                    <div className="font-medium leading-tight">{opt.t}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">{opt.d}</div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Label size</Label>
              <RadioGroup value={size} onValueChange={(v) => setSize(v as PrintSize)} className="grid grid-cols-2 gap-2">
                {SIZE_OPTIONS.map((opt) => (
                  <label key={opt.v} className={`border rounded-lg px-3 py-2 cursor-pointer text-[13px] transition-colors ${size === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                    <RadioGroupItem value={opt.v} className="sr-only" />
                    <div className="font-medium leading-tight">{opt.t}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">{opt.d}</div>
                  </label>
                ))}
              </RadioGroup>

              {size === "custom" && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end border border-border rounded-lg p-2.5 bg-muted/30">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Width</Label>
                      <Input type="number" min={0.1} step={0.1} value={cw}
                        onChange={(e) => setCw(Math.max(0.1, Number(e.target.value) || 0.1))}
                        className="h-8 text-[13px]" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Height</Label>
                      <Input type="number" min={0.1} step={0.1} value={ch}
                        onChange={(e) => setCh(Math.max(0.1, Number(e.target.value) || 0.1))}
                        className="h-8 text-[13px]" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 block">Unit</Label>
                      <select
                        value={cu}
                        onChange={(e) => setCu(e.target.value as PrintUnit)}
                        className="h-8 text-[13px] border border-input bg-background rounded-md px-2"
                      >
                        <option value="in">in</option>
                        <option value="cm">cm</option>
                        <option value="mm">mm</option>
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
                          <button type="button" onClick={() => applySize(s)} className="font-medium">
                            {s.name} <span className="text-muted-foreground font-normal">· {s.w}×{s.h} {s.unit}</span>
                          </button>
                          <button type="button" onClick={() => deleteSize(i)} className="opacity-50 hover:opacity-100 p-0.5">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="copies" className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Copies per attendee</Label>
              <Input
                id="copies"
                type="number"
                min={1}
                max={10}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="h-8 w-24 text-[13px]"
              />
            </div>

            {/* Thermal printer mode — strips colour for crisp B&W output */}
            <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={thermalMode}
                  onCheckedChange={(v) => setThermalMode(!!v)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium">Thermal printer mode</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Strips background images and colours so a monochrome thermal printer renders sharp black-and-white labels without dithering.
                  </div>
                </div>
              </label>
              {(thermalMode || size === "thermal-50" || size === "thermal-58" || size === "thermal-80" || size === "thermal-100") && (
                <div className="text-[10.5px] text-muted-foreground leading-relaxed border-t border-border/60 pt-2 mt-2">
                  <strong className="text-foreground">Tip:</strong> Connect your thermal printer via USB or pair it over Bluetooth in your OS settings first, then choose it in the browser print dialog. Set <em>Margins</em> to <em>None</em> and <em>Scale</em> to <em>100%</em>. Disable Chrome's <em>Headers and footers</em> for edge-to-edge output.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="design" className="flex-1 overflow-y-auto px-5 py-8 mt-0 flex flex-col items-center justify-center gap-4 text-center">
            <div className="text-[13px] text-muted-foreground">
              Open the full-screen editor to design your badge.
            </div>
            <Button onClick={() => setEditorOpen(true)} className="gap-2">
              Open badge designer
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30 shrink-0 sm:justify-between gap-2">
          <span className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">{total}</span> label{total === 1 ? "" : "s"} total
          </span>
          <div className="flex items-center gap-2">
            {mode === "badge" && (
              <Button size="sm" variant="ghost" onClick={handleTestPrint} className="gap-1.5 text-[12px]">
                <FlaskConical className="h-3.5 w-3.5" /> Test print
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handlePrint} disabled={badges.length === 0} className="gap-2">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
