import { useState } from "react";
import { ThumbsUp, MessageCircle, Pin, MoreHorizontal, Flag, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentList } from "../comments/CommentList";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { PostWithAuthor } from "@/lib/community/types";
import { COMMUNITY_POST_TYPE_LABEL } from "@/lib/community/rbac";
import { formatDistanceToNow } from "date-fns";
import { useToggleReaction } from "@/hooks/community/useCommunityFeed";
import { useModerate, useReport } from "@/hooks/community/useCommunityExtras";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const TYPE_BADGE: Record<string, string> = {
  discussion:   "bg-muted text-muted-foreground",
  question:     "bg-blue-500/10 text-blue-600",
  announcement: "bg-amber-500/10 text-amber-600",
  resource:     "bg-emerald-500/10 text-emerald-600",
  poll:         "bg-violet-500/10 text-violet-600",
  event_update: "bg-primary/10 text-primary",
};

export function PostCard({ post, canModerate = false }: { post: PostWithAuthor; canModerate?: boolean }) {
  const [showComments, setShowComments] = useState(false);
  const react = useToggleReaction();
  const report = useReport();
  const moderate = useModerate();
  const { user } = useAuth();
  const isAuthor = user?.id === post.author_id;

  const author = post.author?.display_name || "Anonymous";
  const initials = (author || "?").slice(0, 2).toUpperCase();
  const when = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  return (
    <article className="bg-card border border-border rounded-xl p-4 space-y-3">
      <header className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-semibold shrink-0 overflow-hidden">
          {post.author?.avatar_url ? (
            <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium truncate">{author}</span>
            <span className="text-[11px] text-muted-foreground">· {when}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${TYPE_BADGE[post.type] || ""}`}>
              {COMMUNITY_POST_TYPE_LABEL[post.type]}
            </span>
            {post.pinned && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                <Pin className="h-2.5 w-2.5" /> Pinned
              </span>
            )}
          </div>
          {post.title && <h3 className="text-[15px] font-semibold mt-0.5 leading-tight">{post.title}</h3>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 -mr-1" aria-label="More">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {!isAuthor && (
              <DropdownMenuItem
                onClick={async () => {
                  const reason = prompt("Why are you reporting this post?", "inappropriate");
                  if (!reason) return;
                  try {
                    await report.mutateAsync({ postId: post.id, reason });
                    toast.success("Report submitted");
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
              >
                <Flag className="h-3.5 w-3.5 mr-2" /> Report
              </DropdownMenuItem>
            )}
            {canModerate && (
              <>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await moderate.mutateAsync({ postId: post.id, action: post.hidden ? "unhide" : "hide" });
                      toast.success(post.hidden ? "Restored" : "Hidden");
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                >
                  <EyeOff className="h-3.5 w-3.5 mr-2" /> {post.hidden ? "Unhide" : "Hide"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await moderate.mutateAsync({ postId: post.id, action: post.pinned ? "unpin" : "pin" });
                      toast.success(post.pinned ? "Unpinned" : "Pinned");
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                >
                  <Pin className="h-3.5 w-3.5 mr-2" /> {post.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => {
                    if (!confirm("Delete this post permanently?")) return;
                    try {
                      await moderate.mutateAsync({ postId: post.id, action: "delete" });
                      toast.success("Deleted");
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {post.body_md && (
        <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{post.body_md}</div>
      )}

      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noreferrer noopener"
           className="block text-[12px] text-primary truncate underline-offset-2 hover:underline">
          {post.link_url}
        </a>
      )}

      <footer className="flex items-center gap-1 -mx-1 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px] gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => react.mutate({ postId: post.id })}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          <span className="tabular-nums">{post.reaction_count}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[12px] gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => setShowComments((v) => !v)}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="tabular-nums">{post.comment_count}</span>
          <span className="hidden sm:inline">Comments</span>
        </Button>
      </footer>

      {showComments && <CommentList postId={post.id} />}
    </article>
  );
}
