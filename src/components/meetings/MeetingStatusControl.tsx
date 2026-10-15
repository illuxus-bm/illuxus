/**
 * A meeting's status as a pill with a menu of next steps, shared by the
 * sponsor dashboard and the organiser's Registrations tab (migration 052).
 *
 *   Interested ▾  → Arrange meeting… · Mark as met · Didn't happen… · Remove interest
 *   Arranged ▾    → Change time or place… · Mark as met · Didn't happen… · Back to interested
 *   Met ▾         → Didn't happen… · Undo
 *   Didn't happen → Mark as met · Undo
 *
 * With no meeting yet it shows an "Arrange meeting" button (organisers use
 * this to set one up for a sponsor). Clicks never reach the row underneath.
 */
import { useState } from "react";
import { CalendarClock, Check, ChevronDown, CircleSlash, Handshake, Undo2, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MEETING_PILL_CLASS, meetingSummary, undoTarget, type MeetingState, type MeetingStatus } from "@/lib/meeting-interest";

export interface MeetingChange {
  status: MeetingStatus;
  scheduledAt?: string | null;
  location?: string | null;
  reason?: string | null;
}

/** "2026-10-16T14:30" for a datetime-local input, in the viewer's time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MeetingStatusControl({
  meeting, personName, busy = false, onChange, onRemove, className,
}: {
  meeting: MeetingState | null;
  personName: string;
  busy?: boolean;
  onChange: (change: MeetingChange) => void;
  /** Offered while the meeting is only "interested" (sponsors untick). */
  onRemove?: () => void;
  className?: string;
}) {
  const [dialog, setDialog] = useState<"arrange" | "not_met" | null>(null);
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [reason, setReason] = useState("");

  const openArrange = () => {
    setWhen(toLocalInput(meeting?.scheduled_at));
    setWhere(meeting?.location ?? "");
    setDialog("arrange");
  };
  const openNotMet = () => { setReason(meeting?.status_reason ?? ""); setDialog("not_met"); };

  const status = meeting?.status ?? null;
  const item = "gap-2 text-[13px]";

  return (
    <span
      className={cn("inline-flex", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {status === null ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openArrange} className="h-7 gap-1.5 rounded-full px-2.5 text-[12px]">
          <CalendarClock className="h-3.5 w-3.5" /> Arrange meeting
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={busy}>
            <button
              type="button"
              aria-label={`Meeting with ${personName}: ${meetingSummary(meeting!)}. Change`}
              className={cn(
                "inline-flex max-w-[220px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-60",
                MEETING_PILL_CLASS[status],
              )}
            >
              {status === "met" && <Check className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{meetingSummary(meeting!)}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {(status === "interested" || status === "arranged") && (
              <DropdownMenuItem className={item} onSelect={openArrange}>
                <CalendarClock className="h-4 w-4" /> {status === "arranged" ? "Change time or place…" : "Arrange meeting…"}
              </DropdownMenuItem>
            )}
            {status !== "met" && (
              <DropdownMenuItem className={item} onSelect={() => onChange({ status: "met" })}>
                <Handshake className="h-4 w-4" /> Mark as met
              </DropdownMenuItem>
            )}
            {status !== "not_met" && (
              <DropdownMenuItem className={item} onSelect={openNotMet}>
                <CircleSlash className="h-4 w-4" /> Didn't happen…
              </DropdownMenuItem>
            )}
            {status === "arranged" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={item} onSelect={() => onChange({ status: "interested" })}>
                  <Undo2 className="h-4 w-4" /> Back to interested
                </DropdownMenuItem>
              </>
            )}
            {(status === "met" || status === "not_met") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={item}
                  onSelect={() => {
                    const to = undoTarget(meeting!);
                    onChange({ status: to, scheduledAt: meeting?.scheduled_at ?? null, location: meeting?.location ?? null });
                  }}
                >
                  <Undo2 className="h-4 w-4" /> Undo
                </DropdownMenuItem>
              </>
            )}
            {status === "interested" && onRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={cn(item, "text-destructive focus:text-destructive")} onSelect={onRemove}>
                  <X className="h-4 w-4" /> Remove interest
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="sm:max-w-[420px]" onClick={(e) => e.stopPropagation()}>
          {dialog === "arrange" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onChange({ status: "arranged", scheduledAt: when ? new Date(when).toISOString() : null, location: where.trim() || null });
                setDialog(null);
              }}
            >
              <DialogHeader>
                <DialogTitle>{status === "arranged" ? "Change meeting" : "Arrange meeting"}</DialogTitle>
                <DialogDescription>With {personName}. Time and place are optional.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="meeting-when">Time</Label>
                  <Input id="meeting-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="meeting-where">Place</Label>
                  <Input id="meeting-where" value={where} maxLength={200} placeholder="e.g. Table 4, Meeting lounge" onChange={(e) => setWhere(e.target.value)} />
                </div>
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit">{status === "arranged" ? "Save" : "Arrange"}</Button>
              </DialogFooter>
            </form>
          ) : dialog === "not_met" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onChange({ status: "not_met", reason: reason.trim() || null });
                setDialog(null);
              }}
            >
              <DialogHeader>
                <DialogTitle>Meeting didn't happen</DialogTitle>
                <DialogDescription>With {personName}. Add a reason if it helps (optional).</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="meeting-reason">Reason</Label>
                <Textarea id="meeting-reason" value={reason} maxLength={500} rows={3} placeholder="e.g. No-show, rescheduled after the event" onChange={(e) => setReason(e.target.value)} />
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** "Interested 14 Oct → Arranged Fri 16 Oct, 2:30 PM · Table 4 → Met 3:05 PM", one step per line. */
export function MeetingTimeline({ meeting, interestedAt, viewer }: {
  meeting: MeetingState;
  interestedAt?: string | null;
  /** Which side is looking, so their own changes read "you" / "your team". */
  viewer: "sponsor" | "organiser";
}) {
  const by = meeting.status_by_side === viewer
    ? (viewer === "sponsor" ? "your team" : "the organiser team")
    : (meeting.status_by_side === "organiser" ? "the organiser" : "the sponsor");
  const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
  const at = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const steps: { label: string; detail?: string; tone: MeetingStatus }[] = [
    { label: "Interested", detail: interestedAt ? day(interestedAt) : undefined, tone: "interested" },
  ];
  if (meeting.scheduled_at || meeting.location || meeting.status === "arranged") {
    steps.push({
      label: "Arranged",
      detail: [meeting.scheduled_at ? at(meeting.scheduled_at) : null, meeting.location].filter(Boolean).join(" · ") || undefined,
      tone: "arranged",
    });
  }
  if (meeting.status === "met") steps.push({ label: "Met", detail: meeting.met_at ? at(meeting.met_at) : undefined, tone: "met" });
  if (meeting.status === "not_met") steps.push({ label: "Didn't happen", detail: meeting.status_reason ?? undefined, tone: "not_met" });

  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13px]">
          <i className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", {
            "bg-muted-foreground/50": s.tone === "interested",
            "bg-blue-500": s.tone === "arranged",
            "bg-green-500": s.tone === "met",
            "bg-red-500": s.tone === "not_met",
          })} />
          <span><b className="font-semibold">{s.label}</b>{s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}</span>
        </li>
      ))}
      {meeting.status_by_side && meeting.status !== "interested" && (
        <li className="pl-[18px] text-[12px] text-muted-foreground">
          Last updated by {by}
          {meeting.status_changed_at ? ` · ${day(meeting.status_changed_at)}` : ""}
        </li>
      )}
    </ol>
  );
}
