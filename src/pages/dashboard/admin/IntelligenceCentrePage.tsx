/**
 * Super Admin — Intelligence Centre (/dashboard/admin/intelligence).
 *
 * Contacts, companies and sponsor records across Illuxus: an overview of data
 * quality, searchable records with field-level editing and history, scored
 * duplicate suggestions, side-by-side merges with an impact preview, sponsor
 * connections, a correction queue, and the audit history with rollback.
 *
 * Lists page, sort and filter on the server. Results are cached and the
 * current page stays on screen while the next one loads, and tabs stay
 * mounted once visited, so nothing blanks out or loses its filters.
 *
 * Every action is a Super-Admin-only database function (migrations 064, 065)
 * that checks the role itself and records what it did; this page hiding
 * itself from others is not the protection.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeDialog } from "@/components/intelligence/MergeDialog";
import { CompanyPicker, RecordDrawer } from "@/components/intelligence/RecordDrawer";
import { useDebounced } from "@/hooks/useOrgPeopleSearch";
import {
  confidenceBand, intel, reasonLabel,
  type CompanyRow, type ContactRow, type Entity, type Suggestion, type SponsorRow,
} from "@/lib/intelligence/admin-api";
import { cn } from "@/lib/utils";

const TABS = [
  ["overview", "Overview"], ["contacts", "Contacts"], ["companies", "Companies"], ["sponsors", "Sponsors"],
  ["duplicates", "Duplicates"], ["corrections", "Corrections"], ["audit", "Audit history"],
] as const;
type Tab = (typeof TABS)[number][0];

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
const select = "h-9 rounded-md border border-input bg-background px-2 text-[13px]";
const PAGE_SIZES = [25, 50, 100];
const DEBOUNCE_MS = 250;

/** A cached read that keeps showing the last result while the next one loads. */
function useIntelQuery<T>(key: unknown[], fn: () => Promise<T>) {
  const query = useQuery({ queryKey: ["intel", ...key], queryFn: fn, placeholderData: keepPreviousData, retry: false, refetchOnWindowFocus: false });
  const reported = useRef(0);
  useEffect(() => {
    if (query.error && query.errorUpdatedAt !== reported.current) {
      reported.current = query.errorUpdatedAt;
      fail(query.error);
    }
  }, [query.error, query.errorUpdatedAt]);
  return query;
}

/** Page state tied to the list's filters: changing any of them returns to the first page. */
function usePager(filterKey: string, initialSize = PAGE_SIZES[0]) {
  const [state, setState] = useState({ key: filterKey, page: 0 });
  const [size, setSizeState] = useState(initialSize);
  const page = state.key === filterKey ? state.page : 0;
  const setPage = useCallback((p: number) => setState({ key: filterKey, page: p }), [filterKey]);
  const setSize = (s: number) => { setSizeState(s); setPage(0); };
  return { page, size, offset: page * size, setPage, setSize };
}
type PagerState = ReturnType<typeof usePager>;

