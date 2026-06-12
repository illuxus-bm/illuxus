import { useParams } from "react-router-dom";
import { useState } from "react";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { FeedComposer } from "@/components/community/feed/FeedComposer";
import { PostCard } from "@/components/community/feed/PostCard";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useCommunityFeed } from "@/hooks/community/useCommunityFeed";
import { Button } from "@/components/ui/button";
import { canModerate as canModerateRole, type CommunityPostType } from "@/lib/community/rbac";

const FILTERS: { key: "all" | "discussion" | "question" | "announcement" | "event_update"; label: string; type?: CommunityPostType }[] = [
  { key: "all", label: "Latest" },
  { key: "announcement", label: "Announcements", type: "announcement" },
  { key: "question", label: "Questions", type: "question" },
  { key: "event_update", label: "Updates", type: "event_update" },
];

export default function CommunityFeedPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const [filter, setFilter] = useState<typeof FILTERS[number]>(FILTERS[0]);

  const feed = useCommunityFeed(data?.community?.id, filter.type ? { type: filter.type } : {});
  const isMember = data?.membership?.status === "active";
  const role = data?.membership?.role ?? null;

  const posts = feed.data?.pages.flat() ?? [];

  return (
    <CommunityLayout>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          {/* Filters */}
          <div className="flex items-center gap-1 -mx-1 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f)}
                className={`shrink-0 px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors ${
                  filter.key === f.key
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Composer */}
          {isMember && data?.community && (
            <FeedComposer communityId={data.community.id} role={role} />
          )}

          {/* Posts */}
          {feed.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : posts.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
              {isMember && <p className="text-[12px] text-muted-foreground mt-1">Be the first to start a discussion.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => <PostCard key={p.id} post={p} canModerate={canModerateRole(role)} />)}
              {feed.hasNextPage && (
                <div className="text-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px]"
                    onClick={() => feed.fetchNextPage()}
                    disabled={feed.isFetchingNextPage}
                  >
                    {feed.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-3 hidden lg:block">
          <div className="border border-border rounded-xl bg-card p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">About</h3>
            <p className="text-[13px] text-foreground">{data?.community?.description || "—"}</p>
            {data?.community?.rules && (
              <>
                <h4 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Rules</h4>
                <p className="text-[12px] text-muted-foreground whitespace-pre-line">{data.community.rules}</p>
              </>
            )}
          </div>
        </aside>
      </div>
    </CommunityLayout>
  );
}
