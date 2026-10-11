/**
 * CreativeLibrary — the creatives saved for this event, newest first, with
 * download and delete.
 */
import { useEffect, useState } from "react";
import { Download, ImageOff, Loader2, Trash2 } from "lucide-react";
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
  deleteCreativeAsset,
  fetchEventCreatives,
  sortByCreatedAtDesc,
  type EventCreativeRow,
} from "@/lib/creatives/creative-storage";
import { STUDIO_FORMATS, STUDIO_TEMPLATES } from "@/lib/creatives/studio/templates";

function describe(row: EventCreativeRow): string {
  const template = STUDIO_TEMPLATES.find((t) => t.id === row.template_id)?.name;
  const format = STUDIO_FORMATS.find((f) => f.id === row.platform_format)?.label ?? row.platform_format;
  return [template, format].filter(Boolean).join(" · ");
}

export default function CreativeLibrary({ eventId, onCreate }: { eventId: string; onCreate: () => void }) {
  const [rows, setRows] = useState<EventCreativeRow[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EventCreativeRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchEventCreatives(eventId)
      .then((fetched) => {
        if (mounted) setRows(sortByCreatedAtDesc(fetched));
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setRows([]);
        toast.error("Could not load saved creatives", { description: err instanceof Error ? err.message : undefined });
      });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const handleDelete = async (row: EventCreativeRow): Promise<void> => {
    setDeletingId(row.id);
    const result = await deleteCreativeAsset(row.id, row.storage_path);
    setDeletingId(null);
    if (result.recordDeleted) {
      setRows((current) => (current ?? []).filter((r) => r.id !== row.id));
      if (!result.storageDeleted) toast.warning("Removed from the library, but the image file could not be deleted.");
    } else {
      toast.error("Could not delete the creative");
    }
  };

  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading saved creatives…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <ImageOff className="h-6 w-6 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">Nothing saved yet. Creatives you save from the studio are kept here.</p>
        <Button type="button" variant="outline" size="sm" onClick={onCreate}>
          Create a creative
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {rows.map((row) => (
          <figure key={row.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex aspect-square items-center justify-center bg-muted/50 p-2">
              <img src={row.asset_url} alt="" loading="lazy" className="max-h-full max-w-full object-contain shadow-sm" />
            </div>
            <figcaption className="flex items-center gap-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-foreground">{describe(row)}</span>
                <span className="block text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</span>
              </span>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Download">
                <a href={row.asset_url} download target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Delete"
                disabled={deletingId === row.id}
                onClick={() => setPendingDelete(row)}
              >
                {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </figcaption>
          </figure>
        ))}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this creative?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved image is removed for everyone on this event. Anywhere it has already been posted is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
