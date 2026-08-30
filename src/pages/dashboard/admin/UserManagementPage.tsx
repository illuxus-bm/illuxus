/**
 * UserManagementPage — comprehensive super-admin user management surface.
 *
 * KPI strip + search + filter chips + sortable user table with per-row
 * actions (promote / demote / ban / unban / force password reset / delete).
 * Clicking a row opens a drawer with full user detail and the per-user
 * activity feed sourced from `admin_user_activity_feed`.
 *
 * The page is mounted at `/dashboard/admin/users` behind `SuperAdminRoute`.
 */
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Search, UserCheck, Shield, ShieldOff, ShieldCheck, Ban, KeyRound,
  Trash2, ArrowLeft, MoreHorizontal, Mail, Calendar, Building2, RefreshCw,
  Eye, Crown, Download,
} from "lucide-react";
import { format, parseISO, subDays } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc, logger } from "@/lib/observability";
import { buildCsvDocument, CsvEscapeError } from "@/lib/utm/csv-escape";
import { downloadCsv } from "@/lib/utm/applications-csv";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface AdminUserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  org_name: string | null;
  org_plan: string | null;
  is_platform_admin: boolean;
}

interface ProfileDetail {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  account_type: string;
  company: string | null;
  designation: string | null;
  mobile_country_code: string | null;
  mobile_number: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  created_at: string;
  // First-touch UTM attribution (utm-attribution-coverage spec, Task 11).
  // Populated by the `handle_new_user` trigger from auth signup metadata.
  // Absent_UTM values persist as SQL NULL — never empty strings.
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

interface ActivityEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

type FilterChip = "all" | "organizers" | "attendees" | "admins" | "banned";

/* ─── UTM display helpers (utm-attribution-coverage, Task 11.2) ─────────── */

/** Max rendered characters for the inline `via <utm_source>` hint. */
const UTM_SOURCE_HINT_MAX_RENDERED_CHARS = 64;

/**
 * Truncates a `utm_source` value for the inline row hint.
 *
 * Per Requirement 9.1, the displayed value is capped at
 * {@link UTM_SOURCE_HINT_MAX_RENDERED_CHARS} rendered characters *including*
 * the trailing ellipsis when the stored value exceeds that length. Values
 * shorter than or equal to the cap render byte-for-byte identical to the
 * stored value.
 */
function truncateUtmSourceForHint(raw: string): string {
  if (raw.length <= UTM_SOURCE_HINT_MAX_RENDERED_CHARS) return raw;
  return raw.slice(0, UTM_SOURCE_HINT_MAX_RENDERED_CHARS - 1) + "…";
}

/**
 * Returns the trimmed display value for a `utm_source` field when it should
 * appear as an inline hint, or `null` when the field is an Absent_UTM value
 * (NULL / empty / whitespace-only). See Requirement 14.1 for the
 * Absent_UTM contract and Requirement 14.2 for the "no placeholder"
 * guarantee — callers that receive `null` MUST NOT render any substitute
 * character or the `via` keyword itself.
 */
function utmSourceHintDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return truncateUtmSourceForHint(trimmed);
}

/**
 * Returns `true` when at least one UTM_Field on the profile carries a
 * non-whitespace value — used to gate the Attribution section in the user
 * detail drawer per Requirement 9.4 / 14.3.
 */
function hasAnyUtm(profile: ProfileDetail): boolean {
  return [
    profile.utm_source,
    profile.utm_medium,
    profile.utm_campaign,
    profile.utm_content,
    profile.utm_term,
  ].some((v) => typeof v === "string" && v.trim().length > 0);
}

/* ─── Skeleton ──────────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

/* ─── UTM field cell (detail drawer, Task 11.3) ─────────────────────────── */

/**
 * Renders one UTM_Field cell in the user detail Attribution section.
 *
 * Present values are shown verbatim (truncated by the parent's `truncate`
 * class). Absent_UTM values render as an em-dash so the empty state is
 * visually distinct from a present value (Requirement 9.3). This mirrors
 * the shipped `Field` component in `RegistrantQuickView.tsx`.
 *
 * Note: the em-dash guarantee is scoped to the detail surface only.
 * Requirement 14.2 bans em-dashes in the row-level list hint — that path
 * uses {@link utmSourceHintDisplay} which returns `null` for Absent_UTM
 * and lets the caller omit the hint entirely.
 */
