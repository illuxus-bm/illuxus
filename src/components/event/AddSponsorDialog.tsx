import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, BadgeCheck, Building2, Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebounced } from "@/hooks/useOrgPeopleSearch";
import { sponsorship, type AddedSponsor, type SponsorOptionCompany, type SponsorOptionRecord } from "@/lib/sponsors/event-sponsorship";
import SponsorLogoUploader from "./SponsorLogoUploader";
import { friendlyError } from "@/lib/friendly-error";

interface Props {
  eventId: string;
  tiers: Array<{ value: string; label: string }>;
  presets: Array<{ id: string; label: string }>;
  onClose: () => void;
  onAdded: (added: AddedSponsor, customTitle: string | null) => void;
}

type Choice =
  | { kind: "record"; record: SponsorOptionRecord }
  | { kind: "company"; company: SponsorOptionCompany }
  | { kind: "new"; name: string };

const titleOf = (tier: string | null, label: string | null) =>
  tier === "custom" ? label || "Custom" : tier ? tier[0].toUpperCase() + tier.slice(1) : "";

/**
 * Adding a sponsor to an event, in one place: search, pick, set this event's
 * title. Picking one of the organisation's sponsors reuses that record, a
 * company from the directory starts the organisation's record of it, and only a
 * company nobody has heard of is entered as new. The server resolves all three
 * to one record per company (organizer_add_event_sponsor), so typing a known
 * company as new still doesn't create a repeat.
 */
