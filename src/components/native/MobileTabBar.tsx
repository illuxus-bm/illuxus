import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3, Building2, Calendar, ClipboardList, Compass, CreditCard, HelpCircle, LayoutGrid,
  LogIn, LogOut, Megaphone, Monitor, Moon, Palette, Settings, Sun, Ticket, User, Users, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAppTabBar, type TabSet } from "@/hooks/useAppChrome";
import { hapticSelection } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

type Tab = { title: string; url: string; icon: LucideIcon; match?: (pathname: string) => boolean };

const under = (...prefixes: string[]) => (pathname: string) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const TABS: Record<TabSet, Tab[]> = {
  organiser: [
    { title: "Events", url: "/dashboard/events", icon: Calendar, match: (p) => p === "/dashboard" || under("/dashboard/events")(p) },
    { title: "Tickets", url: "/dashboard/tickets", icon: Ticket },
    { title: "Community", url: "/community", icon: Users },
    { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
  ],
  attendee: [
    { title: "Discover", url: "/discover", icon: Compass, match: under("/discover", "/events", "/org") },
    { title: "My events", url: "/u/me/events", icon: Ticket, match: under("/u/me/events", "/t") },
    { title: "Community", url: "/community", icon: Users, match: under("/community", "/u/me/communities") },
    { title: "Profile", url: "/u/me", icon: User, match: (p) => p === "/u/me" || under("/u/me/settings", "/u/me/applications")(p) },
  ],
  guest: [
    { title: "Discover", url: "/discover", icon: Compass, match: under("/discover", "/org") },
    { title: "Events", url: "/events", icon: Calendar },
    { title: "Sign in", url: "/login", icon: LogIn },
  ],
};

/** The organiser's "More" sheet. */
function useMoreItems(): { workspace: Tab[]; you: Tab[] } {
  const { myRole } = useOrg();
  const role = myRole ?? "owner";
  const workspace: Tab[] = [
    ...(role === "viewer" ? [] : [{ title: "Marketing", url: "/dashboard/marketing", icon: Megaphone }]),
    { title: "Organization", url: "/dashboard/organization", icon: Building2 },
    ...(role === "owner" || role === "admin" ? [{ title: "Billing", url: "/dashboard/billing", icon: CreditCard }] : []),
    { title: "Settings", url: "/dashboard/settings", icon: Settings },
    { title: "Help", url: "/dashboard/help", icon: HelpCircle },
  ];
  const you: Tab[] = [
    { title: "Discover", url: "/discover", icon: Compass },
    { title: "My tickets", url: "/u/me/events", icon: Ticket },
    { title: "Applications", url: "/u/me/applications", icon: ClipboardList },
    { title: "Profile", url: "/u/me", icon: User, match: (p) => p === "/u/me" },
  ];
  return { workspace, you };
}

const isOn = (tab: Tab, pathname: string) => (tab.match ? tab.match(pathname) : under(tab.url)(pathname));

const TAB = "app-tab group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 focus-visible:outline-none";

/** A tab's icon, in a pill that fills when it is the current one, over its name. */
function TabFace({ icon: Icon, title, active }: { icon: LucideIcon; title: string; active: boolean }) {
  return (
    <>
      <span
        className={cn(
          "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground group-active:bg-muted",
        )}
      >
        <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 1.9} />
      </span>
      <span className={cn("max-w-full truncate text-[10.5px] leading-none tracking-tight", active ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
        {title}
      </span>
    </>
  );
}

function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { preference, setTheme } = useTheme();
  const { workspace, you } = useMoreItems();

  // `wide`: icon beside the name, for the two-column rows.
  const tile = (item: Tab, wide = false) => {
    const active = isOn(item, pathname);
    return (
      <Link
        key={item.url}
        to={item.url}
        onClick={() => { hapticSelection(); onOpenChange(false); }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center rounded-2xl border text-[12px] font-medium transition-colors active:scale-[0.97]",
          wide ? "gap-2.5 px-3.5 py-3 text-[13px]" : "flex-col gap-2 px-2 py-3.5 text-center",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
        )}
      >
        <item.icon className="h-5 w-5" />
        <span className="max-w-full truncate">{item.title}</span>
      </Link>
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="app-chrome rounded-t-[28px] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="px-5 pt-3">
          <DrawerTitle className="text-[17px] font-semibold tracking-tight">More</DrawerTitle>
          <DrawerDescription className="sr-only">Everything else in your workspace and your own pages</DrawerDescription>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-5 pb-2">
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
          <div className="grid grid-cols-3 gap-2.5">{workspace.map((item) => tile(item))}</div>
          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You</p>
          <div className="grid grid-cols-2 gap-2.5">{you.map((item) => tile(item, true))}</div>

          <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {/* Appearance, as a settings row with a segmented control, the way
                both platforms present it. "Device" follows the system setting. */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Palette className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
              <span id="appearance-label" className="flex-1 text-[14px] font-medium">Appearance</span>
              <div role="radiogroup" aria-labelledby="appearance-label" className="flex rounded-full bg-muted p-0.5">
                {([
                  { value: "light", label: "Light", icon: Sun },
                  { value: "system", label: "Device", icon: Monitor },
                  { value: "dark", label: "Dark", icon: Moon },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={preference === value}
                    onClick={() => { hapticSelection(); setTheme(value); }}
                    className={cn(
                      "flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors",
                      preference === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {user && (
              <button
                type="button"
                onClick={async () => { onOpenChange(false); await signOut(); navigate("/", { replace: true }); }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-destructive active:bg-muted"
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span className="flex-1">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The app's bottom navigation on phones and tablets: a floating capsule
 * docked above the home indicator, in the same floating-chip language as the
 * header. Only in the iOS / Android app and the installed PWA (a browser tab
 * keeps the header's navigation), and not in full-screen flows
 * (useAppTabBar).
 *
 * While it shows, `html.has-tab-bar` keeps page content, toasts and the
 * cookie banner clear of it (index.css), and the headers leave out the
 * destinations it carries.
 */
export function MobileTabBar() {
  const { visible, set } = useAppTabBar();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { workspace, you } = useMoreItems();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("has-tab-bar", visible);
    return () => root.classList.remove("has-tab-bar");
  }, [visible]);

  // A route change closes the sheet (e.g. a link inside it, or Back).
  useEffect(() => setMoreOpen(false), [pathname]);

  if (!visible) return null;

  const tabs = TABS[set];
  const moreActive = set === "organiser" && !tabs.some((t) => isOn(t, pathname)) && [...workspace, ...you].some((t) => isOn(t, pathname));

  return (
    <>
      <nav aria-label="App" className="app-tab-bar app-chrome">
        {tabs.map((tab) => {
          const active = isOn(tab, pathname);
          return (
            <Link key={tab.url} to={tab.url} onClick={() => { if (!active) hapticSelection(); }} aria-current={active ? "page" : undefined} className={TAB}>
              <TabFace icon={tab.icon} title={tab.title} active={active} />
            </Link>
          );
        })}
        {set === "organiser" && (
          <button
            type="button"
            onClick={() => { hapticSelection(); setMoreOpen(true); }}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={TAB}
          >
            <TabFace icon={LayoutGrid} title="More" active={moreActive} />
          </button>
        )}
      </nav>
      {set === "organiser" && <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />}
    </>
  );
}
