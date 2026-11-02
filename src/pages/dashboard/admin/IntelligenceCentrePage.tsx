/**
 * Super Admin — Intelligence Centre (/dashboard/admin/intelligence).
 *
 * Contacts, companies and sponsors across Illuxus: an overview of data quality,
 * searchable records with field-level editing and history, scored duplicate
 * suggestions, side-by-side merges with an impact preview, sponsor connections,
 * data corrections, a review queue, and the audit history with rollback.
 *
 * Lists page, sort and filter on the server. Results are cached and the
 * current page stays on screen while the next one loads, and sections stay
 * mounted once visited, so nothing blanks out or loses its filters.
 *
 * Every action is a Super-Admin-only database function (migrations 064 to 067)
 * that checks the role itself and records what it did; this page hiding
 * itself from others is not the protection.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, ClipboardCheck, Copy, GitMerge, Handshake, History, LayoutGrid,
  Loader2, MoreHorizontal, RefreshCw, RotateCcw, Users, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeDialog } from "@/components/intelligence/MergeDialog";
import { CompanyPicker, RecordDrawer } from "@/components/intelligence/RecordDrawer";
import { SponsorMergeDialog } from "@/components/intelligence/SponsorMergeDialog";
import {
  Chips, Empty, FilterSelect, KpiTile, NoData, PERIODS, Pager, SearchBox, SortHead, TableShell, fail, filterInput, periodStart, td, th, tr, useIntelQuery, usePager, type Sort,
} from "@/components/intelligence/parts";
import { useDebounced } from "@/hooks/useOrgPeopleSearch";
import {
  confidenceBand, intel, reasonLabel, sponsorshipTitle,
  type CompanyRow, type ContactRow, type Entity, type Suggestion,
} from "@/lib/intelligence/admin-api";
import { cn } from "@/lib/utils";

const TABS = [
  ["overview", "Overview", LayoutGrid], ["contacts", "Contacts", Users], ["companies", "Companies", Building2], ["sponsors", "Sponsors", Handshake],
  ["duplicates", "Duplicate Detection", Copy], ["merge", "Merge Centre", GitMerge], ["corrections", "Data Correction", Wand2],
  ["review", "Review Queue", ClipboardCheck], ["audit", "Audit History", History],
] as const;
type Tab = (typeof TABS)[number][0];
type MergeRequest = { entity: Entity; ids: string[]; match?: { score: number; reasons: string[] } };

const DEBOUNCE_MS = 250;
const ENTITY_OPTIONS = [["person", "Contacts"], ["company", "Companies"]];

export default function IntelligenceCentrePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const go = (t: Tab, extra: Record<string, string> = {}) => setParams({ tab: t, ...extra });
  const [drawer, setDrawer] = useState<{ entity: Entity; id: string } | null>(null);
  const [merge, setMerge] = useState<MergeRequest | null>(null);
  const [sponsorMerge, setSponsorMerge] = useState<string[] | null>(null);
  const [merges, setMerges] = useState(0);
  const queryClient = useQueryClient();
  const refresh = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["intel"] }); }, [queryClient]);
  // A section mounts on its first visit and then stays, hidden, so its filters and page survive.
  const visited = useRef(new Set<Tab>());
  visited.current.add(tab);
  const panel = (t: Tab, content: ReactNode) => (
    <TabsContent value={t} forceMount hidden={tab !== t} className="mt-4">{visited.current.has(t) && content}</TabsContent>
  );
  // A filter in the link applies only to the section it was sent to.
  const linked = (t: Tab, name: string) => (tab === t ? params.get(name) : null);
  const open = (entity: Entity, id: string) => setDrawer({ entity, id });
  const startMerge = (entity: Entity, ids: string[], match?: MergeRequest["match"]) => setMerge({ entity, ids, match });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Intelligence Centre</h1>
            <p className="text-sm text-muted-foreground">Correct, de-duplicate and connect contacts, companies and sponsors, with every change recorded</p>
          </div>
          <Button variant="outline" className="h-10 rounded-xl px-4 font-medium" onClick={refresh}><RefreshCw className="mr-1.5 h-4 w-4" /> Refresh</Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => go(v as Tab)}>
          <div className="overflow-x-auto">
            <TabsList className="h-10 w-max rounded-xl p-1">
              {TABS.map(([t, label, Icon]) => (
                <TabsTrigger key={t} value={t} className="h-8 gap-1.5 rounded-lg text-[13px]"><Icon className="h-3.5 w-3.5" /> {label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          {panel("overview", <OverviewTab go={go} />)}
          {panel("contacts", <RecordsTab entity="person" linkedFilter={linked("contacts", "filter")} merges={merges} onOpen={(id) => open("person", id)} onMerge={(ids) => startMerge("person", ids)} />)}
          {panel("companies", <RecordsTab entity="company" linkedFilter={linked("companies", "filter")} merges={merges} onOpen={(id) => open("company", id)} onMerge={(ids) => startMerge("company", ids)} />)}
          {panel("sponsors", <SponsorsTab linkedFilter={linked("sponsors", "filter")} refresh={refresh} onOpenCompany={(id) => open("company", id)} onMergeRecords={setSponsorMerge} />)}
          {panel("duplicates", <DuplicatesTab linkedEntity={linked("duplicates", "entity") as Entity | null} linkedStatus={linked("duplicates", "status")} refresh={refresh} onOpen={open} onMerge={startMerge} />)}
          {panel("merge", <MergeCentreTab refresh={refresh} onOpen={open} onMerge={startMerge} onMergeRecords={setSponsorMerge} />)}
          {panel("corrections", <CorrectionsTab refresh={refresh} onOpen={open} />)}
          {panel("review", <ReviewTab go={go} onOpen={open} onMerge={startMerge} onMergeRecords={setSponsorMerge} />)}
          {panel("audit", <AuditTab refresh={refresh} />)}
        </Tabs>
      </div>
      {drawer && <RecordDrawer entity={drawer.entity} id={drawer.id} onClose={() => setDrawer(null)} onChanged={refresh} />}
      {merge && <MergeDialog entity={merge.entity} ids={merge.ids} match={merge.match} open onOpenChange={(o) => !o && setMerge(null)} onMerged={() => { setMerges((n) => n + 1); refresh(); }} />}
      {sponsorMerge && <SponsorMergeDialog ids={sponsorMerge} onClose={() => setSponsorMerge(null)} onMerged={refresh} />}
    </DashboardLayout>
  );
}

function OverviewTab({ go }: { go: (t: Tab, extra?: Record<string, string>) => void }) {
  const [period, setPeriod] = useState("all");
  const [text, setText] = useState({ country: "", industry: "" });
  const typed = useDebounced(text, DEBOUNCE_MS);
  const query = useIntelQuery(["overview", period, typed], () => intel.overview({ from: periodStart(period), ...typed }));
  const d = query.data;
  const loading = !d && !query.isError;
  const attention: Array<[string, number | undefined, () => void]> = d ? [
    ["Contacts needing verification", d.people.unverified, () => go("contacts", { filter: "unverified" })],
    ["Incomplete contacts", d.people.incomplete, () => go("contacts", { filter: "incomplete" })],
    ["Contacts without a company", d.people.without_company, () => go("contacts", { filter: "no_company" })],
    ["Companies without a domain", d.companies.missing_domain, () => go("companies", { filter: "no_domain" })],
    ["Provisional companies", d.companies.provisional, () => go("companies", { filter: "provisional" })],
    ["Sponsors without a company", d.sponsors_unconnected, () => go("sponsors", { filter: "unconnected" })],
    ["Repeat sponsor records", d.sponsors_repeats, () => go("sponsors", { filter: "repeats" })],
    ["Flagged for manual review", d.flagged, () => go("duplicates", { status: "flagged" })],
  ] : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chips label="Records created in" value={period} onChange={setPeriod} options={PERIODS} />
        <Input value={text.country} onChange={(e) => setText({ ...text, country: e.target.value })} className={cn(filterInput, "w-36")} placeholder="Any country" aria-label="Country" />
        <Input value={text.industry} onChange={(e) => setText({ ...text, industry: e.target.value })} className={cn(filterInput, "w-36")} placeholder="Any industry" aria-label="Industry" />
        {query.isFetching && d && <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span>}
      </div>
      {query.isError && !d ? <NoData query={query} /> : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <KpiTile icon={Users} label="Total contacts" value={d?.people.contacts} loading={loading} hint={d && `${d.people.quality}% data quality`} onClick={() => go("contacts")} />
          <KpiTile icon={Building2} label="Total companies" value={d?.companies.companies} loading={loading} hint={d && `${d.companies.provisional.toLocaleString()} provisional`} onClick={() => go("companies")} />
          <KpiTile icon={Handshake} label="Sponsor identities" value={d?.sponsor_identities} loading={loading} hint="One per company" onClick={() => go("sponsors")} />
          <KpiTile icon={ClipboardCheck} label="Event sponsorships" value={d?.event_sponsorships} loading={loading} hint="Across all events" onClick={() => go("sponsors")} />
          <KpiTile icon={Copy} label="Potential duplicate contacts" value={d?.duplicate_contacts} loading={loading} hint="Score 60 or more" onClick={() => go("duplicates", { entity: "person" })} />
          <KpiTile icon={Copy} label="Potential duplicate companies" value={d?.duplicate_companies} loading={loading} hint="Score 60 or more" onClick={() => go("duplicates", { entity: "company" })} />
          <KpiTile icon={AlertTriangle} label="Corrections pending" value={d?.corrections_open} loading={loading} hint={d && `${d.corrections_safe} formatting-only`} onClick={() => go("corrections")} />
          <KpiTile icon={GitMerge} label="Merge recommendations" value={d?.merge_recommendations} loading={loading} hint="High confidence" onClick={() => go("merge")} />
        </div>
      )}
      {attention.length > 0 && (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead><tr className="border-b border-border"><th className={th}>Needs attention</th><th className={cn(th, "w-24 text-right")}>Records</th></tr></thead>
          <tbody>
            {attention.map(([label, n, onClick]) => (
              <tr key={label} className={cn(tr, "cursor-pointer hover:bg-muted/20")} onClick={onClick}>
                <td className="px-4 py-2.5"><button type="button" className="text-left">{label}</button></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{n}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function RecordsTab({ entity, linkedFilter, merges, onOpen, onMerge }: {
  entity: Entity; linkedFilter: string | null; merges: number; onOpen: (id: string) => void; onMerge: (ids: string[]) => void;
}) {
  const person = entity === "person";
  const [text, setText] = useState({ q: "", country: "", industry: "" });
  const typed = useDebounced(text, DEBOUNCE_MS);
  const [filter, setFilter] = useState(linkedFilter ?? "all");
  const [sort, setSort] = useState<Sort>({ column: person ? "updated" : "entries", dir: "desc" });
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (linkedFilter) setFilter(linkedFilter); }, [linkedFilter]);
  useEffect(() => setPicked([]), [merges]);
  const onSort = (column: string) => setSort((s) => (s.column === column
    ? { column, dir: s.dir === "asc" ? "desc" : "asc" }
    // Words read best A to Z first; counts and dates, largest and latest first.
    : { column, dir: ["name", "company", "designation", "industry"].includes(column) ? "asc" : "desc" }));
  const pager = usePager(JSON.stringify([typed, filter, sort]));
  const list = { ...typed, filter, sort: sort.column, dir: sort.dir, limit: pager.size, offset: pager.offset };
  const query = useIntelQuery<{ rows: Array<ContactRow | CompanyRow>; total: number }>(
    [entity, list],
    () => (person ? intel.searchContacts(list) : intel.searchCompanies(list)),
  );
  const idOf = (r: ContactRow | CompanyRow) => ("person_id" in r ? r.person_id : r.company_id);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const filters = person
    ? [["all", "All"], ["incomplete", "Incomplete"], ["no_company", "No company"], ["unverified", "Unverified"], ["with_account", "With a login"], ["possible_duplicate", "Possible duplicates"]]
    : [["all", "All"], ["incomplete", "Incomplete"], ["no_domain", "No domain"], ["provisional", "Provisional"], ["verified", "Verified"], ["has_sponsors", "Sponsors"], ["possible_duplicate", "Possible duplicates"]];
  const rows = query.data?.rows;
  const head = { sort, onSort };
  const allPicked = !!rows?.length && rows.every((r) => picked.includes(idOf(r)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={text.q} onChange={(q) => setText({ ...text, q })} className="w-72 max-w-full"
                   placeholder={person ? "Name, email, phone, company or ID" : "Name, alias, domain or registry ID"} />
        <Input value={text.country} onChange={(e) => setText({ ...text, country: e.target.value })} className={cn(filterInput, "w-32")} placeholder="Country" aria-label="Country" />
        {!person && <Input value={text.industry} onChange={(e) => setText({ ...text, industry: e.target.value })} className={cn(filterInput, "w-32")} placeholder="Industry" aria-label="Industry" />}
        <Chips value={filter} onChange={setFilter} options={filters} />
        <span className="ml-auto flex items-center gap-2">
          {picked.length > 0 && <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setPicked([])}>Clear</Button>}
          <Button className="h-10 rounded-xl" disabled={picked.length < 2} onClick={() => onMerge(picked)}><GitMerge className="mr-1.5 h-3.5 w-3.5" /> Merge selected ({picked.length})</Button>
        </span>
      </div>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <Empty>Nothing matches.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead>
            <tr className="border-b border-border">
              <th className="w-10 px-4 py-3">
                <Checkbox checked={allPicked} aria-label="Select this page"
                       onCheckedChange={() => setPicked((p) => (allPicked ? p.filter((id) => !rows.some((r) => idOf(r) === id)) : [...new Set([...p, ...rows.map(idOf)])]))} />
              </th>
              {person ? (
                <>
                  <SortHead label="Name" column="name" {...head} /><th className={th}>Email</th><th className={cn(th, "hidden lg:table-cell")}>Phone</th>
                  <SortHead label="Company" column="company" {...head} /><SortHead label="Designation" column="designation" {...head} className="hidden md:table-cell" />
                  <SortHead label="Events" column="events" {...head} />
                </>
              ) : (
                <>
                  <SortHead label="Company" column="name" {...head} /><th className={cn(th, "hidden md:table-cell")}>Domains</th>
                  <SortHead label="Industry" column="industry" {...head} className="hidden lg:table-cell" /><th className={cn(th, "hidden lg:table-cell")}>Country</th>
                  <SortHead label="Contacts" column="contacts" {...head} /><SortHead label="Entries" column="entries" {...head} /><th className={th}>Status</th>
                </>
              )}
              <SortHead label="Updated" column="updated" {...head} className="hidden md:table-cell" />
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = idOf(r);
              return (
                <tr key={id} className={cn(tr, "cursor-pointer hover:bg-muted/20")} onClick={() => onOpen(id)}>
                  <td className={td} onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={picked.includes(id)} onCheckedChange={() => toggle(id)} aria-label="Select for merge" />
                  </td>
                  {"person_id" in r ? (
                    <>
                      <td className={cn(td, "font-medium")}>{r.display_name || "—"} {r.has_account && <Badge variant="secondary" className="ml-1 text-[10px]">login</Badge>}</td>
                      <td className={td}>{r.email ?? "—"}</td><td className={cn(td, "hidden lg:table-cell")}>{r.phone ?? "—"}</td>
                      <td className={td}>{r.company ?? "—"}</td><td className={cn(td, "hidden md:table-cell")}>{r.designation ?? "—"}</td>
                      <td className={cn(td, "tabular-nums")}>{r.registrations}</td>
                    </>
                  ) : (
                    <>
                      <td className={cn(td, "font-medium")}>{r.name}</td><td className={cn(td, "hidden md:table-cell")}>{r.domains.join(", ") || "—"}</td>
                      <td className={cn(td, "hidden lg:table-cell")}>{r.industry ?? "—"}</td><td className={cn(td, "hidden lg:table-cell")}>{r.hq_country ?? "—"}</td>
                      <td className={cn(td, "tabular-nums")}>{r.contacts}</td><td className={cn(td, "tabular-nums")}>{r.entry_count}</td>
                      <td className={td}><Badge variant={r.verification_status === "verified" ? "default" : "secondary"} className="text-[10px]">{r.verification_status}</Badge></td>
                    </>
                  )}
                  <td className={cn(td, "hidden text-muted-foreground md:table-cell")}>{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td className="px-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(id)}>Open record</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggle(id)}>{picked.includes(id) ? "Remove from merge" : "Add to merge"}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label={person ? "contacts" : "companies"} />
    </div>
  );
}

function SponsorsTab({ linkedFilter, refresh, onOpenCompany, onMergeRecords }: {
  linkedFilter: string | null; refresh: () => void; onOpenCompany: (id: string) => void; onMergeRecords: (ids: string[]) => void;
}) {
  const [text, setText] = useState("");
  const q = useDebounced(text, DEBOUNCE_MS);
  const [filter, setFilter] = useState(linkedFilter ?? "all");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which record the connect dialog is open for, and which sponsorship is being moved.
  const [connecting, setConnecting] = useState<{ id: string; name: string; company: string | null } | null>(null);
  const [moving, setMoving] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  useEffect(() => { if (linkedFilter) setFilter(linkedFilter); }, [linkedFilter]);
  const pager = usePager(JSON.stringify([q, filter]));
  const query = useIntelQuery(["sponsor-companies", q, filter, pager.size, pager.offset], () => intel.sponsorCompanies({ q, filter, limit: pager.size, offset: pager.offset }));
  const rows = query.data?.rows;
  const combinable = query.data?.combinable ?? 0;
  const connect = async (company: string | null) => {
    if (!connecting) return;
    setBusy(true);
    try { await intel.connectSponsor(connecting.id, company); toast.success(company ? "Sponsor connected" : "Disconnected"); setConnecting(null); refresh(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const move = async (company: string | null) => {
    if (!moving || !company) return;
    setBusy(true);
    try { await intel.moveSponsorship(moving.id, company); toast.success("Sponsorship moved; its title stayed with it"); setMoving(null); refresh(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const combineAll = async () => {
    setConfirmAll(false);
    setBusy(true);
    try {
      const r = await intel.combineAllSponsorRepeats();
      toast.success(`${r.merged} repeat ${r.merged === 1 ? "record" : "records"} combined`, { description: "Every event kept its title. Each can be rolled back from Audit History." });
      if (r.skipped.length > 0) toast.message(`${r.skipped.length} left for you to review`, { description: `${r.skipped[0].name}: ${r.skipped[0].reason}` });
      refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={text} onChange={setText} className="w-72 max-w-full" placeholder="Company, sponsor, email or website" />
        <Chips value={filter} onChange={setFilter} options={[["all", "All"], ["unconnected", "Not connected"], ["repeats", "Repeats"]]} />
        {combinable > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            {confirmAll ? (
              <>
                <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setConfirmAll(false)}>Cancel</Button>
                <Button className="h-10 rounded-xl" disabled={busy} onClick={() => void combineAll()}>Confirm: combine {combinable}</Button>
              </>
            ) : (
              <Button className="h-10 rounded-xl" disabled={busy} onClick={() => setConfirmAll(true)}><GitMerge className="mr-1.5 h-3.5 w-3.5" /> Combine all repeats ({combinable})</Button>
            )}
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">One row per company, with every event's sponsorship under it. Within an organisation, repeat records can become one. Different organisations keep their own, because a sponsor's team sees every event of its record.</p>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <Empty>Nothing here.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead>
            <tr className="border-b border-border">
              <th className={th}>Company</th><th className={th}>Events</th><th className={cn(th, "hidden md:table-cell")}>Team</th>
              <th className={cn(th, "hidden md:table-cell")}>Records</th><th className={cn(th, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const open = expanded === c.key;
              return (
                <FragmentRow key={c.key}>
                  <tr className={tr}>
                    <td className={td}>
                      {c.company_id ? <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpenCompany(c.company_id!)}>{c.name}</button> : <span className="font-medium">{c.name}</span>}
                      <div className="text-[11px] text-muted-foreground">{c.domains.join(", ") || c.records[0]?.website || ""}</div>
                    </td>
                    <td className={td}>
                      <button type="button" className="inline-flex items-center gap-1 tabular-nums hover:underline" aria-expanded={open} aria-label={`${c.sponsorships.length} events and records of ${c.name}`} onClick={() => setExpanded(open ? null : c.key)}>
                        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{c.sponsorships.length}
                      </button>
                    </td>
                    <td className={cn(td, "hidden tabular-nums md:table-cell")}>{c.team}</td>
                    <td className={cn(td, "hidden md:table-cell")}>
                      {c.record_count}
                      {c.organisations > 1 && <span className="text-[11px] text-muted-foreground"> · {c.organisations} organisations</span>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right")}>
                      {c.combine_sets.length > 0 && <Button size="sm" className="mr-1.5 h-7" onClick={() => onMergeRecords(c.combine_sets[0])}>Combine {c.combine_sets[0].length}</Button>}
                      {!c.company_id
                        ? <Button size="sm" variant="outline" className="h-7" onClick={() => setConnecting({ id: c.records[0].id, name: c.name, company: null })}>Connect</Button>
                        : <Badge variant="secondary" className="text-[10px]">Connected</Badge>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border/50 bg-muted/20 last:border-0">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Event sponsorships</p>
                            {c.sponsorships.length === 0 ? <p className="text-[12px] text-muted-foreground">None yet.</p> : (
                              <ul className="divide-y divide-border/60 text-[12px]">
                                {c.sponsorships.map((e) => (
                                  <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                                    <span className="min-w-0 truncate">{e.event}<span className="ml-2 text-muted-foreground">{e.date ? new Date(e.date).toLocaleDateString() : ""}</span></span>
                                    <span className="flex shrink-0 items-center gap-1.5">
                                      <Badge variant="secondary" className="text-[10px]">{sponsorshipTitle(e.tier, e.tier_label)}</Badge>
                                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[12px]" aria-label={`Move ${e.event}`} onClick={() => setMoving({ id: e.id, label: e.event })}>Move</Button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Records</p>
                            <ul className="divide-y divide-border/60 text-[12px]">
                              {c.records.map((r) => (
                                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                                  <span className="min-w-0"><span className="block truncate">{r.name}</span><span className="block truncate text-[11px] text-muted-foreground">{r.owner ?? "—"} · {r.events} events · {r.team} team</span></span>
                                  <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[12px]" aria-label={`Change the company of ${r.name}`} onClick={() => setConnecting({ id: r.id, name: r.name, company: c.company_id ? c.name : null })}>Change</Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="companies" />
      <Dialog open={!!connecting} onOpenChange={(o) => !o && setConnecting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect to a company</DialogTitle>
            <DialogDescription>{connecting?.name}</DialogDescription>
          </DialogHeader>
          <CompanyPicker label="Connected to" current={connecting?.company ?? null} busy={busy} onPick={(id) => void connect(id)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move this sponsorship</DialogTitle>
            <DialogDescription>{moving?.label}. Its title, details, meetings and contacts go with it; other events stay as they are.</DialogDescription>
          </DialogHeader>
          <CompanyPicker label="Move to" current={null} busy={busy} onPick={(id) => void move(id)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;

function DuplicatesTab({ linkedEntity, linkedStatus, refresh, onOpen, onMerge }: {
  linkedEntity: Entity | null; linkedStatus: string | null; refresh: () => void; onOpen: (e: Entity, id: string) => void; onMerge: (e: Entity, ids: string[], match?: MergeRequest["match"]) => void;
}) {
  const [entity, setEntity] = useState<Entity>(linkedEntity ?? "person");
  const [status, setStatus] = useState(linkedStatus ?? "open");
  const [minScore, setMinScore] = useState("0");
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // Decided suggestions leave at once, without waiting for the list to come back.
  const [gone, setGone] = useState<string[]>([]);
  useEffect(() => { if (linkedEntity) { setEntity(linkedEntity); setStatus("open"); } }, [linkedEntity]);
  useEffect(() => { if (linkedStatus) setStatus(linkedStatus); }, [linkedStatus]);
  const key = JSON.stringify([entity, status, minScore]);
  useEffect(() => setPicked([]), [key]);
  const pager = usePager(key);
  const query = useIntelQuery(["duplicates", entity, status, minScore, pager.size, pager.offset], () => intel.duplicates(entity, status, Number(minScore), pager.size, pager.offset));
  useEffect(() => setGone([]), [query.dataUpdatedAt]);
  const pairs = query.data?.rows.filter((p) => !gone.includes(p.id));
  const different = entity === "person" ? "different_people" : "different_companies";
  const scan = async () => {
    setScanning(true);
    try { const n = await intel.refreshDuplicates(entity); toast.success(`Scan complete — ${n} pairs scored`); refresh(); } catch (e) { fail(e); } finally { setScanning(false); }
  };
  const decide = async (ids: string[], s: string) => {
    try {
      await intel.setDuplicateStatuses(entity, ids, s);
      toast.success(ids.length === 1 ? "Saved" : `${ids.length} suggestions updated`);
      setGone((g) => [...g, ...ids]);
      setPicked((p) => p.filter((x) => !ids.includes(x)));
      refresh();
    } catch (e) { fail(e); }
  };
  const fields = entity === "person"
    ? [["company", "Company"], ["designation", "Designation"], ["emails", "Email"], ["phones", "Phone"], ["linkedin", "LinkedIn"], ["events", "Events"]]
    : [["legal_name", "Legal name"], ["domains", "Domains"], ["aliases", "Aliases"], ["identifiers", "Registry IDs"], ["industry", "Industry"], ["contacts", "Contacts"]];
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined || v === "" ? "—" : String(v));
  const allPicked = !!pairs?.length && pairs.every((p) => picked.includes(p.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Record type" value={entity} onChange={(v) => { setEntity(v as Entity); setStatus("open"); }} options={ENTITY_OPTIONS} />
        <FilterSelect label="Status" value={status} onChange={setStatus}
                      options={[["open", "Open"], ["flagged", "Flagged for review"], ["ignored", "Ignored"], [different, "Marked different"]]} />
        <FilterSelect label="Confidence" value={minScore} onChange={setMinScore}
                      options={[["0", "Any confidence"], ["60", "Possible and above (60+)"], ["80", "High (80+)"], ["95", "Very high (95+)"]]} />
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Scan for duplicates
        </Button>
        {!!pairs?.length && status !== different && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setPicked(allPicked ? [] : pairs.map((p) => p.id))}>{allPicked ? "Clear selection" : "Select this page"}</Button>
            <Button variant="outline" className="h-10 rounded-xl" disabled={picked.length === 0} onClick={() => void decide(picked, different)}>Mark different ({picked.length})</Button>
            <Button variant="outline" className="h-10 rounded-xl" disabled={picked.length === 0} onClick={() => void decide(picked, "ignored")}>Ignore selected ({picked.length})</Button>
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">Scores are recommendations, not proof — shared phones can be office lines and names repeat. Nothing merges until you confirm, one pair at a time.</p>
      {!pairs ? <NoData query={query} rows={3} /> : pairs.length === 0 ? <Empty>No suggestions here. Run a scan to look again.</Empty> : pairs.map((p) => {
        const band = confidenceBand(p.score);
        return (
          <div key={p.id} className={cn("rounded-2xl border border-border bg-card p-4 transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox checked={picked.includes(p.id)} onCheckedChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((i) => i !== p.id) : [...x, p.id]))} aria-label="Select this suggestion" />
                <Badge variant={band.tone === "high" ? "default" : "secondary"} className="text-[11px]">{p.score}% · {band.label}</Badge>
                {p.reasons.map((r) => <Badge key={r} variant="outline" className="text-[11px] font-normal">{reasonLabel(r)}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button className="h-10 rounded-xl" onClick={() => onMerge(entity, [p.a.id, p.b.id], { score: p.score, reasons: p.reasons })}>Compare &amp; merge</Button>
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => void decide([p.id], different)}>Different</Button>
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => void decide([p.id], "ignored")}>Ignore</Button>
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => void decide([p.id], "flagged")}>Flag</Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {[p.a, p.b].map((r) => (
                <button key={r.id} type="button" onClick={() => onOpen(entity, r.id)} className="rounded-lg border border-border/70 p-3 text-left text-[12.5px] transition-colors hover:bg-muted/20">
                  <div className="font-medium">{r.name || "—"} {r.has_account ? <Badge variant="secondary" className="ml-1 text-[10px]">login</Badge> : null}</div>
                  {fields.map(([k, label]) => <div key={k}><span className="text-muted-foreground">{label}: </span>{show(r[k])}</div>)}
                  <div className="mt-1 text-[11px] text-muted-foreground">Created {String(r.created_at ?? "").slice(0, 10)} · updated {String(r.updated_at ?? "").slice(0, 10)}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="suggestions" />
    </div>
  );
}

/** The strongest recommendations ready to compare, and the merges already made. */
function MergeCentreTab({ refresh, onOpen, onMerge, onMergeRecords }: {
  refresh: () => void; onOpen: (e: Entity, id: string) => void; onMerge: (e: Entity, ids: string[], match?: MergeRequest["match"]) => void; onMergeRecords: (ids: string[]) => void;
}) {
  const [entity, setEntity] = useState<Entity>("company");
  const pager = usePager(entity);
  const query = useIntelQuery(["duplicates", entity, "open", "80", pager.size, pager.offset], () => intel.duplicates(entity, "open", 80, pager.size, pager.offset));
  const repeats = useIntelQuery(["review", "duplicate_sponsor_records"], () => intel.sponsorReview("duplicate_sponsor_records", 10, 0));
  const rows = query.data?.rows;
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Recommended merges</h2>
          <FilterSelect label="Record type" value={entity} onChange={(v) => setEntity(v as Entity)} options={ENTITY_OPTIONS} />
        </div>
        {!rows ? <NoData query={query} rows={3} /> : rows.length === 0 ? <Empty>No high-confidence pairs. Lower-confidence ones are in Duplicate Detection.</Empty> : (
          <TableShell dimmed={query.isPlaceholderData}>
            <thead><tr className="border-b border-border"><th className={th}>Records</th><th className={th}>Confidence</th><th className={cn(th, "hidden md:table-cell")}>Why</th><th className={cn(th, "text-right")} /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={tr}>
                  <td className={td}>
                    <button type="button" className="font-medium hover:underline" onClick={() => onOpen(entity, p.a.id)}>{p.a.name || "—"}</button>
                    <span className="mx-1.5 text-muted-foreground">and</span>
                    <button type="button" className="font-medium hover:underline" onClick={() => onOpen(entity, p.b.id)}>{p.b.name || "—"}</button>
                  </td>
                  <td className={cn(td, "whitespace-nowrap")}><Badge variant="secondary" className="text-[11px]">{p.score}% · {confidenceBand(p.score).label}</Badge></td>
                  <td className={cn(td, "hidden text-[12px] text-muted-foreground md:table-cell")}>{p.reasons.map(reasonLabel).join(", ")}</td>
                  <td className={cn(td, "text-right")}><Button size="sm" className="h-7" onClick={() => onMerge(entity, [p.a.id, p.b.id], { score: p.score, reasons: p.reasons })}>Compare</Button></td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="recommendations" />
      </section>
      {!!repeats.data?.rows.length && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Repeat sponsor records</h2>
          <TableShell>
            <thead><tr className="border-b border-border"><th className={th}>Company</th><th className={th}>Records</th><th className={cn(th, "text-right")} /></tr></thead>
            <tbody>
              {repeats.data.rows.map((r) => (
                <tr key={r.sponsor_ids.join()} className={tr}>
                  <td className={cn(td, "font-medium")}>{r.title}</td><td className={cn(td, "text-muted-foreground")}>{r.detail}</td>
                  <td className={cn(td, "text-right")}><Button size="sm" className="h-7" onClick={() => onMergeRecords(r.sponsor_ids)}>Compare</Button></td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </section>
      )}
      <MergeHistory refresh={refresh} />
    </div>
  );
}

function MergeHistory({ refresh }: { refresh: () => void }) {
  const [entity, setEntity] = useState<string>("all");
  const pager = usePager(entity, 10);
  const query = useIntelQuery(["audit", "merges", entity, pager.offset], () => intel.audit({ entity: entity === "all" ? null : (entity as Entity), limit: 1, mergeOffset: pager.offset }));
  const data = query.data;
  const rollback = async (id: string) => { try { await intel.revertMerge(id); toast.success("Merge rolled back"); refresh(); } catch (e) { fail(e); } };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Merges</h2>
        <FilterSelect label="Merges of" value={entity} onChange={setEntity} options={[["all", "All records"], ...ENTITY_OPTIONS, ["sponsor", "Sponsor records"]]} />
      </div>
      {!data ? <NoData query={query} rows={3} /> : data.merges.length === 0 ? <Empty>No merges yet.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead><tr className="border-b border-border"><th className={th}>Kept</th><th className={cn(th, "hidden md:table-cell")}>Reason</th><th className={th}>When</th><th className={cn(th, "text-right")} /></tr></thead>
          <tbody>
            {data.merges.map((m) => (
              <tr key={String(m.id)} className={tr}>
                <td className={td}><span className="font-medium">{String(m.survivor ?? "—")}</span><div className="text-[11px] text-muted-foreground">{String(m.entity_type)} · {(m.merged_ids as string[]).length} folded in</div></td>
                <td className={cn(td, "hidden text-[12px] text-muted-foreground md:table-cell")}>{m.reason ? String(m.reason) : "—"}</td>
                <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{new Date(String(m.created_at)).toLocaleDateString()}</td>
                <td className={cn(td, "text-right")}>
                  {m.reverted_at ? <Badge variant="secondary" className="text-[10px]">Rolled back</Badge>
                    : <Button size="sm" variant="outline" className="h-7" onClick={() => void rollback(String(m.id))}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Roll back</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={data?.merges_total ?? 0} updating={query.isFetching} label="merges" sizes={[10]} />
    </section>
  );
}

function CorrectionsTab({ refresh, onOpen }: { refresh: () => void; onOpen: (e: Entity, id: string) => void }) {
  const [status, setStatus] = useState("open");
  const [entity, setEntity] = useState("all");
  const [kind, setKind] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const entityArg = entity === "all" ? null : (entity as Entity);
  const kindArg = kind === "all" ? null : kind;
  const key = JSON.stringify([status, entity, kind]);
  useEffect(() => { setPicked([]); setConfirmAll(false); }, [key]);
  const pager = usePager(key);
  const query = useIntelQuery(["corrections", status, entity, kind, pager.size, pager.offset], () => intel.corrections(status, entityArg, kindArg, pager.size, pager.offset));
  useEffect(() => setGone([]), [query.dataUpdatedAt]);
  const rows = query.data?.rows.filter((s) => !gone.includes(s.id));
  const scan = async () => {
    setScanning(true);
    try { const n = await intel.generateCorrections(); toast.success(`Scan complete — ${n} suggestions open`); refresh(); } catch (e) { fail(e); } finally { setScanning(false); }
  };
  const review = async (s: Suggestion, approve: boolean) => {
    try {
      await intel.reviewCorrection(s.id, approve, edits[s.id] ?? null);
      toast.success(approve ? "Applied — the old value is kept in the history" : "Rejected");
      setGone((g) => [...g, s.id]);
      refresh();
    } catch (e) { fail(e); }
  };
  const bulk = async () => {
    try { const n = await intel.bulkApproveSafe(picked); toast.success(`${n} formatting fixes applied`); setPicked([]); refresh(); } catch (e) { fail(e); }
  };
  const approveAll = async () => {
    setConfirmAll(false);
    try { const n = await intel.approveAllSafe(entityArg, kindArg); toast.success(`${n} formatting fixes applied`); setPicked([]); refresh(); } catch (e) { fail(e); }
  };
  const safeRows = rows?.filter((r) => r.safe) ?? [];
  const safeTotal = query.data?.safe_total ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[["open", "Awaiting review"], ["approved", "Approved"], ["rejected", "Rejected"], ["stale", "Out of date"]]} />
        <FilterSelect label="Record type" value={entity} onChange={setEntity} options={[["all", "Contacts and companies"], ...ENTITY_OPTIONS]} />
        <FilterSelect label="Kind" value={kind} onChange={setKind} options={[
          ["all", "Every kind"], ["capitalisation", "Capitalisation"], ["spacing", "Spacing"], ["swapped_names", "Swapped names"], ["missing", "Missing details"],
          ["conflicting", "Conflicting designation"], ["missing_domain", "Missing domain"], ["incomplete", "Incomplete"],
        ]} />
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Scan for issues
        </Button>
        {status === "open" && safeRows.length > 0 && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setPicked(picked.length === safeRows.length ? [] : safeRows.map((r) => r.id))}>
              {picked.length === safeRows.length ? "Clear selection" : `Select formatting fixes on this page (${safeRows.length})`}
            </Button>
            <Button className="h-10 rounded-xl" disabled={picked.length === 0} onClick={() => void bulk()}>Approve selected ({picked.length})</Button>
            {confirmAll
              ? <Button size="sm" variant="destructive" className="h-8" onClick={() => void approveAll()}>Confirm: approve all {safeTotal}</Button>
              : safeTotal > safeRows.length && <Button variant="outline" className="h-10 rounded-xl" onClick={() => setConfirmAll(true)}>Approve all {safeTotal} formatting fixes</Button>}
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">Only formatting fixes (spacing, capitalisation) can be approved in bulk. Everything else is reviewed one at a time. Nothing changes until approved.</p>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <Empty>Nothing here. Run a scan to look for issues.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead>
            <tr className="border-b border-border">
              <th className="w-10 px-4 py-3" /><th className={th}>Record</th><th className={th}>Field</th><th className={th}>Current</th><th className={th}>Suggested</th>
              <th className={cn(th, "hidden lg:table-cell")}>Why</th><th className={th}>Confidence</th><th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={cn(tr, "align-top")}>
                <td className={td}>{s.safe && status === "open" && <Checkbox checked={picked.includes(s.id)} onCheckedChange={() => setPicked((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])} aria-label="Select" />}</td>
                <td className={td}><button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(s.entity_type, s.entity_id)}>{s.label || s.entity_id.slice(0, 8)}</button><div className="text-[11px] text-muted-foreground">{s.entity_type === "person" ? "Contact" : "Company"}</div></td>
                <td className={td}>{s.field}</td>
                <td className={cn(td, "text-muted-foreground")}>{s.current_value ?? "—"}</td>
                <td className={td}>
                  {status === "open" ? (
                    <Input value={edits[s.id] ?? s.suggested_value ?? ""} onChange={(e) => setEdits((x) => ({ ...x, [s.id]: e.target.value }))} className="h-8 min-w-[10rem] text-[13px]" placeholder="Enter a value" />
                  ) : (s.suggested_value ?? "—")}
                </td>
                <td className={cn(td, "hidden text-[12px] lg:table-cell")}>{s.reason}{s.evidence && <div className="text-muted-foreground">{s.evidence}</div>}</td>
                <td className={cn(td, "tabular-nums")}>{s.confidence}%</td>
                <td className={td}>
                  {status === "open" && (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7" onClick={() => void review(s, true)} disabled={!(edits[s.id] ?? s.suggested_value)}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => void review(s, false)}>Reject</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="suggestions" />
    </div>
  );
}

const REVIEW_KINDS: Array<[string, string, string]> = [
  ["duplicate_sponsor_records", "Repeat sponsor records", "One organiser has several records for one company."],
  ["same_event_repeat", "Company twice on an event", "May be separate agreements, or one entered twice."],
  ["contact_no_company", "Team on an unconnected sponsor", "Connect the sponsor to a company."],
  ["contact_company_mismatch", "Contact names another company", "Check they belong on this sponsor's team."],
  ["duplicate_contact", "Possible duplicate contacts", "Same name at one company under separate contact records."],
  ["contact_multiple_companies", "On several companies' teams", "May be correct, for an agency or a job change."],
  ["contact_no_person", "No contact record", "Usually an invalid email address."],
];

/** Sponsor data waiting for a person's decision. Listing it changes nothing. */
function ReviewTab({ go, onOpen, onMerge, onMergeRecords }: {
  go: (t: Tab, extra?: Record<string, string>) => void; onOpen: (e: Entity, id: string) => void; onMerge: (e: Entity, ids: string[]) => void; onMergeRecords: (ids: string[]) => void;
}) {
  const [kind, setKind] = useState("all");
  const pager = usePager(kind);
  const query = useIntelQuery(["review", kind, pager.size, pager.offset], () => intel.sponsorReview(kind === "all" ? null : kind, pager.size, pager.offset));
  const rows = query.data?.rows;
  const counts = query.data?.counts ?? {};
  const meta = (k: string) => REVIEW_KINDS.find(([v]) => v === k);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Kind of issue" value={kind} onChange={setKind}
                      options={[["all", "Everything"], ...REVIEW_KINDS.map(([v, l]) => [v, `${l} (${counts[v] ?? 0})`])]} />
        <Button variant="ghost" className="h-10 rounded-xl" onClick={() => go("duplicates", { status: "flagged" })}>Flagged duplicates</Button>
      </div>
      <p className="text-[12px] text-muted-foreground">Nothing here changes by itself. An item leaves the list once the data is put right; a real exception stays listed.</p>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <Empty>Nothing to review.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead><tr className="border-b border-border"><th className={th}>Item</th><th className={th}>Issue</th><th className={cn(th, "hidden md:table-cell")}>Detail</th><th className={cn(th, "text-right")} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${r.title}-${i}`} className={tr}>
                <td className={cn(td, "font-medium")}>{r.title}</td>
                <td className={td}>{meta(r.kind)?.[1] ?? r.kind}<div className="text-[11px] text-muted-foreground">{meta(r.kind)?.[2]}</div></td>
                <td className={cn(td, "hidden text-[12px] text-muted-foreground md:table-cell")}>{r.detail}</td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  {r.kind === "duplicate_sponsor_records" && <Button size="sm" className="mr-1.5 h-7" onClick={() => onMergeRecords(r.sponsor_ids)}>Compare</Button>}
                  {r.kind === "duplicate_contact" && <Button size="sm" className="mr-1.5 h-7" onClick={() => onMerge("person", r.person_ids)}>Compare</Button>}
                  {r.kind === "contact_no_company" && <Button size="sm" variant="outline" className="mr-1.5 h-7" onClick={() => go("sponsors", { filter: "unconnected" })}>Connect</Button>}
                  {r.company_id && <Button size="sm" variant="ghost" className="h-7" onClick={() => onOpen("company", r.company_id!)}>Company</Button>}
                  {r.person_ids.length === 1 && <Button size="sm" variant="ghost" className="h-7" onClick={() => onOpen("person", r.person_ids[0])}>Contact</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="items" />
    </div>
  );
}

function AuditTab({ refresh }: { refresh: () => void }) {
  const [entity, setEntity] = useState("all");
  const [period, setPeriod] = useState("all");
  const pager = usePager(JSON.stringify([entity, period]));
  const query = useIntelQuery(["audit", "events", entity, period, pager.size, pager.offset], () => intel.audit({
    entity: entity === "all" ? null : (entity as Entity), from: periodStart(period), limit: pager.size, offset: pager.offset,
  }));
  const data = query.data;
  return (
    <div className="space-y-5">
      <MergeHistory refresh={refresh} />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Activity</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Chips label="Period" value={period} onChange={setPeriod} options={PERIODS} />
            <FilterSelect label="Record type" value={entity} onChange={setEntity} options={[["all", "All records"], ...ENTITY_OPTIONS, ["sponsor", "Sponsor records"]]} />
          </div>
        </div>
        {!data ? <NoData query={query} /> : data.events.length === 0 ? <Empty>No activity here.</Empty> : (
          <TableShell dimmed={query.isPlaceholderData}>
            <thead><tr className="border-b border-border"><th className={th}>Action</th><th className={cn(th, "hidden lg:table-cell")}>Details</th><th className={th}>By</th><th className={th}>When</th></tr></thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={String(e.id)} className={cn(tr, "align-top")}>
                  <td className={td}><span className="font-medium">{String(e.action).replace(/^intel\./, "").replace(/_/g, " ")}</span><div className="text-[11px] text-muted-foreground">{String(e.target_type ?? "")} {String(e.target_id ?? "").slice(0, 8)}</div></td>
                  <td className={cn(td, "hidden lg:table-cell")}><pre className="max-h-20 max-w-md overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(e.details, null, 0)}</pre></td>
                  <td className={cn(td, "text-muted-foreground")}>{String(e.actor ?? "system")}</td>
                  <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{new Date(String(e.created_at)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        <Pager pager={pager} total={data?.total ?? 0} updating={query.isFetching} label="events" />
      </section>
    </div>
  );
}