export function AddSponsorDialog({ eventId, tiers, presets, onClose, onAdded }: Props) {
  const [text, setText] = useState("");
  const q = useDebounced(text, 200);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [tier, setTier] = useState("bronze");
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState({ email: "", website: "", logo_url: "", description: "" });
  const [busy, setBusy] = useState(false);
  const options = useQuery({
    queryKey: ["sponsor-options", eventId, q.trim()],
    queryFn: () => sponsorship.options(eventId, q.trim()),
    enabled: !choice, retry: false, placeholderData: (p) => p, staleTime: 15_000,
  });
  const records = options.data?.records ?? [];
  const companies = options.data?.companies ?? [];
  const typed = text.trim();
  const canAddNew = typed.length >= 2 && !options.data?.exact;

  // A sponsor keeps its usual title unless this event needs another.
  useEffect(() => {
    if (choice?.kind === "record" && choice.record.tier) {
      setTier(choice.record.tier);
      setLabel(choice.record.tier_label ?? "");
    }
    // What is on record comes along: a known company's, or what a sponsor's company has.
    if (choice?.kind === "record") setDetails({ email: choice.record.email ?? "", website: choice.record.website ?? "", logo_url: choice.record.logo_url ?? "", description: "" });
    if (choice?.kind === "company") setDetails({ email: "", website: choice.company.website ?? "", logo_url: choice.company.logo_url ?? "", description: "" });
    if (choice?.kind === "new") setDetails({ email: "", website: "", logo_url: "", description: "" });
  }, [choice]);

  const name = choice?.kind === "record" ? choice.record.name : choice?.kind === "company" ? choice.company.name : choice?.name ?? "";
  const presetSelected = tier === "custom" && presets.some((p) => p.label === label);

  const add = async () => {
    if (!choice) return;
    if (tier === "custom" && !label.trim()) { toast.error("Enter the partnership title"); return; }
    setBusy(true);
    try {
      const added = await sponsorship.addToEvent(eventId, {
        sponsorId: choice.kind === "record" ? choice.record.sponsor_id : undefined,
        companyId: choice.kind === "company" ? choice.company.company_id : undefined,
        name: choice.kind === "new" ? choice.name : undefined,
        tier, tierLabel: tier === "custom" ? label.trim() : null,
        ...details,
      });
      toast.success(added.created ? `${added.name} added` : `${added.name} added from your sponsors`);
      onAdded(added, tier === "custom" ? label.trim() : null);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>Add Sponsor</DialogTitle>
          <DialogDescription className="text-[12px]">{choice ? "This title applies to this event only." : "Search your sponsors and known companies first."}</DialogDescription>
        </DialogHeader>

        {!choice ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-5 py-3 sm:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="h-10 rounded-xl border-transparent bg-muted/60 pl-10 focus-visible:bg-background" placeholder="Company name, website or email" aria-label="Search for a sponsor or company" />
                {options.isFetching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div className="min-h-[14rem] flex-1 overflow-y-auto py-2">
              {options.isError && <p className="px-6 py-6 text-center text-[13px] text-destructive">{(options.error as Error).message}</p>}
              {records.length > 0 && (
                <section>
                  <h3 className="px-5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:px-6">Your sponsors</h3>
                  <ul>
                    {records.map((r) => (
                      <li key={r.sponsor_id}>
                        <button type="button" disabled={r.on_event} onClick={() => setChoice({ kind: "record", record: r })}
                                className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent sm:px-6">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                            {r.logo_url ? <img src={r.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Award className="h-4 w-4 text-muted-foreground" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{r.company ?? r.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[r.website, r.events ? `${r.events} ${r.events === 1 ? "event" : "events"}` : null, titleOf(r.tier, r.tier_label)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          {r.on_event ? <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Check className="h-3 w-3" /> On this event</span> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {companies.length > 0 && (
                <section>
                  <h3 className="px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:px-6">Known companies</h3>
                  <ul>
                    {companies.map((c) => (
                      <li key={c.company_id}>
                        <button type="button" onClick={() => setChoice({ kind: "company", company: c })} className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-muted/50 sm:px-6">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                            {c.logo_url ? <img src={c.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 truncate text-[13px] font-medium">{c.name}{c.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />}</span>
                            {c.website && <span className="block truncate text-[11px] text-muted-foreground">{c.website}</span>}
                          </span>
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!options.isFetching && !options.isError && records.length === 0 && companies.length === 0 && (
                <p className="px-6 py-6 text-center text-[13px] text-muted-foreground">{typed ? "No match on record." : "No sponsors yet. Type a company name to begin."}</p>
              )}
            </div>
            {canAddNew && (
              <div className="border-t px-5 py-3 sm:px-6">
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setChoice({ kind: "new", name: typed })}>
                  <Plus className="h-4 w-4 shrink-0" /><span className="truncate">Add "{typed}" as a new company</span>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {choice.kind === "record" ? "Your existing sponsor; its details and team are kept" : choice.kind === "company" ? "Known company" : "New company"}
                  </span>
                </span>
                <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1" onClick={() => setChoice(null)}><ArrowLeft className="h-3.5 w-3.5" /> Change</Button>
              </div>
              {choice.kind === "new" && <p className="text-[12px] text-muted-foreground">This company isn't on record yet, so add its website and logo here.</p>}
              <div>
                <Label>Partnership title on this event</Label>
                <Select value={presetSelected ? `preset:${label}` : tier}
                        onValueChange={(v) => {
                          if (v.startsWith("preset:")) { setTier("custom"); setLabel(v.slice("preset:".length)); }
                          else { setTier(v); if (v !== "custom") setLabel(""); else setLabel(""); }
                        }}>
                  <SelectTrigger aria-label="Partnership title"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers.filter((t) => t.value !== "custom").map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    {presets.map((p) => <SelectItem key={p.id} value={`preset:${p.label}`}>{p.label}</SelectItem>)}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tier === "custom" && !presetSelected && (
                <div>
                  <Label htmlFor="add-sponsor-title">Title *</Label>
                  <Input id="add-sponsor-title" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Knowledge Partner" maxLength={40} />
                </div>
              )}
              <div>
                <Label htmlFor="add-sponsor-website">Website</Label>
                {choice.kind === "record" && choice.record.has_website
                  ? <p id="add-sponsor-website" className="mt-1 truncate text-[13px] text-muted-foreground">{details.website}</p>
                  : <Input id="add-sponsor-website" value={details.website} onChange={(e) => setDetails({ ...details, website: e.target.value })} placeholder="https://…" />}
              </div>
              <div>
                <Label>Logo{choice.kind === "record" ? " on this event" : ""}</Label>
                <div className="mt-1.5"><SponsorLogoUploader value={details.logo_url} onChange={(url) => setDetails({ ...details, logo_url: url || "" })} /></div>
              </div>
              {choice.kind !== "record" && (
                <>
                  <div><Label htmlFor="add-sponsor-email">Email</Label><Input id="add-sponsor-email" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} /></div>
                  <div><Label htmlFor="add-sponsor-description">Description</Label><Textarea id="add-sponsor-description" rows={3} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} /></div>
                </>
              )}
            </div>
            <div className="border-t px-5 py-3 sm:px-6">
              <Button className="w-full" disabled={busy} onClick={() => void add()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add to this event</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AddSponsorDialog;
