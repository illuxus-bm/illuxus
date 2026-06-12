import { useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useLeaderboard } from "@/hooks/community/useCommunityExtras";
import { Crown } from "lucide-react";

export default function CommunityLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const lb = useLeaderboard(data?.community?.id);

  return (
    <CommunityLayout>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" />
          <h2 className="text-[15px] font-semibold">Top contributors</h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Earn points: post = 5, comment = 2, resource upload = 20.
        </p>

        {lb.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !lb.data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No activity yet.</p>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                  <th className="py-2 px-3 w-12">#</th>
                  <th className="py-2 px-3">Member</th>
                  <th className="py-2 px-3 text-right">Posts</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell">Comments</th>
                  <th className="py-2 px-3 text-right hidden md:table-cell">Resources</th>
                  <th className="py-2 px-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {lb.data.map((row, i) => {
                  const name = row.profile?.display_name || "Anonymous";
                  const initials = name.slice(0, 2).toUpperCase();
                  const top3 = i < 3;
                  return (
                    <tr key={row.user_id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 px-3">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                          top3 ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"
                        }`}>{i + 1}</span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold overflow-hidden">
                            {row.profile?.avatar_url ? (
                              <img src={row.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              initials
                            )}
                          </div>
                          <span className="text-[13px] font-medium truncate">{name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{row.posts}</td>
                      <td className="py-2 px-3 text-right tabular-nums hidden sm:table-cell">{row.comments}</td>
                      <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{row.resources}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="font-semibold tabular-nums">{row.points}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CommunityLayout>
  );
}
