import { useMemo } from "react";
import { Building2, Users, Sparkles, Link as LinkIcon, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VenueMarketplacePicker } from "@/components/event/VenueMarketplacePicker";
import type { VenueBookingBrief } from "@/hooks/useSelectVenueVendor";
import type { VenueVendor } from "@/hooks/useVenueVendors";

/**
 * Step-2 form on the Quick Create wizard where the organizer captures
 * every "what do you need from the venue" detail before firing the
 * request. Fields map 1:1 onto migration 035's new columns on
 * `event_venue_selections`; the parent page persists them via
 * `useSelectVenueVendor` after the event itself is created.
 *
 * Deliberately controlled by the parent — no local state. That keeps the
 * form composable inside a wizard where Back / Next don't reset input,
 * and lets the parent seed the brief from an existing selection when the
 * organizer is re-opening the flow (change-venue path).
 *
 * Layout is single-column-ish and dense; nothing here is a hero, this
 * screen exists so the vendor knows what they're being asked for.
 */

export type BookingBriefState = VenueBookingBrief & {
  /** Selected marketplace vendor. Optional — the organizer can save the
   *  brief without picking a specific venue and use it to shop later. */
  vendor: VenueVendor | null;
  /** Service ids ticked in the vendor detail view. Only meaningful when
   *  `vendor` is set. */
  selectedServiceIds: string[];
};

export const EMPTY_BOOKING_BRIEF: BookingBriefState = {
  event_type: null,
  event_duration_hours: null,
  expected_attendees: null,
  seating_capacity: null,
  seating_arrangement: null,
  needs_pre_function_area: false,
  needs_vip_area: false,
  needs_additional_rooms: false,
  venue_link: null,
  vendor: null,
  selectedServiceIds: [],
};

const EVENT_TYPE_OPTIONS = [
  "Corporate offsite",
  "Conference / summit",
  "Product launch",
  "Wedding",
  "Reception / gala",
  "Workshop / training",
  "Concert / performance",
  "Exhibition",
  "Community meetup",
  "Other",
] as const;

const SEATING_ARRANGEMENTS = [
  "Theater",
  "Classroom",
  "Banquet",
  "U-shape",
  "Boardroom",
  "Cocktail / standing",
  "Open floor / mixed",
  "Other",
] as const;

interface Props {
  value: BookingBriefState;
  onChange: (patch: Partial<BookingBriefState>) => void;
  eventDate: string | null;
  eventCity?: string | null;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}

