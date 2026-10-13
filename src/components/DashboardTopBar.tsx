import { AppHeaderBar } from "@/components/layout/AppHeaderBar";
import { OrganiserNotch, WorkspaceChip } from "@/components/layout/ShellNotch";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import {
  LogOut, Bell, ChevronDown, ClipboardList, Handshake, Search, Ticket,
  CalendarDays, Settings as SettingsIcon, Shield, X, Users2,
} from "lucide-react";
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

interface NotifItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  url?: string;
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

// ─── Dashboard Top Bar ────────────────────────────────────────────────────────

export interface DashboardTopBarProps {
  /** @deprecated The sidebar button now shows automatically whenever the
   *  page has a sidebar (see AppHeaderBar); this prop is ignored. */
  showSidebarTrigger?: boolean;
  /** Render as the first row of the white app panel (search on the left,
   *  account controls on the right); the logo is then left to the sidebar. */
  inPanel?: boolean;
  /** Organiser shell: logo left, the main navigation as a centred pill, and
   *  the actions right, all on the canvas above the page panel. */
  notch?: boolean;
}

/**
 * The shared top bar used across every organizer surface — DashboardLayout
 * routes and per-event pages alike. Renders the brand mark, theme toggle,
 * global search, notifications popover, and the profile dropdown.
 *
 * The bar itself (size, logo, sidebar button) is the shared AppHeaderBar;
 * this component only supplies the dashboard's actions.
 */
export function DashboardTopBar({ inPanel = false, notch = false }: DashboardTopBarProps = {}) {
  const { user, isAdmin, accountType, signOut } = useAuth();
  const { org, memberships } = useOrg();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Route-driven context — matches `DashboardLayout`'s sidebar selection.
  // On admin routes the topbar shows the "Super Admin" badge and the
  // notifications popover swaps over to platform-level data; on every
  // other route it stays in the organiser-dashboard mode.
  const isAdminRoute = pathname.startsWith("/dashboard/admin");
  const { content } = useSiteContent();
  const { brandName } = content.navbar;

  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  // Profile in topbar
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      supabaseRpc("get_my_profile").then(({ data }) => {
        if (cancelled || !data) return;
        const p = data as { display_name: string | null; avatar_url: string | null; first_name: string | null; last_name: string | null };
        setProfile({
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
        });
      });
    };
    load();
    const channel = supabase
      .channel(`topbar-profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  // Notifications — recent registrations across all org events.
  useEffect(() => {
    if (!org?.id || !notifOpen) return;
    let cancelled = false;

    const fetchNotifs = async () => {
      const { data: eventsData } = await supabase
        .from("events")
        .select("id")
        .eq("org_id", org.id);

      if (cancelled || !eventsData || eventsData.length === 0) {
        setNotifs([]);
        return;
      }

      const eventIds = eventsData.map((e) => e.id);

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

  // Cmd/Ctrl + K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Context badge — only on admin routes so the Super Admin control tower is
  // never confused with the organiser dashboard.
  const leading = isAdminRoute ? (
          <span className="hidden sm:inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-destructive/10 text-destructive border border-destructive/30">
            <Shield className="h-2.5 w-2.5" /> Super Admin
          </span>
        ) : null;

  // Search: a field-shaped button on wider screens, an icon on phones.
  const searchField = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      title="Search (⌘K)"
      className={`hidden md:flex items-center gap-2.5 h-10 px-3.5 rounded-xl text-[13.5px] text-muted-foreground hover:text-foreground transition-colors ${inPanel ? "w-full max-w-sm bg-muted/70" : "w-56 lg:w-72 bg-card border border-border"}`}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">Search anything…</span>
      <kbd className="text-[10px] font-medium text-muted-foreground/70">⌘K</kbd>
    </button>
  );
  const searchIcon = (
    <button type="button" className={`shell-icon-btn ${notch ? "" : "md:hidden"}`} onClick={() => setSearchOpen(true)} title="Search" aria-label="Search">
      <Search className="h-4 w-4" />
    </button>
  );

  const actions = (
    <>

          <ThemeToggle size="sm" className="mr-1" />

          {searchIcon}

          {/* Notifications belong to the organiser dashboard — they list
              org-scoped recent registrations. On admin routes there's no
              active org context and the Activity Feed page already shows
              platform-level notifications, so we suppress the bell here
              to avoid an empty popover. */}
          {!isAdminRoute && (
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="shell-icon-btn relative" title="Notifications" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
                )}
              </button>
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
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 h-9 pl-1 pr-2 rounded-full bg-card border border-border hover:bg-muted transition-colors" aria-label="Account menu">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center text-[10px] font-semibold text-background">
                    {initials}
                  </div>
                )}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {isAdmin ? "Super admin" : (accountType || "attendee")}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/u/me/events"><Ticket className="h-3.5 w-3.5 mr-2" /> My tickets</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/u/me/applications"><ClipboardList className="h-3.5 w-3.5 mr-2" /> My applications</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/u/me/communities"><Users2 className="h-3.5 w-3.5 mr-2" /> My communities</Link>
              </DropdownMenuItem>
              {/* Tracked links an organiser has shared with this account. */}
              <DropdownMenuItem asChild>
                <Link to="/partner"><Handshake className="h-3.5 w-3.5 mr-2" /> Partner dashboard</Link>
              </DropdownMenuItem>
              {/* Super admin entry — dedicated, distinct from the organiser
                  dashboard so admins who also run events can switch panels
                  in one click. */}
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/admin">
                    <Shield className="h-3.5 w-3.5 mr-2" /> Super admin
                  </Link>
                </DropdownMenuItem>
              )}
              {/* Organiser entry — for organisers, admins, and any
                  workspace member. Links straight to /dashboard/events so
                  admins don't get bounced by the admin-redirect in
                  DashboardLanding. */}
              {(accountType === "organizer" || isAdmin || memberships.length > 0) && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/events">
                    <CalendarDays className="h-3.5 w-3.5 mr-2" /> Organizer dashboard
                  </Link>
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
    </>
  );

  return (
    <>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {notch ? (
        // Phones: logo and actions on one row, the navigation pill on the next.
        <header className="shell-notch-header app-chrome sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:px-6">
          <div className="flex min-w-0 items-center gap-3 md:flex-1">
            <a href="https://illuxus.com" className="flex shrink-0 items-center" aria-label={`${brandName} home`}>
              <IlluxusWordmark height={22} ariaLabel="" />
            </a>
            <WorkspaceChip />
            {leading}
          </div>
          <div className="order-last flex w-full min-w-0 justify-center md:order-none md:w-auto">
            <OrganiserNotch />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:flex-1 md:justify-end">{actions}</div>
        </header>
      ) : inPanel ? (
        <header className="shell-topbar sticky top-0 z-30 flex h-[4.25rem] items-center gap-2 px-4 lg:px-6">
          <SidebarTrigger className="shell-icon-btn !h-9 !w-9 md:hidden" aria-label="Open menu" />
          <a href="https://illuxus.com" className="flex shrink-0 items-center md:hidden" aria-label={`${brandName} home`}>
            <IlluxusWordmark height={20} ariaLabel="" />
          </a>
          {leading}
          {searchField}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
        </header>
      ) : (
        <AppHeaderBar brandName={brandName} leading={leading} actions={<>{searchField}{actions}</>} />
      )}
    </>
  );
}

export default DashboardTopBar;
