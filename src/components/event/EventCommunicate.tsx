import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Send, Mail, MessageSquare, Plus, ChevronLeft, ChevronRight,
  CalendarClock, Clock, MoreVertical, Pencil, Trash2, Copy, Ban,
  Check, FileEdit, Loader2, Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { applyVariables, type SubstitutionContext } from "@/lib/communications/substitute";
import { buildAttendeeJoinUrl } from "@/lib/attendee-link";

// ─── Types — kept local so this file is self-contained ─────────────────────
type Channel = "email" | "whatsapp";
type RecipientType =
  | "all_attendees" | "checked_in" | "paid" | "speakers" | "sponsors" | "custom";
type Status = "draft" | "scheduled" | "queued" | "sending" | "sent" | "failed";

interface Communication {
  id: string;
  org_id: string;
  event_id: string | null;
  channels: Channel[];
  recipient_filter: { types: RecipientType[]; user_ids?: string[] };
  subject: string;
  body_text: string;
  status: Status;
  scheduled_for: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  whatsapp_template_name: string | null;
  whatsapp_template_language: string | null;
  whatsapp_template_variables: { body?: string[] } | null;
}

interface RecipientOption {
  id: RecipientType;
  label: string;
  description: string;
}

const RECIPIENTS: RecipientOption[] = [
  { id: "all_attendees", label: "All attendees",        description: "Everyone with a confirmed registration" },
  { id: "checked_in",    label: "Checked-in attendees", description: "People who scanned in at the venue" },
  { id: "paid",          label: "Paid attendees",       description: "Registrations with non-zero amount paid" },
  { id: "speakers",      label: "Speakers",             description: "Speakers attached to this event" },
  { id: "sponsors",      label: "Sponsors",             description: "Sponsors attached to this event" },
  { id: "custom",        label: "Custom selection",     description: "Pick individual recipients by hand" },
];

// WhatsApp templates are loaded from the `whatsapp_templates` cache table at
// runtime — the table is populated by the `whatsapp-sync-templates` edge
// function when the organizer clicks "Sync from Meta" in the compose dialog.
interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string | null;
  /** Number of `{{n}}` placeholders in the template body. */
  variable_count: number;
  /** Raw `components` array from Meta. The compose UI doesn't render this
   *  directly — it falls back to a synthetic body string when present. */
  components: unknown;
}

/** Pull the body-text of the BODY component from a Meta template, used to
 *  show a small preview line under the picker. Returns empty string when
 *  no BODY component is set. */
function bodyTextOf(template: WhatsAppTemplate | null | undefined): string {
  if (!template) return "";
  const components = (template.components as Array<{ type?: string; text?: string }> | undefined) ?? [];
  const body = components.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  return body?.text ?? "";
}

const COMMUNICATION_VARIABLES = [
  { token: "{{user_name}}",      description: "Recipient's display name" },
  { token: "{{event_name}}",     description: "Event title" },
  { token: "{{event_date}}",     description: "Event start date" },
  { token: "{{event_location}}", description: "Event venue / location" },
  // NOTE: server-side per-recipient substitution for `{{join_url}}`
  // requires a matching SQL migration to `_communications_render_text`.
  // Until that lands, the preview will show a sample link with the
  // current user's join_token (if available) so the organiser can
  // verify shape / UTM tags before sending.
  { token: "{{join_url}}",       description: "Per-attendee tracked webinar join link (preview only — see attendee-link.ts)" },
];

/**
 * Detects "edge function not deployed" errors so we can fall back to a
 * "channel unavailable" warning rather than treating the whole send as
 * failed. Supabase returns `{ code: "NOT_FOUND", message: "Requested
 * function was not found" }` when the function isn't deployed in the
 * project. The error object surfaced through `supabase.functions.invoke`
 * carries that message intact.
 */
