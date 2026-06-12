import { Navigate, useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useModerate, useReports } from "@/hooks/community/useCommunityExtras";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ShieldAlert, Trash2 } from "lucide-react";
import { canModerate } from "@/lib/community/rbac";
import { format } from "date-fns";
import { toast } from "sonner";

export default function CommunityModerationPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const role = data?.membership?.role ?? null;
  const reports = useReports(data?.community?.id);
  const moderate = useModerate();

  if (!data?.community) return null;
  if (!canModerate(role)) return <Navigate to={`/dashboard/community/${slug}/feed`} replace />;

  const list = reports.data ?? [];

  return (
    <CommunityLayout>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          <h2 className="text-[15px] font-semibold">Moderation</h2>
        </div>

        {reports.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : list.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">No reports.</p>
          </div>
        ) : (
          <ul className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {list.map((r) => (
              <li key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      r.status === "open"      ? "bg-amber-500/10 text-amber-600"
                      : r.status === "actioned" ? "bg-emerald-500/10 text-emerald-600"
                      : r.status === "dismissed" ? "bg-muted text-muted-foreground"
                      : "bg-blue-500/10 text-blue-600"
                    }`}>{r.status}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {r.post_id ? "Post" : "Comment"} · {r.reason}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto">
                      {format(new Date(r.created_at), "MMM d · h:mm a")}
                    </span>
                  </div>
                  {r.notes && <p className="text-[12px] mt-1 text-foreground/90">{r.notes}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Target id: <span className="font-mono">{r.post_id ?? r.comment_id}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1"
                    onClick={async () => {
                      try {
                        await moderate.mutateAsync({
                          postId: r.post_id ?? undefined,
                          commentId: r.comment_id ?? undefined,
                          action: "hide",
                          reason: r.reason,
                        });
                        toast.success("Hidden");
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    <EyeOff className="h-3 w-3" /> Hide
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1"
                    onClick={async () => {
                      try {
                        await moderate.mutateAsync({
                          postId: r.post_id ?? undefined,
                          commentId: r.comment_id ?? undefined,
                          action: "unhide",
                        });
                        toast.success("Restored");
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    <Eye className="h-3 w-3" /> Show
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      if (!confirm("Delete this content permanently?")) return;
                      try {
                        await moderate.mutateAsync({
                          postId: r.post_id ?? undefined,
                          commentId: r.comment_id ?? undefined,
                          action: "delete",
                        });
                        toast.success("Deleted");
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "Failed");
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CommunityLayout>
  );
}
