import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { toast } from "sonner";
import type {
  Communication,
  CommunicationChannel,
  CommunicationStatus,
  RecipientFilter,
  ResolvedRecipient,
} from "@/types/communications";

/**
 * useCommunications — list + realtime + CRUD helpers for an event OR
 * community's communications. Pass exactly one of `eventId` / `communityId`.
 */
export function useCommunications(
  scope: { eventId?: string | null; communityId?: string | null },
) {
  const eventId = scope.eventId ?? null;
  const communityId = scope.communityId ?? null;
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId && !communityId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      let q = supabase.from("communications" as never).select("*");
      if (eventId)     q = q.eq("event_id",     eventId);
      if (communityId) q = q.eq("community_id", communityId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error(`Failed to load communications: ${error.message}`);
        setLoading(false);
        return;
      }
      setItems((data ?? []) as unknown as Communication[]);
      setLoading(false);
    };
    load();
    const filter = eventId
      ? `event_id=eq.${eventId}`
      : `community_id=eq.${communityId}`;
    const channel = supabase
      .channel(`communications-${eventId ?? communityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communications", filter },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [eventId, communityId]);

  return { items, loading };
}

/**
 * resolveRecipients — preview count for the compose wizard.
 * Always rerun before dispatch so the displayed count matches what the
 * server will actually fan out to. Pass exactly one of `eventId` /
 * `communityId` — the hook picks the right RPC.
 */
export async function resolveRecipients(
  scope: { eventId?: string; communityId?: string },
  filter: RecipientFilter,
): Promise<ResolvedRecipient[]> {
  if (scope.communityId) {
    const { data, error } = await supabaseRpc(
      "communications_resolve_community_recipients" as never,
      { _community_id: scope.communityId, _filter: filter } as never,
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as ResolvedRecipient[];
  }
  if (!scope.eventId) throw new Error("scope must include eventId or communityId");
  const { data, error } = await supabaseRpc(
    "communications_resolve_recipients" as never,
    { _event_id: scope.eventId, _filter: filter } as never,
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as ResolvedRecipient[];
}

/**
 * createDraft — inserts a draft communication row. The compose dialog uses
 * this for both "Save Draft" and as the first step of "Send Now" (we always
 * persist the draft before invoking dispatch so partial-send failures still
 * leave a recoverable record).
 *
 * Pass exactly one of `event_id` / `community_id` — the DB enforces the
 * scope-XOR check.
 */
export async function createDraft(input: {
  org_id: string;
  event_id?: string | null;
  community_id?: string | null;
  channels: CommunicationChannel[];
  recipient_filter: RecipientFilter;
  subject: string;
  body_text: string;
  body_html?: string | null;
  whatsapp_template_name?: string | null;
  whatsapp_template_language?: string | null;
  whatsapp_template_variables?: { body?: string[]; header?: string[] } | null;
}): Promise<Communication> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Must be signed in to compose");

  const { data, error } = await supabase
    .from("communications" as never)
    .insert({
      org_id: input.org_id,
      event_id: input.event_id ?? null,
      community_id: input.community_id ?? null,
      channels: input.channels,
      recipient_filter: input.recipient_filter,
      subject: input.subject,
      body_text: input.body_text,
      body_html: input.body_html ?? null,
      whatsapp_template_name: input.whatsapp_template_name ?? null,
      whatsapp_template_language: input.whatsapp_template_language ?? null,
      whatsapp_template_variables: input.whatsapp_template_variables ?? null,
      status: "draft" satisfies CommunicationStatus,
      created_by: uid,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Communication;
}

export async function updateDraft(id: string, patch: Partial<Communication>): Promise<void> {
  const { error } = await supabase
    .from("communications" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCommunication(id: string): Promise<void> {
  const { error } = await supabase
    .from("communications" as never)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * dispatch — sends the communication to its resolved recipients via the
 * `communications_dispatch` RPC. The RPC is SECURITY DEFINER so it can fan
 * out into `communication_recipients` (write-protected by RLS).
 */
export async function dispatchCommunication(id: string): Promise<{
  recipient_count: number;
  channels: string[];
  sent_at: string;
}> {
  const { data, error } = await supabaseRpc(
    "communications_dispatch" as never,
    { _communication_id: id } as never,
  );
  if (error) throw new Error(error.message);
  return data as { recipient_count: number; channels: string[]; sent_at: string };
}


/**
 * scheduleCommunication — flips a draft (or failed) to `scheduled` with the
 * given send time. The pg_cron worker picks it up at the scheduled minute.
 */
export async function scheduleCommunication(id: string, scheduledFor: Date): Promise<void> {
  const { error } = await supabaseRpc(
    "communications_schedule" as never,
    { _communication_id: id, _scheduled_for: scheduledFor.toISOString() } as never,
  );
  if (error) throw new Error(error.message);
}

/**
 * unscheduleCommunication — drops a scheduled message back to draft so the
 * organizer can edit it before sending.
 */
export async function unscheduleCommunication(id: string): Promise<void> {
  const { error } = await supabaseRpc(
    "communications_unschedule" as never,
    { _communication_id: id } as never,
  );
  if (error) throw new Error(error.message);
}

/**
 * duplicateCommunication — clones the communication into a fresh draft.
 * Returns the new draft's id so the caller can open it in the composer.
 */
export async function duplicateCommunication(id: string): Promise<string> {
  const { data, error } = await supabaseRpc(
    "communications_duplicate" as never,
    { _communication_id: id } as never,
  );
  if (error) throw new Error(error.message);
  return data as string;
}


// ── Phase 3 ────────────────────────────────────────────────────────────────
import type { WhatsAppTemplate } from "@/types/communications";

/**
 * listWhatsAppTemplates — pulls the org's approved WhatsApp templates from
 * the local cache table. The cache is populated by the
 * `whatsapp-sync-templates` edge function; if it's empty here, prompt the
 * user to run a sync.
 */
export async function listWhatsAppTemplates(orgId: string): Promise<WhatsAppTemplate[]> {
  const { data, error } = await supabaseRpc(
    "whatsapp_templates_list" as never,
    { _org_id: orgId } as never,
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as WhatsAppTemplate[];
}

/**
 * syncWhatsAppTemplates — fires the `whatsapp-sync-templates` edge function
 * to refresh the local cache from Meta's API. The call is rejected unless
 * the caller is an org member of `orgId`.
 */
export async function syncWhatsAppTemplates(orgId: string): Promise<{ synced: number; total: number }> {
  const { data, error } = await supabase.functions.invoke("whatsapp-sync-templates", {
    body: { org_id: orgId },
  });
  if (error) throw new Error(error.message);
  return data as { synced: number; total: number };
}

/**
 * sendWhatsApp — invokes the `send-whatsapp` edge function for the comm.
 * The edge function reads pending recipient rows and pushes them to Meta.
 * Call this AFTER `dispatchCommunication` returns successfully.
 */
export async function sendWhatsApp(communicationId: string): Promise<{
  sent: number; failed: number; errors: Array<{ recipient_id: string; error: string }>;
}> {
  const { data, error } = await supabase.functions.invoke("send-whatsapp", {
    body: { communication_id: communicationId },
  });
  if (error) throw new Error(error.message);
  return data as { sent: number; failed: number; errors: Array<{ recipient_id: string; error: string }> };
}


/**
 * retryFailedRecipients — resets failed recipient rows for a given channel
 * back to `pending`, then (for whatsapp) re-invokes the send-whatsapp edge
 * function to ship them again. Email retry only resets state for now —
 * the email provider integration is layered on top in a later phase.
 */
export async function retryFailedRecipients(
  communicationId: string,
  channel: "email" | "whatsapp" = "whatsapp",
): Promise<{ reset: number; sent?: number; failed?: number }> {
  const { data: resetRaw, error: resetErr } = await supabaseRpc(
    "communications_retry_failed" as never,
    { _communication_id: communicationId, _channel: channel } as never,
  );
  if (resetErr) throw new Error(resetErr.message);
  const reset = (resetRaw as number) ?? 0;
  if (reset === 0) return { reset };

  if (channel === "whatsapp") {
    const wa = await sendWhatsApp(communicationId);
    return { reset, sent: wa.sent, failed: wa.failed };
  }
  return { reset };
}
