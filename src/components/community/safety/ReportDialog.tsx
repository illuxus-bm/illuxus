import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useReport } from "@/hooks/community/useCommunityExtras";
import { friendlyError } from "@/lib/friendly-error";

export type ReportTarget = { postId: string } | { commentId: string } | { messageId: string };

export const REPORT_REASONS = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech or symbols" },
  { value: "sexual", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "misinformation", label: "False information" },
  { value: "other", label: "Something else" },
] as const;

const NOUN = (t: ReportTarget) => ("postId" in t ? "post" : "commentId" in t ? "comment" : "message");

/**
 * Report a post, comment or chat message to the community's moderators,
 * with a reason and optional details. Replaces the browser's prompt(), which
 * looks out of place in an app.
 */
export function ReportDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ReportTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const report = useReport();
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) { setReason(""); setNotes(""); }
  }, [open]);
  const noun = NOUN(target);

  const submit = async () => {
    try {
      await report.mutateAsync({ ...target, reason, notes: notes.trim() || undefined });
      onOpenChange(false);
      toast.success("Thanks for reporting", { description: "The community's moderators will review it." });
    } catch (err) {
      toast.error("Couldn't send the report", { description: friendlyError(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this {noun}</DialogTitle>
          <DialogDescription>
            Only the community's moderators see reports. The person who posted it isn't told who reported it.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} aria-label="Reason" className="gap-1">
          {REPORT_REASONS.map((r) => (
            <Label
              key={r.value}
              htmlFor={`report-${r.value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-[14px] font-normal hover:bg-muted"
            >
              <RadioGroupItem id={`report-${r.value}`} value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor="report-notes" className="text-[13px]">Details (optional)</Label>
          <Textarea
            id="report-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            placeholder="Anything that helps the moderators understand"
            rows={3}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!reason || report.isPending}>
            {report.isPending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
