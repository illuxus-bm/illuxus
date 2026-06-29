/**
 * AdminSidebar — dedicated sidebar for the Super Admin (SaaS owner).
 *
 * Completely separate from AppSidebar so there is zero confusion between
 * the platform owner's control tower and the organiser dashboard.
 * Mounted only when isAdmin === true.
 */
import {
  Shield, Users, Building2, Calendar, DollarSign, Activity,
  ScrollText, Mail, Heart, Edit, BarChart3, Settings, LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

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

const adminNavItems = [
  {
    group: "Overview",
    items: [
      { title: "Control Tower",   url: "/dashboard/admin",              icon: Shield     },
      { title: "Analytics",       url: "/dashboard/admin/analytics",    icon: BarChart3  },
      { title: "Activity Feed",   url: "/dashboard/admin/activity",     icon: Activity   },
      { title: "Audit Log",       url: "/dashboard/admin/audit",        icon: ScrollText },
    ],
  },
  {
    group: "Platform",
    items: [
      { title: "Users",           url: "/dashboard/admin/users",        icon: Users      },
      { title: "Organizations",   url: "/dashboard/admin/organizations", icon: Building2 },
      { title: "Events",          url: "/dashboard/admin/events",       icon: Calendar   },
      { title: "Revenue",         url: "/dashboard/admin/revenue",      icon: DollarSign },
    ],
  },
  {
    group: "Support",
    items: [
      { title: "Support Tickets", url: "/dashboard/admin/tickets",      icon: Mail       },
      { title: "System Health",   url: "/dashboard/admin/system",       icon: Heart      },
    ],
  },
  {
    group: "Config",
    items: [
      { title: "Site Editor",     url: "/dashboard/admin/site",         icon: Edit       },
    ],
  },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const isActive = (url: string) =>
    url === "/dashboard/admin"
      ? location.pathname === "/dashboard/admin"
      : location.pathname.startsWith(url);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60 bg-sidebar">
      <SidebarContent className="pb-2 flex flex-col" style={{ paddingTop: "78px" }}>

        {/* Super admin identity badge */}
        {!collapsed && (
          <div className="mx-3 mb-3 px-2 py-2 rounded-lg bg-destructive/8 border border-destructive/20">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-destructive shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-destructive">Super Admin</p>
                <p className="text-[10px] text-muted-foreground truncate">Platform Control Tower</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav groups */}
        {adminNavItems.map((group, gi) => (
          <div key={group.group}>
            {gi > 0 && <SidebarSeparator className="my-2 mx-3" />}
            <SidebarGroup className="py-0">
              <SidebarGroupLabel className="h-6 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-bold px-3 mb-1">
                {!collapsed && group.group}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 px-1">
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url)}
                        tooltip={item.title}
                      >
                        <NavLink
                          to={item.url}
                          className="h-8 px-2.5 text-[13px] rounded-md transition-colors duration-100 text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 font-medium"
                          activeClassName="bg-secondary text-foreground font-semibold"
                        >
                          <item.icon className="h-[15px] w-[15px] shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}

        <div className="mt-auto" />

        <SidebarSeparator className="my-2 mx-3" />

        {/* Bottom: settings + sign out */}
        <SidebarGroup className="py-0 pb-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-1">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Settings">
                  <NavLink
                    to="/dashboard/settings"
                    className="h-8 px-2.5 text-[13px] rounded-md transition-colors duration-100 text-muted-foreground hover:text-foreground hover:bg-secondary gap-2 font-medium"
                    activeClassName="bg-secondary text-foreground font-semibold"
                  >
                    <Settings className="h-[15px] w-[15px] shrink-0" />
                    {!collapsed && <span>Settings</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Sign out" onClick={handleSignOut}>
                  <LogOut className="h-[15px] w-[15px] shrink-0 text-destructive" />
                  {!collapsed && <span className="text-destructive text-[13px] font-medium">Sign out</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
