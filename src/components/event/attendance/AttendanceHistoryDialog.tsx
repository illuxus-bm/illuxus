import { useEffect, useState } from "react";
import { logger, supabaseRpc } from "@/lib/observability";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { History, LogIn, LogOut, Undo2 } from "lucide-react";

type Entry = {
  id: string;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; icon: typeof LogIn; cls: string }> = {
  "attendance.check_in":      { label: "Checked in",      icon: LogIn,  cls: "text-[hsl(var(--success))]" },
  "attendance.check_out":     { label: "Checked out",     icon: LogOut, cls: "text-destructive" },
  "attendance.auto_check_out":{ label: "Auto checked out",icon: LogOut, cls: "text-muted-foreground" },
  "attendance.undo_in":       { label: "Undid check-in",  icon: Undo2,  cls: "text-amber-600" },
  "attendance.undo_out":      { label: "Undid check-out", icon: Undo2,  cls: "text-amber-600" },
};

export default function AttendanceHistoryDialog({
  open, onOpenChange, registrationId, name,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  registrationId: string | null;
  name: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !registrationId) return;
    setLoading(true);
    supabaseRpc("registration_attendance_audit" as never, {
      p_registration_id: registrationId, p_limit: 50,
    } as never).then(({ data, error }) => {
      if (error) {
        logger.warn("audit fetch failed", {
          registration_id: registrationId,
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
      setEntries((data as Entry[]) || []);
      setLoading(false);
    });
  }, [open, registrationId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" /> Attendance history
          </DialogTitle>
          <DialogDescription className="text-[12px]">{name}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-[12px] text-muted-foreground text-center py-6">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-6">No actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border max-h-[400px] overflow-y-auto -mx-6 px-6">
            {entries.map((e) => {
              const meta = ACTION_META[e.action] ?? { label: e.action, icon: History, cls: "text-muted-foreground" };
              const Icon = meta.icon;
              const method = (e.details as { method?: string } | null)?.method;
              return (
                <li key={e.id} className="py-2.5 flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{meta.label}{method ? ` · ${method}` : ""}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.actor_email || "system"} · {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}