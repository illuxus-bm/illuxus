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

interface Reg {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  approval_status: string;
  status: string;
  checked_in: boolean;
  created_at: string;
}

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
      const { data } = await supabase
        .from("registrations")
        .select("id, name, email, ticket_type, approval_status, status, checked_in, created_at")
        .eq("event_id", ev.id)
        .order("created_at", { ascending: false });
      if (cancel) return;
      setRows((data ?? []) as Reg[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [id]);

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
  };

  const toggleCheckIn = async (reg: Reg) => {
    const next = !reg.checked_in;
    const { error } = await supabase.from("registrations").update({ checked_in: next, checked_in_at: next ? new Date().toISOString() : null }).eq("id", reg.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setRows((rs) => rs.map((r) => r.id === reg.id ? { ...r, checked_in: next } : r));
  };

  const exportCsv = () => {
    const header = ["Name", "Email", "Ticket", "Status", "Approval", "Checked in"];
    const lines = [header.join(",")].concat(
      filtered.map((r) => [r.name, r.email, r.ticket_type, r.status, r.approval_status, r.checked_in ? "Yes" : "No"].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
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
                      <div className="flex items-center justify-end gap-1.5">
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
                          <Button size="sm" variant={r.checked_in ? "outline" : "default"} className="h-7 text-[12px]" onClick={() => toggleCheckIn(r)}>
                            {r.checked_in ? "Undo check-in" : "Check in"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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