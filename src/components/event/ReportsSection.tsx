import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, TrendingUp, Users, DollarSign, Ticket, Target, Mic2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/currency";

type Registration = Tables<"registrations">;
type Speaker = Tables<"speakers">;

const COLORS = [
  "hsl(var(--brand-green))",
  "hsl(var(--brand-amber))",
  "hsl(var(--brand-red))",
  "hsl(var(--muted-foreground))",
];

interface SpeakerRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
}

export default function ReportsSection({ eventId }: { eventId: string }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [currency, setCurrency] = useState<string>("INR");
  const [targetPct, setTargetPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [regRes, evRes, esRes] = await Promise.all([
        supabase
          .from("registrations")
          .select("*")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true }),
        supabase
          .from("events")
          .select("currency, attendance_target_pct")
          .eq("id", eventId)
          .maybeSingle(),
        supabase
          .from("event_speakers")
          .select("speaker_id, speakers:speakers(id, name, email, company)")
          .eq("event_id", eventId),
      ]);
      if (cancelled) return;

      const regs = (regRes.data as Registration[] | null) ?? [];
      setRegistrations(regs);

      const ev = evRes.data as { currency?: string | null; attendance_target_pct?: number | null } | null;
      setCurrency(ev?.currency || "INR");
      setTargetPct(ev?.attendance_target_pct ?? null);

      // Build speaker attendance by matching email against speaker-typed registrations
      type ESRow = { speaker_id: string; speakers: Pick<Speaker, "id" | "name" | "email" | "company"> | null };
      const esRows = (esRes.data as ESRow[] | null) ?? [];
      const speakerRegs = regs.filter((r) => r.ticket_type === "speaker");
      const byEmail = new Map<string, Registration>();
      for (const r of speakerRegs) {
        if (r.email) byEmail.set(r.email.toLowerCase(), r);
      }
      const rows: SpeakerRow[] = esRows
        .filter((r) => r.speakers)
        .map((r) => {
          const sp = r.speakers!;
          const reg = sp.email ? byEmail.get(sp.email.toLowerCase()) : undefined;
          return {
            id: sp.id,
            name: sp.name,
            email: sp.email,
            company: sp.company,
            checked_in: !!reg?.checked_in,
            checked_in_at: reg?.checked_in_at ?? null,
          };
        });
      setSpeakers(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const totalRevenue = registrations.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const confirmedCount = registrations.filter((r) => r.status === "confirmed").length;
  const avgTicketPrice = registrations.length > 0 ? totalRevenue / registrations.length : 0;

  // Delegate = approved registration that's not a speaker
  const delegates = registrations.filter(
    (r) => r.ticket_type !== "speaker" && r.approval_status === "approved"
  );
  const delegatesAttended = delegates.filter((r) => r.checked_in).length;
  const delegatesTotal = delegates.length;
  const speakersAttended = speakers.filter((s) => s.checked_in).length;
  const speakersTotal = speakers.length;

  const totalRegisteredForTarget = delegatesTotal + speakersTotal;
  const totalAttended = delegatesAttended + speakersAttended;
  const actualPct = totalRegisteredForTarget > 0
    ? Math.round((totalAttended / totalRegisteredForTarget) * 100)
    : 0;
  const meetsTarget = targetPct != null && actualPct >= targetPct;

  // Ticket type breakdown
  const ticketBreakdown = registrations.reduce((acc, r) => {
    acc[r.ticket_type] = (acc[r.ticket_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const ticketPieData = Object.entries(ticketBreakdown).map(([name, value]) => ({ name, value }));

  // Status breakdown
  const statusBreakdown = registrations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const statusBarData = Object.entries(statusBreakdown).map(([name, value]) => ({ name, value }));

  // Daily registrations trend
  const dailyMap = registrations.reduce((acc, r) => {
    const day = new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dailyTrend = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

  // Revenue by ticket type
  const revenueByType = registrations.reduce((acc, r) => {
    acc[r.ticket_type] = (acc[r.ticket_type] || 0) + Number(r.amount_paid || 0);
    return acc;
  }, {} as Record<string, number>);
  const revenueBarData = Object.entries(revenueByType).map(([name, revenue]) => ({ name, revenue }));

  const exportReport = () => {
    const lines = [
      "Event Report",
      `Total Registrations: ${registrations.length}`,
      `Confirmed: ${confirmedCount}`,
      `Total Revenue: ${formatMoney(totalRevenue, currency)}`,
      `Avg Ticket Price: ${formatMoney(avgTicketPrice, currency)}`,
      "",
      "Ticket Type Breakdown:",
      ...Object.entries(ticketBreakdown).map(([t, c]) => `  ${t}: ${c}`),
      "",
      "Status Breakdown:",
      ...Object.entries(statusBreakdown).map(([s, c]) => `  ${s}: ${c}`),
      "",
      "Revenue by Ticket Type:",
      ...Object.entries(revenueByType).map(([t, r]) => `  ${t}: ${formatMoney(r, currency)}`),
      "",
      "Attendance:",
      `  Speakers: ${speakersAttended} / ${speakersTotal} attended`,
      `  Delegates: ${delegatesAttended} / ${delegatesTotal} attended`,
      `  Overall: ${totalAttended} / ${totalRegisteredForTarget} (${actualPct}%)`,
      ...(targetPct != null
        ? [`  Target: ${targetPct}% — ${meetsTarget ? "MET" : "NOT MET"}`]
        : []),
      "",
      "Speakers:",
      ...speakers.map((s) => `  [${s.checked_in ? "X" : " "}] ${s.name}${s.company ? ` (${s.company})` : ""}${s.email ? ` <${s.email}>` : ""}`),
      "",
      "Delegates:",
      ...delegates.map((r) => `  [${r.checked_in ? "X" : " "}] ${r.name}${r.company ? ` (${r.company})` : ""} <${r.email}>`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event-report-${eventId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSpeakersCsv = () =>
    downloadCsv(
      `speakers-${eventId}.csv`,
      ["Name", "Email", "Company", "Attended", "Checked in at"],
      speakers.map((s) => [s.name, s.email ?? "", s.company ?? "", s.checked_in ? "Yes" : "No", s.checked_in_at ?? ""]),
    );

  const exportDelegatesCsv = () =>
    downloadCsv(
      `delegates-${eventId}.csv`,
      ["Name", "Email", "Company", "Ticket type", "Attended", "Checked in at"],
      delegates.map((r) => [r.name, r.email, r.company ?? "", r.ticket_type, r.checked_in ? "Yes" : "No", r.checked_in_at ?? ""]),
    );

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Loading report data...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Reports & Analytics</h2>
          <p className="text-[12px] text-muted-foreground">Insights and data summaries for this event</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" onClick={exportReport}>
          <Download className="h-3 w-3" /> Export Report
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Total Registrations", value: String(registrations.length), color: "text-foreground" },
          { icon: DollarSign, label: "Total Revenue", value: formatMoney(totalRevenue, currency), color: "text-accent" },
          { icon: Ticket, label: "Avg. Ticket Price", value: formatMoney(avgTicketPrice, currency), color: "text-primary" },
          { icon: TrendingUp, label: "Conversion Rate", value: registrations.length ? `${Math.round((confirmedCount / registrations.length) * 100)}%` : "0%", color: "text-green-600" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Attendance target */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-[13px] font-medium">Attendance vs target</h3>
          </div>
          {targetPct == null ? (
            <span className="text-[11px] text-muted-foreground">No target set — add one in Event Settings.</span>
          ) : (
            <span className={`text-[11px] font-semibold ${meetsTarget ? "text-green-600" : "text-amber-600"}`}>
              {meetsTarget ? "On target" : "Below target"}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-2xl font-bold tabular-nums">{actualPct}%</span>
          <span className="text-[12px] text-muted-foreground">
            {totalAttended} of {totalRegisteredForTarget} checked in
            {targetPct != null && <> · target {targetPct}%</>}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden relative">
          <div
            className={`h-full ${meetsTarget ? "bg-green-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min(actualPct, 100)}%` }}
          />
          {targetPct != null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground/60"
              style={{ left: `${Math.min(targetPct, 100)}%` }}
              title={`Target ${targetPct}%`}
            />
          )}
        </div>
      </div>

      {/* Speakers & delegates attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AttendanceList
          icon={<Mic2 className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Speakers"
          attended={speakersAttended}
          total={speakersTotal}
          rows={speakers.map((s) => ({
            id: s.id,
            name: s.name,
            sub: s.company || s.email || "",
            attended: s.checked_in,
            when: s.checked_in_at,
          }))}
          onExport={exportSpeakersCsv}
          emptyHint="No speakers assigned to this event yet."
        />
        <AttendanceList
          icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
          title="Delegates"
          attended={delegatesAttended}
          total={delegatesTotal}
          rows={delegates.map((r) => ({
            id: r.id,
            name: r.name,
            sub: r.company || r.email,
            attended: r.checked_in,
            when: r.checked_in_at,
          }))}
          onExport={exportDelegatesCsv}
          emptyHint="No approved delegate registrations yet."
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Registration Trend */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[13px] font-medium mb-3">Registration Trend</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-8">No data available</p>
          )}
        </div>

        {/* Ticket Type Pie */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[13px] font-medium mb-3">Ticket Type Breakdown</h3>
          {ticketPieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={ticketPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {ticketPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-[13px]">
                {ticketPieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground capitalize">{d.name}</span>
                    <span className="font-medium ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-8">No data available</p>
          )}
        </div>

        {/* Status Bar Chart */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[13px] font-medium mb-3">Registration Status</h3>
          {statusBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-8">No data available</p>
          )}
        </div>

        {/* Revenue by Type */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[13px] font-medium mb-3">Revenue by Ticket Type</h3>
          {revenueBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => formatMoney(v, currency)} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} formatter={(v: number) => [formatMoney(v, currency), "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--brand-green))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-8">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface AttendanceListProps {
  icon: React.ReactNode;
  title: string;
  attended: number;
  total: number;
  rows: { id: string; name: string; sub: string; attended: boolean; when: string | null }[];
  onExport: () => void;
  emptyHint: string;
}

function AttendanceList({ icon, title, attended, total, rows, onExport, emptyHint }: AttendanceListProps) {
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-[13px] font-medium">{title}</h3>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5" onClick={onExport} disabled={rows.length === 0}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground mb-3">
        <span className="font-semibold text-foreground tabular-nums">{attended}</span> of{" "}
        <span className="font-semibold text-foreground tabular-nums">{total}</span> attended ({pct}%)
      </p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground text-center py-6">{emptyHint}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto -mx-1 divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-1 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate">{r.name}</p>
                {r.sub && <p className="text-[11px] text-muted-foreground truncate">{r.sub}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.attended ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> Attended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <XCircle className="h-3 w-3" /> Not attended
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
