import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, MapPin, Star, Search, ShieldCheck, Loader2, Check } from "lucide-react";
import { useVenueVendors, type VenueVendor } from "@/hooks/useVenueVendors";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently-selected venue vendor id, if any */
  selectedVendorId?: string | null;
  /** Called when the organizer confirms a selection */
  onSelect: (vendor: VenueVendor) => void;
}

/**
 * A dialog that lists all "venue" vendors from the shared vendor marketplace
 * and lets the organizer pick one during event setup. On confirm, the parent
 * receives the full vendor object so it can record the selection and trigger
 * the outbound notification.
 */
export function VenueMarketplacePicker({
  open,
  onOpenChange,
  selectedVendorId,
  onSelect,
}: Props) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(selectedVendorId ?? null);

  const { data: vendors = [], isLoading } = useVenueVendors({
    search: search.trim() || undefined,
    city: city.trim() || undefined,
  });

  const picked = vendors.find((v) => v.id === pickedId) ?? null;

  const handleConfirm = () => {
    if (picked) {
      onSelect(picked);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick a venue</DialogTitle>
          <DialogDescription>
            Browse venues from the Illuxus vendor marketplace. The venue owner will be
            notified by email when you make a selection.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search venues by name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No venues found. Try clearing filters or ask venues to sign up on
                the vendor portal.</p>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {vendors.map((v) => (
                <VenueCard
                  key={v.id}
                  vendor={v}
                  selected={pickedId === v.id}
                  onClick={() => setPickedId(v.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!picked}>
            {picked ? (
              <>
                <Check className="mr-1 h-4 w-4" />
                Select {picked.business_name}
              </>
            ) : (
              "Choose a venue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

function VenueCard({
  vendor,
  selected,
  onClick,
}: {
  vendor: VenueVendor;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left transition-colors rounded-lg border overflow-hidden",
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border hover:border-primary/40"
      )}
    >
      <Card className="border-0 shadow-none">
        <CardContent className="p-0">
          <div className="flex gap-3">
            {/* Cover */}
            <div className="w-28 h-28 flex-shrink-0 bg-muted overflow-hidden">
              {vendor.cover_url ? (
                <img
                  src={vendor.cover_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 py-3 pr-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">
                      {vendor.business_name}
                    </h3>
                    {vendor.verification_status === "verified" && (
                      <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  {vendor.tagline && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {vendor.tagline}
                    </p>
                  )}
                </div>
                {typeof vendor.rating_avg === "number" && vendor.rating_count > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    {vendor.rating_avg.toFixed(1)}
                    <span className="opacity-60">({vendor.rating_count})</span>
                  </div>
                )}
              </div>

              {vendor.bio && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5">
                  {vendor.bio}
                </p>
              )}

              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                {vendor.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {vendor.city}
                    {vendor.country ? `, ${vendor.country}` : ""}
                  </span>
                )}
                <span>Currency: {vendor.default_currency}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
