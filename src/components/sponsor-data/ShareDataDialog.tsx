import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, History, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { dataSharing, type SharePreview } from "@/lib/sponsors/data-sharing";
import { SharedDataTable } from "./SharedDataTable";

interface Props {
  eventSponsorId: string;
  onClose: () => void;
  onChanged: () => void;
}

const titleOf = (tier: string | null, label: string | null) =>
  tier === "custom" ? label || "Custom" : tier ? tier[0].toUpperCase() + tier.slice(1) : "";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11.5px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums leading-none">{value.toLocaleString()}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Sharing one event's participant list with one sponsor. Shows what would be
 * shared before anything is, and the versions shared so far.
 */
export function ShareDataDialog({ eventSponsorId, onClose, onChanged }: Props) {
  const queryClient = useQueryClient();
  const key = ["share-preview", eventSponsorId];
  const preview = useQuery({ queryKey: key, queryFn: () => dataSharing.preview(eventSponsorId), retry: false, refetchOnWindowFocus: false });
  const history = useQuery({ queryKey: ["share-history", eventSponsorId], queryFn: () => dataSharing.history(eventSponsorId), retry: false });
  const [beforeEnd, setBeforeEnd] = useState(false);
  const [allowExport, setAllowExport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [viewing, setViewing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const p = preview.data;
  const current = p?.current?.status === "active" ? p.current : null;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["share-history", eventSponsorId] });
    onChanged();
  };

  const share = async () => {
    setBusy(true);
    try {
      await dataSharing.share(eventSponsorId, { beforeEnd, allowExport });
      toast.success(current ? "Updated data shared" : "Data shared", { description: "The sponsor's team can see it in their dashboard now." });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await dataSharing.revoke(current.id, reason.trim());
      toast.success("Access revoked", { description: "The sponsor can no longer open this data." });
      setRevoking(false);
      setReason("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={viewing ? "max-h-[92vh] max-w-6xl overflow-y-auto" : "max-h-[92vh] max-w-2xl overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{viewing ? "Shared data" : "Share Event Database"}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {p ? `${p.sponsor.name}${p.sponsor.title ? ` · ${titleOf(p.sponsor.title, p.sponsor.title_label)}` : ""} · ${p.event.title}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {!p ? (
          <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
            {preview.isError ? (preview.error as Error).message : <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>}
          </p>
        ) : viewing && p.current ? (
          <div className="space-y-3">
            <Button variant="ghost" className="h-8 px-2" onClick={() => setViewing(false)}>← Back</Button>
            <SharedDataTable shareId={p.current.id} canExport fileName={`${p.event.title} - ${p.sponsor.name}`.replace(/[^\w -]+/g, "")} />
          </div>
        ) : (
          <div className="space-y-4 text-[13px]">
            {current ? (
              <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Data shared · version {current.version}</p>
                <p className="text-[12px] text-muted-foreground">
                  {current.record_count.toLocaleString()} participants · {current.with_email.toLocaleString()} with email · {current.with_mobile.toLocaleString()} with mobile · shared {when(current.shared_at)}
                  {current.allow_export ? "" : " · downloads not allowed"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" className="h-9 rounded-xl" onClick={() => setViewing(true)}><Table2 className="mr-1.5 h-4 w-4" /> View shared data</Button>
                  {revoking ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="h-9 w-48" aria-label="Reason for revoking" />
                      <Button variant="destructive" className="h-9 rounded-xl" disabled={busy} onClick={() => void revoke()}>Confirm revoke</Button>
                      <Button variant="ghost" className="h-9" onClick={() => setRevoking(false)}>Cancel</Button>
                    </span>
                  ) : (
                    <Button variant="outline" className="h-9 rounded-xl text-destructive" onClick={() => setRevoking(true)}>Revoke access</Button>
                  )}
                </div>
              </div>
            ) : p.current?.status === "revoked" ? (
              <p className="rounded-xl border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">Access to version {p.current.version} was revoked {when(p.current.revoked_at)}. Sharing again publishes a new version.</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Eligible participants" value={p.eligible} hint="Approved, not cancelled" />
              <Stat label="With email" value={p.with_email} />
              <Stat label="With mobile" value={p.with_mobile} />
              <Stat label="With both" value={p.with_both} />
              <Stat label="Without contact details" value={p.without_contact} hint="No email or mobile given" />
            </div>

            <section className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fields shared</p>
              <div className="flex flex-wrap gap-1.5">
                {p.fields.map((f) => (
                  <Badge key={f.key} variant="secondary" className="text-[11px] font-normal">
                    {f.label}
                  </Badge>
                ))}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Not collected by the registration form, so not shared: {p.not_collected.join(", ")}.
              </p>
            </section>

            <section className="space-y-2.5 rounded-xl border border-border p-3">
              <label className="flex items-center justify-between gap-3">
                <span><span className="font-medium">Allow download</span><span className="block text-[12px] text-muted-foreground">Let the sponsor's team export CSV and Excel files.</span></span>
                <Switch checked={allowExport} onCheckedChange={setAllowExport} aria-label="Allow download" />
              </label>
              {!p.event.ended && (
                <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-[12.5px]">
                  <Checkbox checked={beforeEnd} onCheckedChange={(v) => setBeforeEnd(v === true)} className="mt-0.5" aria-label="Share before the event ends" />
                  <span>This event hasn't ended. I mean to share its participant data now, and my agreement with the sponsor allows it.</span>
                </label>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" className="h-9 px-2" onClick={() => setShowHistory((s) => !s)}><History className="mr-1.5 h-4 w-4" /> Sharing history ({history.data?.length ?? 0})</Button>
              <Button className="h-10 rounded-xl" disabled={busy || (!p.event.ended && !beforeEnd) || p.eligible === 0} onClick={() => void share()}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{current ? `Share updated data (version ${current.version + 1})` : "Confirm & Share Data"}
              </Button>
            </div>
            {showHistory && (
              <ul className="divide-y divide-border rounded-xl border border-border text-[12px]">
                {(history.data ?? []).length === 0 ? <li className="px-3 py-3 text-muted-foreground">Nothing shared yet.</li> : history.data!.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>Version {h.version} · {h.record_count.toLocaleString()} participants · {when(h.shared_at)}{h.shared_by_email ? ` · ${h.shared_by_email}` : ""}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {h.views} views · {h.exports} downloads
                      <Badge variant={h.status === "active" ? "default" : "secondary"} className="text-[10px]">{h.status === "superseded" ? "Replaced" : h.status === "revoked" ? "Revoked" : "Active"}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { SharePreview };
export default ShareDataDialog;
