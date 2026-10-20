import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, ShieldAlert, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { useOrgEntitlements } from "@/hooks/usePlanFeatures";
import { supabase } from "@/integrations/supabase/client";
import { FEATURES, featureLabel } from "@/lib/plans/features";
import { buildUpgradeRequest } from "@/lib/plans/upgrade-request";

interface FeatureGateProps {
  /** Plan feature key. Without one, the content is always shown. */
  feature: string | undefined;
  /** The organisation whose plan applies. Defaults to the active workspace. */
  orgId?: string | null;
  children: ReactNode;
  /** Render nothing (instead of the upgrade panel) when the feature is missing. */
  hideWhenLocked?: boolean;
}

/**
 * Shows `children` only when the organisation's plan includes `feature`.
 * Otherwise explains what is missing and lets the organiser ask for it.
 * Super admins always see the content, with a note when the plan lacks it.
 */
export function FeatureGate({ feature, orgId, children, hideWhenLocked = false }: FeatureGateProps) {
  const { isAdmin } = useAuth();
  const { org } = useOrg();
  const targetOrgId = orgId === undefined ? org?.id ?? null : orgId;
  const { data: entitlements, isLoading } = useOrgEntitlements(feature ? targetOrgId : null);

  if (!feature || !targetOrgId) return <>{children}</>;
  if (isLoading) {
    return hideWhenLocked ? null : (
      <div className="flex justify-center py-16" role="status" aria-label="Checking your plan">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Unknown (server couldn't say): allowed — the database still guards writes.
  const allowed = !entitlements || entitlements.features.includes(feature);
  if (allowed) return <>{children}</>;

  if (isAdmin) {
    return (
      <>
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            {featureLabel(feature)} isn't on this organisation's {entitlements.plan_name} plan. You can see it because you're a super admin.{" "}
            <Link to="/dashboard/admin/organizations" className="font-medium underline underline-offset-2">Manage plan</Link>
          </span>
        </div>
        {children}
      </>
    );
  }

  if (hideWhenLocked) return null;
  return <LockedPanel feature={feature} orgId={targetOrgId} planName={entitlements.plan_name} plan={entitlements.plan} />;
}

function LockedPanel({ feature, orgId, planName, plan }: { feature: string; orgId: string; planName: string; plan: string }) {
  const { user } = useAuth();
  const { org, memberships } = useOrg();
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const description = FEATURES.find((f) => f.key === feature)?.description;
  const orgName = (org?.id === orgId ? org?.name : memberships.find((m) => m.org_id === orgId)?.org_name) ?? "this organisation";

  const request = async () => {
    if (!user?.email) return;
    setState("sending");
    const body = buildUpgradeRequest({
      name: (user.user_metadata?.full_name as string | undefined) ?? user.email,
      email: user.email,
      orgName,
      orgId,
      currentPlan: plan,
      feature,
      pageUrl: window.location.href,
    });
    const { data, error } = await supabase.functions.invoke("submit-support-ticket", { body });
    if (error || !(data as { success?: boolean } | null)?.success) {
      setState("idle");
      toast({ title: "Couldn't send the request", description: "Please try again, or write to sales@illuxus.com.", variant: "destructive" });
      return;
    }
    setState("sent");
    toast({
      title: "Request sent",
      description: `Ticket ${(data as { ticket_number?: string }).ticket_number ?? ""} — we'll email you when it's switched on.`,
    });
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold">{featureLabel(feature)} isn't included in your {planName} plan</h2>
      {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      <p className="mt-3 text-[13px] text-muted-foreground">
        Ask us to switch it on and we'll get back to you by email.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className="h-9 gap-1.5 text-[13px]" onClick={request} disabled={state !== "idle" || !user?.email}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {state === "sent" ? "Request sent" : state === "sending" ? "Sending…" : "Request access"}
        </Button>
        <Button asChild size="sm" variant="outline" className="h-9 text-[13px]">
          <Link to="/dashboard/billing">See plans</Link>
        </Button>
      </div>
    </div>
  );
}

/** A dialog that only explains a missing feature — for surfaces that open as dialogs. */
export function FeatureLockedDialog({
  feature,
  orgId,
  open,
  onOpenChange,
}: {
  feature: string;
  orgId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">{featureLabel(feature)} isn't on your plan</DialogTitle>
        <FeatureGate feature={feature} orgId={orgId}>{null}</FeatureGate>
      </DialogContent>
    </Dialog>
  );
}

export default FeatureGate;
