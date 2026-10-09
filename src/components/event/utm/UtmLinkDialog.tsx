/**
 * Create or edit a tracked (UTM) link for an event.
 *
 * Links are stored in `utm_links`, unique per event + source + medium +
 * campaign, so saving an existing combination updates it (label, content,
 * term, URL) instead of duplicating it. Changing source, medium or campaign
 * of an existing link creates a new link — clicks and registrations already
 * recorded stay attributed to the original combination.
 *
 * Saving is a convenience, not a requirement: tracking is carried by the URL
 * itself, so if the link can't be stored (e.g. the database update that
 * grants access to `utm_links` hasn't been run) it is still copied and still
 * tracks clicks and registrations — the organiser is told it wasn't saved.
 *
 * The link can be shared with a partner (agency) in the same step: enter
 * their email and they get a dashboard limited to this link's participants.
 *
 * Phones get a full-screen sheet with the actions pinned at the bottom;
 * larger screens get a centred dialog.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Handshake, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { utmLinkUrl, type UtmLinkDraft } from "./utm-link-url";
import { UTM_MEDIUMS, UTM_SOURCES, withExtras } from "./utm-options";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_PARTNER_PERMISSIONS, type PartnerPermissions } from "@/lib/utm/partner-access";
import { PartnerEmailField, PartnerPermissionFields, isEmail } from "./UtmPartnerFields";
import { shareAndInvite } from "./UtmPartnersSection";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// 16px text on phones stops iOS Safari zooming into a focused field.
const FIELD = "h-11 sm:h-9 text-base sm:text-[13px]";
const LABEL = "text-[12px] sm:text-[11px]";

export function UtmLinkDialog({
  open, onOpenChange, eventId, eventSlug, orgSlug, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventSlug?: string | null;
  orgSlug?: string | null;
  /** Prefill to edit an existing link; omit to create a new one. */
  initial?: UtmLinkDraft | null;
  onSaved?: () => void;
}) {
  const editing = !!initial;
  const defaults: UtmLinkDraft = {
    utm_source: "email",
    utm_medium: "transactional",
    utm_campaign: eventSlug || eventId.slice(0, 8),
    utm_content: "",
    utm_term: "",
    label: "",
  };
  const [v, setV] = useState<UtmLinkDraft>(initial ?? defaults);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerPerms, setPartnerPerms] = useState<PartnerPermissions>(DEFAULT_PARTNER_PERMISSIONS);

  // Reset the form each time the dialog opens (new link or a different edit).
  useEffect(() => {
    if (open) { setV(initial ?? defaults); setCopied(false); setPartnerEmail(""); setPartnerPerms(DEFAULT_PARTNER_PERMISSIONS); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (patch: Partial<UtmLinkDraft>) => { setV((prev) => ({ ...prev, ...patch })); setCopied(false); };
  const valid = !!(v.utm_source.trim() && v.utm_medium.trim() && v.utm_campaign.trim());
  const url = useMemo(() => utmLinkUrl({ eventId, eventSlug, orgSlug }, v), [eventId, eventSlug, orgSlug, v]);
  const identityChanged = editing && initial && (
    initial.utm_source !== v.utm_source || initial.utm_medium !== v.utm_medium || initial.utm_campaign !== v.utm_campaign
  );

  // Keep any custom value of an edited link selectable.
  const sources = withExtras(UTM_SOURCES, [v.utm_source]);
  const mediums = withExtras(UTM_MEDIUMS, [v.utm_medium]);

  const sharing = partnerEmail.trim() !== "";
  const saveAndCopy = async () => {
    if (!valid || saving) return;
    if (sharing && !isEmail(partnerEmail)) {
      toast.error("Check the partner's email", { description: "Enter a valid email address, or clear the field to save without sharing." });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("utm_links" as never)
      .upsert({
        event_id: eventId,
        utm_source: v.utm_source.trim(),
        utm_medium: v.utm_medium.trim(),
        utm_campaign: v.utm_campaign.trim(),
        utm_content: v.utm_content?.trim() || null,
        utm_term: v.utm_term?.trim() || null,
        label: v.label?.trim() || null,
        url,
      } as never, { onConflict: "event_id,utm_source,utm_medium,utm_campaign" });
    const saved = !error;
    // Share only once the link exists — the database checks the link belongs to the event.
    if (sharing && !saved) {
      toast.error("Not shared with the partner", {
        description: "A link has to be saved to your list before it can be shared. Once the database update below is done, save it again with the partner's email.",
        duration: 12_000,
      });
    } else if (sharing) {
      const shared = await shareAndInvite(
        eventId,
        { utm_source: v.utm_source.trim(), utm_medium: v.utm_medium.trim(), utm_campaign: v.utm_campaign.trim() },
        partnerEmail, partnerPerms, user?.email,
      );
      if (shared) setPartnerEmail("");
    }
    setSaving(false);
    if (saved) onSaved?.();

    let copiedNow = false;
    try {
      await navigator.clipboard.writeText(url);
      copiedNow = true;
      setCopied(true);
    } catch { /* the link stays selectable in the field below */ }

    if (saved) {
      if (copiedNow) toast.success(editing ? "Link updated and copied" : "Link saved and copied");
      else toast.success(editing ? "Link updated" : "Link saved", { description: "Copy it from the field below." });
      return;
    }
    // Not stored, but the link itself is complete and tracks as normal.
    const denied = error?.code === "42501" || /permission denied/i.test(error?.message ?? "");
    toast.warning(copiedNow ? "Link copied — it works, but wasn't added to your saved list" : "Your link works, but wasn't added to your saved list", {
      description:
        (copiedNow ? "" : "Copy it from the field below. ") +
        "Clicks and registrations from it are tracked as usual and will show in the breakdown. " +
        (denied
          ? "To keep links under “Saved UTM links”, run supabase/RUN_ME_pending_updates.sql once in the Supabase SQL Editor."
          : `Reason: ${error?.message ?? "unknown error"}`),
      duration: 15_000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:h-auto sm:max-h-[92vh] sm:w-[96vw] sm:max-w-xl sm:rounded-lg sm:border">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border sm:border-0 text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base pr-8">
            <Link2 className="h-4 w-4 shrink-0" /> {editing ? "Edit tracked link" : "Create tracked link"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Share this link and every click and registration from it is attributed to these UTM values.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label className={LABEL}>Source</Label>
              <Select value={v.utm_source} onValueChange={(s) => set({ utm_source: s })}>
                <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className={LABEL}>Medium</Label>
              <Select value={v.utm_medium} onValueChange={(m) => set({ utm_medium: m })}>
                <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                <SelectContent>{mediums.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 min-w-0">
              <Label className={LABEL}>Campaign</Label>
              <Input value={v.utm_campaign} onChange={(e) => set({ utm_campaign: e.target.value })} className={FIELD} placeholder="e.g. launch-email-1" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className={LABEL}>Content <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={v.utm_content ?? ""} onChange={(e) => set({ utm_content: e.target.value })} className={FIELD} placeholder="e.g. cta-button" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className={LABEL}>Term <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={v.utm_term ?? ""} onChange={(e) => set({ utm_term: e.target.value })} className={FIELD} placeholder="e.g. finance-leaders" />
            </div>
            <div className="space-y-1.5 sm:col-span-2 min-w-0">
              <Label className={LABEL}>Label <span className="text-muted-foreground">(optional, only you see this)</span></Label>
              <Input value={v.label ?? ""} onChange={(e) => set({ label: e.target.value })} className={FIELD} placeholder="e.g. June newsletter CTA" />
            </div>
          </div>

          {identityChanged && (
            <p className="text-[12px] sm:text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              Changing source, medium or campaign creates a new link. Clicks and registrations already
              recorded stay with the original link.
            </p>
          )}

          <div className="space-y-1.5 min-w-0">
            <Label className={LABEL}>Tracked link</Label>
            <div className="flex items-start gap-2 min-w-0">
              {/* Wraps on phones so the whole link is readable; truncates on larger screens. */}
              <code className="flex-1 min-w-0 text-[12px] sm:text-[11px] font-mono bg-muted rounded-md px-3 py-2 border border-border break-all sm:break-normal sm:truncate">{url}</code>
              <Button
                size="icon" variant="ghost" className="h-10 w-10 sm:h-9 sm:w-9 shrink-0" title="Copy link" aria-label="Copy link"
                disabled={!valid}
                onClick={() => {
                  navigator.clipboard.writeText(url).then(
                    () => toast.success("Link copied"),
                    () => toast.error("Couldn't copy", { description: "Select the link and copy it manually." }),
                  );
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-10 w-10 sm:h-9 sm:w-9 shrink-0" asChild title="Open link">
                <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open link"><ExternalLink className="h-4 w-4" /></a>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3 mb-1">
            <div className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary shrink-0" />
              <p className="text-[13px] font-medium leading-tight">Share with a partner</p>
            </div>
            <p className="text-[12px] sm:text-[11px] text-muted-foreground -mt-1">
              Working with an agency? Add their email and they get a Partner dashboard for this link only —
              they never see other links or the rest of your event.
            </p>
            <PartnerEmailField value={partnerEmail} onChange={setPartnerEmail} id="link-partner-email" optional />
            {sharing && <PartnerPermissionFields value={partnerPerms} onChange={setPartnerPerms} idPrefix="link" />}
          </div>
        </div>

        <div className="shrink-0 border-t border-border sm:border-0 bg-background px-4 sm:px-6 py-3 sm:py-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" className="h-11 sm:h-9 text-[14px] sm:text-[13px]" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={saveAndCopy} disabled={!valid || saving} className="h-11 sm:h-9 gap-1.5 text-[14px] sm:text-[13px]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {saving ? "Saving…" : sharing ? "Save, copy & share" : copied ? "Copied" : editing ? "Save changes & copy" : "Save & copy link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { UtmLinkDraft };
export default UtmLinkDialog;
