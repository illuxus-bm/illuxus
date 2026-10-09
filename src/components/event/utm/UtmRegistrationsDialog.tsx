/**
 * Registrations behind one row of the UTM breakdown, with attendance status
 * and a CSV export.
 *
 * Matching mirrors the `event_utm_summary` RPC exactly so the list always
 * agrees with the number that was clicked: missing values count as
 * "(direct)" / "(none)", and cancelled registrations are excluded.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildCsvDocument } from "@/lib/utm/csv-escape";
import { cn } from "@/lib/utils";

export interface UtmBreakdownKey {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}

interface RegistrationRow {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  designation: string | null;
  ticket_type: string | null;
  status: string | null;
  approval_status: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  attendance_state: string | null;
  last_out_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_at: string;
}

type Attendance = { label: "Checked in" | "Left" | "Not checked in"; tone: string };

function attendanceOf(r: RegistrationRow): Attendance {
  const state = r.attendance_state ?? (r.checked_in ? "inside" : "never");
  if (state === "inside") return { label: "Checked in", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" };
  if (state === "outside") return { label: "Left", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" };
  return { label: "Not checked in", tone: "bg-muted text-muted-foreground border-border" };
}

/** Spreadsheet apps execute cells starting with = + - @ as formulas; names
 *  and companies are typed by the public, so neutralise them on export. */
function safeCell(v: unknown): unknown {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function UtmRegistrationsDialog({
  eventId,
  row,
  onOpenChange,
}: {
  eventId: string;
  /** The breakdown row whose registrations to show; null closes the dialog. */
  row: UtmBreakdownKey | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: all = [], isLoading, error } = useQuery<RegistrationRow[]>({
    queryKey: ["utm-registrations", eventId],
    enabled: row !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, name, email, company, designation, ticket_type, status, approval_status, checked_in, checked_in_at, attendance_state, last_out_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at")
        .eq("event_id", eventId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as RegistrationRow[]) ?? [];
    },
  });

  const regs = useMemo(() => {
    if (!row) return [];
    return all.filter((r) =>
      (r.utm_source ?? "(direct)") === row.utm_source &&
      (r.utm_medium ?? "(none)") === row.utm_medium &&
      (r.utm_campaign ?? "(none)") === row.utm_campaign,
    );
  }, [all, row]);

  const checkedIn = regs.filter((r) => attendanceOf(r).label !== "Not checked in").length;

  const exportCsv = () => {
    if (!row) return;
    const headers = [
      "Name", "Email", "Company", "Designation", "Ticket type", "Approval", "Attendance",
      "Checked in at", "Registered at", "UTM source", "UTM medium", "UTM campaign", "UTM content", "UTM term",
    ];
    const lines = regs.map((r) => [
      r.name, r.email, r.company, r.designation, r.ticket_type, r.approval_status ?? "approved",
      attendanceOf(r).label, fmt(r.checked_in_at), fmt(r.created_at),
      row.utm_source, row.utm_medium, row.utm_campaign, r.utm_content, r.utm_term,
    ].map(safeCell));
    const csv = buildCsvDocument(headers, lines);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = [row.utm_source, row.utm_medium, row.utm_campaign]
      .join("-").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80);
    a.href = url;
    a.download = `registrations-${slug || "utm"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[96vw] p-0 gap-0 max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border space-y-1.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base pr-8">
            <Users className="h-4 w-4" /> Registrations from this link
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {row && ([["source", row.utm_source], ["medium", row.utm_medium], ["campaign", row.utm_campaign]] as const).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border font-mono max-w-full">
                  <span className="text-muted-foreground">{k}:</span><span className="truncate">{v}</span>
                </span>
              ))}
            </div>
          </DialogDescription>
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground">{regs.length}</span> registration{regs.length === 1 ? "" : "s"}
              {" · "}
              <span className="font-semibold text-foreground">{checkedIn}</span> checked in
            </p>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={exportCsv} disabled={regs.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">Loading registrations…</div>
          ) : error ? (
            <div className="py-16 text-center text-[13px] text-destructive">Couldn't load registrations. Please try again.</div>
          ) : regs.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">No registrations from this link yet.</div>
          ) : (
            <>
              {/* Phones: one card per registration */}
              <ul className="sm:hidden divide-y divide-border">
                {regs.map((r) => {
                  const att = attendanceOf(r);
                  return (
                    <li key={r.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium truncate">{r.name || "—"}</p>
                        <span className={cn("shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border", att.tone)}>{att.label}</span>
                      </div>
                      <p className="text-[12px] text-muted-foreground truncate">{r.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[r.company, `Registered ${fmt(r.created_at)}`].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {/* Larger screens: table */}
              <table className="hidden sm:table w-full text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left font-medium px-5 py-2.5">Name</th>
                    <th className="text-left font-medium px-3 py-2.5">Company</th>
                    <th className="text-left font-medium px-3 py-2.5">Ticket</th>
                    <th className="text-left font-medium px-3 py-2.5">Registered</th>
                    <th className="text-left font-medium px-5 py-2.5">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {regs.map((r) => {
                    const att = attendanceOf(r);
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-5 py-2.5 max-w-[240px]">
                          <p className="font-medium truncate">{r.name || "—"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                        </td>
                        <td className="px-3 py-2.5 max-w-[180px]">
                          <p className="truncate">{r.company || "—"}</p>
                          {r.designation && <p className="text-[11px] text-muted-foreground truncate">{r.designation}</p>}
                        </td>
                        <td className="px-3 py-2.5 capitalize">{r.ticket_type || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</td>
                        <td className="px-5 py-2.5">
                          <span className={cn("inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border", att.tone)}>{att.label}</span>
                          {r.checked_in_at && <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(r.checked_in_at)}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UtmRegistrationsDialog;
