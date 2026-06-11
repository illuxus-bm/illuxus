import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, TrendingUp, Users, DollarSign, Ticket, Target, Mic2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/currency";
import ExportReportDialog, { type ExportField } from "./reports/ExportReportDialog";

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
  // Full form fields for CSV export
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  linkedin_url: string | null;
  company_website: string | null;
  company_employee_count: string | null;
  industry: string | null;
  bio: string | null;
}

export default function ReportsSection({ eventId }: { eventId: string }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [currency, setCurrency] = useState<string>("INR");
  const [targetPct, setTargetPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

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
          .select("speaker_id, speakers:speakers(id, name, email, company, title, first_name, last_name, designation, mobile_country_code, mobile_number, linkedin_url, company_website, company_employee_count, industry, bio)")
          .eq("event_id", eventId),
      ]);
      if (cancelled) return;

      const regs = (regRes.data as Registration[] | null) ?? [];
      setRegistrations(regs);

      const ev = evRes.data as { currency?: string | null; attendance_target_pct?: number | null } | null;
      setCurrency(ev?.currency || "INR");
      setTargetPct(ev?.attendance_target_pct ?? null);

      // Build speaker attendance by matching email against speaker-typed registrations
      type ESRow = {
        speaker_id: string;
        speakers: Pick<
          Speaker,
          "id" | "name" | "email" | "company" | "title" | "first_name" | "last_name"
          | "designation" | "mobile_country_code" | "mobile_number" | "linkedin_url"
          | "company_website" | "company_employee_count" | "industry" | "bio"
        > | null;
      };
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
            title: sp.title ?? null,
            first_name: sp.first_name ?? null,
            last_name: sp.last_name ?? null,
            designation: sp.designation ?? null,
            mobile_country_code: sp.mobile_country_code ?? null,
            mobile_number: sp.mobile_number ?? null,
            linkedin_url: sp.linkedin_url ?? null,
            company_website: sp.company_website ?? null,
            company_employee_count: sp.company_employee_count ?? null,
            industry: sp.industry ?? null,
            bio: sp.bio ?? null,
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

  // ── Field definitions used by the export-report picker ─────────────────────
  const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : "");
  const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : "");
  const yn = (v: boolean | null | undefined) => (v ? "Yes" : "No");
  const fullPhone = (cc: string | null | undefined, num: string | null | undefined) => {
    if (!num) return "";
    return cc ? `${cc} ${num}` : num;
  };

  const REGISTRATION_FIELDS = useMemo<(ExportField & { get: (r: Registration) => string | number })[]>(() => [
    // Identity
    { key: "title",       label: "Title",        group: "Identity", defaultOn: false, get: (r) => r.title ?? "" },
    { key: "first_name",  label: "First name",   group: "Identity", defaultOn: true,  get: (r) => r.first_name ?? "" },
    { key: "last_name",   label: "Last name",    group: "Identity", defaultOn: true,  get: (r) => r.last_name ?? "" },
    { key: "name",        label: "Full name",    group: "Identity", defaultOn: true,  get: (r) => r.name ?? "" },
    // Contact
    { key: "email",       label: "Email",        group: "Contact",  defaultOn: true,  get: (r) => r.email ?? "" },
    { key: "mobile",      label: "Mobile",       group: "Contact",  defaultOn: true,  get: (r) => fullPhone(r.mobile_country_code, r.mobile_number) },
    { key: "linkedin_url",label: "LinkedIn URL", group: "Contact",  defaultOn: false, get: (r) => r.linkedin_url ?? "" },
    // Company
    { key: "designation",          label: "Designation",     group: "Company", defaultOn: true,  get: (r) => r.designation ?? "" },
    { key: "company",              label: "Company",         group: "Company", defaultOn: true,  get: (r) => r.company ?? "" },
    { key: "company_website",      label: "Company website", group: "Company", defaultOn: false, get: (r) => r.company_website ?? "" },
    { key: "company_employee_count",label: "Employee count",  group: "Company", defaultOn: false, get: (r) => r.company_employee_count ?? "" },
    { key: "industry",             label: "Industry",        group: "Company", defaultOn: false, get: (r) => r.industry ?? "" },
    // Ticket & Payment
    { key: "ticket_type",  label: "Ticket type",   group: "Ticket & Payment", defaultOn: true,  get: (r) => r.ticket_type ?? "" },
    { key: "amount_paid",  label: "Amount paid",   group: "Ticket & Payment", defaultOn: true,  get: (r) => Number(r.amount_paid || 0) },
    // Status
    { key: "status",          label: "Reg. status",    group: "Status", defaultOn: true,  get: (r) => r.status ?? "" },
    { key: "approval_status", label: "Approval",       group: "Status", defaultOn: false, get: (r) => r.approval_status ?? "" },
    { key: "approved_at",     label: "Approved at",    group: "Status", defaultOn: false, get: (r) => fmtDateTime(r.approved_at) },
    { key: "decline_reason",  label: "Decline reason", group: "Status", defaultOn: false, get: (r) => r.decline_reason ?? "" },
    // Attendance
    { key: "attendance_state", label: "Attendance state", group: "Attendance", defaultOn: true,  get: (r) => r.attendance_state ?? "" },
    { key: "checked_in",       label: "Checked in",       group: "Attendance", defaultOn: true,  get: (r) => yn(r.checked_in) },
    { key: "checked_in_at",    label: "Checked in at",    group: "Attendance", defaultOn: true,  get: (r) => fmtDateTime(r.checked_in_at) },
    { key: "checked_in_method",label: "Check-in method",  group: "Attendance", defaultOn: false, get: (r) => r.checked_in_method ?? "" },
    { key: "last_in_at",       label: "Last in at",       group: "Attendance", defaultOn: false, get: (r) => fmtDateTime(r.last_in_at) },
    { key: "last_out_at",      label: "Last out at",      group: "Attendance", defaultOn: false, get: (r) => fmtDateTime(r.last_out_at) },
    { key: "total_minutes",    label: "Total minutes",    group: "Attendance", defaultOn: false, get: (r) => Number(r.total_minutes || 0) },
    // System
    { key: "id",          label: "Registration ID", group: "System", defaultOn: false, get: (r) => r.id },
    { key: "user_id",     label: "User ID",         group: "System", defaultOn: false, get: (r) => r.user_id ?? "" },
    { key: "qr_code",     label: "QR code",         group: "System", defaultOn: false, get: (r) => r.qr_code ?? "" },
    { key: "created_at",  label: "Registered at",   group: "System", defaultOn: true,  get: (r) => fmtDateTime(r.created_at) },
    { key: "updated_at",  label: "Updated at",      group: "System", defaultOn: false, get: (r) => fmtDateTime(r.updated_at) },
  ], []);

  const exportReport = () => setExportOpen(true);

  const handleExportConfirm = (selectedKeys: string[]) => {
    const cols = REGISTRATION_FIELDS.filter((f) => selectedKeys.includes(f.key));
    if (cols.length === 0) return;
    downloadCsv(
      `event-report-${eventId}.csv`,
      cols.map((c) => c.label),
      registrations.map((r) => cols.map((c) => c.get(r))),
    );
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
      [
        "Title", "First name", "Last name", "Full name",
        "Email", "Mobile", "LinkedIn URL",
        "Designation", "Company", "Company website", "Employee count", "Industry",
        "Bio",
        "Attended", "Checked in at",
      ],
      speakers.map((s) => [
        s.title ?? "",
        s.first_name ?? "",
        s.last_name ?? "",
        s.name ?? "",
        s.email ?? "",
        fullPhone(s.mobile_country_code, s.mobile_number),
        s.linkedin_url ?? "",
        s.designation ?? "",
        s.company ?? "",
        s.company_website ?? "",
        s.company_employee_count ?? "",
        s.industry ?? "",
        s.bio ?? "",
        s.checked_in ? "Yes" : "No",
        s.checked_in_at ? new Date(s.checked_in_at).toLocaleString() : "",
      ]),
    );

  const exportDelegatesCsv = () =>
    downloadCsv(
      `delegates-${eventId}.csv`,
      [
        "Title", "First name", "Last name", "Full name",
        "Email", "Mobile", "LinkedIn URL",
        "Designation", "Company", "Company website", "Employee count", "Industry",
        "Ticket type", "Amount paid", "Reg. status", "Approval", "Approved at", "Decline reason",
        "Attendance state", "Checked in", "Checked in at", "Check-in method",
        "Last in at", "Last out at", "Total minutes",
        "Registered at",
      ],
      delegates.map((r) => [
        r.title ?? "",
        r.first_name ?? "",
        r.last_name ?? "",
        r.name ?? "",
        r.email ?? "",
        fullPhone(r.mobile_country_code, r.mobile_number),
        r.linkedin_url ?? "",
        r.designation ?? "",
        r.company ?? "",
        r.company_website ?? "",
        r.company_employee_count ?? "",
        r.industry ?? "",
        r.ticket_type ?? "",
        Number(r.amount_paid || 0),
        r.status ?? "",
        r.approval_status ?? "",
        r.approved_at ? new Date(r.approved_at).toLocaleString() : "",
        r.decline_reason ?? "",
        r.attendance_state ?? "",
        r.checked_in ? "Yes" : "No",
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : "",
        r.checked_in_method ?? "",
        r.last_in_at ? new Date(r.last_in_at).toLocaleString() : "",
        r.last_out_at ? new Date(r.last_out_at).toLocaleString() : "",
        Number(r.total_minutes || 0),
        r.created_at ? new Date(r.created_at).toLocaleString() : "",
      ]),
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

      <ExportReportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        fields={REGISTRATION_FIELDS}
        rowCount={registrations.length}
        storageKey={`illuxus.report-export.${eventId}`}
        onConfirm={handleExportConfirm}
      />
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
