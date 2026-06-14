import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyCommunities } from "@/hooks/community/useCommunity";
import SiteHeader from "@/components/SiteHeader";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Sparkles, Calendar, Megaphone } from "lucide-react";
import type { Community, CommunityMember } from "@/lib/community/types";

/**
 * Personal "My communities" page. Mirrors the look & feel of MyEventsPage and
 * MyApplicationsPage so the profile dropdown has a consistent set of "/u/me/*"
 * surfaces. Source of truth is `useMyCommunities()` which returns the
 * community_members rows joined with the community record (active members
 * only).
 */
export default function MyCommunitiesPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useMyCommunities();

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login?redirect=/u/me/communities" replace />;

  const memberships = data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">My communities</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Industry hubs and event communities you've joined.
            </p>
          </div>
          <Link
            to="/u/me/events"
            className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to my tickets
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : memberships.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {memberships.map((m) => (
              <CommunityCard
                key={m.community.id}
                community={m.community}
                role={m.role}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CommunityCard({
  community,
  role,
}: {
  community: Community;
  role: CommunityMember["role"];
}) {
  const isStaff = role === "owner" || role === "admin" || role === "moderator";
  return (
    <Link
      to={`/community/${community.slug}/feed`}
      className="border border-border rounded-xl bg-card p-4 hover:border-foreground/30 transition-colors flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        {community.logo_url ? (
          <img
            src={community.logo_url}
            alt=""
            className="h-10 w-10 rounded-lg object-cover bg-muted shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[14px] font-semibold shrink-0">
            {community.name[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate">{community.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">
            {community.kind}
            {role && ` · ${role}`}
          </p>
        </div>
        {isStaff && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
            Staff
          </span>
        )}
      </div>

      {community.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">
          {community.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto pt-1">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          <strong className="text-foreground tabular-nums">
            {community.member_count}
          </strong>{" "}
          members
        </span>
        <span className="inline-flex items-center gap-1">
          <Megaphone className="h-3 w-3" />
          <strong className="text-foreground tabular-nums">
            {community.post_count}
          </strong>{" "}
          posts
        </span>
        {community.event_id && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Event
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <div className="h-12 w-12 mx-auto rounded-xl bg-secondary flex items-center justify-center mb-3">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold">You're not in any community yet</h3>
      <p className="text-[13px] text-muted-foreground mt-1 mb-4">
        Register for an event or browse the hub to join one.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button asChild size="sm" className="h-8 text-[13px]">
          <Link to="/community">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Explore communities
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8 text-[13px]">
          <Link to="/events">Browse events</Link>
        </Button>
      </div>
    </div>
  );
}
