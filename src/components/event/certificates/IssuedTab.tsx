/**
 * Issued: every certificate for the event, with download, email, the public
 * verification link, and revocation. Each certificate is drawn from the
 * template version it was issued with, so later template edits never change it.
 */
import { useMemo, useState } from "react";
import { Ban, Copy, Download, Eye, Loader2, Mail, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  emailCertificates, loadCertificates, loadVersionDesign, revokeCertificate,
  type CertificateRow, type EventContext,
} from "@/lib/certificates/certificate-api";
import { batchPdf, certificatePdf, downloadBlob, safeFileName, verificationUrl } from "@/lib/certificates/certificate-pdf";
import type { CertificateDesign } from "@/lib/certificates/certificate-design";
import CertificatePreviewDialog from "./CertificatePreviewDialog";
import { ProgressBar } from "./IssueTab";

interface Props {
  event: EventContext;
  certificates: CertificateRow[];
  canEdit: boolean;
  userId: string | null;
  onChanged: (rows: CertificateRow[]) => void;
}

const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—");

export default function IssuedTab({ event, certificates, canEdit, userId, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "issued" | "revoked" | "unsent">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [revoking, setRevoking] = useState<{ cert: CertificateRow; reason: string } | null>(null);
  const [preview, setPreview] = useState<{ cert: CertificateRow; design: CertificateDesign } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return certificates.filter((c) =>
      (filter === "all" || (filter === "unsent" ? c.status === "issued" && !c.emailed_at : c.status === filter)) &&
      (!q || c.recipient_name.toLowerCase().includes(q) || (c.recipient_email ?? "").includes(q) || c.code.toLowerCase().includes(q)));
  }, [certificates, query, filter]);
  const fixedPreview = useMemo(() => (preview ? { values: preview.cert.field_values, code: preview.cert.code } : undefined), [preview]);
  const issued = certificates.filter((c) => c.status === "issued");
  const unsent = issued.filter((c) => !c.emailed_at && c.recipient_email);

  const refresh = async () => onChanged(await loadCertificates(event.id));

  const download = async (c: CertificateRow) => {
    setBusy(c.id);
    try {
      const { blob, blockedImages } = await certificatePdf(await loadVersionDesign(c.template_version_id), c.field_values, c.code);
      downloadBlob(blob, `${safeFileName(c.recipient_name)}-${c.code}.pdf`);
      if (blockedImages) toast.warning("An image was left out because its host blocks downloads.");
    } catch (err) {
      toast.error("Could not create the PDF", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    setBusy("all");
    setProgress({ done: 0, total: issued.length, label: "Rendering" });
    try {
      const items = [];
      for (const c of issued) items.push({ design: await loadVersionDesign(c.template_version_id), values: c.field_values, code: c.code });
      const { blob } = await batchPdf(items, (done, total) => setProgress({ done, total, label: "Rendering" }));
      downloadBlob(blob, `${safeFileName(event.title)}-certificates.pdf`);
    } catch (err) {
      toast.error("Could not build the PDF", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const email = async (rows: CertificateRow[]) => {
    setBusy(rows.length === 1 ? rows[0].id : "email");
    if (rows.length > 1) setProgress({ done: 0, total: rows.length, label: "Sending" });
    try {
      const out = await emailCertificates({ eventId: event.id, eventTitle: event.title, orgName: event.org_name, userId, certificates: rows, onProgress: (done, total) => setProgress(rows.length > 1 ? { done, total, label: "Sending" } : null) });
      await refresh();
      if (out.failed.length === 0) toast.success(out.sent === 1 ? `Emailed ${rows[0].recipient_name}` : `Emailed ${out.sent} certificates`);
      else toast.warning(`Emailed ${out.sent}; ${out.failed.length} not sent`, { description: out.failed.slice(0, 3).map((f) => `${f.name}: ${f.error}`).join(" · ") });
    } catch (err) {
      toast.error("Not sent", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(revoking.cert.id);
    try {
      await revokeCertificate(revoking.cert.id, revoking.reason);
      await refresh();
      toast.success("Certificate revoked", { description: "Its verification page now shows it as revoked." });
      setRevoking(null);
    } catch (err) {
      toast.error("Could not revoke", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const openPreview = async (c: CertificateRow) => {
    try { setPreview({ cert: c, design: await loadVersionDesign(c.template_version_id) }); }
    catch (err) { toast.error("Could not load the design", { description: err instanceof Error ? err.message : String(err) }); }
  };

  if (certificates.length === 0) {
    return <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-[13px] text-muted-foreground">No certificates issued for this event yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or ID" className="h-8 pl-8 text-[12.5px]" />
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {([["all", `All ${certificates.length}`], ["issued", `Valid ${issued.length}`], ["unsent", `Not emailed ${unsent.length}`], ["revoked", `Revoked ${certificates.length - issued.length}`]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setFilter(v)} className={`rounded px-2.5 py-1 text-[11.5px] ${filter === v ? "bg-muted text-foreground" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" disabled={!!busy || issued.length === 0} onClick={() => void downloadAll()}>
            {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download all
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" disabled={!canEdit || !!busy || unsent.length === 0} onClick={() => void email(unsent)}>
            {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email {unsent.length} not sent
          </Button>
        </div>
      </div>
      {progress && <ProgressBar {...progress} />}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px_110px_40px] gap-3 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Recipient</span><span>Certificate ID</span><span>Issued</span><span>Status</span><span />
        </div>
        <ul className="divide-y divide-border">
          {shown.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px_110px_40px]">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{c.recipient_name}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{c.recipient_email}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground md:hidden">{c.code} · {fmt(c.issued_at)}</p>
              </div>
              <span className="hidden truncate font-mono text-[12px] md:block">{c.code}</span>
              <span className="hidden text-[12px] text-muted-foreground md:block">{fmt(c.issued_at)}</span>
              <span className="hidden md:block">
                {c.status === "revoked" ? <Badge variant="outline" className="border-destructive/30 text-destructive text-[10.5px]">Revoked</Badge>
                  : c.emailed_at ? <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[10.5px]">Emailed</Badge>
                  : <Badge variant="outline" className="text-[10.5px]">Not emailed</Badge>}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy === c.id} aria-label={`Actions for ${c.recipient_name}`}>
                    {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => void openPreview(c)}><Eye className="mr-2 h-3.5 w-3.5" />Preview</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void download(c)}><Download className="mr-2 h-3.5 w-3.5" />Download PDF</DropdownMenuItem>
                  <DropdownMenuItem disabled={!canEdit || c.status !== "issued" || !c.recipient_email} onSelect={() => void email([c])}><Mail className="mr-2 h-3.5 w-3.5" />{c.emailed_at ? "Email again" : "Email"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(verificationUrl(c.code)).then(() => toast.success("Verification link copied")); }}><Copy className="mr-2 h-3.5 w-3.5" />Copy verification link</DropdownMenuItem>
                  {canEdit && c.status === "issued" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRevoking({ cert: c, reason: "" })}><Ban className="mr-2 h-3.5 w-3.5" />Revoke</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Nothing matches.</li>}
        </ul>
      </div>

      <Dialog open={!!revoking} onOpenChange={(o) => { if (!o) setRevoking(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Revoke {revoking?.cert.recipient_name}'s certificate?</DialogTitle>
            <DialogDescription className="text-[12.5px]">Its verification page will say it has been revoked. This can't be undone, but you can issue a new certificate afterwards.</DialogDescription>
          </DialogHeader>
          <Textarea value={revoking?.reason ?? ""} onChange={(e) => setRevoking((r) => (r ? { ...r, reason: e.target.value } : r))} placeholder="Reason (kept in the audit history)" maxLength={500} className="text-[13px]" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={busy === revoking?.cert.id} onClick={() => void revoke()}>Revoke certificate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CertificatePreviewDialog
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null); }}
        title={preview ? `${preview.cert.recipient_name} · ${preview.cert.code}` : ""}
        subtitle={preview?.cert.status === "revoked" ? "Revoked" : `Issued ${fmt(preview?.cert.issued_at ?? null)}`}
        design={preview?.design ?? null}
        event={event}
        fixedValues={fixedPreview}
      />
    </div>
  );
}
