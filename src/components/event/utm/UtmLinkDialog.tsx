/**
 * Create or edit a tracked (UTM) link for an event.
 *
 * Links are stored in `utm_links`, unique per event + source + medium +
 * campaign, so saving an existing combination updates it (label, content,
 * term, URL) instead of duplicating it. Changing source, medium or campaign
 * of an existing link creates a new link — clicks and registrations already
 * recorded stay attributed to the original combination.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { utmLinkUrl, type UtmLinkDraft } from "./utm-link-url";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SOURCES = ["email", "whatsapp", "linkedin", "twitter", "instagram", "facebook", "sms", "qr", "manual"];
const MEDIUMS = ["transactional", "broadcast", "organic", "paid", "referral", "copy"];

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

  // Reset the form each time the dialog opens (new link or a different edit).
  useEffect(() => {
    if (open) { setV(initial ?? defaults); setCopied(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (patch: Partial<UtmLinkDraft>) => setV((prev) => ({ ...prev, ...patch }));
  const valid = !!(v.utm_source.trim() && v.utm_medium.trim() && v.utm_campaign.trim());
  const url = useMemo(() => utmLinkUrl({ eventId, eventSlug, orgSlug }, v), [eventId, eventSlug, orgSlug, v]);
  const identityChanged = editing && initial && (
    initial.utm_source !== v.utm_source || initial.utm_medium !== v.utm_medium || initial.utm_campaign !== v.utm_campaign
  );

  // Keep any custom value of an edited link selectable.
  const sources = SOURCES.includes(v.utm_source) ? SOURCES : [v.utm_source, ...SOURCES];
  const mediums = MEDIUMS.includes(v.utm_medium) ? MEDIUMS : [v.utm_medium, ...MEDIUMS];

  const saveAndCopy = async () => {
    if (!valid || saving) return;
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
    setSaving(false);
    if (error) {
      toast.error("Couldn't save the link", { description: error.message });
      return;
    }
    onSaved?.();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(editing ? "Link updated and copied" : "Link saved and copied");
    } catch {
      toast.success(editing ? "Link updated" : "Link saved", { description: "Copy it from the field below." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* [&>*]:min-w-0 — DialogContent is a grid; without it the long URL widens
          the column and pushes the form and footer past the dialog edge. */}
      <DialogContent className="sm:max-w-xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> {editing ? "Edit tracked link" : "Create tracked link"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Share this link and every click and registration from it is attributed to these UTM values.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Source</Label>
            <Select value={v.utm_source} onValueChange={(s) => set({ utm_source: s })}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Medium</Label>
            <Select value={v.utm_medium} onValueChange={(m) => set({ utm_medium: m })}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{mediums.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px]">Campaign</Label>
            <Input value={v.utm_campaign} onChange={(e) => set({ utm_campaign: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. launch-email-1" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Content <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={v.utm_content ?? ""} onChange={(e) => set({ utm_content: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. cta-button" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Term <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={v.utm_term ?? ""} onChange={(e) => set({ utm_term: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. finance-leaders" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px]">Label <span className="text-muted-foreground">(optional, only you see this)</span></Label>
            <Input value={v.label ?? ""} onChange={(e) => set({ label: e.target.value })} className="h-9 text-[13px]" placeholder="e.g. June newsletter CTA" />
          </div>
        </div>

        {identityChanged && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            Changing source, medium or campaign creates a new link. Clicks and registrations already
            recorded stay with the original link.
          </p>
        )}

        <div className="space-y-1.5">
          <Label className="text-[11px]">Tracked link</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 text-[11px] font-mono bg-muted rounded-md px-3 py-2 truncate border border-border">{url}</code>
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" asChild title="Open link">
              <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={saveAndCopy} disabled={!valid || saving} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {saving ? "Saving…" : editing ? "Save changes & copy" : "Save & copy link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { UtmLinkDraft };
export default UtmLinkDialog;
