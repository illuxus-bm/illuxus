import { Navigate, useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { CommunicationsSection } from "@/components/communications/CommunicationsSection";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { canModerate } from "@/lib/community/rbac";

/**
 * Communications surface for a community.
 *
 * Hosts the full unified communications UI (compose wizard + drafts /
 * scheduled / sent / failed groups) but scoped to community members rather
 * than event attendees. Gated to moderators / managers / admins via the
 * RLS rules in `013_communications_community.sql`; the UI mirrors that
 * with a guard so non-managers don't see the page.
 */
export default function CommunityCommunicationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useCommunityBySlug(slug);

  if (isLoading) {
    return (
      <CommunityLayout>
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      </CommunityLayout>
    );
  }
  if (!data?.community) return <Navigate to="/community" replace />;

  const role = data.membership?.role ?? null;
  if (!canModerate(role)) {
    return (
      <CommunityLayout>
        <div className="text-sm text-muted-foreground py-12 text-center">
          You need moderator or manager access to send community communications.
        </div>
      </CommunityLayout>
    );
  }

  return (
    <CommunityLayout>
      <CommunicationsSection communityId={data.community.id} />
    </CommunityLayout>
  );
}
