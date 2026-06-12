import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddComment, usePostComments } from "@/hooks/community/useCommunityFeed";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export function CommentList({ postId }: { postId: string }) {
  const { data: comments, isLoading } = usePostComments(postId);
  const add = useAddComment(postId);
  const [body, setBody] = useState("");

  const handleAdd = async () => {
    if (!body.trim()) return;
    try {
      await add.mutateAsync(body.trim());
      setBody("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not comment");
    }
  };

  return (
    <div className="border-t border-border pt-3 mt-2 space-y-3">
      {/* Compose */}
      <div className="flex items-start gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          className="min-h-[44px] text-[13px] flex-1"
        />
        <Button
          size="icon"
          onClick={handleAdd}
          disabled={!body.trim() || add.isPending}
          className="h-9 w-9 shrink-0"
          aria-label="Post comment"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-[12px] text-muted-foreground text-center py-2">Loading…</p>
      ) : !comments || comments.length === 0 ? (
        <p className="text-[12px] text-muted-foreground text-center py-2">Be the first to comment.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c) => {
            const author = c.author?.display_name || "Anonymous";
            const initials = author.slice(0, 2).toUpperCase();
            return (
              <li key={c.id} className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted text-foreground flex items-center justify-center text-[10px] font-semibold shrink-0 overflow-hidden">
                  {c.author?.avatar_url ? (
                    <img src={c.author.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0 flex-1 bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[12px] font-medium leading-tight">
                    {author}
                    <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </p>
                  <p className="text-[13px] mt-0.5 whitespace-pre-wrap break-words">{c.body_md}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
