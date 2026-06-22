import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users2, LayoutDashboard, Settings, Radio, ClipboardList,
  Users, Award, CalendarCheck, Palette, Mail, BarChart3
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/community/notifications/NotificationBell";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

type EventSidebarItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const EVENT_NAV: EventSidebarItem[] = [
  { key: "dashboard",     label: "Overview",      icon: LayoutDashboard },
  { key: "settings",      label: "Settings",      icon: Settings        },
  { key: "broadcast",     label: "Webinar",       icon: Radio           },
  { key: "manage",        label: "Speakers",      icon: ClipboardList   },
  { key: "registrations", label: "Registrations", icon: Users           },
  { key: "exhibitors",    label: "Sponsors",      icon: Award           },
  { key: "agenda",        label: "Agenda",        icon: CalendarCheck   },
  { key: "design",        label: "Design",        icon: Palette         },
  { key: "communicate",   label: "Communicate",   icon: Mail            },
  { key: "community",     label: "Community",     icon: Users2          },
  { key: "reports",       label: "Reports",       icon: BarChart3       },
];

function EventCommunitySidebar({ eventId, eventTitle }: { eventId: string; eventTitle?: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card">
      <SidebarContent className="pt-1">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Event</p>
            <p className="text-sm font-medium truncate mt-0.5">{eventTitle || "Event"}</p>
          </div>
        )}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {EVENT_NAV.map((item) => {
                const isActive = item.key === "community";
                // Community item stays inside the community shell; everything
                // else deep-links back into the manage-event page tab.
                const to =
                  item.key === "community"
                    ? "#"
                    : `/dashboard/events/${eventId}?tab=${item.key}`;
                return (
                  <SidebarMenuItem key={item.key}>
                    {item.key === "community" ? (
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        className="cursor-default h-8 text-[13px]"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className="h-8 text-[13px]"
                      >
                        <NavLink to={to}>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.label}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * Standalone shell for the Community area. When the community is event-
 * scoped and the viewer can manage it, renders the same left sidebar as the
 * manage-event surface so navigation feels continuous. Otherwise falls back
 * to the global AppSidebar (Events, Reports, Portals, Billing, ...).
 */
export function CommunityShell({
  children,
  eventId = null,
  eventTitle = null,
}: {
  children: ReactNode;
  eventId?: string | null;
  eventTitle?: string | null;
}) {
  const { content } = useSiteContent();
  const { theme: appTheme } = useTheme();
  const navigate = useNavigate();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex flex-col w-full">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="mx-auto max-w-7xl flex items-center gap-3 px-3 sm:px-4 h-12">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <span className="h-4 w-px bg-border" aria-hidden />
            <Link to="/community" className="inline-flex items-center gap-2 min-w-0">
              {activeLogoUrl ? (
                <img src={activeLogoUrl} alt={brandName} className="h-5 w-auto max-w-[120px] object-contain" />
              ) : (
                <span className="text-sm font-semibold tracking-tight truncate">{brandName}</span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5">
                <Users2 className="h-3 w-3" />
                Community
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle size="sm" />
            </div>
          </div>
        </header>

        <div className="flex flex-1 w-full min-w-0">
          {eventId ? (
            <EventCommunitySidebar eventId={eventId} eventTitle={eventTitle} />
          ) : (
            <AppSidebar />
          )}
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-4">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
