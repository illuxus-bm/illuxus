/**
 * Super admin: what each plan includes.
 *
 * One column per plan, one row per feature. Saving a plan applies to every
 * organisation on it straight away (org_entitlements reads the plan live).
 * Exceptions for a single organisation are set from the Organizations page.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Layers, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { PLANS_QUERY_KEY } from "@/hooks/usePlanFeatures";
import {
  DEFAULT_PLANS, FEATURE_GROUPS, FEATURES, PLAN_KEY_PATTERN, parsePlan,
  type Plan, type PlanLimits,
} from "@/lib/plans/features";

const LIMITS: Array<{ key: keyof PlanLimits; label: string }> = [
  { key: "max_events", label: "Events" },
  { key: "max_attendees_per_event", label: "Attendees per event" },
  { key: "max_team_members", label: "Team members" },
];

const db = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
  };
};

async function loadPlans(): Promise<{ plans: Plan[]; missing: boolean }> {
  const { data, error } = await db.from("plans").select("*").order("sort_order");
  if (error || !data) return { plans: DEFAULT_PLANS, missing: true };
  return { plans: data.map(parsePlan), missing: false };
}

async function loadPlanCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from("organizations").select("plan");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ plan: string | null }>) {
    const k = row.plan || "free";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

const samePlan = (a: Plan, b: Plan) =>
  a.name === b.name &&
  a.description === b.description &&
  a.is_public === b.is_public &&
  LIMITS.every(({ key }) => a.limits[key] === b.limits[key]) &&
  [...a.features].sort().join() === [...b.features].sort().join();

export default function PlansPage() {
  const queryClient = useQueryClient();
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: loadPlans });
  const countsQ = useQuery({ queryKey: ["admin-plan-counts"], queryFn: loadPlanCounts });
  const [draft, setDraft] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const saved = useMemo(() => plansQ.data?.plans ?? [], [plansQ.data]);
  const missing = plansQ.data?.missing ?? false;
  useEffect(() => setDraft(saved.map((p) => ({ ...p, limits: { ...p.limits }, features: [...p.features] }))), [saved]);

  const dirtyKeys = draft
    .filter((p) => {
      const s = saved.find((x) => x.key === p.key);
      return !s || !samePlan(s, p);
    })
    .map((p) => p.key);

  const update = (key: string, change: (p: Plan) => Plan) =>
    setDraft((all) => all.map((p) => (p.key === key ? change(p) : p)));
  const toggleFeature = (key: string, feature: string, on: boolean) =>
    update(key, (p) => ({
      ...p,
      features: on ? [...new Set([...p.features, feature])] : p.features.filter((f) => f !== feature),
    }));
  const setLimit = (key: string, limit: keyof PlanLimits, raw: string) => {
    const value = raw.trim() === "" ? -1 : Math.max(-1, Math.floor(Number(raw)));
    if (!Number.isFinite(value)) return;
    update(key, (p) => ({ ...p, limits: { ...p.limits, [limit]: value } }));
  };

  const refreshEverywhere = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] }),
      queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["org-entitlements"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-plan-counts"] }),
    ]);
  };

  const save = async () => {
    setSaving(true);
    for (const key of dirtyKeys) {
      const p = draft.find((x) => x.key === key)!;
      const { error } = await supabaseRpc("admin_save_plan", {
        _key: p.key,
        _name: p.name.trim() || p.key,
        _description: p.description,
        _sort_order: p.sort_order,
        _is_public: p.is_public,
        _limits: p.limits,
        _features: p.features,
      });
      if (error) {
        toast.error(`Couldn't save ${p.name}`, { description: error.message });
        setSaving(false);
        return;
      }
    }
    await refreshEverywhere();
    setSaving(false);
    toast.success(dirtyKeys.length === 1 ? "Plan saved" : `${dirtyKeys.length} plans saved`, {
      description: "Organisations on these plans see the change straight away.",
    });
  };

  const remove = async (plan: Plan) => {
    const { error } = await supabaseRpc("admin_delete_plan", { _key: plan.key });
    setDeleting(null);
    if (error) {
      toast.error(`Couldn't delete ${plan.name}`, { description: error.message });
      return;
    }
    await refreshEverywhere();
    toast.success(`${plan.name} deleted`);
  };

  const addPlan = (key: string, name: string) => {
    const maxSort = Math.max(-1, ...draft.map((p) => p.sort_order));
    const base = draft.find((p) => p.key === "free");
    setDraft((all) => [
      ...all,
      {
        key,
        name,
        description: "",
        sort_order: maxSort + 1,
        is_public: false,
        limits: { max_events: -1, max_attendees_per_event: -1, max_team_members: -1 },
        features: [...(base?.features ?? [])],
      },
    ]);
    setAdding(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
              <Link to="/dashboard/admin"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to admin</Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Plans &amp; features</h1>
                <p className="text-xs text-muted-foreground">Choose what each plan includes. Changes apply to every organisation on the plan.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(true)} disabled={missing}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add plan
            </Button>
            <Button
              size="sm" variant="outline" className="h-8"
              onClick={() => setDraft(saved.map((p) => ({ ...p, limits: { ...p.limits }, features: [...p.features] })))}
              disabled={dirtyKeys.length === 0 || saving}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Discard
            </Button>
            <Button size="sm" className="h-8" onClick={() => void save()} disabled={dirtyKeys.length === 0 || saving || missing}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save{dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ""}
            </Button>
          </div>
        </div>

        {missing && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              The plans table isn't in the database yet. Run the <code>048_plan_features.sql</code> section of{" "}
              <code>supabase/migrations/000_full_schema.sql</code> in the Supabase SQL Editor. Until then this page shows
              the built-in plans and can't save.
            </p>
          </div>
        )}

        <p className="text-[13px] text-muted-foreground">
          To make an exception for one organisation — switch a feature on or off just for them — open it from{" "}
          <Link to="/dashboard/admin/organizations" className="font-medium text-foreground underline underline-offset-2">Organizations</Link>.
          Super admins can always open every feature.
        </p>

        {plansQ.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border align-top">
                  <th scope="col" className="sticky left-0 z-10 w-64 bg-card p-3 text-left font-medium text-muted-foreground">Plan</th>
                  {draft.map((p) => (
                    <th key={p.key} scope="col" className="min-w-[160px] p-3 text-left font-normal">
                      <Input
                        aria-label={`${p.key} plan name`}
                        value={p.name}
                        onChange={(e) => update(p.key, (x) => ({ ...x, name: e.target.value }))}
                        className="h-8 text-[13px] font-semibold"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          <code>{p.key}</code> · {countsQ.data?.[p.key] ?? 0} org{(countsQ.data?.[p.key] ?? 0) === 1 ? "" : "s"}
                        </span>
                        {dirtyKeys.includes(p.key) && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Unsaved</Badge>}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Switch
                            checked={p.is_public}
                            onCheckedChange={(v) => update(p.key, (x) => ({ ...x, is_public: v }))}
                            aria-label={`Offer ${p.name} publicly`}
                          />
                          Public
                        </label>
                        {p.key !== "free" && saved.some((s) => s.key === p.key) && (
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`} disabled={missing}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-muted/40">
                  <th colSpan={draft.length + 1} scope="colgroup" className="sticky left-0 p-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Limits <span className="font-normal normal-case tracking-normal">— leave empty for unlimited. Shown on the plan; not enforced yet.</span>
                  </th>
                </tr>
                {LIMITS.map(({ key, label }) => (
                  <tr key={key} className="border-b border-border">
                    <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left font-medium">{label}</th>
                    {draft.map((p) => (
                      <td key={p.key} className="p-3">
                        <Input
                          type="number" min={0} inputMode="numeric"
                          aria-label={`${label} on ${p.name}`}
                          placeholder="Unlimited"
                          value={p.limits[key] < 0 ? "" : String(p.limits[key])}
                          onChange={(e) => setLimit(p.key, key, e.target.value)}
                          className="h-8 w-28 text-[13px]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}

                {FEATURE_GROUPS.map((group) => (
                  <FeatureGroupRows key={group.key} group={group} draft={draft} onToggle={toggleFeature} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddPlanDialog open={adding} onOpenChange={setAdding} existing={draft.map((p) => p.key)} onAdd={addPlan} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {deleting?.name} plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Only a plan with no organisations on it can be deleted. Move organisations to another plan first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && void remove(deleting)}>Delete plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function FeatureGroupRows({
  group,
  draft,
  onToggle,
}: {
  group: { key: string; label: string };
  draft: Plan[];
  onToggle: (plan: string, feature: string, on: boolean) => void;
}) {
  const features = FEATURES.filter((f) => f.group === group.key);
  return (
    <>
      <tr className="border-b border-border bg-muted/40">
        <th colSpan={draft.length + 1} scope="colgroup" className="sticky left-0 p-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group.label}
        </th>
      </tr>
      {features.map((f) => (
        <tr key={f.key} className="border-b border-border last:border-0 hover:bg-muted/20">
          <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left font-normal">
            <div className="flex items-center gap-2 font-medium">
              {f.label}
              {!f.enforced && <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">Label only</Badge>}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{f.description}</p>
          </th>
          {draft.map((p) => (
            <td key={p.key} className="p-3">
              <Checkbox
                checked={p.features.includes(f.key)}
                onCheckedChange={(v) => onToggle(p.key, f.key, v === true)}
                aria-label={`${f.label} on ${p.name}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function AddPlanDialog({
  open,
  onOpenChange,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: string[];
  onAdd: (key: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  useEffect(() => {
    if (open) { setName(""); setKey(""); setKeyTouched(false); }
  }, [open]);
  const derived = keyTouched ? key : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 32);
  const error = !derived
    ? null
    : !PLAN_KEY_PATTERN.test(derived)
      ? "Use 2–32 lowercase letters, digits or _, starting with a letter."
      : existing.includes(derived) ? "A plan with this key already exists." : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add a plan</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-plan-name">Name</Label>
            <Input id="new-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-plan-key">Key</Label>
            <Input
              id="new-plan-key" value={derived} placeholder="agency"
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toLowerCase()); }}
              aria-invalid={!!error} aria-describedby="new-plan-key-help"
            />
            <p id="new-plan-key-help" className={`text-[11px] ${error ? "text-destructive" : "text-muted-foreground"}`}>
              {error ?? "Stored on each organisation; can't be changed later."}
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground">It starts hidden, with the Free plan's features. Tick what it includes, then save.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onAdd(derived, name.trim() || derived)} disabled={!derived || !!error}>Add plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
