import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { COMPANY_FIELDS, PERSON_FIELDS, confidenceBand, intel, mergeOptions, reasonLabel, type Entity } from "@/lib/intelligence/admin-api";
import { cn } from "@/lib/utils";

interface Props {
  entity: Entity;
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
  /** The scan's confidence and reasons, when this came from a duplicate suggestion. */
  match?: { score: number; reasons: string[] };
}

const IMPACT_LABELS: Record<string, string> = {
  registrations: "Event registrations", events: "Events", speaker_records: "Speaker records", sponsor_contacts: "Sponsor-team records",
  emails: "Email addresses", phones: "Phone numbers", affiliations: "Company affiliations", contacts: "Contacts",
  sponsors: "Sponsor records", sponsorships: "Sponsorship records", subsidiaries: "Subsidiaries", domains: "Domains", identifiers: "Registry identifiers",
};

/**
 * Side-by-side merge of two or more contacts or companies. The chosen
 * survivor keeps its id; the others point at it. Each field's final value
 * is picked here; the impact (what moves) is shown before confirming, and
 * the merge runs in one transaction on the server (intel_merge_people /
 * intel_merge_companies) and can be rolled back from the audit history.
 */
export function MergeDialog({ entity, ids, open, onOpenChange, onMerged, match }: Props) {
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [survivor, setSurvivor] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [impact, setImpact] = useState<Record<string, number | boolean> | null>(null);
  const [reason, setReason] = useState("");
  const [allowDistinct, setAllowDistinct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [consolidate, setConsolidate] = useState(true);
  const fields = entity === "person" ? PERSON_FIELDS : COMPANY_FIELDS;

  useEffect(() => {
    if (!open || ids.length < 2) return;
    let live = true;
    setLoading(true);
    setChoices({}); setReason(""); setAllowDistinct(false); setImpact(null); setConfirming(false); setConsolidate(true);
    Promise.all(ids.map((id) => (entity === "person" ? intel.contact(id) : intel.company(id))))
      .then((details) => {
        if (!live) return;
        const rows = details.map((d) => (entity === "person" ? d.person : d.company) as Record<string, unknown>);
        setRecords(rows);
        // A record with a login has to survive: accounts are never moved.
        const withAccount = rows.findIndex((r) => r.user_id);
        setSurvivor(withAccount >= 0 ? withAccount : 0);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [open, ids, entity]);

  const survivorRecord = records[survivor];
  const others = useMemo(() => records.filter((_, i) => i !== survivor).map((r) => String(r.id)), [records, survivor]);

  useEffect(() => {
    if (!survivorRecord || others.length === 0) return;
    let live = true;
    intel.mergePreview(entity, String(survivorRecord.id), others).then((p) => live && setImpact(p)).catch(() => live && setImpact(null));
    return () => { live = false; };
  }, [entity, survivorRecord, others]);

  const accountsElsewhere = records.some((r, i) => i !== survivor && r.user_id);
  const distinct = entity === "company" && impact && (impact.distinct_legal_entities || impact.parent_child);

  const finalValue = (field: string) => choices[field] ?? String(survivorRecord?.[field] ?? "");

  const confirm = async () => {
    if (!survivorRecord) return;
    // Only fields whose final value differs from the survivor's are sent.
    const changed: Record<string, string | null> = {};
    for (const [field] of fields) {
      const now = String(survivorRecord[field] ?? "");
      if (choices[field] !== undefined && choices[field] !== now) changed[field] = choices[field] || null;
    }
    setBusy(true);
    try {
      if (entity === "person") await intel.mergePeople(String(survivorRecord.id), others, changed, reason.trim());
      else await intel.mergeCompanies(String(survivorRecord.id), others, changed, reason.trim(), allowDistinct);
      toast.success(`${others.length + 1} records merged`, { description: "You can roll this back from Audit history." });
      if (hasSponsors && consolidate) {
        const r = await intel.consolidateSponsors(String(survivorRecord.id), reason.trim());
        if (r.merged > 0) toast.success(`${r.merged} repeat sponsor ${r.merged === 1 ? "record" : "records"} combined`, { description: "Every event kept its own title." });
        if (r.skipped.length > 0) toast.message("Some sponsor records stayed separate", { description: r.skipped[0].reason });
      }
      onOpenChange(false);
      onMerged();
    } catch (e) {
      toast.error("Merge not done — nothing was changed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const hasSponsors = entity === "company" && Number(impact?.sponsors ?? 0) > 0;
  const title = (r: Record<string, unknown>) => String((entity === "person" ? r.display_name : r.name) ?? "Unnamed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge {entity === "person" ? "contacts" : "companies"}</DialogTitle>
          <DialogDescription>
            The surviving record keeps its ID; the others are folded into it and point to it. Choose the correct value for each field.
          </DialogDescription>
          {match && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant="secondary">{match.score}% · {confidenceBand(match.score).label}</Badge>
              {match.reasons.map((r) => <Badge key={r} variant="outline" className="text-[11px] font-normal">{reasonLabel(r)}</Badge>)}
            </div>
          )}
        </DialogHeader>

        {loading || !survivorRecord ? (
          <p className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading records…</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-40">Field</th>
                    {records.map((r, i) => (
                      <th key={String(r.id)} className={cn("px-3 py-2 text-left font-medium", i === survivor && "bg-primary/10")}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input type="radio" name="survivor" checked={i === survivor} onChange={() => setSurvivor(i)}
                                 disabled={accountsElsewhere && !r.user_id && records.some((x) => x.user_id)} />
                          <span className="truncate">{title(r)}</span>
                          {i === survivor && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"><Crown className="h-3 w-3" /> Survives</span>}
                        </label>
                        <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                          {String(r.id).slice(0, 8)} · created {String(r.created_at ?? "").slice(0, 10)}{r.user_id ? " · has login" : ""}
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium w-56">Final value</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([field, label]) => {
                    const options = mergeOptions(records, field, survivor);
                    return (
                      <tr key={field} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{label}</td>
                        {records.map((r, i) => {
                          const v = String(r[field] ?? "");
                          const chosen = finalValue(field) === v;
                          return (
                            <td key={String(r.id)} className={cn("px-3 py-2", i === survivor && "bg-primary/5")}>
                              <button type="button" disabled={options.length < 2}
                                      onClick={() => setChoices((c) => ({ ...c, [field]: v }))}
                                      className={cn("w-full rounded-md border px-2 py-1 text-left", chosen ? "border-primary bg-primary/10" : "border-transparent hover:border-border", options.length < 2 && "cursor-default")}>
                                {v || <span className="text-muted-foreground">—</span>}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 font-medium">{finalValue(field) || <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {accountsElsewhere && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                A record being folded in has a login account. Accounts are never merged or moved — make that record the survivor, or leave these separate.
              </p>
            )}

            <div className="rounded-lg border p-3">
              <p className="text-[13px] font-medium">What this merge moves to the survivor</p>
              {impact ? (
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
                  {Object.entries(impact).filter(([k, v]) => typeof v === "number" && IMPACT_LABELS[k]).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{IMPACT_LABELS[k]}</span><span className="font-medium tabular-nums">{String(v)}</span></div>
                  ))}
                </div>
              ) : <p className="mt-1 text-[12px] text-muted-foreground">Calculating…</p>}
              <p className="mt-2 text-[12px] text-muted-foreground">
                Registrations, attendance, tickets and payments keep exactly what was recorded; only which {entity === "person" ? "person" : "company"} they belong to changes.
                {entity === "company" && " The folded-in names are kept as former names of the survivor."}
              </p>
            </div>

            {hasSponsors && (
              <label className="flex items-start gap-2 rounded-md border p-3 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={consolidate} onChange={(e) => setConsolidate(e.target.checked)} />
                <span>
                  Also combine each organiser's repeat sponsor records for this company.
                  <span className="block text-[12px] text-muted-foreground">Every event keeps its title and logo. Records with different titles on one event stay separate, and each merge can be rolled back.</span>
                </span>
              </label>
            )}

            {distinct && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={allowDistinct} onChange={(e) => setAllowDistinct(e.target.checked)} />
                <span>
                  These look like <strong>separate legal entities</strong> ({impact?.distinct_legal_entities ? "different registry identifiers" : "parent and subsidiary"}).
                  I have checked and they are the same company.
                </span>
              </label>
            )}

            <div>
              <label htmlFor="merge-reason" className="text-[13px] font-medium">Reason (kept in the audit history)</label>
              <Textarea id="merge-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 text-[13px]"
                        placeholder="e.g. Same person — same phone, same LinkedIn, registered twice with different emails" />
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <p className="mr-auto self-center text-[13px]">Merge {others.length} into “{survivorRecord ? title(survivorRecord) : ""}”?</p>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Back</Button>
              <Button onClick={() => void confirm()} disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Merging…</> : "Confirm merge"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setConfirming(true)}
                      disabled={loading || !survivorRecord || accountsElsewhere || reason.trim().length < 3 || (!!distinct && !allowDistinct)}>
                {`Merge into “${survivorRecord ? title(survivorRecord) : ""}”`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MergeDialog;
