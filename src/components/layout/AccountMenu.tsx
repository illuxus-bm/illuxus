/**
 * The signed-in account chip and its menu, shared by every header so the
 * same choices open in the same pop-up wherever you are: your own pages,
 * each dashboard you have a door to, settings and sign out.
 */
import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, CalendarDays, ChevronDown, ClipboardList, Handshake, LogOut,
  Mic, Settings as SettingsIcon, Shield, Ticket, Users2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { usePortalAccess } from "@/hooks/usePortalAccess";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
};

export function AccountMenu({
  settingsHref,
}: {
  /** Where "Settings" goes. Defaults to the attendee or the workspace
   *  settings page, whichever fits the account. */
  settingsHref?: string;
}) {
  const { user, isAdmin, accountType, signOut } = useAuth();
  const { memberships, myRole } = useOrg();
  const { data: portalAccess } = usePortalAccess();
  const navigate = useNavigate();
  // Two headers can be on screen at once (the site editor previews one), and
  // each needs a realtime channel of its own.
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Load the profile so the avatar / initials reflect the saved name rather
  // than always falling back to the first letter of the email.
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let cancelled = false;
    const load = () => {
      supabaseRpc("get_my_profile").then(({ data }) => {
        if (cancelled || !data) return;
        const p = data as Profile;
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
      .channel(`account-menu-profile-${user.id}-${channelId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user, channelId]);

  if (!user) return null;

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const displayName = profile?.display_name || fullName || user.email?.split("@")[0] || "Account";
  const initials = (fullName || displayName).split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A";
  const avatarUrl = profile?.avatar_url || null;

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="float-chip flex h-9 items-center gap-1.5 rounded-full pl-1 pr-2 transition-colors hover:bg-muted lg:h-10 lg:pl-1.5"
          aria-label="Account menu"
          title={displayName}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {initials}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2.5 py-2">
          <p className="truncate text-[13px] font-medium">{displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          <p className="text-[11px] capitalize text-muted-foreground">
            {isAdmin ? "Super admin" : (accountType || "attendee")}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/u/me/events"><Ticket className="mr-2 h-3.5 w-3.5" /> My tickets</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/u/me/applications"><ClipboardList className="mr-2 h-3.5 w-3.5" /> My applications</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/u/me/communities"><Users2 className="mr-2 h-3.5 w-3.5" /> My communities</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/community"><Users2 className="mr-2 h-3.5 w-3.5" /> Community</Link>
        </DropdownMenuItem>
        {/* Super admin: a dedicated Control Tower entry, only for the platform
            `admin` role. It goes straight to /dashboard/admin so it is never
            shadowed by the organiser dashboard's account-type redirect. */}
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/dashboard/admin"><Shield className="mr-2 h-3.5 w-3.5" /> Super admin</Link>
          </DropdownMenuItem>
        )}
        {/* Organiser / workspace surface. A distinct item even for admins who
            also run events, so they can switch between the Control Tower and
            the organiser dashboard in one click. It goes to /dashboard/events
            (not /dashboard) so admins bypass the DashboardLanding redirect
            that sends them to /dashboard/admin by default. */}
        {(accountType === "organizer" || isAdmin || memberships.length > 0) && (
          <DropdownMenuItem asChild>
            <Link to="/dashboard/events">
              <CalendarDays className="mr-2 h-3.5 w-3.5" />
              {isAdmin || accountType === "organizer"
                ? "Organizer dashboard"
                : myRole && myRole !== "owner"
                  ? `Workspace · ${myRole}`
                  : "Workspace dashboard"}
            </Link>
          </DropdownMenuItem>
        )}
        {(portalAccess?.has_speaker || accountType === "attendee" || accountType === "organizer" || isAdmin) && (
          <DropdownMenuItem asChild>
            <Link to="/speaker"><Mic className="mr-2 h-3.5 w-3.5" /> Speaker dashboard</Link>
          </DropdownMenuItem>
        )}
        {(portalAccess?.has_sponsor || accountType === "organizer" || accountType === "attendee" || isAdmin) && (
          <DropdownMenuItem asChild>
            <Link to="/sponsor"><Building2 className="mr-2 h-3.5 w-3.5" /> Sponsor dashboard</Link>
          </DropdownMenuItem>
        )}
        {/* Tracked links an organiser has shared with this account. */}
        <DropdownMenuItem asChild>
          <Link to="/partner"><Handshake className="mr-2 h-3.5 w-3.5" /> Partner dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={settingsHref ?? (accountType === "attendee" ? "/u/me/settings" : "/dashboard/settings")}>
            <SettingsIcon className="mr-2 h-3.5 w-3.5" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AccountMenu;
