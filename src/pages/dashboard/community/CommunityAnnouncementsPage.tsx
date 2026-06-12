import { useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useCommunityFeed } from "@/hooks/community/useCommunityFeed";
import { PostCard } from "@/components/community/feed/PostCard";
import { FeedComposer } from "@/components/community/feed/FeedComposer";
import { canPostAnnouncement } from "@/lib/community/rbac";

export default function CommunityAnnouncementsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const role = data?.membership?.role ?? null;
  const feed = useCommunityFeed(data?.community?.id, { type: "announcement" });
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <CommunityLayout>
      <div className="space-y-3">
        {canPostAnnouncement(role) && data?.community && (
          <FeedComposer communityId={data.community.id} role={role} />
        )}
        {feed.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : posts.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
            {canPostAnnouncement(role) && (
              <p className="text-[12px] text-muted-foreground mt-1">Use the composer above to post the first one.</p>
            )}
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} canModerate={canPostAnnouncement(role)} />)
        )}
      </div>
    </CommunityLayout>
  );
}