function Pager({ pager, total, updating, label = "records", sizes = PAGE_SIZES }: { pager: PagerState; total: number; updating: boolean; label?: string; sizes?: number[] }) {
  const { page, size, setPage, setSize } = pager;
  const pages = Math.max(1, Math.ceil(total / size));
  // The last rows of the last page can be merged or decided away.
  useEffect(() => { if (!updating && page > 0 && page >= pages) setPage(pages - 1); }, [updating, page, pages, setPage]);
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
      <span className="flex items-center gap-2 tabular-nums">
        {page * size + 1}–{Math.min((page + 1) * size, total)} of {total} {label}
        {updating && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span>}
      </span>
      <span className="flex items-center gap-2">
        {sizes.length > 1 && (
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={cn(select, "h-8")} aria-label={`${label} per page`}>
            {sizes.map((s) => <option key={s} value={s}>{s} per page</option>)}
          </select>
        )}
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Previous page of ${label}`}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="tabular-nums">Page {page + 1} of {pages}</span>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label={`Next page of ${label}`}><ChevronRight className="h-4 w-4" /></Button>
      </span>
    </div>
  );
}

function SortHead({ label, column, sort, onSort }: { label: string; column: string; sort: { column: string; dir: "asc" | "desc" }; onSort: (column: string) => void }) {
  const active = sort.column === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2" aria-sort={!active ? "none" : sort.dir === "asc" ? "ascending" : "descending"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(column)}>
        {label} <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

/** What a list shows before it has anything to show. */
function NoData({ query }: { query: UseQueryResult<unknown> }) {
  if (!query.isError) return <Loading />;
  return (
    <div className="py-8 text-center text-[13px] text-muted-foreground">
      This couldn't be loaded. <Button size="sm" variant="outline" className="ml-2" onClick={() => void query.refetch()}>Try again</Button>
    </div>
  );
}

export default function IntelligenceCentrePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const go = (t: Tab, extra: Record<string, string> = {}) => setParams({ tab: t, ...extra });
  const [drawer, setDrawer] = useState<{ entity: Entity; id: string } | null>(null);
  const [merge, setMerge] = useState<{ entity: Entity; ids: string[] } | null>(null);
  const [merges, setMerges] = useState(0);
  const queryClient = useQueryClient();
  const refresh = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ["intel"] }); }, [queryClient]);
  // A tab mounts on its first visit and then stays, hidden, so its filters and page survive.
  const visited = useRef(new Set<Tab>());
  visited.current.add(tab);
  const panel = (t: Tab, content: ReactNode) => (
    <TabsContent value={t} forceMount hidden={tab !== t}>{visited.current.has(t) && content}</TabsContent>
  );
  // A filter in the link applies only to the tab it was sent to.
  const linked = (t: Tab, name: string) => (tab === t ? params.get(name) : null);
  const open = (entity: Entity, id: string) => setDrawer({ entity, id });
  const startMerge = (entity: Entity, ids: string[]) => setMerge({ entity, ids });

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Intelligence Centre</h1>
          <p className="text-[13px] text-muted-foreground">Contacts, companies and sponsors across Illuxus — correct, de-duplicate, merge and connect, with every change recorded.</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => go(v as Tab)}>
          <TabsList className="flex-wrap h-auto">
            {TABS.map(([t, label]) => <TabsTrigger key={t} value={t}>{label}</TabsTrigger>)}
          </TabsList>
          {panel("overview", <OverviewTab go={go} />)}
          {panel("contacts", <RecordsTab entity="person" linkedFilter={linked("contacts", "filter")} merges={merges} onOpen={(id) => open("person", id)} onMerge={(ids) => startMerge("person", ids)} />)}
          {panel("companies", <RecordsTab entity="company" linkedFilter={linked("companies", "filter")} merges={merges} onOpen={(id) => open("company", id)} onMerge={(ids) => startMerge("company", ids)} />)}
          {panel("sponsors", <SponsorsTab linkedFilter={linked("sponsors", "filter")} refresh={refresh} onOpenCompany={(id) => open("company", id)} />)}
          {panel("duplicates", <DuplicatesTab linkedEntity={linked("duplicates", "entity") as Entity | null} refresh={refresh} onOpen={open} onMerge={startMerge} />)}
          {panel("corrections", <CorrectionsTab refresh={refresh} onOpen={open} />)}
          {panel("audit", <AuditTab refresh={refresh} />)}
        </Tabs>
      </div>
      {drawer && <RecordDrawer entity={drawer.entity} id={drawer.id} onClose={() => setDrawer(null)} onChanged={refresh} />}
      {merge && <MergeDialog entity={merge.entity} ids={merge.ids} open onOpenChange={(o) => !o && setMerge(null)} onMerged={() => { setMerges((n) => n + 1); refresh(); }} />}
    </DashboardLayout>
  );
}

function Card({ label, value, hint, onClick, tone }: { label: string; value: number | string; hint?: string; onClick?: () => void; tone?: "warn" }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
            className={cn("rounded-xl border bg-card p-4 text-left transition-colors", onClick && "hover:border-primary/50 hover:bg-muted/40", tone === "warn" && "border-amber-500/40")}>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}

function OverviewTab({ go }: { go: (t: Tab, extra?: Record<string, string>) => void }) {
  const [f, setF] = useState({ from: "", to: "", country: "", industry: "" });
  const filters = useDebounced(f, DEBOUNCE_MS);
  const query = useIntelQuery(["overview", filters], () => intel.overview(filters));
  const data = query.data;
  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-end gap-2 text-[12px] text-muted-foreground">
        <label>Created from<Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="mt-1 h-9 w-40" /></label>
        <label>to<Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="mt-1 h-9 w-40" /></label>
        <label>Country<Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className="mt-1 h-9 w-36" placeholder="Any" /></label>
        <label>Industry (companies)<Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className="mt-1 h-9 w-40" placeholder="Any" /></label>
        {query.isFetching && data && <span className="inline-flex h-9 items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span>}
      </div>
      {!data ? <NoData query={query} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Data quality score" value={`${data.people.quality}%`} hint="Name, company, designation and a verified address" />
          <Card label="Unique contacts" value={data.people.contacts} onClick={() => go("contacts")} />
          <Card label="Unique companies" value={data.companies.companies} onClick={() => go("companies")} />
          <Card label="Merged records" value={data.merges} onClick={() => go("audit")} />
          <Card label="Suspected duplicate contacts" value={data.duplicate_contacts} hint="Score 60+" tone="warn" onClick={() => go("duplicates", { entity: "person" })} />
          <Card label="Suspected duplicate companies" value={data.duplicate_companies} hint="Score 60+" tone="warn" onClick={() => go("duplicates", { entity: "company" })} />
          <Card label="Sponsors without a company" value={data.sponsors_unconnected} hint="Not connected yet" tone="warn" onClick={() => go("sponsors", { filter: "unconnected" })} />
          <Card label="Repeat sponsor records" value={data.sponsors_repeats} hint="Several records for one company" onClick={() => go("sponsors", { filter: "repeats" })} />
          <Card label="Flagged for manual review" value={data.flagged} onClick={() => go("duplicates")} />
          <Card label="Corrections awaiting review" value={data.corrections_open} hint={`${data.corrections_safe} formatting-only`} onClick={() => go("corrections")} />
          <Card label="Contacts needing verification" value={data.people.unverified} hint="No verified email" onClick={() => go("contacts", { filter: "unverified" })} />
          <Card label="Incomplete contacts" value={data.people.incomplete} onClick={() => go("contacts", { filter: "incomplete" })} />
          <Card label="Contacts without a company" value={data.people.without_company} onClick={() => go("contacts", { filter: "no_company" })} />
          <Card label="Possible wrong associations" value={data.association_suggestions} hint="Conflicting designations, missing domains" onClick={() => go("corrections")} />
          <Card label="Companies without a domain" value={data.companies.missing_domain} onClick={() => go("companies", { filter: "no_domain" })} />
          <Card label="Incomplete companies" value={data.companies.incomplete} onClick={() => go("companies", { filter: "incomplete" })} />
          <Card label="Provisional companies" value={data.companies.provisional} hint="Not yet verified" onClick={() => go("companies", { filter: "provisional" })} />
          <Card label="Contacts with a login" value={data.people.with_account} onClick={() => go("contacts", { filter: "with_account" })} />
        </div>
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
  const [sort, setSort] = useState<{ column: string; dir: "asc" | "desc" }>({ column: person ? "updated" : "entries", dir: "desc" });
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
    ? [["all", "All contacts"], ["incomplete", "Incomplete"], ["no_company", "No company"], ["unverified", "Unverified"], ["with_account", "With a login"], ["possible_duplicate", "Possible duplicates"]]
    : [["all", "All companies"], ["incomplete", "Incomplete"], ["no_domain", "No domain"], ["provisional", "Provisional"], ["verified", "Verified"], ["has_sponsors", "Has sponsor records"], ["possible_duplicate", "Possible duplicates"]];
  const rows = query.data?.rows;
  const head = { sort, onSort };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} className="h-9 pl-8 text-[13px]"
                 placeholder={person ? "Name, email, phone, company, designation, LinkedIn or ID" : "Name, alias, domain, registry ID or company ID"} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={select} aria-label="Filter">
          {filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Input value={text.country} onChange={(e) => setText({ ...text, country: e.target.value })} className="h-9 w-32 text-[13px]" placeholder="Country" aria-label="Country" />
        {!person && <Input value={text.industry} onChange={(e) => setText({ ...text, industry: e.target.value })} className="h-9 w-36 text-[13px]" placeholder="Industry" aria-label="Industry" />}
        <Button size="sm" disabled={picked.length < 2} onClick={() => onMerge(picked)}>Merge selected ({picked.length})</Button>
        {picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>}
      </div>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing matches.</p> : (
        <div className={cn("overflow-x-auto rounded-lg border transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-[12px] text-muted-foreground">
              {person ? (
                <tr><th className="w-8 px-3 py-2" /><SortHead label="Name" column="name" {...head} /><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><SortHead label="Company" column="company" {...head} /><SortHead label="Designation" column="designation" {...head} /><SortHead label="Events" column="events" {...head} /><SortHead label="Updated" column="updated" {...head} /></tr>
              ) : (
                <tr><th className="w-8 px-3 py-2" /><SortHead label="Company" column="name" {...head} /><th className="px-3 py-2">Domains</th><SortHead label="Industry" column="industry" {...head} /><th className="px-3 py-2">Country</th><SortHead label="Contacts" column="contacts" {...head} /><SortHead label="Entries" column="entries" {...head} /><th className="px-3 py-2">Status</th><SortHead label="Updated" column="updated" {...head} /></tr>
              )}
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = idOf(r);
                return (
                  <tr key={id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => onOpen(id)}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} aria-label="Select for merge" />
                    </td>
                    {"person_id" in r ? (
                      <>
                        <td className="px-3 py-2 font-medium">{r.display_name || "—"} {r.has_account && <Badge variant="outline" className="ml-1 text-[10px]">login</Badge>}</td>
                        <td className="px-3 py-2">{r.email ?? "—"}</td><td className="px-3 py-2">{r.phone ?? "—"}</td>
                        <td className="px-3 py-2">{r.company ?? "—"}</td><td className="px-3 py-2">{r.designation ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{r.registrations}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2">{r.domains.join(", ") || "—"}</td>
                        <td className="px-3 py-2">{r.industry ?? "—"}</td><td className="px-3 py-2">{r.hq_country ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{r.contacts}</td><td className="px-3 py-2 tabular-nums">{r.entry_count}</td>
                        <td className="px-3 py-2"><Badge variant={r.verification_status === "verified" ? "default" : "outline"} className="text-[10px]">{r.verification_status}</Badge></td>
                      </>
                    )}
                    <td className="px-3 py-2 text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label={person ? "contacts" : "companies"} />
    </div>
  );
}

function SponsorsTab({ linkedFilter, refresh, onOpenCompany }: { linkedFilter: string | null; refresh: () => void; onOpenCompany: (id: string) => void }) {
  const [text, setText] = useState("");
  const q = useDebounced(text, DEBOUNCE_MS);
  const [filter, setFilter] = useState(linkedFilter ?? "all");
  const [picked, setPicked] = useState<string[]>([]);
  // Which records the connect dialog is open for.
  const [connecting, setConnecting] = useState<SponsorRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (linkedFilter) setFilter(linkedFilter); }, [linkedFilter]);
  const pager = usePager(JSON.stringify([q, filter]));
  const query = useIntelQuery(["sponsors", q, filter, pager.size, pager.offset], () => intel.sponsors({ q, filter, limit: pager.size, offset: pager.offset }));
  const rows = query.data?.rows;
  const chosen = useRef(new Map<string, SponsorRow>());
  const toggle = (s: SponsorRow) => {
    chosen.current.set(s.id, s);
    setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]));
  };
  const connect = async (company: string | null) => {
    if (!connecting) return;
    setBusy(true);
    const results = await Promise.allSettled(connecting.map((s) => intel.connectSponsor(s.id, company)));
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failed.length) toast.error(`${failed.length} of ${results.length} not saved`, { description: String(failed[0].reason?.message ?? failed[0].reason) });
    else toast.success(company ? `${results.length === 1 ? "Sponsor" : `${results.length} sponsors`} connected` : "Disconnected");
    setBusy(false);
    setConnecting(null);
    setPicked([]);
    refresh();
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} className="h-9 pl-8 text-[13px]" placeholder="Sponsor name, email or website" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={select} aria-label="Filter">
          <option value="all">All sponsors</option><option value="unconnected">Not connected</option><option value="repeats">Repeats (same company)</option>
        </select>
        <Button size="sm" disabled={picked.length === 0} onClick={() => setConnecting(picked.map((id) => chosen.current.get(id)!))}>Connect selected ({picked.length})</Button>
      </div>
      <p className="text-[12px] text-muted-foreground">Organisers each keep their own sponsor record with its logo, tier and team. Connecting says these records are the same company, so it appears once in Intelligence and merges carry them along. It doesn't change what organisers or event pages show.</p>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing here.</p> : (
        <div className={cn("overflow-x-auto rounded-lg border transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-[12px] text-muted-foreground">
              <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Sponsor</th><th className="px-3 py-2">Website</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Events</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Added by</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2"><input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s)} aria-label={`Select ${s.name}`} /></td>
                  <td className="px-3 py-2 font-medium">{s.name}<div className="text-[11px] font-normal text-muted-foreground">{s.email ?? ""}</div></td>
                  <td className="px-3 py-2">{s.website ?? "—"}</td>
                  <td className="px-3 py-2">
                    {s.company_id ? (
                      <button type="button" className="text-left hover:underline" onClick={() => onOpenCompany(s.company_id!)}>{s.company}</button>
                    ) : <Badge variant="outline" className="border-amber-500/50 text-[10px]">Not connected</Badge>}
                    {s.same_company > 0 && <div className="text-[11px] text-muted-foreground">{s.same_company} other {s.same_company === 1 ? "record" : "records"} for this company</div>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{s.events}</td>
                  <td className="px-3 py-2 tabular-nums">{s.team}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.created_by ?? "—"}</td>
                  <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => setConnecting([s])}>{s.company_id ? "Change" : "Connect"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="sponsors" />
      <Dialog open={!!connecting} onOpenChange={(o) => !o && setConnecting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect to a company</DialogTitle>
            <DialogDescription>{connecting?.map((s) => s.name).join(", ")}</DialogDescription>
          </DialogHeader>
          <CompanyPicker label="Connected to" current={connecting?.length === 1 ? connecting[0].company : null} busy={busy} onPick={(id) => void connect(id)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DuplicatesTab({ linkedEntity, refresh, onOpen, onMerge }: {
  linkedEntity: Entity | null; refresh: () => void; onOpen: (e: Entity, id: string) => void; onMerge: (e: Entity, ids: string[]) => void;
}) {
  const [entity, setEntity] = useState<Entity>(linkedEntity ?? "person");
  const [status, setStatus] = useState("open");
  const [minScore, setMinScore] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // Decided suggestions leave at once, without waiting for the list to come back.
  const [gone, setGone] = useState<string[]>([]);
  useEffect(() => { if (linkedEntity) { setEntity(linkedEntity); setStatus("open"); } }, [linkedEntity]);
  const key = JSON.stringify([entity, status, minScore]);
  useEffect(() => setPicked([]), [key]);
  const pager = usePager(key);
  const query = useIntelQuery(["duplicates", entity, status, minScore, pager.size, pager.offset], () => intel.duplicates(entity, status, minScore, pager.size, pager.offset));
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
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={entity} onChange={(e) => { setEntity(e.target.value as Entity); setStatus("open"); }} className={select} aria-label="Record type">
          <option value="person">Contacts</option><option value="company">Companies</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Status">
          <option value="open">Open</option><option value="flagged">Flagged for review</option><option value="ignored">Ignored</option>
          <option value={different}>Marked different</option>
        </select>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className={select} aria-label="Confidence">
          <option value={0}>Any confidence</option><option value={60}>Possible and above (60+)</option><option value={80}>High (80+)</option><option value={95}>Very high (95+)</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Scan for duplicates
        </Button>
        {!!pairs?.length && status !== different && (
          <>
            <Button size="sm" variant="outline" onClick={() => setPicked(allPicked ? [] : pairs.map((p) => p.id))}>{allPicked ? "Clear selection" : "Select this page"}</Button>
            <Button size="sm" variant="outline" disabled={picked.length === 0} onClick={() => void decide(picked, different)}>Mark different ({picked.length})</Button>
            <Button size="sm" variant="outline" disabled={picked.length === 0} onClick={() => void decide(picked, "ignored")}>Ignore selected ({picked.length})</Button>
          </>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">Scores are recommendations, not proof — shared phones can be office lines and names repeat. Nothing merges until you confirm, one pair at a time.</p>
      {!pairs ? <NoData query={query} /> : pairs.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">No suggestions here. Run a scan to look again.</p> : pairs.map((p) => {
        const band = confidenceBand(p.score);
        return (
          <div key={p.id} className={cn("rounded-xl border p-3 transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((i) => i !== p.id) : [...x, p.id]))} aria-label="Select this suggestion" />
                <Badge className={cn(band.tone === "high" ? "bg-emerald-600" : band.tone === "mid" ? "bg-amber-500" : "bg-muted text-foreground")}>{p.score}% · {band.label}</Badge>
                {p.reasons.map((r) => <Badge key={r} variant="outline" className="text-[11px]">{reasonLabel(r)}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => onMerge(entity, [p.a.id, p.b.id])}>Compare &amp; merge</Button>
                <Button size="sm" variant="outline" onClick={() => void decide([p.id], different)}>Different</Button>
                <Button size="sm" variant="outline" onClick={() => void decide([p.id], "ignored")}>Ignore</Button>
                <Button size="sm" variant="outline" onClick={() => void decide([p.id], "flagged")}>Flag</Button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {[p.a, p.b].map((r) => (
                <button key={r.id} type="button" onClick={() => onOpen(entity, r.id)} className="rounded-lg border p-2.5 text-left text-[12.5px] hover:bg-muted/40">
                  <div className="font-medium">{r.name || "—"} {r.has_account ? <Badge variant="outline" className="ml-1 text-[10px]">login</Badge> : null}</div>
                  {fields.map(([k, label]) => <div key={k}><span className="text-muted-foreground">{label}: </span>{show(r[k])}</div>)}
                  <div className="text-[11px] text-muted-foreground">Created {String(r.created_at ?? "").slice(0, 10)} · updated {String(r.updated_at ?? "").slice(0, 10)}</div>
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

function CorrectionsTab({ refresh, onOpen }: { refresh: () => void; onOpen: (e: Entity, id: string) => void }) {
  const [status, setStatus] = useState("open");
  const [entity, setEntity] = useState<Entity | "">("");
  const [kind, setKind] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [gone, setGone] = useState<string[]>([]);
  const key = JSON.stringify([status, entity, kind]);
  useEffect(() => { setPicked([]); setConfirmAll(false); }, [key]);
  const pager = usePager(key);
  const query = useIntelQuery(["corrections", status, entity, kind, pager.size, pager.offset], () => intel.corrections(status, entity || null, kind || null, pager.size, pager.offset));
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
    try { const n = await intel.approveAllSafe(entity || null, kind || null); toast.success(`${n} formatting fixes applied`); setPicked([]); refresh(); } catch (e) { fail(e); }
  };
  const safeRows = rows?.filter((r) => r.safe) ?? [];
  const safeTotal = query.data?.safe_total ?? 0;

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Status">
          <option value="open">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="stale">Out of date</option>
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value as Entity | "")} className={select} aria-label="Record type">
          <option value="">Contacts and companies</option><option value="person">Contacts</option><option value="company">Companies</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={select} aria-label="Kind">
          <option value="">Every kind</option><option value="capitalisation">Capitalisation</option><option value="spacing">Spacing</option>
          <option value="swapped_names">Swapped names</option><option value="missing">Missing details</option><option value="conflicting">Conflicting designation</option>
          <option value="missing_domain">Missing domain</option><option value="incomplete">Incomplete</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Scan for issues
        </Button>
        {status === "open" && safeRows.length > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={() => setPicked(picked.length === safeRows.length ? [] : safeRows.map((r) => r.id))}>
              {picked.length === safeRows.length ? "Clear selection" : `Select formatting fixes on this page (${safeRows.length})`}
            </Button>
            <Button size="sm" disabled={picked.length === 0} onClick={() => void bulk()}>Approve selected ({picked.length})</Button>
            {confirmAll
              ? <Button size="sm" variant="destructive" onClick={() => void approveAll()}>Confirm: approve all {safeTotal}</Button>
              : safeTotal > safeRows.length && <Button size="sm" variant="outline" onClick={() => setConfirmAll(true)}>Approve all {safeTotal} formatting fixes</Button>}
          </>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">Only formatting fixes (spacing, capitalisation) can be approved in bulk. Everything else is reviewed one at a time. Nothing changes until approved.</p>
      {!rows ? <NoData query={query} /> : rows.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing here. Run a scan to look for issues.</p> : (
        <div className={cn("overflow-x-auto rounded-lg border transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-[12px] text-muted-foreground">
              <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Record</th><th className="px-3 py-2">Field</th><th className="px-3 py-2">Current</th><th className="px-3 py-2">Suggested</th><th className="px-3 py-2">Why</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="px-3 py-2">{s.safe && status === "open" && <input type="checkbox" checked={picked.includes(s.id)} onChange={() => setPicked((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])} aria-label="Select" />}</td>
                  <td className="px-3 py-2"><button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(s.entity_type, s.entity_id)}>{s.label || s.entity_id.slice(0, 8)}</button><div className="text-[11px] text-muted-foreground">{s.entity_type === "person" ? "Contact" : "Company"}</div></td>
                  <td className="px-3 py-2">{s.field}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.current_value ?? "—"}</td>
                  <td className="px-3 py-2">
                    {status === "open" ? (
                      <Input value={edits[s.id] ?? s.suggested_value ?? ""} onChange={(e) => setEdits((x) => ({ ...x, [s.id]: e.target.value }))} className="h-8 min-w-[10rem] text-[13px]" placeholder="Enter a value" />
                    ) : (s.suggested_value ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-[12px]">{s.reason}{s.evidence && <div className="text-muted-foreground">{s.evidence}</div>}</td>
                  <td className="px-3 py-2 tabular-nums">{s.confidence}%</td>
                  <td className="px-3 py-2">
                    {status === "open" && (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => void review(s, true)} disabled={!(edits[s.id] ?? s.suggested_value)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => void review(s, false)}>Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="suggestions" />
    </div>
  );
}

function AuditTab({ refresh }: { refresh: () => void }) {
  const [entity, setEntity] = useState<Entity | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const events = usePager(JSON.stringify([entity, from, to]));
  const merges = usePager(entity, 10);
  const query = useIntelQuery(["audit", entity, from, to, events.size, events.offset, merges.offset], () => intel.audit({
    entity: entity || null, from, to, limit: events.size, offset: events.offset, mergeOffset: merges.offset,
  }));
  const data = query.data;
  const rollback = async (id: string) => { try { await intel.revertMerge(id); toast.success("Merge rolled back"); refresh(); } catch (e) { fail(e); } };
  return (
    <div className="space-y-5 pt-3">
      <select value={entity} onChange={(e) => setEntity(e.target.value as Entity | "")} className={select} aria-label="Record type">
        <option value="">Contacts and companies</option><option value="person">Contacts</option><option value="company">Companies</option>
      </select>
      {!data ? <NoData query={query} /> : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Merges</h2>
            {data.merges.length === 0 ? <p className="text-[13px] text-muted-foreground">No merges yet.</p> : data.merges.map((m) => (
              <div key={String(m.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[13px]">
                <div>
                  <span className="font-medium">{String(m.survivor ?? "—")}</span>
                  <span className="text-muted-foreground"> · {String(m.entity_type)} · {(m.merged_ids as string[]).length} folded in · {new Date(String(m.created_at)).toLocaleString()}</span>
                  {m.reason ? <div className="text-[12px] text-muted-foreground">{String(m.reason)}</div> : null}
                </div>
                {m.reverted_at ? <Badge variant="outline">Rolled back</Badge> : (
                  <Button size="sm" variant="outline" onClick={() => void rollback(String(m.id))}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Roll back</Button>
                )}
              </div>
            ))}
            <Pager pager={merges} total={data.merges_total} updating={query.isFetching} label="merges" sizes={[10]} />
          </section>
          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-sm font-semibold">Activity</h2>
              <div className="flex flex-wrap items-end gap-2 text-[12px] text-muted-foreground">
                <label>From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-8 w-36" /></label>
                <label>to<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-8 w-36" /></label>
              </div>
            </div>
            <ol className={cn("space-y-1.5 transition-opacity", query.isPlaceholderData && "opacity-60")}>
              {data.events.map((e) => (
                <li key={String(e.id)} className="rounded-lg border px-3 py-2 text-[12.5px]">
                  <div><span className="font-medium">{String(e.action).replace(/^intel\./, "").replace(/_/g, " ")}</span> <span className="text-muted-foreground">· {String(e.target_type ?? "")} {String(e.target_id ?? "").slice(0, 8)}</span></div>
                  <div className="text-[11px] text-muted-foreground">{new Date(String(e.created_at)).toLocaleString()} · {String(e.actor ?? "system")}</div>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(e.details, null, 0)}</pre>
                </li>
              ))}
            </ol>
            <Pager pager={events} total={data.total} updating={query.isFetching} label="events" />
          </section>
        </>
      )}
    </div>
  );
}

const Loading = () => <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
