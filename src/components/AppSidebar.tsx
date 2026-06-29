import {
  Calendar, Settings, Ticket,
  Megaphone, FileText, HelpCircle, CreditCard, Layout, Users,
  ChevronsUpDown, Check,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const mainItems = [
  { title: "Events",    url: "/dashboard/events",    icon: Calendar   },
  { title: "Community", url: "/community",           icon: Users      },
  { title: "Reports",   url: "/dashboard/reports",   icon: FileText   },
];

const attendeeItems = [
  { title: "Tickets",   url: "/dashboard/tickets",   icon: Ticket  },
];

const manageItems = [
  { title: "Marketing",    url: "/dashboard/marketing",       icon: Megaphone },
  { title: "Landing Page", url: "/dashboard/landing-builder", icon: Layout    },
];



const bottomItems = [
  { title: "Billing",  url: "/dashboard/billing",  icon: CreditCard },
  { title: "Settings", url: "/dashboard/settings", icon: Settings   },
  { title: "Help",     url: "/dashboard/help",     icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { org, memberships, setActiveOrg, myRole } = useOrg();
  const planName = PLAN_DETAILS[org?.plan || "free"]?.name || "Free";

  const isActive = (path: string) => {
    // Events lives at /dashboard/events but / dashboard is the home redirect
    if (path === "/dashboard/events") {
      return (
        location.pathname === "/dashboard" ||
        location.pathname === "/dashboard/events" ||
        // keep highlighted when inside an event detail page
        location.pathname.startsWith("/dashboard/events/")
      );
    }
    return location.pathname.startsWith(path);
  };

  const renderItems = (items: typeof mainItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
          <NavLink
            to={item.url}
            end={item.url === "/dashboard"}
            className="h-8 px-2.5 text-[13px] rounded-md transition-colors duration-100 text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 font-medium"
            activeClassName="bg-secondary text-foreground font-semibold"
          >
            <item.icon className="h-[15px] w-[15px] shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon" className="app-chrome border-r border-border/60 bg-sidebar">
      <SidebarContent className="pb-2 flex flex-col" style={{ paddingTop: '78px' }}>
        {/* Workspace switcher */}
        {!collapsed && org && (
          <div className="mx-3 mb-2">
            {memberships.length <= 1 ? (
              // Single workspace — render a static label, no dropdown clutter.
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "hsl(var(--brand-blue))" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold truncate text-foreground">{org.name}</p>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {planName}{myRole && myRole !== "owner" ? ` · ${myRole}` : ""}
                  </span>
                </div>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                    aria-label="Switch workspace"
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                    ) : (
                      <span className="h-5 w-5 rounded bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold truncate text-foreground">{org.name}</p>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {planName}{myRole && myRole !== "owner" ? ` · ${myRole}` : ""}
                      </span>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    Switch workspace
                  </DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.org_id}
                      onClick={() => setActiveOrg(m.org_id)}
                      className="gap-2 cursor-pointer"
                    >
                      {m.org_logo_url ? (
                        <img src={m.org_logo_url} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                      ) : (
                        <span className="h-5 w-5 rounded bg-muted text-foreground font-semibold text-[11px] flex items-center justify-center shrink-0">
                          {m.org_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium truncate">{m.org_name}</p>
                        <p className="text-[10px] capitalize text-muted-foreground truncate">{m.role}</p>
                      </div>
                      {m.org_id === org.id && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="text-[12px]">
                    <NavLink to="/dashboard/settings">Manage workspaces</NavLink>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="h-6 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold px-3 mb-1">
            {!collapsed && "Main"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-1">{renderItems(mainItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 mx-3" />

        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="h-6 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold px-3 mb-1">
            {!collapsed && "People"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-1">{renderItems(attendeeItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-2 mx-3" />

        <SidebarGroup className="py-0">
          <SidebarGroupLabel className="h-6 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold px-3 mb-1">
            {!collapsed && "Manage"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-1">{renderItems(manageItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>



        <div className="mt-auto" />

        <SidebarSeparator className="my-2 mx-3" />

        <SidebarGroup className="py-0 pb-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 px-1">{renderItems(bottomItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}