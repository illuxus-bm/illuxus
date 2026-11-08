import { useState } from "react";
import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BlockUserDialog } from "./BlockUserDialog";
import { ReportDialog, type ReportTarget } from "./ReportDialog";

/**
 * The ⋯ menu on someone else's comment or chat message: Report, Block.
 * Nothing for your own content or when signed out. The button is always
 * visible on touch screens (no hover there) and appears on hover with a mouse.
 */
export function ContentActionsMenu({
  target,
  authorId,
  authorName,
  className,
}: {
  target: ReportTarget;
  authorId: string;
  authorName: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  if (!user || user.id === authorId) return null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${authorName}'s ${"postId" in target ? "post" : "commentId" in target ? "comment" : "message"}`}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
              className,
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setReporting(true)}>
            <Flag className="mr-2 h-3.5 w-3.5" /> Report…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setBlocking(true)} className="text-destructive focus:text-destructive">
            <Ban className="mr-2 h-3.5 w-3.5" /> Block {authorName}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog target={target} open={reporting} onOpenChange={setReporting} />
      <BlockUserDialog userId={authorId} name={authorName} open={blocking} onOpenChange={setBlocking} />
    </>
  );
}
