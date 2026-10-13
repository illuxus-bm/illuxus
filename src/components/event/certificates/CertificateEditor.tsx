/**
 * The certificate editor — a full-screen, three-panel studio:
 *
 *   left    layouts, backgrounds, Brand Kit logos, event partners, the three
 *           signature slots, dynamic fields and extra elements
 *   centre  the canvas (the brochure editor's, at the page's real proportions,
 *           with zoom), or in Preview mode the certificate exactly as it will
 *           print for a sample or real attendee
 *   right   properties of the selection, and the layers list (order, lock,
 *           hide)
 *
 * Saving writes the template; publishing freezes a version that certificates
 * can be issued from. Nothing is issued from here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, Loader2, PencilRuler, Redo2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import BrochureEditorCanvas from "@/lib/brochure/editor/BrochureEditorCanvas";
import BrochureEditorProperties from "@/lib/brochure/editor/BrochureEditorProperties";
import { useHistory } from "@/lib/brochure/editor/editor-history";
import { addElement, removeElement, type BrochureDocument, type BrochureElement, type ImageElement } from "@/lib/brochure/editor/editor-document";
import { duplicateElements, translateElements } from "@/lib/brochure/editor/editor-operations";
import { PREVIEW_DPI } from "@/lib/brochure/editor/editor-pdf";
import type { BrandKit } from "@/lib/brand-kit";
import {
  ORG_LOGO_ID, QR_ELEMENT_ID, QR_SRC_MARKER, checkDesign, hasErrors, isManagedElement, pageOf, reconcileDeletions, setPartners, syncSignatures,
  type CertificateDesign, type DesignIssue, type PartnerLogoRef,
} from "@/lib/certificates/certificate-design";
import { SAMPLE_PARTICIPANTS, type CertificateValues } from "@/lib/certificates/certificate-fields";
import { buildTemplate, findTemplate } from "@/lib/certificates/certificate-templates";
import { PREVIEW_CODE, certificateCanvas, qrDataUrl } from "@/lib/certificates/certificate-pdf";
import {
  createTemplate, previewValues, publishTemplate, saveTemplate,
  type EventContext, type Registrant, type TemplateRow,
} from "@/lib/certificates/certificate-api";
import CertificateEditorSidebar, { type SidebarTab } from "./CertificateEditorSidebar";

interface Props {
  template: TemplateRow;
  event: EventContext;
  brandKit: BrandKit | null;
  brandKitError: string | null;
  partners: PartnerLogoRef[];
  registrants: Registrant[];
  /** Opens on this tab (e.g. Signatures when a slot still needs a name). */
  initialTab?: SidebarTab;
  onClose: () => void;
  onSaved: (row: TemplateRow) => void;
  onSavedAsNew: (row: TemplateRow) => void;
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export default function CertificateEditor(props: Props) {
  const { template, event } = props;
  const history = useHistory<CertificateDesign>(template.design);
  const design = history.value;
  const page = pageOf(design);
  const [name, setName] = useState(template.name);
  const [tab, setTab] = useState<SidebarTab>(props.initialTab ?? "layouts");
  const [selected, setSelected] = useState<string[]>([]);
  const [sampleQr, setSampleQr] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "copy" | "publish" | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ on: boolean; who: string }>({ on: false, who: "sample:0" });
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const saved = useRef(JSON.stringify({ d: template.design, n: template.name }));
  const dirty = JSON.stringify({ d: design, n: name }) !== saved.current;
  const issues = useMemo(() => checkDesign(design), [design]);
  const errorCount = issues.filter((i) => i.level === "error").length;

  useEffect(() => { void qrDataUrl(PREVIEW_CODE).then(setSampleQr); }, []);

  const commit = useCallback((next: CertificateDesign) => history.set(reconcileDeletions(next)), [history]);

  // The canvas shows a sample QR in place of the stored marker, and hands it back on change.
  const canvasDoc = useMemo<BrochureDocument>(() => {
    if (!sampleQr) return design.document;
    return { ...design.document, pages: [{ ...page, elements: page.elements.map((e) => (e.id === QR_ELEMENT_ID ? { ...e, src: sampleQr } : e)) }] };
  }, [design.document, page, sampleQr]);

  const onCanvasChange = useCallback((doc: BrochureDocument) => {
    const p = doc.pages[0];
    const restored = { ...doc, pages: [{ ...p, elements: p.elements.map((e) => (e.id === QR_ELEMENT_ID ? { ...e, src: QR_SRC_MARKER } : e)) }] };
    commit({ ...design, document: restored });
  }, [commit, design]);

  const addEl = useCallback((el: BrochureElement) => {
    commit({ ...design, document: addElement(design.document, page.id, el) });
    setSelected([el.id]);
  }, [commit, design, page.id]);

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (preview.on || isTyping(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); history.redo(); }
      else if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
      else if (meta && e.key.toLowerCase() === "d" && selected.length) {
        e.preventDefault();
        const free = selected.filter((id) => { const el = page.elements.find((x) => x.id === id); return el && !isManagedElement(el) && id !== ORG_LOGO_ID; });
        if (free.length === 0) { toast.info("Signatures, partner logos and the QR code are managed from the left panel."); return; }
        const out = duplicateElements(design.document, page.id, free);
        commit({ ...design, document: out.doc });
        setSelected(out.newIds);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        e.preventDefault();
        let doc = design.document;
        for (const id of selected) {
          const el = page.elements.find((x) => x.id === id);
          if (el?.locked) continue;
          doc = removeElement(doc, page.id, id);
        }
        commit({ ...design, document: doc });
        setSelected([]);
      } else if (e.key === "Escape" && selected.length) {
        e.preventDefault(); e.stopPropagation(); setSelected([]);
      } else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        commit({ ...design, document: translateElements(design.document, page.id, selected, dx, dy) });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  });

  // ── Preview ──
  const previewOptions = useMemo(() => {
    const real = props.registrants.filter((r) => r.eligible).slice(0, 100);
    return { samples: SAMPLE_PARTICIPANTS.map((s, i) => ({ key: `sample:${i}`, label: s.label })), real };
  }, [props.registrants]);

  const valuesFor = useCallback((who: string): CertificateValues => {
    if (who.startsWith("sample:")) {
      const s = SAMPLE_PARTICIPANTS[Number(who.slice(7))] ?? SAMPLE_PARTICIPANTS[0];
      return { ...s.values, event_name: event.title || s.values.event_name, organization_name: event.org_name || s.values.organization_name, certificate_type: design.settings.certificateType };
    }
    const r = props.registrants.find((x) => x.id === who);
    return r ? { ...previewValues(r, event, design.settings.certificateType), certificate_id: PREVIEW_CODE } : SAMPLE_PARTICIPANTS[0].values;
  }, [design.settings.certificateType, event, props.registrants]);

  useEffect(() => {
    if (!preview.on) return;
    let alive = true;
    setPreviewBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const canvas = await certificateCanvas(design, valuesFor(preview.who), null, PREVIEW_DPI * 1.4);
        if (alive) setPreviewImg(canvas.toDataURL("image/png"));
      } catch { /* keep the last picture */ }
      if (alive) setPreviewBusy(false);
    }, 150);
    return () => { alive = false; window.clearTimeout(t); };
  }, [preview, design, valuesFor]);

  // ── Layout switch ──
  const applyLayout = (id: string) => {
    const spec = findTemplate(id);
    if (!spec) return;
    const logo = page.elements.find((e) => e.id === ORG_LOGO_ID) as ImageElement | undefined;
    let next = buildTemplate(spec, { logoUrl: logo?.src || null });
    next = {
      ...next,
      settings: {
        ...next.settings,
        signatures: design.settings.signatures.map((s) => ({ ...s })) as CertificateDesign["settings"]["signatures"],
        showPartnerNames: design.settings.showPartnerNames,
        certificateType: design.settings.certificateType,
      },
    };
    next = syncSignatures(next, true);
    next = setPartners(next, design.settings.partners.map((p) => p.sponsorId), props.partners.length ? props.partners : design.settings.partners);
    history.set(next);
    setSelected([]);
    setPendingLayout(null);
    toast.success(`Switched to ${spec.name}`);
  };

  // ── Save / publish ──
  const save = async (): Promise<TemplateRow | null> => {
    if (saving) return null;
    setSaving("save");
    try {
      const row = await saveTemplate(template.id, { name, design });
      saved.current = JSON.stringify({ d: design, n: name });
      props.onSaved(row);
      toast.success("Template saved");
      return row;
    } catch (err) {
      toast.error("Could not save", { description: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      setSaving(null);
    }
  };

  const saveAsNew = async () => {
    setSaving("copy");
    try {
      const row = await createTemplate({ orgId: template.org_id, eventId: event.id, name: `${name} (copy)`, category: template.category, source: template.source_template, design });
      toast.success("Saved as a new template");
      props.onSavedAsNew(row);
    } catch (err) {
      toast.error("Could not save a copy", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  const publish = async () => {
    if (hasErrors(issues)) {
      toast.error("Fix the highlighted problems before publishing", { description: issues.filter((i) => i.level === "error").map((i) => i.message).join(" ") });
      return;
    }
    setSaving("publish");
    try {
      const row = await saveTemplate(template.id, { name, design });
      saved.current = JSON.stringify({ d: design, n: name });
      const v = await publishTemplate(template.id);
      props.onSaved({ ...row, status: "published", current_version: v.version, published_version_id: v.versionId, published_at: new Date().toISOString() });
      toast.success(`Published as version ${v.version}`, { description: "You can now issue certificates from it. Certificates already issued keep their original design." });
    } catch (err) {
      toast.error("Could not publish", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(null);
    }
  };

  const requestClose = () => (dirty ? setConfirmClose(true) : props.onClose());

  const selectIssue = (issue: DesignIssue) => {
    if (!issue.elementId) return;
    if (/^sig-\d/.test(issue.elementId)) setTab("signatures");
    setPreview((p) => ({ ...p, on: false }));
    setSelected([issue.elementId]);
  };

  const selectedTextId = selected.length === 1 && page.elements.find((e) => e.id === selected[0])?.kind === "text" ? selected[0] : null;
  const unpublished = template.status === "published" && template.published_at && new Date(template.updated_at).getTime() - new Date(template.published_at).getTime() > 2000;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent className="max-w-none w-screen h-[100dvh] p-0 gap-0 rounded-none border-0 flex flex-col [&>button.absolute]:hidden" onEscapeKeyDown={(e) => { if (selected.length) e.preventDefault(); }}>
        <DialogTitle className="sr-only">Certificate editor</DialogTitle>
        <DialogDescription className="sr-only">Design the certificate, then save and publish it.</DialogDescription>

        {/* Top bar */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={requestClose} aria-label="Close editor"><X className="h-4 w-4" /></Button>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Template name" className="h-8 w-[220px] text-[13px] font-medium" />
          <Badge variant="outline" className="hidden sm:inline-flex text-[11px] font-medium">
            {template.status === "published" ? `Published · v${template.current_version}${unpublished || dirty ? " · unpublished changes" : ""}` : template.status === "archived" ? "Archived" : "Draft"}
          </Badge>
          <div className="flex-1" />

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className={`h-8 gap-1.5 text-[12.5px] ${errorCount ? "text-destructive" : issues.length ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {errorCount ? <AlertCircle className="h-4 w-4" /> : issues.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {errorCount ? `${errorCount} to fix` : issues.length ? `${issues.length} warning${issues.length === 1 ? "" : "s"}` : "Ready"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-0">
              <div className="border-b border-border px-3 py-2 text-[12.5px] font-semibold">Checks before publishing</div>
              {issues.length === 0 ? (
                <p className="px-3 py-3 text-[12.5px] text-muted-foreground">Everything looks good.</p>
              ) : (
                <ul className="max-h-[320px] overflow-y-auto py-1">
                  {issues.map((i, n) => (
                    <li key={n}>
                      <button type="button" onClick={() => selectIssue(i)} className="flex w-full gap-2 px-3 py-2 text-left text-[12.5px] leading-snug hover:bg-muted">
                        {i.level === "error" ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                        <span>{i.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={history.undo} disabled={!history.canUndo || preview.on} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={history.redo} disabled={!history.canRedo || preview.on} aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>

          <div className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant={preview.on ? "secondary" : "ghost"} className="h-8 gap-1.5 text-[12.5px]" onClick={() => { setSelected([]); setPreview((p) => ({ ...p, on: !p.on })); }}>
            {preview.on ? <PencilRuler className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview.on ? "Back to editing" : "Preview"}
          </Button>
          {preview.on && (
            <Select value={preview.who} onValueChange={(who) => setPreview({ on: true, who })}>
              <SelectTrigger className="h-8 w-[220px] text-[12.5px]" aria-label="Preview as"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Sample data</SelectLabel>
                  {previewOptions.samples.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectGroup>
                {previewOptions.real.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>This event's attendees</SelectLabel>
                    {previewOptions.real.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}{r.checked_in ? " · checked in" : ""}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          )}
          <div className="mx-1 h-6 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-8 text-[12.5px] hidden md:inline-flex" onClick={() => void saveAsNew()} disabled={!!saving}>
            {saving === "copy" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save as new
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-[12.5px]" onClick={() => void save()} disabled={!!saving || !dirty}>
            {saving === "save" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} {dirty ? "Save" : "Saved"}
          </Button>
          <Button size="sm" className="h-8 text-[12.5px]" onClick={() => void publish()} disabled={!!saving}>
            {saving === "publish" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Publish
          </Button>
        </div>

        {/* Workspace */}
        <div className="flex min-h-0 flex-1">
          <CertificateEditorSidebar
            tab={tab}
            onTab={(t) => { setTab(t); setPreview((p) => ({ ...p, on: false })); }}
            design={design}
            onChange={commit}
            brandKit={props.brandKit}
            brandKitError={props.brandKitError}
            partners={props.partners}
            selectedTextId={selectedTextId}
            onAddElement={addEl}
            onApplyLayout={(id) => setPendingLayout(id)}
            onSelect={(ids) => { setPreview((p) => ({ ...p, on: false })); setSelected(ids); }}
          />
          <div className="relative min-w-0 flex-1 bg-muted/40">
            {preview.on ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-6">
                {previewImg ? (
                  <img
                    src={previewImg}
                    alt="Certificate preview"
                    className="max-h-[calc(100%-2.5rem)] max-w-full rounded-sm bg-white shadow-[0_20px_60px_-25px_rgb(0_0_0/0.45)]"
                    style={{ aspectRatio: `${page.width} / ${page.height}` }}
                  />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {previewBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Drawn by the same renderer as the PDF. The QR code here points to a preview code.
                </p>
              </div>
            ) : (
              <BrochureEditorCanvas
                document={canvasDoc}
                onChange={onCanvasChange}
                activePageId={page.id}
                selectedElementIds={selected}
                onSelect={setSelected}
              />
            )}
          </div>
          {!preview.on && (
            <BrochureEditorProperties
              document={canvasDoc}
              activePageId={page.id}
              selectedElementIds={selected}
              onChange={onCanvasChange}
              onSelect={setSelected}
            />
          )}
        </div>

        <AlertDialog open={!!pendingLayout} onOpenChange={(o) => { if (!o) setPendingLayout(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch to {findTemplate(pendingLayout)?.name ?? "this layout"}?</AlertDialogTitle>
              <AlertDialogDescription>
                The page is rebuilt from the new layout. Your logo, partners, signatures and certificate type are kept; other text and element changes are replaced. You can undo this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => pendingLayout && applyLayout(pendingLayout)}>Switch layout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save your changes?</AlertDialogTitle>
              <AlertDialogDescription>This certificate has changes that haven't been saved. Closing without saving discards them.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <Button variant="outline" onClick={() => { setConfirmClose(false); props.onClose(); }}>Discard changes</Button>
              <Button onClick={async () => { const row = await save(); if (row) { setConfirmClose(false); props.onClose(); } }} disabled={!!saving}>Save and close</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
