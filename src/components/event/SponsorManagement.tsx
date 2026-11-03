import { useState, useEffect, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Award, ExternalLink, Users as UsersIcon, Copy, X, GripVertical, Search, Megaphone, Download, Mail, Share2 } from "lucide-react";
import { logger, supabaseRpc } from "@/lib/observability";
import {
  MEETING_CAUSE_LABEL, MEETING_STATUS_LABEL, historyLabel, meetingTotals,
  type MeetingCause, type MeetingHistoryEntry, type MeetingInterest, type MeetingStatus, type MeetingTotals,
} from "@/lib/meeting-interest";

/** One row of `sponsor_meeting_report` (migration 054). */
interface MeetingReportRow {
  kind: string; name: string | null; email: string | null; company: string | null; designation: string | null;
  status: MeetingStatus; status_cause: MeetingCause | null; status_reason: string | null; interested_at: string | null;
  scheduled_at: string | null; location: string | null; met_at: string | null;
  checked_in: boolean; checked_in_at: string | null; status_by_side: string | null;
  dispute_status: string | null; dispute_reason: string | null; dispute_resolution: string | null; dispute_note: string | null;
  history: { at: string; action: string; from: MeetingStatus | null; to: MeetingStatus | null; side: "sponsor" | "organiser" | null; reason: string | null; cause: MeetingCause | null }[];
}
import { isValidEmailFormat, normalizeEmail } from "@/lib/email-format";
import SponsorLogoUploader from "./SponsorLogoUploader";
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove,
  useSortable, rectSortingStrategy, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  groupSponsorsByTier,
  reorderWithinTier as reorderWithinTierPure,
  reorderGroups as reorderGroupsPure,
  moveSponsorToTier as moveSponsorToTierPure,
} from "./sponsor-dnd";
import { publicOrigin } from "@/lib/publicUrl";
import { AddSponsorDialog } from "./AddSponsorDialog";
import { ShareDataDialog } from "@/components/sponsor-data/ShareDataDialog";
import { dataSharing, type ShareSummary } from "@/lib/sponsors/data-sharing";
import { SponsorshipPanel, type SponsorshipPanelTab } from "./SponsorshipPanel";
import { fetchEventSponsorLinks, sponsorship, withEventSponsorship, type EventSponsorLink, type EventSponsorshipRow } from "@/lib/sponsors/event-sponsorship";
import { friendlyError } from "@/lib/friendly-error";

const SponsorApplicationsPanelLazy = lazy(() =>
  import("./ApplicationsSection").then((m) => ({ default: m.SponsorApplicationsPanel })),
);

interface Sponsor {
  id: string;
  name: string;
  email: string | null;
  logo_url: string | null;
  website: string | null;
  tier: string;
  tier_label: string | null;
  description: string | null;
  /** This event's sponsorship: its link, canonical company, package, status and contacts. */
  link?: EventSponsorLink;
  sponsorship?: EventSponsorshipRow;
  /** The latest participant data shared with this sponsor for this event. */
  share?: ShareSummary | null;
}

interface Props {
  eventId: string;
}

const TIERS = [
  { value: "platinum", label: "Platinum", color: "bg-[hsl(var(--brand-purple)/0.12)] text-[hsl(var(--brand-purple))] border-[hsl(var(--brand-purple)/0.3)]" },
  { value: "gold", label: "Gold", color: "bg-[hsl(var(--brand-amber)/0.12)] text-[hsl(var(--brand-amber))] border-[hsl(var(--brand-amber)/0.3)]" },
  { value: "silver", label: "Silver", color: "bg-muted text-muted-foreground border-border" },
  { value: "bronze", label: "Bronze", color: "bg-[hsl(var(--brand-orange)/0.12)] text-[hsl(var(--brand-orange))] border-[hsl(var(--brand-orange)/0.3)]" },
  { value: "custom", label: "Custom…", color: "bg-primary/10 text-primary border-primary/20" },
];

const tierColor = (tier: string) => TIERS.find((t) => t.value === tier)?.color || TIERS[3].color;

const emptySponsor = { name: "", email: "", logo_url: "", website: "", tier: "bronze", tier_label: "", description: "" };

interface TierPreset { id: string; label: string; }

const SPONSORSHIP_STATUS: Record<string, string> = {
  prospect: "Prospect", proposed: "Proposed", confirmed: "Confirmed", active: "Active", completed: "Completed", cancelled: "Cancelled",
};

