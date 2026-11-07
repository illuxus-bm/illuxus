import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The optional question every registration form asks (QA audit F-10): may
 * this event's sponsors have my contact details? Unticked by default, and
 * registering doesn't depend on it.
 *
 * The database records the answer with the date of this wording
 * (`_sponsor_share_notice_version()`, section 079 in the SQL bundle).
 * Change that date whenever this wording changes.
 */
export function SponsorShareChoice({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-[hsl(var(--primary))]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      />
      <label htmlFor={id} className="cursor-pointer text-[12px] leading-relaxed text-muted-foreground">
        Optional: share my email, mobile number and LinkedIn with this event's sponsors so they can contact me.
        You can change this later on your ticket.
      </label>
    </div>
  );
}
