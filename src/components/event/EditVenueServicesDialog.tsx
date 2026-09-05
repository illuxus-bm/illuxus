import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useVenueDetail } from "@/hooks/useVenueDetail";
import { useUpdateVenueSelectionServices } from "@/hooks/useSelectVenueVendor";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Post-acceptance edit surface. The organizer opens this from the confirmed
 * venue card, ticks or unticks any subset of the vendor's active services,
 * and Save updates the `selected_service_ids` array on the same
 * `event_venue_selections` row (mutation defined in
 * useUpdateVenueSelectionServices).
 *
 * Deliberately kept as a straight multi-select: no add-on-level toggles, no
 * quantity fields, no per-service notes. The vendor already has the row and
 * has already accepted; this dialog only exists so the organizer can amend
 * their ask without withdrawing + re-picking the whole venue.
 *
 * When the vendor deletes a service the organizer previously selected, the
 * stale id lives on in `selected_service_ids` but simply doesn't render as
 * a card — the useVenueDetail fetch only returns active services. On Save
 * we overwrite the array with the current tick set, which quietly evicts
 * any such stale ids.
 */
export function EditVenueServicesDialog({
  open,
  onOpenChange,
  selectionId,
  eventId,
  venueId,
  vendorName,
  initialServiceIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionId: string;
  eventId: string;
  /** Persisted on event_venue_selections.venue_id (migration 036). */
  venueId: string;
  vendorName: string;
  initialServiceIds: string[];
}) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useVenueDetail(open ? venueId : null);
  const updateServices = useUpdateVenueSelectionServices();

  // Local ticked-state driven off the persisted list. We copy on open so a
  // Cancel truly reverts, and re-copy whenever the persisted list changes
  // underneath us (e.g. realtime tick from another organizer).
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(initialServiceIds),
  );
  useEffect(() => {
    if (open) setTicked(new Set(initialServiceIds));
  }, [open, initialServiceIds]);

  const originalSet = useMemo(
    () => new Set(initialServiceIds),
    [initialServiceIds],
  );
  const dirty = useMemo(() => {
    if (ticked.size !== originalSet.size) return true;
    for (const id of ticked) if (!originalSet.has(id)) return true;
    return false;
  }, [ticked, originalSet]);

  const toggle = (id: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await updateServices.mutateAsync({
        selectionId,
        eventId,
        selectedServiceIds: Array.from(ticked),
      });
      toast({
        title: "Services updated",
        description: `${vendorName} will see the updated list on their next inbox refresh.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not update services",
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong. Try again.",
        variant: "destructive",
      });
    }
  };

  const services = detail?.services ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit services · {vendorName}</DialogTitle>
          <DialogDescription>
            Add or remove services from your venue booking. The venue owner
            sees the updated list in their Inbox — no need to re-request.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading services…
            </div>
          ) : services.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This venue hasn't listed any services yet. Contact them
              directly to discuss what you need.
            </p>
          ) : (
            <ul className="space-y-2">
              {services.map((s) => {
                const checked = ticked.has(s.id);
                return (
                  <li key={s.id}>
                    <label
                      className={cn(
                        "flex gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                        checked
                          ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(s.id)}
                        className="mt-1 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {s.title}
                              </p>
                              {s.is_instant_book && (
                                <Badge className="text-[10px]">
                                  Instant book
                                </Badge>
                              )}
                            </div>
                            {s.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {s.description}
                              </p>
                            )}
                            {s.addons.length > 0 && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {s.addons.length} add-on
                                {s.addons.length === 1 ? "" : "s"} available
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0 min-w-[70px]">
                            {s.quote_on_request || !s.base_price ? (
                              <span className="text-[11px] text-muted-foreground">
                                Quote on request
                              </span>
                            ) : (
                              <p className="text-sm font-semibold whitespace-nowrap">
                                {formatMoney(s.base_price, s.currency)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex-1 text-[12px] text-muted-foreground self-center">
            {ticked.size} selected
            {dirty ? " · unsaved changes" : ""}
          </div>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={updateServices.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || updateServices.isPending || isLoading}
          >
            {updateServices.isPending && (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
