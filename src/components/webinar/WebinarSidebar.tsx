import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Send, ThumbsUp, Pin, CheckCircle2, Hand, MessageSquare, HelpCircle,
  BarChart2, UserPlus, Trash2, ChevronDown, Plus, X, Users, Mic, MicOff, Video, VideoOff, Search, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { subscribeSessionParticipants, type SidebarParticipant } from "./participantStore";

const REACTIONS = ["👏", "❤️", "🔥", "😂", "🎉", "👍"];

type Tab = "chat" | "qa" | "polls" | "requests" | "participants";

type Props = {
  sessionId: string;
  isHost: boolean;
  canPublish: boolean;
  userId: string;
};

/** Color-hashed avatar palette for chat participants. */
const AVATAR_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
];

function hashColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function shortName(id: string) {
  return id.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function WebinarSidebar({ sessionId, isHost, canPublish, userId }: Props) {
  const [tab, setTab] = useState<Tab>("chat");
  const [counts, setCounts] = useState({ chat: 0, qa: 0, polls: 0, requests: 0, participants: 0 });
  const lastReact = useRef(0);
  const [participants, setParticipants] = useState<SidebarParticipant[]>([]);

  useEffect(() => {
    return subscribeSessionParticipants(sessionId, (list) => {
      setParticipants(list);
      setCounts((c) => ({ ...c, participants: list.length }));
    });
  }, [sessionId]);

  // Lightweight live counts for tab badges
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [c, q, p, r] = await Promise.all([
        supabase.from("webinar_chat").select("*", { count: "exact", head: true }).eq("session_id", sessionId).eq("deleted", false),
        supabase.from("webinar_qa").select("*", { count: "exact", head: true }).eq("session_id", sessionId),
        supabase.from("webinar_polls").select("*", { count: "exact", head: true }).eq("session_id", sessionId).eq("open", true),
        isHost
          ? supabase.from("webinar_stage_requests").select("*", { count: "exact", head: true }).eq("session_id", sessionId).eq("status", "pending")
          : Promise.resolve({ count: 0 } as any),
      ]);
      if (!mounted) return;
      setCounts((prev) => ({
        ...prev,
        chat: c.count || 0,
        qa: q.count || 0,
        polls: p.count || 0,
        requests: r.count || 0,
      }));
    };
    load();
    const ch = supabase.channel(`sidebar-counts-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_chat", filter: `session_id=eq.${sessionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_qa", filter: `session_id=eq.${sessionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_polls", filter: `session_id=eq.${sessionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_stage_requests", filter: `session_id=eq.${sessionId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId, isHost]);

  const sendReaction = useCallback((emoji: string) => {
    const now = Date.now();
    if (now - lastReact.current < 400) return;
    lastReact.current = now;
    supabase.from("webinar_reactions").insert({ session_id: sessionId, user_id: userId, emoji });
  }, [sessionId, userId]);

  const tabs = ([
    { key: "participants" as Tab, icon: Users, label: "People", count: counts.participants, show: true },
    { key: "chat" as Tab, icon: MessageSquare, label: "Chat", count: counts.chat, show: true },
    { key: "qa" as Tab, icon: HelpCircle, label: "Q&A", count: counts.qa, show: true },
    { key: "polls" as Tab, icon: BarChart2, label: "Polls", count: counts.polls, show: true },
    { key: "requests" as Tab, icon: Hand, label: "Stage", count: counts.requests, show: isHost || (!isHost && !canPublish) },
  ]).filter((t) => t.show);

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      {/* Tab strip */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border/60">
        {tabs.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-9 px-2 rounded-md text-[12px] font-medium transition-colors",
                active
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
              {t.count > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">
                  {t.count > 99 ? "99+" : t.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "chat" && <ChatPanel sessionId={sessionId} userId={userId} isHost={isHost} />}
        {tab === "qa" && <QAPanel sessionId={sessionId} userId={userId} isHost={isHost} />}
        {tab === "polls" && <PollsPanel sessionId={sessionId} userId={userId} isHost={isHost} />}
        {tab === "requests" && <RequestsPanel sessionId={sessionId} userId={userId} isHost={isHost} canPublish={canPublish} />}
        {tab === "participants" && <ParticipantsPanel participants={participants} />}
      </div>

      {/* Reactions tray */}
      <div className="border-t border-border/60 px-2 py-2 flex items-center justify-center gap-0.5 sm:gap-1">
        {REACTIONS.map((e) => (
          <button
            key={e}
            className="text-xl w-10 h-10 rounded-md hover:bg-foreground/5 active:scale-90 transition-transform flex items-center justify-center"
            onClick={() => sendReaction(e)}
            aria-label={`react ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- Chat ---------------------- */

const ChatPanel = memo(function ChatPanel({ sessionId, userId, isHost }: { sessionId: string; userId: string; isHost: boolean }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    supabase.from("webinar_chat").select("*").eq("session_id", sessionId).order("created_at").limit(200)
      .then(({ data }) => { if (mounted) setMsgs(data || []); });
    const ch = supabase.channel(`chat-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webinar_chat", filter: `session_id=eq.${sessionId}` },
        (p) => setMsgs((m) => [...m, p.new]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "webinar_chat", filter: `session_id=eq.${sessionId}` },
        (p: any) => setMsgs((m) => m.map((x) => (x.id === p.new.id ? p.new : x))))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId]);

  useEffect(() => {
    if (!atBottom) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setAtBottom(nearBottom);
  };

  const send = async () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    await supabase.from("webinar_chat").insert({ session_id: sessionId, user_id: userId, message: v });
  };

  const visible = msgs.filter((m) => !m.deleted);

  return (
    <div className="flex flex-col h-full relative">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {visible.length === 0 && (
          <EmptyState icon={MessageSquare} title="No messages yet" body="Say hi to break the ice — your message will appear here in real time." />
        )}
        {visible.map((m) => {
          const isSelf = m.user_id === userId;
          return (
            <div key={m.id} className="group flex items-start gap-2.5">
              <Avatar className={cn("h-7 w-7 text-[10px] font-semibold", hashColor(m.user_id))}>
                <AvatarFallback className={cn("text-[10px] font-semibold", hashColor(m.user_id))}>
                  {shortName(m.user_id)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-semibold truncate">{isSelf ? "You" : `User ${m.user_id.slice(0, 6)}`}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{timeAgo(m.created_at)}</span>
                </div>
                <p className="text-[13px] leading-snug break-words">{m.message}</p>
              </div>
              {isHost && (
                <button
                  onClick={async () => { await supabase.from("webinar_chat").update({ deleted: true }).eq("id", m.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-foreground/10"
                  aria-label="Delete message"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!atBottom && (
        <button
          onClick={() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); setAtBottom(true); }}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-foreground text-background text-[11px] px-2.5 py-1 rounded-full shadow-md flex items-center gap-1"
        >
          <ChevronDown className="h-3 w-3" /> New messages
        </button>
      )}
      <div className="p-2 border-t border-border/60 flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Send a message…"
          className="h-9 text-[13px]"
          maxLength={500}
        />
        <Button size="icon" className="h-9 w-9" onClick={send} disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

/* ---------------------- Q&A ---------------------- */

type QASort = "top" | "newest" | "answered";

const QAPanel = memo(function QAPanel({ sessionId, userId, isHost }: { sessionId: string; userId: string; isHost: boolean }) {
  const [qs, setQs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<QASort>("top");

  useEffect(() => {
    let mounted = true;
    const load = () => supabase.from("webinar_qa").select("*").eq("session_id", sessionId)
      .then(({ data }) => { if (mounted) setQs(data || []); });
    load();
    const ch = supabase.channel(`qa-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_qa", filter: `session_id=eq.${sessionId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId]);

  const sorted = useMemo(() => {
    const arr = [...qs];
    if (sort === "answered") return arr.filter((q) => q.answered).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (sort === "newest") return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    // Top: pinned first, then upvotes
    return arr.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || ((b.upvotes || 0) - (a.upvotes || 0)));
  }, [qs, sort]);

  const ask = async () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    await supabase.from("webinar_qa").insert({ session_id: sessionId, user_id: userId, question: v });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5">
        {(["top", "newest", "answered"] as QASort[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={cn(
              "text-[11px] px-2 h-6 rounded-md capitalize",
              sort === s ? "bg-foreground/10 text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {sorted.length === 0 && (
          <EmptyState icon={HelpCircle} title="No questions yet" body="Be the first to ask — top questions float to the top." />
        )}
        {sorted.map((q) => (
          <div
            key={q.id}
            className={cn(
              "group flex gap-2 p-2.5 rounded-lg border bg-background/50 hover:border-foreground/20 transition-colors",
              q.pinned && "border-primary/40 bg-primary/5",
              q.answered && "opacity-60",
            )}
          >
            <button
              onClick={async () => { await supabase.from("webinar_qa").update({ upvotes: (q.upvotes || 0) + 1 }).eq("id", q.id); }}
              className="flex flex-col items-center justify-center w-9 shrink-0 rounded-md border border-border/60 hover:bg-foreground/5 py-1"
              aria-label="Upvote"
            >
              <ThumbsUp className="h-3 w-3" />
              <span className="text-[11px] font-mono mt-0.5">{q.upvotes || 0}</span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] leading-snug break-words">{q.question}</p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground font-mono">User {q.user_id.slice(0, 6)} · {timeAgo(q.created_at)}</span>
                {q.pinned && <Badge variant="outline" className="h-4 px-1 text-[9px] border-primary/40 text-primary">PINNED</Badge>}
                {q.answered && <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-600 border-emerald-600/40">ANSWERED</Badge>}
              </div>
              {isHost && (
                <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={async () => { await supabase.from("webinar_qa").update({ pinned: !q.pinned }).eq("id", q.id); }}
                    className="h-6 px-2 text-[10px] rounded hover:bg-foreground/5 flex items-center gap-1"
                  >
                    <Pin className="h-2.5 w-2.5" />{q.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={async () => { await supabase.from("webinar_qa").update({ answered: !q.answered }).eq("id", q.id); }}
                    className="h-6 px-2 text-[10px] rounded hover:bg-foreground/5 flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />{q.answered ? "Reopen" : "Mark answered"}
                  </button>
                  <button
                    onClick={async () => { await supabase.from("webinar_qa").delete().eq("id", q.id); }}
                    className="h-6 px-2 text-[10px] rounded hover:bg-destructive/10 text-destructive flex items-center gap-1"
                  >
                    <Trash2 className="h-2.5 w-2.5" />Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border/60 flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), ask())}
          placeholder="Ask a question…"
          className="h-9 text-[13px]"
          maxLength={1000}
        />
        <Button size="icon" className="h-9 w-9" onClick={ask} disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

/* ---------------------- Polls ---------------------- */

type Poll = { id: string; question: string; options: string[]; open: boolean; created_at: string };

const PollsPanel = memo(function PollsPanel({ sessionId, userId, isHost }: { sessionId: string; userId: string; isHost: boolean }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Record<string, { my?: number; counts: number[] }>>({});
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("webinar_polls").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
      if (!mounted) return;
      const list = (data || []).map((p: any) => ({
        ...p,
        options: Array.isArray(p.options) ? p.options : (p.options?.list || []),
      })) as Poll[];
      setPolls(list);
      // Load votes per poll
      if (list.length) {
        const { data: vs } = await supabase
          .from("webinar_poll_votes")
          .select("poll_id,option_index,user_id")
          .in("poll_id", list.map((p) => p.id));
        const agg: Record<string, { my?: number; counts: number[] }> = {};
        for (const p of list) agg[p.id] = { counts: Array(p.options.length).fill(0) };
        for (const v of vs || []) {
          const row = agg[v.poll_id];
          if (!row) continue;
          if (typeof v.option_index === "number" && row.counts[v.option_index] !== undefined) row.counts[v.option_index]++;
          if (v.user_id === userId) row.my = v.option_index;
        }
        if (mounted) setVotes(agg);
      }
    };
    load();
    const ch = supabase.channel(`polls-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_polls", filter: `session_id=eq.${sessionId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_poll_votes" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId, userId]);

  const vote = async (pollId: string, idx: number) => {
    // Optimistic
    setVotes((v) => ({
      ...v,
      [pollId]: {
        my: idx,
        counts: v[pollId]?.counts.map((c, i) => i === idx ? c + 1 : c) || [],
      },
    }));
    const { error } = await supabase.from("webinar_poll_votes").insert({ poll_id: pollId, user_id: userId, option_index: idx });
    if (error) toast.error("Couldn't record your vote");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {polls.length === 0 && !composing && (
          <EmptyState icon={BarChart2} title="No polls yet" body={isHost ? "Create a poll to gauge the room — results update live." : "Polls from the host will appear here."} />
        )}
        {composing && isHost && (
          <PollComposer sessionId={sessionId} onClose={() => setComposing(false)} />
        )}
        {polls.map((p) => {
          const v: { my?: number; counts: number[] } = votes[p.id] || { counts: Array(p.options.length).fill(0) as number[] };
          const total = v.counts.reduce((a, b) => a + b, 0) || 1;
          const showResults = v.my !== undefined || !p.open || isHost;
          return (
            <div key={p.id} className="rounded-lg border border-border/60 bg-background/50 p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-[13px] font-semibold leading-snug">{p.question}</h4>
                {p.open ? (
                  <Badge variant="outline" className="h-5 text-[9px] text-emerald-600 border-emerald-600/40">LIVE</Badge>
                ) : (
                  <Badge variant="secondary" className="h-5 text-[9px]">CLOSED</Badge>
                )}
              </div>
              <div className="space-y-1.5">
                {p.options.map((opt, i) => {
                  const count = v.counts[i] || 0;
                  const pct = Math.round((count / total) * 100);
                  const mine = v.my === i;
                  if (!showResults && p.open) {
                    return (
                      <button
                        key={i}
                        onClick={() => vote(p.id, i)}
                        className="w-full text-left px-3 py-2 rounded-md border border-border/60 hover:border-foreground/30 hover:bg-foreground/5 text-[13px] transition-colors"
                      >
                        {opt}
                      </button>
                    );
                  }
                  return (
                    <div key={i} className="relative px-3 py-2 rounded-md overflow-hidden border border-border/60">
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 transition-[width] duration-500",
                          mine ? "bg-primary/20" : "bg-foreground/10",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-1.5">
                          {mine && <CheckCircle2 className="h-3 w-3 text-primary" />}
                          {opt}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{pct}% · {count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {isHost && (
                <div className="flex items-center justify-end gap-1 pt-1">
                  <button
                    onClick={async () => { await supabase.from("webinar_polls").update({ open: !p.open }).eq("id", p.id); }}
                    className="text-[10px] px-2 h-6 rounded hover:bg-foreground/5"
                  >
                    {p.open ? "Close poll" : "Reopen"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this poll?")) return;
                      await supabase.from("webinar_polls").delete().eq("id", p.id);
                    }}
                    className="text-[10px] px-2 h-6 rounded hover:bg-destructive/10 text-destructive flex items-center gap-1"
                  >
                    <Trash2 className="h-2.5 w-2.5" />Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isHost && !composing && (
        <div className="p-2 border-t border-border/60">
          <Button size="sm" className="w-full h-9 text-[12px]" onClick={() => setComposing(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Create poll
          </Button>
        </div>
      )}
    </div>
  );
});

function PollComposer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, idx) => idx === i ? v : x));
  const addOpt = () => setOptions((o) => (o.length < 4 ? [...o, ""] : o));
  const removeOpt = (i: number) => setOptions((o) => (o.length > 2 ? o.filter((_, idx) => idx !== i) : o));

  const submit = async () => {
    const q = question.trim();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!q || cleaned.length < 2) { toast.error("Question + at least 2 options"); return; }
    setSaving(true);
    const { error } = await supabase.from("webinar_polls").insert({ session_id: sessionId, question: q, options: cleaned, open: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onClose();
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold">New poll</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-foreground/10"><X className="h-3 w-3" /></button>
      </div>
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a question…"
        className="h-8 text-[13px]"
        maxLength={200}
      />
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={o}
              onChange={(e) => setOpt(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="h-8 text-[13px]"
              maxLength={80}
            />
            {options.length > 2 && (
              <button onClick={() => removeOpt(i)} className="p-1.5 rounded hover:bg-foreground/10 text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {options.length < 4 && (
          <button onClick={addOpt} className="text-[11px] text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" />Add option
          </button>
        )}
      </div>
      <Button size="sm" className="w-full h-8 text-[12px]" disabled={saving} onClick={submit}>
        {saving ? "Launching…" : "Launch poll"}
      </Button>
    </div>
  );
}

/* ---------------------- Stage requests ---------------------- */

const RequestsPanel = memo(function RequestsPanel({ sessionId, userId, isHost, canPublish }: { sessionId: string; userId: string; isHost: boolean; canPublish: boolean }) {
  // Hosts see all pending requests; attendees see their own request controls.
  if (isHost) return <HostRequestsList sessionId={sessionId} />;
  if (!canPublish) return <AttendeeRaiseHand sessionId={sessionId} userId={userId} />;
  return <EmptyState icon={Hand} title="You're on stage" body="Hands raised by attendees will appear here for the host." />;
});

function HostRequestsList({ sessionId }: { sessionId: string }) {
  const [reqs, setReqs] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = () => supabase.from("webinar_stage_requests").select("*").eq("session_id", sessionId).eq("status", "pending")
      .then(({ data }) => { if (mounted) setReqs(data || []); });
    load();
    const ch = supabase.channel(`reqs-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_stage_requests", filter: `session_id=eq.${sessionId}` }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId]);

  const act = async (uid: string, action: "promote" | "demote") => {
    await supabase.functions.invoke("livekit-promote", { body: { session_id: sessionId, target_user_id: uid, action } });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-2">
      {reqs.length === 0 && (
        <EmptyState icon={Hand} title="No raised hands" body="When attendees raise their hand, you'll see them here." />
      )}
      {reqs.map((r) => (
        <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-background/50">
          <Avatar className={cn("h-8 w-8", hashColor(r.user_id))}>
            <AvatarFallback className={cn("text-[10px] font-semibold", hashColor(r.user_id))}>
              {shortName(r.user_id)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate">User {r.user_id.slice(0, 8)}</p>
            <p className="text-[10px] text-muted-foreground">waiting {timeAgo(r.created_at)}</p>
          </div>
          <Button size="sm" className="h-7 text-[11px]" onClick={() => act(r.user_id, "promote")}>
            <UserPlus className="h-3 w-3 mr-1" />Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(r.user_id, "demote")}>
            Decline
          </Button>
        </div>
      ))}
    </div>
  );
}

function AttendeeRaiseHand({ sessionId, userId }: { sessionId: string; userId: string }) {
  const [req, setReq] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    supabase.from("webinar_stage_requests").select("*").eq("session_id", sessionId).eq("user_id", userId).maybeSingle()
      .then(({ data }) => { if (mounted) setReq(data); });
    const ch = supabase.channel(`req-${sessionId}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinar_stage_requests", filter: `session_id=eq.${sessionId}` },
        (p: any) => { if (p.new?.user_id === userId) setReq(p.new); })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [sessionId, userId]);

  const raise = async () => {
    await supabase.from("webinar_stage_requests").upsert({ session_id: sessionId, user_id: userId, status: "pending" });
  };
  const cancel = async () => {
    await supabase.from("webinar_stage_requests").update({ status: "cancelled" }).eq("session_id", sessionId).eq("user_id", userId);
  };

  const pending = req && req.status === "pending";

  return (
    <div className="flex flex-col h-full items-center justify-center px-6 text-center space-y-3">
      <div className={cn("h-14 w-14 rounded-full flex items-center justify-center", pending ? "bg-amber-500/10 text-amber-600 animate-pulse" : "bg-foreground/5 text-foreground/60")}>
        <Hand className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h4 className="text-[14px] font-semibold">{pending ? "Hand raised" : "Want to come on stage?"}</h4>
        <p className="text-[12px] text-muted-foreground max-w-[220px]">
          {pending ? "The host has been notified. They'll bring you on stage shortly." : "Raise your hand and the host will see your request."}
        </p>
      </div>
      {pending ? (
        <Button variant="outline" size="sm" onClick={cancel}>Cancel request</Button>
      ) : (
        <Button size="sm" onClick={raise}><Hand className="h-3.5 w-3.5 mr-1.5" />Raise hand</Button>
      )}
    </div>
  );
}

/* ---------------------- Shared empty state ---------------------- */

function EmptyState({ icon: Icon, title, body }: { icon: typeof MessageSquare; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 space-y-2">
      <div className="h-10 w-10 rounded-full bg-foreground/5 flex items-center justify-center text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="text-[13px] font-semibold">{title}</h4>
      <p className="text-[11.5px] text-muted-foreground max-w-[220px] leading-snug">{body}</p>
    </div>
  );
}

/* ---------------------- Participants (Airmeet-style) ---------------------- */

function ParticipantsPanel({ participants }: { participants: SidebarParticipant[] }) {
  const [q, setQ] = useState("");
  const norm = q.trim().toLowerCase();
  const filtered = useMemo(
    () => participants.filter((p) => !norm || p.name.toLowerCase().includes(norm) || p.identity.toLowerCase().includes(norm)),
    [participants, norm],
  );
  // On stage = anyone who can publish; everyone else is "in attendance".
  const onStage = filtered.filter((p) => p.canPublish).sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
  const attendees = filtered.filter((p) => !p.canPublish).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border/60 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold">In this session</p>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono">{participants.length}</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="h-8 text-[12px] pl-7"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {participants.length === 0 ? (
          <EmptyState icon={Users} title="No one here yet" body="Participants will show up as soon as they join the room." />
        ) : (
          <>
            {onStage.length > 0 && (
              <ParticipantGroup label="On stage" count={onStage.length} items={onStage} />
            )}
            {attendees.length > 0 && (
              <ParticipantGroup label="In attendance" count={attendees.length} items={attendees} />
            )}
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-[12px] text-muted-foreground text-center">No matches.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantGroup({ label, count, items }: { label: string; count: number; items: SidebarParticipant[] }) {
  return (
    <div className="py-2">
      <p className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-2">
        {label}
        <span className="font-mono normal-case tracking-normal text-muted-foreground/70">· {count}</span>
      </p>
      <ul>
        {items.map((p) => (
          <li
            key={p.identity}
            className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-foreground/5 group"
          >
            <Avatar className={cn("h-8 w-8 text-[11px] font-semibold", hashColor(p.identity))}>
              <AvatarFallback className={cn("text-[11px] font-semibold", hashColor(p.identity))}>
                {shortName(p.name || p.identity)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium truncate">
                  {p.name}{p.isLocal && <span className="text-muted-foreground font-normal"> (you)</span>}
                </span>
                {p.isHost && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <Crown className="h-2.5 w-2.5" /> Host
                  </span>
                )}
                {!p.isHost && p.canPublish && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                    Speaker
                  </span>
                )}
              </div>
            </div>
            {p.canPublish && (
              <div className="flex items-center gap-1 text-muted-foreground">
                {p.micOn ? (
                  <Mic className={cn("h-3.5 w-3.5", p.isSpeaking && "text-emerald-500")} />
                ) : (
                  <MicOff className="h-3.5 w-3.5 text-destructive" />
                )}
                {p.camOn ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <VideoOff className="h-3.5 w-3.5 text-destructive/70" />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}