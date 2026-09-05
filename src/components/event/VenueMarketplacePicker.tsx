import { useState, useMemo, useEffect } from "react";
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
import {
  useVenueDetail,
  type VendorDetail,
  type VendorService,
} from "@/hooks/useVenueDetail";
import {
  useVendorAvailability,
  type VendorBusyDay,
} from "@/hooks/useVendorAvailability";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarX2 } from "lucide-react";
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
  /** Called when the organizer confirms a request. Parent handles the mutation.
   *  `selectedServiceIds` is an array of vendor_services.id — empty when the
   *  organizer sends a plain "we want this venue" request. */
  onSelect: (
    vendor: VenueVendor,
    selectedServiceIds: string[],
  ) => void;
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

  const handleRequest = (
    vendor: VenueVendor,
    selectedServiceIds: string[],
  ) => {
    onSelect(vendor, selectedServiceIds);
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
            eventDate={eventDate ?? null}
            eventDateLabel={dateLabel}
            onBack={() => setMode("list")}
            onRequest={(v, ids) => handleRequest(v, ids)}
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
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-snug line-clamp-1">
              {vendor.business_name}
            </h3>
            {vendor.vendor_business_name &&
              vendor.vendor_business_name !== vendor.business_name && (
                <p className="text-[10px] text-muted-foreground truncate">
                  by {vendor.vendor_business_name}
                </p>
              )}
          </div>
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

        {/* Venue-specific chips: space type + largest capacity. Rendered
            as small pills instead of body text so they scan at a glance. */}
        {(vendor.space_type || vendor.max_capacity) && (
          <div className="flex flex-wrap items-center gap-1">
            {vendor.space_type && (
              <Badge variant="secondary" className="text-[10px] capitalize">
                {vendor.space_type.replace(/_/g, " ")}
              </Badge>
            )}
            {vendor.max_capacity != null && (
              <Badge variant="outline" className="text-[10px]">
                Up to {vendor.max_capacity}
                {vendor.max_capacity_layout ? ` · ${vendor.max_capacity_layout}` : ""}
              </Badge>
            )}
          </div>
        )}

        {vendor.tagline && (
          <p className="text-xs text-muted-foreground line-clamp-2">
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
  eventDate,
  eventDateLabel,
  onBack,
  onRequest,
}: {
  vendor: VenueVendor | null;
  selected: boolean;
  confirmLabel: string;
  submitting: boolean;
  eventDate: string | null;
  eventDateLabel: string | null;
  onBack: () => void;
  onRequest: (vendor: VenueVendor, selectedServiceIds: string[]) => void;
}) {
  const { data: detail, isLoading } = useVenueDetail(vendor?.id ?? null);
  const { data: busyDays = [], isLoading: busyLoading } = useVendorAvailability(
    vendor?.id ?? null,
    { focusDate: eventDate },
  );

  // Local multi-select state for service checkboxes. Resets when the
  // organizer opens a different vendor's detail view (we key it on
  // vendor.id via useState + useEffect below).
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(
    new Set(),
  );
  useEffect(() => {
    setSelectedServiceIds(new Set());
  }, [vendor?.id]);

  // Event-date availability status — dominates the top of the detail view
  // so the organizer knows immediately whether their date is safe.
  const eventDateIso = useMemo(() => toIsoDate(eventDate), [eventDate]);
  const eventDateConflict = useMemo(
    () => busyDays.find((d) => d.date === eventDateIso) ?? null,
    [busyDays, eventDateIso],
  );

  if (!vendor) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading venue…
      </div>
    );
  }

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
              {detail && <VenueDetailSections detail={detail} />}
              {detail && detail.media.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Photos & floor plan</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {detail.media.slice(0, 12).map((m) => (
                      <a
                        key={m.id}
                        href={m.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="aspect-square bg-muted rounded-md overflow-hidden block group relative"
                      >
                        {isImageUrl(m.url) ? (
                          <img
                            src={m.url}
                            alt={m.caption ?? ""}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground text-[10px]">
                            <Building2 className="h-6 w-6 mb-1" />
                            View {m.media_kind.replace(/_/g, " ")}
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className="absolute bottom-1 left-1 text-[9px] capitalize bg-background/80"
                        >
                          {m.media_kind.replace(/_/g, " ")}
                        </Badge>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Availability — show event-date conflict and nearby busy
                  dates so the organizer can gauge how tightly booked the
                  venue is. Uses vendor_availability + accepted selections. */}
              <AvailabilityPanel
                busyDays={busyDays}
                loading={busyLoading}
                eventDate={eventDateIso}
                eventDateLabel={eventDateLabel}
                conflict={eventDateConflict}
              />

              {/* Services — each row is a checkbox so the organizer can
                  pre-select which packages they want. The vendor sees the
                  chosen titles on their Inbox card. */}
              {detail && detail.services.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Services</h3>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedServiceIds.size > 0
                        ? `${selectedServiceIds.size} selected`
                        : "Tap to include a service in your request"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {detail.services.map((s) => (
                      <ServiceCard
                        key={s.id}
                        service={s}
                        checked={selectedServiceIds.has(s.id)}
                        onToggle={() => toggleService(s.id)}
                      />
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
          onClick={() =>
            onRequest(vendor, Array.from(selectedServiceIds))
          }
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

function ServiceCard({
  service,
  checked,
  onToggle,
}: {
  service: VendorService;
  checked: boolean;
  onToggle: () => void;
}) {
  const cardId = `svc-${service.id}`;
  return (
    <label
      htmlFor={cardId}
      className={cn(
        "flex gap-3 border rounded-lg p-3.5 bg-card cursor-pointer transition-colors",
        checked
          ? "border-primary ring-1 ring-primary/40 bg-primary/[0.03]"
          : "border-border hover:border-primary/40",
      )}
    >
      <Checkbox
        id={cardId}
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-1 shrink-0"
      />
      <div className="flex-1 min-w-0 space-y-2">
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
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability panel — surfaces the vendor's busy dates around the event.
// ─────────────────────────────────────────────────────────────────────────────

function AvailabilityPanel({
  busyDays,
  loading,
  eventDate,
  eventDateLabel,
  conflict,
}: {
  busyDays: VendorBusyDay[];
  loading: boolean;
  eventDate: string;
  eventDateLabel: string | null;
  conflict: VendorBusyDay | null;
}) {
  if (loading) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Availability</h3>
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking the vendor's calendar…
        </div>
      </section>
    );
  }

  // No target event date + no known busy days → skip the section entirely
  // instead of showing a hollow "nothing to see here" panel.
  if (!eventDate && busyDays.length === 0) return null;

  // Show at most 8 upcoming busy days so the panel doesn't dominate the
  // detail view for a fully-booked vendor.
  const visibleBusy = busyDays.slice(0, 8);
  const overflow = busyDays.length - visibleBusy.length;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Availability</h3>

      {eventDate && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            conflict
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
          )}
        >
          {conflict ? (
            <CalendarX2 className="h-4 w-4 shrink-0" />
          ) : (
            <CalendarCheck className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">
            {conflict ? (
              <>
                <span className="font-medium">
                  Unavailable on {eventDateLabel ?? eventDate}
                </span>
                <span className="ml-1 text-xs opacity-80">
                  ({availabilityReasonLabel(conflict.reason)}
                  {conflict.note ? ` · ${conflict.note}` : ""})
                </span>
              </>
            ) : (
              <span className="font-medium">
                Available on {eventDateLabel ?? eventDate}
              </span>
            )}
          </span>
        </div>
      )}

      {visibleBusy.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Other busy dates
          </p>
          <ul className="space-y-1">
            {visibleBusy.map((d) => (
              <li
                key={d.date}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <CalendarX2 className="h-3 w-3 text-red-400" />
                <span className="font-medium text-foreground tabular-nums">
                  {formatBusyDate(d.date)}
                </span>
                <span className="opacity-80">
                  · {availabilityReasonLabel(d.reason)}
                  {d.note ? ` — ${d.note}` : ""}
                </span>
              </li>
            ))}
            {overflow > 0 && (
              <li className="text-[11px] text-muted-foreground italic">
                +{overflow} more busy date{overflow === 1 ? "" : "s"} in this window
              </li>
            )}
          </ul>
        </div>
      ) : eventDate && !conflict ? (
        <p className="text-xs text-muted-foreground">
          No other bookings on record in the next 90 days.
        </p>
      ) : null}
    </section>
  );
}

function availabilityReasonLabel(reason: VendorBusyDay["reason"]): string {
  switch (reason) {
    case "booked":
      return "Booked";
    case "held":
      return "On hold";
    case "accepted_selection":
      return "Reserved for another event";
    default:
      return "Unavailable";
  }
}

function formatBusyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Extract calendar date (YYYY-MM-DD) from an ISO timestamp — mirrors the
 *  helper in useVenueVendors / useVendorAvailability so the picker
 *  compares like-with-like when checking event date vs. busy dates. */
function toIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Venue detail sections — dimensions, capacity table, amenities, policies,
// logistics. Only renders sections that have data so a sparsely-filled venue
// doesn't show a bunch of empty rows.
// ─────────────────────────────────────────────────────────────────────────────

function VenueDetailSections({ detail }: { detail: VendorDetail }) {
  return (
    <>
      <DimensionsSection detail={detail} />
      <CapacityTable detail={detail} />
      <AmenitiesSection detail={detail} />
      <PoliciesSection detail={detail} />
      <LogisticsSection detail={detail} />
    </>
  );
}

function DimensionsSection({ detail }: { detail: VendorDetail }) {
  const rows: Array<[string, string]> = [];
  if (detail.area_sqft != null) rows.push(["Total area", `${detail.area_sqft.toLocaleString()} sq ft`]);
  if (detail.length_ft != null && detail.width_ft != null) {
    rows.push(["Dimensions", `${detail.length_ft} × ${detail.width_ft} ft`]);
  }
  if (detail.ceiling_height_ft != null) rows.push(["Ceiling height", `${detail.ceiling_height_ft} ft`]);
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Dimensions & physical space</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-[11px]">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CapacityTable({ detail }: { detail: VendorDetail }) {
  const rows: Array<[string, number]> = [];
  if (detail.capacity_floating != null) rows.push(["Floating / reception", detail.capacity_floating]);
  if (detail.capacity_theater != null) rows.push(["Theater", detail.capacity_theater]);
  if (detail.capacity_banquet != null) rows.push(["Banquet", detail.capacity_banquet]);
  if (detail.capacity_ushape != null) rows.push(["U-Shape", detail.capacity_ushape]);
  if (detail.capacity_classroom != null) rows.push(["Classroom", detail.capacity_classroom]);
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Seating capacity</h3>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-[12px]">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={k} className={i > 0 ? "border-t border-border" : ""}>
                <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
                <td className="px-3 py-1.5 text-right font-medium">{v.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AmenitiesSection({ detail }: { detail: VendorDetail }) {
  const chips: string[] = [];
  if (detail.climate_control) chips.push(climateLabel(detail.climate_control));
  if (detail.has_stage) {
    chips.push(detail.stage_dimensions ? `Stage (${detail.stage_dimensions})` : "Stage");
  }
  if (detail.green_rooms_count != null && detail.green_rooms_count > 0) {
    chips.push(`${detail.green_rooms_count} green room${detail.green_rooms_count === 1 ? "" : "s"}`);
  }
  if (detail.has_projector) chips.push("Projector");
  if (detail.has_screen) chips.push("Screen");
  if (detail.has_sound_system) chips.push("Sound system");
  if (detail.has_microphones) chips.push("Microphones");
  if (detail.has_power_backup) chips.push("Power backup");
  if (detail.has_wifi) chips.push("Wi-Fi");
  if (chips.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Amenities & facilities</h3>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Badge key={c} variant="secondary" className="text-[11px] font-normal">
            {c}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function PoliciesSection({ detail }: { detail: VendorDetail }) {
  const rows: Array<[string, string]> = [];
  if (detail.catering_policy) rows.push(["Catering", policyLabel("catering", detail.catering_policy)]);
  if (detail.decor_policy) rows.push(["Decor", policyLabel("decor", detail.decor_policy)]);
  if (detail.alcohol_policy) rows.push(["Alcohol", policyLabel("alcohol", detail.alcohol_policy)]);
  if (detail.music_curfew_time) {
    rows.push(["Music curfew", detail.music_curfew_time.slice(0, 5)]);
  }
  if (detail.noise_restrictions) rows.push(["Restrictions", detail.noise_restrictions]);
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Policies & rules</h3>
      <dl className="space-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,110px)_1fr] gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LogisticsSection({ detail }: { detail: VendorDetail }) {
  const items: Array<[string, string]> = [];
  if (detail.parking_car_capacity != null) {
    items.push(["Parking (cars)", detail.parking_car_capacity.toLocaleString()]);
  }
  if (detail.parking_two_wheeler_capacity != null) {
    items.push(["Parking (two-wheelers)", detail.parking_two_wheeler_capacity.toLocaleString()]);
  }
  const chips: string[] = [];
  if (detail.has_valet) chips.push("Valet service");
  if (detail.wheelchair_accessible) chips.push("Wheelchair accessible");
  if (detail.has_elevator) chips.push("Elevator access");
  if (items.length === 0 && chips.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Logistics & accessibility</h3>
      {items.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground text-[11px]">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {chips.map((c) => (
            <Badge key={c} variant="outline" className="text-[11px]">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function climateLabel(v: string): string {
  switch (v) {
    case "central_ac": return "Central AC";
    case "split_ac":   return "Split AC";
    case "non_ac":     return "Non-AC";
    default:            return v;
  }
}

function policyLabel(kind: "catering" | "decor" | "alcohol", v: string): string {
  const map: Record<string, string> = {
    in_house_only:        "In-house only",
    outside_permitted:    "Outside permitted",
    empanelled_only:      "Empanelled decorators only",
    client_choice:        "Client can bring own",
    outside_with_license: "Outside permitted with license",
    prohibited:           "Not allowed",
    both:                 "Both allowed",
  };
  return map[v] ?? v;
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}
