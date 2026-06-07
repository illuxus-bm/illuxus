import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

type Diag = {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  attendance_state: string;
  last_event_at: string | null;
  can_check_in: boolean;
  blocked_reason: string;
};

const REASON_LABEL: Record<string, string> = {
  ok: "Ready",
  tracking_closed: "Event tracking is closed",
  cancelled: "Registration cancelled",
  not_approved: "Not approved yet",
  missing_email: "Missing email — synthesised one will be used",
  synthetic_email: "Using synthesised email (no real address)",
};

export default function AttendanceDiagnosticsDialog({
  open, onOpenChange, eventId,
}: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string }) {
  const [rows, setRows] = useState<Diag[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"issues" | "all">("issues");
  const [fixing, setFixing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("attendance_diagnostics" as never, { _event_id: eventId } as never);
    if (error) toast.error("Diagnostics failed", { description: error.message });
    setRows((data as Diag[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, eventId]);

  const forceCheckIn = async (id: string) => {
    setFixing(id);
    const { error } = await supabase.rpc("toggle_attendance" as never, {
      p_registration_id: id, p_method: "manual-fix",
    } as never);
    setFixing(null);
    if (error) { toast.error("Could not check in", { description: error.message }); return; }
    toast.success("Checked in");
    await load();
  };

  const visible = rows.filter((r) => filter === "all" ? true : r.blocked_reason !== "ok" || r.attendance_state === "never");
  const issueCount = rows.filter((r) => r.blocked_reason !== "ok").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Stethoscope className="h-4 w-4" /> Check-in diagnostics
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {issueCount} {issueCount === 1 ? "registration has" : "registrations have"} potential check-in issues. Not-yet-arrived rows are also shown so you can force them in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={filter === "issues" ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setFilter("issues")}>Needs attention</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setFilter("all")}>All</Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px] ml-auto" onClick={load}>Refresh</Button>
        </div>
        {loading ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">Scanning…</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))] mx-auto mb-2" />
            <p className="text-[12px] font-medium">Everyone can be checked in</p>
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[420px] overflow-y-auto -mx-6 px-6">
            {visible.map((r) => (
              <li key={r.id} className="py-2.5 flex items-start gap-3">
                {r.blocked_reason === "ok"
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-[hsl(var(--success))] shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.email} · {r.ticket_type} · {REASON_LABEL[r.blocked_reason] ?? r.blocked_reason}
                  </p>
                </div>
                {r.can_check_in && r.attendance_state === "never" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={fixing === r.id} onClick={() => forceCheckIn(r.id)}>
                    {fixing === r.id ? "…" : "Force check-in"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}