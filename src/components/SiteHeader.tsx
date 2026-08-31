import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { usePortalAccess } from "@/hooks/usePortalAccess";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/contexts/ThemeContext";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { ArrowRight, CalendarDays, ChevronDown, ClipboardList, Compass, LogOut, Mic, Building2, Settings as SettingsIcon, Shield, Ticket, Users2 } from "lucide-react";

/**
 * Centralized site header used across every public segment
 * (marketing site, discover, attendee, org/event pages).
 *
 * Intentionally minimal: just the Illuxus logo on the left and an
 * auth control on the right. No primary navigation menu.
 *
 * Org / event pages can pass `theme` to inherit the page's tokens so
 * the header blends with the branded canvas.
 */
export interface SiteHeaderTheme {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

export default function SiteHeader({
  theme,
  homeHref = "/",
  className = "",
  transparent = false,
  landingMode = false,
}: {
  theme?: SiteHeaderTheme;
  homeHref?: string;
  className?: string;
  transparent?: boolean;
  /**
   * When true, the header renders the marketing landing variant:
   *  - "Start for free" CTA button as the rightmost action (when signed out)
   *  - Slightly lifted glass surface tuned for the dark luminous canvas
   * Other surfaces (dashboard, themed event pages) pass nothing and get the
   * compact default.
   */
  landingMode?: boolean;
}) {
  const { user, signOut, accountType, isAdmin } = useAuth();
  const { memberships, myRole } = useOrg();
  const { data: portalAccess } = usePortalAccess();
  const { content } = useSiteContent();
  const navigate = useNavigate();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const { theme: appTheme } = useTheme();
  // Pick dark logo when in dark mode (and a dark logo is provided); fall back to the light/default logo.
  // Use the platform logo as final fallback so the header never appears without an image.
  const fallbackLogo = "https://dcfygmgjqldvynbvmwdy.supabase.co/storage/v1/object/public/site-assets/favicon/1777010462147-m60zhn.png";
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl || fallbackLogo) : (logoUrl || fallbackLogo);
  // `homeHref` is kept in the API for back-compat but the logo now always links to illuxus.com.
  void homeHref;

