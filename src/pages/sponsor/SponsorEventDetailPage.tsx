/**
 * Sponsor view of one event — /sponsor/events/:eventId
 *
 * View only. The event (image, title, date, venue) with its status and a
 * countdown, four stats, check-in progress and the audience mix, then the
 * participants: tabs for everyone / speakers / attendees, search, a check-in
 * filter, and a table on wide screens or rows on phones. Every person shows
 * their designation and company; opening one shows their details in a side
 * panel (a bottom sheet on phones). Updates live as people check in.
 *
 * Designation comes from `sponsor_portal_people` (migration 048). Before that
 * migration, speakers' designations are read from their public profiles and
 * attendees show company only.
 *
 * Meeting Interest: a checkbox per attendee or speaker records that this
 * sponsor would like to meet them (`sponsor_set_meeting_interest`, migration
 * 050; speakers from 051). The
 * sponsor is worked out on the server from the session; other sponsors'
 * selections are never touched. It records interest only. Teammates' changes
 * appear live (migration 051).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, CheckCircle2, ChevronRight, Eye, Lock, Mic, Search, User, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";
import SiteHeader from "@/components/SiteHeader";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

type Person = {
  kind: "speaker" | "attendee";
  id: string;
  name: string;
  company: string | null;
  designation?: string | null;
  ticket_type: string;
  checked_in: boolean;
  checked_in_at: string | null;
  /** This sponsor's Meeting Interest (attendees from migration 050, speakers from 051). */
  meeting_interest?: boolean;
};

type EventInfo = {
  title: string;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
  image_url: string | null;
  banner_landscape_url: string | null;
  timezone: string | null;
};

const PAGE = 25;

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
/** "Designation · Company", whichever parts exist. */
const roleLine = (p: Person) => [p.designation, p.company].filter(Boolean).join(" · ");

