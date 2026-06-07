import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm shadow-sm transition-all duration-150",
        "ring-offset-background placeholder:text-muted-foreground/70 leading-relaxed",
        "hover:border-foreground/30",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
