/**
 * Partner dashboard, event view — /partner/:accessId
 *
 * What a partner (agency) sees after opening one of their shared events from
 * the list at /partner: the event, their link, its analytics (funnel,
 * activity over time, approvals, top companies) and its participants with
 * approval and check-in status. Refreshes automatically so event-day
 * check-ins appear without reloading. When the organiser allowed it there is
 * also a form to register participants and a CSV export.
 *
 * Everything on screen comes from database functions scoped to this one
 * share; the page never receives data about other links. The id in the URL
 * is only honoured if it is one of the signed-in user's own active shares.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, Download,
  MapPin, MousePointerClick, RefreshCw, Search, UserPlus, Users, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import PersonFieldsForm, { emptyPersonFields, validatePersonFields, type PersonFields } from "@/components/people/PersonFieldsForm";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  approvalLabel, exportPartnerParticipants, fetchPartnerAnalytics, fetchPartnerGrants, fetchPartnerParticipants,
  isPartnerFeatureMissing, linkLabel, partnerErrorMessage, registerPartnerParticipant,
  type PartnerAnalytics as Analytics, type PartnerGrant, type PartnerParticipant,
} from "@/lib/utm/partner-access";
import { PartnerAnalytics } from "./PartnerAnalytics";
import { PartnerNotice as Notice, PartnerShell } from "./PartnerShell";

const PAGE_SIZE = 25;
const LIVE_REFRESH_MS = 15_000;

const APPROVAL_STYLE: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  waitlisted: "bg-muted text-muted-foreground border-border",
};

function formatWhen(iso: string | null, tz?: string | null, withTime = true): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric", month: "short", year: "numeric",
      ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(iso));
  } catch { return new Date(iso).toLocaleString(); }
}

const pct = (part: number | null, whole: number | null) =>
  part === null || whole === null || whole <= 0 ? null : Math.min(100, Math.round((part / whole) * 100));

function ApprovalBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] border ${APPROVAL_STYLE[status] ?? APPROVAL_STYLE.waitlisted}`}>{approvalLabel(status)}</span>;
}

function CheckInCell({ p }: { p: PartnerParticipant }) {
  if (p.checked_in === null) return <span className="text-muted-foreground">—</span>;
  return p.checked_in ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[12px]">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {p.checked_in_at ? formatWhen(p.checked_in_at) : "Checked in"}
    </span>
  ) : (
    <span className="text-[12px] text-muted-foreground">Not checked in</span>
  );
}

const BACK = { to: "/partner", label: "All shared events" };
const Shell = ({ children }: { children: React.ReactNode }) => <PartnerShell back={BACK}>{children}</PartnerShell>;

export default function PartnerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { accessId } = useParams<{ accessId: string }>();

  const grantsQuery = useQuery<PartnerGrant[]>({
    queryKey: ["partner-grants", user?.id],
    queryFn: fetchPartnerGrants,
    enabled: !!user,
    refetchInterval: LIVE_REFRESH_MS, // totals stay in step with the list
    retry: false,
  });
  const grants = grantsQuery.data ?? [];

  // Only an id of the caller's own active shares is ever honoured.
  const grant = grants.find((g) => g.id === accessId) ?? null;

  const analyticsQuery = useQuery<Analytics>({
    queryKey: ["partner-analytics", grant?.id],
    queryFn: () => fetchPartnerAnalytics(grant!.id),
    enabled: !!grant,
    refetchInterval: 60_000,
    retry: false,
  });

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [approval, setApproval] = useState("all");
  const [checkin, setCheckin] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  // Any change of scope or filter starts again from the first page.
  useEffect(() => { setPage(0); }, [grant?.id, debounced, approval, checkin, from, to]);
  // A permission the organiser removed must not leave a hidden filter applied.
  useEffect(() => {
    if (grant && !grant.can_view_approval) setApproval("all");
    if (grant && !grant.can_view_checkin) setCheckin("all");
  }, [grant]);

  const range = useMemo(() => {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1); // inclusive end day
    return {
      from: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
      to: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    };
  }, [from, to]);

  const listQuery = useQuery({
    queryKey: ["partner-participants", grant?.id, debounced, approval, checkin, range.from, range.to, page],
    queryFn: () => fetchPartnerParticipants(grant!.id, {
      search: debounced, approval, checkin, from: range.from, to: range.to, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    }),
    enabled: !!grant,
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS, // live approvals + check-ins
    retry: false,
  });

  // Access revoked while the page is open: drop the share straight away.
  const listError = listQuery.error as { code?: string; message?: string } | null;
  useEffect(() => {
    if (listError?.code === "42501") void qc.invalidateQueries({ queryKey: ["partner-grants"] });
  }, [listError, qc]);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [fields, setFields] = useState<PersonFields>(() => emptyPersonFields());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/partner")}`} replace />;

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["partner-grants"] });
    void qc.invalidateQueries({ queryKey: ["partner-participants"] });
    void qc.invalidateQueries({ queryKey: ["partner-analytics"] });
  };

  const submitRegistration = async () => {
    if (!grant || saving) return;
    const v = validatePersonFields(fields);
    if (!v.ok) { toast.error(v.error); return; }
    setSaving(true);
    try {
      const reg = await registerPartnerParticipant(grant.id, {
        title: fields.title,
        first_name: fields.first_name.trim(),
        last_name: fields.last_name.trim(),
        email: fields.email.trim().toLowerCase(),
        company: fields.company.trim(),
        designation: fields.designation.trim(),
        mobile_country_code: fields.mobile_country_code,
        mobile_number: fields.mobile_number.trim(),
        linkedin_url: fields.linkedin_url.trim(),
        company_website: fields.company_website.trim(),
        company_employee_count: fields.company_employee_count,
        industry: fields.industry,
      });
      toast.success(`${reg.name} registered`, {
        description: grant.event.requires_approval
          ? "The organiser will review this registration."
          : "They'll receive their ticket by email.",
      });
      setFields(emptyPersonFields());
      setRegisterOpen(false);
      refreshAll();
      // Same single ticket / confirmation email the organiser's own flow sends.
      void supabase.functions.invoke("send-ticket-email", { body: { registration_id: reg.id } }).catch(() => undefined);
    } catch (e) {
      toast.error("Couldn't register this participant", { description: partnerErrorMessage(e as { code?: string; message?: string }) });
    } finally { setSaving(false); }
  };

  const runExport = async () => {
    if (!grant || exporting) return;
    setExporting(true);
    try {
      const n = await exportPartnerParticipants(grant);
      toast.success("Export downloaded", { description: `${n.toLocaleString()} participant${n === 1 ? "" : "s"}` });
    } catch (e) {
      toast.error("Couldn't export", { description: partnerErrorMessage(e as { message?: string }) });
    } finally { setExporting(false); }
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy the link"); }
  };

  /* ── Page-level states ── */
  if (grantsQuery.isLoading) {
    return <Shell><p className="text-center py-12 text-muted-foreground">Loading event…</p></Shell>;
  }
  if (grantsQuery.error) {
    const e = grantsQuery.error as { code?: string; message?: string };
    return (
      <Shell>
        <Notice title={isPartnerFeatureMissing(e) ? "Partner dashboards aren't switched on yet" : "Couldn't load your shared links"}>
          <p>{isPartnerFeatureMissing(e) ? "Please check back shortly, or contact the organiser who invited you." : partnerErrorMessage(e)}</p>
          {!isPartnerFeatureMissing(e) && <Button size="sm" variant="outline" onClick={() => void grantsQuery.refetch()}>Try again</Button>}
        </Notice>
      </Shell>
    );
  }
  if (!grant) {
    return (
      <Shell>
        <Notice title="This shared event isn't available">
          <p>The link may have been removed by the organiser, or it was shared with a different account.</p>
          <Button size="sm" variant="outline" asChild><Link to="/partner">Back to shared events</Link></Button>
        </Notice>
      </Shell>
    );
  }

  const s = grant.stats;
  const total = listQuery.data?.total ?? 0;
  const rows = listQuery.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!debounced || approval !== "all" || checkin !== "all" || !!from || !!to;
  const where = [grant.event.venue, grant.event.location].filter(Boolean).join(", ");

  const kpis: { label: string; value: number | null; icon: typeof Users; hint?: string }[] = [
    ...(analyticsQuery.data ? [{ label: "Link clicks", value: analyticsQuery.data.clicks, icon: MousePointerClick }] : []),
    { label: "Registered", value: s.total, icon: Users, hint: analyticsQuery.data && pct(s.total, analyticsQuery.data.clicks) !== null ? `${pct(s.total, analyticsQuery.data.clicks)}% of clicks` : undefined },
    ...(grant.can_view_approval ? [
      { label: "Approved", value: s.approved, icon: CheckCircle2, hint: pct(s.approved, s.total) === null ? undefined : `${pct(s.approved, s.total)}% of registered` },
      { label: "Pending approval", value: s.pending, icon: Clock },
      { label: "Rejected", value: s.declined, icon: XCircle },
    ] : []),
    ...(grant.can_view_checkin ? [
      { label: "Checked in", value: s.checked_in, icon: CheckCircle2, hint: pct(s.checked_in, grant.can_view_approval ? s.approved : s.total) === null ? undefined : `${pct(s.checked_in, grant.can_view_approval ? s.approved : s.total)}% attendance` },
      ...(s.not_checked_in !== null ? [{ label: "Not checked in yet", value: s.not_checked_in, icon: Clock }] : []),
    ] : []),
  ];

  return (
    <Shell>
      {/* ── Which link am I looking at ── */}
      <section className="border border-border rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {grant.event.image_url && (
            <img src={grant.event.image_url} alt="" className="w-full sm:w-56 aspect-video object-cover rounded-lg border border-border shrink-0" />
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {grant.event.organizer_name ? `${grant.event.organizer_name} · ` : ""}Event
            </p>
            <h1 className="text-2xl font-bold leading-tight break-words">{grant.event.title}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatWhen(grant.event.date, grant.event.timezone)}</span>
              {where && <span className="inline-flex items-center gap-1.5 min-w-0"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="break-words">{where}</span></span>}
              {grant.event.requires_approval && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Registrations need organiser approval</span>}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-muted-foreground mr-1">Your link{grant.label ? ` · ${grant.label}` : ""}:</span>
            {([["source", grant.utm_source], ["medium", grant.utm_medium], ["campaign", grant.utm_campaign]] as const)
              .filter(([, v]) => v && v !== "(none)")
              .map(([k, v]) => (
                <span key={k} className="inline-flex gap-1 px-2 py-0.5 rounded-full border border-border bg-background break-all">
                  <span className="text-muted-foreground">{k}:</span> {v}
                </span>
              ))}
          </div>
          {grant.link_url && (
            <div className="flex items-center gap-2 min-w-0">
              <code className="flex-1 min-w-0 text-[12px] font-mono bg-background rounded-md px-2.5 py-1.5 border border-border break-all sm:truncate">{grant.link_url}</code>
              <Button size="sm" variant="outline" className="h-9 sm:h-8 gap-1.5 text-[12px] shrink-0" onClick={() => void copyLink(grant.link_url!)}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            You're seeing only the people registered through this link.
          </p>
        </div>
      </section>

      {/* ── Numbers ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2" aria-label="Summary">
        {kpis.map((k) => (
          <div key={k.label} className="border border-border rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><k.icon className="h-3 w-3 shrink-0" /><span className="truncate">{k.label}</span></div>
            <p className="text-xl font-semibold leading-tight tabular-nums">{(k.value ?? 0).toLocaleString()}</p>
            {k.hint && <p className="text-[11px] text-muted-foreground">{k.hint}</p>}
          </div>
        ))}
      </section>

      {/* ── Analytics ── */}
      <PartnerAnalytics grant={grant} analytics={analyticsQuery.data} unavailable={analyticsQuery.isError} />

      {/* ── Participants ── */}
      <section className="space-y-3" aria-label="Participants">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold">Participants</h3>
            <p className="text-[12px] text-muted-foreground inline-flex items-center gap-1.5">
              <RefreshCw className={`h-3 w-3 ${listQuery.isFetching ? "animate-spin" : ""}`} />
              Updates automatically every {LIVE_REFRESH_MS / 1000} seconds
            </p>
          </div>
          <div className="flex gap-2">
            {grant.can_export && (
              <Button variant="outline" className="h-10 sm:h-9 gap-1.5 text-[13px] flex-1 sm:flex-none" onClick={() => void runExport()} disabled={exporting || s.total === 0}>
                <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
              </Button>
            )}
            {grant.can_register && (
              <Button className="h-10 sm:h-9 gap-1.5 text-[13px] flex-1 sm:flex-none" onClick={() => setRegisterOpen(true)}>
                <UserPlus className="h-4 w-4" /> Register participant
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-2">
          <div className="relative col-span-2 lg:flex-1 lg:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or company…" aria-label="Search participants" className="pl-9 h-11 sm:h-9 text-base sm:text-[13px]" />
          </div>
          {grant.can_view_approval && (
            <Select value={approval} onValueChange={setApproval}>
              <SelectTrigger aria-label="Approval status" className="h-11 sm:h-9 text-base sm:text-[13px] lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All approvals</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}
          {grant.can_view_checkin && (
            <Select value={checkin} onValueChange={setCheckin}>
              <SelectTrigger aria-label="Check-in status" className="h-11 sm:h-9 text-base sm:text-[13px] lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All check-ins</SelectItem>
                <SelectItem value="in">Checked in</SelectItem>
                <SelectItem value="out">Not checked in</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="space-y-1 min-w-0">
            <label htmlFor="partner-from" className="text-[11px] text-muted-foreground">Registered from</label>
            <Input id="partner-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-11 sm:h-9 text-base sm:text-[13px]" />
          </div>
          <div className="space-y-1 min-w-0">
            <label htmlFor="partner-to" className="text-[11px] text-muted-foreground">to</label>
            <Input id="partner-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-11 sm:h-9 text-base sm:text-[13px]" />
          </div>
          {filtered && (
            <Button variant="ghost" className="h-11 sm:h-9 text-[13px] col-span-2 lg:col-span-1" onClick={() => { setSearch(""); setApproval("all"); setCheckin("all"); setFrom(""); setTo(""); }}>
              Clear filters
            </Button>
          )}
        </div>

        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading participants…</p>
        ) : listError ? (
          <div className="border border-border rounded-lg p-6 text-center space-y-2">
            <p className="text-[13px] text-destructive">
              {listError.code === "42501" ? "You no longer have access to this shared link." : `Couldn't load participants: ${partnerErrorMessage(listError)}`}
            </p>
            <Button size="sm" variant="outline" onClick={refreshAll}>Refresh</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="border border-border rounded-lg p-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              {filtered ? "No participants match these filters." : grant.can_register
                ? "No one has registered through this link yet. Share the link, or register a participant yourself."
                : "No one has registered through this link yet."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th scope="col" className="p-3 font-medium text-muted-foreground">Name</th>
                      <th scope="col" className="p-3 font-medium text-muted-foreground">Company</th>
                      <th scope="col" className="p-3 font-medium text-muted-foreground">Email</th>
                      <th scope="col" className="p-3 font-medium text-muted-foreground">Registered</th>
                      {grant.can_view_approval && <th scope="col" className="p-3 font-medium text-muted-foreground">Approval</th>}
                      {grant.can_view_checkin && <th scope="col" className="p-3 font-medium text-muted-foreground">Check-in</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0 align-top">
                        <td className="p-3">
                          <span className="font-medium">{p.name}</span>
                          {p.added_by_you && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">Added by you</span>}
                          {p.designation && <span className="block text-[12px] text-muted-foreground">{p.designation}</span>}
                        </td>
                        <td className="p-3 text-muted-foreground">{p.company || "—"}</td>
                        <td className="p-3 text-muted-foreground break-all">{p.email}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{formatWhen(p.registered_at)}</td>
                        {grant.can_view_approval && <td className="p-3"><ApprovalBadge status={p.approval_status} /></td>}
                        {grant.can_view_checkin && <td className="p-3"><CheckInCell p={p} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phone */}
            <ul className="md:hidden space-y-2">
              {rows.map((p) => (
                <li key={p.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium break-words">{p.name}</p>
                      <p className="text-[12px] text-muted-foreground break-words">{[p.designation, p.company].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    {grant.can_view_approval && <span className="shrink-0"><ApprovalBadge status={p.approval_status} /></span>}
                  </div>
                  <p className="text-[12px] text-muted-foreground break-all">{p.email}</p>
                  <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                    <span>Registered {formatWhen(p.registered_at, null, false)}{p.added_by_you ? " · by you" : ""}</span>
                    {grant.can_view_checkin && <CheckInCell p={p} />}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
              <span>
                {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString()} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page === 0} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 tabular-nums">Page {page + 1} of {pages}</span>
                <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setPage((n) => Math.min(pages - 1, n + 1))} disabled={page >= pages - 1} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Register a participant ── */}
      <Dialog open={registerOpen} onOpenChange={(o) => { if (!saving) setRegisterOpen(o); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[640px] max-h-[92dvh] overflow-y-auto rounded-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base pr-8">Register participant</DialogTitle>
            <DialogDescription className="text-[12px] break-words">
              For {grant.event.title}, under your link ({linkLabel(grant)}).
              {grant.event.requires_approval ? " The organiser approves registrations for this event." : ""}
            </DialogDescription>
          </DialogHeader>
          <PersonFieldsForm value={fields} onChange={setFields} />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => setRegisterOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="h-11 sm:h-9" onClick={() => void submitRegistration()} disabled={saving}>{saving ? "Registering…" : "Register"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
