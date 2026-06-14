import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Mail, Send, MessageSquare, Search, Check, AlertCircle, CalendarClock, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type CommunicationChannel,
  type RecipientFilter,
  type RecipientType,
  type ResolvedRecipient,
  type WhatsAppTemplate,
  type WhatsAppTemplateBinding,
  COMMUNICATION_VARIABLES,
  RECIPIENT_TYPE_LABELS,
  RECIPIENT_TYPES_BY_SCOPE,
} from "@/types/communications";
import {
  createDraft,
  dispatchCommunication,
  resolveRecipients,
  scheduleCommunication,
  updateDraft,
  listWhatsAppTemplates,
  syncWhatsAppTemplates,
  sendWhatsApp,
} from "@/hooks/useCommunications";
import { applyVariables, invalidTokensForScope, type SubstitutionContext } from "@/lib/communications/substitute";

interface AttendeeOption {
  user_id: string | null;
  name: string;
  email: string;
}

interface ComposeMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Event the compose flow is scoped to. Pass exactly one of eventId / communityId. */
  eventId?: string;
  /** Community the compose flow is scoped to. Pass exactly one of eventId / communityId. */
  communityId?: string;
  orgId: string;
  /**
   * Event start datetime (ISO string). When provided, the schedule presets
   * include event-relative options like "1 hour before event".
   */
  eventDate?: string | null;
  /** Optional: editing an existing draft. Loads its values into the wizard. */
  draftId?: string | null;
  /** Called after a successful send / draft save so the parent list refetches. */
  onSent?: () => void;
}

type Step = 1 | 2 | 3;

