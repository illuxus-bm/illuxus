/**
 * BrandKitLibrary — organization-scoped Brand_Kit library panel
 * (Creative_Customization spec, Requirement 9).
 *
 * Standalone panel mounted from `CreativesSection.tsx`'s new "Brand kits"
 * tab (Task 14 will wire it in). Lets an organizer view, create, and
 * delete every Brand_Kit belonging to their org. Kits are org-scoped and
 * gated at the database layer by the RLS policies in
 * `025_brand_kits.sql` (SELECT via `org_members`; INSERT/UPDATE/DELETE
 * via `organizations.owner_id`, both with a platform-admin fallback —
 * Property 48). The `isOrgOwner || isAdmin` prop check here is a
 * client-side UX gate mirroring `SponsorManagement.tsx`; RLS is the real
 * boundary.
 *
 * Design notes:
 *
 *  - The panel is deliberately self-contained. It owns the fetched list,
 *    the create dialog, and the delete-confirmation dialog. Fetch/create/
 *    delete calls go through the pure wrappers in `brand-kits.ts` which
 *    log via `logger.error` and return sentinel values on failure — this
 *    file just surfaces toasts on top of those results.
 *  - Sorting: `fetchBrandKits` already orders `created_at DESC` at the
 *    database layer, but we re-sort defensively via
 *    `sortByCreatedAtDesc` in case callers ever cache/merge rows across
 *    fetches (mirrors the base spec's convention in
 *    `AiBackgroundLibrary.tsx`).
 *  - Delete is confirmed via a small `<AlertDialog>`; on success the row
 *    is removed from local state after the RPC resolves (guarded
 *    optimism, not blind optimism — Requirement 9.7).
 *  - Every log site goes through `@/lib/observability`; no
 *    `console.*` calls.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Palette, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { logger } from "@/lib/observability";
import {
  buildBrandKitRecord,
  createBrandKit,
  deleteBrandKit,
  fetchBrandKits,
  type BrandKitRow,
  type BrandKitSnapshot,
} from "@/lib/creatives/brand-kits";
import { sortByCreatedAtDesc } from "@/lib/creatives/creative-storage";
import {
  COLOR_SWATCHES,
  FONT_OPTIONS,
} from "@/components/event/page-form/presets";

// ─── Props ────────────────────────────────────────────────────────────────

export interface BrandKitLibraryProps {
  orgId: string | null;
  isOrgOwner: boolean;
  isAdmin: boolean;
  currentUserId: string;
}

// ─── Defaults for the create dialog form ──────────────────────────────────

const DEFAULT_PRIMARY_COLOR = "#6366f1";
const DEFAULT_ACCENT_COLOR = "#f59e0b";
const DEFAULT_FONT_FAMILY = "Poppins";

interface CreateFormState {
  name: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string;
}

function makeEmptyForm(): CreateFormState {
  return {
    name: "",
    primaryColor: DEFAULT_PRIMARY_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    fontFamily: DEFAULT_FONT_FAMILY,
    logoUrl: "",
  };
}

// ─── Panel ────────────────────────────────────────────────────────────────

function BrandKitLibrary({
  orgId,
  isOrgOwner,
  isAdmin,
  currentUserId,
}: BrandKitLibraryProps) {
  const canManage = isOrgOwner || isAdmin;

  const [rows, setRows] = useState<BrandKitRow[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(orgId));
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrandKitRow | null>(null);

  const loadKits = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetched = await fetchBrandKits(orgId);
    setRows(sortByCreatedAtDesc(fetched));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void loadKits();
  }, [loadKits]);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Brand kits</h2>
          <p className="text-[13px] text-muted-foreground max-w-xl">
            Organization-scoped theme snapshots you can apply to any
            Creative.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={!canManage || !orgId}
          className="gap-1.5"
          title={
            !orgId
              ? "Select an organization to create brand kits"
              : !canManage
                ? "Only org owners and admins can create brand kits"
                : undefined
          }
        >
          <Plus className="h-3.5 w-3.5" />
          New brand kit
        </Button>
      </header>

      {!canManage ? (
        <p className="text-[12px] text-muted-foreground">
          Only organization owners and platform admins can create or
          delete brand kits.
        </p>
      ) : null}

      {loading ? (
        <BrandKitGridSkeleton />
      ) : !orgId ? (
        <BrandKitEmptyState
          message="Sign in to an organization to manage brand kits."
        />
      ) : rows.length === 0 ? (
        <BrandKitEmptyState message="No brand kits yet. Create one to reuse a theme across every event in your org." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((row) => (
            <BrandKitCard
              key={row.id}
              row={row}
              canDelete={canManage}
              onRequestDelete={() => setDeleteTarget(row)}
            />
          ))}
        </div>
      )}

      {canManage && orgId ? (
        <CreateBrandKitDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          orgId={orgId}
          currentUserId={currentUserId}
          onCreated={loadKits}
        />
      ) : null}

      <DeleteBrandKitDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onDeleted={(id) => {
          setRows((prev) => prev.filter((r) => r.id !== id));
        }}
      />
    </div>
  );
}

export default BrandKitLibrary;

// ─── Kit card ─────────────────────────────────────────────────────────────

function BrandKitCard({
  row,
  canDelete,
  onRequestDelete,
}: {
  row: BrandKitRow;
  canDelete: boolean;
  onRequestDelete: () => void;
}) {
  const primary = row.snapshot.primaryColor;
  const accent = row.snapshot.accentColor;
  const font = row.snapshot.fontFamily;
  const logo = row.snapshot.logoUrl;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold truncate" title={row.name}>
          {row.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <ColorSwatch color={primary} ariaLabel="Primary color" />
          <ColorSwatch color={accent} ariaLabel="Accent color" />
          {font ? (
            <span
              className="text-[12px] text-muted-foreground truncate"
              title={font}
            >
              {font}
            </span>
          ) : (
            <span className="text-[12px] text-muted-foreground italic">
              No font
            </span>
          )}
          {logo ? (
            <img
              src={logo}
              alt=""
              className="ml-auto h-8 w-8 rounded object-cover border border-border/60"
            />
          ) : null}
        </div>

        {canDelete ? (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRequestDelete}
              className="h-7 gap-1.5 text-[12px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ColorSwatch({
  color,
  ariaLabel,
}: {
  color: string | undefined;
  ariaLabel: string;
}) {
  if (!color) {
    return (
      <span
        aria-label={`${ariaLabel} (unset)`}
        className="h-6 w-6 rounded-sm border border-dashed border-border bg-muted/40"
      />
    );
  }
  return (
    <span
      aria-label={`${ariaLabel} ${color}`}
      title={color}
      className="h-6 w-6 rounded-sm border border-border/60"
      style={{ backgroundColor: color }}
    />
  );
}

// ─── Loading + empty states ────────────────────────────────────────────────

function BrandKitGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-sm" />
              <Skeleton className="h-6 w-6 rounded-sm" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-8 w-8 rounded" />
            </div>
            <Skeleton className="h-7 w-16 ml-auto" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function BrandKitEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 border border-dashed border-border rounded-lg text-center">
      <Palette className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-[13px] text-muted-foreground max-w-md px-4">
        {message}
      </p>
    </div>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────

function CreateBrandKitDialog({
  open,
  onOpenChange,
  orgId,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  currentUserId: string;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState<CreateFormState>(makeEmptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the dialog opens so a canceled create
  // doesn't leak into the next attempt.
  useEffect(() => {
    if (open) {
      setForm(makeEmptyForm());
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }

    const snapshot: BrandKitSnapshot = {};
    if (form.primaryColor.trim()) snapshot.primaryColor = form.primaryColor.trim();
    if (form.accentColor.trim()) snapshot.accentColor = form.accentColor.trim();
    if (form.fontFamily.trim()) snapshot.fontFamily = form.fontFamily.trim();
    if (form.logoUrl.trim()) snapshot.logoUrl = form.logoUrl.trim();

    setSubmitting(true);
    try {
      const record = buildBrandKitRecord({
        orgId,
        name,
        snapshot,
        createdBy: currentUserId,
      });
      const created = await createBrandKit(record);
      if (!created) {
        logger.error("brand kit library create failed", {
          org_id: orgId,
          error_message: "createBrandKit returned null",
        });
        toast.error("Failed to create brand kit");
        return;
      }
      toast.success("Brand kit created");
      onOpenChange(false);
      await onCreated();
    } catch (err) {
      logger.error("brand kit library create threw", {
        org_id: orgId,
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Failed to create brand kit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New brand kit</DialogTitle>
          <DialogDescription>
            Save a theme snapshot to reuse across every Creative in your
            organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand-kit-name" className="text-[12px]">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="brand-kit-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Autumn Conference 2025"
              maxLength={80}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Primary color</Label>
              <SwatchColorPicker
                value={form.primaryColor}
                onChange={(v) => setForm((f) => ({ ...f, primaryColor: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Accent color</Label>
              <SwatchColorPicker
                value={form.accentColor}
                onChange={(v) => setForm((f) => ({ ...f, accentColor: v }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-kit-font" className="text-[12px]">
              Font family
            </Label>
            <Select
              value={form.fontFamily}
              onValueChange={(v) => setForm((f) => ({ ...f, fontFamily: v }))}
            >
              <SelectTrigger id="brand-kit-font" className="h-9 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f} className="text-[13px]">
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-kit-logo" className="text-[12px]">
              Logo URL
            </Label>
            <Input
              id="brand-kit-logo"
              type="url"
              value={form.logoUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, logoUrl: e.target.value }))
              }
              placeholder="https://example.com/logo.png"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional. Paste a public URL, or leave blank to fall back to
              the organization logo at render time.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !form.name.trim()}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Create brand kit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete dialog ─────────────────────────────────────────────────────────

function DeleteBrandKitDialog({
  target,
  onOpenChange,
  onDeleted,
}: {
  target: BrandKitRow | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      const ok = await deleteBrandKit(target.id);
      if (!ok) {
        logger.error("brand kit library delete failed", {
          brand_kit_id: target.id,
          org_id: target.org_id,
          error_message: "deleteBrandKit returned false",
        });
        toast.error("Failed to delete brand kit");
        return;
      }
      onDeleted(target.id);
      toast.success("Brand kit deleted");
      onOpenChange(false);
    } catch (err) {
      logger.error("brand kit library delete threw", {
        brand_kit_id: target.id,
        org_id: target.org_id,
        error_message: err instanceof Error ? err.message : String(err),
      });
      toast.error("Failed to delete brand kit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete brand kit?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete brand kit &lsquo;{target?.name ?? ""}&rsquo;? This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={submitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Shared: compact color picker (native input + swatch palette) ─────────

function SwatchColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 text-[11px] font-mono"
          placeholder="#RRGGBB"
          aria-label="Color hex"
        />
        <input
          type="color"
          value={sanitizeColorInput(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-border cursor-pointer"
          aria-label="Pick color"
        />
      </div>
      <div className="grid grid-cols-8 gap-1">
        {COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-4 w-4 rounded-sm border transition-transform hover:scale-110 ${
              value.toLowerCase() === c.toLowerCase()
                ? "ring-1 ring-offset-1 ring-primary border-primary"
                : "border-black/10"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

/** Native `<input type="color">` accepts only `#RRGGBB` — fall back to
 *  black rather than a runtime error when the current value is
 *  malformed. */
function sanitizeColorInput(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000";
}
