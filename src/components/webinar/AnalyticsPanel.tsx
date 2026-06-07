import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Download } from "lucide-react";

export function AnalyticsPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.rpc("get_webinar_analytics", { _session_id: sessionId } as any)
      .then(({ data, error }) => { if (active) { setData(error ? null : data); setLoading(false); } });
    return () => { active = false; };
  }, [sessionId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading analytics…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">No analytics yet.</div>;

  const k = data.kpis || {};
  const timeline = (data.timeline || []).map((p: any) => ({
    t: new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    viewers: p.v,
  }));
  const engagement = [
    { name: "Chat", v: k.chat_count || 0 },
    { name: "Q&A", v: k.qa_count || 0 },
    { name: "Polls", v: k.polls_count || 0 },
    { name: "Reactions", v: k.reactions_count || 0 },
    { name: "Announcements", v: k.announcements_count || 0 },
  ];
  const top = data.top_attendees || [];

  const exportCsv = () => {
    const rows = [["Name", "Identity", "Minutes"], ...top.map((r: any) => [r.name, r.identity, r.minutes])];
    const csv = rows.map((r) => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `webinar-attendees-${sessionId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Peak viewers" value={k.peak_viewers || 0} />
        <Kpi label="Unique viewers" value={k.unique_viewers || 0} />
        <Kpi label="Avg watch (min)" value={Number(k.avg_watch_minutes || 0).toFixed(1)} />
        <Kpi label="Reactions" value={k.reactions_count || 0} />
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Viewers over time</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="t" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="viewers" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Engagement</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={engagement}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="v" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Top attendees by watch time</h3>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3 w-3 mr-1" />CSV</Button>
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {top.length === 0 && <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>}
          {top.map((r: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <span className="truncate">{r.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.minutes} min</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 font-mono">{value}</div>
    </Card>
  );
}