import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useMyCommunities, usePublicCommunities } from "@/hooks/community/useCommunity";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Sparkles } from "lucide-react";

export default function CommunityHubPage() {
  const mine = useMyCommunities();
  const explore = usePublicCommunities();
  const [tab, setTab] = useState<"mine" | "explore">("mine");

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Communities</h1>
            <p className="text-xs text-muted-foreground">Industry hubs and event communities you can join.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="mine" className="text-[13px] h-7 gap-1.5">
              <Users className="h-3.5 w-3.5" /> My communities
            </TabsTrigger>
            <TabsTrigger value="explore" className="text-[13px] h-7 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Explore
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="mt-4">
            {mine.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : !mine.data?.length ? (
              <div className="border border-dashed border-border rounded-xl p-8 text-center">
                <p className="text-sm text-muted-foreground">You're not in any community yet.</p>
                <p className="text-[12px] text-muted-foreground mt-1">Register for an event or explore the hub to join.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mine.data.map((m) => (
                  <CommunityTile key={m.community.id} community={m.community} myRole={m.role} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="explore" className="mt-4">
            {explore.isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : !explore.data?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No public communities yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {explore.data.map((c) => (
                  <CommunityTile key={c.id} community={c} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
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
      to={`/dashboard/community/${community.slug}/feed`}
      className="border border-border rounded-xl bg-card p-4 hover:border-foreground/30 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[12px] font-semibold">
          {community.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium truncate">{community.name}</p>
          <p className="text-[11px] text-muted-foreground capitalize">{community.kind}{myRole ? ` · ${myRole}` : ""}</p>
        </div>
      </div>
      {community.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{community.description}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto">
        <span><strong className="text-foreground tabular-nums">{community.member_count}</strong> members</span>
        <span><strong className="text-foreground tabular-nums">{community.post_count}</strong> posts</span>
      </div>
    </Link>
  );
}
