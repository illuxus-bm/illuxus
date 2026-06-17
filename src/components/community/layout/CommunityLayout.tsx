import { ReactNode } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { CommunityShell } from "./CommunityShell";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { Button } from "@/components/ui/button";
import { useJoinCommunity, useLeaveCommunity } from "@/hooks/community/useCommunityFeed";
import { Users, Newspaper, BookOpen, MessageSquare, Calendar, Settings, ShieldAlert, Megaphone, Send } from "lucide-react";
import { canManageSettings, canModerate } from "@/lib/community/rbac";
import { toast } from "sonner";

const tabs = [
  { to: "feed",          label: "Feed",          icon: Newspaper      },
  { to: "announcements", label: "Announcements", icon: Megaphone      },
  { to: "calendar",      label: "Calendar",      icon: Calendar       },
  { to: "members",       label: "Members",       icon: Users          },
  { to: "resources",     label: "Resources",     icon: BookOpen       },
  { to: "chat",          label: "Chat",          icon: MessageSquare  },
] as const;

export function CommunityLayout({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { data, isLoading } = useCommunityBySlug(slug);
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();

  if (isLoading) {
    return (
      <CommunityShell>
        <div className="text-sm text-muted-foreground py-12 text-center">Loading community…</div>
      </CommunityShell>
    );
  }

  if (!data?.community) {
    return (
      <CommunityShell>
        <div className="text-sm text-muted-foreground py-12 text-center">Community not found.</div>
      </CommunityShell>
    );
  }

  const { community, membership, isAttendee } = data;
  const isMember = membership?.status === "active";
  const role = membership?.role ?? null;

  const handleJoin = async () => {
    try {
      await join.mutateAsync(community.id);
      toast.success(`Joined ${community.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    }
  };
  const handleLeave = async () => {
    try {
      await leave.mutateAsync(community.id);
      toast.success(`Left ${community.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not leave");
    }
  };

  return (
    <CommunityShell>
      <div className="space-y-4">
        {/* Banner + header */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div
            className="h-32 sm:h-40 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10"
            style={community.banner_url ? { backgroundImage: `url(${community.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end gap-3 -mt-8">
            <div className="h-16 w-16 rounded-2xl border-4 border-card bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {community.logo_url ? (
                <img src={community.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-bold">{community.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight truncate">{community.name}</h1>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                  {community.kind}
                </span>
                {role && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">
                    {role}
                  </span>
                )}
              </div>
              {community.description && (
                <p className="text-[13px] text-muted-foreground line-clamp-2 mt-0.5">{community.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                <span><strong className="text-foreground tabular-nums">{community.member_count}</strong> members</span>
                <span>·</span>
                <span><strong className="text-foreground tabular-nums">{community.post_count}</strong> posts</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isMember && community.kind === 'event' && !isAttendee && (
                <Button size="sm" disabled className="h-8 text-[12px]">
                  Registration required
                </Button>
              )}
              {!isMember && community.kind === 'event' && isAttendee && (
                <Button size="sm" onClick={handleJoin} disabled={join.isPending} className="h-8 text-[12px]">
                  {join.isPending ? "Joining…" : "Join as Attendee"}
                </Button>
              )}
              {!isMember && community.kind !== 'event' && (
                <Button size="sm" onClick={handleJoin} disabled={join.isPending} className="h-8 text-[12px]">
                  {join.isPending ? "Joining…" : "Join community"}
                </Button>
              )}
              {isMember && role !== "manager" && (
                <Button size="sm" variant="outline" onClick={handleLeave} disabled={leave.isPending} className="h-8 text-[12px]">
                  {leave.isPending ? "Leaving…" : "Leave"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-1 px-1">
          {tabs.map((t) => {
              const Icon = t.icon;
              const to = `/community/${community.slug}/${t.to}`;
              const active = location.pathname.startsWith(to);
              return (
                <NavLink
                  key={t.to}
                  to={to}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? "text-foreground border-foreground"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </NavLink>
              );
            })}
          {canModerate(role) && (
            <NavLink
              to={`/community/${community.slug}/communications`}
              className={({ isActive }) =>
                `shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "text-foreground border-foreground"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`
              }
            >
              <Send className="h-3.5 w-3.5" />
              Communicate
            </NavLink>
          )}
          {canModerate(role) && (
            <NavLink
              to={`/community/${community.slug}/moderation`}
              className={({ isActive }) =>
                `shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "text-foreground border-foreground"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`
              }
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Moderation
            </NavLink>
          )}
          {canManageSettings(role) && (
            <NavLink
              to={`/community/${community.slug}/settings`}
              className={({ isActive }) =>
                `shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "text-foreground border-foreground"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`
              }
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </NavLink>
          )}
        </div>

        <div>{children}</div>
      </div>
    </CommunityShell>
  );
}
