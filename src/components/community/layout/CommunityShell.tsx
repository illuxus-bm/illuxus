import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Users2, LayoutDashboard, Settings, Radio, ClipboardList,
  Users, Award, CalendarCheck, Palette, Mail, BarChart3
} from "lucide-react";
import { DashboardTopBar } from "@/components/DashboardTopBar";
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
      <SidebarContent className="pt-1" style={{ paddingTop: '78px' }}>
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
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex flex-col w-full">
        {/* Standard organizer top bar — keeps profile dropdown, search,
            notifications, and brand consistent across the whole dashboard. */}
        <DashboardTopBar />

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
