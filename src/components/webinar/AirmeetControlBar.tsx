import { useEffect, useState } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { Track, RoomEvent, ParticipantEvent, type RemoteParticipant } from "livekit-client";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Smile, Users, LogIn, LogOut as LogOutIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REACTIONS = ["👏", "❤️", "🔥", "😂", "🎉", "👍"];

/**
 * Airmeet-style stage control bar.
 * Large round buttons, color-coded mute states, clear separation of
 * destructive (leave) action. Replaces LiveKit's built-in ControlBar so we
 * can match the product design language.
 */
export function AirmeetControlBar({
  sessionId,
  userId,
  isHost,
}: {
  sessionId: string;
  userId?: string;
  isHost: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const canPublish = !!localParticipant?.permissions?.canPublish;

  // Track publish state so the UI reflects mute/unmute immediately.
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [lastReact, setLastReact] = useState(0);

  useEffect(() => {
    if (!localParticipant) return;
    const sync = () => {
      setMicOn(!!localParticipant.isMicrophoneEnabled);
      setCamOn(!!localParticipant.isCameraEnabled);
      setScreenOn(!!localParticipant.isScreenShareEnabled);
    };
    sync();
    const onChange = () => sync();
    localParticipant.on(ParticipantEvent.TrackMuted, onChange);
    localParticipant.on(ParticipantEvent.TrackUnmuted, onChange);
    localParticipant.on(ParticipantEvent.LocalTrackPublished, onChange);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, onChange);
    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, onChange);
      localParticipant.off(ParticipantEvent.TrackUnmuted, onChange);
      localParticipant.off(ParticipantEvent.LocalTrackPublished, onChange);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, onChange);
    };
  }, [localParticipant]);

  // Host: list backstage participants (connected, not publishing).
  const [backstage, setBackstage] = useState<Array<{ identity: string; name: string }>>([]);
  useEffect(() => {
    if (!isHost || !room) return;
    const refresh = () => {
      const list: Array<{ identity: string; name: string }> = [];
      room.remoteParticipants.forEach((p: RemoteParticipant) => {
        if (!p.permissions?.canPublish) list.push({ identity: p.identity, name: p.name || p.identity });
      });
      setBackstage(list);
    };
    refresh();
    room.on(RoomEvent.ParticipantConnected, refresh);
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.ParticipantPermissionsChanged, refresh);
    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh);
      room.off(RoomEvent.ParticipantDisconnected, refresh);
      room.off(RoomEvent.ParticipantPermissionsChanged, refresh);
    };
  }, [isHost, room]);

  const toggleMic = async () => {
    if (!canPublish || !localParticipant) return;
    try { await localParticipant.setMicrophoneEnabled(!micOn); } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Mic error");
    }
  };
  const toggleCam = async () => {
    if (!canPublish || !localParticipant) return;
    try { await localParticipant.setCameraEnabled(!camOn); } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Camera error");
    }
  };
  const toggleScreen = async () => {
    if (!canPublish || !localParticipant) return;
    try { await localParticipant.setScreenShareEnabled(!screenOn); } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Screen share error");
    }
  };

  const toggleSelfStage = async () => {
    if (stageBusy) return;
    setStageBusy(true);
    try {
      const action = canPublish ? "demote" : "promote";
      if (canPublish && localParticipant) {
        try { await localParticipant.setMicrophoneEnabled(false); } catch {}
        try { await localParticipant.setCameraEnabled(false); } catch {}
        try { await localParticipant.setScreenShareEnabled(false); } catch {}
      }
      const { error } = await supabase.functions.invoke("livekit-promote", {
        body: { session_id: sessionId, action, self: true },
      });
      if (error) throw error;
      toast.success(action === "promote" ? "You're on stage" : "You're in backstage");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update stage");
    } finally {
      setStageBusy(false);
    }
  };

  const hostToggle = async (identity: string, action: "promote" | "demote") => {
    const { error } = await supabase.functions.invoke("livekit-promote", {
      body: { session_id: sessionId, action, target_user_id: identity },
    });
    if (error) toast.error(error.message);
    else toast.success(action === "promote" ? "Sent to stage" : "Moved to backstage");
  };

  const sendReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastReact < 400) return;
    setLastReact(now);

    let cleanUserId: string | null = null;
    if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      cleanUserId = userId;
    } else if (userId && userId.startsWith("guest-")) {
      const uuidPart = userId.slice(6);
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidPart)) {
        cleanUserId = uuidPart;
      }
    }

    supabase.from("webinar_reactions" as any)
      .insert({ session_id: sessionId, user_id: cleanUserId, emoji } as any)
      .then(({ error }) => {
        if (error) {
          console.error("Reaction insert failed:", error);
          toast.error(`Failed to send reaction: ${error.message}`);
        }
      });
    setReactionOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 shadow-2xl max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar">
        {canPublish && (
          <>
            <CtrlBtn label={micOn ? "Mute mic" : "Unmute mic"} active={micOn} danger={!micOn} onClick={toggleMic}>
              {micOn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
            </CtrlBtn>
            <CtrlBtn label={camOn ? "Stop camera" : "Start camera"} active={camOn} danger={!camOn} onClick={toggleCam}>
              {camOn ? <Video className="h-[18px] w-[18px]" /> : <VideoOff className="h-[18px] w-[18px]" />}
            </CtrlBtn>
            <CtrlBtn label={screenOn ? "Stop sharing" : "Share screen"} active={screenOn} onClick={toggleScreen}>
              {screenOn ? <MonitorOff className="h-[18px] w-[18px]" /> : <MonitorUp className="h-[18px] w-[18px]" />}
            </CtrlBtn>
            <Divider />
          </>
        )}

        {userId && (
          <Popover open={reactionOpen} onOpenChange={setReactionOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" className={ctrlBase()} aria-label="React">
                    <Smile className="h-[18px] w-[18px]" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">React</TooltipContent>
            </Tooltip>
            <PopoverContent align="center" side="top" sideOffset={12} className="w-auto p-1.5 flex gap-1 bg-zinc-900 border-white/10">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => sendReaction(e)}
                  className="text-xl w-10 h-10 rounded-full hover:bg-white/10 active:scale-90 transition flex items-center justify-center"
                  aria-label={`react ${e}`}
                >{e}</button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {isHost && (
          <Popover open={backstageOpen} onOpenChange={setBackstageOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" className={cn(ctrlBase(), "relative")} aria-label="Backstage">
                    <Users className="h-[18px] w-[18px]" />
                    {backstage.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {backstage.length}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Backstage</TooltipContent>
            </Tooltip>
            <PopoverContent align="center" side="top" sideOffset={12} className="w-72 p-2 bg-zinc-900 border-white/10 text-white">
              <div className="text-[11px] uppercase tracking-wider text-white/50 px-2 py-1.5">Backstage ({backstage.length})</div>
              {backstage.length === 0 ? (
                <p className="text-[12px] text-white/60 px-2 py-3">No one is waiting backstage.</p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {backstage.map((p) => (
                    <li key={p.identity} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-white/5">
                      <span className="text-[13px] truncate">{p.name}</span>
                      <button onClick={() => hostToggle(p.identity, "promote")} className="text-[11px] h-7 px-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Bring on</button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        )}

        <Divider />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSelfStage}
              disabled={stageBusy}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-3 sm:px-4 rounded-full text-[12px] sm:text-[13px] font-semibold transition disabled:opacity-60 shrink-0",
                canPublish
                  ? "bg-white/10 hover:bg-white/20 text-white"
                  : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950",
              )}
              aria-label={canPublish ? "Leave stage" : "Go on stage"}
            >
              {canPublish ? <LogOutIcon className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              <span className="hidden md:inline">{canPublish ? "Leave stage" : "Go on stage"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{canPublish ? "Move to backstage" : "Join the stage"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function ctrlBase() {
  return "inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95";
}

function CtrlBtn({
  children, onClick, label, active, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-full transition active:scale-95",
            danger
              ? "bg-destructive/90 hover:bg-destructive text-destructive-foreground"
              : active
              ? "bg-white/15 hover:bg-white/25 text-white"
              : "bg-white/10 hover:bg-white/20 text-white",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-white/10 mx-0.5 shrink-0" aria-hidden />;
}