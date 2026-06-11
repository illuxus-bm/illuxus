import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { History, LogIn, LogOut, Undo2 } from "lucide-react";

type Entry = {
  id: string;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; icon: typeof LogIn; cls: string }> = {
  "attendance.check_in":       { label: "Checked in",       icon: LogIn,  cls: "text-[hsl(var(--success))]" },
  "attendance.check_out":      { label: "Checked out",      icon: LogOut, cls: "text-destructive" },
  "attendance.auto_check_out": { label: "Auto checked out", icon: LogOut, cls: "text-muted-foreground" },
  "attendance.undo_in":        { label: "Undid check-in",   icon: Undo2,  cls: "text-amber-600" },
  "attendance.undo_out":       { label: "Undid check-out",  icon: Undo2,  cls: "text-amber-600" },
};

export default function EventAttendanceHistoryDialog({
  open, onOpenChange, eventId, eventTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  eventTitle?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !eventId) return;
    setLoading(true);
    supabase.rpc("event_attendance_audit" as never, {
      _event_id: eventId, _limit: 200,
    } as never).then(({ data, error }) => {
      if (error) console.warn("event audit fetch failed", error);
      setEntries((data as Entry[]) || []);
      setLoading(false);
    });
  }, [open, eventId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" /> Attendance history
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {eventTitle ? `All check-in activity for ${eventTitle}` : "All check-in activity for this event"}
          </DialogDescription>
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
              const details = (e.details ?? {}) as { method?: string; registration_name?: string };
              const who = details.registration_name || "Registrant";
              const method = details.method;
              return (
                <li key={e.id} className="py-2.5 flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">
                      {who} · <span className="font-normal">{meta.label}</span>{method ? ` · ${method}` : ""}
                    </p>
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
