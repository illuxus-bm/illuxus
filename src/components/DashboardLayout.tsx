import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, ChevronDown, Menu, Search, Ticket, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, accountType, signOut } = useAuth();
  const { org } = useOrg();
  const navigate = useNavigate();
  const { content } = useSiteContent();
  const { brandName, logoUrl, logoUrlDark, logoHeight, logoPaddingTop, logoPaddingBottom } = content.navbar;
  const { theme: appTheme } = useTheme();
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;
  const resolvedLogoHeight = Math.max(16, Math.min(64, logoHeight ?? 28));
  // Top bar is dense (h-12). Cap dashboard logo a bit smaller, and grow header if needed.
  const dashLogoHeight = Math.min(resolvedLogoHeight, 36);
  // Scale padding proportionally — the dashboard header is denser than the public site.
  const dashPadTop = Math.max(0, Math.min(16, Math.round((logoPaddingTop ?? 0) / 2)));
  const dashPadBottom = Math.max(0, Math.min(16, Math.round((logoPaddingBottom ?? 0) / 2)));
  const headerHeight = Math.max(48, dashLogoHeight + dashPadTop + dashPadBottom + 16);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Pull the latest profile so the avatar + name in the topbar reflect what
  // the user saved in Settings → Profile (instead of falling back to the
  // email handle). Live-refresh on profile updates so it stays in sync.
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      supabase.rpc("get_my_profile").then(({ data }) => {
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
      .channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const displayName = profile?.display_name || fullName || user?.email?.split("@")[0] || "User";
  const initials = (fullName || displayName).split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";
  const avatarUrl = profile?.avatar_url || null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full playful-app-bg">
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
                  style={{
                    height: `${dashLogoHeight}px`,
                    marginTop: `${dashPadTop}px`,
                    marginBottom: `${dashPadBottom}px`,
                  }}
                  className="w-auto max-w-[180px] object-contain"
                />
              ) : (
                <>
                  <div className="h-7 w-7 rounded-md bg-foreground flex items-center justify-center">
                    <span className="text-background text-xs font-bold">
                      {brandName?.charAt(0).toUpperCase() || "B"}
                    </span>
                  </div>
                  <span className="text-sm font-semibold tracking-tight hidden sm:inline">{brandName}</span>
                </>
              )}
            </Link>
            {/* No primary nav menu — sidebar handles navigation. */}
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle size="sm" className="mr-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Search className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Bell className="h-3.5 w-3.5" />
            </Button>

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
                {(accountType === "organizer" || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard"><CalendarDays className="h-3.5 w-3.5 mr-2" /> Organizer dashboard</Link>
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