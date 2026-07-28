import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Settings, Radio, ClipboardList, Users, Award,
  CalendarCheck, Palette, Mail, Users2, BarChart3, FileText, ImagePlus,
  ArrowLeft,
} from "lucide-react";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

// Mirrors EventDetailPage's sidebarNav exactly so the community view
// stays in the same visual context as the rest of event management.
const EVENT_NAV = [
  { label: "Overview",      icon: LayoutDashboard, key: "dashboard"     },
  { label: "Settings",      icon: Settings,        key: "settings"      },
  { label: "Webinar",       icon: Radio,           key: "broadcast"     },
  { label: "Speakers",      icon: ClipboardList,   key: "manage"        },
  { label: "Registrations", icon: Users,           key: "registrations" },
  { label: "Sponsors",      icon: Award,           key: "exhibitors"    },
  { label: "Agenda",        icon: CalendarCheck,   key: "agenda"        },
  { label: "Design",        icon: Palette,         key: "design"        },
  { label: "Communicate",   icon: Mail,            key: "communicate"   },
  { label: "Community",     icon: Users2,          key: "community"     },
  { label: "Creatives",     icon: ImagePlus,       key: "creatives"     },
  { label: "Brochure",      icon: FileText,        key: "brochure"      },
  { label: "UTM / Links",   icon: BarChart3,       key: "utm"           },
  { label: "Reports",       icon: BarChart3,       key: "reports"       },
] as const;

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
                // Community is the current active tab — it doesn't navigate away.
                // All other items deep-link back to the event manage page on
                // the correct tab, preserving the nav context.
                const isActive = item.key === "community";
                const to = isActive
                  ? "#"
                  : `/dashboard/events/${eventId}?tab=${item.key}`;
                return (
                  <SidebarMenuItem key={item.key}>
                    {isActive ? (
                      <SidebarMenuButton
                        isActive
                        tooltip={item.label}
                        className="cursor-default h-8 text-[13px]"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton asChild tooltip={item.label} className="h-8 text-[13px]">
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
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex flex-col w-full">
        <DashboardTopBar />

        <div className="flex flex-1 w-full min-w-0">
          {eventId ? (
            <EventCommunitySidebar eventId={eventId} eventTitle={eventTitle} />
          ) : (
            <AppSidebar />
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {/* Event-context header: back arrow + event name — mirrors EventDetailPage header */}
            {eventId && (
              <header className="border-b border-border bg-card/80 px-3 sm:px-4 py-2.5 flex items-center gap-2 min-w-0">
                <SidebarTrigger className="h-7 w-7" aria-label="Toggle event sidebar" />
                <button
                  onClick={() => {
                    if (window.history.length > 1) {
                      navigate(-1);
                    } else {
                      navigate(`/dashboard/events/${eventId}`, { replace: true });
                    }
                  }}
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                  aria-label="Back to event"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">Event</p>
                  <p className="text-sm font-semibold truncate leading-tight">{eventTitle || "Event"}</p>
                </div>
              </header>
            )}

            <main className="flex-1 min-w-0 overflow-y-auto">
              <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-4">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
