import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useSetMemberRole, useSetMemberStatus } from "@/hooks/community/useCommunityExtras";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, Shield, ShieldOff, UserCog, UserX } from "lucide-react";
import { canManageSettings, canModerate, type CommunityRole } from "@/lib/community/rbac";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ROLE_BADGE: Record<string, string> = {
  member:    "bg-muted text-muted-foreground",
  speaker:   "bg-blue-500/10 text-blue-600",
  sponsor:   "bg-amber-500/10 text-amber-700",
  organizer: "bg-violet-500/10 text-violet-600",
  moderator: "bg-emerald-500/10 text-emerald-600",
  manager:   "bg-rose-500/10 text-rose-600",
  mentor:    "bg-cyan-500/10 text-cyan-600",
};

interface MemberRow {
  user_id: string;
  role: CommunityRole;
  status: "active" | "suspended" | "banned" | "left";
  joined_at: string;
  profile: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    company: string | null;
    designation: string | null;
  } | null;
}

export default function CommunityMembersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<CommunityRole | "all">("all");

  const viewerRole = data?.membership?.role ?? null;
  const isModerator = canModerate(viewerRole);
  const isManager = canManageSettings(viewerRole);

  const setStatus = useSetMemberStatus(data?.community?.id);
  const setRole = useSetMemberRole(data?.community?.id);

  const members = useQuery({
    queryKey: ["community", "members", data?.community?.id],
    enabled: !!data?.community?.id,
    queryFn: async () => {
      // Moderators see suspended/banned too so they can reactivate; others
      // only see active members.
      let q = supabase
        .from("community_members" as never)
        .select("user_id, role, status, joined_at")
        .eq("community_id", data!.community!.id);
      if (!isModerator) q = q.eq("status", "active");
      const { data: rows, error } = await q;
      if (error) throw error;
      const list = (rows ?? []) as unknown as { user_id: string; role: CommunityRole; status: MemberRow["status"]; joined_at: string }[];
      if (list.length === 0) return [] as MemberRow[];
      const ids = list.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, company, designation")
        .in("user_id", ids);
      const byUser = new Map<string, MemberRow["profile"]>();
      (profs ?? []).forEach((p) => byUser.set(p.user_id, p as never));
      return list.map((r) => ({ ...r, profile: byUser.get(r.user_id) ?? null })) as MemberRow[];
    },
  });

  const filtered = useMemo(() => {
    const all = members.data ?? [];
    return all.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!search) return true;
      const hay = `${m.profile?.display_name ?? ""} ${m.profile?.company ?? ""} ${m.profile?.designation ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [members.data, roleFilter, search]);

  return (
    <CommunityLayout>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, role…"
              className="pl-8 h-8 text-[13px]"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as CommunityRole | "all")}
            className="h-8 text-[12px] rounded-md border border-input bg-background px-2"
          >
            <option value="all">All roles</option>
            <option value="member">Members</option>
            <option value="speaker">Speakers</option>
            <option value="sponsor">Sponsors</option>
            <option value="organizer">Organizers</option>
            <option value="moderator">Moderators</option>
            <option value="manager">Managers</option>
            <option value="mentor">Mentors</option>
          </select>
        </div>

        {members.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No members match.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m) => {
              const name = m.profile?.display_name || "Anonymous";
              const initials = name.slice(0, 2).toUpperCase();
              const isSelf = user?.id === m.user_id;
              const targetIsManager = m.role === "manager";
              const showMenu = isModerator && !isSelf && !targetIsManager;

              const handleRemove = async () => {
                if (!confirm(`Remove ${name} from the community? They will be banned and can't rejoin unless re-activated.`)) return;
                try {
                  await setStatus.mutateAsync({ userId: m.user_id, status: "banned" });
                  toast.success(`${name} removed`);
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              };
              const handleSuspend = async () => {
                try {
                  await setStatus.mutateAsync({ userId: m.user_id, status: "suspended" });
                  toast.success(`${name} suspended`);
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              };
              const handleReactivate = async () => {
                try {
                  await setStatus.mutateAsync({ userId: m.user_id, status: "active" });
                  toast.success(`${name} restored`);
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              };
              const handleSetRole = async (next: CommunityRole) => {
                try {
                  await setRole.mutateAsync({ userId: m.user_id, role: next });
                  toast.success(`${name} is now ${next}`);
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              };

              return (
                <div key={m.user_id} className="border border-border rounded-xl bg-card p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-semibold shrink-0 overflow-hidden">
                    {m.profile?.avatar_url ? <img src={m.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-medium truncate">{name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${ROLE_BADGE[m.role] || ""}`}>
                        {m.role}
                      </span>
                      {m.status !== "active" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-destructive/10 text-destructive">
                          {m.status}
                        </span>
                      )}
                    </div>
                    {(m.profile?.designation || m.profile?.company) && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[m.profile?.designation, m.profile?.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {showMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Member actions">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {isManager && (
                          <>
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Change role</DropdownMenuLabel>
                            {(["member","speaker","sponsor","organizer","moderator","mentor"] as CommunityRole[]).map((r) => (
                              <DropdownMenuItem key={r} disabled={r === m.role} onClick={() => handleSetRole(r)}>
                                <UserCog className="h-3.5 w-3.5 mr-2" />
                                <span className="capitalize">{r}</span>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</DropdownMenuLabel>
                        {m.status === "active" && (
                          <DropdownMenuItem onClick={handleSuspend}>
                            <Shield className="h-3.5 w-3.5 mr-2" /> Suspend
                          </DropdownMenuItem>
                        )}
                        {m.status !== "active" && (
                          <DropdownMenuItem onClick={handleReactivate}>
                            <ShieldOff className="h-3.5 w-3.5 mr-2" /> Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleRemove}>
                          <UserX className="h-3.5 w-3.5 mr-2" /> Remove from community
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CommunityLayout>
  );
}
