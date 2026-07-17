/**
 * AiBackgroundLibrary — AI_Background_Assets library surface (Req 7.1, 7.3).
 *
 * Lists an event's `event_creative_backgrounds` rows as a thumbnail grid,
 * mirroring `CreativeLibrarySection`'s fetch/refresh/delete conventions
 * (`fetchEventCreativeBackgrounds`, `deleteEventCreativeBackground`, the same
 * `window.confirm` guard before deleting, and the same partial-failure toast
 * handling for storage-vs-record delete outcomes).
 *
 * Rendered in two modes:
 *  - `variant="peer"` — mounted as a standalone dashboard section (below
 *    `CreativeLibrarySection` in `CreativesSection.tsx`), display-only.
 *  - `variant="picker"` — mounted inside `AiBackgroundPanel`'s "Open library"
 *    Dialog; each card additionally renders a "Use this" button that calls
 *    `onSelect(row)` so the panel can hydrate its preview from a past
 *    generation instead of calling Gemini again.
 */
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, Loader2, Sparkles, Check } from "lucide-react";
import { logger } from "@/lib/observability";
import {
  fetchEventCreativeBackgrounds,
  deleteEventCreativeBackground,
  type EventCreativeBackgroundRow,
} from "@/lib/creatives/creative-storage";

interface AiBackgroundLibraryProps {
  eventId: string;
  /**
   * Optional selection callback; when present (variant="picker") each card
   * renders a "Use this" button that calls `onSelect(row)`.
   */
  onSelect?: (row: EventCreativeBackgroundRow) => void;
  variant: "peer" | "picker";
}

const PROMPT_TRUNCATE_LENGTH = 90;

function truncatePrompt(prompt: string): string {
  if (prompt.length <= PROMPT_TRUNCATE_LENGTH) return prompt;
  return `${prompt.slice(0, PROMPT_TRUNCATE_LENGTH).trimEnd()}…`;
}

/**
 * Defensive client-side re-sort by `created_at` descending — mirrors
 * `sortByCreatedAtDesc` from `creative-storage.ts` (kept local rather than
 * reused so this file has no dependency on the base spec's generic being
 * widened; the shape needed here is identical: `{ created_at: string }`).
 */
function sortByCreatedAtDesc(rows: EventCreativeBackgroundRow[]): EventCreativeBackgroundRow[] {
  return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function AiBackgroundLibrary({ eventId, onSelect, variant }: AiBackgroundLibraryProps) {
  const [rows, setRows] = useState<EventCreativeBackgroundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const data = await fetchEventCreativeBackgrounds(eventId);
        setRows(sortByCreatedAtDesc(data));
      } catch (err) {
        logger.error("ai background library section fetch failed", {
          event_id: eventId,
          error_message: (err as Error)?.message ?? String(err),
        });
        toast.error("Failed to load AI backgrounds", { description: (err as Error)?.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const handleDelete = async (row: EventCreativeBackgroundRow) => {
    if (!confirm("Delete this AI background permanently? This cannot be undone.")) return;

    setDeletingId(row.id);
    try {
      const { storageDeleted, recordDeleted } = await deleteEventCreativeBackground(row.id, row.storage_path);

      if (recordDeleted && storageDeleted) {
        toast.success("AI background deleted");
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else if (recordDeleted && !storageDeleted) {
        toast.warning("AI background removed from library", {
          description: "The file may still exist in storage, but the library record is gone.",
        });
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        toast.error("Failed to delete", {
          description: "The AI background record could not be deleted. Try again.",
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-base font-semibold">AI Backgrounds</h3>
        <Button size="sm" variant="outline" onClick={() => load({ silent: true })} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-[13px]">Loading AI backgrounds…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 border border-dashed border-border rounded-lg text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium">No AI backgrounds yet</p>
            <p className="text-[12px] text-muted-foreground">
              Generate a bespoke background from the Creative generator to see it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <AiBackgroundCard
              key={row.id}
              row={row}
              variant={variant}
              isDeleting={deletingId === row.id}
              onDelete={() => handleDelete(row)}
              onSelect={onSelect ? () => onSelect(row) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AiBackgroundCard({
  row,
  variant,
  isDeleting,
  onDelete,
  onSelect,
}: {
  row: EventCreativeBackgroundRow;
  variant: "peer" | "picker";
  isDeleting: boolean;
  onDelete: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <img src={row.asset_url} alt="" className="w-full aspect-square object-cover" />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {row.style_preset}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{row.aspect_ratio}</span>
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2" title={row.prompt}>
          {truncatePrompt(row.prompt)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(row.created_at), "EEE, MMM d, yyyy · h:mm a")}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          {variant === "picker" && onSelect && (
            <Button size="sm" variant="outline" className="h-7 flex-1 gap-1.5 text-[12px]" onClick={onSelect}>
              <Check className="h-3 w-3" />
              Use this
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            aria-label="Delete AI background"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