export default function SponsorEventDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();
  const [tab, setTab] = useState<"all" | "speaker" | "attendee">("all");
  const [status, setStatus] = useState<"any" | "in" | "no">("any");
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { data: event } = useQuery<EventInfo | null>({
    queryKey: ["sponsor-event", eventId],
    enabled: !!user && !!eventId,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("title, date, end_date, venue, location, image_url, banner_landscape_url, timezone")
        .eq("id", eventId!)
        .maybeSingle();
      return (data as EventInfo | null) ?? null;
    },
  });

  const queryClient = useQueryClient();
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const savingRef = useRef(savingIds);
  savingRef.current = savingIds;

  /** Sets this sponsor's Meeting Interest; shown at once, undone if saving fails. */
  const setInterest = async (p: Person, next: boolean) => {
    if (savingIds.has(p.id)) return;
    const key = ["sponsor-people", eventId];
    const apply = (value: boolean) =>
      queryClient.setQueryData<Person[]>(key, (rows) => rows?.map((r) => (r.kind === p.kind && r.id === p.id ? { ...r, meeting_interest: value } : r)));
    apply(next);
    setSavingIds((ids) => new Set(ids).add(p.id));
    const { error } = await supabaseRpc("sponsor_set_meeting_interest" as never, (p.kind === "speaker"
      ? { _eid: eventId, _registration_id: null, _speaker_id: p.id, _interested: next }
      : { _eid: eventId, _registration_id: p.id, _interested: next }) as never);
    setSavingIds((ids) => { const n = new Set(ids); n.delete(p.id); return n; });
    if (error) {
      apply(!next);
      const missing = /sponsor_set_meeting_interest|function .* does not exist|schema cache/i.test(error.message ?? "");
      toast.error("Meeting Interest wasn't saved", {
        description: missing ? `This needs a database update that hasn't been applied yet (migration ${p.kind === "speaker" ? "051" : "050"}).` : error.message,
      });
      return;
    }
    toast.success(next ? `Meeting Interest saved for ${p.name}` : `Meeting Interest removed for ${p.name}`);
  };

  const { data: people = [], isLoading, refetch } = useQuery<Person[]>({
    queryKey: ["sponsor-people", eventId],
    enabled: !!user && !!eventId,
    queryFn: async () => {
      const { data } = await supabaseRpc("sponsor_portal_people" as never, { _eid: eventId } as never);
      const rows = (data || []) as unknown as Person[];
      // Until migration 048 the function has no designation: take speakers'
      // from their public profiles.
      const missing = rows.filter((r) => r.kind === "speaker" && r.designation === undefined).map((r) => r.id);
      if (missing.length) {
        const { data: sp } = await supabase.from("speakers").select("id, designation, title").in("id", missing);
        const byId = new Map(((sp || []) as { id: string; designation: string | null; title: string | null }[]).map((s) => [s.id, s.designation || s.title]));
        rows.forEach((r) => { if (r.kind === "speaker" && r.designation === undefined) r.designation = byId.get(r.id) ?? null; });
      }
      return rows;
    },
  });

  // Live: refresh as people check in and as anyone on the sponsor's team
  // marks Meeting Interest. Sponsors can't read registrations, so check-ins
  // arrive as a "changed" signal on `event-live:<event>` (migration 051), and
  // the list is reloaded through `sponsor_portal_people`. Also every 15s in
  // case the connection drops, and when the tab comes back into view.
  useEffect(() => {
    if (!user || !eventId) return;
    let soonTimer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(soonTimer);
      // Don't overwrite a tick that's still saving.
      soonTimer = setTimeout(() => { if (!savingRef.current.size) void refetch(); }, 300);
    };
    const channel = supabase
      .channel(`event-live:${eventId}`)
      .on("broadcast", { event: "changed" }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sponsor_meeting_interests", filter: `event_id=eq.${eventId}` }, soon)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sponsor_meeting_interests" }, soon)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => { if (document.visibilityState === "visible") soon(); }, 15_000);
    return () => {
      clearTimeout(soonTimer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user, eventId, refetch]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setPage(0), [tab, status, q]);

  const stats = useMemo(() => {
    const speakers = people.filter((p) => p.kind === "speaker");
    const attendees = people.filter((p) => p.kind === "attendee");
    return {
      all: people.length,
      speakers: speakers.length,
      attendees: attendees.length,
      inAll: people.filter((p) => p.checked_in).length,
      inSpk: speakers.filter((p) => p.checked_in).length,
      inAtt: attendees.filter((p) => p.checked_in).length,
    };
  }, [people]);

  const interestCount = useMemo(() => people.filter((p) => p.meeting_interest).length, [people]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people
      .filter((p) => tab === "all" || p.kind === tab)
      .filter((p) => (status === "in" ? p.checked_in : status === "no" ? !p.checked_in : true))
      .filter((p) => !term || [p.name, p.company, p.designation].some((v) => (v ?? "").toLowerCase().includes(term)))
      .sort((a, b) => (asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
  }, [people, tab, status, q, asc]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/sponsor/events/${eventId}`)}`} replace />;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const filtered = !!q.trim() || status !== "any";
  const showing = filtered
    ? `${rows.length} matching`
    : rows.length ? `Showing ${page * PAGE + 1}–${page * PAGE + pageRows.length} of ${rows.length}` : "No one yet";
  const open = people.find((p) => p.id === openId) ?? null;

  // Event status line.
  const start = event ? new Date(event.date).getTime() : NaN;
  const end = event ? new Date(event.end_date || event.date).getTime() + (event.end_date ? 0 : 12 * 3_600_000) : NaN;
  const live = Number.isFinite(start) && now >= start && now <= end;
  const over = Number.isFinite(end) && now > end;
  const doors = event ? new Date(event.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const until = Number.isFinite(start) ? Math.max(0, start - now) : 0;
  // Calendar days to the start ("tomorrow" even when it's under 24 hours away).
  const dayOf = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Number.isFinite(start) ? Math.round((dayOf(start) - dayOf(now)) / 86_400_000) : 0;
  const countdown = until >= 86_400_000
    ? `in ${Math.floor(until / 86_400_000)}d ${Math.floor(until / 3_600_000) % 24}h`
    : `in ${Math.floor(until / 3_600_000)}h ${String(Math.floor(until / 60_000) % 60).padStart(2, "0")}m`;
  const opensAt = event ? new Date(event.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "—";
  const image = event?.banner_landscape_url || event?.image_url;

  const RoleTag = ({ p }: { p: Person }) => (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
      p.kind === "speaker" ? "bg-blue-500/10 text-blue-600 dark:text-blue-300" : "bg-muted text-muted-foreground",
    )}>
      {p.kind === "speaker" ? "Speaker" : "Attendee"}
    </span>
  );
  const Status = ({ p }: { p: Person }) => (
    <span className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold",
      p.checked_in ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground",
    )}>
      <i className={cn("h-[7px] w-[7px] rounded-full", p.checked_in ? "bg-green-500" : "bg-muted-foreground/60")} />
      {p.checked_in ? "Checked in" : "Not yet"}
    </span>
  );
  const InterestBox = ({ p }: { p: Person }) => (
    <label
      onClick={(e) => e.stopPropagation()}
      className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-muted-foreground"
      title={`Meeting Interest: you'd like to meet this ${p.kind}`}
    >
      <Checkbox
        checked={!!p.meeting_interest}
        disabled={savingIds.has(p.id)}
        onCheckedChange={(v) => void setInterest(p, v === true)}
        aria-label={`Meeting Interest for ${p.name}`}
      />
      <span className="md:sr-only">Meeting Interest</span>
    </label>
  );

  const Avatar = ({ name, size = 40 }: { name: string; size?: number }) => (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground/80"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  );

  const emptyText = status === "in" && !q && !stats.inAll
    ? { title: "No one has checked in yet", body: event ? `Check-in opens ${opensAt}.` : "Check-in hasn't started." }
    : { title: "No matches", body: "Try another name, designation or company." };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1240px] px-4 pb-16 md:px-8">
        <Link to="/sponsor" className="mt-1 inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-[18px] w-[18px]" /> Events
        </Link>

        {/* Event */}
        <div className="md:mt-2 md:flex md:items-center md:gap-6">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            {image
              ? <img src={image} alt="" className="h-[68px] w-[68px] shrink-0 rounded-[14px] object-cover md:h-[84px] md:w-[84px]" />
              : <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[14px] bg-muted md:h-[84px] md:w-[84px]"><Users className="h-6 w-6 text-muted-foreground" /></span>}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Eye className="h-3 w-3" /> Sponsor view
              </span>
              <h1 className="text-[17px] font-semibold leading-tight tracking-tight md:text-2xl">{event?.title ?? "Event"}</h1>
              {event && (
                <span className="text-[12.5px] text-muted-foreground md:text-sm">
                  {new Date(event.date).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {(event.venue || event.location) && ` · ${[event.venue, event.location].filter(Boolean).join(", ")}`}
                </span>
              )}
            </div>
          </div>
          {event && (
            <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground md:mt-0 md:shrink-0 md:px-4 md:py-3">
              <i className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                live ? "bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,.15)]" : over ? "bg-muted-foreground" : "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,.15)]",
              )} />
              {live ? (
                <span><b className="font-semibold text-foreground">Happening now</b> · check-in open</span>
              ) : over ? (
                <span><b className="font-semibold text-foreground">Event ended</b></span>
              ) : (
                <>
                  <span><b className="font-semibold text-foreground">{days === 0 ? "Starts today" : days === 1 ? "Starts tomorrow" : `Starts in ${days} days`}</b> · doors {doors}</span>
                  <span className="ml-auto whitespace-nowrap font-semibold text-foreground md:ml-3">{countdown}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:mt-6 md:grid-cols-4 md:gap-3.5">
          <Kpi icon={<Users className="h-[15px] w-[15px]" />} label="Registered" value={stats.all} sub="Everyone on the list" />
          <Kpi icon={<Mic className="h-[15px] w-[15px]" />} label="Speakers" value={stats.speakers} sub={`${pct(stats.speakers, stats.all)}% of registrations`} />
          <Kpi icon={<User className="h-[15px] w-[15px]" />} label="Attendees" value={stats.attendees} sub={`${pct(stats.attendees, stats.all)}% of registrations`} />
          <Kpi
            icon={<CheckCircle2 className="h-[15px] w-[15px]" />} label="Checked in" value={stats.inAll} ok
            sub={stats.inAll ? `${pct(stats.inAll, stats.all)}% of ${stats.all} have arrived` : event && !over ? `0% · check-in opens ${doors}` : "0%"}
          />
        </div>

        {/* Insights */}
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:mt-3.5 md:grid-cols-2 md:gap-3.5">
          <div className="rounded-[18px] border border-border bg-card p-4 md:p-5">
            <h2 className="text-[15px] font-semibold">Check-in progress</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{live ? "Live" : "Updates live on event day"}</p>
            <div className="mt-3.5 flex flex-col gap-3">
              <Progress label="Everyone" n={stats.inAll} of={stats.all} />
              <Progress label="Speakers" n={stats.inSpk} of={stats.speakers} />
              <Progress label="Attendees" n={stats.inAtt} of={stats.attendees} />
            </div>
          </div>
          <div className="rounded-[18px] border border-border bg-card p-4 md:p-5">
            <h2 className="text-[15px] font-semibold">Audience mix</h2>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Who's registered</p>
            <div className="mt-3.5 flex h-3 gap-0.5" role="img" aria-label={`${stats.speakers} speakers, ${stats.attendees} attendees`}>
              {stats.speakers > 0 && <i className="block h-full rounded-l bg-blue-500 last:rounded-r" style={{ width: `${pct(stats.speakers, stats.all)}%` }} />}
              {stats.attendees > 0 && <i className="block h-full rounded-r bg-muted-foreground/40 first:rounded-l" style={{ width: `${pct(stats.attendees, stats.all)}%` }} />}
              {!stats.all && <i className="block h-full w-full rounded bg-muted" />}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-blue-500" />Speakers <b className="font-semibold text-foreground">{stats.speakers}</b> · {pct(stats.speakers, stats.all)}%</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/40" />Attendees <b className="font-semibold text-foreground">{stats.attendees}</b> · {pct(stats.attendees, stats.all)}%</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[14px] bg-muted/60 px-3 py-2.5"><small className="mb-0.5 block text-[11.5px] text-muted-foreground">Still to arrive</small><b className="text-[17px] font-semibold">{stats.all - stats.inAll}</b></div>
              <div className="rounded-[14px] bg-muted/60 px-3 py-2.5"><small className="mb-0.5 block text-[11.5px] text-muted-foreground">Check-in opens</small><b className="text-[17px] font-semibold">{opensAt}</b></div>
            </div>
          </div>
        </div>

        {/* Participants */}
        <div className="mb-3 mt-7 md:mt-9">
          <h2 className="text-[19px] font-bold tracking-tight md:text-[22px]">Participants</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            View only · updates as people check in{interestCount > 0 && <> · <b className="font-semibold text-foreground">{interestCount}</b> marked for Meeting Interest</>}
          </p>
        </div>

        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Show">
            {([["all", "All", stats.all], ["speaker", "Speakers", stats.speakers], ["attendee", "Attendees", stats.attendees]] as const).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "flex h-[38px] shrink-0 items-center gap-2 rounded-full border pl-3.5 pr-1.5 text-[13.5px] transition-colors",
                  tab === k ? "border-foreground bg-foreground font-semibold text-background" : "border-border font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold", tab === k ? "bg-background/20" : "bg-muted")}>{n}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 md:max-w-[640px] md:flex-1 md:flex-row">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 text-muted-foreground focus-within:border-foreground">
              <Search className="h-[18px] w-[18px] shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, designation or company"
                aria-label="Search name, designation or company"
                className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="grid shrink-0 grid-cols-3 rounded-xl border border-border bg-muted/40 p-[3px]" role="group" aria-label="Check-in status">
              {([["any", "Any status"], ["in", "Checked in"], ["no", "Not yet"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={status === k}
                  onClick={() => setStatus(k)}
                  className={cn(
                    "h-9 whitespace-nowrap rounded-[9px] px-2.5 text-[13px]",
                    status === k ? "bg-card font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading participants…</p>
        ) : (
          <>
            {/* Phones: rows */}
            <div className="mx-0.5 mb-1 mt-3.5 flex items-center justify-between text-[12.5px] text-muted-foreground md:hidden">
              <span>{showing}</span>
              <button type="button" onClick={() => setAsc((v) => !v)}>{asc ? "A–Z" : "Z–A"}</button>
            </div>
            <ul className="md:hidden">
              {pageRows.length ? pageRows.map((p) => (
                <li key={`${p.kind}-${p.id}`} className="border-b border-border last:border-0">
                  <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-3 px-0.5 pt-3 pb-2 text-left">
                    <Avatar name={p.name} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                      <b className="text-[14.5px] font-semibold">{p.name}</b>
                      {roleLine(p) && <span className="truncate text-[12.5px] text-muted-foreground">{roleLine(p)}</span>}
                      <span className="mt-1"><RoleTag p={p} /></span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Status p={p} />
                      {p.checked_in && p.checked_in_at && <small className="text-[11.5px] text-muted-foreground">{timeOf(p.checked_in_at)}</small>}
                    </span>
                  </button>
                  <div className="pb-3 pl-[52px]"><InterestBox p={p} /></div>
                </li>
              )) : (
                <li className="px-3 py-9 text-center text-[13.5px] text-muted-foreground"><b className="mb-1 block text-[15px] text-foreground">{emptyText.title}</b>{emptyText.body}</li>
              )}
            </ul>

            {/* Wide screens: table */}
            <div className="mt-3.5 hidden overflow-hidden rounded-[18px] border border-border bg-card md:block">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-[12.5px] text-muted-foreground">
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">
                      <button type="button" onClick={() => setAsc((v) => !v)} aria-label="Sort by name" className="inline-flex items-center gap-1.5">
                        Name <ArrowDown className={cn("h-3.5 w-3.5 transition-transform", !asc && "rotate-180")} />
                      </button>
                    </th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Designation</th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Company</th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Role</th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Check-in</th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Time</th>
                    <th scope="col" className="border-b border-border px-[18px] py-3 font-semibold">Meeting Interest</th>
                    <th scope="col" className="w-10 border-b border-border"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length ? pageRows.map((p) => (
                    <tr
                      key={`${p.kind}-${p.id}`}
                      tabIndex={0}
                      onClick={() => setOpenId(p.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(p.id); }}
                      className="cursor-pointer hover:bg-muted/40 [&:last-child>td]:border-0"
                    >
                      <td className="border-b border-border px-[18px] py-[11px]">
                        <span className="flex items-center gap-3 font-semibold"><Avatar name={p.name} size={34} />{p.name}</span>
                      </td>
                      <td className="border-b border-border px-[18px] py-[11px] text-muted-foreground">{p.designation || "—"}</td>
                      <td className="border-b border-border px-[18px] py-[11px] text-muted-foreground">{p.company || "—"}</td>
                      <td className="border-b border-border px-[18px] py-[11px]"><RoleTag p={p} /></td>
                      <td className="border-b border-border px-[18px] py-[11px]"><Status p={p} /></td>
                      <td className="border-b border-border px-[18px] py-[11px] text-[13px] text-muted-foreground">{p.checked_in ? timeOf(p.checked_in_at) || "—" : "—"}</td>
                      <td className="border-b border-border px-[18px] py-[11px]"><InterestBox p={p} /></td>
                      <td className="border-b border-border pr-3 text-right text-muted-foreground"><ChevronRight className="ml-auto h-[18px] w-[18px]" /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} className="px-3 py-9 text-center text-[13.5px] text-muted-foreground"><b className="mb-1 block text-[15px] text-foreground">{emptyText.title}</b>{emptyText.body}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {rows.length > 0 && (
              <div className="mt-3.5 flex items-center justify-between text-[13px] text-muted-foreground">
                <span className="hidden md:inline">{showing}</span>
                <span className="md:hidden">Page {page + 1} of {pages}</span>
                <div className="flex gap-1.5">
                  <button type="button" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="h-[38px] rounded-[10px] border border-border px-3 font-medium text-foreground disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="h-[38px] rounded-[10px] border border-border px-3 font-medium text-foreground disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Person details: a side panel, or a bottom sheet on phones */}
      <div
        aria-hidden="true"
        onClick={() => setOpenId(null)}
        className={cn("fixed inset-0 z-50 bg-black/50 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Participant details"
        className={cn(
          "fixed inset-x-0 bottom-0 z-[51] rounded-t-3xl bg-card px-4 pb-6 pt-2 shadow-xl transition-transform duration-300 md:inset-y-0 md:left-auto md:w-[420px] md:rounded-none md:border-l md:border-border md:p-6",
          open ? "translate-x-0 translate-y-0" : "translate-y-[105%] md:translate-x-[105%] md:translate-y-0",
        )}
      >
        {open && (
          <>
            <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-border md:hidden" />
            <div className="flex items-center gap-3.5">
              <Avatar name={open.name} size={54} />
              <div className="min-w-0 flex-1">
                <b className="block text-[17px] font-semibold leading-tight">{open.name}</b>
                <span className="text-[13px] text-muted-foreground">{roleLine(open) || (open.kind === "speaker" ? "Speaker" : "Attendee")}</span>
              </div>
              <button type="button" onClick={() => setOpenId(null)} aria-label="Close" className="hidden h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground md:flex">
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Fact label="Role" value={open.kind === "speaker" ? "Speaker" : "Attendee"} />
              <Fact label="Check-in" value={open.checked_in ? `Checked in${open.checked_in_at ? ` · ${timeOf(open.checked_in_at)}` : ""}` : "Not yet"} />
              <Fact label="Designation" value={open.designation || "—"} wide />
              <Fact label="Company" value={open.company || "—"} wide />
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-[14px] bg-muted/60 px-3 py-3">
              <span>
                <b className="block text-[14px] font-semibold">Meeting Interest</b>
                <span className="text-[12px] text-muted-foreground">Let the organiser know you'd like to meet {open.name.split(" ")[0]}.</span>
              </span>
              <Switch checked={!!open.meeting_interest} disabled={savingIds.has(open.id)} onCheckedChange={(v) => void setInterest(open, v)} aria-label="Meeting Interest" />
            </label>
            <p className="mt-3.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> View only. Check-in is handled by the organiser.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function Kpi({ icon, label, value, sub, ok = false }: { icon: React.ReactNode; label: string; value: number; sub: string; ok?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-border bg-card p-3.5 md:px-5 md:py-[18px]">
      <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">{icon}{label}</span>
      <span className={cn("text-[28px] font-bold leading-tight tracking-tight tabular-nums md:text-[32px]", ok && "text-green-700 dark:text-green-400")}>{value}</span>
      <span className="text-[12px] text-muted-foreground/80">{sub}</span>
    </div>
  );
}

function Progress({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px] text-muted-foreground">
        <span>{label}</span>
        <span><b className="font-semibold text-foreground">{n}</b> / {of}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <i className="block h-full rounded bg-green-500 transition-[width] duration-500" style={{ width: `${pct(n, of)}%` }} />
      </div>
    </div>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("rounded-[14px] bg-muted/60 px-3 py-2.5", wide && "col-span-2")}>
      <small className="mb-0.5 block text-[11.5px] text-muted-foreground">{label}</small>
      <b className="text-[14px] font-semibold">{value}</b>
    </div>
  );
}
