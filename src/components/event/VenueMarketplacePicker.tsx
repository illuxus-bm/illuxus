import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2,
  MapPin,
  Star,
  Search,
  ShieldCheck,
  Loader2,
  Check,
  ChevronLeft,
  Utensils,
  Clock,
  Users,
  Globe,
  CalendarCheck,
  ImageIcon,
  Sparkles,
} from "lucide-react";
import { useVenueVendors, type VenueVendor } from "@/hooks/useVenueVendors";
import { useVenueDetail, type VendorService } from "@/hooks/useVenueDetail";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently-selected venue vendor id, if any. Used to render a Selected
   *  badge on the matching card. */
  selectedVendorId?: string | null;
  /** Called when the organizer confirms a request. Parent handles the mutation. */
  onSelect: (vendor: VenueVendor) => void;
  /** Event date — used to hide vendors that are already booked or held for
   *  that date. Pass the raw event.date ISO string. */
  eventDate?: string | null;
  /** Optional city seed for the location filter (usually event.location). */
  seedCity?: string | null;
  /** Optional CTA label so callers can differentiate first-time selection
   *  ("Send request") from re-selection after a decline ("Re-send request"). */
  confirmLabel?: string;
  /** Disable the CTA while the parent mutation is in flight. */
  submitting?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The picker runs in two modes inside the same dialog:
 *   - "list"   →  product-grid of vendors matching the filters
 *   - "detail" →  a single vendor's portfolio + services + service areas
 *
 * Mode is local UI state; closing and re-opening the dialog resets it. We
 * keep both mounted (list is hidden when detail is open) so scroll position
 * and filters survive round-trips into the detail view.
 */
