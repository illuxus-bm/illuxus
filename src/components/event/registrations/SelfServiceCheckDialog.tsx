import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ExternalLink, LogIn, LogOut, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";
import { publicUrl } from "@/lib/publicUrl";

type Registration = Tables<"registrations">;

export interface SelfServiceCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** All registrations the dashboard already loaded; used for the inside list. */
  registrations: readonly Registration[];
}

/**
 * Kiosk-style dialog organizers can show on a screen at the venue. Surfaces:
 *   - The public Self check-in URL (`/checkin/:eventId`) as a copyable link
 *     with an inline QR code, so attendees can scan the screen to self-check-in.
 *   - The matching Self check-OUT URL (`/checkout/:eventId`) on a separate tab,
 *     same treatment.
 *   - A live "Currently inside" list pulled from the registrations the dashboard
 *     already has loaded, filtered by `attendance_state === 'inside'` and sorted
 *     by `last_in_at` (most recent first).
 *
 * The dialog reads from the `registrations` prop only; it does not issue any
 * RPCs. As registrations refresh upstream (realtime + manual reloads in
 * `RegistrationsSection`), the inside list updates automatically.
 */
export default function SelfServiceCheckDialog({
  open,
  onOpenChange,
  eventId,
  registrations,
}: SelfServiceCheckDialogProps) {
  const [copied, setCopied] = useState<"in" | "out" | null>(null);

  const checkInUrl = useMemo(() => publicUrl(`/checkin/${eventId}`), [eventId]);
  const checkOutUrl = useMemo(() => publicUrl(`/checkout/${eventId}`), [eventId]);

  // Sort by last_in_at desc; nulls go to the end.
  const inside = useMemo(() => {
    return registrations
      .filter((r) => r.attendance_state === "inside")
      .slice()
      .sort((a, b) => {
        const at = a.last_in_at ? new Date(a.last_in_at).getTime() : 0;
        const bt = b.last_in_at ? new Date(b.last_in_at).getTime() : 0;
        return bt - at;
      });
  }, [registrations]);

  const handleCopy = async (kind: "in" | "out", url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard write can fail in non-secure contexts; surface but don't crash.
      setCopied(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Self-service kiosk
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Show this screen at the entrance / exit so attendees can scan their
            own QR codes. URLs are also copyable for embedding in emails or
            digital signage.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Left: QR + URL tabs */}
          <Tabs defaultValue="in" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in" className="gap-1.5">
                <LogIn className="h-3.5 w-3.5" /> Check-in
              </TabsTrigger>
              <TabsTrigger value="out" className="gap-1.5">
                <LogOut className="h-3.5 w-3.5" /> Check-out
              </TabsTrigger>
            </TabsList>

            <TabsContent value="in" className="space-y-3">
              <KioskCard
                kind="in"
                url={checkInUrl}
                copied={copied === "in"}
                onCopy={() => handleCopy("in", checkInUrl)}
              />
            </TabsContent>
            <TabsContent value="out" className="space-y-3">
              <KioskCard
                kind="out"
                url={checkOutUrl}
                copied={copied === "out"}
                onCopy={() => handleCopy("out", checkOutUrl)}
              />
            </TabsContent>
          </Tabs>

          {/* Right: Currently inside list */}
          <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[280px] max-h-[420px]">
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[12px] font-semibold">Currently inside</p>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {inside.length}
              </span>
            </div>
            <ScrollArea className="flex-1">
              {inside.length === 0 ? (
                <div className="p-4 text-[12px] text-muted-foreground text-center">
                  No one has checked in yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {inside.map((r) => (
                    <li key={r.id} className="px-3 py-2">
                      <p className="text-[13px] font-medium truncate">
                        {r.name || r.email || "Unknown"}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {r.ticket_type ?? "attendee"}
                        </span>
                        {r.last_in_at && (
                          <span className="shrink-0 tabular-nums">
                            {new Date(r.last_in_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface KioskCardProps {
  kind: "in" | "out";
  url: string;
  copied: boolean;
  onCopy: () => void;
}

function KioskCard({ kind, url, copied, onCopy }: KioskCardProps) {
  const labels =
    kind === "in"
      ? { title: "Check-in URL", hint: "Attendees scan to mark themselves on-site." }
      : { title: "Check-out URL", hint: "Attendees scan when they leave." };
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center text-center gap-3">
      <div className="rounded-lg bg-background p-3 border border-border">
        <QRCodeSVG
          value={url}
          size={196}
          bgColor="transparent"
          fgColor="currentColor"
          level="M"
        />
      </div>
      <div className="space-y-0.5">
        <p className="text-[12px] font-semibold">{labels.title}</p>
        <p className="text-[11px] text-muted-foreground">{labels.hint}</p>
      </div>
      <div className="w-full font-mono text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-md px-2 py-1.5 break-all">
        {url}
      </div>
      <div className="flex gap-2 w-full">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 text-[12px]"
          onClick={onCopy}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy URL
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
        </Button>
      </div>
    </div>
  );
}
