/**
 * Issue: pick a published template, choose who receives a certificate — all
 * registered attendees or only those who checked in — preview with a real
 * attendee, confirm, then download and email the results.
 *
 * Eligibility is decided again on the server when issuing; the list here is
 * for choosing and previewing.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Eye, Loader2, Mail, Search, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  emailCertificates, inAudience, issueCertificates, loadCertificates, loadVersionDesign,
  type Audience, type CertificateRow, type EventContext, type Registrant, type TemplateRow,
} from "@/lib/certificates/certificate-api";
import { batchPdf, downloadBlob, safeFileName } from "@/lib/certificates/certificate-pdf";
import CertificatePreviewDialog from "./CertificatePreviewDialog";

interface Props {
  event: EventContext;
  templates: TemplateRow[];
  registrants: Registrant[];
  certificates: CertificateRow[];
  canEdit: boolean;
  userId: string | null;
  /** Pre-selected template (from "Use template"). */
  templateId: string | null;
  onTemplateId: (id: string | null) => void;
  onIssued: (rows: CertificateRow[]) => void;
  onGoToTemplates: () => void;
  onGoToIssued: () => void;
}

export default function IssueTab(props: Props) {
  const { event, registrants } = props;
  const usable = useMemo(
    () => props.templates.filter((t) => t.status === "published" && t.published_version_id && (t.event_id === null || t.event_id === event.id)),
    [props.templates, event.id],
  );
  const template = usable.find((t) => t.id === props.templateId) ?? usable[0] ?? null;
  const [audience, setAudience] = useState<Audience>("checked_in");
  const [query, setQuery] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<null | "issue" | "download" | "email">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: CertificateRow[]; existing: CertificateRow[] } | null>(null);
  const [previewWho, setPreviewWho] = useState<string | null>(null);
  const [previewDesign, setPreviewDesign] = useState<TemplateRow["design"] | null>(null);

  useEffect(() => { if (template && template.id !== props.templateId) props.onTemplateId(template.id); }, [template, props]);
  useEffect(() => { setExcluded(new Set()); setResult(null); }, [audience, template?.id]);

  const issuedByReg = useMemo(() => {
    const m = new Map<string, CertificateRow>();
    for (const c of props.certificates) if (c.status === "issued" && c.registration_id) m.set(c.registration_id, c);
    return m;
  }, [props.certificates]);

  const counts = useMemo(() => ({
    all: registrants.filter((r) => inAudience(r, "all")).length,
    checked_in: registrants.filter((r) => inAudience(r, "checked_in")).length,
    excludedByStatus: registrants.filter((r) => !r.eligible).length,
  }), [registrants]);

  const audienceList = useMemo(() => registrants.filter((r) => inAudience(r, audience)), [registrants, audience]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? audienceList.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.company ?? "").toLowerCase().includes(q)) : audienceList;
  }, [audienceList, query]);
  const selected = audienceList.filter((r) => !excluded.has(r.id));
  const newCount = selected.filter((r) => !issuedByReg.has(r.id)).length;
  const allVisibleSelected = visible.length > 0 && visible.every((r) => !excluded.has(r.id));

  const toggleAllVisible = (on: boolean) => setExcluded((prev) => {
    const next = new Set(prev);
    for (const r of visible) { if (on) next.delete(r.id); else next.add(r.id); }
    return next;
  });

  const openPreview = async (who: string) => {
    if (!template?.published_version_id) return;
    try {
      setPreviewDesign(await loadVersionDesign(template.published_version_id));
      setPreviewWho(who);
    } catch (err) {
      toast.error("Could not load the template", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const issue = async () => {
    if (!template?.published_version_id) return;
    setConfirm(false);
    setBusy("issue");
    try {
      const ids = excluded.size === 0 ? null : selected.map((r) => r.id);
      const out = await issueCertificates(event.id, template.published_version_id, audience, ids);
      const fresh = await loadCertificates(event.id);
      props.onIssued(fresh);
      const byId = new Map(fresh.map((c) => [c.id, c]));
      const created = out.filter((o) => o.created).map((o) => byId.get(o.certificateId)).filter((c): c is CertificateRow => !!c);
      const existing = out.filter((o) => !o.created).map((o) => byId.get(o.certificateId)).filter((c): c is CertificateRow => !!c);
      setResult({ created, existing });
      toast.success(created.length ? `Issued ${created.length} certificate${created.length === 1 ? "" : "s"}` : "Everyone selected already has a certificate");
    } catch (err) {
      toast.error("Certificates were not issued", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async (rows: CertificateRow[]) => {
    if (rows.length === 0) return;
    setBusy("download");
    setProgress({ done: 0, total: rows.length });
    try {
      const items = [];
      for (const c of rows) items.push({ design: await loadVersionDesign(c.template_version_id), values: c.field_values, code: c.code });
      const { blob, blockedImages } = await batchPdf(items, (done, total) => setProgress({ done, total }));
      downloadBlob(blob, `${safeFileName(event.title)}-certificates.pdf`);
      if (blockedImages) toast.warning(`${blockedImages} image${blockedImages === 1 ? " was" : "s were"} left out because ${blockedImages === 1 ? "its" : "their"} host blocks downloads.`);
    } catch (err) {
      toast.error("Could not build the PDF", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const emailAll = async (rows: CertificateRow[]) => {
    setBusy("email");
    setProgress({ done: 0, total: rows.length });
    try {
      const out = await emailCertificates({ eventId: event.id, eventTitle: event.title, orgName: event.org_name, userId: props.userId, certificates: rows, onProgress: (done, total) => setProgress({ done, total }) });
      props.onIssued(await loadCertificates(event.id));
      if (out.failed.length === 0) toast.success(`Emailed ${out.sent} certificate${out.sent === 1 ? "" : "s"}`);
      else toast.warning(`Emailed ${out.sent}; ${out.failed.length} not sent`, { description: out.failed.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join(" · ") });
    } catch (err) {
      toast.error("Emails were not sent", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  if (usable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-[14px] font-semibold">Publish a template first</p>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] text-muted-foreground">Certificates are issued from a published template, so every certificate keeps exactly the design it was issued with.</p>
        <Button size="sm" className="mt-4" onClick={props.onGoToTemplates}>Choose a template</Button>
      </div>
    );
  }

  if (result) {
    const all = [...result.created, ...result.existing];
    const unsent = all.filter((c) => !c.emailed_at && c.recipient_email);
    return (
      <div className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
          <div>
            <p className="text-[15px] font-semibold">{result.created.length} new certificate{result.created.length === 1 ? "" : "s"} issued</p>
            <p className="text-[12.5px] text-muted-foreground">
              {result.existing.length > 0 ? `${result.existing.length} attendee${result.existing.length === 1 ? " already had one" : "s already had one"} — kept as issued. ` : ""}
              Review them, then send them out.
            </p>
          </div>
        </div>
        {progress && <ProgressBar {...progress} label={busy === "email" ? "Sending" : "Rendering"} />}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy || all.length === 0} onClick={() => void downloadAll(all)}>
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download all ({all.length}) as one PDF
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!!busy || unsent.length === 0} onClick={() => void emailAll(unsent)}>
            {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email {unsent.length} not yet emailed
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onGoToIssued}>Review in Issued</Button>
          <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Issue more</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          <p className="text-[12.5px] font-medium">Template</p>
          <Select value={template?.id ?? ""} onValueChange={(v) => props.onTemplateId(v)}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {usable.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · v{t.current_version}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11.5px] text-muted-foreground">Issues from the latest published version. Unpublished edits are not used.</p>
        </div>
        <div className="space-y-2">
          <p className="text-[12.5px] font-medium">Who receives a certificate</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recipients">
            {([
              ["checked_in", "Only checked-in attendees", `${counts.checked_in} attended`, UserCheck],
              ["all", "All registered attendees", `${counts.all} registered`, Users],
            ] as const).map(([value, label, sub, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={audience === value} onClick={() => setAudience(value)}
                className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors", audience === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50")}>
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", audience === value ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-[13px] font-medium">{label}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          {counts.excludedByStatus > 0 && (
            <p className="text-[11.5px] text-muted-foreground">{counts.excludedByStatus} cancelled, declined, pending or waitlisted registration{counts.excludedByStatus === 1 ? " is" : "s are"} never included.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleAllVisible(v === true)} aria-label="Select all shown" />
          <span className="text-[12.5px] font-medium">{selected.length} of {audienceList.length} selected</span>
          <span className="text-[12px] text-muted-foreground">· {newCount} new, {selected.length - newCount} already issued</span>
          <div className="relative ml-auto w-full sm:w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attendees" className="h-8 pl-8 text-[12.5px]" />
          </div>
        </div>
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {visible.length === 0 && (
            <li className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
              {audience === "checked_in" ? "No one has checked in yet. Choose “All registered attendees”, or check people in first." : "No eligible registrations."}
            </li>
          )}
          {visible.map((r) => {
            const issued = issuedByReg.get(r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox checked={!excluded.has(r.id)} onCheckedChange={(v) => setExcluded((prev) => { const n = new Set(prev); if (v === true) n.delete(r.id); else n.add(r.id); return n; })} aria-label={`Include ${r.name}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{r.name}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">{r.email}{r.company ? ` · ${r.company}` : ""}</p>
                </div>
                {r.checked_in && <Badge variant="outline" className="hidden sm:inline-flex text-[10.5px]">Checked in</Badge>}
                {issued && <Badge variant="outline" className="text-[10.5px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400">Issued</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openPreview(r.id)} aria-label={`Preview ${r.name}'s certificate`}><Eye className="h-3.5 w-3.5" /></Button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {selected[0] && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void openPreview(selected[0].id)}>
            <Eye className="h-3.5 w-3.5" /> Preview with {selected[0].name.split(" ")[0]}
          </Button>
        )}
        <Button size="sm" disabled={!props.canEdit || selected.length === 0 || !!busy} onClick={() => setConfirm(true)} className="gap-1.5">
          {busy === "issue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Generate {newCount} certificate{newCount === 1 ? "" : "s"}
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue {newCount} certificate{newCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Using “{template?.name}” (version {template?.current_version}) for {audience === "checked_in" ? "checked-in attendees" : "all registered attendees"}.
              {selected.length - newCount > 0 ? ` ${selected.length - newCount} selected attendee${selected.length - newCount === 1 ? " already has" : "s already have"} a certificate, which stays as issued.` : ""}
              {" "}Each certificate gets its own ID and verification QR code. Nothing is emailed until you choose to send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void issue()}>Issue certificates</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CertificatePreviewDialog
        open={!!previewWho}
        onOpenChange={(o) => { if (!o) setPreviewWho(null); }}
        title="Certificate preview"
        subtitle="With this attendee's details. The ID and QR code are assigned when the certificate is issued."
        design={previewDesign}
        event={event}
        registrants={registrants}
        initialWho={previewWho ?? undefined}
      />
    </div>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px] text-muted-foreground"><span>{label}…</span><span>{done} / {total}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
