import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useChannelMessages, useCommunityChannels, useSendMessage } from "@/hooks/community/useCommunityChat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Hash, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function CommunityChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const channels = useCommunityChannels(data?.community?.id);
  const isMember = data?.membership?.status === "active";
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // Pick the first channel by default once they load.
  useEffect(() => {
    if (!activeChannelId && channels.data && channels.data.length > 0) {
      setActiveChannelId(channels.data[0].id);
    }
  }, [activeChannelId, channels.data]);

  const messages = useChannelMessages(activeChannelId ?? undefined);
  const send = useSendMessage(activeChannelId ?? undefined);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll on new messages.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.data?.length]);

  const handleSend = async () => {
    if (!body.trim()) return;
    if (!activeChannelId) return;
    try {
      await send.mutateAsync(body);
      setBody("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    }
  };

  return (
    <CommunityLayout>
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 h-[calc(100vh-280px)] min-h-[420px]">
        {/* Channel list */}
        <aside className="border border-border rounded-xl bg-card p-2 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-2 pb-1.5">Channels</p>
          {channels.isLoading ? (
            <p className="text-[12px] text-muted-foreground p-2">Loading…</p>
          ) : (
            <ul className="space-y-0.5">
              {(channels.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveChannelId(c.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-[13px] flex items-center gap-1.5 transition-colors ${
                      activeChannelId === c.id
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Hash className="h-3.5 w-3.5" />
                    <span className="truncate">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Messages */}
        <section className="border border-border rounded-xl bg-card flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.isLoading ? (
              <p className="text-[12px] text-muted-foreground text-center py-6">Loading messages…</p>
            ) : !messages.data?.length ? (
              <p className="text-[12px] text-muted-foreground text-center py-6">Start the conversation.</p>
            ) : (
              messages.data.map((m) => {
                const author = m.author?.display_name || "Anonymous";
                const initials = author.slice(0, 2).toUpperCase();
                return (
                  <div key={m.id} className="flex gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted text-foreground flex items-center justify-center text-[10px] font-semibold shrink-0 overflow-hidden">
                      {m.author?.avatar_url ? (
                        <img src={m.author.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-tight">
                        <strong className="text-foreground">{author}</strong>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          {format(new Date(m.created_at), "h:mm a · MMM d")}
                        </span>
                      </p>
                      <p className="text-[13px] mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-2 flex items-end gap-2">
            <Textarea
              disabled={!isMember || !activeChannelId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isMember ? "Type a message…" : "Join the community to chat"}
              className="min-h-[40px] text-[13px]"
            />
            <Button
              size="icon"
              disabled={!body.trim() || send.isPending || !isMember || !activeChannelId}
              onClick={handleSend}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </CommunityLayout>
  );
}
