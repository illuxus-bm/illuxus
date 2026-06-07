import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradeGateProps {
  feature?: string;
  checkEventLimit?: boolean;
  children: React.ReactNode;
  fallbackMessage?: string;
}

export function UpgradeGate({ feature, checkEventLimit, children, fallbackMessage }: UpgradeGateProps) {
  const { org, canCreateEvent, hasFeature } = useOrg();
  const navigate = useNavigate();

  const blocked = (feature && !hasFeature(feature)) || (checkEventLimit && !canCreateEvent);

  if (!blocked) return <>{children}</>;

  const plan = org?.plan || "free";
  const planName = PLAN_DETAILS[plan]?.name || "Free";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">
        {fallbackMessage || "Upgrade required"}
      </h3>
      <p className="text-[13px] text-muted-foreground mb-4 max-w-xs">
        {checkEventLimit
          ? `You've reached the event limit on your ${planName} plan. Upgrade to create more events.`
          : `This feature is not available on the ${planName} plan. Upgrade to unlock it.`}
      </p>
      <Button
        onClick={() => navigate("/dashboard/billing")}
        size="sm"
        className="h-8 text-[13px] gap-1"
      >
        <Sparkles className="h-3.5 w-3.5" /> View Plans
      </Button>
    </div>
  );
}
