import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil, Trash2, MoreVertical, Send, Mail, MessageSquare, Plus, FileEdit,
  Loader2, Copy, Ban, RotateCcw,
} from "lucide-react";
import {
  useCommunications,
  deleteCommunication,
  dispatchCommunication,
  duplicateCommunication,
  unscheduleCommunication,
  retryFailedRecipients,
} from "@/hooks/useCommunications";
import { ComposeMessageDialog } from "./ComposeMessageDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Communication } from "@/types/communications";

interface CommunicationsSectionProps {
  /** Pass exactly one. */
  eventId?: string;
  communityId?: string;
}

/**
 * Drop-in replacement for the old `CommunicationSection`.
 * Phase 1: compose wizard + drafts/sent groups + send-now via RPC.
 * Phase 2: scheduling, duplicate-from-existing, unschedule, scheduled group.
 * Phase 3: WhatsApp template send + per-recipient delivery rows.
 * Phase 5: community-scoped sends + retry-failed-recipients action.
 */
export function CommunicationsSection({ eventId, communityId }: CommunicationsSectionProps) {
  const scope: "event" | "community" = communityId ? "community" : "event";
  const hasScope = !!eventId || !!communityId;
  const { items, loading } = useCommunications({ eventId: eventId ?? null, communityId: communityId ?? null });

  // Scope-specific lookups: pull org_id (and event date for schedule presets).
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgIdResolved, setOrgIdResolved] = useState(false);
  const [eventDate, setEventDate] = useState<string | null>(null);
  useEffect(() => {
    if (!hasScope) return;
    let cancelled = false;
    (async () => {
      if (eventId) {
        const { data } = await supabase
          .from("events")
          .select("org_id, date")
          .eq("id", eventId)
          .maybeSingle();
        if (cancelled) return;
        setOrgId(data?.org_id ?? null);
        setEventDate(data?.date ?? null);
        setOrgIdResolved(true);
        return;
      }
      if (communityId) {
        const { data } = await supabase
          .from("communities" as never)
          .select("org_id")
          .eq("id", communityId)
          .maybeSingle();
        if (cancelled) return;
        setOrgId((data as { org_id: string | null } | null)?.org_id ?? null);
        setOrgIdResolved(true);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, communityId, hasScope]);

  const [composeOpen, setComposeOpen] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const drafts    = items.filter((c) => c.status === "draft");
  const scheduled = items.filter((c) => c.status === "scheduled");
  const sent      = items.filter((c) => c.status === "sent" || c.status === "sending" || c.status === "queued");
  const failed    = items.filter((c) => c.status === "failed");

  const openCompose = (draftId: string | null = null) => {
    setEditingDraftId(draftId);
    setComposeOpen(true);
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newId = await duplicateCommunication(id);
      toast.success("Duplicated as draft");
      openCompose(newId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate");
    }
  };

  const handleUnschedule = async (id: string) => {
    try {
      await unscheduleCommunication(id);
      toast.success("Schedule cancelled — back to draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unschedule");
    }
  };

  const handleRetryFailed = async (comm: Communication) => {
    if (!comm.channels.includes("whatsapp")) {
      toast.info("Retry is currently only supported for WhatsApp recipients");
      return;
    }
    try {
      const result = await retryFailedRecipients(comm.id, "whatsapp");
      if (result.reset === 0) {
        toast.info("No failed WhatsApp recipients to retry");
        return;
      }
      toast.success(
        `Retried ${result.reset} recipient${result.reset === 1 ? "" : "s"}` +
        (typeof result.sent === "number" ? ` — ${result.sent} sent, ${result.failed} failed` : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  };

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* Header + Compose CTA */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Communications</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {scope === "community"
              ? "Reach community members across email and WhatsApp."
              : "Compose once, choose channels, send to a targeted recipient set."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => openCompose(null)}
          disabled={!orgId}
          title={!orgId && orgIdResolved ? "This surface isn't connected to an organization yet." : undefined}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Compose Message
        </Button>
      </div>

      {!hasScope ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-[13px] text-muted-foreground">
          Open this surface from an event or community to start composing.
        </div>
      ) : orgIdResolved && !orgId ? (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-6 text-[13px] leading-relaxed">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Communications need an organization context.
          </p>
          <p className="text-muted-foreground mt-1">
            {scope === "community"
              ? "This community isn't linked to an organization yet. Communications can be sent from event-scoped communities or by linking this community to an org first."
              : "We couldn't find an organization for this event. Refresh the page; if the issue persists, the event may be detached from its org."}
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground gap-2 text-[13px]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading communications…
        </div>
      ) : items.length === 0 ? (
        <EmptyState onCompose={() => openCompose(null)} disabled={!orgId} />
      ) : (
        <>
          {drafts.length > 0 && (
            <SectionGroup title="Drafts" count={drafts.length}>
              {drafts.map((c) => (
                <CommunicationRow
                  key={c.id}
                  comm={c}
                  onEdit={() => openCompose(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  onSendNow={() => handleSendNow(c.id)}
                  onDuplicate={() => handleDuplicate(c.id)}
                />
              ))}
            </SectionGroup>
          )}

          {scheduled.length > 0 && (
            <SectionGroup title="Scheduled" count={scheduled.length}>
              {scheduled.map((c) => (
                <CommunicationRow
                  key={c.id}
                  comm={c}
                  onEdit={() => openCompose(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  onUnschedule={() => handleUnschedule(c.id)}
                  onDuplicate={() => handleDuplicate(c.id)}
                />
              ))}
            </SectionGroup>
          )}

          {sent.length > 0 && (
            <SectionGroup title="Sent" count={sent.length}>
              {sent.map((c) => (
                <CommunicationRow
                  key={c.id}
                  comm={c}
                  onDelete={() => handleDelete(c.id)}
                  onDuplicate={() => handleDuplicate(c.id)}
                  onRetryFailed={() => handleRetryFailed(c)}
                />
              ))}
            </SectionGroup>
          )}

          {failed.length > 0 && (
            <SectionGroup title="Failed" count={failed.length}>
              {failed.map((c) => (
                <CommunicationRow
                  key={c.id}
                  comm={c}
                  onEdit={() => openCompose(c.id)}
                  onDelete={() => handleDelete(c.id)}
                  onSendNow={() => handleSendNow(c.id)}
                  onDuplicate={() => handleDuplicate(c.id)}
                />
              ))}
            </SectionGroup>
          )}
        </>
      )}

      {orgId && (
        <ComposeMessageDialog
          open={composeOpen}
          onOpenChange={(o) => { setComposeOpen(o); if (!o) setEditingDraftId(null); }}
          eventId={eventId}
          communityId={communityId}
          orgId={orgId}
          eventDate={eventDate}
          draftId={editingDraftId}
        />
      )}
    </div>
  );
}

async function handleDelete(id: string) {
  if (!confirm("Delete this message? This cannot be undone.")) return;
  try { await deleteCommunication(id); toast.success("Deleted"); }
  catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
}

async function handleSendNow(id: string) {
  try {
    const result = await dispatchCommunication(id);
    toast.success(`Sent to ${result.recipient_count} recipient${result.recipient_count === 1 ? "" : "s"}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Send failed");
  }
}

function SectionGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          {title}
        </span>
        <Badge variant="secondary" className="text-[10px] font-normal">{count}</Badge>
      </div>
      <div className="border border-border rounded-lg divide-y divide-border bg-card">
        {children}
      </div>
    </div>
  );
}

function relativeTime(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return "any moment now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "in less than a minute";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `in ${days}d ${hours % 24}h`;
  return target.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CommunicationRow({
  comm, onEdit, onDelete, onSendNow, onUnschedule, onDuplicate, onRetryFailed,
}: {
  comm: Communication;
  onEdit?: () => void;
  onDelete: () => void;
  onSendNow?: () => void;
  onUnschedule?: () => void;
  onDuplicate?: () => void;
  onRetryFailed?: () => void;
}) {
  const isDraft     = comm.status === "draft";
  const isSent      = comm.status === "sent";
  const isScheduled = comm.status === "scheduled";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex items-center gap-1.5 shrink-0">
        {comm.channels.includes("email") && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
        {comm.channels.includes("whatsapp") && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{comm.subject || "(no subject)"}</div>
        <div className="text-[11.5px] text-muted-foreground truncate">
          {isSent && comm.sent_at ? (
            <>
              Sent {new Date(comm.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {comm.sent_count}/{comm.recipient_count} delivered
            </>
          ) : isScheduled && comm.scheduled_for ? (
            <>
              Scheduled · sends {relativeTime(new Date(comm.scheduled_for))}
              {" · "}
              {new Date(comm.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </>
          ) : (
            <>Last edited {new Date(comm.updated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>
          )}
        </div>
      </div>
      <Badge
        variant={isDraft ? "outline" : isScheduled ? "default" : isSent ? "secondary" : "destructive"}
        className="text-[10px] font-normal capitalize shrink-0"
      >
        {comm.status}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onEdit && (isDraft || isScheduled || comm.status === "failed") && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
          )}
          {isDraft && onSendNow && (
            <DropdownMenuItem onClick={onSendNow}>
              <Send className="h-3.5 w-3.5 mr-2" /> Send now
            </DropdownMenuItem>
          )}
          {isScheduled && onUnschedule && (
            <DropdownMenuItem onClick={onUnschedule}>
              <Ban className="h-3.5 w-3.5 mr-2" /> Cancel schedule
            </DropdownMenuItem>
          )}
          {comm.status === "failed" && onSendNow && (
            <DropdownMenuItem onClick={onSendNow}>
              <Send className="h-3.5 w-3.5 mr-2" /> Retry send
            </DropdownMenuItem>
          )}
          {isSent && onRetryFailed && comm.channels.includes("whatsapp") && (
            <DropdownMenuItem onClick={onRetryFailed}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Retry failed deliveries
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyState({ onCompose, disabled }: { onCompose: () => void; disabled: boolean }) {
  return (
    <div className="border border-dashed border-border rounded-xl p-10 text-center">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
        <FileEdit className="h-4 w-4 text-muted-foreground" />
      </div>
      <h3 className="text-[14px] font-semibold">No messages yet</h3>
      <p className="text-[12.5px] text-muted-foreground max-w-md mx-auto mt-1">
        Reach attendees, speakers, and sponsors from one composer. Pick channels,
        choose recipients, and send.
      </p>
      <Button onClick={onCompose} size="sm" className="mt-4" disabled={disabled}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Compose your first message
      </Button>
    </div>
  );
}

export default CommunicationsSection;
