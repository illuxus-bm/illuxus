/**
 * Registrations behind one row of the UTM breakdown: full lead details,
 * attendance status, search and CSV export.
 *
 * The page passes in the already-matched leads (it owns the data and the
 * matching rule), so this list always agrees with the count that was clicked
 * and with the active date range.
 *
 * Phones get a full-screen sheet with one card per lead and a pinned Export
 * button; larger screens get a table.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Mail, Phone, Search, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  attendanceOf, formatMobile, hasAttended, leadDisplayName, type AttendanceLabel, type UtmLead,
} from "@/lib/utm/utm-data";
import { exportLeadsCsv, leadsFilename } from "@/lib/utm/utm-export";

export interface UtmBreakdownKey {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}

const ATTENDANCE_TONE: Record<AttendanceLabel, string> = {
  "Checked in": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  "Left": "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "Not checked in": "bg-muted text-muted-foreground border-border",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

function AttendanceBadge({ lead }: { lead: UtmLead }) {
  const label = attendanceOf(lead);
  return (
    <span className={cn("inline-flex shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap", ATTENDANCE_TONE[label])}>
      {label}
    </span>
  );
}

export function UtmRegistrationsDialog({
  row,
  leads,
  loading = false,
  error = false,
  rangeLabel,
  onOpenChange,
}: {
  /** The breakdown row being shown; null closes the dialog. */
  row: UtmBreakdownKey | null;
  /** Leads attributed to `row` (already filtered by the page). */
  leads: UtmLead[];
  loading?: boolean;
  error?: boolean;
  /** e.g. "Last 30 days" when a date range is active. */
  rangeLabel?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => { if (row) setSearch(""); }, [row]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [leadDisplayName(l), l.email, l.company, l.designation, l.mobile_number]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [leads, search]);

  const attended = leads.filter(hasAttended).length;
  const exportCsv = () => {
    if (!row) return;
    exportLeadsCsv(shown, leadsFilename([row.utm_source, row.utm_medium, row.utm_campaign].join("-")));
  };

  const exportButton = (className?: string) => (
    <Button variant="outline" className={cn("gap-1.5", className)} onClick={exportCsv} disabled={shown.length === 0}>
      <Download className="h-4 w-4" /> Export {shown.length > 0 ? `${shown.length} ` : ""}lead{shown.length === 1 ? "" : "s"}
    </Button>
  );

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:h-auto sm:max-h-[88vh] sm:w-[96vw] sm:max-w-5xl sm:rounded-lg sm:border">
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border space-y-2 text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base pr-8">
            <Users className="h-4 w-4 shrink-0" /> Registrations from this link
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap gap-1.5">
              {row && ([["source", row.utm_source], ["medium", row.utm_medium], ["campaign", row.utm_campaign]] as const).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border font-mono max-w-full">
                  <span className="text-muted-foreground">{k}:</span><span className="truncate">{v}</span>
                </span>
              ))}
              {rangeLabel && (
                <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  {rangeLabel}
                </span>
              )}
            </div>
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, company…"
                className="h-10 sm:h-9 pl-8 text-base sm:text-[13px]"
                aria-label="Search registrations"
              />
            </div>
            {exportButton("hidden sm:inline-flex h-9 text-[13px] shrink-0")}
          </div>
          <p className="text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">{leads.length}</span> registration{leads.length === 1 ? "" : "s"}
            {" · "}
            <span className="font-semibold text-foreground">{attended}</span> checked in
            {search.trim() && <> · showing <span className="font-semibold text-foreground">{shown.length}</span></>}
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
          {loading ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">Loading registrations…</div>
          ) : error ? (
            <div className="py-16 text-center text-[13px] text-destructive">Couldn't load registrations. Please try again.</div>
          ) : shown.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">
              {leads.length === 0 ? "No registrations from this link yet." : "No registrations match your search."}
            </div>
          ) : (
            <>
              {/* Phones: one card per lead */}
              <ul className="sm:hidden divide-y divide-border">
                {shown.map((l) => {
                  const mobile = formatMobile(l);
                  return (
                    <li key={l.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] font-semibold leading-tight min-w-0 break-words">{leadDisplayName(l)}</p>
                        <AttendanceBadge lead={l} />
                      </div>
                      {(l.designation || l.company) && (
                        <p className="text-[12.5px] text-muted-foreground break-words">
                          {[l.designation, l.company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="flex flex-col gap-1 pt-0.5">
                        {l.email && (
                          <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-[13px] text-primary min-w-0">
                            <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{l.email}</span>
                          </a>
                        )}
                        {mobile && (
                          <a href={`tel:${(l.mobile_country_code ?? "") + (l.mobile_number ?? "")}`} className="inline-flex items-center gap-1.5 text-[13px] text-primary">
                            <Phone className="h-3.5 w-3.5 shrink-0" />{mobile}
                          </a>
                        )}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">
                        {[l.ticket_type && `Ticket: ${l.ticket_type}`, `Registered ${fmt(l.created_at)}`].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {/* Larger screens: table */}
              <table className="hidden sm:table w-full text-[12px]">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left font-medium px-5 py-2.5">Name</th>
                    <th className="text-left font-medium px-3 py-2.5">Mobile</th>
                    <th className="text-left font-medium px-3 py-2.5">Company</th>
                    <th className="text-left font-medium px-3 py-2.5">Ticket</th>
                    <th className="text-left font-medium px-3 py-2.5">Registered</th>
                    <th className="text-left font-medium px-5 py-2.5">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/20 align-top">
                      <td className="px-5 py-2.5 max-w-[230px]">
                        <p className="font-medium truncate">{leadDisplayName(l)}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{l.email}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatMobile(l) || "—"}</td>
                      <td className="px-3 py-2.5 max-w-[190px]">
                        <p className="truncate">{l.company || "—"}</p>
                        {l.designation && <p className="text-[11px] text-muted-foreground truncate">{l.designation}</p>}
                      </td>
                      <td className="px-3 py-2.5 capitalize">{l.ticket_type || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmt(l.created_at)}</td>
                      <td className="px-5 py-2.5">
                        <AttendanceBadge lead={l} />
                        {l.checked_in_at && <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(l.checked_in_at)}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Phones: pinned export button */}
        <div className="sm:hidden shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {exportButton("w-full h-11 text-[14px]")}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UtmRegistrationsDialog;
