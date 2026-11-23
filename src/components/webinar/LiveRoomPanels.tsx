import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChatPanel, QAPanel, PollsPanel, RequestsPanel, ParticipantsPanel, useSidebarCounts,
} from "./WebinarSidebar";
import { subscribeSessionParticipants, type SidebarParticipant } from "./participantStore";
import { ROOM_ICON_BTN, ROOM_PANEL } from "./roomTheme";

export type RoomTab = "qa" | "polls" | "participants" | "requests";

type Common = { sessionId: string; userId: string; isHost: boolean };

function ExpandButton({ expanded, onClick, label }: { expanded: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={expanded ? `Shrink ${label}` : `Expand ${label}`} className={ROOM_ICON_BTN}>
      {expanded ? <Minimize2 className="h-4 w-4" strokeWidth={1.5} /> : <Maximize2 className="h-4 w-4" strokeWidth={1.5} />}
    </button>
  );
}

/** Session tools: Q&A, Polls, People, Stage behind one segmented control. */
export function RoomTabsCard({
  sessionId, userId, isHost, canPublish, tab, onTab, expanded, onToggleExpand, className,
}: Common & {
  canPublish: boolean;
  tab: RoomTab;
  onTab: (t: RoomTab) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  className?: string;
}) {
  const counts = useSidebarCounts(sessionId, isHost);
  const [participants, setParticipants] = useState<SidebarParticipant[]>([]);
  useEffect(() => subscribeSessionParticipants(sessionId, setParticipants), [sessionId]);

  const tabs: { key: RoomTab; label: string; count: number; show: boolean }[] = [
    { key: "qa", label: "Q&A", count: counts.qa, show: true },
    { key: "polls", label: "Polls", count: counts.polls, show: true },
    { key: "participants", label: "People", count: participants.length, show: true },
    { key: "requests", label: isHost ? "Hands" : "Stage", count: counts.requests, show: isHost || !canPublish },
  ];

  return (
    <section aria-label="Session tools" className={cn("flex min-h-0 flex-col rounded-[20px]", ROOM_PANEL, className)}>
      <div className="flex items-center gap-2 p-2 pb-0">
        <div role="tablist" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-[12px] bg-white/[0.04] p-1 no-scrollbar">
          {tabs.filter((t) => t.show).map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => onTab(t.key)}
                className={cn(
                  "relative inline-flex h-8 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wb-accent)]",
                  active ? "bg-white/[0.09] text-white" : "text-white/50 hover:text-white/85",
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn("font-mono text-[11px] tabular-nums", active ? "text-[color:var(--wb-accent)]" : "text-white/35")}>
                    {t.count > 99 ? "99+" : t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <ExpandButton expanded={expanded} onClick={onToggleExpand} label="panel" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "qa" && <QAPanel sessionId={sessionId} userId={userId} isHost={isHost} />}
        {tab === "polls" && <PollsPanel sessionId={sessionId} userId={userId} isHost={isHost} />}
        {tab === "participants" && <ParticipantsPanel participants={participants} />}
        {tab === "requests" && (
          <RequestsPanel sessionId={sessionId} userId={userId} isHost={isHost} canPublish={canPublish} />
        )}
      </div>
    </section>
  );
}

/** Always-open chat card. */
export function RoomChatCard({
  sessionId, userId, isHost, expanded, onToggleExpand, className,
}: Common & { expanded: boolean; onToggleExpand: () => void; className?: string }) {
  return (
    <section aria-label="Chat" className={cn("flex min-h-0 flex-col rounded-[20px]", ROOM_PANEL, className)}>
      <div className="flex items-center justify-between py-2 pl-5 pr-2">
        <h2 className="text-[15px] font-medium text-white">Chat</h2>
        <ExpandButton expanded={expanded} onClick={onToggleExpand} label="chat" />
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel sessionId={sessionId} userId={userId} isHost={isHost} variant="bubbles" />
      </div>
    </section>
  );
}
