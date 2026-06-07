import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface QuickViewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Small uppercase label shown in the sticky header (e.g. "Sponsor", "Speaker") */
  kind: string;
  /** Visual media on the left — logo box, avatar, etc. */
  media: ReactNode;
  /** Pill text shown above the title (e.g. tier, role) */
  badge?: ReactNode;
  /** Main heading */
  title: string;
  /** Subtitle line below the title */
  subtitle?: ReactNode;
  /** Optional action area (buttons) below subtitle */
  actions?: ReactNode;
  /** Long-form body section label */
  bodyLabel?: string;
  /** Long-form body content */
  body?: ReactNode;
}

/**
 * Shared layout for entity quick-view dialogs (Sponsor, Speaker, etc.).
 * Uses only semantic tokens so it stays aligned in light & dark mode.
 */
export default function QuickViewDialog({
  open, onOpenChange, kind, media, badge, title, subtitle, actions, bodyLabel, body,
}: QuickViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={`quick-view-${kind.toLowerCase()}`}
        className="w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-3xl max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-background text-foreground rounded-2xl sm:rounded-2xl"
      >
        <DialogHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 sm:px-8 py-4">
          <DialogTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {kind}
          </DialogTitle>
          {/* Screen-reader description — silences Radix warning and announces context */}
          <DialogDescription className="sr-only">
            {kind} details for {title}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
            <div className="shrink-0">{media}</div>
            <div className="flex flex-col items-start gap-3 min-w-0 flex-1 pt-1">
              {badge && (
                <span
                  className="inline-flex items-center min-h-6 rounded-full bg-foreground text-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {badge}
                </span>
              )}
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight tracking-tight break-words">
                {title}
              </h3>
              {subtitle && (
                <div className="text-sm sm:text-base text-muted-foreground break-words">
                  {subtitle}
                </div>
              )}
              {actions}
            </div>
          </div>
          {body && (
            <div className="mt-8 pt-6 border-t border-border">
              {bodyLabel && (
                <h4 className="text-sm font-semibold text-foreground mb-3">{bodyLabel}</h4>
              )}
              <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {body}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}