/**
 * Super Admin — Intelligence Centre (/dashboard/admin/intelligence).
 *
 * Contacts and companies across Illuxus: an overview of data quality,
 * searchable contact and company records with field-level editing and
 * history, scored duplicate suggestions, side-by-side merges with an impact
 * preview, a correction queue, and the audit history with rollback.
 *
 * Every action is a Super-Admin-only database function (migration 064)
 * that checks the role itself and records what it did; this page hiding
 * itself from others is not the protection.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeDialog } from "@/components/intelligence/MergeDialog";
import { RecordDrawer } from "@/components/intelligence/RecordDrawer";
import {
  confidenceBand, intel, reasonLabel,
  type CompanyRow, type ContactRow, type DuplicatePair, type Entity, type Overview, type Suggestion,
} from "@/lib/intelligence/admin-api";
import { cn } from "@/lib/utils";

const TABS = [
  ["overview", "Overview"], ["contacts", "Contacts"], ["companies", "Companies"],
  ["duplicates", "Duplicates"], ["corrections", "Corrections"], ["audit", "Audit history"],
] as const;
type Tab = (typeof TABS)[number][0];

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
const select = "h-9 rounded-md border border-input bg-background px-2 text-[13px]";

export default function IntelligenceCentrePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const go = (t: Tab, extra: Record<string, string> = {}) => setParams({ tab: t, ...extra });
  const [drawer, setDrawer] = useState<{ entity: Entity; id: string } | null>(null);
  const [merge, setMerge] = useState<{ entity: Entity; ids: string[] } | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Intelligence Centre</h1>
          <p className="text-[13px] text-muted-foreground">Contacts and companies across Illuxus — correct, de-duplicate and merge, with every change recorded.</p>
        </div>
        <Tabs value={tab} onValueChange={(v) => go(v as Tab)}>
          <TabsList className="flex-wrap h-auto">
            {TABS.map(([t, label]) => <TabsTrigger key={t} value={t}>{label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview"><OverviewTab go={go} version={version} /></TabsContent>
          <TabsContent value="contacts">
            <RecordsTab entity="person" initialFilter={params.get("filter") ?? "all"} version={version}
                        onOpen={(id) => setDrawer({ entity: "person", id })} onMerge={(ids) => setMerge({ entity: "person", ids })} />
          </TabsContent>
          <TabsContent value="companies">
            <RecordsTab entity="company" initialFilter={params.get("filter") ?? "all"} version={version}
                        onOpen={(id) => setDrawer({ entity: "company", id })} onMerge={(ids) => setMerge({ entity: "company", ids })} />
          </TabsContent>
          <TabsContent value="duplicates">
            <DuplicatesTab initialEntity={(params.get("entity") as Entity) || "person"} version={version} refresh={refresh}
                           onOpen={(entity, id) => setDrawer({ entity, id })} onMerge={(entity, ids) => setMerge({ entity, ids })} />
          </TabsContent>
          <TabsContent value="corrections"><CorrectionsTab version={version} refresh={refresh} onOpen={(entity, id) => setDrawer({ entity, id })} /></TabsContent>
          <TabsContent value="audit"><AuditTab version={version} refresh={refresh} /></TabsContent>
        </Tabs>
      </div>
      {drawer && <RecordDrawer entity={drawer.entity} id={drawer.id} onClose={() => setDrawer(null)} onChanged={refresh} />}
      {merge && <MergeDialog entity={merge.entity} ids={merge.ids} open onOpenChange={(o) => !o && setMerge(null)} onMerged={refresh} />}
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

function OverviewTab({ go, version }: { go: (t: Tab, extra?: Record<string, string>) => void; version: number }) {
  const [f, setF] = useState({ from: "", to: "", country: "", industry: "" });
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { intel.overview(f).then(setData).catch(fail); }, [f, version]);
  if (!data) return <Loading />;
  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-end gap-2 text-[12px] text-muted-foreground">
        <label>Created from<Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="mt-1 h-9 w-40" /></label>
        <label>to<Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="mt-1 h-9 w-40" /></label>
        <label>Country<Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className="mt-1 h-9 w-36" placeholder="Any" /></label>
        <label>Industry (companies)<Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className="mt-1 h-9 w-40" placeholder="Any" /></label>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Data quality score" value={`${data.people.quality}%`} hint="Name, company, designation and a verified address" />
        <Card label="Unique contacts" value={data.people.contacts} onClick={() => go("contacts")} />
        <Card label="Unique companies" value={data.companies.companies} onClick={() => go("companies")} />
        <Card label="Merged records" value={data.merges} onClick={() => go("audit")} />
        <Card label="Suspected duplicate contacts" value={data.duplicate_contacts} hint="Score 60+" tone="warn" onClick={() => go("duplicates", { entity: "person" })} />
        <Card label="Suspected duplicate companies" value={data.duplicate_companies} hint="Score 60+" tone="warn" onClick={() => go("duplicates", { entity: "company" })} />
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
    </div>
  );
}

function RecordsTab({ entity, initialFilter, version, onOpen, onMerge }: {
  entity: Entity; initialFilter: string; version: number; onOpen: (id: string) => void; onMerge: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [rows, setRows] = useState<Array<ContactRow | CompanyRow> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      (entity === "person" ? intel.searchContacts(q, filter) : intel.searchCompanies(q, filter)).then(setRows).catch(fail);
    }, 250);
    return () => window.clearTimeout(t);
  }, [entity, q, filter, version]);
  const idOf = (r: ContactRow | CompanyRow) => ("person_id" in r ? r.person_id : r.company_id);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const filters = entity === "person"
    ? [["all", "All contacts"], ["incomplete", "Incomplete"], ["no_company", "No company"], ["unverified", "Unverified"], ["with_account", "With a login"]]
    : [["all", "All companies"], ["incomplete", "Incomplete"], ["no_domain", "No domain"], ["provisional", "Provisional"], ["verified", "Verified"]];

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8 text-[13px]"
                 placeholder={entity === "person" ? "Name, email, phone, company, designation, LinkedIn or ID" : "Name, alias, domain, registry ID or company ID"} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={select} aria-label="Filter">
          {filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Button size="sm" disabled={picked.length < 2} onClick={() => onMerge(picked)}>Merge selected ({picked.length})</Button>
      </div>
      {!rows ? <Loading /> : rows.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing matches.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 text-left text-[12px] text-muted-foreground">
              {entity === "person" ? (
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Designation</th><th className="px-3 py-2">Events</th><th className="px-3 py-2">Updated</th></tr>
              ) : (
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Company</th><th className="px-3 py-2">Domains</th><th className="px-3 py-2">Industry</th><th className="px-3 py-2">Country</th><th className="px-3 py-2">Contacts</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Updated</th></tr>
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
                        <td className="px-3 py-2 tabular-nums">{r.contacts}</td>
                        <td className="px-3 py-2"><Badge variant={r.verification_status === "verified" ? "default" : "outline"} className="text-[10px]">{r.verification_status}</Badge></td>
                      </>
                    )}
                    <td className="px-3 py-2 text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">{rows[0]?.total ?? 0} total{(rows[0]?.total ?? 0) > rows.length ? ` — showing the first ${rows.length}; narrow the search` : ""}</p>
        </div>
      )}
    </div>
  );
}

function DuplicatesTab({ initialEntity, version, refresh, onOpen, onMerge }: {
  initialEntity: Entity; version: number; refresh: () => void; onOpen: (e: Entity, id: string) => void; onMerge: (e: Entity, ids: string[]) => void;
}) {
  const [entity, setEntity] = useState<Entity>(initialEntity);
  const [status, setStatus] = useState("open");
  const [minScore, setMinScore] = useState(0);
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const load = useCallback(() => { setPairs(null); intel.duplicates(entity, status, minScore).then(setPairs).catch(fail); }, [entity, status, minScore]);
  useEffect(() => { load(); }, [load, version]);
  const scan = async () => {
    setScanning(true);
    try { const n = await intel.refreshDuplicates(entity); toast.success(`Scan complete — ${n} pairs scored`); load(); } catch (e) { fail(e); } finally { setScanning(false); }
  };
  const decide = async (id: string, s: string) => { try { await intel.setDuplicateStatus(entity, id, s); toast.success("Saved"); refresh(); } catch (e) { fail(e); } };
  const fields = entity === "person"
    ? [["company", "Company"], ["designation", "Designation"], ["emails", "Email"], ["phones", "Phone"], ["linkedin", "LinkedIn"], ["events", "Events"]]
    : [["legal_name", "Legal name"], ["domains", "Domains"], ["aliases", "Aliases"], ["identifiers", "Registry IDs"], ["industry", "Industry"], ["contacts", "Contacts"]];
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined || v === "" ? "—" : String(v));

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className={select} aria-label="Record type">
          <option value="person">Contacts</option><option value="company">Companies</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={select} aria-label="Status">
          <option value="open">Open</option><option value="flagged">Flagged for review</option><option value="ignored">Ignored</option>
          <option value={entity === "person" ? "different_people" : "different_companies"}>Marked different</option>
        </select>
        <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className={select} aria-label="Confidence">
          <option value={0}>Any confidence</option><option value={60}>Possible and above (60+)</option><option value={80}>High (80+)</option><option value={95}>Very high (95+)</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Scan for duplicates
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">Scores are recommendations, not proof — shared phones can be office lines and names repeat. Nothing merges until you confirm.</p>
      {!pairs ? <Loading /> : pairs.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">No suggestions here. Run a scan to look again.</p> : pairs.map((p) => {
        const band = confidenceBand(p.score);
        return (
          <div key={p.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn(band.tone === "high" ? "bg-emerald-600" : band.tone === "mid" ? "bg-amber-500" : "bg-muted text-foreground")}>{p.score}% · {band.label}</Badge>
                {p.reasons.map((r) => <Badge key={r} variant="outline" className="text-[11px]">{reasonLabel(r)}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => onMerge(entity, [p.a.id, p.b.id])}>Compare &amp; merge</Button>
                <Button size="sm" variant="outline" onClick={() => void decide(p.id, entity === "person" ? "different_people" : "different_companies")}>Different</Button>
                <Button size="sm" variant="outline" onClick={() => void decide(p.id, "ignored")}>Ignore</Button>
                <Button size="sm" variant="outline" onClick={() => void decide(p.id, "flagged")}>Flag</Button>
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
    </div>
  );
}

function CorrectionsTab({ version, refresh, onOpen }: { version: number; refresh: () => void; onOpen: (e: Entity, id: string) => void }) {
  const [status, setStatus] = useState("open");
  const [entity, setEntity] = useState<Entity | "">("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const load = useCallback(() => { setRows(null); setPicked([]); intel.corrections(status, entity || null, kind || null).then(setRows).catch(fail); }, [status, entity, kind]);
  useEffect(() => { load(); }, [load, version]);
  const scan = async () => {
    setScanning(true);
    try { const n = await intel.generateCorrections(); toast.success(`Scan complete — ${n} suggestions open`); load(); } catch (e) { fail(e); } finally { setScanning(false); }
  };
  const review = async (s: Suggestion, approve: boolean) => {
    try { await intel.reviewCorrection(s.id, approve, edits[s.id] ?? null); toast.success(approve ? "Applied — the old value is kept in the history" : "Rejected"); refresh(); } catch (e) { fail(e); }
  };
  const bulk = async () => {
    try { const n = await intel.bulkApproveSafe(picked); toast.success(`${n} formatting fixes applied`); refresh(); } catch (e) { fail(e); }
  };
  const safeRows = rows?.filter((r) => r.safe) ?? [];

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
              {picked.length === safeRows.length ? "Clear selection" : `Select all formatting fixes (${safeRows.length})`}
            </Button>
            <Button size="sm" disabled={picked.length === 0} onClick={() => void bulk()}>Approve selected ({picked.length})</Button>
          </>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">Only formatting fixes (spacing, capitalisation) can be approved in bulk. Everything else is reviewed one at a time. Nothing changes until approved.</p>
      {!rows ? <Loading /> : rows.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Nothing here. Run a scan to look for issues.</p> : (
        <div className="overflow-x-auto rounded-lg border">
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
    </div>
  );
}

function AuditTab({ version, refresh }: { version: number; refresh: () => void }) {
  const [entity, setEntity] = useState<Entity | "">("");
  const [data, setData] = useState<Awaited<ReturnType<typeof intel.audit>> | null>(null);
  useEffect(() => { setData(null); intel.audit({ entity: entity || null }).then(setData).catch(fail); }, [entity, version]);
  const rollback = async (id: string) => { try { await intel.revertMerge(id); toast.success("Merge rolled back"); refresh(); } catch (e) { fail(e); } };
  if (!data) return <Loading />;
  return (
    <div className="space-y-5 pt-3">
      <select value={entity} onChange={(e) => setEntity(e.target.value as Entity | "")} className={select} aria-label="Record type">
        <option value="">Contacts and companies</option><option value="person">Contacts</option><option value="company">Companies</option>
      </select>
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
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Activity</h2>
        <ol className="space-y-1.5">
          {data.events.map((e) => (
            <li key={String(e.id)} className="rounded-lg border px-3 py-2 text-[12.5px]">
              <div><span className="font-medium">{String(e.action).replace(/^intel\./, "").replace(/_/g, " ")}</span> <span className="text-muted-foreground">· {String(e.target_type ?? "")} {String(e.target_id ?? "").slice(0, 8)}</span></div>
              <div className="text-[11px] text-muted-foreground">{new Date(String(e.created_at)).toLocaleString()} · {String(e.actor ?? "system")}</div>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(e.details, null, 0)}</pre>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const Loading = () => <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
