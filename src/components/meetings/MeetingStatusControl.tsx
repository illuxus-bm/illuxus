/**
 * A meeting's status as a pill with a menu of what the viewer may do next,
 * shared by the sponsor dashboard and the organiser's Registrations tab.
 *
 * The menu follows the rules in `sponsorActions` / `organiserActions`
 * (migration 054): the organiser has the final say; a sponsor can change its
 * own outcome for 15 minutes and after that disputes it; a meeting that
 * progressed is cancelled, never removed; organiser changes to an outcome
 * after the event ask for a reason. Marking "Met" for someone who never
 * checked in asks to confirm.
 *
 * With no meeting yet it shows an "Arrange meeting" button (organisers use
 * this to set one up for a sponsor). Clicks never reach the row underneath.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, ChevronDown, CircleSlash, Flag, Handshake, Lock, Scale, Undo2, X, XCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { supabaseRpc } from "@/lib/observability";
import {
  MEETING_CAUSE_LABEL, MEETING_CAUSES, MEETING_PILL_CLASS, MEETING_STATUS_LABEL, MEETING_STATUSES,
  historyLabel, meetingSummary, organiserActions, sponsorActions, undoTarget,
  type MeetingCause, type MeetingHistoryEntry, type MeetingState, type MeetingStatus,
} from "@/lib/meeting-interest";

export interface MeetingChange {
  status: MeetingStatus;
  scheduledAt?: string | null;
  location?: string | null;
  reason?: string | null;
  cause?: MeetingCause | null;
}

type Viewer = "sponsor" | "organiser";
type DialogKind = "arrange" | "not_met" | "cancel" | "dispute" | "reason" | "unchecked" | "resolve_keep" | "resolve_change";

/** "2026-10-16T14:30" for a datetime-local input, in the viewer's time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MeetingStatusControl({
  meeting, personName, viewer, eventOver, checkedIn = null, now = Date.now(), busy = false,
  onChange, onRemove, onDispute, onResolve, className,
}: {
  meeting: MeetingState | null;
  personName: string;
  viewer: Viewer;
  eventOver: boolean;
  /** The person's check-in; false asks to confirm "Met". */
  checkedIn?: boolean | null;
  now?: number;
  busy?: boolean;
  onChange: (change: MeetingChange) => void;
  /** Sponsors: untick a meeting that never progressed. */
  onRemove?: () => void;
  /** Sponsors: ask the organiser to change a locked outcome. */
  onDispute?: (requested: MeetingStatus, reason: string) => void;
  /** Organisers: settle an open dispute. */
  onResolve?: (keep: boolean, note: string | null) => void;
  className?: string;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pending, setPending] = useState<MeetingChange | null>(null);
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [reason, setReason] = useState("");
  const [cause, setCause] = useState<MeetingCause>("attendee_no_show");
  const [requested, setRequested] = useState<MeetingStatus>("not_met");

  const status = meeting?.status ?? null;
  const sp = meeting && viewer === "sponsor" ? sponsorActions(meeting, { now, eventOver }) : null;
  const org = meeting && viewer === "organiser" ? organiserActions(meeting, { eventOver }) : null;
  const reasonRequired = !!org?.reasonRequired;

  const close = () => { setDialog(null); setPending(null); };

  /** Runs a change through the confirmations it needs: not checked in, then a reason. */
  const request = (change: MeetingChange, confirmedUnchecked = false) => {
    if (change.status === "met" && checkedIn === false && !confirmedUnchecked) {
      setPending(change); setDialog("unchecked"); return;
    }
    if (reasonRequired && !change.reason?.trim()) {
      setPending(change); setReason(""); setDialog("reason"); return;
    }
    onChange(change);
    close();
  };

  const openArrange = () => {
    setWhen(toLocalInput(meeting?.scheduled_at));
    setWhere(meeting?.location ?? "");
    setDialog("arrange");
  };
  const openNotMet = () => { setReason(meeting?.status_reason ?? ""); setCause(meeting?.status_cause ?? "attendee_no_show"); setDialog("not_met"); };
  const openCancel = () => { setReason(""); setDialog("cancel"); };
  const openDispute = () => {
    setReason("");
    setRequested(MEETING_STATUSES.find((s) => s !== status && s !== "interested" && s !== "arranged") ?? "not_met");
    setDialog("dispute");
  };
  const undo = () => request({ status: undoTarget(meeting!), scheduledAt: meeting?.scheduled_at ?? null, location: meeting?.location ?? null });

  const item = "gap-2 text-[13px]";
  const graceMin = sp?.graceLeftMs ? Math.max(1, Math.ceil(sp.graceLeftMs / 60_000)) : 0;

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
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
              {sp?.locked && <Lock className="h-3 w-3 shrink-0 opacity-70" />}
              <span className="truncate">{meetingSummary(meeting!)}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {viewer === "sponsor" && sp && (
              <>
                {sp.disputePending && (
                  <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
                    Your dispute is waiting for the organiser.
                  </DropdownMenuLabel>
                )}
                {sp.locked && (
                  <DropdownMenuLabel className="flex items-start gap-1.5 text-[12px] font-normal text-muted-foreground">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                    {sp.locked === "organiser" ? "Recorded by the organiser." : "Locked — recorded more than 15 minutes ago."}
                  </DropdownMenuLabel>
                )}
                {sp.arrange && (
                  <DropdownMenuItem className={item} onSelect={openArrange}>
                    <CalendarClock className="h-4 w-4" /> {status === "arranged" ? "Change time or place…" : "Arrange meeting…"}
                  </DropdownMenuItem>
                )}
                {sp.met && <DropdownMenuItem className={item} onSelect={() => request({ status: "met" })}><Handshake className="h-4 w-4" /> Mark as met</DropdownMenuItem>}
                {sp.notMet && <DropdownMenuItem className={item} onSelect={openNotMet}><CircleSlash className="h-4 w-4" /> Didn't happen…</DropdownMenuItem>}
                {sp.cancel && <DropdownMenuItem className={item} onSelect={openCancel}><XCircle className="h-4 w-4" /> Cancel meeting…</DropdownMenuItem>}
                {(sp.backToInterested || sp.undo) && <DropdownMenuSeparator />}
                {sp.backToInterested && (
                  <DropdownMenuItem className={item} onSelect={() => request({ status: "interested" })}><Undo2 className="h-4 w-4" /> Back to interested</DropdownMenuItem>
                )}
                {sp.undo && (
                  <DropdownMenuItem className={item} onSelect={undo}>
                    <Undo2 className="h-4 w-4" /> Undo <span className="ml-auto text-[11px] text-muted-foreground">{graceMin} min left</span>
                  </DropdownMenuItem>
                )}
                {sp.dispute && onDispute && (
                  <DropdownMenuItem className={item} onSelect={openDispute}><Flag className="h-4 w-4" /> Dispute this…</DropdownMenuItem>
                )}
                {sp.remove && onRemove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={cn(item, "text-destructive focus:text-destructive")} onSelect={onRemove}>
                      <X className="h-4 w-4" /> Remove interest
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}

            {viewer === "organiser" && org && (
              <>
                {org.disputeOpen && onResolve && meeting?.dispute_requested_status && (
                  <>
                    <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">The sponsor disputes this record.</DropdownMenuLabel>
                    <DropdownMenuItem className={item} onSelect={() => { setReason(""); setDialog("resolve_keep"); }}>
                      <Scale className="h-4 w-4" /> Keep as "{MEETING_STATUS_LABEL[status!]}"…
                    </DropdownMenuItem>
                    <DropdownMenuItem className={item} onSelect={() => { setReason(""); setDialog("resolve_change"); }}>
                      <Scale className="h-4 w-4" /> Change to "{MEETING_STATUS_LABEL[meeting.dispute_requested_status]}"…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {reasonRequired && (
                  <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">The event has ended — changes need a reason.</DropdownMenuLabel>
                )}
                {(status === "interested" || status === "arranged") && (
                  <DropdownMenuItem className={item} onSelect={openArrange}>
                    <CalendarClock className="h-4 w-4" /> {status === "arranged" ? "Change time or place…" : "Arrange meeting…"}
                  </DropdownMenuItem>
                )}
                {status !== "met" && <DropdownMenuItem className={item} onSelect={() => request({ status: "met" })}><Handshake className="h-4 w-4" /> Mark as met</DropdownMenuItem>}
                {status !== "not_met" && <DropdownMenuItem className={item} onSelect={openNotMet}><CircleSlash className="h-4 w-4" /> Didn't happen…</DropdownMenuItem>}
                {status !== "cancelled" && status !== "interested" && <DropdownMenuItem className={item} onSelect={openCancel}><XCircle className="h-4 w-4" /> Cancel meeting…</DropdownMenuItem>}
                {status === "arranged" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={item} onSelect={() => request({ status: "interested" })}><Undo2 className="h-4 w-4" /> Back to interested</DropdownMenuItem>
                  </>
                )}
                {(status === "met" || status === "not_met" || status === "cancelled") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={item} onSelect={undo}><Undo2 className="h-4 w-4" /> Undo</DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {meeting?.dispute_status === "open" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <Flag className="h-3 w-3" /> Disputed
        </span>
      )}
      {viewer === "organiser" && status === "met" && checkedIn === false && (
        <span title={`${personName} never checked in`} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> No check-in
        </span>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="sm:max-w-[440px]" onClick={(e) => e.stopPropagation()}>
          {dialog === "arrange" && (
            <form onSubmit={(e) => {
              e.preventDefault();
              request({ status: "arranged", scheduledAt: when ? new Date(when).toISOString() : null, location: where.trim() || null });
            }}>
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
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit">{status === "arranged" ? "Save" : "Arrange"}</Button>
              </DialogFooter>
            </form>
          )}

          {dialog === "not_met" && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (reasonRequired && !reason.trim()) return;
              request({ status: "not_met", cause, reason: reason.trim() || null });
            }}>
              <DialogHeader>
                <DialogTitle>Meeting didn't happen</DialogTitle>
                <DialogDescription>With {personName}. What happened?</DialogDescription>
              </DialogHeader>
              <RadioGroup value={cause} onValueChange={(v) => setCause(v as MeetingCause)} className="mt-4 grid gap-2">
                {MEETING_CAUSES.map((c) => (
                  <Label key={c} htmlFor={`cause-${c}`} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] font-normal has-[:checked]:border-foreground">
                    <RadioGroupItem id={`cause-${c}`} value={c} /> {MEETING_CAUSE_LABEL[c]}
                  </Label>
                ))}
              </RadioGroup>
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="meeting-reason">Details{reasonRequired ? "" : " (optional)"}</Label>
                <Textarea id="meeting-reason" value={reason} maxLength={500} rows={2} required={reasonRequired}
                  placeholder={reasonRequired ? "Why is this being changed after the event?" : "e.g. Moved to a call next week"}
                  onChange={(e) => setReason(e.target.value)} />
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={reasonRequired && !reason.trim()}>Save</Button>
              </DialogFooter>
            </form>
          )}

          {dialog === "cancel" && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (reasonRequired && !reason.trim()) return;
              request({ status: "cancelled", reason: reason.trim() || null });
            }}>
              <DialogHeader>
                <DialogTitle>Cancel meeting</DialogTitle>
                <DialogDescription>With {personName}. The meeting stays on record as cancelled.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="meeting-cancel-reason">Reason{reasonRequired ? "" : " (optional)"}</Label>
                <Textarea id="meeting-cancel-reason" value={reason} maxLength={500} rows={2} required={reasonRequired} onChange={(e) => setReason(e.target.value)} />
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Keep meeting</Button>
                <Button type="submit" variant="destructive" disabled={reasonRequired && !reason.trim()}>Cancel meeting</Button>
              </DialogFooter>
            </form>
          )}

          {dialog === "dispute" && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              onDispute?.(requested, reason.trim());
              close();
            }}>
              <DialogHeader>
                <DialogTitle>Dispute this record</DialogTitle>
                <DialogDescription>
                  It says "{meeting ? meetingSummary(meeting) : ""}" for {personName}. The organiser will review your request; the record stays as it is until then.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-1.5">
                <Label>It should say</Label>
                <RadioGroup value={requested} onValueChange={(v) => setRequested(v as MeetingStatus)} className="grid gap-2">
                  {MEETING_STATUSES.filter((s) => s !== status && s !== "interested").map((s) => (
                    <Label key={s} htmlFor={`req-${s}`} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] font-normal has-[:checked]:border-foreground">
                      <RadioGroupItem id={`req-${s}`} value={s} /> {MEETING_STATUS_LABEL[s]}
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="dispute-reason">Why is it wrong?</Label>
                <Textarea id="dispute-reason" value={reason} maxLength={1000} rows={3} required placeholder="e.g. The attendee didn't turn up at Table 4" onChange={(e) => setReason(e.target.value)} />
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={!reason.trim()}>Send dispute</Button>
              </DialogFooter>
            </form>
          )}

          {dialog === "reason" && pending && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              onChange({ ...pending, reason: reason.trim() });
              close();
            }}>
              <DialogHeader>
                <DialogTitle>Why are you changing this?</DialogTitle>
                <DialogDescription>
                  The event has ended. Changing "{meeting ? meetingSummary(meeting) : ""}" to "{MEETING_STATUS_LABEL[pending.status]}" needs a reason — both you and the sponsor will see it in the history.
                </DialogDescription>
              </DialogHeader>
              <Textarea className="mt-4" value={reason} maxLength={1000} rows={3} required aria-label="Reason" onChange={(e) => setReason(e.target.value)} />
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={!reason.trim()}>Save change</Button>
              </DialogFooter>
            </form>
          )}

          {dialog === "unchecked" && pending && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> {personName} never checked in</DialogTitle>
                <DialogDescription>
                  There's no check-in for {personName.split(" ")[0]} at this event. Mark the meeting as met anyway? It will be flagged for the organiser.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="button" onClick={() => { const c = pending; setDialog(null); request(c, true); }}>Mark as met</Button>
              </DialogFooter>
            </>
          )}

          {(dialog === "resolve_keep" || dialog === "resolve_change") && meeting && (
            <form onSubmit={(e) => {
              e.preventDefault();
              onResolve?.(dialog === "resolve_keep", reason.trim() || null);
              close();
            }}>
              <DialogHeader>
                <DialogTitle>{dialog === "resolve_keep" ? `Keep as "${MEETING_STATUS_LABEL[meeting.status]}"` : `Change to "${MEETING_STATUS_LABEL[meeting.dispute_requested_status ?? meeting.status]}"`}</DialogTitle>
                <DialogDescription>
                  The sponsor said: "{meeting.dispute_reason}". Your decision and note are shown to the sponsor and kept in the history.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="resolve-note">Note to the sponsor (optional)</Label>
                <Textarea id="resolve-note" value={reason} maxLength={1000} rows={3} onChange={(e) => setReason(e.target.value)} />
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit">{dialog === "resolve_keep" ? "Keep record" : "Change record"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}

/** The dispute on a meeting, open or settled, in words. */
export function MeetingDisputeInfo({ meeting, viewer }: { meeting: MeetingState; viewer: Viewer }) {
  const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
  if (meeting.dispute_status === "open") {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px]">
        <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
          <Flag className="h-3.5 w-3.5" /> {viewer === "sponsor" ? "You disputed this" : "The sponsor disputes this"} · {day(meeting.disputed_at)}
        </p>
        <p className="mt-0.5">
          Asks for <b>{meeting.dispute_requested_status ? MEETING_STATUS_LABEL[meeting.dispute_requested_status] : "a change"}</b>: "{meeting.dispute_reason}"
        </p>
        <p className="mt-0.5 text-muted-foreground">{viewer === "sponsor" ? "Waiting for the organiser." : "Use the meeting menu to keep or change the record."}</p>
      </div>
    );
  }
  if (meeting.dispute_status === "resolved") {
    return (
      <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12.5px]">
        <p className="font-semibold">Dispute settled · {day(meeting.resolved_at)}</p>
        <p className="mt-0.5">
          The organiser {meeting.dispute_resolution === "kept" ? "kept the record" : "changed the record"}
          {meeting.dispute_note ? `: "${meeting.dispute_note}"` : "."}
        </p>
      </div>
    );
  }
  return null;
}

