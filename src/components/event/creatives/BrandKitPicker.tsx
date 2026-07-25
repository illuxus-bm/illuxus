/**
 * BrandKitPicker — compact `<Select>` dropdown that mounts inside
 * `CustomizationPanel` (Task 7) and `CustomTemplateBuilder` (Task 8) to let
 * an organizer apply an org-scoped Brand_Kit to the current Creative.
 *
 * Implements the Creative_Customization spec's "Brand kit" section
 * (Requirements 9.3, 9.4, 9.5). The picker itself is a small,
 * side-effect-light shell: it fetches `BrandKitRow[]` on mount (and again
 * when `orgId` changes), renders a shadcn `<Select>` with a leading "None"
 * option plus one item per kit, and reports the picked kit back to the
 * parent through the `onApply` callback in the `AppliedBrandKit` shape
 * consumed by `resolveEffective`.
 *
 * Design notes:
 *
 *  - The picker is intentionally stateless about the selection — the
 *    applied kit lives on the parent's `CustomizationConfig` /
 *    `appliedBrandKit` state so a Creative's Customization_Config remains
 *    the single source of truth (Requirement 12.5, Round_Trip Property 47).
 *  - Fetch errors are already logged inside `fetchBrandKits`; the picker
 *    surfaces the failure implicitly as an empty list (Requirement 9.3
 *    graceful degradation, mirroring the AI-backgrounds library).
 *  - When `orgId` is `null` (no org selected in the current org context)
 *    the picker disables itself with an explanatory hint rather than
 *    silently rendering an empty dropdown — matches the base spec's
 *    convention of never leaving a UI control in a mysterious no-op
 *    state.
 *  - The preview below the trigger surfaces the picked kit's identity
 *    (color swatches + font name + logo thumbnail) so the organizer sees
 *    at a glance what values are being fed into `resolveEffective` for
 *    the current Creative (Requirement 9.4 UX aid).
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { logger } from "@/lib/observability";
import {
  fetchBrandKits,
  readBrandKitSnapshot,
  type BrandKitRow,
} from "@/lib/creatives/brand-kits";
import type { AppliedBrandKit } from "@/lib/creatives/creative-customization";

/** Sentinel value used by the `<Select>` to represent "no kit applied"
 *  (shadcn `<SelectItem>` cannot have an empty-string `value`). */
const NONE_VALUE = "__none__";

export interface BrandKitPickerProps {
  orgId: string | null;
  appliedBrandKit?: AppliedBrandKit;
  onApply: (kit: AppliedBrandKit | undefined) => void;
}

function BrandKitPicker({ orgId, appliedBrandKit, onApply }: BrandKitPickerProps) {
  const [kits, setKits] = useState<BrandKitRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Refetch whenever the org changes; when `orgId` is null we skip the
  // network call entirely and render the disabled hint state below.
  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setKits([]);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    fetchBrandKits(orgId)
      .then((rows) => {
        if (cancelled) return;
        setKits(rows);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleValueChange = (value: string) => {
    if (value === NONE_VALUE) {
      onApply(undefined);
      return;
    }
    const row = kits.find((k) => k.id === value);
    if (!row) {
      // Selection race — the dropdown value refers to a kit that has
      // since disappeared from the fetched list (e.g. deleted in another
      // tab). Log and reset so the parent's state stays coherent.
      logger.warn("brand kit picker selection missing", { kit_id: value });
      onApply(undefined);
      return;
    }
    onApply(readBrandKitSnapshot(row));
  };

  const disabled = !orgId;
  const selectValue = appliedBrandKit?.id ?? NONE_VALUE;
  const emptyState = !disabled && !loading && kits.length === 0;

  return (
    <div className="space-y-2">
      <Label className="text-[12px] text-muted-foreground">Brand kit</Label>
      <Select
        value={selectValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 text-[13px]">
          <SelectValue placeholder="Select a brand kit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE} className="text-[13px]">
            None
          </SelectItem>
          {kits.map((kit) => (
            <SelectItem key={kit.id} value={kit.id} className="text-[13px]">
              {kit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {disabled ? (
        <p className="text-[12px] text-muted-foreground">
          Sign in to an organization to use brand kits
        </p>
      ) : emptyState ? (
        <p className="text-[12px] text-muted-foreground">No brand kits yet</p>
      ) : null}

      {appliedBrandKit ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
          {appliedBrandKit.logoUrl ? (
            <img
              src={appliedBrandKit.logoUrl}
              alt=""
              className="h-6 w-6 rounded object-cover"
            />
          ) : null}
          <div className="flex items-center gap-1">
            {appliedBrandKit.primaryColor ? (
              <span
                aria-label="Primary color"
                className="h-4 w-4 rounded-sm border border-border/60"
                style={{ backgroundColor: appliedBrandKit.primaryColor }}
              />
            ) : null}
            {appliedBrandKit.accentColor ? (
              <span
                aria-label="Accent color"
                className="h-4 w-4 rounded-sm border border-border/60"
                style={{ backgroundColor: appliedBrandKit.accentColor }}
              />
            ) : null}
          </div>
          {appliedBrandKit.fontFamily ? (
            <span className="text-[12px] text-muted-foreground truncate">
              {appliedBrandKit.fontFamily}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-[12px]"
            onClick={() => onApply(undefined)}
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default BrandKitPicker;
