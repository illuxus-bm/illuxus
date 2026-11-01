import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Loader2, Mail, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PersonFieldsForm, { emptyPersonFields, validatePersonFields, type PersonFields } from "@/components/people/PersonFieldsForm";
import { useDebounced } from "@/hooks/useOrgPeopleSearch";
import { sponsorship, type SponsorshipDetail } from "@/lib/sponsors/event-sponsorship";

export type SponsorshipPanelTab = "company" | "sponsorship" | "team";

interface Props {
  eventSponsorId: string;
  sponsorName: string;
  initialTab?: SponsorshipPanelTab;
  onClose: () => void;
  onChanged: () => void;
  onInvite: (invite: { sponsorId: string; memberId?: string; recipient: string | null | undefined }) => void;
  onCopyInvite: (token: string) => void;
  onRemoveMember: (memberId: string) => Promise<void>;
}

const TIERS = [["platinum", "Platinum"], ["gold", "Gold"], ["silver", "Silver"], ["bronze", "Bronze"], ["custom", "Custom title"]];
const STATUSES = [["prospect", "Prospect"], ["proposed", "Proposed"], ["confirmed", "Confirmed"], ["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const PAYMENTS = [["not_invoiced", "Not invoiced"], ["invoiced", "Invoiced"], ["part_paid", "Part paid"], ["paid", "Paid"], ["overdue", "Overdue"], ["waived", "Waived"]];

const titleOf = (tier: string | null, label: string | null) =>
  tier === "custom" ? label || "Custom" : TIERS.find(([v]) => v === tier)?.[1] ?? tier ?? "—";
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className="text-muted-foreground">{label}</span><div className="break-words">{children || "—"}</div></div>;
}

/**
 * One sponsor on one event: the company it belongs to, this event's sponsorship,
 * and the people working on it. Everything comes through functions that check the
 * caller's access to the event (migration 066), so other organisers' events and
 * contacts don't appear, and commercial details only for those allowed to see them.
 */
export function SponsorshipPanel({ eventSponsorId, sponsorName, initialTab = "team", onClose, onChanged, onInvite, onCopyInvite, onRemoveMember }: Props) {
  const queryClient = useQueryClient();
  const key = ["sponsorship", eventSponsorId];
  const query = useQuery({ queryKey: key, queryFn: () => sponsorship.detail(eventSponsorId), retry: false, refetchOnWindowFocus: false });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: key }); onChanged(); };
  const data = query.data;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="text-base font-semibold leading-tight">{data?.company?.name ?? sponsorName}</SheetTitle>
          <SheetDescription className="text-[12px]">
            {data ? titleOf(data.sponsorship.tier, data.sponsorship.tier_label) : "Sponsorship"} on this event
          </SheetDescription>
        </SheetHeader>
        {!data ? (
          <p className="mt-6 flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
            {query.isError ? (query.error as Error).message : <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>}
          </p>
        ) : (
          <Tabs defaultValue={initialTab} className="mt-4 pb-8">
            <TabsList className="h-9">
              <TabsTrigger value="company">Company profile</TabsTrigger>
              <TabsTrigger value="sponsorship">Event sponsorship</TabsTrigger>
              <TabsTrigger value="team">Sponsor team ({data.team.filter((m) => m.assigned).length})</TabsTrigger>
            </TabsList>
            <TabsContent value="company"><CompanyTab data={data} eventSponsorId={eventSponsorId} /></TabsContent>
            <TabsContent value="sponsorship"><SponsorshipTab data={data} eventSponsorId={eventSponsorId} onSaved={refresh} /></TabsContent>
            <TabsContent value="team">
              <TeamTab data={data} eventSponsorId={eventSponsorId} onChanged={refresh} onInvite={onInvite} onCopyInvite={onCopyInvite} onRemoveMember={onRemoveMember} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CompanyTab({ data, eventSponsorId }: { data: SponsorshipDetail; eventSponsorId: string }) {
  const contacts = useQuery({ queryKey: ["sponsorship-contacts", eventSponsorId, ""], queryFn: () => sponsorship.searchContacts(eventSponsorId, ""), retry: false });
  const c = data.company;
  return (
    <div className="space-y-4 pt-2 text-[13px]">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {c ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact label="Company">{c.name}</Fact>
            <Fact label="Website">{c.website}</Fact>
            <Fact label="Domains">{c.domains.join(", ")}</Fact>
            <Fact label="Industry">{c.industry}</Fact>
            <div className="sm:col-span-2"><Fact label="About">{c.description}</Fact></div>
          </div>
        ) : <p className="text-muted-foreground">This sponsor isn't connected to a company yet. It connects when you add a team member or save a usable name.</p>}
      </div>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Company contacts you can use</h3>
        {(contacts.data ?? []).length === 0 ? <p className="text-muted-foreground">None yet.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {contacts.data!.map((k) => <li key={k.member_id} className="px-4 py-2"><span className="font-medium">{k.name || k.email}</span> <span className="text-muted-foreground">{[k.designation, k.email].filter(Boolean).join(" · ")}</span></li>)}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Other sponsorships on your events</h3>
        {data.history.length === 0 ? <p className="text-muted-foreground">None on events you manage.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.history.map((h) => (
              <li key={h.event_sponsor_id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate">{h.event}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{titleOf(h.tier, h.tier_label)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SponsorshipTab({ data, eventSponsorId, onSaved }: { data: SponsorshipDetail; eventSponsorId: string; onSaved: () => void }) {
  const s = data.sponsorship;
  const commercial = data.access === "commercial";
  const initial = {
    tier: s.tier ?? "bronze", tier_label: s.tier_label ?? "", package: s.package ?? "", deliverables: s.deliverables ?? "", status: s.status, notes: s.notes ?? "",
    commercial_value: s.commercial_value?.toString() ?? "", currency: s.currency ?? "INR", contract_url: s.contract_url ?? "", payment_status: s.payment_status ?? "not_invoiced",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (form.tier === "custom" && !form.tier_label.trim()) { toast.error("Enter the partnership title"); return; }
    if (commercial && form.commercial_value && Number.isNaN(Number(form.commercial_value))) { toast.error("Commercial value must be a number"); return; }
    const changes: Record<string, unknown> = {
      tier: form.tier, tier_label: form.tier === "custom" ? form.tier_label : null,
      package: form.package, deliverables: form.deliverables, status: form.status, notes: form.notes,
    };
    if (commercial) Object.assign(changes, { commercial_value: form.commercial_value, currency: form.currency, contract_url: form.contract_url, payment_status: form.payment_status });
    setBusy(true);
    try { await sponsorship.update(eventSponsorId, changes); toast.success("Saved for this event"); onSaved(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Choice label="Partnership title" value={form.tier} options={TIERS} onChange={set("tier")} />
        {form.tier === "custom"
          ? <div><Label className="text-[12px]" htmlFor="sponsorship-title">Title</Label><Input id="sponsorship-title" value={form.tier_label} onChange={(e) => set("tier_label")(e.target.value)} placeholder="e.g. Knowledge Partner" /></div>
          : <Choice label="Status" value={form.status} options={STATUSES} onChange={set("status")} />}
        {form.tier === "custom" && <Choice label="Status" value={form.status} options={STATUSES} onChange={set("status")} />}
        <div><Label className="text-[12px]" htmlFor="sponsorship-package">Package</Label><Input id="sponsorship-package" value={form.package} onChange={(e) => set("package")(e.target.value)} /></div>
      </div>
      <div><Label className="text-[12px]" htmlFor="sponsorship-deliverables">Deliverables</Label><Textarea id="sponsorship-deliverables" rows={3} value={form.deliverables} onChange={(e) => set("deliverables")(e.target.value)} /></div>
      {commercial ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Commercial</p>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div><Label className="text-[12px]" htmlFor="sponsorship-value">Value</Label><Input id="sponsorship-value" inputMode="decimal" value={form.commercial_value} onChange={(e) => set("commercial_value")(e.target.value)} /></div>
            <div><Label className="text-[12px]" htmlFor="sponsorship-currency">Currency</Label><Input id="sponsorship-currency" value={form.currency} onChange={(e) => set("currency")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Choice label="Payment" value={form.payment_status} options={PAYMENTS} onChange={set("payment_status")} />
            <div><Label className="text-[12px]" htmlFor="sponsorship-contract">Contract link</Label><Input id="sponsorship-contract" value={form.contract_url} onChange={(e) => set("contract_url")(e.target.value)} placeholder="https://…" /></div>
          </div>
        </div>
      ) : <p className="text-[12px] text-muted-foreground">Commercial details are visible to the event owner and organisation admins.</p>}
      <div><Label className="text-[12px]" htmlFor="sponsorship-notes">Notes for this event</Label><Textarea id="sponsorship-notes" rows={2} value={form.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Applies to this event only. Other events keep their own title and details.</p>
        <Button size="sm" onClick={() => void save()} disabled={busy}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save</Button>
      </div>
    </div>
  );
}

function TeamTab({ data, eventSponsorId, onChanged, onInvite, onCopyInvite, onRemoveMember }: {
  data: SponsorshipDetail; eventSponsorId: string; onChanged: () => void;
} & Pick<Props, "onInvite" | "onCopyInvite" | "onRemoveMember">) {
  const company = data.company?.name ?? data.sponsor.name;
  const [mode, setMode] = useState<"new" | "existing" | null>(null);
  const [form, setForm] = useState<PersonFields>(() => emptyPersonFields());
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const known = useQuery({
    queryKey: ["sponsorship-contacts", eventSponsorId, debounced],
    queryFn: () => sponsorship.searchContacts(eventSponsorId, debounced),
    enabled: mode === "existing", retry: false,
  });
  const invite = (memberId: string, recipient: string) => onInvite({ sponsorId: data.sponsor.id, memberId, recipient });

  const addNew = async () => {
    // Checked with the sponsor's company filled in; the server sets the real one.
    const v = validatePersonFields({ ...form, company });
    if (!v.ok) { toast.error(v.error); return; }
    setBusy(true);
    try {
      const r = await sponsorship.addContact(eventSponsorId, {
        title: form.title, first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim().toLowerCase(),
        designation: form.designation.trim(), mobile_country_code: form.mobile_country_code, mobile_number: form.mobile_number.trim(),
        linkedin_url: form.linkedin_url.trim() || undefined, role_label: role.trim() || undefined,
      });
      toast.success(r.existing ? "Already on the team; added to this event" : `Added to ${company}`);
      // A new member's invitation goes out by email; the copy-link button stays as a fallback.
      if (!r.existing) invite(r.member_id, form.email.trim().toLowerCase());
      setForm(emptyPersonFields());
      setRole("");
      setMode(null);
      onChanged();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const assign = async (memberId: string, email: string) => {
    setBusy(true);
    try {
      const r = await sponsorship.assignContact(eventSponsorId, memberId, role.trim() || undefined);
      toast.success("Added to this event");
      if (r.new_member) invite(r.member_id, email);
      setRole("");
      void known.refetch();
      onChanged();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const setAssigned = async (memberId: string, assigned: boolean, roleLabel: string | null) => {
    try { await sponsorship.setContact(eventSponsorId, memberId, roleLabel, !assigned); onChanged(); } catch (e) { fail(e); }
  };

  return (
    <div className="space-y-4 pt-2 text-[13px]">
      <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px]">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>Everyone added here joins <strong>{company}</strong>.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode(mode === "new" ? null : "new")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add new contact</Button>
        <Button size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode(mode === "existing" ? null : "existing")}><UserCheck className="mr-1.5 h-3.5 w-3.5" /> Add existing contact</Button>
      </div>
      {mode && (
        <div>
          <Label className="text-[12px]" htmlFor="sponsor-contact-role">Role on this event (optional)</Label>
          <Input id="sponsor-contact-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Event lead" />
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <PersonFieldsForm value={form} onChange={setForm} hideCompany />
          <Button size="sm" className="w-full" disabled={busy} onClick={() => void addNew()}>Add and send invitation</Button>
        </div>
      )}
      {mode === "existing" && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-8 pl-8 text-[13px]" placeholder="Name, email, phone or designation" aria-label="Search company contacts" />
          </div>
          {(known.data ?? []).length === 0
            ? <p className="py-3 text-center text-muted-foreground">{known.isFetching ? "Searching…" : "No company contacts found."}</p>
            : (
              <ul className="divide-y divide-border">
                {known.data!.map((k) => (
                  <li key={k.member_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{k.name || k.email}</span><span className="block truncate text-[11px] text-muted-foreground">{[k.designation, k.email, k.phone].filter(Boolean).join(" · ")}</span></span>
                    {k.assigned ? <span className="shrink-0 text-[11px] text-muted-foreground">On this event</span>
                      : <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => void assign(k.member_id, k.email)}>Add</Button>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
      {data.team.length === 0 ? <p className="py-6 text-center text-muted-foreground">No team members yet.</p> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.team.map((m) => (
            <li key={m.id} className="space-y-1.5 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name || m.email}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{m.designation ? `${m.designation} · ` : ""}{m.email}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{m.accepted_at ? "Active" : "Invited"}</Badge>
                {!m.accepted_at && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Resend invitation email" aria-label={`Resend invitation email to ${m.email}`} onClick={() => invite(m.id, m.email)}><Mail className="h-3.5 w-3.5" /></Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy invite link" aria-label={`Copy invite link for ${m.email}`} onClick={() => onCopyInvite(m.invite_token)}><Copy className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Remove from the sponsor's team" aria-label={`Remove ${m.email} from the team`}
                        onClick={() => void onRemoveMember(m.id).then(onChanged)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <AssignmentRow member={m} onSet={setAssigned} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Members see speakers and registered attendees for events this sponsor is attached to — without email or phone.</p>
    </div>
  );
}

function AssignmentRow({ member, onSet }: { member: SponsorshipDetail["team"][number]; onSet: (id: string, assigned: boolean, role: string | null) => Promise<void> }) {
  const [role, setRole] = useState(member.role_label ?? "");
  useEffect(() => setRole(member.role_label ?? ""), [member.role_label]);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <label className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <input type="checkbox" checked={member.assigned} onChange={(e) => void onSet(member.id, e.target.checked, role.trim() || null)} />
        On this event
      </label>
      {member.assigned && (
        <Input value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => { if (role.trim() !== (member.role_label ?? "")) void onSet(member.id, true, role.trim() || null); }}
               className="h-7 text-[12px]" placeholder="Role on this event" aria-label={`Role of ${member.email} on this event`} />
      )}
    </div>
  );
}

export default SponsorshipPanel;
