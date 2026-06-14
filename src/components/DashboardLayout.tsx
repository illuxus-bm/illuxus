import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalAccess } from "@/hooks/usePortalAccess";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Bell, ChevronDown, ClipboardList, Menu, Search, Ticket, CalendarDays, Mic, Building2, Settings as SettingsIcon, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  type: "event" | "attendee";
  id: string;
  label: string;
  sub: string;
  url: string;
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const [evRes, regRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, date, slug")
          .ilike("title", `%${q}%`)
          .limit(5),
        supabase
          .from("registrations")
          .select("id, name, email, event_id")
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(5),
      ]);
      if (cancelled) return;

      const items: SearchResult[] = [
        ...(evRes.data ?? []).map((e) => ({
          type: "event" as const,
          id: e.id,
          label: e.title,
          sub: new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          url: `/dashboard/events/${e.slug ?? e.id}`,
        })),
        ...(regRes.data ?? []).map((r) => ({
          type: "attendee" as const,
          id: r.id,
          label: r.name,
          sub: r.email,
          url: `/dashboard/events/${r.event_id}/guests`,
        })),
      ];
      setResults(items);
      setLoading(false);
    };

    const t = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, attendees…"
            className="border-0 shadow-none focus-visible:ring-0 h-7 text-[14px] px-0 bg-transparent"
            onKeyDown={(e) => { if (e.key === "Escape") { if (query) setQuery(""); else onClose(); } }}
          />
          {/* Single smart dismiss button:
              - When query has text → clears the query (keeps overlay open so user can type again)
              - When query is empty → closes the overlay entirely
              This prevents the double-X appearing simultaneously */}
          <button
            onClick={() => { if (query) setQuery(""); else onClose(); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={query ? "Clear search" : "Close search"}
            title={query ? "Clear" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {query.trim().length >= 2 && (
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="text-[13px] text-muted-foreground text-center py-6">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-6">No results for "{query}"</p>
            ) : (
              <div className="py-1.5">
                {results.map((r) => (
                  <button
                    key={r.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => { navigate(r.url); onClose(); }}
                  >
                    <span className={`inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold shrink-0 ${
                      r.type === "event" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                    }`}>
                      {r.type === "event" ? "E" : "A"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{r.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!query.trim() && (
          <p className="text-[12px] text-muted-foreground text-center py-5">
            Type at least 2 characters to search
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Notification item type ───────────────────────────────────────────────────

interface NotifItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  url?: string;
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, accountType, signOut } = useAuth();
  const { data: portalAccess } = usePortalAccess();
  const { org } = useOrg();
  const navigate = useNavigate();
  const { content } = useSiteContent();
  const { brandName, logoUrl, logoUrlDark, logoHeight, logoPaddingTop, logoPaddingBottom } = content.navbar;
  const { theme: appTheme } = useTheme();
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;
  const resolvedLogoHeight = Math.max(16, Math.min(64, logoHeight ?? 28));
  const dashLogoHeight = Math.min(resolvedLogoHeight, 36);
  const dashPadTop = Math.max(0, Math.min(16, Math.round((logoPaddingTop ?? 0) / 2)));
  const dashPadBottom = Math.max(0, Math.min(16, Math.round((logoPaddingBottom ?? 0) / 2)));
  const headerHeight = Math.max(48, dashLogoHeight + dashPadTop + dashPadBottom + 16);

  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  // Track whether the user has seen the current batch — clears the red dot
  const [notifSeen, setNotifSeen] = useState(false);

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  // Profile in topbar
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      supabaseRpc("get_my_profile").then(({ data }) => {
        if (cancelled || !data) return;
        const p = data as { display_name: string | null; avatar_url: string | null; first_name: string | null; last_name: string | null };
        setProfile({ display_name: p.display_name ?? null, avatar_url: p.avatar_url ?? null, first_name: p.first_name ?? null, last_name: p.last_name ?? null });
      });
    };
    load();
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  // Notifications — pull recent registrations across all org events.
  // Uses two sequential queries because Supabase JS v2 doesn't support
  // subquery-as-array in .in() — the previous inline cast was silently broken.
  useEffect(() => {
    if (!org?.id || !notifOpen) return;
    let cancelled = false;

    const fetchNotifs = async () => {
      // Step 1: get event IDs for this org
      const { data: eventsData } = await supabase
        .from("events")
        .select("id")
        .eq("org_id", org.id);

      if (cancelled || !eventsData || eventsData.length === 0) {
        setNotifs([]);
        return;
      }

      const eventIds = eventsData.map((e) => e.id);

      // Step 2: get recent registrations for those events with event title
      const { data } = await supabase
        .from("registrations")
        .select("id, name, email, event_id, created_at, events(title)")
        .in("event_id", eventIds)
        .order("created_at", { ascending: false })
        .limit(15);

      if (cancelled || !data) return;

      setNotifs(
        (data as Array<{
          id: string;
          name: string;
          email: string;
          event_id: string;
          created_at: string;
          events: { title: string } | null;
        }>).map((r) => ({
          id: r.id,
          title: "New registration",
          body: `${r.name} registered for ${r.events?.title ?? "an event"}`,
          read: false,
          created_at: r.created_at,
          // Deep-link to the originating event detail page; the per-event
          // Registrations tab is now the canonical place to manage attendees.
          url: `/dashboard/events/${r.event_id}`,
        }))
      );
    };

    fetchNotifs();
    return () => { cancelled = true; };
  }, [org?.id, notifOpen]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const fullName    = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const displayName = profile?.display_name || fullName || user?.email?.split("@")[0] || "User";
  const initials    = (fullName || displayName).split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  const avatarUrl   = profile?.avatar_url || null;

  // Keyboard shortcut: Cmd/Ctrl + K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full playful-app-bg">
        {/* Global Search overlay */}
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Top bar */}
        <header
          className="flex items-center justify-between border-b border-border bg-card sticky top-0 z-50 px-4 py-2"
          style={{ minHeight: `${headerHeight}px` }}
        >
          <div className="flex items-center gap-2">
            <SidebarTrigger className="h-8 w-8" aria-label="Toggle sidebar">
              <Menu className="h-4 w-4" />
            </SidebarTrigger>
            <Link to="/" className="flex items-center gap-2 mr-4" aria-label={`${brandName} home`}>
              {activeLogoUrl ? (
                <img
                  src={activeLogoUrl}
                  alt={brandName}
                  style={{ height: `${dashLogoHeight}px`, marginTop: `${dashPadTop}px`, marginBottom: `${dashPadBottom}px` }}
                  className="w-auto max-w-[180px] object-contain"
                />
              ) : (
                <>
                  <div className="h-7 w-7 rounded-md bg-foreground flex items-center justify-center">
                    <span className="text-background text-xs font-bold">{brandName?.charAt(0).toUpperCase() || "B"}</span>
                  </div>
                  <span className="text-sm font-semibold tracking-tight hidden sm:inline">{brandName}</span>
                </>
              )}
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle size="sm" className="mr-1" />

            {/* Search button — opens global search overlay */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchOpen(true)}
              title="Search (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>

            {/* Notifications bell — popover with recent registrations */}
            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
                  title="Notifications"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-[13px] font-semibold">Recent Activity</p>
                  {unreadCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">{unreadCount} new</span>
                  )}
                </div>
                {notifs.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground text-center py-8">
                    No recent activity
                  </p>
                ) : (
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {notifs.map((n) => (
                      <button
                        key={n.id}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                        onClick={() => { if (n.url) navigate(n.url); setNotifOpen(false); }}
                      >
                        <p className="text-[12px] font-medium">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-border px-4 py-2">
                  <button
                    className="text-[12px] text-primary hover:underline"
                    onClick={() => { navigate("/dashboard/events"); setNotifOpen(false); }}
                  >
                    View all events →
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-md hover:bg-secondary transition-colors">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-foreground flex items-center justify-center text-[10px] font-semibold text-background">
                      {initials}
                    </div>
                  )}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{accountType || "attendee"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/u/me/events"><Ticket className="h-3.5 w-3.5 mr-2" /> My tickets</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/u/me/applications"><ClipboardList className="h-3.5 w-3.5 mr-2" /> My applications</Link>
                </DropdownMenuItem>
                {(accountType === "organizer" || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard"><CalendarDays className="h-3.5 w-3.5 mr-2" /> Organizer dashboard</Link>
                  </DropdownMenuItem>
                )}
                {portalAccess?.has_speaker && (
                  <DropdownMenuItem asChild>
                    <Link to="/speaker"><Mic className="h-3.5 w-3.5 mr-2" /> Speaker dashboard</Link>
                  </DropdownMenuItem>
                )}
                {portalAccess?.has_sponsor && (
                  <DropdownMenuItem asChild>
                    <Link to="/sponsor"><Building2 className="h-3.5 w-3.5 mr-2" /> Sponsor dashboard</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/settings"><SettingsIcon className="h-3.5 w-3.5 mr-2" /> Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex flex-1 w-full">
          <AppSidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="p-4 lg:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}