export function VenueBookingForm({
  value,
  onChange,
  eventDate,
  eventCity,
  pickerOpen,
  onPickerOpenChange,
}: Props) {
  // Text-input onChange handlers coerce empty strings to null so the DB
  // doesn't store zero-length text where the schema expects "unspecified".
  const setText = (key: keyof VenueBookingBrief, v: string) =>
    onChange({ [key]: v.trim().length === 0 ? null : v } as Partial<BookingBriefState>);
  const setInt = (key: keyof VenueBookingBrief, v: string) => {
    const n = v.trim().length === 0 ? null : Number(v);
    onChange({ [key]: Number.isFinite(n as number) ? n : null } as Partial<BookingBriefState>);
  };
  const setNumeric = (key: keyof VenueBookingBrief, v: string) => {
    const n = v.trim().length === 0 ? null : Number(v);
    onChange({ [key]: Number.isFinite(n as number) ? n : null } as Partial<BookingBriefState>);
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
    <div className="space-y-6">
      {/* ─── Event context (mostly display, one editable duration) ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Event details</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Event type</Label>
            <Select
              value={value.event_type ?? ""}
              onValueChange={(v) => onChange({ event_type: v || null })}
            >
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[12px]">Event date</Label>
            <Input
              value={dateLabel ?? ""}
              readOnly
              placeholder="Set on the previous step"
              className="h-9 mt-1 text-sm bg-muted/50 text-muted-foreground"
            />
          </div>

          <div>
            <Label className="text-[12px]">Event duration (hours)</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              value={value.event_duration_hours ?? ""}
              onChange={(e) => setNumeric("event_duration_hours", e.target.value)}
              placeholder="e.g. 4"
              className="h-9 mt-1 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Half-days allowed. Use 24 for a full-day event.
            </p>
          </div>

          <div>
            <Label className="text-[12px]">Expected attendees</Label>
            <Input
              type="number"
              min={0}
              value={value.expected_attendees ?? ""}
              onChange={(e) => setInt("expected_attendees", e.target.value)}
              placeholder="e.g. 120"
              className="h-9 mt-1 text-sm"
            />
          </div>
        </div>
      </section>

      {/* ─── Space requirements ─── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Space requirements</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Seating capacity needed</Label>
            <Input
              type="number"
              min={0}
              value={value.seating_capacity ?? ""}
              onChange={(e) => setInt("seating_capacity", e.target.value)}
              placeholder="e.g. 100"
              className="h-9 mt-1 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Independent of head-count — you might want more chairs than
              attendees for comfort.
            </p>
          </div>

          <div>
            <Label className="text-[12px]">Seating arrangement</Label>
            <Select
              value={value.seating_arrangement ?? ""}
              onValueChange={(v) => onChange({ seating_arrangement: v || null })}
            >
              <SelectTrigger className="h-9 mt-1 text-sm">
                <SelectValue placeholder="Pick a layout" />
              </SelectTrigger>
              <SelectContent>
                {SEATING_ARRANGEMENTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <ToggleCard
            checked={value.needs_pre_function_area}
            onToggle={() =>
              onChange({ needs_pre_function_area: !value.needs_pre_function_area })
            }
            title="Pre-function area"
            hint="Lobby / registration / reception space before the main hall."
          />
          <ToggleCard
            checked={value.needs_vip_area}
            onToggle={() => onChange({ needs_vip_area: !value.needs_vip_area })}
            title="VIP area"
            hint="Segregated green-room or VIP lounge."
          />
          <ToggleCard
            checked={value.needs_additional_rooms}
            onToggle={() =>
              onChange({ needs_additional_rooms: !value.needs_additional_rooms })
            }
            title="Additional rooms"
            hint="Breakout rooms, meeting rooms, or side halls beyond the main space."
          />
        </div>
      </section>

      {/* ─── Reference link ─── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Reference (optional)</h2>
        </div>
        <Input
          type="url"
          value={value.venue_link ?? ""}
          onChange={(e) => setText("venue_link", e.target.value)}
          placeholder="https://... — layout inspiration, mood-board, or a venue you like"
          className="h-9 text-sm"
        />
      </section>

      {/* ─── Pick a specific venue ─── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Pick your venue</h2>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          {value.vendor ? (
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">
                      {value.vendor.business_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {value.vendor.city}
                      {value.vendor.country ? `, ${value.vendor.country}` : ""}
                      {" · From Illuxus vendor marketplace"}
                    </p>
                    {value.selectedServiceIds.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        <Badge variant="outline" className="mr-1 text-[10px] py-0 px-1.5">
                          {value.selectedServiceIds.length}
                        </Badge>
                        service{value.selectedServiceIds.length === 1 ? "" : "s"} requested
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => onPickerOpenChange(true)}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        onChange({ vendor: null, selectedServiceIds: [] })
                      }
                      aria-label="Remove venue selection"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Optional — pick from the marketplace</p>
                <p className="text-[11px] text-muted-foreground">
                  Skip this if you're still shopping around. Your brief is
                  saved either way, and you can pick a venue later.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[12px] shrink-0"
                onClick={() => onPickerOpenChange(true)}
              >
                Browse venues
              </Button>
            </div>
          )}
        </div>
      </section>

      <VenueMarketplacePicker
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        selectedVendorId={value.vendor?.id ?? null}
        onSelect={(v, ids) =>
          onChange({ vendor: v, selectedServiceIds: ids })
        }
        eventDate={eventDate ?? null}
        seedCity={eventCity ?? null}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ToggleCard({
  checked,
  onToggle,
  title,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={
        "flex items-start gap-2.5 rounded-md border p-3 cursor-pointer transition-colors " +
        (checked
          ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]"
          : "border-border hover:border-primary/40")
      }
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
          {hint}
        </p>
      </div>
    </label>
  );
}
