import { Link } from "react-router-dom";
import { CommunityShell } from "@/components/community/layout/CommunityShell";
import { useMyCommunities, usePublicCommunities } from "@/hooks/community/useCommunity";
import { Users } from "lucide-react";

export default function CommunityHubPage() {
  const mine = useMyCommunities();
  const explore = usePublicCommunities(); // Fetches public event communities

  // Filter out communities from explore that are already in mine
  const publicComms = explore.data?.filter(
    (c) => !mine.data?.some((m) => m.community.id === c.id)
  );

  return (
    <CommunityShell>
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Discover Communities</h1>
              <p className="text-xs text-muted-foreground">Explore and join event discussions.</p>
            </div>
          </div>

          <div className="space-y-10">
            {/* My Communities */}
            <div className="animate-in fade-in duration-300">
              <h2 className="text-[15px] font-semibold mb-1">My Communities</h2>
              <p className="text-[12px] text-muted-foreground mb-4">Event communities you are participating in.</p>
              
              {mine.isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : !mine.data?.length ? (
                <div className="border border-dashed border-border rounded-xl p-10 text-center bg-muted/10">
                  <p className="text-[13px] text-muted-foreground">You're not in any community yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {mine.data.map((m) => (
                    <CommunityTile key={m.community.id} community={m.community} myRole={m.role} />
                  ))}
                </div>
              )}
            </div>

            {/* Public Communities */}
            {explore.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading public communities…</p>
            ) : publicComms && publicComms.length > 0 && (
              <div className="pt-8 border-t border-border animate-in fade-in duration-300">
                <h2 className="text-[15px] font-semibold mb-1">Explore More Communities</h2>
                <p className="text-[12px] text-muted-foreground mb-4">Public event communities you can join.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {publicComms.map((c) => (
                    <CommunityTile key={c.id} community={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CommunityShell>
  );
}

function CommunityTile({
  community,
  myRole,
}: {
  community: { id: string; slug: string; name: string; description: string | null; member_count: number; post_count: number; kind: string };
  myRole?: string;
}) {
  return (
    <Link
      to={`/community/${community.slug}/feed`}
      className="border border-border rounded-xl bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col gap-2 group"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[14px] font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {community.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium truncate group-hover:text-primary transition-colors">{community.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{community.kind}{myRole ? ` · ${myRole}` : ""}</p>
        </div>
      </div>
      {community.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{community.description}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto pt-3 border-t border-border/50">
        <span className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {community.member_count} member{community.member_count !== 1 ? "s" : ""}
        </span>
      </div>
    </Link>
  );
}
