import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { Bell, CheckCircle2, Megaphone, Smartphone, UserCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { SOURCES } from "@/components/three/stage-state";

/**
 * Product snapshots that sit beside each story chapter. Every animated value
 * hangs off a `--t` custom property (0 → 1) set on the card root, so the
 * scroll timeline can scrub a card without re-rendering it. Left alone, `--t`
 * is 1 and the card shows its finished state.
 */

const grow = (percent: number): CSSProperties => ({ width: `calc(${percent}% * var(--t, 1))` });
const appearAfter = (start: number): CSSProperties => ({
  opacity: `clamp(0, calc((var(--t, 1) - ${start}) * 5), 1)`,
});

const Card = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(({ className, children }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-[0_30px_60px_-36px_rgba(3,14,26,0.55)]",
      className,
    )}
  >
    {children}
  </div>
));
Card.displayName = "StoryCard";

function LivePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-live-pulse" />
      {children}
    </span>
  );
}

const Track = ({ children }: { children: ReactNode }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">{children}</div>
);

export const TiersCard = forwardRef<HTMLDivElement, { className?: string }>(({ className }, ref) => (
  <Card ref={ref} className={className}>
    <div className="mb-4 flex items-center justify-between">
      <span className="eyebrow text-muted-foreground">Ticket tiers</span>
      <span className="text-[11px] text-muted-foreground">Auto-sequence on</span>
    </div>
    <div className="space-y-3">
      {[
        { name: "Early bird", price: "₹1,499", sold: "240/250", percent: 96 },
        { name: "General", price: "₹2,499", sold: "612/1000", percent: 61 },
        { name: "VIP", price: "₹7,499", sold: "82/100", percent: 82 },
      ].map((tier) => (
        <div key={tier.name}>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">{tier.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {tier.sold} · <span className="font-semibold text-foreground">{tier.price}</span>
            </span>
          </div>
          <Track>
            <div className="h-full rounded-full bg-accent" style={grow(tier.percent)} />
          </Track>
        </div>
      ))}
    </div>
    <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-muted/60 p-3" style={appearAfter(0.55)}>
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
        <Megaphone className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold">Reminder email queued</div>
        <div className="truncate text-[11px] text-muted-foreground">Sends to 1,248 RSVPs · 24h before doors</div>
      </div>
      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">Scheduled</span>
    </div>
  </Card>
));
TiersCard.displayName = "TiersCard";

export const CheckinCard = forwardRef<HTMLDivElement, { className?: string }>(({ className }, ref) => (
  <Card ref={ref} className={className}>
    <div className="mb-4 flex items-center justify-between">
      <span className="eyebrow text-muted-foreground">Live attendees</span>
      <LivePill>syncing</LivePill>
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center justify-between rounded-lg bg-accent/15 px-2.5 py-2" style={appearAfter(0.5)}>
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <span className="text-[13px] font-semibold">Maya Patel</span>
          <span className="text-[11px] text-muted-foreground">Checked in</span>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">19:04</span>
      </div>
      {[
        { name: "Marcus Rivera", time: "19:02" },
        { name: "Anja Müller", time: "19:01" },
      ].map((row) => (
        <div key={row.name} className="flex items-center justify-between px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-4 rounded-full bg-foreground/15" />
            <span className="text-[13px]">{row.name}</span>
          </div>
          <span className="text-[12px] tabular-nums text-muted-foreground">{row.time}</span>
        </div>
      ))}
    </div>
  </Card>
));
CheckinCard.displayName = "CheckinCard";

export const DoorCard = forwardRef<HTMLDivElement, { className?: string }>(({ className }, ref) => (
  <Card ref={ref} className={className}>
    <div className="flex items-start justify-between">
      <div>
        <span className="eyebrow text-muted-foreground">Door 2 · Founder Summit</span>
        <div className="mt-2 flex items-baseline gap-2">
          {/* The scroll timeline rewrites this number as the hall fills. */}
          <span data-counter className="poster text-[56px] tabular-nums text-foreground">
            892
          </span>
          <span className="text-[13px] text-muted-foreground">of 1,200 in</span>
        </div>
      </div>
      <LivePill>live</LivePill>
    </div>
    <div className="mt-3">
      <Track>
        <div className="h-full rounded-full bg-emerald-500" style={grow(74)} />
      </Track>
    </div>
    <div className="mt-4 space-y-2">
      {[
        { icon: Bell, text: "Push sent · Workshop B starts in 10 min", time: "2m ago", start: 0.25 },
        { icon: UserCheck, text: "Marcus Rivera checked in", time: "3m ago", start: 0.5 },
        { icon: Smartphone, text: "Stage A capacity 88% — usher alerted", time: "5m ago", start: 0.75 },
      ].map(({ icon: Icon, text, time, start }) => (
        <div key={text} className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/60 px-2.5 py-2" style={appearAfter(start)}>
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{text}</span>
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>
      ))}
    </div>
  </Card>
));
DoorCard.displayName = "DoorCard";

export const SourcesCard = forwardRef<HTMLDivElement, { className?: string }>(({ className }, ref) => {
  const top = SOURCES[0].count;
  return (
    <Card ref={ref} className={className}>
      <div className="mb-4 flex items-center justify-between">
        <span className="eyebrow text-muted-foreground">Top sources</span>
        <LivePill>Live</LivePill>
      </div>
      <div className="space-y-3">
        {SOURCES.map((source) => (
          <div key={source.name}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold">{source.name}</span>
              <span className="tabular-nums text-muted-foreground">{source.count}</span>
            </div>
            <Track>
              <div className="h-full rounded-full bg-accent" style={grow(Math.round((source.count / top) * 92))} />
            </Track>
          </div>
        ))}
      </div>
    </Card>
  );
});
SourcesCard.displayName = "SourcesCard";

/** Flat paper ticket, shown in place of the 3D one when WebGL is unavailable. */
export function PaperTicket({ className }: { className?: string }) {
  return (
    <div className={cn("ticket-notch flex aspect-[2.25] w-full overflow-hidden rounded-[14px] bg-primary text-primary-foreground", className)}>
      <div className="w-[2.5%] shrink-0 bg-accent" />
      <div className="flex min-w-0 flex-1 flex-col justify-between p-[4.5%]">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow !text-[10px] opacity-70">illuxus · Admit one</span>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-foreground">
            General
          </span>
        </div>
        <div className="poster text-[clamp(28px,7.2vw,58px)]">
          Founder
          <br />
          Summit 2026
        </div>
        <div className="flex gap-[6%] border-t border-primary-foreground/25 pt-[3%] text-[clamp(9px,1.6vw,13px)]">
          {[
            ["Date", "12 Dec 2026"],
            ["Doors", "18:30"],
            ["Gate", "02"],
            ["Seat", "B-14"],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="uppercase tracking-[0.14em] opacity-60">{label}</div>
              <div className="font-bold">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-[28%] shrink-0 flex-col items-center justify-center gap-[6%] border-l border-dashed border-primary-foreground/40 p-[3%]">
        <QRCodeSVG value="https://illuxus.com" bgColor="transparent" fgColor="currentColor" className="h-auto w-[72%]" />
        <span className="text-[clamp(8px,1.3vw,11px)] font-bold tracking-[0.18em]">NO. 000892</span>
      </div>
    </div>
  );
}