export function ComposeMessageDialog({
  open, onOpenChange, eventId, communityId, orgId, eventDate, draftId, onSent,
}: ComposeMessageDialogProps) {
  const scope: "event" | "community" = communityId ? "community" : "event";
  const availableTypes = RECIPIENT_TYPES_BY_SCOPE[scope];
  const defaultType: RecipientType = scope === "community" ? "all_members" : "all_attendees";

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — channels
  const [channels, setChannels] = useState<CommunicationChannel[]>(["email"]);

  // Step 2 — recipient filter
  const [types, setTypes] = useState<RecipientType[]>([defaultType]);
  const [customUserIds, setCustomUserIds] = useState<string[]>([]);
  const [attendeeOptions, setAttendeeOptions] = useState<AttendeeOption[]>([]);
  const [attendeeQuery, setAttendeeQuery] = useState("");

  // Live recipient count (resolved on demand from the RPC)
  const [resolvedCount, setResolvedCount] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  // Step 3 — message content
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Step 3 — delivery mode (now vs schedule)
  const [deliveryMode, setDeliveryMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState<string>("");  // datetime-local value

  // Step 3 — WhatsApp template binding (only used when channels includes 'whatsapp')
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waLoading, setWaLoading] = useState(false);
  const [waSyncing, setWaSyncing] = useState(false);
  const [waTemplateName, setWaTemplateName] = useState<string | null>(null);
  const [waTemplateLanguage, setWaTemplateLanguage] = useState<string | null>(null);
  const [waBodyVars, setWaBodyVars] = useState<string[]>([]);

  // Preview substitution context — populated once per dialog open.
  // Variables not present in this object stay as `{{token}}` so the organizer
  // can spot which ones haven't been wired for this scope.
  const [previewCtx, setPreviewCtx] = useState<SubstitutionContext>({});

  const filter: RecipientFilter = useMemo(
    () => ({
      types,
      ...(types.includes("custom") && customUserIds.length > 0
        ? { user_ids: customUserIds }
        : {}),
    }),
    [types, customUserIds],
  );

  // Reset / hydrate the wizard whenever it opens.
  useEffect(() => {
    if (!open) {
      // Drop cached lookups so reopening for a different event / community
      // doesn't show the previous one's attendees or templates.
      setAttendeeOptions([]);
      setAttendeeQuery("");
      setWhatsappTemplates([]);
      setPreviewCtx({});
      return;
    }
    if (!draftId) {
      setStep(1);
      setChannels(["email"]);
      setTypes([defaultType]);
      setCustomUserIds([]);
      setSubject("");
      setBody("");
      setResolvedCount(null);
      setDeliveryMode("now");
      setScheduledFor("");
      setWaTemplateName(null);
      setWaTemplateLanguage(null);
      setWaBodyVars([]);
      return;
    }
    // Hydrate from existing draft.
    (async () => {
      const { data } = await supabase
        .from("communications" as never)
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (!data) return;
      const d = data as unknown as {
        channels: CommunicationChannel[];
        recipient_filter: RecipientFilter;
        subject: string;
        body_text: string;
        scheduled_for: string | null;
        status: string;
        whatsapp_template_name: string | null;
        whatsapp_template_language: string | null;
        whatsapp_template_variables: WhatsAppTemplateBinding | null;
      };
      setChannels(d.channels);
      setTypes(d.recipient_filter.types ?? [defaultType]);
      setCustomUserIds(d.recipient_filter.user_ids ?? []);
      setSubject(d.subject);
      setBody(d.body_text);
      setWaTemplateName(d.whatsapp_template_name);
      setWaTemplateLanguage(d.whatsapp_template_language);
      setWaBodyVars(d.whatsapp_template_variables?.body ?? []);
      if (d.status === "scheduled" && d.scheduled_for) {
        setDeliveryMode("schedule");
        const dt = new Date(d.scheduled_for);
        const pad = (n: number) => n.toString().padStart(2, "0");
        setScheduledFor(
          `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
        );
      } else {
        setDeliveryMode("now");
        setScheduledFor("");
      }
      setStep(1);
    })();
  }, [open, draftId, defaultType]);

  // Load attendee/member options when "custom" is selected (one fetch per dialog open).
  useEffect(() => {
    if (!open || !types.includes("custom") || attendeeOptions.length > 0) return;
    let cancelled = false;
    (async () => {
      if (scope === "community" && communityId) {
        // Pull active community members joined to profiles for display name.
        const { data } = await supabase
          .from("community_members")
          .select("user_id, role, profiles:profiles!inner(first_name, last_name, display_name)")
          .eq("community_id", communityId)
          .eq("status", "active")
          .limit(500);
        if (cancelled || !data) return;
        const opts: AttendeeOption[] = (data as Array<{
          user_id: string;
          profiles: { first_name: string | null; last_name: string | null; display_name: string | null } | null;
        }>).map((r) => ({
          user_id: r.user_id,
          name:
            [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ") ||
            r.profiles?.display_name ||
            r.user_id.slice(0, 8),
          email: "—",
        }));
        setAttendeeOptions(opts);
        return;
      }

      if (eventId) {
        const { data } = await supabase
          .from("registrations")
          .select("user_id, name, email, first_name, last_name")
          .eq("event_id", eventId)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(500);
        if (cancelled || !data) return;
        const opts: AttendeeOption[] = (data as Array<{
          user_id: string | null;
          name: string | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
        }>).map((r) => ({
          user_id: r.user_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.name || r.email,
          email: r.email,
        })).filter((r): r is AttendeeOption => !!r.user_id);
        setAttendeeOptions(opts);
      }
    })();
    return () => { cancelled = true; };
  }, [open, types, eventId, communityId, scope, attendeeOptions.length]);

  // Load WhatsApp templates from local cache when the WhatsApp channel is enabled.
  useEffect(() => {
    if (!open || !channels.includes("whatsapp") || whatsappTemplates.length > 0) return;
    let cancelled = false;
    setWaLoading(true);
    listWhatsAppTemplates(orgId)
      .then((rows) => { if (!cancelled) setWhatsappTemplates(rows); })
      .catch((err: Error) => { if (!cancelled) toast.error(err.message); })
      .finally(() => { if (!cancelled) setWaLoading(false); });
    return () => { cancelled = true; };
  }, [open, channels, orgId, whatsappTemplates.length]);

  // Reset variable inputs when the picked template changes (different
  // templates may have different variable counts).
  const pickedTemplate = useMemo<WhatsAppTemplate | null>(
    () =>
      whatsappTemplates.find(
        (t) => t.name === waTemplateName && t.language === waTemplateLanguage,
      ) ?? null,
    [whatsappTemplates, waTemplateName, waTemplateLanguage],
  );

  useEffect(() => {
    if (!pickedTemplate) return;
    setWaBodyVars((prev) => {
      const next = [...prev];
      while (next.length < pickedTemplate.variable_count) next.push("");
      next.length = pickedTemplate.variable_count;
      return next;
    });
  }, [pickedTemplate]);

  // Resolve recipient count when entering step 2 or whenever the filter changes.
  useEffect(() => {
    if (!open || step < 2) return;
    let cancelled = false;
    setResolving(true);
    resolveRecipients({ eventId, communityId }, filter)
      .then((rows) => { if (!cancelled) setResolvedCount(rows.length); })
      .catch((err: Error) => { if (!cancelled) toast.error(err.message); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [open, step, eventId, communityId, filter]);

  // Load preview substitution context once per dialog open. The context is
  // a "what would the first recipient see" sample — current user's profile
  // for {{user_name}}, the scoped event / community for everything else.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const ctx: SubstitutionContext = {};

      // {{user_name}} from the signed-in user's profile.
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

      if (eventId) {
        const { data: ev } = await supabase
          .from("events")
          .select("title, date, location, venue")
          .eq("id", eventId)
          .maybeSingle();
        if (ev) {
          const evt = ev as { title: string; date: string; location: string | null; venue: string | null };
          ctx.event_name     = evt.title;
          ctx.event_date     = new Date(evt.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          ctx.event_location = evt.venue || evt.location || null;
        }
      }

      if (communityId) {
        const { data: comm } = await supabase
          .from("communities" as never)
          .select("name")
          .eq("id", communityId)
          .maybeSingle();
        const c = comm as { name: string | null } | null;
        if (c) ctx.community_name = c.name;
      }

      if (!cancelled) setPreviewCtx(ctx);
    })();
    return () => { cancelled = true; };
  }, [open, eventId, communityId]);

  const toggleChannel = (ch: CommunicationChannel) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    );
  };

  const toggleType = (t: RecipientType) => {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleCustomUser = (userId: string) => {
    setCustomUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const filteredAttendeeOptions = attendeeQuery
    ? attendeeOptions.filter(
        (a) =>
          a.name.toLowerCase().includes(attendeeQuery.toLowerCase()) ||
          a.email.toLowerCase().includes(attendeeQuery.toLowerCase()),
      )
    : attendeeOptions;

  const insertVariable = (token: string) => {
    setBody((prev) => `${prev}${prev.length > 0 && !prev.endsWith(" ") ? " " : ""}${token}`);
  };

  // ── Schedule presets ──────────────────────────────────────────────────────
  const formatLocal = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const presets = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    const now = new Date();

    const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    out.push({ label: "In 1 hour", value: formatLocal(inOneHour) });

    const tomorrow9 = new Date(now);
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    out.push({ label: "Tomorrow 9 AM", value: formatLocal(tomorrow9) });

    if (eventDate) {
      const ev = new Date(eventDate);
      const dayBefore = new Date(ev.getTime() - 24 * 60 * 60 * 1000);
      const hourBefore = new Date(ev.getTime() - 60 * 60 * 1000);
      if (dayBefore > now) {
        out.push({ label: "1 day before event", value: formatLocal(dayBefore) });
      }
      if (hourBefore > now) {
        out.push({ label: "1 hour before event", value: formatLocal(hourBefore) });
      }
    }
    return out;
  }, [eventDate]);

  // datetime-local must be in the future for scheduling to be valid.
  const scheduleIsFuture = useMemo(() => {
    if (!scheduledFor) return false;
    const dt = new Date(scheduledFor);
    return !isNaN(dt.getTime()) && dt.getTime() > Date.now() + 60_000; // require >1min ahead
  }, [scheduledFor]);

  const canProceed1 = channels.length > 0;
  const canProceed2 =
    types.length > 0 &&
    !(types.includes("custom") && types.length === 1 && customUserIds.length === 0) &&
    (resolvedCount ?? 0) > 0;
  const wantsEmail    = channels.includes("email");
  const wantsWhatsapp = channels.includes("whatsapp");
  const waReady = !wantsWhatsapp || (
    !!waTemplateName &&
    !!waTemplateLanguage &&
    waBodyVars.length === (pickedTemplate?.variable_count ?? 0) &&
    waBodyVars.every((v) => v.trim().length > 0)
  );
  const emailReady = !wantsEmail || (subject.trim().length > 0 && body.trim().length > 0);

  // Phase 5.2 — flag tokens that won't substitute for the current scope so the
  // organizer can fix them before sending. Out-of-scope tokens are stripped at
  // render time, so leaving them in is recoverable but ugly; we still want to
  // call attention to them here.
  const invalidTokens = useMemo(() => {
    if (!wantsEmail) return [] as string[];
    const merged = `${subject}\n${body}`;
    return invalidTokensForScope(merged, scope);
  }, [wantsEmail, subject, body, scope]);

  const canSend = canProceed1 && canProceed2 && emailReady && waReady;

  const persistAndDispatch = async (mode: "draft" | "send" | "schedule") => {
    setSubmitting(true);
    try {
      let id = draftId;
      const waBinding: WhatsAppTemplateBinding | null = wantsWhatsapp && waTemplateName
        ? { body: waBodyVars }
        : null;

      if (id) {
        await updateDraft(id, {
          channels,
          recipient_filter: filter,
          subject: subject.trim(),
          body_text: body.trim(),
          whatsapp_template_name: wantsWhatsapp ? waTemplateName : null,
          whatsapp_template_language: wantsWhatsapp ? waTemplateLanguage : null,
          whatsapp_template_variables: waBinding,
        });
      } else {
        const created = await createDraft({
          org_id: orgId,
          event_id: eventId ?? null,
          community_id: communityId ?? null,
          channels,
          recipient_filter: filter,
          subject: subject.trim(),
          body_text: body.trim(),
          whatsapp_template_name: wantsWhatsapp ? waTemplateName : null,
          whatsapp_template_language: wantsWhatsapp ? waTemplateLanguage : null,
          whatsapp_template_variables: waBinding,
        });
        id = created.id;
      }

      if (mode === "draft") {
        toast.success("Draft saved");
        onOpenChange(false);
        onSent?.();
        return;
      }

      if (mode === "schedule") {
        if (!scheduleIsFuture) {
          toast.error("Pick a time at least a minute in the future");
          return;
        }
        await scheduleCommunication(id!, new Date(scheduledFor));
        toast.success(`Scheduled for ${new Date(scheduledFor).toLocaleString()}`);
        onOpenChange(false);
        onSent?.();
        return;
      }

      // Phase 1+2 dispatch — fans out recipient rows + marks email as sent.
      const result = await dispatchCommunication(id!);

      // Phase 3 — push WhatsApp template messages to Meta for any pending rows.
      if (wantsWhatsapp) {
        try {
          const wa = await sendWhatsApp(id!);
          if (wa.failed > 0) {
            toast.error(
              `Sent to ${result.recipient_count} recipient${result.recipient_count === 1 ? "" : "s"} — ` +
              `${wa.sent} WhatsApp delivered, ${wa.failed} failed`,
            );
          } else {
            toast.success(
              `Sent to ${result.recipient_count} recipient${result.recipient_count === 1 ? "" : "s"} ` +
              `(${wa.sent} via WhatsApp)`,
            );
          }
        } catch (err) {
          toast.error(
            `Email dispatched but WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        toast.success(
          `Sent to ${result.recipient_count} recipient${result.recipient_count === 1 ? "" : "s"}`,
        );
      }

      onOpenChange(false);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  };

  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b border-border space-y-1">
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Compose message
              <Badge variant="outline" className="ml-2 text-[10px] font-normal">
                Step {step} of 3
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {step === 1 && "Pick which channels to deliver this message through."}
              {step === 2 && "Choose who should receive it."}
              {step === 3 && "Write the subject and body. Variables get filled in per recipient."}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable middle section — header stays pinned at the top, footer
              at the bottom. Without this, step 3 (subject + body + variables +
              delivery + schedule + preview + warning) overflows the viewport
              and the Send button drops below the fold on smaller screens. */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

          {step === 1 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => toggleChannel("email")}
                className={`w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                  channels.includes("email") ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <Checkbox checked={channels.includes("email")} className="mt-0.5" />
                <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-medium">Email</div>
                  <div className="text-[12px] text-muted-foreground">
                    Sent through your verified Resend domain to every recipient with an email on file.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleChannel("whatsapp")}
                className={`w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                  channels.includes("whatsapp") ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <Checkbox checked={channels.includes("whatsapp")} className="mt-0.5" />
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-medium">WhatsApp</div>
                  <div className="text-[12px] text-muted-foreground">
                    Sent through your Meta WhatsApp Business account using a pre-approved template.
                  </div>
                </div>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableTypes.map((t) => {
                  const meta = RECIPIENT_TYPE_LABELS[t];
                  const active = types.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox checked={active} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{meta.label}</div>
                        <div className="text-[11.5px] text-muted-foreground">{meta.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {types.includes("custom") && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
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
                      {filteredAttendeeOptions.length === 0 && (
                        <p className="text-[12px] text-muted-foreground text-center py-4">
                          {attendeeOptions.length === 0
                            ? "Loading attendees…"
                            : "No attendees match that search."}
                        </p>
                      )}
                      {filteredAttendeeOptions.slice(0, 100).map((a) => (
                        <button
                          key={a.user_id ?? a.email}
                          type="button"
                          onClick={() => a.user_id && toggleCustomUser(a.user_id)}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 text-left"
                        >
                          <Checkbox
                            checked={!!a.user_id && customUserIds.includes(a.user_id)}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{a.email}</div>
                          </div>
                        </button>
                      ))}
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
            <div className="space-y-3">
              {/* Email content — only when channel includes 'email'. */}
              {wantsEmail && (
                <>
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
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Variables
                    </Label>
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
                </>
              )}

              {wantsEmail && wantsWhatsapp && <Separator />}

              {/* WhatsApp template — only when channel includes 'whatsapp'. */}
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
                          const r = await syncWhatsAppTemplates(orgId);
                          toast.success(`Synced ${r.synced} of ${r.total} templates`);
                          // Reload picker
                          setWhatsappTemplates([]);
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

                  {waLoading ? (
                    <p className="text-[12px] text-muted-foreground">Loading templates…</p>
                  ) : whatsappTemplates.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      No approved templates cached. Approve a template in Meta Business
                      Manager and click <span className="font-medium">Sync from Meta</span>.
                    </p>
                  ) : (
                    <select
                      className="w-full h-9 text-[13px] rounded-md border border-input bg-background px-2"
                      value={waTemplateName && waTemplateLanguage ? `${waTemplateName}|${waTemplateLanguage}` : ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setWaTemplateName(null);
                          setWaTemplateLanguage(null);
                          return;
                        }
                        const [n, l] = e.target.value.split("|");
                        setWaTemplateName(n);
                        setWaTemplateLanguage(l);
                      }}
                    >
                      <option value="">Pick a template…</option>
                      {whatsappTemplates.map((t) => (
                        <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                          {t.name} ({t.language}) — {t.category ?? ""}
                        </option>
                      ))}
                    </select>
                  )}

                  {pickedTemplate && pickedTemplate.variable_count > 0 && (
                    <div className="space-y-2 pt-2">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Body variables
                      </Label>
                      {Array.from({ length: pickedTemplate.variable_count }).map((_, i) => (
                        <Input
                          key={i}
                          value={waBodyVars[i] ?? ""}
                          onChange={(e) => {
                            const next = [...waBodyVars];
                            next[i] = e.target.value;
                            setWaBodyVars(next);
                          }}
                          placeholder={`{{${i + 1}}}`}
                          className="h-8 text-[12.5px]"
                        />
                      ))}
                    </div>
                  )}
                  {pickedTemplate && pickedTemplate.variable_count === 0 && (
                    <p className="text-[11.5px] text-muted-foreground">
                      This template has no body variables — it will be sent as-is.
                    </p>
                  )}
                </div>
              )}

              <Separator />

              {/* Delivery mode toggle: Send Now vs Schedule */}
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Delivery
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode("now")}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-[12.5px] transition-colors ${
                      deliveryMode === "now" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    <div>
                      <div className="font-medium">Send now</div>
                      <div className="text-[11px] text-muted-foreground">
                        Dispatch as soon as you confirm.
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode("schedule")}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-left text-[12.5px] transition-colors ${
                      deliveryMode === "schedule" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    <div>
                      <div className="font-medium">Schedule</div>
                      <div className="text-[11px] text-muted-foreground">
                        Send automatically at a future time.
                      </div>
                    </div>
                  </button>
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
                    {presets.length > 0 && (
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
                    )}
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
                  Preview · {channels.includes("email") ? "Email" : "WhatsApp"}
                </div>
                <div className="text-[12.5px] font-medium">
                  {applyVariables(subject, previewCtx) || "(no subject)"}
                </div>
                <div className="text-[12px] text-muted-foreground whitespace-pre-wrap mt-1">
                  {applyVariables(body, previewCtx) || "(empty body)"}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-2 italic">
                  Sample data: {previewCtx.user_name ? `${previewCtx.user_name}` : "(unknown user)"}
                  {previewCtx.event_name ? ` · ${previewCtx.event_name}` : ""}
                  {previewCtx.community_name ? ` · ${previewCtx.community_name}` : ""}
                </div>
              </div>

              {invalidTokens.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-[11.5px] text-muted-foreground leading-snug">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      {invalidTokens.length === 1 ? "1 token won't substitute" : `${invalidTokens.length} tokens won't substitute`}
                    </p>
                    <p>
                      {invalidTokens.map((t) => (
                        <span key={t} className="font-mono mr-1">{`{{${t}}}`}</span>
                      ))}
                      {scope === "community"
                        ? " — only user_name and community_name resolve on community sends."
                        : " — only user_name, event_name, event_date, and event_location resolve on event sends."}
                      {" "}They'll be stripped from the recipient's message; remove or rename them above to silence this warning.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          </div>
          {/* /scrollable middle */}

          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-2 sm:flex-row flex-row !mt-0">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  disabled={submitting}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 3 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  disabled={
                    submitting ||
                    (step === 1 && !canProceed1) ||
                    (step === 2 && !canProceed2)
                  }
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => persistAndDispatch("draft")}
                    disabled={submitting || subject.trim().length === 0}
                  >
                    Save Draft
                  </Button>
                  {deliveryMode === "now" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setConfirmOpen(true)}
                      disabled={submitting || !canSend}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Send Now
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => persistAndDispatch("schedule")}
                      disabled={submitting || !canSend || !scheduleIsFuture}
                    >
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
              You cannot recall it once it has been sent.
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
            <Button
              size="sm"
              onClick={async () => {
                setConfirmOpen(false);
                await persistAndDispatch("send");
              }}
              disabled={submitting}
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ComposeMessageDialog;
