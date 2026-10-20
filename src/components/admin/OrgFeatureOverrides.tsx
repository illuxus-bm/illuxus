/**
 * Super admin: switch individual features on or off for one organisation,
 * on top of what its plan includes (organizations.feature_overrides).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgEntitlements, usePlans } from "@/hooks/usePlanFeatures";
import { supabaseRpc } from "@/lib/observability";
import { FEATURE_GROUPS, FEATURES, findPlan, type FeatureOverrides } from "@/lib/plans/features";

type Choice = "plan" | "on" | "off";

const toChoice = (overrides: FeatureOverrides, key: string): Choice =>
  overrides[key] === true ? "on" : overrides[key] === false ? "off" : "plan";

export function OrgFeatureOverrides({ orgId, planKey }: { orgId: string; planKey: string }) {
  const queryClient = useQueryClient();
  const { data: entitlements, isLoading } = useOrgEntitlements(orgId);
  const { data: plans = [] } = usePlans();
  const plan = findPlan(plans, planKey);
  const [draft, setDraft] = useState<FeatureOverrides>({});
  const [saving, setSaving] = useState(false);

  const savedOverrides = entitlements?.overrides ?? {};
  const savedJson = JSON.stringify(savedOverrides);
  useEffect(() => setDraft(JSON.parse(savedJson) as FeatureOverrides), [savedJson, orgId]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedOverrides);

  const setChoice = (key: string, choice: Choice) =>
    setDraft((d) => {
      const next = { ...d };
      if (choice === "plan") delete next[key];
      else next[key] = choice === "on";
      return next;
    });

  const save = async () => {
    setSaving(true);
    const { error } = await supabaseRpc("admin_set_org_features", { _oid: orgId, _overrides: draft });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save features", { description: error.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["org-entitlements"] });
    toast.success("Features updated", { description: "The organisation sees the change on its next page load." });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Features
        </p>
        <Button size="sm" className="h-7 text-[12px]" onClick={() => void save()} disabled={!dirty || saving || !entitlements}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save features
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        "Plan default" follows the {plan?.name ?? planKey} plan. Choose "On" or "Off" to make an exception for this organisation only.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : !entitlements ? (
        <p className="text-[12px] text-muted-foreground">
          Feature controls need the <code>048_plan_features.sql</code> database section to be applied.
        </p>
      ) : (
        FEATURE_GROUPS.map((group) => (
          <div key={group.key}>
            <p className="mb-1 mt-2 text-[11px] font-medium text-muted-foreground">{group.label}</p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {FEATURES.filter((f) => f.group === group.key).map((f) => {
                const inPlan = !!plan?.features.includes(f.key);
                const choice = toChoice(draft, f.key);
                const viaAddon = choice === "plan" && !inPlan && entitlements.features.includes(f.key);
                const effective = choice === "on" || (choice === "plan" && (inPlan || viaAddon));
                return (
                  <li key={f.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{f.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {effective ? "On" : "Off"}
                        {choice === "plan" && ` · plan default${viaAddon ? " (legacy add-on)" : ""}`}
                        {choice !== "plan" && ` · exception (plan: ${inPlan ? "on" : "off"})`}
                      </p>
                    </div>
                    <Select value={choice} onValueChange={(v) => setChoice(f.key, v as Choice)}>
                      <SelectTrigger className="h-7 w-[124px] text-[12px]" aria-label={`${f.label} for this organisation`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plan" className="text-[12px]">Plan default</SelectItem>
                        <SelectItem value="on" className="text-[12px]">On</SelectItem>
                        <SelectItem value="off" className="text-[12px]">Off</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

export default OrgFeatureOverrides;
