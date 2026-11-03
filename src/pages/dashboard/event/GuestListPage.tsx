import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, Check, X, Clock3, ArrowLeft, Download } from "lucide-react";
import { isUuid } from "@/lib/event-routes";
import { fetchAllRows } from "@/lib/reports/fetch";
import { supabaseRpc, logger } from "@/lib/observability";

interface Reg {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  approval_status: string;
  status: string;
  checked_in: boolean;
  /** "inside" | "outside" once attendance is tracked; null before the first check-in. */
  attendance_state: string | null;
  created_at: string;
}

const REG_COLUMNS = "id, name, email, ticket_type, approval_status, status, checked_in, attendance_state, created_at";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "checkedin", label: "Checked in" },
] as const;

export default function GuestListPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [eventTitle, setEventTitle] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [rows, setRows] = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    (async () => {
      const isUuidId = isUuid(id);
      const { data: ev } = await supabase
        .from("events")
        .select("id, title, slug")
        .eq(isUuidId ? "id" : "slug", id)
        .maybeSingle();
      if (cancel || !ev) { setLoading(false); return; }
      setEventId(ev.id);
      setEventTitle(ev.title);
      // Every guest, page by page: one request stops at the API's row cap.
      let all: Reg[] = [];
      try {
        all = await fetchAllRows<Reg>((from, to) =>
          supabase
            .from("registrations")
            .select(REG_COLUMNS)
            .eq("event_id", ev.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        );
      } catch (err) {
        toast({ title: "Could not load guests", description: (err as Error).message, variant: "destructive" });
      }
      if (cancel) return;
      setRows(all);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [id, toast]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tab === "checkedin" && !r.checked_in) return false;
      if (tab !== "all" && tab !== "checkedin" && r.approval_status !== tab) return false;
      if (q.trim()) {
        const t = q.trim().toLowerCase();
        return r.name.toLowerCase().includes(t) || r.email.toLowerCase().includes(t);
      }
      return true;
    });
  }, [rows, tab, q]);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.approval_status === "pending").length,
    approved: rows.filter(r => r.approval_status === "approved").length,
    waitlisted: rows.filter(r => r.approval_status === "waitlisted").length,
    checkedin: rows.filter(r => r.checked_in).length,
  }), [rows]);

  const setApproval = async (reg: Reg, next: string) => {
    const { error } = await supabase.from("registrations").update({ approval_status: next }).eq("id", reg.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setRows((rs) => rs.map((r) => r.id === reg.id ? { ...r, approval_status: next } : r));
    // An approved guest gets their ticket, as from the event's Registrations
    // tab (RegistrationsSection.updateApprovalStatus).
    if (next !== "approved") return;
    const { data, error: emailErr } = await supabase.functions.invoke("send-ticket-email", { body: { registration_id: reg.id } });
    const result = data as { error?: string; delivered?: boolean; note?: string } | null;
    if (emailErr || result?.error) {
      toast({ title: "Approved, but the ticket email wasn't sent", description: result?.error ?? emailErr?.message, variant: "destructive" });
    } else if (result?.delivered === false) {
      toast({ title: "Approved. Ticket email skipped", description: result.note ?? "Email isn't set up." });
    } else {
      toast({ title: `Ticket sent to ${reg.email || "the guest"}` });
    }
  };

  // Through the attendance RPC, like the Registrations tab and the door
  // scanner, so the check-in is logged and counted as inside.
  const toggleCheckIn = async (reg: Reg) => {
    const { data, error } = await supabaseRpc("toggle_attendance" as never, { p_reg_id: reg.id, p_method: "manual" } as never);
    const result = (Array.isArray(data) ? data[0] : data) as { state?: string } | null;
    if (error || !result) {
      logger.warn("guest-list toggle-attendance failed", { reg_id: reg.id, error_message: error?.message ?? null });
      toast({ title: "Could not update check-in", description: error?.message, variant: "destructive" });
      return;
    }
    if (result.state === "tracking_closed") {
      toast({ title: "Tracking is closed", description: "This event ended more than 2 hours ago.", variant: "destructive" });
      return;
    }
    const { data: fresh } = await supabase.from("registrations").select(REG_COLUMNS).eq("id", reg.id).maybeSingle();
    if (fresh) setRows((rs) => rs.map((r) => (r.id === reg.id ? (fresh as unknown as Reg) : r)));
    toast({ title: result.state === "inside" ? `${reg.name} checked in` : `${reg.name} checked out` });
  };

  const exportCsv = () => {
    const header = [
      // Basic Information
      "Registration ID",
      "Name", 
      "Email", 
      "Ticket Type", 
      "Status", 
      "Approval Status", 
      "Checked In",
      "Registered At"
    ];
    const lines = [header.join(",")].concat(
      filtered.map((r) => [
        r.id,
        r.name, 
        r.email, 
        r.ticket_type, 
        r.status, 
        r.approval_status, 
        r.checked_in ? "Yes" : "No",
        new Date(r.created_at).toLocaleString()
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${eventTitle || "guests"}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/dashboard/events/${id}`} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-1">
              <ArrowLeft className="h-3 w-3" /> Back to event
            </Link>
            <h1 className="text-xl font-semibold tracking-tight truncate">{eventTitle || "Event"} — Guest list</h1>
          </div>
          <Button onClick={exportCsv} variant="outline" size="sm" className="h-8 text-[13px] gap-1.5"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-secondary rounded-full">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 h-7 rounded-full text-[12px] font-medium transition-colors ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label} <span className="opacity-60 ml-1">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…" className="pl-8 h-8 text-[13px]" />
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center text-[13px] text-muted-foreground">No guests in this view.</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Guest</th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Ticket</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-right font-medium px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <div className="font-medium truncate">{r.name || "—"}</div>
                      <div className="text-[12px] text-muted-foreground truncate">{r.email}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell capitalize">{r.ticket_type}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.approval_status} checkedIn={r.checked_in} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {r.approval_status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1" onClick={() => setApproval(r, "approved")}><Check className="h-3 w-3" /> Approve</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[12px] gap-1 text-destructive hover:text-destructive" onClick={() => setApproval(r, "declined")}><X className="h-3 w-3" /> Decline</Button>
                          </>
                        )}
                        {r.approval_status === "waitlisted" && (
                          <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setApproval(r, "approved")}>Promote</Button>
                        )}
                        {r.approval_status === "approved" && (
                          <Button size="sm" variant={r.attendance_state === "inside" ? "outline" : "default"} className="h-7 text-[12px]" onClick={() => toggleCheckIn(r)}>
                            {r.attendance_state === "inside" ? "Check out" : "Check in"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatusBadge({ status, checkedIn }: { status: string; checkedIn: boolean }) {
  if (checkedIn) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600"><Check className="h-3 w-3" /> Checked in</span>;
  if (status === "approved") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600">Approved</span>;
  if (status === "pending") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600"><Clock3 className="h-3 w-3" /> Pending</span>;
  if (status === "waitlisted") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground">Waitlisted</span>;
  if (status === "declined") return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">Declined</span>;
  return <span className="text-[11px] text-muted-foreground">{status}</span>;
}