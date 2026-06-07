import { Loader2 } from "lucide-react";

/**
 * App-wide loading screen. Used as the Suspense fallback for route-level
 * lazy loading and any other deferred chunk (e.g. webinar stage).
 */
export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
      <span className="text-[12px] tracking-wide">{label}</span>
    </div>
  );
}

export default FullPageLoader;