function isFunctionNotFound(err: unknown): boolean {
  if (!err) return false;
  const message = (err as { message?: string }).message ?? String(err);
  return /not[\s_-]?found|requested function was not found/i.test(message);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function EventCommunicate({ eventId }: { eventId: string }) {
  // Pull org_id + event date once — needed for inserts and schedule presets.
  const [orgId, setOrgId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<string | null>(null);

  // Backing list — populated by Supabase, kept fresh with realtime.
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<"all" | Status>("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<Communication | null>(null);

  // Bootstrap event metadata
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("org_id, date")
        .eq("id", eventId)
        .maybeSingle();
      if (cancelled || !data) return;
      setOrgId(data.org_id ?? null);
      setEventDate(data.date ?? null);
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Load communications + subscribe to realtime updates
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("communications" as never)
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error(`Failed to load: ${error.message}`);
        setLoading(false);
        return;
      }
      setItems((data ?? []) as unknown as Communication[]);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel(`event-comms-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "communications", filter: `event_id=eq.${eventId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [eventId]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((m) => m.status === filter);
  }, [filter, items]);

  const counts = useMemo(() => ({
    all:       items.length,
    draft:     items.filter((m) => m.status === "draft").length,
    scheduled: items.filter((m) => m.status === "scheduled").length,
    sent:      items.filter((m) => m.status === "sent" || m.status === "sending" || m.status === "queued").length,
    failed:    items.filter((m) => m.status === "failed").length,
  }), [items]);

  // Mutations — list refreshes via realtime, but we also kick off direct updates
  // so the user gets immediate feedback.
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this message? This cannot be undone.")) return;
    const { error } = await supabase.from("communications" as never).delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Deleted");
  };

  const handleSendNow = async (m: Communication) => {
    try {
      const { error } = await supabaseRpc(
        "communications_dispatch" as never,
        { _communication_id: m.id } as never,
      );
      if (error) throw new Error(error.message);

      const wantsEmail    = m.channels.includes("email");
      const wantsWhatsapp = m.channels.includes("whatsapp");

      // Email
      let emailResult = { sent: 0, failed: 0, remaining: 0 } as { sent: number; failed: number; remaining: number; errors?: Array<{ recipient_id: string; error: string }> };
      let emailUnavailable = false;
      if (wantsEmail) {
        const { data, error: emailErr } = await supabase.functions.invoke(
          "send-communication-email",
          { body: { communication_id: m.id } },
        );
        if (emailErr) {
          if (isFunctionNotFound(emailErr)) emailUnavailable = true;
          else throw new Error(emailErr.message);
        } else {
          emailResult = data as { sent: number; failed: number; remaining: number };
        }
      }

      // WhatsApp
      let waResult = { sent: 0, failed: 0 } as { sent: number; failed: number; errors?: Array<{ recipient_id: string; error: string }> };
      let waUnavailable = false;
      if (wantsWhatsapp) {
        const { data, error: waErr } = await supabase.functions.invoke(
          "send-whatsapp",
          { body: { communication_id: m.id } },
        );
        if (waErr) {
          if (isFunctionNotFound(waErr)) waUnavailable = true;
          else throw new Error(waErr.message);
        } else {
          waResult = data as { sent: number; failed: number };
        }
      }

      const totalSent   = emailResult.sent + waResult.sent;
      const totalFailed = emailResult.failed + waResult.failed;
      const unavailable: string[] = [];
      if (emailUnavailable) unavailable.push("email");
      if (waUnavailable) unavailable.push("whatsapp");

      if (unavailable.length > 0 && totalSent === 0) {
        toast.warning(
          `${unavailable.join(" + ")} provider not configured — deploy the edge function${
            unavailable.length === 1 ? "" : "s"
          } and set its secrets.`,
        );
      } else if (unavailable.length > 0) {
        toast.warning(
          `Sent ${totalSent} via ${wantsEmail && !emailUnavailable ? "email" : "whatsapp"}. ${
            unavailable.join(" + ")
          } skipped — provider not configured.`,
        );
      } else if (totalFailed > 0) {
        const firstError = emailResult.errors?.[0]?.error ?? waResult.errors?.[0]?.error;
        toast.warning(`${totalSent} sent, ${totalFailed} failed`, {
          description: firstError ? `Reason: ${firstError}` : undefined,
        });
      } else if (emailResult.remaining > 0) {
        toast.info(`Sent ${totalSent} — ${emailResult.remaining} email recipients still queued`);
      } else {
        toast.success(`Sent to ${totalSent} recipient${totalSent === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    }
  };

  const handleUnschedule = async (id: string) => {
    const { error } = await supabaseRpc(
      "communications_unschedule" as never,
      { _communication_id: id } as never,
    );
    if (error) toast.error(error.message);
    else toast.success("Schedule cancelled — back to draft");
  };

  const handleDuplicate = async (id: string) => {
    const { data, error } = await supabaseRpc(
      "communications_duplicate" as never,
      { _communication_id: id } as never,
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Duplicated as draft");
    const newId = data as string;
    const dup = items.find((x) => x.id === newId);
    if (dup) {
      setEditing(dup);
      setComposeOpen(true);
    }
  };

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Communications</h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Compose once, choose channels, send to a targeted recipient set.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setComposeOpen(true); }}
          disabled={!orgId}
          className="h-9"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Compose Message
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-[12px] gap-1.5">
            All <Badge variant="secondary" className="text-[10px] font-normal">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="draft" className="text-[12px] gap-1.5">
            Drafts <Badge variant="secondary" className="text-[10px] font-normal">{counts.draft}</Badge>
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="text-[12px] gap-1.5">
            Scheduled <Badge variant="secondary" className="text-[10px] font-normal">{counts.scheduled}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sent" className="text-[12px] gap-1.5">
            Sent <Badge variant="secondary" className="text-[10px] font-normal">{counts.sent}</Badge>
          </TabsTrigger>
          {counts.failed > 0 && (
            <TabsTrigger value="failed" className="text-[12px] gap-1.5">
              Failed <Badge variant="destructive" className="text-[10px] font-normal">{counts.failed}</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2 text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading communications…
            </div>
          ) : visible.length === 0 ? (
            <EmptyState onCompose={() => { setEditing(null); setComposeOpen(true); }} disabled={!orgId} />
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border bg-card">
              {visible.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  onEdit={() => { setEditing(m); setComposeOpen(true); }}
                  onDelete={() => handleDelete(m.id)}
                  onSendNow={() => handleSendNow(m)}
                  onUnschedule={() => handleUnschedule(m.id)}
                  onDuplicate={() => handleDuplicate(m.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {orgId && (
        <ComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          editing={editing}
          eventId={eventId}
          orgId={orgId}
          eventDate={eventDate}
        />
      )}
    </div>
  );
}

// ─── List row ────────────────────────────────────────────────────────────────
function MessageRow({
  m, onEdit, onDelete, onDuplicate, onSendNow, onUnschedule,
}: {
  m: Communication;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSendNow: () => void;
  onUnschedule: () => void;
}) {
  const isDraft     = m.status === "draft";
  const isScheduled = m.status === "scheduled";
  const isSent      = m.status === "sent";
  const isFailed    = m.status === "failed";

  const variant: Record<Status, "outline" | "default" | "secondary" | "destructive"> = {
    draft:     "outline",
    scheduled: "default",
    queued:    "default",
    sending:   "default",
    sent:      "secondary",
    failed:    "destructive",
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5 shrink-0">
        {m.channels.includes("email")    && <Mail          className="h-3.5 w-3.5 text-muted-foreground" />}
        {m.channels.includes("whatsapp") && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{m.subject || "(no subject)"}</div>
        <div className="text-[11.5px] text-muted-foreground truncate">
          {isSent && m.sent_at
            ? `Sent ${formatTime(m.sent_at)} · ${m.sent_count}/${m.recipient_count} delivered${m.failed_count > 0 ? ` · ${m.failed_count} failed` : ""}`
            : isScheduled && m.scheduled_for
              ? `Scheduled · sends ${formatRelative(m.scheduled_for)}`
              : `Last edited ${formatTime(m.updated_at)}`
          }
        </div>
      </div>
      <Badge variant={variant[m.status]} className="text-[10px] font-normal capitalize shrink-0">
        {m.status}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {(isDraft || isScheduled || isFailed) && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
            </DropdownMenuItem>
          )}
          {(isDraft || isFailed) && (
            <DropdownMenuItem onClick={onSendNow}>
              <Send className="h-3.5 w-3.5 mr-2" /> {isFailed ? "Retry send" : "Send now"}
            </DropdownMenuItem>
          )}
          {isScheduled && (
            <DropdownMenuItem onClick={onUnschedule}>
              <Ban className="h-3.5 w-3.5 mr-2" /> Cancel schedule
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
          </DropdownMenuItem>
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
      <h3 className="text-[14px] font-semibold">No messages here yet</h3>
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


// ─── Compose dialog (wired to real backend) ─────────────────────────────────
function ComposeDialog({
  open, onOpenChange, editing, eventId, orgId, eventDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Communication | null;
  eventId: string;
  orgId: string;
  eventDate: string | null;
}) {
  type Step = 1 | 2 | 3;
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [channels, setChannels] = useState<Channel[]>(["email"]);
  const [recipients, setRecipients] = useState<RecipientType[]>(["all_attendees"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [waTemplate, setWaTemplate] = useState<string>("");
  const [waTemplateLanguage, setWaTemplateLanguage] = useState<string>("en");
  const [waVars, setWaVars] = useState<string[]>([]);

  // Real templates pulled from the `whatsapp_templates` cache table — populated
  // by the `whatsapp-sync-templates` edge function. The list reloads when the
  // user clicks "Sync from Meta".
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waLoadingTemplates, setWaLoadingTemplates] = useState(false);
  const [waSyncing, setWaSyncing] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");

  // Custom-selection picker state — used when "custom" is in recipients
  interface AttendeeRow { user_id: string; name: string; email: string; }
  const [customUserIds, setCustomUserIds]   = useState<string[]>([]);
  const [attendeeOptions, setAttendeeOptions] = useState<AttendeeRow[]>([]);
  const [attendeeQuery, setAttendeeQuery]   = useState("");
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  // Live recipient count from the resolver RPC
  const [resolvedCount, setResolvedCount] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  // Sample-data context for the preview block. Populated when the dialog
  // opens so the organizer sees what one recipient would actually receive
  // instead of raw {{tokens}}.
  const [previewCtx, setPreviewCtx] = useState<SubstitutionContext>({});

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Hydrate / reset whenever the dialog opens
  useEffect(() => {
    if (!open) {
      // Drop cached options so reopening for a different event doesn't show
      // the previous one's attendees.
      setAttendeeOptions([]);
      setAttendeeQuery("");
      return;
    }
    if (editing) {
      setChannels(editing.channels);
      setRecipients(editing.recipient_filter.types);
      setCustomUserIds(editing.recipient_filter.user_ids ?? []);
      setSubject(editing.subject);
      setBody(editing.body_text);
      setWaTemplate(editing.whatsapp_template_name ?? "");
      setWaTemplateLanguage(editing.whatsapp_template_language ?? "en");
      setWaVars(editing.whatsapp_template_variables?.body ?? []);
      if (editing.status === "scheduled" && editing.scheduled_for) {
        setDeliveryMode("schedule");
        setScheduledFor(toLocalInput(editing.scheduled_for));
      } else {
        setDeliveryMode("now");
        setScheduledFor("");
      }
    } else {
      setChannels(["email"]);
      setRecipients(["all_attendees"]);
      setCustomUserIds([]);
      setSubject("");
      setBody("");
      setWaTemplate("");
      setWaTemplateLanguage("en");
      setWaVars([]);
      setDeliveryMode("now");
      setScheduledFor("");
    }
    setStep(1);
  }, [open, editing]);

  // Load WhatsApp templates from the cache table whenever WhatsApp is selected
  useEffect(() => {
    if (!open || !channels.includes("whatsapp")) return;
    if (waTemplates.length > 0) return; // already loaded for this open
    let cancelled = false;
    setWaLoadingTemplates(true);
    (async () => {
      // Need org_id to scope templates. We get it from the event row.
      const { data: ev } = await supabase
        .from("events")
        .select("org_id")
        .eq("id", eventId)
        .maybeSingle();
      const orgIdLocal = (ev as { org_id: string | null } | null)?.org_id;
      if (!orgIdLocal) { setWaLoadingTemplates(false); return; }
      const { data, error } = await supabaseRpc(
        "whatsapp_templates_list" as never,
        { _org_id: orgIdLocal } as never,
      );
      if (cancelled) return;
      if (error) { toast.error(error.message); }
      else { setWaTemplates((data ?? []) as WhatsAppTemplate[]); }
      setWaLoadingTemplates(false);
    })();
    return () => { cancelled = true; };
  }, [open, channels, eventId, waTemplates.length]);
  useEffect(() => {
    if (!open || !recipients.includes("custom") || attendeeOptions.length > 0) return;
    let cancelled = false;
    setAttendeesLoading(true);
    (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("user_id, name, email, first_name, last_name")
        .eq("event_id", eventId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const opts: AttendeeRow[] = (data ?? []).flatMap((r) => {
        const row = r as { user_id: string | null; name: string | null; email: string; first_name: string | null; last_name: string | null };
        if (!row.user_id) return [];
        return [{
          user_id: row.user_id,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.name || row.email,
          email: row.email,
        }];
      });
      setAttendeeOptions(opts);
      setAttendeesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, recipients, eventId, attendeeOptions.length]);

  // Resolve live recipient count whenever recipients (or custom selection) change
  useEffect(() => {
    if (!open || step < 2) return;
    let cancelled = false;
    setResolving(true);
    const filter = { types: recipients, user_ids: customUserIds };
    supabaseRpc(
      "communications_resolve_recipients" as never,
      { _event_id: eventId, _filter: filter } as never,
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { toast.error(error.message); return; }
        const rows = (data ?? []) as Array<{ user_id: string | null }>;
        setResolvedCount(rows.length);
      })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [open, step, eventId, recipients, customUserIds]);

  // Load preview-time sample data: current user's name + this event's title /
  // date / location. Variables in the body get substituted with these values
  // in the preview block. This is purely UX — the actual fan-out renders
  // every recipient's row server-side via `_communications_render_text`.
  useEffect(() => {
    if (!open) { setPreviewCtx({}); return; }
    let cancelled = false;
    (async () => {
      const ctx: SubstitutionContext = {};

      // {{user_name}} — current user's profile (used as a sample)
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, last_name")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        const p = profile as { display_name: string | null; first_name: string | null; last_name: string | null } | null;
        ctx.user_name =
          (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : null) ||
          p?.display_name ||
          userData.user.email?.split("@")[0] ||
          "there";
      }

      // {{event_*}} — the event we're scoped to
      const { data: ev } = await supabase
        .from("events")
        .select("title, date, location, venue, slug")
        .eq("id", eventId)
        .maybeSingle();
      if (ev) {
        const evt = ev as { title: string; date: string; location: string | null; venue: string | null; slug: string | null };
        ctx.event_name     = evt.title;
        ctx.event_date     = new Date(evt.date).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        });
        ctx.event_location = evt.venue || evt.location || null;

        // {{join_url}} — preview-only per-attendee sample. Pull any
        // registration's join_token off the event so the organiser
        // can see the URL shape (with UTM tags) before sending. The
        // server-side fan-out still strips this token until the
        // matching SQL change is made — flagged in `substitute.ts`.
        const { data: sampleReg } = await supabase
          .from("registrations")
          .select("join_token")
          .eq("event_id", eventId)
          .not("join_token", "is", null)
          .limit(1)
          .maybeSingle();
        const sampleToken = (sampleReg as { join_token: string | null } | null)?.join_token;
        if (sampleToken) {
          ctx.join_url = buildAttendeeJoinUrl({
            registration: { join_token: sampleToken, event_id: eventId },
            event: { id: eventId, slug: evt.slug },
            utm: {
              source: "email",
              medium: "transactional",
              campaign: evt.slug || undefined,
              content: "event-invitation",
            },
          });
        }
      }

      if (!cancelled) setPreviewCtx(ctx);
    })();
    return () => { cancelled = true; };
  }, [open, eventId]);

  const wantsEmail    = channels.includes("email");
  const wantsWhatsapp = channels.includes("whatsapp");

  const pickedTemplate = waTemplates.find(
    (t) => t.name === waTemplate && t.language === waTemplateLanguage,
  );
  const waVarCount = pickedTemplate?.variable_count ?? 0;

  const canProceed1 = channels.length > 0;
  const canProceed2 = recipients.length > 0 && (resolvedCount ?? 0) > 0;
  const emailReady  = !wantsEmail || (subject.trim().length > 0 && body.trim().length > 0);
  // WhatsApp UI accepts any state; backend won't try to send WA in this phase
  const waReady = !wantsWhatsapp || (
    !!pickedTemplate &&
    waVars.length === waVarCount &&
    waVars.every((v) => v.trim().length > 0)
  );
  const canSend = canProceed1 && canProceed2 && emailReady && waReady;

  const scheduleIsFuture = !!scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 60_000;

  const insertVariable = (token: string) => {
    setBody((prev) => `${prev}${prev.length > 0 && !prev.endsWith(" ") ? " " : ""}${token}`);
  };

  const presets = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const tomorrow9 = new Date(now); tomorrow9.setDate(tomorrow9.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
    out.push({ label: "In 1 hour",    value: toLocalInput(inOneHour.toISOString()) });
    out.push({ label: "Tomorrow 9 AM", value: toLocalInput(tomorrow9.toISOString()) });
    if (eventDate) {
      const ev = new Date(eventDate);
      const dayBefore = new Date(ev.getTime() - 24 * 60 * 60 * 1000);
      const hourBefore = new Date(ev.getTime() - 60 * 60 * 1000);
      if (dayBefore > now)  out.push({ label: "1 day before event",  value: toLocalInput(dayBefore.toISOString()) });
      if (hourBefore > now) out.push({ label: "1 hour before event", value: toLocalInput(hourBefore.toISOString()) });
    }
    return out;
  }, [eventDate]);

  // ── Persistence helpers ───────────────────────────────────────────────────
  const persistDraft = async (): Promise<string | null> => {
    const filter = { types: recipients, user_ids: customUserIds };
    const waBinding = wantsWhatsapp && waTemplate ? { body: waVars } : null;
    const payload = {
      org_id: orgId,
      event_id: eventId,
      channels,
      recipient_filter: filter,
      subject: subject.trim(),
      body_text: body.trim(),
      whatsapp_template_name: wantsWhatsapp ? waTemplate || null : null,
      whatsapp_template_language: wantsWhatsapp ? waTemplateLanguage || "en" : null,
      whatsapp_template_variables: waBinding,
      status: "draft" as const,
    };

    if (editing) {
      const { error } = await supabase
        .from("communications" as never)
        .update(payload as never)
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return null; }
      return editing.id;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error("Sign in to compose"); return null; }
    const { data, error } = await supabase
      .from("communications" as never)
      .insert({ ...payload, created_by: uid } as never)
      .select("id")
      .single();
    if (error) { toast.error(error.message); return null; }
    return (data as { id: string }).id;
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    const id = await persistDraft();
    setSubmitting(false);
    if (id) {
      toast.success("Draft saved");
      onOpenChange(false);
    }
  };

  const handleSendNow = async () => {
    setSubmitting(true);
    try {
      const id = await persistDraft();
      if (!id) return;

      // Fan-out recipient rows (email + whatsapp marked pending)
      const { error: rpcErr } = await supabaseRpc(
        "communications_dispatch" as never,
        { _communication_id: id } as never,
      );
      if (rpcErr) throw new Error(rpcErr.message);

      // Email leg — only when email is in channels
      let emailResult = { sent: 0, failed: 0, remaining: 0 } as { sent: number; failed: number; remaining: number; errors?: Array<{ recipient_id: string; error: string }> };
      let emailUnavailable = false;
      if (wantsEmail) {
        const { data, error: emailErr } = await supabase.functions.invoke(
          "send-communication-email",
          { body: { communication_id: id } },
        );
        if (emailErr) {
          if (isFunctionNotFound(emailErr)) emailUnavailable = true;
          else throw new Error(emailErr.message);
        } else {
          emailResult = data as { sent: number; failed: number; remaining: number };
        }
      }

      // WhatsApp leg — only when whatsapp is in channels
      let waResult = { sent: 0, failed: 0 } as { sent: number; failed: number; errors?: Array<{ recipient_id: string; error: string }> };
      let waUnavailable = false;
      if (wantsWhatsapp) {
        const { data, error: waErr } = await supabase.functions.invoke(
          "send-whatsapp",
          { body: { communication_id: id } },
        );
        if (waErr) {
          if (isFunctionNotFound(waErr)) waUnavailable = true;
          else throw new Error(waErr.message);
        } else {
          waResult = data as { sent: number; failed: number };
        }
      }

      const totalSent   = emailResult.sent + waResult.sent;
      const totalFailed = emailResult.failed + waResult.failed;
      const unavailable: string[] = [];
      if (emailUnavailable) unavailable.push("email");
      if (waUnavailable) unavailable.push("whatsapp");

      if (unavailable.length > 0 && totalSent === 0) {
        toast.warning(
          `${unavailable.join(" + ")} provider not configured — deploy the edge function${
            unavailable.length === 1 ? "" : "s"
          } and set its secrets.`,
        );
      } else if (unavailable.length > 0) {
        toast.warning(
          `Sent ${totalSent}. ${unavailable.join(" + ")} skipped — provider not configured.`,
        );
      } else if (emailResult.remaining > 0) {
        toast.info(`Sent ${totalSent} so far — ${emailResult.remaining} email recipients still queued`);
      } else if (totalFailed > 0) {
        const firstError = emailResult.errors?.[0]?.error ?? waResult.errors?.[0]?.error;
        toast.warning(`${totalSent} sent, ${totalFailed} failed`, {
          description: firstError ? `Reason: ${firstError}` : undefined,
        });
      } else {
        toast.success(`Sent to ${totalSent} recipient${totalSent === 1 ? "" : "s"}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleIsFuture) { toast.error("Pick a time at least a minute in the future"); return; }
    setSubmitting(true);
    try {
      const id = await persistDraft();
      if (!id) return;
      const { error } = await supabaseRpc(
        "communications_schedule" as never,
        { _communication_id: id, _scheduled_for: new Date(scheduledFor).toISOString() } as never,
      );
      if (error) throw new Error(error.message);
      toast.success(`Scheduled for ${new Date(scheduledFor).toLocaleString()}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b border-border space-y-1">
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Compose message
              <Badge variant="outline" className="ml-2 text-[10px] font-normal">Step {step} of 3</Badge>
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {step === 1 && "Pick which channels to deliver this message through."}
              {step === 2 && "Choose who should receive it."}
              {step === 3 && "Write the message and decide when to send it."}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable middle */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-3">

            {step === 1 && (
              <div className="space-y-3">
                <ChannelCard
                  selected={channels.includes("email")}
                  icon={<Mail className="h-4 w-4 mt-0.5 shrink-0" />}
                  title="Email"
                  description="Sent through Resend to every recipient with a verified email."
                  onClick={() => setChannels((p) => p.includes("email") ? p.filter((c) => c !== "email") : [...p, "email"])}
                />
                <ChannelCard
                  selected={channels.includes("whatsapp")}
                  icon={<MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />}
                  title="WhatsApp"
                  description="Saved with the message — actual WhatsApp send wires up in a later phase."
                  onClick={() => setChannels((p) => p.includes("whatsapp") ? p.filter((c) => c !== "whatsapp") : [...p, "whatsapp"])}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {RECIPIENTS.map((r) => {
                    const active = recipients.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRecipients((p) => p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id])}
                        className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                          active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={active} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium">{r.label}</div>
                          <div className="text-[11.5px] text-muted-foreground">{r.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom-selection attendee picker — only when "custom" is selected. */}
                {recipients.includes("custom") && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        value={attendeeQuery}
                        onChange={(e) => setAttendeeQuery(e.target.value)}
                        placeholder="Search attendees by name or email…"
                        className="h-8 text-[13px]"
                      />
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {customUserIds.length} selected
                      </Badge>
                    </div>
                    <ScrollArea className="h-44">
                      <div className="space-y-1 pr-2">
                        {attendeesLoading && attendeeOptions.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground text-center py-4">
                            Loading attendees…
                          </p>
                        ) : (() => {
                          const filtered = attendeeQuery
                            ? attendeeOptions.filter(
                                (a) =>
                                  a.name.toLowerCase().includes(attendeeQuery.toLowerCase()) ||
                                  a.email.toLowerCase().includes(attendeeQuery.toLowerCase()),
                              )
                            : attendeeOptions;
                          if (filtered.length === 0) {
                            return (
                              <p className="text-[12px] text-muted-foreground text-center py-4">
                                {attendeeOptions.length === 0
                                  ? "No registrations yet for this event."
                                  : "No attendees match that search."}
                              </p>
                            );
                          }
                          return filtered.slice(0, 200).map((a) => {
                            const checked = customUserIds.includes(a.user_id);
                            return (
                              <button
                                key={a.user_id}
                                type="button"
                                onClick={() => setCustomUserIds((p) =>
                                  p.includes(a.user_id) ? p.filter((x) => x !== a.user_id) : [...p, a.user_id],
                                )}
                                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 text-left"
                              >
                                <Checkbox checked={checked} className="shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">{a.email}</div>
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <div className="rounded-md bg-muted/40 p-3 flex items-center justify-between">
                  <span className="text-[12.5px] text-muted-foreground">Recipients selected</span>
                  <span className="text-[14px] font-semibold tabular-nums">
                    {resolving ? "…" : resolvedCount ?? 0}
                  </span>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {wantsEmail && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-[12px]">Email subject</Label>
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="A clear one-line summary…"
                        className="mt-1 h-9 text-[13px]"
                      />
                    </div>
                    <div>
                      <Label className="text-[12px]">Email body</Label>
                      <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Write the message… use the variable buttons below to personalise per recipient."
                        className="mt-1 min-h-[140px] text-[13px] resize-y"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Variables</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {COMMUNICATION_VARIABLES.map((v) => (
                          <button
                            key={v.token}
                            type="button"
                            onClick={() => insertVariable(v.token)}
                            className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted font-mono"
                            title={v.description}
                          >
                            {v.token}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {wantsEmail && wantsWhatsapp && <Separator />}

                {wantsWhatsapp && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[12px] flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" /> WhatsApp template
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={waSyncing}
                        onClick={async () => {
                          setWaSyncing(true);
                          try {
                            const { data: ev } = await supabase
                              .from("events")
                              .select("org_id")
                              .eq("id", eventId)
                              .maybeSingle();
                            const orgIdLocal = (ev as { org_id: string | null } | null)?.org_id;
                            if (!orgIdLocal) throw new Error("Event has no organization");

                            const { data, error } = await supabase.functions.invoke(
                              "whatsapp-sync-templates",
                              { body: { org_id: orgIdLocal } },
                            );
                            if (error) throw new Error(error.message);
                            const r = data as { synced: number; total: number };
                            toast.success(`Synced ${r.synced} of ${r.total} templates`);
                            setWaTemplates([]); // forces reload via the load effect
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Sync failed");
                          } finally {
                            setWaSyncing(false);
                          }
                        }}
                      >
                        {waSyncing ? "Syncing…" : "Sync from Meta"}
                      </Button>
                    </div>

                    {waLoadingTemplates ? (
                      <p className="text-[12px] text-muted-foreground">Loading templates…</p>
                    ) : waTemplates.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        No approved templates cached. Create + approve a template in Meta Business
                        Manager, then click <span className="font-medium">Sync from Meta</span>.
                      </p>
                    ) : (
                      <Select
                        value={waTemplate && waTemplateLanguage ? `${waTemplate}|${waTemplateLanguage}` : ""}
                        onValueChange={(v) => {
                          if (!v) { setWaTemplate(""); setWaTemplateLanguage("en"); return; }
                          const [n, l] = v.split("|");
                          setWaTemplate(n);
                          setWaTemplateLanguage(l);
                          setWaVars([]);
                        }}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder="Pick an approved template…" />
                        </SelectTrigger>
                        <SelectContent>
                          {waTemplates.map((t) => (
                            <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                              {t.name} ({t.language}){t.category ? ` — ${t.category}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {pickedTemplate && bodyTextOf(pickedTemplate) && (
                      <p className="text-[11.5px] text-muted-foreground italic">
                        "{bodyTextOf(pickedTemplate)}"
                      </p>
                    )}

                    {pickedTemplate && waVarCount > 0 && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          Body variables
                        </Label>
                        {Array.from({ length: waVarCount }).map((_, i) => (
                          <Input
                            key={i}
                            value={waVars[i] ?? ""}
                            onChange={(e) => {
                              const next = [...waVars];
                              next[i] = e.target.value;
                              setWaVars(next);
                            }}
                            placeholder={`{{${i + 1}}}`}
                            className="h-8 text-[12.5px]"
                          />
                        ))}
                      </div>
                    )}
                    {pickedTemplate && waVarCount === 0 && (
                      <p className="text-[11.5px] text-muted-foreground">
                        This template has no body variables — it will be sent as-is.
                      </p>
                    )}
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Delivery</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <DeliveryToggle
                      active={deliveryMode === "now"}
                      icon={<Send className="h-3.5 w-3.5" />}
                      title="Send now"
                      description="Dispatch as soon as you confirm."
                      onClick={() => setDeliveryMode("now")}
                    />
                    <DeliveryToggle
                      active={deliveryMode === "schedule"}
                      icon={<CalendarClock className="h-3.5 w-3.5" />}
                      title="Schedule"
                      description="Send automatically at a future time."
                      onClick={() => setDeliveryMode("schedule")}
                    />
                  </div>
                  {deliveryMode === "schedule" && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Send at</Label>
                        <Input
                          type="datetime-local"
                          value={scheduledFor}
                          onChange={(e) => setScheduledFor(e.target.value)}
                          className="mt-1 h-9 text-[13px]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setScheduledFor(p.value)}
                            className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-card hover:bg-muted/60 inline-flex items-center gap-1"
                          >
                            <Clock className="h-3 w-3" /> {p.label}
                          </button>
                        ))}
                      </div>
                      {scheduledFor && !scheduleIsFuture && (
                        <p className="text-[11.5px] text-destructive">
                          Pick a time at least one minute in the future.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="rounded-lg border border-border p-3 bg-muted/20">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Preview · {wantsEmail ? "Email" : "WhatsApp"}
                  </div>
                  {wantsEmail ? (
                    <>
                      <div className="text-[12.5px] font-medium">
                        {applyVariables(subject, previewCtx) || "(no subject)"}
                      </div>
                      <div className="text-[12px] text-muted-foreground whitespace-pre-wrap mt-1">
                        {applyVariables(body, previewCtx) || "(empty body)"}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 mt-2 italic">
                        Sample data:
                        {previewCtx.user_name      ? ` ${previewCtx.user_name}`        : " (unknown user)"}
                        {previewCtx.event_name     ? ` · ${previewCtx.event_name}`     : ""}
                        {previewCtx.event_date     ? ` · ${previewCtx.event_date}`     : ""}
                        {previewCtx.event_location ? ` · ${previewCtx.event_location}` : ""}
                      </div>
                    </>
                  ) : pickedTemplate ? (
                    <div className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                      {fillTemplate(bodyTextOf(pickedTemplate), waVars)}
                    </div>
                  ) : (
                    <div className="text-[12px] text-muted-foreground italic">
                      Pick a template to see the preview.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-2 sm:flex-row flex-row !mt-0">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button variant="outline" size="sm" onClick={() => setStep((s) => (s - 1) as Step)} disabled={submitting}>
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 3 && (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  disabled={submitting || (step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting || !subject.trim()}>
                    Save Draft
                  </Button>
                  {deliveryMode === "now" ? (
                    <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitting || !canSend}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Send Now
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleSchedule} disabled={submitting || !canSend || !scheduleIsFuture}>
                      <CalendarClock className="h-3.5 w-3.5 mr-1" /> Schedule
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send this communication?</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              This will deliver the message to all selected recipients via the chosen channels.
              You cannot recall it once sent.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-semibold tabular-nums">{resolvedCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Channels</span>
              <span className="flex items-center gap-1.5">
                {channels.map((ch) => (
                  <Badge key={ch} variant="secondary" className="text-[10px]">
                    <Check className="h-3 w-3 mr-0.5" /> {ch}
                  </Badge>
                ))}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={async () => { setConfirmOpen(false); await handleSendNow(); }} disabled={submitting}>
              <Send className="h-3.5 w-3.5 mr-1" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────
function ChannelCard({ selected, icon, title, description, onClick }: {
  selected: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <Checkbox checked={selected} className="mt-0.5" />
      {icon}
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{title}</div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

function DeliveryToggle({ active, icon, title, description, onClick }: {
  active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-[12.5px] transition-colors ${
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      {icon}
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fillTemplate(body: string, vars: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_match, n: string) => {
    const i = parseInt(n, 10) - 1;
    return vars[i] || `{{${n}}}`;
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