  // Load profile so the avatar/initials reflect the user's saved name
  // rather than always falling back to the first email letter.
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; first_name: string | null; last_name: string | null } | null>(null);
  useEffect(() => {
    if (!user) { setProfile(null); return; }
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
      .channel(`site-header-profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const displayName = profile?.display_name || fullName || user?.email?.split("@")[0] || "Account";
  const initials = (fullName || displayName).split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || (user?.email?.[0] || "A").toUpperCase();
  const avatarUrl = profile?.avatar_url || null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const themed = !!theme;
  const styleVars: React.CSSProperties = themed
    ? {
        backgroundColor: transparent ? "transparent" : theme?.backgroundColor,
        color: theme?.textColor,
        borderColor: theme?.textColor ? `${theme.textColor}15` : undefined,
        fontFamily: theme?.fontFamily ? `${theme.fontFamily}, sans-serif` : undefined,
      }
    : {};

  // Themed pages skip backdrop blur to avoid washing out the page palette.
  // Landing mode renders a glass surface that adapts: in dark mode it sits on
  // the near-black canvas; in light mode it uses a subtle white/gray glass.
  const surfaceClass = themed
    ? "border-b"
    : landingMode
      ? "border-b border-gray-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.06] backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-white/[0.04]"
      : "border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60";

  return (
    <header className={`app-chrome sticky top-0 z-40 ${surfaceClass} ${className}`} style={{ ...styleVars, paddingTop: "env(safe-area-inset-top)" }}>
      <SiteContainer className="h-14 flex items-center justify-between gap-4">
        {/* Brand area — wordmark only. Always navigates to the canonical
            illuxus deployment, regardless of which segment we're in. */}
        <a
          href="https://illuxus.com"
          className="flex items-center gap-2 shrink-0"
          aria-label={`${brandName} home`}
        >
          <IlluxusWordmark height={22} ariaLabel="" className="shrink-0" />
        </a>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/discover"
            className={
              landingMode
                ? "inline-flex h-8 w-8 sm:w-auto items-center justify-center gap-1.5 rounded-full px-0 sm:px-3 text-[13px] font-medium text-gray-600 dark:text-white/75 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white"
                : "text-[13px] font-medium px-3 h-8 inline-flex items-center gap-1.5 rounded-full hover:bg-secondary transition-colors"
            }
            style={themed ? { color: theme?.textColor } : undefined}
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Discover</span>
          </Link>
          {landingMode ? (
            <div className="rounded-full border border-gray-200 dark:border-white/[0.12] bg-gray-100/80 dark:bg-white/[0.06] p-0.5">
              <ThemeToggle size="sm" />
            </div>
          ) : (
            <div
              className={themed ? "rounded-full p-0.5" : undefined}
              style={
                themed
                  ? {
                      backgroundColor: `${theme?.textColor ?? "#000"}10`,
                      border: `1px solid ${theme?.textColor ?? "#000"}20`,
                    }
                  : undefined
              }
            >
              <ThemeToggle size="sm" />
            </div>
          )}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-md hover:bg-secondary transition-colors"
                  style={
                    themed
                      ? { backgroundColor: `${theme?.textColor ?? "#000"}10`, border: `1px solid ${theme?.textColor ?? "#000"}20`, color: theme?.textColor }
                      : undefined
                  }
                  aria-label={displayName}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div
                      className={themed ? "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold" : "h-6 w-6 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold"}
                      style={themed ? { backgroundColor: theme?.accentColor, color: "#fff" } : undefined}
                    >
                      {initials}
                    </div>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-[13px] font-medium truncate">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">
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
                <DropdownMenuItem asChild>
                  <Link to="/community"><Users2 className="h-3.5 w-3.5 mr-2" /> Community</Link>
                </DropdownMenuItem>
                {/* ── Super admin: dedicated Control Tower entry. Shown only
                    to users with the platform `admin` role. The link goes
                    directly to /dashboard/admin so it never gets shadowed
                    by the organiser dashboard's account-type redirect. */}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/admin">
                      <Shield className="h-3.5 w-3.5 mr-2" /> Super admin
                    </Link>
                  </DropdownMenuItem>
                )}
                {/* ── Organiser / workspace surface. Distinct item even for
                    admins who also run events, so they can switch between
                    the Control Tower and the organiser dashboard without
                    URL fiddling. The link goes to /dashboard/events
                    explicitly (not /dashboard) so admins bypass the
                    DashboardLanding admin-redirect that sends them to
                    /dashboard/admin by default. */}
                {(accountType === "organizer" || isAdmin || memberships.length > 0) && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/events">
                      <CalendarDays className="h-3.5 w-3.5 mr-2" />
                      {isAdmin
                        ? "Organizer dashboard"
                        : accountType === "organizer"
                          ? "Organizer dashboard"
                          : myRole && myRole !== "owner"
                            ? `Workspace · ${myRole}`
                            : "Workspace dashboard"}
                    </Link>
                  </DropdownMenuItem>
                )}
                {(portalAccess?.has_speaker || accountType === "attendee" || accountType === "organizer" || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/speaker"><Mic className="h-3.5 w-3.5 mr-2" /> Speaker dashboard</Link>
                  </DropdownMenuItem>
                )}
                {(portalAccess?.has_sponsor || accountType === "organizer" || accountType === "attendee" || isAdmin) && (
                  <DropdownMenuItem asChild>
                    <Link to="/sponsor"><Building2 className="h-3.5 w-3.5 mr-2" /> Sponsor dashboard</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to={accountType === "attendee" ? "/u/me/settings" : "/dashboard/settings"}><SettingsIcon className="h-3.5 w-3.5 mr-2" /> Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : landingMode ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                to="/login"
                className="hidden sm:inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-gray-600 dark:text-white/75 transition-colors hover:text-gray-900 dark:hover:text-white"
              >
                Sign in
              </Link>
              <Link
                to="/login"
                className="group inline-flex h-8 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-full bg-gray-900 dark:bg-white px-3 sm:px-4 text-[12px] sm:text-[13px] font-semibold text-white dark:text-[#09090B] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] dark:shadow-[0_8px_24px_-8px_rgba(255,255,255,0.4)] transition-all duration-150 hover:bg-gray-800 dark:hover:bg-white/90 active:scale-[0.98] whitespace-nowrap"
              >
                <span className="hidden sm:inline">Start for free</span>
                <span className="sm:hidden">Sign up</span>
                <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-[13px] font-medium px-3 h-8 inline-flex items-center rounded-full border transition-colors hover:opacity-90"
              style={
                themed
                  ? { borderColor: `${theme?.textColor ?? "#000"}20`, color: theme?.textColor }
                  : undefined
              }
            >
              Sign in
            </Link>
          )}
        </div>
      </SiteContainer>
    </header>
  );
}