export default function SponsorManagement({ eventId }: Props) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState(emptySponsor);
  const [panel, setPanel] = useState<{ sponsor: Sponsor; tab: SponsorshipPanelTab } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tierPresets, setTierPresets] = useState<TierPreset[]>([]);
  const [applicationsEnabled, setApplicationsEnabled] = useState(true);
  const [togglingApplications, setTogglingApplications] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Step 1: links for this event
    const { data: links, error: linksErr } = await fetchEventSponsorLinks(eventId);
    if (linksErr)
      logger.error("sponsor management failure", {
        kind: "event_sponsors error",
        error_message: linksErr instanceof Error ? linksErr.message : String(linksErr),
      });

    const orderedIds = links.map((a) => a.sponsor_id);
    const linkBySponsor = new Map(links.map((l) => [l.sponsor_id, l]));
    const ids = new Set(orderedIds);

    // Step 2: linked sponsors by ID (relies on permissive RLS policy)
    let linkedSponsors: Sponsor[] = [];
    if (orderedIds.length > 0) {
      const { data: rows, error: spkErr } = await supabase
        .from("sponsors")
        .select("*")
        .in("id", orderedIds);
      if (spkErr)
        logger.error("sponsor management failure", {
          kind: "linked sponsors error",
          error_message: spkErr instanceof Error ? spkErr.message : String(spkErr),
        });
      const byId = new Map((rows ?? []).map((s: Sponsor) => [s.id, s] as const));
      // Each sponsor as this event has it: the event's own title and logo.
      linkedSponsors = orderedIds.flatMap((id) => {
        const s = byId.get(id);
        return s ? [{ ...withEventSponsorship(s, linkBySponsor.get(id)), link: linkBySponsor.get(id) }] : [];
      });
      // Company, package, status and contacts add to the list; without them it still works.
      const details = await sponsorship.forEvent(eventId).catch(() => [] as EventSponsorshipRow[]);
      const detailBySponsor = new Map(details.map((d) => [d.sponsor_id, d]));
      // Shared participant data, per sponsorship. Without the database update the tiles just don't show it.
      const shares: Awaited<ReturnType<typeof dataSharing.statusForEvent>> = await dataSharing.statusForEvent(eventId).catch(() => []);
      const shareBySponsor = new Map(shares.map((x) => [x.sponsor_id, x.share]));
      linkedSponsors = linkedSponsors.map((s) => ({ ...s, sponsorship: detailBySponsor.get(s.id), share: shareBySponsor.get(s.id) ?? null }));
      const missing = orderedIds.filter((id) => !byId.has(id));
      if (missing.length) {
        logger.warn("sponsor management failure", {
          kind: "sponsors blocked by RLS",
          missing,
          hint: "Run the 'Event owner view linked sponsors' policy from migration 001_tables.sql",
        });
      }
    }

    // Step 3: all sponsors visible to the organizer (for picker)
    //
    // Removed in SCALE-003: the picker now does its own server-side
    // search via `useOrgSponsorSearch` so we don't pre-load the entire
    // roster on every dashboard mount.

    // Step 4: org tier presets
    const { data: ev } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    setSponsors(linkedSponsors);
    setAssignedIds(ids);
    const _orgId = (ev as any)?.org_id ?? null;
    setOrgId(_orgId);
    setApplicationsEnabled(
      (ev as { sponsor_applications_enabled?: boolean | null } | null)?.sponsor_applications_enabled ?? true,
    );
    if (_orgId) {
      const { data: presets } = await supabase
        .from("org_sponsor_tiers")
        .select("id,label")
        .eq("org_id", _orgId)
        .order("label");
      setTierPresets((presets || []) as TierPreset[]);
    } else {
      setTierPresets([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [eventId]);

  /** The organiser's meetings report for one sponsor: every meeting, its
   *  outcome, check-in evidence and full history, as CSV (migration 054). */
  const downloadMeetingReport = async (sponsor: Sponsor) => {
    const { data, error } = await supabaseRpc("sponsor_meeting_report" as never, { _eid: eventId, _sponsor_id: sponsor.id } as never);
    if (error) {
      const missing = /function .* does not exist|schema cache|Could not find the function/i.test(error.message ?? "");
      toast.error("Report wasn't created", { description: missing ? "This needs a database update that hasn't been applied yet (migration 054)." : friendlyError(error) });
      return;
    }
    const rows = (data || []) as unknown as MeetingReportRow[];
    const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
    const header = [
      "Name", "Type", "Email", "Company", "Designation", "Meeting status", "Didn't happen — cause", "Reason",
      "Interested at", "Arranged for", "Place", "Met at", "Checked in", "Checked in at", "Last recorded by",
      "Dispute", "Dispute reason", "Dispute outcome", "Organiser's note", "History",
    ];
    const body = rows.map((r) => [
      r.name ?? "", r.kind, r.email ?? "", r.company ?? "", r.designation ?? "",
      MEETING_STATUS_LABEL[r.status] ?? r.status,
      r.status_cause ? MEETING_CAUSE_LABEL[r.status_cause] : "", r.status_reason ?? "",
      at(r.interested_at), at(r.scheduled_at), r.location ?? "", at(r.met_at),
      r.checked_in ? "Yes" : "No", at(r.checked_in_at), r.status_by_side ?? "",
      r.dispute_status ?? "", r.dispute_reason ?? "", r.dispute_resolution ?? "", r.dispute_note ?? "",
      r.history.map((h) => {
        const entry: MeetingHistoryEntry = { created_at: h.at, action: h.action, from_status: h.from, to_status: h.to, side: h.side, reason: h.reason, cause: h.cause };
        return [at(h.at), h.side === "organiser" ? "Organiser" : "Sponsor", historyLabel(entry), h.reason ? `"${h.reason}"` : ""].filter(Boolean).join(" — ");
      }).join(" | "),
    ]);
    const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...body].map((line) => line.map((v) => esc(String(v))).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meetings-${sponsor.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Meetings report for ${sponsor.name} downloaded`);
  };

  // Each sponsor's meetings at this event (migrations 050–054), kept live.
  const [meetings, setMeetings] = useState<Map<string, MeetingTotals>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = () => {
      supabaseRpc("event_meeting_interests" as never, { _eid: eventId } as never).then(({ data, error }) => {
        if (alive && !error) setMeetings(meetingTotals((data || []) as unknown as MeetingInterest[]));
      });
    };
    load();
    const channel = supabase
      .channel(`sponsor-meetings-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sponsor_meeting_interests", filter: `event_id=eq.${eventId}` }, load)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); supabase.removeChannel(channel); };
  }, [eventId]);

  const handleApplicationsToggle = async (enabled: boolean) => {
    setTogglingApplications(true);
    setApplicationsEnabled(enabled);
    const { error } = await supabase
      .from("events")
      .update({ sponsor_applications_enabled: enabled } as never)
      .eq("id", eventId);
    setTogglingApplications(false);
    if (error) {
      setApplicationsEnabled(!enabled);
      toast.error(friendlyError(error));
      logger.error("sponsor applications toggle failed", {
        event_id: eventId,
        error_message: error.message,
      });
      return;
    }
    toast.success(enabled ? "Call for Sponsors is now open" : "Call for Sponsors is now closed");
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase.from("sponsor_members").delete().eq("id", id);
    if (error) toast.error(friendlyError(error));
  };

  const copyInvite = (token: string) => {
    const url = `${publicOrigin()}/sponsor/accept?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied", { description: url });
  };

  /**
   * Sends a sponsor invitation email through `send-sponsor-invite-email`,
   * which builds it server-side (banner, organiser block, date / venue,
   * portal or accept link, and a set-up link with the details filled in for
   * someone without an account). Without `memberId` it goes to the sponsor
   * company's email; with it, to that person on the sponsor's team.
   *
   * The organiser always hears how it went — sent, email not set up, or the
   * reason it failed — so an address that never received anything doesn't
   * go unnoticed. No email address: nothing is sent and nothing is said.
   */
  const sendSponsorInvite = async ({ sponsorId, memberId, recipient: raw }: { sponsorId: string; memberId?: string; recipient: string | null }) => {
    const recipient = normalizeEmail(raw);
    if (!isValidEmailFormat(recipient)) return;
    const failed = (reason: string) => {
      logger.warn("sponsor invite send failed", { event_id: eventId, sponsor_id: sponsorId, member_id: memberId ?? null, error_message: reason });
      toast.error(`Invitation email to ${recipient} wasn't sent`, {
        description: `${reason}${memberId ? " You can copy the invite link and send it yourself." : ""}`,
      });
    };
    try {
      const { data, error } = await supabase.functions.invoke("send-sponsor-invite-email", {
        body: { sponsor_id: sponsorId, event_id: eventId, ...(memberId ? { member_id: memberId } : {}) },
      });
      type R = { ok?: boolean; delivered?: boolean; error?: string; note?: string };
      if (error) {
        // The function's own message (rate limit, SMTP error, …) is in the response body.
        let reason = error.message || "The email service returned an error.";
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.text === "function") {
          try { reason = ((JSON.parse(await ctx.text()) as R).error) || reason; } catch { /* keep generic reason */ }
        }
        failed(reason);
        return;
      }
      const r = (data ?? null) as R | null;
      if (r?.error) { failed(r.error); return; }
      if (r?.delivered) { toast.success("Invitation email sent", { description: recipient }); return; }
      failed(r?.note === "SMTP not configured" ? "Email sending isn't set up for this platform." : (r?.note || "The email service didn't confirm delivery."));
    } catch (err) {
      failed(err instanceof Error ? err.message : "The email service is unreachable.");
    }
  };

  const notifySponsorAdded = (sponsor: { id: string; email: string | null; name: string }) =>
    sendSponsorInvite({ sponsorId: sponsor.id, recipient: sponsor.email });

  /** A custom title becomes one of the organisation's reusable ones. */
  const rememberTitle = async (title: string | null) => {
    if (!title || !orgId || tierPresets.some((p) => p.label.toLowerCase() === title.toLowerCase())) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("org_sponsor_tiers").insert({ org_id: orgId, label: title, created_by: user.id });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.tier === "custom" && !form.tier_label.trim()) { toast.error("Custom tier name is required"); return; }
    const tierLabelToSave = form.tier === "custom" ? form.tier_label.trim() : null;

    // The title belongs to this event; other events keep theirs.
    const logoIsThisEvents = !!editing.link?.logo_url;
    const { error } = await supabase.from("sponsors").update({
      name: form.name, email: form.email || null, ...(logoIsThisEvents ? {} : { logo_url: form.logo_url || null }),
      website: form.website || null, description: form.description || null,
    }).eq("id", editing.id);
    if (error) { toast.error(friendlyError(error)); return; }
    const { error: linkError } = await supabase.from("event_sponsors").update({
      tier: form.tier, tier_label: tierLabelToSave, ...(logoIsThisEvents ? { logo_url: form.logo_url || null } : {}),
    }).eq("event_id", eventId).eq("sponsor_id", editing.id);
    if (linkError) { toast.error(linkError.message); return; }
    toast.success("Sponsor updated");
    setOpen(false);
    setEditing(null);
    setForm(emptySponsor);
    await rememberTitle(tierLabelToSave);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this sponsor permanently? This cannot be undone.")) return;
    await supabase.from("sponsors").delete().eq("id", id);
    toast.success("Sponsor deleted");
    fetchData();
  };

  const openEdit = (s: Sponsor) => {
    setEditing(s);
    setForm({
      name: s.name, email: s.email || "", logo_url: s.logo_url || "",
      website: s.website || "", tier: s.tier, tier_label: s.tier_label || "", description: s.description || "",
    });
    setOpen(true);
  };

  if (loading) return <div className="text-muted-foreground p-8 text-center">Loading sponsors...</div>;

  // Group by tier in the order sponsors first appear (so the saved display_order
  // determines tier-group order across reloads, not the static TIERS array).
  const customColor = TIERS.find((t) => t.value === "custom")!.color;
  const grouped: TierGroup[] = (() => {
    const map = new Map<string, TierGroup>();
    for (const s of sponsors) {
      const isCustom = s.tier === "custom";
      const tierLabel = isCustom ? (s.tier_label || "Custom").trim() : null;
      const key = isCustom ? `custom:${tierLabel}` : s.tier;
      if (!map.has(key)) {
        const preset = TIERS.find((t) => t.value === s.tier);
        map.set(key, {
          key,
          tier: s.tier,
          tierLabel,
          label: isCustom ? (tierLabel || "Custom") : (preset?.label || s.tier),
          color: isCustom ? customColor : (preset?.color || customColor),
          sponsors: [],
        });
      }
      map.get(key)!.sponsors.push(s);
    }
    return Array.from(map.values());
  })();

  const persistOrder = async (next: Sponsor[]) => {
    const updates = next.map((s, i) =>
      supabase.from("event_sponsors")
        .update({ display_order: i })
        .eq("event_id", eventId)
        .eq("sponsor_id", s.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      toast.error("Failed to save order");
      fetchData();
    }
  };

  const reorderGroups = async (oldIndex: number, newIndex: number) => {
    const next = reorderGroupsPure(sponsors, oldIndex, newIndex);
    setSponsors(next);
    await persistOrder(next);
  };

  const reorderSponsorWithinTier = async (activeId: string, overId: string) => {
    const next = reorderWithinTierPure(sponsors, activeId, overId);
    if (next === sponsors) return;
    setSponsors(next);
    await persistOrder(next);
  };

  const moveSponsorToTier = async (
    sponsorId: string,
    destTier: string,
    destTierLabel: string | null,
    insertBeforeSponsorId: string | null,
  ) => {
    const { next, tierChanged } = moveSponsorToTierPure(
      sponsors, sponsorId, destTier, destTierLabel, insertBeforeSponsorId,
    );
    if (next === sponsors) return;
    setSponsors(next);

    if (tierChanged) {
      // Only this event's title changes.
      const { error } = await supabase
        .from("event_sponsors")
        .update({ tier: destTier, tier_label: destTier === "custom" ? destTierLabel : null })
        .eq("event_id", eventId)
        .eq("sponsor_id", sponsorId);
      if (error) {
        toast.error(friendlyError(error));
        fetchData();
        return;
      }
      toast.success(`Moved to ${destTier === "custom" ? destTierLabel || "Custom" : destTier} tier`);
    }
    await persistOrder(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Sponsors</h2>
          <p className="text-sm text-muted-foreground">{sponsors.length} sponsors assigned to this event</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add Sponsor</Button>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptySponsor); } }}>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[520px] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
            <DialogHeader className="sticky top-0 z-10 bg-background border-b px-5 sm:px-6 py-4">
              <DialogTitle>Edit Sponsor</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Tier</Label>
                <Select
                  value={
                    form.tier === "custom" && form.tier_label
                      ? `preset:${form.tier_label}`
                      : form.tier
                  }
                  onValueChange={(v) => {
                    if (v.startsWith("preset:")) {
                      setForm({ ...form, tier: "custom", tier_label: v.slice("preset:".length) });
                    } else if (v === "custom") {
                      setForm({ ...form, tier: "custom", tier_label: "" });
                    } else {
                      setForm({ ...form, tier: v, tier_label: "" });
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.filter((t) => t.value !== "custom").map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                    {tierPresets.map((p) => (
                      <SelectItem key={`preset:${p.id}`} value={`preset:${p.label}`}>
                        {p.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.tier === "custom" && !tierPresets.some(
                (p) => p.label.toLowerCase() === form.tier_label.trim().toLowerCase() && form.tier_label.trim() !== ""
              ) && (
                <div>
                  <Label>Custom tier name *</Label>
                  <Input
                    value={form.tier_label}
                    onChange={(e) => setForm({ ...form, tier_label: e.target.value })}
                    placeholder="e.g. Diamond, Founding Partner"
                    maxLength={40}
                  />
                </div>
              )}
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
              <div>
                <Label>Logo</Label>
                <div className="mt-1.5">
                  <SponsorLogoUploader
                    value={form.logo_url}
                    onChange={(url) => setForm({ ...form, logo_url: url || "" })}
                  />
                </div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            </div>
            <div className="sticky bottom-0 bg-background border-t px-5 sm:px-6 py-3">
              <Button onClick={handleSave} className="w-full">Update</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Call for Sponsors gate (per-event). Defaults ON via migration 009. */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">Call for Sponsors</p>
            <p className="text-[12px] text-muted-foreground">
              Show the “Become a Sponsor” button on the public event page.
            </p>
          </div>
        </div>
        <Switch
          checked={applicationsEnabled}
          onCheckedChange={handleApplicationsToggle}
          disabled={togglingApplications}
          aria-label="Toggle call for sponsors"
        />
      </div>

      {/* Sponsors grouped by tier */}
      {grouped.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Award className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No sponsors yet. Add your first sponsor.</p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              const d = active.data.current as { type?: string; name?: string; tierLabel?: string } | undefined;
              if (d?.type === "group") return `Picked up ${d.tierLabel ?? "tier"} group`;
              if (d?.type === "sponsor") return `Picked up sponsor ${d.name ?? ""}`;
              return "Picked up item";
            },
            onDragOver({ active, over }) {
              const a = active.data.current as { type?: string; name?: string } | undefined;
              const o = over?.data.current as { type?: string; tierLabel?: string; name?: string } | undefined;
              if (!over) return "Not over a drop target";
              if (a?.type === "group") return `${a.name ?? "Group"} is over ${o?.tierLabel ?? "another group"}`;
              if (a?.type === "sponsor") {
                if (o?.type === "tier-zone" || o?.type === "group") return `Hovering over ${o.tierLabel ?? "tier"} group`;
                if (o?.type === "sponsor") return `Hovering over ${o.name ?? "another sponsor"}`;
              }
              return "";
            },
            onDragEnd({ active, over }) {
              const a = active.data.current as { type?: string; name?: string } | undefined;
              const o = over?.data.current as { type?: string; tierLabel?: string; name?: string } | undefined;
              if (!over) return "Drag cancelled";
              if (a?.type === "group") return `Reordered tier group ${a.name ?? ""}`;
              if (a?.type === "sponsor") return `Dropped ${a.name ?? "sponsor"} in ${o?.tierLabel ?? "tier"}`;
              return "Dropped";
            },
            onDragCancel() { return "Drag cancelled"; },
          },
        }}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={(e: DragEndEvent) => {
          setActiveId(null);
          const { active, over } = e;
          if (!over) return;
          const activeData = active.data.current as { type?: string; tier?: string; tierLabel?: string | null } | undefined;
          const overData = over.data.current as { type?: string; tier?: string; tierLabel?: string | null } | undefined;

          if (activeData?.type === "group") {
            if (active.id === over.id) return;
            const oldIndex = grouped.findIndex((g) => g.key === active.id);
            const newIndex = grouped.findIndex((g) => g.key === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            void reorderGroups(oldIndex, newIndex);
            return;
          }

          if (activeData?.type === "sponsor") {
            const sponsorId = String(active.id);
            if (overData?.type === "sponsor") {
              if (over.id === active.id) return;
              const sameTier =
                overData.tier === activeData.tier &&
                (overData.tier !== "custom" || (overData.tierLabel ?? null) === (activeData.tierLabel ?? null));
              if (sameTier) {
                void reorderSponsorWithinTier(sponsorId, String(over.id));
              } else {
                void moveSponsorToTier(sponsorId, overData.tier!, overData.tierLabel ?? null, String(over.id));
              }
            } else if (overData?.type === "tier-zone" || overData?.type === "group") {
              void moveSponsorToTier(sponsorId, overData.tier!, overData.tierLabel ?? null, null);
            }
          }
        }}
      >
        <SortableContext items={grouped.map((g) => g.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {grouped.map((group) => (
              <SortableTierGroup
                key={group.key}
                group={group}
                meetings={meetings}
                onReport={(sp) => void downloadMeetingReport(sp)}
                onTeam={(s, tab) => setPanel({ sponsor: s, tab: tab ?? "team" })}
                onShare={(s) => { const id = s.link?.id ?? s.sponsorship?.event_sponsor_id; if (id) setSharing(id); }}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeId ? (() => {
            const sp = sponsors.find((s) => s.id === activeId);
            if (sp) return <SponsorCardView sponsor={sp} dragging />;
            const grp = grouped.find((g) => g.key === activeId);
            if (grp) {
              return (
                <div className="bg-card border-2 border-primary/40 rounded-lg px-3 py-2 shadow-2xl ring-2 ring-primary/30">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${grp.color}`}>{grp.label}</span>
                  <span className="text-muted-foreground text-xs ml-2">({grp.sponsors.length} sponsors)</span>
                </div>
              );
            }
            return null;
          })() : null}
        </DragOverlay>
      </DndContext>

      {sharing && (
        <ShareDataDialog eventSponsorId={sharing} onClose={() => setSharing(null)} onChanged={fetchData} />
      )}

      {adding && (
        <AddSponsorDialog
          eventId={eventId}
          tiers={TIERS}
          presets={tierPresets}
          onClose={() => setAdding(false)}
          onAdded={(added, customTitle) => {
            void rememberTitle(customTitle);
            fetchData();
            // Heads-up email; silent when the sponsor has no address.
            void notifySponsorAdded({ id: added.sponsor_id, email: added.email, name: added.name });
          }}
        />
      )}

      {/* Sponsor applications — review and approve companies that applied via
          the public event page. Lives here (instead of a top-level "Applications"
          tab) so organisers manage the full sponsor pipeline in one place. */}
      <div className="border-t border-border pt-6">
        <Suspense
          fallback={
            <div className="text-[12px] text-muted-foreground">Loading applications…</div>
          }
        >
          <SponsorApplicationsPanelLazy eventId={eventId} />
        </Suspense>
      </div>

      {/* One sponsorship: company, this event's details, and the team */}
      {panel && (
        <SponsorshipPanel
          eventSponsorId={panel.sponsor.link?.id ?? panel.sponsor.sponsorship?.event_sponsor_id ?? ""}
          sponsorName={panel.sponsor.sponsorship?.company ?? panel.sponsor.name}
          initialTab={panel.tab}
          onClose={() => setPanel(null)}
          onChanged={fetchData}
          onInvite={sendSponsorInvite}
          onCopyInvite={copyInvite}
          onRemoveMember={removeMember}
        />
      )}
    </div>
  );
}

type TierGroup = {
  key: string;
  tier: string;
  tierLabel: string | null;
  label: string;
  color: string;
  sponsors: Sponsor[];
};

function SortableTierGroup({
  group, meetings, onReport, onTeam, onShare, onEdit, onDelete,
}: {
  group: TierGroup;
  meetings: Map<string, MeetingTotals>;
  onReport: (s: Sponsor) => void;
  onTeam: (s: Sponsor, tab?: SponsorshipPanelTab) => void;
  onShare: (s: Sponsor) => void;
  onEdit: (s: Sponsor) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.key,
    data: { type: "group", tier: group.tier, tierLabel: group.tierLabel, name: group.label },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tier-zone:${group.key}`,
    data: { type: "tier-zone", tier: group.tier, tierLabel: group.tierLabel, name: group.label },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "border-2 border-dashed border-primary/40 rounded-xl p-2 -m-2" : undefined}
    >
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <button
          type="button"
          {...attributes} {...listeners}
          aria-label={`Reorder ${group.label} tier (press space to pick up, arrows to move, space to drop)`}
          className="h-6 w-5 -ml-1 flex items-center justify-center text-muted-foreground hover:text-foreground rounded cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${group.color}`}>{group.label}</span>
        <span className="text-muted-foreground text-xs">({group.sponsors.length})</span>
      </h3>
      <div
        ref={setDropRef}
        className={`rounded-xl transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`}
      >
        <SortableContext items={group.sponsors.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch p-1">
            {group.sponsors.map((s) => (
              <SortableSponsorCard
                key={s.id} sponsor={s} group={group} meetings={meetings.get(s.id)} onReport={() => onReport(s)}
                onTeam={(tab) => onTeam(s, tab)}
                onShare={() => onShare(s)}
                onEdit={() => onEdit(s)}
                onDelete={() => onDelete(s.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

function SortableSponsorCard({
  sponsor: s, group, meetings, onReport, onTeam, onShare, onEdit, onDelete,
}: {
  sponsor: Sponsor;
  group: TierGroup;
  meetings?: MeetingTotals;
  onReport: () => void;
  onShare: () => void;
  onTeam: (tab?: SponsorshipPanelTab) => void; onEdit: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: s.id,
    data: { type: "sponsor", tier: group.tier, tierLabel: group.tierLabel, name: s.name },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "bg-card border rounded-xl p-4 flex flex-col h-full transition-shadow",
        isDragging ? "opacity-40 border-dashed border-primary/50" : "border-border",
        isOver && !isDragging ? "outline outline-2 outline-primary/60 outline-offset-2" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          {...attributes} {...listeners}
          aria-label={`Reorder sponsor ${s.name} (press space to pick up, arrows to move, space to drop, escape to cancel)`}
          className="h-7 w-5 -ml-1 flex items-center justify-center text-muted-foreground hover:text-foreground rounded cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <SponsorCardBody sponsor={s} onTeam={onTeam} onShare={onShare} onEdit={onEdit} onDelete={onDelete} />
      </div>
      {/* Exactly two lines tall, so no part of a third shows. */}
      <p className="text-xs leading-4 text-muted-foreground mt-2 line-clamp-2 min-h-8">
        {s.description || ""}
      </p>
      <MeetingLine meetings={meetings} onReport={onReport} />
      <ShareLine share={s.share} onShare={onShare} />
    </div>
  );
}

/** Whether this event's participant data has gone to this sponsor, with the way to share it. */
function ShareLine({ share, onShare }: { share?: ShareSummary | null; onShare: () => void }) {
  const active = share?.status === "active" ? share : null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-2 text-[11.5px] text-muted-foreground" aria-label="Data sharing">
      <button type="button" onClick={onShare} className="order-last ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <Share2 className="h-3 w-3" /> {active ? "Manage" : "Share data"}
      </button>
      {active ? (
        <>
          <span className="flex items-center gap-1 font-medium text-foreground"><i className="h-1.5 w-1.5 rounded-full bg-green-500" />Data shared</span>
          <span><b className="font-semibold text-foreground tabular-nums">{active.record_count.toLocaleString()}</b> records</span>
          <span><b className="font-semibold text-foreground tabular-nums">{active.with_email.toLocaleString()}</b> email</span>
          <span><b className="font-semibold text-foreground tabular-nums">{active.with_mobile.toLocaleString()}</b> mobile</span>
          <span>{new Date(active.shared_at).toLocaleDateString()}</span>
        </>
      ) : (
        <span className="font-medium text-foreground">{share?.status === "revoked" ? "Data access revoked" : "Data not shared"}</span>
      )}
    </p>
  );
}

/** "Meetings: 12 interested · 5 arranged · 3 met" for a sponsor card, with the report. */
function MeetingLine({ meetings: m, onReport }: { meetings?: MeetingTotals; onReport: () => void }) {
  if (!m?.marked) return <p className="mt-2 border-t border-border pt-2 text-[11.5px] text-muted-foreground">Meetings: none marked yet</p>;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-2 text-[11.5px] text-muted-foreground" aria-label="Meetings">
      <button type="button" onClick={onReport} className="order-last ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <Download className="h-3 w-3" /> Report
      </button>
      <span className="font-medium text-foreground">Meetings</span>
      <span><b className="font-semibold text-foreground tabular-nums">{m.marked}</b> interested</span>
      <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue-500" /><b className="font-semibold text-foreground tabular-nums">{m.arranged}</b> arranged</span>
      <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-green-500" /><b className="font-semibold text-foreground tabular-nums">{m.met}</b> met</span>
      {m.not_met > 0 && <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-500" /><b className="font-semibold text-foreground tabular-nums">{m.not_met}</b> didn't happen</span>}
      {m.cancelled > 0 && <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /><b className="font-semibold text-foreground tabular-nums">{m.cancelled}</b> cancelled</span>}
      {m.disputed > 0 && <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /><b className="font-semibold tabular-nums">{m.disputed}</b> disputed</span>}
    </p>
  );
}

function SponsorCardBody({
  sponsor: s, onTeam, onShare, onEdit, onDelete,
}: {
  sponsor: Sponsor;
  onShare?: () => void;
  onTeam: (tab?: SponsorshipPanelTab) => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <>
      <div className="h-10 w-20 rounded-md bg-accent/30 flex items-center justify-center shrink-0 overflow-hidden">
        {s.logo_url ? (
          <img loading="lazy" decoding="async" src={s.logo_url} alt={s.name} className="h-full w-full object-contain" />
        ) : (
          <Award className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <button type="button" className="block max-w-full truncate text-left text-sm font-semibold hover:underline" onClick={() => onTeam("sponsorship")}>
          {s.sponsorship?.company ?? s.name}
        </button>
        {s.sponsorship?.company && s.sponsorship.company.trim().toLowerCase() !== s.name.trim().toLowerCase() && <p className="truncate text-[11px] text-muted-foreground">Listed as {s.name}</p>}
        {s.website && (
          <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline truncate">
            <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{new URL(s.website).hostname}</span>
          </a>
        )}
        {s.sponsorship && (
          <p className="truncate text-[11px] text-muted-foreground">
            {[s.sponsorship.package, SPONSORSHIP_STATUS[s.sponsorship.status] ?? s.sponsorship.status,
              s.sponsorship.contacts.length ? `${s.sponsorship.contacts.length} ${s.sponsorship.contacts.length === 1 ? "contact" : "contacts"}` : null,
              s.sponsorship.commercial_value != null ? `${s.sponsorship.currency ?? ""} ${Number(s.sponsorship.commercial_value).toLocaleString()}`.trim() : null,
            ].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Manage team for ${s.name}`} onClick={() => onTeam("team")}><UsersIcon className="h-3 w-3" /></Button>
        {onShare && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Share data with ${s.name}`} title="Share data" onClick={onShare}><Share2 className="h-3 w-3" /></Button>}
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${s.name}`} onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete ${s.name}`} onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </>
  );
}

function SponsorCardView({ sponsor: s, dragging = false }: { sponsor: Sponsor; dragging?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-4 flex flex-col h-full ${dragging ? "shadow-2xl ring-2 ring-primary/40 scale-[1.02] border-primary/40" : "border-border"}`}>
      <div className="flex items-center gap-3">
        <div className="h-7 w-5 -ml-1 flex items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="h-10 w-20 rounded-md bg-accent/30 flex items-center justify-center shrink-0 overflow-hidden">
          {s.logo_url ? (
            <img loading="lazy" decoding="async" src={s.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Award className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{s.name}</p>
        </div>
      </div>
      <p className="text-xs leading-4 text-muted-foreground mt-2 line-clamp-2 min-h-8">
        {s.description || ""}
      </p>
    </div>
  );
}
