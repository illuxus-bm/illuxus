import { Button } from "@/components/ui/button";
import { Award, ExternalLink } from "lucide-react";
import type { RendererSponsor } from "../PublicEventRenderer";
import QuickViewDialog from "./QuickViewDialog";

export default function SponsorQuickViewDialog({
  sponsor, open, onOpenChange,
}: {
  sponsor: RendererSponsor | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!sponsor) return null;
  const tierDisplay = sponsor.tier === "custom" ? (sponsor.tier_label || "Sponsor") : sponsor.tier;
  return (
    <QuickViewDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="Sponsor"
      media={
        <div className="h-28 w-56 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
          {sponsor.logo_url ? (
            <img src={sponsor.logo_url} alt={sponsor.name} className="h-full w-full object-contain p-3" />
          ) : (
            <Award className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
      }
      badge={tierDisplay || undefined}
      title={sponsor.name}
      actions={
        sponsor.website ? (
          <Button asChild size="sm" className="gap-1.5 rounded-full mt-1">
            <a href={sponsor.website} target="_blank" rel="noreferrer">
              Visit website <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : undefined
      }
      bodyLabel={sponsor.description ? "Description" : undefined}
      body={sponsor.description || undefined}
    />
  );
}