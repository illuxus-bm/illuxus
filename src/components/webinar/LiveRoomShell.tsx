import { Suspense, lazy, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BarChart2, ChevronLeft, ChevronRight, Eye, Hand, HelpCircle, Home, LogOut,
  Maximize2, Minimize2, Radio, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ROOM_ENTER, ROOM_ICON_BTN, ROOM_PANEL, ROOM_SHELL } from "./roomTheme";
import { subscribeSessionParticipants } from "./participantStore";
import type { RoomTab } from "./LiveRoomPanels";

const RoomTabsCard = lazy(() => import("./LiveRoomPanels").then((m) => ({ default: m.RoomTabsCard })));
const RoomChatCard = lazy(() => import("./LiveRoomPanels").then((m) => ({ default: m.RoomChatCard })));

export type Crumb = { label: string; href?: string };

/**
 * The room's signature: a small on-air light. Red when live (or recording),
 * grey otherwise. Used for status only, never decoration.
 */
export function OnAirChip({ live, label, className }: { live: boolean; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-[8px] bg-black/60 px-2.5 text-[12px] font-medium text-white",
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-[#E5484D]" : "bg-white/40")} />
      {label}
    </span>
  );
}

type Props = {
  /** CSS variables from `roomThemeStyle`. */
  style: CSSProperties;
  sessionId: string;
  userId: string;
  isHost: boolean;
  canPublish: boolean;
  isLive: boolean;
  title: string;
  org: { name: string | null; logo: string | null };
  breadcrumbs: Crumb[];
  /** Where Back / Home / the minimized card's link go. */
  backHref: string;
  backLabel?: string;
  /** Session branding draws a logo top-left on the stage; status moves right. */
  logoOnStage?: boolean;
  /** The <WebinarStage> element. Must be a stable element (see keep-alive note). */
  stage: ReactNode;
  /** Overlays drawn over the stage while expanded (reactions, announcements). */
  stageOverlays?: ReactNode;
  /** Extra header buttons before Minimize / Leave (host controls). */
  headerActions?: ReactNode;
  minimized: boolean;
  onMinimizedChange: (v: boolean) => void;
  onLeave: () => void;
};

/**
 * The live room layout shared by attendees (/e/:id/live) and hosts
 * (dashboard broadcast): icon rail, breadcrumb header, stage card, and a right
 * column with the session tools above an always-open chat.
 *
 * Keep-alive: every ancestor of the stage renders on both the full and the
 * minimized path (minimized flips them to `display: contents`) and siblings
 * are toggled with `&&`, so the stage keeps the same position in the tree and
 * the video room never remounts. No ancestor may set transform / filter /
 * backdrop-filter / animation — that would trap the minimized `position: fixed` PiP.
 *
 * The room is portalled to <body> so it sits above the host page's chrome
 * (the dashboard's sticky top bar is z-50) whatever page embeds it. The
 * portal target never changes, so the stage still never remounts.
 */
export function LiveRoomShell({
  style, sessionId, userId, isHost, canPublish, isLive, title, org, breadcrumbs, backHref,
  backLabel = "Back", logoOnStage, stage, stageOverlays, headerActions, minimized, onMinimizedChange, onLeave,
}: Props) {
  const [roomTab, setRoomTab] = useState<RoomTab>(isHost ? "participants" : "qa");
  const [expandedCard, setExpandedCard] = useState<"tabs" | "chat" | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  useEffect(() => subscribeSessionParticipants(sessionId, (list) => setViewerCount(list.length)), [sessionId]);

  const tabsFlex = expandedCard === "tabs" ? "lg:flex-[7]" : expandedCard === "chat" ? "lg:flex-[2]" : "lg:flex-[5]";
  const chatFlex = expandedCard === "chat" ? "lg:flex-[8]" : expandedCard === "tabs" ? "lg:flex-[3]" : "lg:flex-[6]";
  const railTabs: { key: RoomTab; icon: typeof Users; label: string }[] = [
    { key: "qa", icon: HelpCircle, label: "Q&A" },
    { key: "polls", icon: BarChart2, label: "Polls" },
    { key: "participants", icon: Users, label: "People" },
    ...(isHost ? [{ key: "requests" as RoomTab, icon: Hand, label: "Raised hands" }] : []),
  ];

  const room = (
      <div
        style={style}
        className={cn(ROOM_SHELL, minimized ? "contents" : "fixed inset-0 z-[60] flex overflow-y-auto lg:overflow-hidden")}
      >
        {!minimized && (
          <nav aria-label="Room" className="hidden lg:flex w-[72px] shrink-0 flex-col items-center border-r border-white/[0.06] py-5">
            {org.logo ? (
              <img src={org.logo} alt={org.name ?? ""} className="h-9 w-9 rounded-[10px] object-cover" />
            ) : (
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.06] text-[14px] font-medium text-white/80">
                {(org.name || title || "I").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="my-auto flex flex-col items-center gap-1">
              <Link to={backHref} aria-label={backLabel} title={backLabel} className={ROOM_ICON_BTN}>
                <Home className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </Link>
              <span aria-current="page" title="Live room" className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.08] text-white">
                <Radio className="h-[18px] w-[18px]" strokeWidth={1.5} />
                {isLive && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#E5484D]" />}
              </span>
              <span aria-hidden className="my-2 h-px w-5 bg-white/[0.08]" />
              {railTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setRoomTab(t.key)}
                  aria-label={t.label}
                  title={t.label}
                  aria-pressed={roomTab === t.key}
                  className={cn(ROOM_ICON_BTN, roomTab === t.key && "bg-white/[0.06] text-white")}
                >
                  <t.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <button onClick={onLeave} aria-label="Leave" title="Leave" className={cn(ROOM_ICON_BTN, "hover:bg-[#E5484D]/15 hover:text-[#FF7A72]")}>
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
          </nav>
        )}

        <div className={minimized ? "contents" : "flex min-w-0 flex-1 flex-col gap-4 p-4 lg:h-full lg:p-5"}>
          {!minimized && (
            <header className="flex h-9 items-center gap-2">
              <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-1.5 text-[14px]">
                  {breadcrumbs.map((c, i) => {
                    const last = i === breadcrumbs.length - 1;
                    return (
                      <li key={i} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex shrink-0")}>
                        {i > 0 && <ChevronRight aria-hidden className="hidden sm:block h-3.5 w-3.5 shrink-0 text-white/25" />}
                        {last ? (
                          <span aria-current="page" className="min-w-0 truncate text-white/85">{c.label}</span>
                        ) : c.href ? (
                          <Link to={c.href} className="max-w-[14rem] truncate text-white/40 transition-colors duration-150 hover:text-white/80">{c.label}</Link>
                        ) : (
                          <span className="max-w-[14rem] truncate text-white/40">{c.label}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
              {headerActions}
              {headerActions && <span aria-hidden className="mx-1 h-5 w-px bg-white/[0.08]" />}
              <button onClick={() => setRoomTab("participants")} aria-label="People" title="People" className={cn(ROOM_ICON_BTN, "lg:hidden")}>
                <Users className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </button>
              <button onClick={() => onMinimizedChange(true)} aria-label="Minimize" title="Minimize" className={ROOM_ICON_BTN}>
                <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </button>
              <button onClick={onLeave} aria-label="Leave" title="Leave" className={cn(ROOM_ICON_BTN, "lg:hidden hover:bg-[#E5484D]/15 hover:text-[#FF7A72]")}>
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </button>
            </header>
          )}

          <div className={minimized ? "contents" : "flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row"}>
            <section
              aria-label="Stage"
              className={minimized ? "contents" : cn("flex min-w-0 flex-col rounded-[24px] p-3 lg:flex-1", ROOM_PANEL)}
            >
              {!minimized && (
                <div className="flex items-end justify-between gap-4 px-3 pb-4 pt-2">
                  <div className="min-w-0">
                    <Link to={backHref} className="-ml-1 mb-1 inline-flex items-center gap-0.5 rounded-[6px] px-1 text-[13px] text-white/50 transition-colors duration-150 hover:text-white">
                      <ChevronLeft className="h-3.5 w-3.5" />{backLabel}
                    </Link>
                    <h1 className="text-[18px] sm:text-[20px] font-medium leading-snug tracking-[-0.01em] text-white line-clamp-2">{title}</h1>
                  </div>
                  {org.name && (
                    <span className="hidden sm:flex shrink-0 items-center gap-2 pb-0.5 text-[13px] text-white/50">
                      {org.logo && <img src={org.logo} alt="" className="h-6 w-6 rounded-full object-cover" />}
                      <span className="max-w-[12rem] truncate">{org.name}</span>
                    </span>
                  )}
                </div>
              )}

              <div
                className={
                  minimized
                    ? "fixed bottom-4 right-4 w-[340px] h-[200px] rounded-[12px] overflow-hidden ring-1 ring-white/10 shadow-xl bg-black z-[60]"
                    : "relative h-[62vw] min-h-[300px] overflow-hidden rounded-[12px] bg-black lg:h-auto lg:min-h-0 lg:flex-1"
                }
              >
                {stage}
                {!minimized && (
                  <>
                    {stageOverlays}
                    <div className={cn("pointer-events-none absolute top-3 z-20 flex gap-1.5", logoOnStage ? "right-3" : "left-3")}>
                      <OnAirChip live={isLive} label={isLive ? "Live" : isHost ? "Not live" : "Starting soon"} />
                      {viewerCount > 0 && (
                        <span
                          className="inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-black/60 px-2.5 text-[12px] font-medium tabular-nums text-white/85"
                          aria-label={`${viewerCount} in the room`}
                        >
                          <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />{viewerCount}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {minimized && (
                  <div className="absolute top-1.5 right-1.5 z-30 flex gap-1">
                    <Button size="icon" variant="secondary" className="h-7 w-7 rounded-[8px]" onClick={() => onMinimizedChange(false)} aria-label="Restore webinar"><Maximize2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="destructive" className="h-7 w-7 rounded-[8px]" onClick={onLeave} aria-label="Leave"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            </section>

            {!minimized && (
              <aside aria-label="Interaction" className={cn("flex w-full shrink-0 flex-col gap-4 lg:w-[360px] lg:min-h-0 xl:w-[400px]", ROOM_ENTER)}>
                <Suspense fallback={<div className={cn("h-[420px] rounded-[20px] lg:h-auto lg:flex-[5]", ROOM_PANEL)} />}>
                  <RoomTabsCard
                    sessionId={sessionId}
                    userId={userId}
                    isHost={isHost}
                    canPublish={canPublish}
                    tab={roomTab}
                    onTab={setRoomTab}
                    expanded={expandedCard === "tabs"}
                    onToggleExpand={() => setExpandedCard((c) => (c === "tabs" ? null : "tabs"))}
                    className={cn("h-[420px] lg:h-auto", tabsFlex)}
                  />
                  <RoomChatCard
                    sessionId={sessionId}
                    userId={userId}
                    isHost={isHost}
                    expanded={expandedCard === "chat"}
                    onToggleExpand={() => setExpandedCard((c) => (c === "chat" ? null : "chat"))}
                    className={cn("h-[520px] lg:h-auto", chatFlex)}
                  />
                </Suspense>
              </aside>
            )}
          </div>
        </div>
      </div>
  );

  return (
    <>
      {minimized && (
        <div className="p-6 max-w-2xl mx-auto space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backHref}><ArrowLeft className="h-4 w-4 mr-1" />{backLabel}</Link>
          </Button>
          <Card className="p-4">
            <p className="text-[13px] text-muted-foreground">Webinar minimized — still connected</p>
            <Button size="sm" className="mt-2" onClick={() => onMinimizedChange(false)}>
              <Maximize2 className="h-3 w-3 mr-1" />Return to webinar
            </Button>
          </Card>
        </div>
      )}
      {typeof document !== "undefined" ? createPortal(room, document.body) : room}
    </>
  );
}

/** Text button for host controls in the room header. */
export function RoomHeaderButton({
  children, onClick, tone = "neutral", disabled, title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "accent" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-2.5 sm:px-3.5 text-[13px] font-medium transition-[background-color,color,filter] duration-150 ease-out disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wb-accent)]",
        tone === "accent" && "bg-[color:var(--wb-accent)] text-[color:var(--wb-accent-fg)] hover:brightness-110",
        tone === "danger" && "bg-white/[0.06] text-[#FF7A72] hover:bg-[#E5484D]/15",
        tone === "neutral" && "bg-white/[0.06] text-white/85 hover:bg-white/[0.1] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
