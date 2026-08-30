/**
 * ActivityFeedPage — real-time audit-log stream for super admins.
 *
 * Subscribes to `public.audit_logs` via Supabase Realtime so new rows appear
 * instantly. Filter chips by action category, free-text search across actor
 * email and target_id, humanised action verbs, expandable details JSON.
 *
 * Mounted at `/dashboard/admin/activity` behind `SuperAdminRoute`.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowLeft, Search, RefreshCw, Wifi, ChevronDown, ChevronRight,
  Calendar, Users, Building2, CreditCard, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc, logger } from "@/lib/observability";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  total_count?: number;
}

type Category = "all" | "events" | "users" | "orgs" | "subscriptions" | "tickets";

const categoryFilters: Record<Category, (a: string) => boolean> = {
  all:           () => true,
  events:        (a) => a.startsWith("event."),
  users:         (a) => a.startsWith("user.") || a.startsWith("profile.") || a.startsWith("role."),
  orgs:          (a) => a.startsWith("org."),
  subscriptions: (a) => a.startsWith("subscription."),
  tickets:       (a) => a.startsWith("ticket."),
};

const categoryIcon: Record<Category, React.ElementType> = {
  all: Activity,
  events: Calendar,
  users: Users,
  orgs: Building2,
  subscriptions: CreditCard,
  tickets: MessageSquare,
};

/* ─── Verb humaniser ────────────────────────────────────────────────────── */

const VERB_MAP: Record<string, string> = {
  "event.created":            "created an event",
  "event.updated":            "updated an event",
  "event.deleted":            "deleted an event",
  "event.force_unpublished":  "force-unpublished an event",
  "event.force_deleted":      "force-deleted an event",
  "org.created":              "created an organisation",
  "org.updated":              "updated an organisation",
  "org.deleted":              "deleted an organisation",
  "profile.updated":          "updated a profile",
  "role.granted":             "granted a role",
  "role.revoked":             "revoked a role",
  "subscription.created":     "started a subscription",
  "subscription.updated":     "updated a subscription",
  "subscription.deleted":     "cancelled a subscription",
  "ticket.updated":           "updated a ticket",
  "user.banned":              "banned a user",
  "user.unbanned":            "unbanned a user",
  "user.deleted":             "deleted a user",
  "user.password_reset_forced": "forced a password reset",
};

function humaniseAction(action: string): string {
  return VERB_MAP[action] || action.replace(".", " ");
}

const actionColor: Record<string, string> = {
  "event.created": "bg-green-500/10 text-green-600",
  "event.deleted": "bg-destructive/10 text-destructive",
  "event.force_unpublished": "bg-amber-500/10 text-amber-600",
  "event.force_deleted": "bg-destructive/10 text-destructive",
  "user.banned": "bg-destructive/10 text-destructive",
  "user.unbanned": "bg-green-500/10 text-green-600",
  "user.deleted": "bg-destructive/10 text-destructive",
  "role.granted": "bg-violet-500/10 text-violet-600",
  "role.revoked": "bg-amber-500/10 text-amber-600",
};

/* ─── UI helpers ────────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function ActivityFeedPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [livePrepend, setLivePrepend] = useState<AuditEntry[]>([]);

  const feedQ = useQuery({
    queryKey: ["admin-activity-feed"],
    queryFn: async () => {
      const { data, error } = await supabaseRpc<AuditEntry[]>("admin_recent_activity", {
        _limit: 200, _action_filter: null,
      });
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
    staleTime: 30_000,
  });

  /* ── Realtime subscription. Auto-cleanup on unmount. */
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin-audit-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          const row = payload.new as AuditEntry;
          setLivePrepend((prev) => {
            // Keep newest 50 live rows; older ones flow into the query cache.
            const next = [row, ...prev.filter((r) => r.id !== row.id)];
            return next.slice(0, 50);
          });
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR") {
          logger.warn("admin-activity: realtime channel error");
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  /* Merge live prepend with cached feed, dedupe by id. */
  const merged = useMemo(() => {
    const byId = new Map<string, AuditEntry>();
    for (const r of livePrepend) byId.set(r.id, r);
    for (const r of feedQ.data ?? []) if (!byId.has(r.id)) byId.set(r.id, r);
    return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [livePrepend, feedQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merged.filter((e) => {
      if (!categoryFilters[category](e.action)) return false;
      if (!q) return true;
      return [e.actor_email, e.target_id, e.action].filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [merged, category, search]);

  // Admin gating is handled by SuperAdminRoute in App.tsx, so no
  // page-level role check is needed here.

  const isLoading = feedQ.isLoading;

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
              <div className="h-9 w-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Activity className="h-4.5 w-4.5 text-cyan-500" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Activity feed</h1>
                <p className="text-xs text-muted-foreground">Live audit log across the entire platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Wifi className={`h-3.5 w-3.5 ${realtimeConnected ? "text-green-500" : "text-muted-foreground"}`} />
              {realtimeConnected ? "Live" : "Connecting…"}
            </div>
            <Button size="sm" variant="outline" onClick={() => { setLivePrepend([]); qc.invalidateQueries({ queryKey: ["admin-activity-feed"] }); }} className="h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Search + categories */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by actor email or target id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 w-80 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {(["all","events","users","orgs","subscriptions","tickets"] as Category[]).map((c) => {
              const Icon = categoryIcon[c];
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[12px] capitalize transition-colors ${
                    category === c ? "border-cyan-500 text-cyan-600 bg-cyan-500/10" : "border-border hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3 w-3" /> {c}
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} entries</span>
        </div>

        {/* Feed */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground text-sm">No activity matches</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => {
                  const isOpen = expanded === e.id;
                  const verb = humaniseAction(e.action);
                  const color = actionColor[e.action] || "bg-muted text-muted-foreground";
                  return (
                    <li key={e.id} className="p-3 hover:bg-muted/20 transition-colors">
                      <button
                        type="button"
                        className="w-full text-left flex items-start gap-3"
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                      >
                        <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {(e.actor_email || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug">
                            <span className="font-semibold">{e.actor_email || "system"}</span>
                            <span className="text-muted-foreground"> {verb}</span>
                            {e.target_type && (
                              <code className="ml-1.5 text-[11px] text-muted-foreground font-mono">
                                {e.target_type}:{(e.target_id || "").slice(0, 8)}
                              </code>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <Badge variant="secondary" className={`text-[9px] font-mono ${color}`}>{e.action}</Badge>
                            <span>·</span>
                            <span>{formatDistanceToNow(parseISO(e.created_at), { addSuffix: true })}</span>
                          </p>
                        </div>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </button>
                      {isOpen && (
                        <pre className="mt-2 ml-10 p-2 bg-muted/40 rounded text-[10px] font-mono overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(e.details ?? {}, null, 2)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
