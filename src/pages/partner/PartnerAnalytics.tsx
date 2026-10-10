/**
 * Analytics for one shared link on the Partner dashboard's event view:
 * a funnel, activity over time, the approval breakdown and top companies.
 *
 * Every number is for the partner's own link. Sections that depend on a
 * permission the organiser didn't grant (approvals, check-ins) are left out.
 */
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fillDailySeries, type PartnerAnalytics as Analytics, type PartnerGrant } from "@/lib/utm/partner-access";

const share = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0);

const shortDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl bg-card p-5 min-w-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Funnel({ grant, clicks }: { grant: PartnerGrant; clicks: number | null }) {
  const s = grant.stats;
  const steps: { label: string; value: number; of: number; note: string | null; bar: string; text: string }[] = [];
  let prev: { label: string; value: number } | null = null;
  const push = (label: string, value: number, noun: string, bar: string, text: string) => {
    steps.push({
      label, value, of: steps[0]?.value ?? value, bar, text,
      note: prev && prev.value > 0 ? `${share(value, prev.value).toFixed(0)}% of ${noun}` : null,
    });
    prev = { label, value };
  };
  if (clicks !== null) push("Link clicks", clicks, "", "bg-indigo-500/25", "text-indigo-700 dark:text-indigo-300");
  push("Registered", s.total, "clicks", "bg-sky-500/25", "text-sky-700 dark:text-sky-300");
  if (s.approved !== null) push("Approved", s.approved, "registered", "bg-emerald-500/30", "text-emerald-700 dark:text-emerald-300");
  if (s.checked_in !== null) push("Checked in", s.checked_in, s.approved !== null ? "approved" : "registered", "bg-amber-500/30", "text-amber-700 dark:text-amber-300");
  // Registrations can outnumber recorded clicks (e.g. people you registered yourself).
  const widest = Math.max(1, ...steps.map((x) => x.value));

  return (
    <Card title="Conversion funnel" hint="From a click on your link to walking in on the day.">
      <div className="space-y-3">
        {steps.map((st) => (
          <div key={st.label}>
            <div className="flex justify-between gap-2 text-[11px] text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{st.label}</span>
              <span>{st.note}</span>
            </div>
            <div className="h-8 rounded-md bg-muted w-full relative overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-md transition-all ${st.bar}`} style={{ width: `${st.value > 0 ? Math.max(6, Math.round(share(st.value, widest))) : 0}%` }} />
              <span className={`absolute inset-0 flex items-center px-3 text-[11px] font-semibold ${st.text}`}>{st.value.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ApprovalBreakdown({ grant }: { grant: PartnerGrant }) {
  const s = grant.stats;
  const parts = [
    { label: "Approved", value: s.approved ?? 0, color: "bg-emerald-500" },
    { label: "Pending", value: s.pending ?? 0, color: "bg-amber-500" },
    { label: "Rejected", value: s.declined ?? 0, color: "bg-red-500" },
    { label: "Waitlisted", value: s.waitlisted ?? 0, color: "bg-slate-400" },
  ].filter((p) => p.value > 0 || p.label !== "Waitlisted");
  const total = parts.reduce((n, p) => n + p.value, 0);

  return (
    <Card title="Approval status" hint={grant.event.requires_approval ? "The organiser reviews each registration." : "This event doesn't require approval."}>
      {total === 0 ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center">No registrations yet.</p>
      ) : (
        <>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
            {parts.map((p) => p.value > 0 && <div key={p.label} className={p.color} style={{ width: `${share(p.value, total)}%` }} />)}
          </div>
          <ul className="mt-4 space-y-2">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${p.color}`} />{p.label}</span>
                <span className="tabular-nums"><span className="font-semibold">{p.value.toLocaleString()}</span> <span className="text-muted-foreground text-[12px]">· {share(p.value, total).toFixed(0)}%</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function PartnerAnalytics({
  grant, analytics, unavailable,
}: {
  grant: PartnerGrant;
  /** Undefined while loading. */
  analytics: Analytics | undefined;
  /** The day-by-day analytics couldn't be loaded; the rest still renders. */
  unavailable?: boolean;
}) {
  const series = analytics ? fillDailySeries(analytics.series) : [];
  const showCheckIns = grant.can_view_checkin && series.some((p) => (p.check_ins ?? 0) > 0);
  const top = analytics?.top_companies ?? [];
  const topMax = Math.max(1, ...top.map((c) => c.registrations));

  return (
    <section className="space-y-4" aria-label="Analytics">
      <h3 className="text-[15px] font-semibold">Analytics</h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0">
          <Card title="Activity over time" hint="Clicks on your link, registrations and check-ins per day.">
            {unavailable ? (
              <p className="text-[13px] text-muted-foreground py-10 text-center">Day-by-day activity isn't available yet.</p>
            ) : !analytics ? (
              <p className="text-[13px] text-muted-foreground py-10 text-center">Loading activity…</p>
            ) : series.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-10 text-center">No activity yet. Share your link to get started.</p>
            ) : (
              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series.map((p) => ({ ...p, label: shortDay(p.day) }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="registrations" name="Registrations" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line type="monotone" dataKey="clicks" name="Link clicks" stroke="#6366f1" strokeWidth={2} dot={false} />
                    {showCheckIns && <Line type="monotone" dataKey="check_ins" name="Check-ins" stroke="#f59e0b" strokeWidth={2} dot={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
        <Funnel grant={grant} clicks={analytics ? analytics.clicks : null} />
      </div>

      <div className={`grid grid-cols-1 ${grant.can_view_approval ? "lg:grid-cols-2" : ""} gap-4`}>
        {grant.can_view_approval && <ApprovalBreakdown grant={grant} />}
        <Card title="Top companies" hint="Where your registrations come from.">
          {unavailable ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">Not available yet.</p>
          ) : !analytics ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">Loading…</p>
          ) : top.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">No registrations yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {top.map((c) => (
                <li key={c.company}>
                  <div className="flex justify-between gap-3 text-[13px] mb-1">
                    <span className="truncate">{c.company}</span>
                    <span className="font-semibold tabular-nums shrink-0">{c.registrations.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${share(c.registrations, topMax)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

export default PartnerAnalytics;