/** Every change to one meeting, oldest first, from the append-only history. */
export function MeetingHistory({
  eventId, registrationId, speakerId, sponsorId, viewer, refreshKey,
}: {
  eventId: string;
  registrationId: string | null;
  speakerId: string | null;
  /** Organisers: whose meeting. */
  sponsorId?: string | null;
  viewer: Viewer;
  refreshKey?: string;
}) {
  const [entries, setEntries] = useState<MeetingHistoryEntry[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    supabaseRpc("meeting_history" as never, {
      _eid: eventId, _registration_id: registrationId, _speaker_id: speakerId, _sponsor_id: sponsorId ?? null,
    } as never).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setUnavailable(true); setEntries([]); return; }
      setEntries((data || []) as unknown as MeetingHistoryEntry[]);
    });
    return () => { alive = false; };
  }, [eventId, registrationId, speakerId, sponsorId, refreshKey]);

  const who = (side: MeetingHistoryEntry["side"]) =>
    side === viewer ? (viewer === "sponsor" ? "Your team" : "Organiser") : side === "organiser" ? "Organiser" : "Sponsor";
  const at = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  if (entries === null) return <p className="text-[12px] text-muted-foreground">Loading history…</p>;
  if (unavailable) return <p className="text-[12px] text-muted-foreground">History appears once the latest database update is applied.</p>;
  if (!entries.length) return <p className="text-[12px] text-muted-foreground">No history yet.</p>;

  return (
    <ol className="grid gap-2" aria-label="Meeting history">
      {entries.map((e, i) => (
        <li key={i} className="grid grid-cols-[8px_1fr] gap-2.5 text-[12.5px]">
          <i className={cn("mt-1.5 h-2 w-2 rounded-full", {
            "bg-muted-foreground/50": !e.to_status || e.to_status === "interested" || e.to_status === "cancelled",
            "bg-blue-500": e.to_status === "arranged",
            "bg-green-500": e.to_status === "met",
            "bg-red-500": e.to_status === "not_met",
            "bg-amber-500": e.action.startsWith("dispute"),
          })} />
          <span>
            <b className="font-semibold">{historyLabel(e)}</b>
            <span className="text-muted-foreground"> · {who(e.side)} · {at(e.created_at)}</span>
            {e.action === "arranged" && (e.scheduled_at || e.location) && (
              <span className="block text-muted-foreground">
                {[e.scheduled_at ? at(e.scheduled_at) : null, e.location].filter(Boolean).join(" · ")}
              </span>
            )}
            {e.reason && <span className="block text-muted-foreground">"{e.reason}"</span>}
          </span>
        </li>
      ))}
      {entries.some((e) => e.backfilled) && (
        <li className="pl-[18px] text-[11.5px] text-muted-foreground">Earlier entries were rebuilt from the activity log.</li>
      )}
    </ol>
  );
}
