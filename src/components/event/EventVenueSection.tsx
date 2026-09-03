import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  CalendarCheck,
  MapPin,
  Star,
  ShieldCheck,
  Loader2,
  Sparkles,
  Check,
  X,
  Info,
  RefreshCw,
  Mail,
  Clock,
  ArrowRight,
} from "lucide-react";
import { VenueMarketplacePicker } from "@/components/event/VenueMarketplacePicker";
import { useVenueDetail } from "@/hooks/useVenueDetail";
import {
  useSelectVenueVendor,
  useEventVenueSelection,
  useCancelVenueSelection,
  type EventVenueSelection,
  type VenueSelectionStatus,
} from "@/hooks/useSelectVenueVendor";
import type { VenueVendor } from "@/hooks/useVenueVendors";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface EventLite {
  id: string;
  title: string;
  date: string | null;
  end_date: string | null;
  location: string | null;
  capacity: number | null;
  org_id: string | null;
  venue: string | null;
}

/**
 * Organizer-facing home for the venue booking flow.
 *
 * States (driven by `event_venue_selections.status`):
 *   • no row              → onboarding CTA + Browse venues
 *   • contacted           → request-sent card + Cancel + Change venue
 *   • accepted            → confirmed card + booking summary
 *   • declined / cancelled → dead-end banner + Pick another venue
 */
