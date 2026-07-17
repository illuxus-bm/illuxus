/**
 * CreativeLibrarySection — Creative_Library surface (Req 8.2, 8.3).
 *
 * Lists an event's `event_creatives` rows as a thumbnail grid (mirroring the
 * card-grid convention used elsewhere for entity lists, e.g.
 * `SponsorManagement.tsx`) and wires a per-row delete action to the delete
 * orchestration in `creative-storage.ts` (`deleteCreativeAsset`), following
 * the same `window.confirm` pattern as `SponsorManagement.tsx`'s
 * `handleDelete`.
 *
 * Fetches on mount / `eventId` change via `fetchEventCreatives`, with a
 * manual "Refresh" button so the organizer can pull in creatives generated
 * from the generator/batch dialogs without this component needing a
 * prop-drilled refetch trigger (deferred to task 14's dashboard wiring).
 */
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Layers, RefreshCw, Download, Trash2, Loader2, ImageOff } from "lucide-react";
import { logger } from "@/lib/observability";
import { PLATFORM_FORMATS } from "@/lib/creatives/creative-templates";
import {
  fetchEventCreatives,
  deleteCreativeAsset,
  sortByCreatedAtDesc,
  type EventCreativeRow,
} from "@/lib/creatives/creative-storage";

interface CreativeLibrarySectionProps {
  eventId: string;
  onGenerateClick: () => void; // opens CreativeGeneratorDialog
  onBatchSpeakerClick: () => void; // opens BatchCreativeGeneratorDialog for speakers
  onBatchSponsorClick: () => void; // opens BatchCreativeGeneratorDialog for sponsors
}

const CREATIVE_TYPE_LABELS: Record<string, string> = {
  speaker: "Speaker",
  sponsor: "Sponsor",
  combo: "Combo",
};

function platformFormatLabel(id: string): string {
  return PLATFORM_FORMATS.find((f) => f.id === id)?.label ?? id;
}

export default function CreativeLibrarySection({
  eventId,
  onGenerateClick,
  onBatchSpeakerClick,
  onBatchSponsorClick,
}: CreativeLibrarySectionProps) {
  const [rows, setRows] = useState<EventCreativeRow[]>([]);
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
        const data = await fetchEventCreatives(eventId);
        setRows(sortByCreatedAtDesc(data));
      } catch (err) {
        logger.error("creative library section fetch failed", {
          event_id: eventId,
          error_message: (err as Error)?.message ?? String(err),
        });
        toast.error("Failed to load creatives", { description: (err as Error)?.message });
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

  const handleDelete = async (row: EventCreativeRow) => {
    if (!confirm("Delete this creative permanently? This cannot be undone.")) return;

    setDeletingId(row.id);
    try {
      const { storageDeleted, recordDeleted } = await deleteCreativeAsset(row.id, row.storage_path);

      if (recordDeleted && storageDeleted) {
        toast.success("Creative deleted");
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else if (recordDeleted && !storageDeleted) {
        toast.warning("Creative removed from library", {
          description: "The file may still exist in storage, but the library record is gone.",
        });
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        toast.error("Failed to delete", {
          description: "The creative record could not be deleted. Try again.",
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-base font-semibold">Creatives</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => load({ silent: true })} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={onBatchSponsorClick} className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Batch: all sponsors
          </Button>
          <Button size="sm" variant="outline" onClick={onBatchSpeakerClick} className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Batch: all speakers
          </Button>
          <Button size="sm" onClick={onGenerateClick} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Generate creative
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-[13px]">Loading creatives…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 border border-dashed border-border rounded-lg text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium">No creatives yet</p>
            <p className="text-[12px] text-muted-foreground">
              Generate a branded promotional graphic for a speaker or sponsor.
            </p>
          </div>
          <Button size="sm" onClick={onGenerateClick} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Generate creative
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <CreativeCard
              key={row.id}
              row={row}
              isDeleting={deletingId === row.id}
              onDelete={() => handleDelete(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreativeCard({
  row,
  isDeleting,
  onDelete,
}: {
  row: EventCreativeRow;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const isAiBacked =
    row.metadata &&
    typeof row.metadata === "object" &&
    "aiBackgroundId" in row.metadata &&
    !!(row.metadata as { aiBackgroundId?: unknown }).aiBackgroundId;
  const { stylePreset, promptText } = row.metadata as { stylePreset?: string; promptText?: string };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background">
      <img src={row.asset_url} alt="" className="w-full aspect-square object-cover" />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {CREATIVE_TYPE_LABELS[row.creative_type] ?? row.creative_type}
            </Badge>
            {isAiBacked && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] gap-1 cursor-default">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {stylePreset && <p className="font-medium capitalize">{stylePreset}</p>}
                    {promptText && <p className="text-muted-foreground">{promptText}</p>}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground truncate">
            {platformFormatLabel(row.platform_format)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(row.created_at), "EEE, MMM d, yyyy · h:mm a")}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <Button size="sm" variant="outline" className="h-7 flex-1 gap-1.5 text-[12px]" asChild>
            <a href={row.asset_url} download>
              <Download className="h-3 w-3" />
              Download
            </a>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            aria-label="Delete creative"
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