function UtmField({ label, value }: { label: string; value: string | null }) {
  const display = value && value.trim().length > 0 ? value : null;
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}</span>
      <p className="truncate" title={display ?? undefined}>
        {display ?? <span className="text-muted-foreground/60">—</span>}
      </p>
    </div>
  );
}

/* ─── KPI card ──────────────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon, label, value, loading,
}: {
  icon: React.ElementType; label: string; value: number | string; loading?: boolean;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-card space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
    </div>
  );
}

/* ─── Hooks ─────────────────────────────────────────────────────────────── */

function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<AdminUserRow[]>("admin_list_users");
      if (error) throw error;
      return (data ?? []) as AdminUserRow[];
    },
    staleTime: 30_000,
  });
}

/** profiles join — banned status, names, contact. */
function useProfilesIndex() {
  return useQuery({
    queryKey: ["admin-users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          // Base identity + contact columns.
          "user_id, display_name, first_name, last_name, account_type, company, designation, mobile_country_code, mobile_number, created_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term"
          // banned_at / banned_reason still not in generated types — keep the
          // `as never` cast until types.ts catches up. UTM columns landed in
          // types.ts via Task 1.3, so they don't need the escape hatch.
          + ", banned_at, banned_reason" as never,
        )
        .returns<ProfileDetail[]>();
      if (error) {
        logger.warn("admin-users: profiles fetch failed", { error_message: error.message });
        return [];
      }
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

/* ─── Drawer body — full user detail ─────────────────────────────────────── */

function UserDetailDrawer({
  userId, onClose,
}: { userId: string | null; onClose: () => void }) {
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["admin-user-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProfileDetail | null;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["admin-user-events", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, status, date, tickets_sold")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const regsQ = useQuery({
    queryKey: ["admin-user-regs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, event_id, status, amount_paid, created_at, name, email")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activityQ = useQuery({
    queryKey: ["admin-user-activity", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseRpc<ActivityEntry[]>("admin_user_activity_feed", {
        _user_id: userId, _limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    },
  });

  const banMut = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabaseRpc("admin_ban_user", { _user_id: userId, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User banned");
      qc.invalidateQueries({ queryKey: ["admin-user-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to ban"),
  });

  const unbanMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabaseRpc("admin_unban_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User unbanned");
      qc.invalidateQueries({ queryKey: ["admin-user-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to unban"),
  });

  const resetMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabaseRpc<string>("admin_force_password_reset", { _user_id: userId });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (token) => {
      toast.success("Recovery token generated", {
        description: typeof token === "string" ? token.slice(0, 16) + "…" : "Copy from server logs",
      });
      if (typeof token === "string") {
        navigator.clipboard?.writeText(token).catch(() => {});
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to generate token"),
  });

  const profile = profileQ.data;
  const isBanned = !!profile?.banned_at;
  const [banReason, setBanReason] = useState("");

  return (
    <Sheet open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle className="text-base font-semibold leading-tight">User detail</SheetTitle>
        </SheetHeader>

        {profileQ.isLoading ? (
          <div className="space-y-3 mt-5">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground mt-6">User not found.</p>
        ) : (
          <div className="mt-5 space-y-5 pb-8">
            {/* Identity */}
            <div className="border border-border rounded-xl p-4 bg-card space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold">
                  {(profile.display_name || profile.first_name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">{profile.user_id}</p>
                </div>
                {isBanned && (
                  <Badge variant="secondary" className="ml-auto bg-destructive/10 text-destructive text-[10px] uppercase">
                    Banned
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] pt-2 border-t border-border">
                <div><span className="text-muted-foreground">Account type</span><p>{profile.account_type}</p></div>
                <div><span className="text-muted-foreground">Joined</span><p>{format(parseISO(profile.created_at), "MMM d, yyyy")}</p></div>
                <div><span className="text-muted-foreground">Company</span><p>{profile.company || "—"}</p></div>
                <div><span className="text-muted-foreground">Designation</span><p>{profile.designation || "—"}</p></div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Phone</span>
                  <p>{[profile.mobile_country_code, profile.mobile_number].filter(Boolean).join(" ") || "—"}</p>
                </div>
              </div>
              {isBanned && profile.banned_reason && (
                <p className="text-[11px] text-destructive border-t border-border pt-2">
                  <strong>Ban reason:</strong> {profile.banned_reason}
                </p>
              )}
            </div>

            {/* Attribution — first-touch UTM (utm-attribution-coverage,
                Task 11.3). Rendered only when at least one UTM_Field on the
                profile is non-empty (Requirement 9.4 / 14.3). When present,
                all five fields are labelled and Absent_UTM cells show the
                shipped em-dash empty-state indicator (matches the pattern in
                `RegistrantQuickView.tsx`). */}
            {hasAnyUtm(profile) && (
              <div className="border border-border rounded-xl p-4 bg-card space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Attribution</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  <UtmField label="utm_source"   value={profile.utm_source} />
                  <UtmField label="utm_medium"   value={profile.utm_medium} />
                  <UtmField label="utm_campaign" value={profile.utm_campaign} />
                  <UtmField label="utm_content"  value={profile.utm_content} />
                  <UtmField label="utm_term"     value={profile.utm_term} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border border-border rounded-xl p-4 bg-card space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Actions</p>
              {isBanned ? (
                <Button size="sm" variant="outline" disabled={unbanMut.isPending} onClick={() => unbanMut.mutate()}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Unban user
                </Button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reason for ban (visible in audit log)…"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!banReason.trim() || banMut.isPending}
                    onClick={() => banMut.mutate(banReason.trim())}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" /> Ban user
                  </Button>
                </div>
              )}
              <Button size="sm" variant="outline" disabled={resetMut.isPending} onClick={() => resetMut.mutate()}>
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                {resetMut.isPending ? "Generating…" : "Force password reset"}
              </Button>
            </div>

            {/* Owned events */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Events owned ({eventsQ.data?.length ?? 0})</p>
              </div>
              <div className="p-2 max-h-48 overflow-y-auto">
                {eventsQ.isLoading ? <Skeleton className="h-16 w-full" /> :
                  (eventsQ.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-3">No events</p>
                  ) : (
                    (eventsQ.data ?? []).map((ev: any) => (
                      <div key={ev.id} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-muted/30 rounded text-[12px]">
                        <span className="truncate">{ev.title}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{ev.status}</Badge>
                      </div>
                    ))
                  )}
              </div>
            </div>

            {/* Registrations */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tickets purchased ({regsQ.data?.length ?? 0})</p>
              </div>
              <div className="p-2 max-h-48 overflow-y-auto">
                {regsQ.isLoading ? <Skeleton className="h-16 w-full" /> :
                  (regsQ.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-3">No tickets</p>
                  ) : (
                    (regsQ.data ?? []).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-muted/30 rounded text-[12px]">
                        <span className="truncate">{r.name || r.email}</span>
                        <span className="text-muted-foreground text-[11px] shrink-0">{format(parseISO(r.created_at), "MMM d")}</span>
                      </div>
                    ))
                  )}
              </div>
            </div>

            {/* Activity feed */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Recent activity ({activityQ.data?.length ?? 0})</p>
              </div>
              <div className="p-2 max-h-72 overflow-y-auto space-y-1">
                {activityQ.isLoading ? <Skeleton className="h-16 w-full" /> :
                  (activityQ.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-3">No activity yet</p>
                  ) : (
                    (activityQ.data ?? []).map((a) => (
                      <div key={a.id} className="px-2 py-1.5 rounded hover:bg-muted/30">
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <Badge variant="secondary" className="text-[10px] font-mono">{a.action}</Badge>
                          <span className="text-muted-foreground text-[10px]">
                            {format(parseISO(a.created_at), "MMM d, HH:mm")}
                          </span>
                        </div>
                        {a.details && Object.keys(a.details).length > 0 && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                            {JSON.stringify(a.details)}
                          </p>
                        )}
                      </div>
                    ))
                  )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function UserManagementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  const usersQ = useAdminUsers();
  const profilesQ = useProfilesIndex();

  const profilesByUserId = useMemo(() => {
    const map = new Map<string, ProfileDetail>();
    for (const p of profilesQ.data ?? []) map.set(p.user_id, p);
    return map;
  }, [profilesQ.data]);

  const adminCount = (usersQ.data ?? []).filter((u) => u.is_platform_admin).length;

  /* ── Mutations ── */

  const roleMut = useMutation({
    mutationFn: async ({ uid, grant }: { uid: string; grant: boolean }) => {
      const { error } = await supabaseRpc("admin_set_user_role", {
        _uid: uid, _role: "admin", _grant: grant,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const banMut = useMutation({
    mutationFn: async ({ uid, reason }: { uid: string; reason: string }) => {
      const { error } = await supabaseRpc("admin_ban_user", { _user_id: uid, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User banned");
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const unbanMut = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabaseRpc("admin_unban_user", { _user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User unbanned");
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabaseRpc("admin_delete_user", { _user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-users-profiles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: async (uid: string) => {
      const { data, error } = await supabaseRpc<string>("admin_force_password_reset", { _user_id: uid });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (token) => {
      toast.success("Recovery token copied", {
        description: typeof token === "string" ? token.slice(0, 16) + "…" : undefined,
      });
      if (typeof token === "string") navigator.clipboard?.writeText(token).catch(() => {});
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  /* ── Filtering ── */

  const filtered = useMemo(() => {
    const list = (usersQ.data ?? []).map((u) => ({
      ...u,
      _profile: profilesByUserId.get(u.user_id),
    }));
    const q = search.trim().toLowerCase();

    return list.filter((u) => {
      const banned = !!u._profile?.banned_at;
      const type = u._profile?.account_type;
      if (filter === "organizers" && type !== "organizer") return false;
      if (filter === "attendees" && type !== "attendee") return false;
      if (filter === "admins" && !u.is_platform_admin) return false;
      if (filter === "banned" && !banned) return false;
      if (!q) return true;
      const haystack = [
        u.display_name, u.org_name, u._profile?.first_name, u._profile?.last_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [usersQ.data, profilesByUserId, search, filter]);

  /* ── KPIs ── */

  const totalUsers = usersQ.data?.length ?? 0;
  const totalOrganisers = useMemo(
    () => (profilesQ.data ?? []).filter((p) => p.account_type === "organizer").length,
    [profilesQ.data],
  );
  const totalBanned = useMemo(
    () => (profilesQ.data ?? []).filter((p) => p.banned_at).length,
    [profilesQ.data],
  );
  const thisWeekSignups = useMemo(() => {
    const cutoff = subDays(new Date(), 7).toISOString();
    return (usersQ.data ?? []).filter((u) => u.created_at >= cutoff).length;
  }, [usersQ.data]);

  // Admin gating is handled by SuperAdminRoute in App.tsx, so no
  // page-level role check is needed here.

  const isLoading = usersQ.isLoading || profilesQ.isLoading;

  /* ── CSV export (utm-attribution-coverage, Task 12.1) ── */
  //
  // Emits the currently-filtered user list as a UTF-8 CSV with the five UTM
  // columns as trailing headers (Requirements 11.1, 11.2, 11.4). Every cell
  // is escaped through the shared RFC 4180 escaper in
  // `@/lib/utm/csv-escape`; any un-serializable value throws
  // `CsvEscapeError` and aborts the download before a single byte reaches
  // the browser (Requirement 11.3). Absent_UTM values are emitted as empty
  // cells rather than the literal text `null` / `NULL` per Requirement 11.4.
  //
  // Uses `filtered` so the export respects the current search + filter chips
  // (matches the "download candidate data" contract in the requirements
  // intro, decision #6).
  const handleExportCsv = () => {
    const headers = [
      "Display Name",
      "Account Type",
      "Organisation",
      "Joined At",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];
    const dataRows = filtered.map((u) => [
      u.display_name ?? "",
      u._profile?.account_type ?? "",
      u.org_name ?? "",
      u.created_at ?? "",
      u._profile?.utm_source ?? "",
      u._profile?.utm_medium ?? "",
      u._profile?.utm_campaign ?? "",
      u._profile?.utm_content ?? "",
      u._profile?.utm_term ?? "",
    ]);
    const filename = `illuxus-users-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const csv = buildCsvDocument(headers, dataRows);
      downloadCsv(filename, csv);
      toast.success("CSV exported", { description: `${filtered.length} user(s).` });
    } catch (err) {
      if (err instanceof CsvEscapeError) {
        logger.warn("user-management csv export blocked by escape error", {
          error_message: err.message,
        });
        toast.error("Export blocked", {
          description:
            "One or more rows contained a value that could not be exported. No file was created.",
        });
      } else {
        logger.warn("user-management csv export failed", {
          error_message: err instanceof Error ? err.message : String(err),
        });
        toast.error("Export failed", {
          description: err instanceof Error ? err.message : "Unknown error.",
        });
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="h-8 -ml-2">
              <Link to="/dashboard/admin"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to admin</Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">User Management</h1>
                <p className="text-xs text-muted-foreground">Search, audit, and moderate every user on the platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => { usersQ.refetch(); profilesQ.refetch(); }} className="h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard icon={Users}     label="Total users"      value={totalUsers}      loading={isLoading} />
          <KpiCard icon={Calendar}  label="This week"        value={thisWeekSignups} loading={isLoading} />
          <KpiCard icon={Building2} label="Organisers"       value={totalOrganisers} loading={isLoading} />
          <KpiCard icon={Crown}     label="Super admins"     value={adminCount}      loading={isLoading} />
          <KpiCard icon={Ban}       label="Banned"           value={totalBanned}     loading={isLoading} />
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, org…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 w-72 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            {(["all","organizers","attendees","admins","banned"] as FilterChip[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-2.5 py-1 rounded border text-[12px] transition-colors ${
                  filter === c ? "border-blue-500 text-blue-600 bg-blue-500/10" : "border-border hover:bg-muted"
                }`}
              >
                {c === "all" ? "All" : c[0]!.toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} of {totalUsers}</span>
        </div>

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Organisation</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Type</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Joined</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Status</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No users match</td></tr>
                ) : (
                  filtered.map((u) => {
                    const isBanned = !!u._profile?.banned_at;
                    const type = u._profile?.account_type;
                    return (
                      <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => setDrawerUserId(u.user_id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-semibold shrink-0">
                              {(u.display_name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{u.display_name || "Unknown"}</p>
                              {u.is_platform_admin && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-semibold uppercase tracking-wider">
                                  <Shield className="h-2.5 w-2.5" /> Super admin
                                </span>
                              )}
                              {/* First-touch UTM attribution — read-only.
                                  Renders `via <utm_source>` under the user's
                                  identifier when a non-whitespace source is
                                  attached to the profile. Matches the shipped
                                  attendee hint pattern in
                                  `RegistrationsSection.tsx`. Silent when
                                  absent (Requirement 9.2 / 14.2 — no
                                  placeholder characters, no `via` keyword). */}
                              {(() => {
                                const src = utmSourceHintDisplay(u._profile?.utm_source);
                                if (!src) return null;
                                return (
                                  <p
                                    className="text-[10px] text-muted-foreground/80 truncate"
                                    title={`Source: ${u._profile?.utm_source ?? ""}`}
                                  >
                                    via <span className="font-medium">{src}</span>
                                  </p>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{u.org_name || "—"}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {type ? <Badge variant="secondary" className="text-[10px] capitalize">{type}</Badge> : "—"}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{format(parseISO(u.created_at), "MMM d, yyyy")}</td>
                        <td className="px-4 py-3">
                          {isBanned ? (
                            <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px] uppercase">Banned</Badge>
                          ) : u.onboarding_completed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600"><UserCheck className="h-3 w-3" /> Active</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-[12px]">
                              <DropdownMenuItem onClick={() => setDrawerUserId(u.user_id)}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> View activity
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.is_platform_admin ? (
                                <DropdownMenuItem
                                  disabled={u.user_id === user?.id || adminCount <= 1}
                                  onClick={() => roleMut.mutate({ uid: u.user_id, grant: false })}
                                >
                                  <ShieldOff className="h-3.5 w-3.5 mr-2" /> Demote from admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => roleMut.mutate({ uid: u.user_id, grant: true })}>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Promote to admin
                                </DropdownMenuItem>
                              )}
                              {isBanned ? (
                                <DropdownMenuItem onClick={() => unbanMut.mutate(u.user_id)}>
                                  <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Unban
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={u.user_id === user?.id}
                                  onClick={() => banMut.mutate({ uid: u.user_id, reason: "Banned by super admin" })}
                                >
                                  <Ban className="h-3.5 w-3.5 mr-2" /> Ban
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => resetMut.mutate(u.user_id)}>
                                <KeyRound className="h-3.5 w-3.5 mr-2" /> Force password reset
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={u.user_id === user?.id}
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete user
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      <UserDetailDrawer userId={drawerUserId} onClose={() => setDrawerUserId(null)} />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.display_name || "this user"}</strong> and cascade through profile, roles, registrations, memberships. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.user_id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