export default function EventVenueSection({ eventId }: { eventId: string }) {
  const { org } = useOrg();
  const { toast } = useToast();

  const [event, setEvent] = useState<EventLite | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    data: selection,
    isLoading: selectionLoading,
    refetch: refetchSelection,
  } = useEventVenueSelection(eventId);
  const selectVendor = useSelectVenueVendor();
  const cancelSelection = useCancelVenueSelection();

  // ─── Load the event ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, date, end_date, location, capacity, org_id, venue")
        .eq("id", eventId)
        .maybeSingle();
      if (cancelled) return;
      setEvent(data as EventLite | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // ─── Realtime updates on the selection row ─────────────────────────────
  // Keeps the status card fresh while the organizer is looking at it — the
  // vendor's accept / decline is otherwise invisible until a manual refresh.
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event-venue-selection-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_venue_selections",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void refetchSelection();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, refetchSelection]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleSelect = async (
    vendor: VenueVendor,
    selectedServiceIds: string[],
  ) => {
    if (!org?.id) {
      toast({
        title: "Missing workspace",
        description: "Switch to a workspace before selecting a venue.",
        variant: "destructive",
      });
      return;
    }
    try {
      await selectVendor.mutateAsync({
        eventId,
        vendorId: vendor.id,
        orgId: org.id,
        selectedServiceIds,
      });
      toast({
        title: "Request sent",
        description: `${vendor.business_name} will be notified by email. You'll see their response here.`,
      });
    } catch (err) {
      toast({
        title: "Could not send request",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    if (!selection) return;
    if (
      !confirm(
        `Withdraw your request to ${selection.vendor?.business_name ?? "this venue"}?`,
      )
    )
      return;
    try {
      await cancelSelection.mutateAsync({
        selectionId: selection.id,
        eventId,
      });
      toast({ title: "Request withdrawn" });
    } catch (err) {
      toast({
        title: "Could not withdraw request",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const isLoading = !event || selectionLoading;
  const status: VenueSelectionStatus | null = selection?.status ?? null;
  const isLive = status === "contacted" || status === "accepted";

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Intro */}
      <div>
        <h2 className="text-lg font-semibold">Venue</h2>
        <p className="text-sm text-muted-foreground">
          Book a venue from the Illuxus vendor marketplace, or leave this blank
          and use your own venue in the location field of Settings.
        </p>
      </div>

      {/* Event context strip */}
      <EventContextStrip event={event} />

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading venue status…
        </div>
      ) : selection ? (
        <SelectionCard
          selection={selection}
          onCancel={handleCancel}
          onChangeVenue={() => setPickerOpen(true)}
          cancelling={cancelSelection.isPending}
        />
      ) : (
        <EmptyPrompt onBrowse={() => setPickerOpen(true)} />
      )}

      {/* When there is a dead selection (declined or cancelled), the
          SelectionCard already renders the "Pick another venue" CTA. We
          only show the standalone browse card for live/no-selection cases
          to avoid two overlapping CTAs. */}
      {!selection && (
        <p className="text-[11px] text-muted-foreground text-center">
          Nothing you do here changes the free-text "Venue" field under
          Settings — the marketplace path is optional and can be used
          alongside a manual venue name.
        </p>
      )}

      {isLive && (
        <div className="rounded-md border border-dashed border-border p-3 text-[12px] text-muted-foreground flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <div>
            <p className="text-foreground font-medium">What happens next</p>
            <p>
              The venue owner reviews your request in their vendor dashboard
              and responds with accept or decline. You'll get an email and
              this page will update automatically when they do.
            </p>
          </div>
        </div>
      )}

      <VenueMarketplacePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedVendorId={selection?.vendor_id ?? null}
        onSelect={handleSelect}
        eventDate={event?.date ?? null}
        seedCity={event?.location ?? null}
        submitting={selectVendor.isPending}
        confirmLabel={
          selection && (selection.status === "declined" || selection.status === "cancelled")
            ? "Send new request"
            : "Send request"
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Event context strip (date · location · capacity)
// ─────────────────────────────────────────────────────────────────────────────

function EventContextStrip({ event }: { event: EventLite | null }) {
  if (!event) {
    return (
      <div className="h-10 rounded-md bg-muted animate-pulse" aria-hidden />
    );
  }
  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not set";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground font-medium">{dateStr}</span>
      </span>
      {event.location && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {event.location}
        </span>
      )}
      {event.capacity ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          {event.capacity} expected attendees
        </span>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty prompt (no selection yet)
// ─────────────────────────────────────────────────────────────────────────────

function EmptyPrompt({ onBrowse }: { onBrowse: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Find the right venue</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Browse verified venues in your city that are available on your
            event date. Compare services, add-ons like catering, and send a
            request in one click.
          </p>
        </div>
        <Button onClick={onBrowse} className="mt-2">
          Browse venues
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection card (any status)
// ─────────────────────────────────────────────────────────────────────────────

function SelectionCard({
  selection,
  onCancel,
  onChangeVenue,
  cancelling,
}: {
  selection: EventVenueSelection;
  onCancel: () => void;
  onChangeVenue: () => void;
  cancelling: boolean;
}) {
  const vendor = selection.vendor;
  const status = selection.status;

  const statusConfig: Record<
    VenueSelectionStatus,
    {
      label: string;
      tone: "info" | "success" | "warn" | "muted";
      description: string;
    }
  > = {
    contacted: {
      label: "Waiting for response",
      tone: "info",
      description: `Request sent ${formatRelative(selection.notified_at ?? selection.created_at)}. The venue owner will be notified by email.`,
    },
    accepted: {
      label: "Confirmed",
      tone: "success",
      description: `Accepted ${formatRelative(selection.responded_at ?? selection.updated_at)}. Your venue is locked in.`,
    },
    declined: {
      label: "Declined",
      tone: "warn",
      description: `Declined ${formatRelative(selection.responded_at ?? selection.updated_at)}. You can send a request to another venue.`,
    },
    cancelled: {
      label: "Withdrawn",
      tone: "muted",
      description: `You withdrew this request ${formatRelative(selection.updated_at)}. Pick a different venue below.`,
    },
  };
  const cfg = statusConfig[status];

  return (
    <Card
      className={cn(
        "overflow-hidden",
        status === "accepted" && "border-emerald-500/40",
        status === "declined" && "border-amber-500/40",
      )}
    >
      {/* Status banner */}
      <div
        className={cn(
          "px-4 py-2.5 border-b flex items-center gap-2 text-[13px]",
          cfg.tone === "success" && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-900 dark:text-emerald-100",
          cfg.tone === "info" && "bg-blue-50 dark:bg-blue-950/30 border-blue-500/30 text-blue-900 dark:text-blue-100",
          cfg.tone === "warn" && "bg-amber-50 dark:bg-amber-950/30 border-amber-500/30 text-amber-900 dark:text-amber-100",
          cfg.tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        {cfg.tone === "success" ? (
          <Check className="h-4 w-4" />
        ) : cfg.tone === "warn" ? (
          <X className="h-4 w-4" />
        ) : cfg.tone === "muted" ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        )}
        <span className="font-semibold">{cfg.label}</span>
        <span className="opacity-80 truncate">· {cfg.description}</span>
      </div>

      <CardContent className="p-0">
        {/* Vendor header */}
        <div className="flex gap-4 p-4">
          <div className="w-24 h-24 rounded-lg bg-muted overflow-hidden shrink-0">
            {vendor?.cover_url || vendor?.logo_url ? (
              <img
                src={vendor.cover_url ?? vendor.logo_url ?? ""}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base truncate">
                {vendor?.business_name ?? "Venue"}
              </h3>
              {vendor?.verification_status === "verified" && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            {vendor?.tagline && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {vendor.tagline}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
              {vendor?.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {vendor.city}
                  {vendor.country ? `, ${vendor.country}` : ""}
                </span>
              )}
              {typeof vendor?.rating_avg === "number" && vendor.rating_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  {vendor.rating_avg.toFixed(1)}
                  <span className="opacity-70">({vendor.rating_count})</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Optional notes */}
        {selection.notes && (
          <div className="px-4 pb-4">
            <div className="rounded-md border border-border bg-muted/40 p-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Your note to the venue
              </p>
              <p className="text-[13px] whitespace-pre-line">{selection.notes}</p>
            </div>
          </div>
        )}

        {/* Confirmed extras — surface the vendor's services so the organizer
            can jump into planning next steps once the venue accepts. */}
        {status === "accepted" && vendor && (
          <SelectionConfirmedExtras vendorId={vendor.id} />
        )}

        {/* Action row */}
        <div className="border-t px-4 py-3 flex flex-wrap gap-2">
          {status === "contacted" && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={cancelling}
            >
              {cancelling && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Withdraw request
            </Button>
          )}
          {(status === "declined" || status === "cancelled") && (
            <Button onClick={onChangeVenue}>
              Pick another venue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
          {status === "accepted" && (
            <>
              <Button variant="outline" onClick={onChangeVenue}>
                Change venue
              </Button>
              {vendor?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <a
                    href={`mailto:?subject=Regarding%20${encodeURIComponent(vendor.business_name)}`}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    Contact venue
                  </a>
                </Button>
              )}
            </>
          )}
          {status === "contacted" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={onChangeVenue}
            >
              Browse other venues
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Extras rendered under a confirmed selection — quick summary of the
// venue's services so the organizer can start planning the run-of-show.
// ─────────────────────────────────────────────────────────────────────────────

function SelectionConfirmedExtras({ vendorId }: { vendorId: string }) {
  const { data: detail, isLoading } = useVenueDetail(vendorId);
  if (isLoading) {
    return (
      <div className="px-4 pb-4 text-[12px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading venue services…
      </div>
    );
  }
  if (!detail || detail.services.length === 0) return null;
  return (
    <div className="px-4 pb-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Services offered
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detail.services.slice(0, 4).map((s) => (
          <div
            key={s.id}
            className="rounded-md border border-border px-3 py-2 flex items-center justify-between text-[12px]"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{s.title}</p>
              {s.addons.length > 0 && (
                <p className="text-muted-foreground text-[11px] truncate">
                  {s.addons.length} add-on{s.addons.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <span className="text-[12px] font-semibold shrink-0 pl-2">
              {s.quote_on_request || !s.base_price
                ? "On request"
                : formatMoney(s.base_price, s.currency)}
            </span>
          </div>
        ))}
      </div>
      {detail.services.length > 4 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Plus {detail.services.length - 4} more service
          {detail.services.length - 4 === 1 ? "" : "s"}. Contact the venue for full details.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: readable relative time
// ─────────────────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "just now";
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const seconds = Math.round(abs / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const suffix = diffMs >= 0 ? "ago" : "from now";
  if (seconds < 45) return "just now";
  if (minutes < 2) return `1 minute ${suffix}`;
  if (minutes < 60) return `${minutes} minutes ${suffix}`;
  if (hours < 2) return `1 hour ${suffix}`;
  if (hours < 24) return `${hours} hours ${suffix}`;
  if (days < 2) return `1 day ${suffix}`;
  if (days < 30) return `${days} days ${suffix}`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
