import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Award, ExternalLink, Users as UsersIcon, Copy, X, GripVertical, Search, Megaphone } from "lucide-react";
import PersonFieldsForm, { emptyPersonFields, validatePersonFields, displayName, type PersonFields } from "@/components/people/PersonFieldsForm";
import { logger } from "@/lib/observability";
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

interface Sponsor {
  id: string;
  name: string;
  email: string | null;
  logo_url: string | null;
  website: string | null;
  tier: string;
  tier_label: string | null;
  description: string | null;
}

interface SponsorMember {
  id: string;
  sponsor_id: string;
  email: string;
  display_name: string | null;
  role: string;
  invite_token: string;
  accepted_at: string | null;
  designation?: string | null;
  company?: string | null;
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

export default function SponsorManagement({ eventId }: Props) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [allSponsors, setAllSponsors] = useState<Sponsor[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState(emptySponsor);
  const [teamOpen, setTeamOpen] = useState<Sponsor | null>(null);
  const [members, setMembers] = useState<SponsorMember[]>([]);
  const [memberForm, setMemberForm] = useState<PersonFields>(() => emptyPersonFields());
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
    const { data: links, error: linksErr } = await supabase
      .from("event_sponsors")
      .select("sponsor_id, display_order")
      .eq("event_id", eventId)
      .order("display_order");
    if (linksErr)
      logger.error("sponsor management failure", {
        kind: "event_sponsors error",
        error_message: linksErr instanceof Error ? linksErr.message : String(linksErr),
      });

    const orderedIds = (links ?? []).map((a: { sponsor_id: string }) => a.sponsor_id);
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
      linkedSponsors = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Sponsor[];
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
    const { data: allSpk } = await supabase.from("sponsors").select("*").order("name");

    // Step 4: org tier presets
    const { data: ev } = await supabase
      .from("events")
      .select("org_id, sponsor_applications_enabled")
      .eq("id", eventId)
      .maybeSingle();

    const byIdAll = new Map<string, Sponsor>();
    for (const s of (allSpk ?? []) as Sponsor[]) byIdAll.set(s.id, s);
    for (const s of linkedSponsors) byIdAll.set(s.id, s);

    setAllSponsors(Array.from(byIdAll.values()).sort((a, b) => a.name.localeCompare(b.name)));
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
      toast.error(error.message);
      logger.error("sponsor applications toggle failed", {
        event_id: eventId,
        error_message: error.message,
      });
      return;
    }
    toast.success(enabled ? "Call for Sponsors is now open" : "Call for Sponsors is now closed");
  };

  const fetchMembers = async (sponsorId: string) => {
    const { data } = await supabase.from("sponsor_members").select("*").eq("sponsor_id", sponsorId).order("created_at");
    setMembers((data || []) as SponsorMember[]);
  };

  const openTeam = async (s: Sponsor) => {
    setTeamOpen(s);
    setMemberForm({ ...emptyPersonFields(), company: s.name });
    await fetchMembers(s.id);
  };

  const inviteMember = async () => {
    if (!teamOpen) return;
    const v = validatePersonFields(memberForm);
    if (!v.ok) { toast.error(v.error); return; }
    const { error } = await supabase.from("sponsor_members").insert({
      sponsor_id: teamOpen.id,
      email: memberForm.email.trim().toLowerCase(),
      display_name: displayName(memberForm) || null,
      title: memberForm.title,
      first_name: memberForm.first_name.trim(),
      last_name: memberForm.last_name.trim(),
      designation: memberForm.designation.trim(),
      company: memberForm.company.trim() || teamOpen.name,
      mobile_country_code: memberForm.mobile_country_code,
      mobile_number: memberForm.mobile_number.trim(),
      linkedin_url: memberForm.linkedin_url.trim() || null,
      company_website: memberForm.company_website.trim() || null,
      company_employee_count: memberForm.company_employee_count || null,
      industry: memberForm.industry || null,
    });
    if (error) { toast.error(error.message); return; }
    setMemberForm({ ...emptyPersonFields(), company: teamOpen.name });
    await fetchMembers(teamOpen.id);
    toast.success("Team member added — share their invite link");
  };

  const removeMember = async (id: string) => {
    await supabase.from("sponsor_members").delete().eq("id", id);
    if (teamOpen) await fetchMembers(teamOpen.id);
  };

  const copyInvite = (token: string) => {
    const url = `${window.location.origin}/sponsor/accept?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied", { description: url });
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.tier === "custom" && !form.tier_label.trim()) { toast.error("Custom tier name is required"); return; }
    const tierLabelToSave = form.tier === "custom" ? form.tier_label.trim() : null;

    if (editing) {
      const { error } = await supabase.from("sponsors").update({
        name: form.name, email: form.email || null, logo_url: form.logo_url || null,
        website: form.website || null, tier: form.tier, tier_label: tierLabelToSave, description: form.description || null,
      }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Sponsor updated");
    } else {
      const { data, error } = await supabase.from("sponsors").insert({
        name: form.name, email: form.email || null, logo_url: form.logo_url || null,
        website: form.website || null, tier: form.tier, tier_label: tierLabelToSave, description: form.description || null,
        user_id: user.id,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      await supabase.from("event_sponsors").insert({ event_id: eventId, sponsor_id: data.id });
      toast.success("Sponsor added & assigned");
    }
    setOpen(false);
    setEditing(null);
    setForm(emptySponsor);
    // Save custom tier as a reusable org-level preset
    if (form.tier === "custom" && tierLabelToSave && orgId) {
      const exists = tierPresets.some(
        (p) => p.label.toLowerCase() === tierLabelToSave.toLowerCase()
      );
      if (!exists) {
        await supabase
          .from("org_sponsor_tiers")
          .insert({ org_id: orgId, label: tierLabelToSave, created_by: user.id });
      }
    }
    fetchData();
  };

  const handleAssign = async (sponsorId: string) => {
    if (assignedIds.has(sponsorId)) {
      await supabase.from("event_sponsors").delete().eq("event_id", eventId).eq("sponsor_id", sponsorId);
      toast.success("Sponsor removed from event");
    } else {
      const nextOrder = sponsors.length;
      const { error } = await supabase.from("event_sponsors").insert({
        event_id: eventId, sponsor_id: sponsorId, display_order: nextOrder,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Sponsor assigned to event");
    }
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
      const { error } = await supabase
        .from("sponsors")
        .update({ tier: destTier, tier_label: destTier === "custom" ? destTierLabel : null })
        .eq("id", sponsorId);
      if (error) {
        toast.error(error.message);
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptySponsor); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Sponsor</Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[520px] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
            <DialogHeader className="sticky top-0 z-10 bg-background border-b px-5 sm:px-6 py-4">
              <DialogTitle>{editing ? "Edit Sponsor" : "Add New Sponsor"}</DialogTitle>
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
              <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Create & Assign"}</Button>
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
                onTeam={openTeam}
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

      {/* Add existing sponsor — searchable popover instead of a flat cluster */}
      <AssignSponsorPopover
        sponsors={allSponsors.filter((s) => !assignedIds.has(s.id))}
        onAssign={handleAssign}
      />

      {/* Team manager dialog */}
      <Dialog open={!!teamOpen} onOpenChange={(v) => !v && setTeamOpen(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="sticky top-0 z-10 bg-background border-b px-5 sm:px-6 py-4">
            <DialogTitle>{teamOpen?.name} · Team</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
            <PersonFieldsForm value={memberForm} onChange={setMemberForm} />
            <Button onClick={inviteMember} size="sm" className="w-full">Add team member</Button>
            <div className="border border-border rounded-md divide-y divide-border max-h-[260px] overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No team members yet.</p>
              ) : members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{m.display_name || m.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.designation ? `${m.designation} · ` : ""}{m.email}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${m.accepted_at ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                    {m.accepted_at ? "Active" : "Invited"}
                  </span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Copy invite link" onClick={() => copyInvite(m.invite_token)}><Copy className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeMember(m.id)}><X className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Members see speakers and registered attendees for events this sponsor is attached to — without email or phone.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignSponsorPopover({
  sponsors, onAssign,
}: {
  sponsors: Sponsor[];
  onAssign: (sponsorId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sponsors.slice(0, 50);
    return sponsors
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.tier || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [sponsors, query]);

  if (sponsors.length === 0) return null;

  return (
    <div className="border-t border-border pt-4">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Award className="h-3.5 w-3.5" />
            Add existing sponsor
            <span className="text-[11px] text-muted-foreground ml-1">({sponsors.length})</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, tier, email…"
                className="pl-8 h-8 text-[13px]"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-6">
                No sponsors match.
              </p>
            ) : (
              <div className="py-1">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { onAssign(s.id); setOpen(false); setQuery(""); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                  >
                    {s.logo_url ? (
                      <img src={s.logo_url} alt={s.name} className="h-6 w-6 rounded object-contain bg-white shrink-0 border border-border" />
                    ) : (
                      <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate capitalize">
                        {s.tier_label || s.tier}
                      </p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {sponsors.length > filtered.length && !query.trim() && (
              <p className="text-[10px] text-muted-foreground text-center py-2 border-t border-border">
                Showing first 50 — type to search
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
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
  group, onTeam, onEdit, onDelete,
}: {
  group: TierGroup;
  onTeam: (s: Sponsor) => void;
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
                key={s.id} sponsor={s} group={group}
                onTeam={() => onTeam(s)}
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
  sponsor: s, group, onTeam, onEdit, onDelete,
}: {
  sponsor: Sponsor;
  group: TierGroup;
  onTeam: () => void; onEdit: () => void; onDelete: () => void;
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
        <SponsorCardBody sponsor={s} onTeam={onTeam} onEdit={onEdit} onDelete={onDelete} />
      </div>
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[2.25rem]">
        {s.description || ""}
      </p>
    </div>
  );
}

function SponsorCardBody({
  sponsor: s, onTeam, onEdit, onDelete,
}: {
  sponsor: Sponsor;
  onTeam: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <>
      <div className="h-10 w-20 rounded-md bg-accent/30 flex items-center justify-center shrink-0 overflow-hidden">
        {s.logo_url ? (
          <img src={s.logo_url} alt={s.name} className="h-full w-full object-contain" />
        ) : (
          <Award className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{s.name}</p>
        {s.website && (
          <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline truncate">
            <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{new URL(s.website).hostname}</span>
          </a>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Manage team for ${s.name}`} onClick={onTeam}><UsersIcon className="h-3 w-3" /></Button>
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
            <img src={s.logo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Award className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{s.name}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[2.25rem]">
        {s.description || ""}
      </p>
    </div>
  );
}
