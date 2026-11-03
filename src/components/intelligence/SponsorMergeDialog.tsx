import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { intel, sponsorshipTitle, type SponsorMergePreview } from "@/lib/intelligence/admin-api";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly-error";

interface Props {
  ids: string[];
  onClose: () => void;
  onMerged: () => void;
}

/**
 * Combines an organisation's sponsor records for a company. Shows each record's
 * events and titles first; every event keeps its own. The server refuses records of
 * different organisations, or with different titles on one event.
 */
export function SponsorMergeDialog({ ids, onClose, onMerged }: Props) {
  const [survivor, setSurvivor] = useState(ids[0]);
  const [preview, setPreview] = useState<SponsorMergePreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = ids.filter((id) => id !== survivor);

  useEffect(() => {
    let live = true;
    intel.sponsorMergePreview(survivor, ids.filter((id) => id !== survivor))
      .then((p) => live && setPreview(p))
      .catch((e) => toast.error(friendlyError(e)));
    return () => { live = false; };
  }, [survivor, ids]);

  const blocked = preview && (!preview.same_owner || !preview.same_company || preview.conflicts.length > 0);
  const merge = async () => {
    setBusy(true);
    try {
      await intel.mergeSponsors(survivor, others, reason.trim());
      toast.success("Sponsor records combined", { description: "Every event kept its title. You can roll this back from Audit history." });
      onMerged();
      onClose();
    } catch (e) {
      toast.error("Not merged — nothing was changed", { description: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Combine sponsor records</DialogTitle>
          <DialogDescription>Choose the record to keep. Events, teams and meetings from the others move to it.</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading records…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {preview.records.map((r) => (
                <label key={r.id} className={cn("cursor-pointer space-y-2 rounded-xl border p-3 text-[13px]", r.id === survivor ? "border-primary bg-primary/5" : "border-border")}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="sponsor-survivor" checked={r.id === survivor} onChange={() => { setSurvivor(r.id); setConfirming(false); }} />
                    <span className="truncate font-medium">{r.name}</span>
                    {r.id === survivor && <Badge className="ml-auto text-[10px]">Keep</Badge>}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{[r.company, r.website, r.owner].filter(Boolean).join(" · ")} · {r.team} team</span>
                  {r.events.length === 0 ? <span className="block text-muted-foreground">No events</span> : (
                    <ul className="space-y-0.5">
                      {r.events.map((e, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{e.event}</span><span className="shrink-0 text-muted-foreground">{sponsorshipTitle(e.tier, e.tier_label)}</span></li>)}
                    </ul>
                  )}
                </label>
              ))}
            </div>
            {blocked && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {!preview.same_owner ? "These belong to different organisations. A sponsor's team sees every event of its record, so they stay separate, under one company."
                  : !preview.same_company ? "Connect these records to the same company first."
                  : `Different titles on ${preview.conflicts.join(", ")}. Those may be separate agreements, so these records stay separate.`}
              </p>
            )}
            {preview.repeats > 0 && !blocked && (
              <p className="text-[12px] text-muted-foreground">{preview.repeats} {preview.repeats === 1 ? "event has" : "events have"} this company twice with the same title; those entries become one.</p>
            )}
            <div>
              <label htmlFor="sponsor-merge-reason" className="text-[13px] font-medium">Reason (kept in the audit history)</label>
              <Textarea id="sponsor-merge-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 text-[13px]" />
            </div>
          </div>
        )}
        <DialogFooter>
          {confirming ? (
            <>
              <p className="mr-auto self-center text-[13px]">Combine {others.length + 1} records into one?</p>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Back</Button>
              <Button onClick={() => void merge()} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={!preview || !!blocked || reason.trim().length < 3} onClick={() => setConfirming(true)}>Combine records</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SponsorMergeDialog;