export function VenueMarketplacePicker({
  open,
  onOpenChange,
  selectedVendorId,
  onSelect,
  eventDate,
  seedCity,
  confirmLabel,
  submitting = false,
}: Props) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState(seedCity ?? "");
  const [mode, setMode] = useState<"list" | "detail">("list");
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null);

  const {
    data: vendors = [],
    isLoading,
    isFetching,
  } = useVenueVendors({
    search: search.trim() || undefined,
    city: city.trim() || undefined,
    eventDate: eventDate ?? null,
  });

  const detailVendor = useMemo(
    () => vendors.find((v) => v.id === detailVendorId) ?? null,
    [vendors, detailVendorId],
  );

  const handleClose = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      // Reset to list on close so re-opens don't drop the user in a stale detail.
      setMode("list");
      setDetailVendorId(null);
    }
  };

  const handleOpenDetail = (id: string) => {
    setDetailVendorId(id);
    setMode("detail");
  };

  const handleRequest = (vendor: VenueVendor) => {
    onSelect(vendor);
    // Close on select — matches the v1 picker so callers that only sync-set
    // state (EventQuickCreatePage) don't need to plumb an extra close signal.
    // Callers running an async mutation can re-open the picker themselves if
    // the request errors out.
    handleClose(false);
  };

  const dateLabel = useMemo(() => {
    if (!eventDate) return null;
    const d = new Date(eventDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [eventDate]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {mode === "list" ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-3 border-b">
              <DialogHeader>
                <DialogTitle className="text-lg">Pick a venue</DialogTitle>
                <DialogDescription>
                  Browse venues from the Illuxus vendor marketplace. Filter by
                  city, search by name, and open a venue for full services
                  and photos before requesting.
                </DialogDescription>
              </DialogHeader>

              {/* Filters */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr,220px,auto] gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search venues by name, tagline, description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                {dateLabel && (
                  <div className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-muted/40 text-[12px] text-muted-foreground whitespace-nowrap">
                    <CalendarCheck className="h-3.5 w-3.5 text-primary" />
                    <span className="text-foreground font-medium">
                      Available on {dateLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Result count */}
              <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
                <span>
                  {isFetching ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing…
                    </span>
                  ) : (
                    `${vendors.length} venue${vendors.length === 1 ? "" : "s"}${
                      dateLabel ? " available" : ""
                    }`
                  )}
                </span>
                {selectedVendorId && (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="h-3 w-3" />
                    Current selection kept
                  </Badge>
                )}
              </div>
            </div>

            {/* Grid */}
            <ScrollArea className="flex-1">
              <div className="px-6 py-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : vendors.length === 0 ? (
                  <EmptyState eventDateGiven={!!eventDate} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vendors.map((v) => (
                      <VendorCard
                        key={v.id}
                        vendor={v}
                        selected={selectedVendorId === v.id}
                        onOpen={() => handleOpenDetail(v.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-3 border-t bg-muted/20">
              <p className="text-[11px] text-muted-foreground flex-1">
                On request, the venue owner will get an email with your event
                details. You'll be notified when they respond.
              </p>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <VendorDetailView
            vendor={detailVendor}
            selected={detailVendor?.id === selectedVendorId}
            confirmLabel={confirmLabel ?? "Send request"}
            submitting={submitting}
            eventDateLabel={dateLabel}
            onBack={() => setMode("list")}
            onRequest={(v) => handleRequest(v)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor card (list mode)
// ─────────────────────────────────────────────────────────────────────────────

function VendorCard({
  vendor,
  selected,
  onOpen,
}: {
  vendor: VenueVendor;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group text-left rounded-lg border overflow-hidden flex flex-col bg-card transition-all",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* Cover */}
      <div className="relative aspect-[16/10] bg-muted overflow-hidden">
        {vendor.cover_url ? (
          <img
            src={vendor.cover_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        {selected && (
          <div className="absolute top-2 left-2">
            <Badge className="gap-1 shadow">
              <Check className="h-3 w-3" />
              Selected
            </Badge>
          </div>
        )}
        {vendor.verification_status === "verified" && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="gap-1 shadow bg-background/90 backdrop-blur">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-snug line-clamp-1">
            {vendor.business_name}
          </h3>
          {typeof vendor.rating_avg === "number" && vendor.rating_count > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              <span className="font-medium text-foreground">
                {vendor.rating_avg.toFixed(1)}
              </span>
              <span className="opacity-60">({vendor.rating_count})</span>
            </div>
          )}
        </div>

        {vendor.tagline && (
          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">
            {vendor.tagline}
          </p>
        )}

        <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 min-w-0">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {vendor.city ? vendor.city : "Location on request"}
              {vendor.country ? `, ${vendor.country}` : ""}
            </span>
          </span>
          {vendor.service_count > 0 && (
            <span className="shrink-0">
              {vendor.service_count} service{vendor.service_count === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">Starting from</span>
          <span className="text-sm font-semibold">
            {vendor.starting_price !== null
              ? formatMoney(vendor.starting_price, vendor.default_currency)
              : "Quote on request"}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ eventDateGiven }: { eventDateGiven: boolean }) {
  return (
    <div className="text-center py-16 text-sm text-muted-foreground">
      <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
      <p className="font-medium text-foreground">No venues match your filters</p>
      <p className="text-xs mt-1">
        {eventDateGiven
          ? "Every venue we've indexed is already booked, held, or outside your city on that date. Try widening the filters."
          : "Try clearing the filters or invite more vendors to the marketplace."}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────────────────────────────────────────

function VendorDetailView({
  vendor,
  selected,
  confirmLabel,
  submitting,
  eventDateLabel,
  onBack,
  onRequest,
}: {
  vendor: VenueVendor | null;
  selected: boolean;
  confirmLabel: string;
  submitting: boolean;
  eventDateLabel: string | null;
  onBack: () => void;
  onRequest: (vendor: VenueVendor) => void;
}) {
  const { data: detail, isLoading } = useVenueDetail(vendor?.id ?? null);

  if (!vendor) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading venue…
      </div>
    );
  }

  return (
    <>
      {/* Back bar */}
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to venues
        </Button>
        <div className="ml-auto text-[11px] text-muted-foreground truncate">
          {eventDateLabel && (
            <span className="inline-flex items-center gap-1">
              <CalendarCheck className="h-3 w-3 text-primary" />
              Available on {eventDateLabel}
            </span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Cover */}
          <div className="aspect-[16/8] rounded-lg overflow-hidden bg-muted relative">
            {vendor.cover_url ? (
              <img
                src={vendor.cover_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-40" />
              </div>
            )}
            {vendor.verification_status === "verified" && (
              <Badge
                variant="secondary"
                className="absolute top-3 right-3 gap-1 shadow bg-background/90 backdrop-blur"
              >
                <ShieldCheck className="h-3 w-3" />
                Verified
              </Badge>
            )}
          </div>

          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold leading-tight">
                  {vendor.business_name}
                </h2>
                {vendor.tagline && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {vendor.tagline}
                  </p>
                )}
              </div>
              {typeof vendor.rating_avg === "number" && vendor.rating_count > 0 && (
                <div className="flex items-center gap-1 text-sm shrink-0">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  <span className="font-semibold">
                    {vendor.rating_avg.toFixed(1)}
                  </span>
                  <span className="text-muted-foreground">
                    ({vendor.rating_count})
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {vendor.city && (
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="h-3 w-3" />
                  {vendor.city}
                  {vendor.country ? `, ${vendor.country}` : ""}
                </Badge>
              )}
              {detail?.years_experience && detail.years_experience > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  {detail.years_experience}+ years
                </Badge>
              )}
              {detail?.response_time_hours && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  Responds in ~{detail.response_time_hours}h
                </Badge>
              )}
              {detail?.website && (
                <a
                  href={detail.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <Globe className="h-3 w-3" />
                  Website
                </a>
              )}
            </div>
          </div>

          {/* Bio */}
          {detail?.bio && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">About</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {detail.bio}
              </p>
            </section>
          )}

          {/* Portfolio */}
          {isLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading photos and services…
            </div>
          ) : (
            <>
              {detail && detail.portfolio.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Photos</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {detail.portfolio.slice(0, 9).map((p) => (
                      <div
                        key={p.id}
                        className="aspect-square bg-muted rounded-md overflow-hidden"
                      >
                        {p.media_type === "video" ? (
                          <video
                            src={p.url}
                            className="w-full h-full object-cover"
                            controls
                          />
                        ) : (
                          <img
                            src={p.url}
                            alt={p.caption ?? ""}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Services */}
              {detail && detail.services.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Services</h3>
                  <div className="space-y-3">
                    {detail.services.map((s) => (
                      <ServiceCard key={s.id} service={s} />
                    ))}
                  </div>
                </section>
              )}

              {/* Service areas */}
              {detail && detail.service_areas.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Service areas</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.service_areas.map((a) => (
                      <Badge key={a.id} variant="outline" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        {a.city}, {a.country}
                        {a.radius_km ? ` · ${a.radius_km}km` : ""}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* CTA bar */}
      <div className="border-t px-6 py-3 flex items-center gap-3 bg-background">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate">
            {vendor.business_name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            The owner will get an email with your event details. You'll be
            notified here when they respond.
          </p>
        </div>
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button
          onClick={() => onRequest(vendor)}
          disabled={submitting || selected}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : selected ? (
            <Check className="h-4 w-4 mr-1.5" />
          ) : null}
          {selected ? "Already selected" : confirmLabel}
        </Button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Service card
// ─────────────────────────────────────────────────────────────────────────────

const UNIT_LABEL: Record<VendorService["unit"], string> = {
  per_hour: "/ hour",
  per_event: "/ event",
  per_person: "/ person",
  per_day: "/ day",
  flat: "flat",
};

function ServiceCard({ service }: { service: VendorService }) {
  return (
    <div className="border border-border rounded-lg p-3.5 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{service.title}</h4>
            {service.is_instant_book && (
              <Badge className="text-[10px]">Instant book</Badge>
            )}
          </div>
          {service.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">
              {service.description}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {service.quote_on_request || !service.base_price ? (
            <span className="text-xs text-muted-foreground">Quote on request</span>
          ) : (
            <>
              <div className="text-sm font-semibold whitespace-nowrap">
                {formatMoney(service.base_price, service.currency)}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {UNIT_LABEL[service.unit]}
              </div>
            </>
          )}
        </div>
      </div>

      {(service.duration || service.addons.length > 0) && (
        <div className="pt-2 border-t border-dashed border-border space-y-2">
          {service.duration && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{service.duration}</span>
            </div>
          )}

          {service.addons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Utensils className="h-3 w-3" />
                Add-ons
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {service.addons.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-[12px] px-2 py-1 rounded bg-muted/40"
                  >
                    <span className="truncate">
                      {a.name}
                      {!a.is_optional && (
                        <span className="text-muted-foreground"> · included</span>
                      )}
                    </span>
                    <span className="font-medium tabular-nums shrink-0 pl-2">
                      {a.price > 0
                        ? formatMoney(a.price, service.currency)
                        : "Free"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
