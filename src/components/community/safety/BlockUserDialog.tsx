import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBlockUser } from "@/hooks/community/useBlocks";
import { friendlyError } from "@/lib/friendly-error";

/** Confirms blocking someone, saying exactly what it does. */
export function BlockUserDialog({
  userId,
  name,
  open,
  onOpenChange,
}: {
  userId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const block = useBlockUser();
  const confirm = async () => {
    try {
      await block.mutateAsync(userId);
      toast.success(`${name} is blocked`, { description: "Unblock them any time in Settings → Account." });
    } catch (err) {
      toast.error(`Couldn't block ${name}`, { description: friendlyError(err) });
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            You won't see their posts, comments or messages in any community. They won't be told. You can unblock
            them any time in Settings → Account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void confirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Block
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
