import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabaseRpc } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ScrollText, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_COLOR: Record<string, string> = {
  "role.grant": "bg-violet-500/10 text-violet-600",
  "role.revoke": "bg-amber-500/10 text-amber-600",
  "org.delete": "bg-destructive/10 text-destructive",
  "org.plan_change": "bg-blue-500/10 text-blue-600",
  "site.publish": "bg-green-500/10 text-green-600",
  "site.save_draft": "bg-muted text-muted-foreground",
  "site.discard_draft": "bg-muted text-muted-foreground",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabaseRpc("admin_list_audit_logs", { _limit: 200 });
    if (data) setEntries(data as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-8 -ml-2">
              <Link to="/dashboard/admin">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to admin
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-foreground/10 flex items-center justify-center">
                <ScrollText className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">Audit log</h1>
                <p className="text-[11px] text-muted-foreground">
                  Every privileged super admin action across the platform
                </p>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-8 text-[12px]">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left font-medium text-muted-foreground px-4 py-2.5">When</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Actor</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Action</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Target</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No activity yet</td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      {format(new Date(e.created_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[12px]">{e.actor_email || "system"}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary" className={`text-[10px] font-mono ${ACTION_COLOR[e.action] || "bg-muted"}`}>
                        {e.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-[11px] font-mono">
                      {e.target_type ? `${e.target_type}:${(e.target_id || "").slice(0, 8)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground text-[11px] font-mono max-w-[420px] truncate">
                      {Object.keys(e.details || {}).length ? JSON.stringify(e.details) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}