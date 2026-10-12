import {
  Calendar, Settings, Ticket,
  Megaphone, FileText, HelpCircle, CreditCard, Layout, Users,
  ChevronsUpDown, Check, type LucideIcon,
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

type NavItem = { title: string; hint: string; url: string; icon: LucideIcon };

// Grouped by the job the organiser is doing, in the order an event runs:
// plan it, fill it, promote it, then measure it.
const planItems: NavItem[] = [
  { title: "Events", hint: "Create and manage events", url: "/dashboard/events", icon: Calendar },
];

const peopleItems: NavItem[] = [
  { title: "Tickets",   hint: "Sales and attendees",    url: "/dashboard/tickets", icon: Ticket },
  { title: "Community", hint: "Talk to your audience",  url: "/community",         icon: Users  },
];

const promoteItems: NavItem[] = [
  { title: "Marketing",    hint: "Campaigns and emails",  url: "/dashboard/marketing",       icon: Megaphone },
  { title: "Landing Page", hint: "Design your public page", url: "/dashboard/landing-builder", icon: Layout    },
];

const measureItems: NavItem[] = [
  { title: "Reports", hint: "Numbers and exports", url: "/dashboard/reports", icon: FileText },
];

const accountItems: NavItem[] = [
  { title: "Billing",  hint: "Plan and invoices",   url: "/dashboard/billing",  icon: CreditCard },
  { title: "Settings", hint: "Workspace and team",  url: "/dashboard/settings", icon: Settings   },
  { title: "Help",     hint: "Guides and support",  url: "/dashboard/help",     icon: HelpCircle },
];

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  // The mobile sheet is always full width, whatever the desktop rail is set to.
  const collapsed = state === "collapsed" && !isMobile;
  const location = useLocation();
  const { org, memberships, setActiveOrg, myRole } = useOrg();
  const planName = PLAN_DETAILS[org?.plan || "free"]?.name || "Free";

  // Role-based nav scoping. Viewers can only read — hide the write-heavy
  // surfaces (marketing campaigns, landing page editor, billing) so the
  // sidebar matches what they're actually allowed to do. RLS migration 012
  // enforces the same on the server. Owner / admin / member see everything;
  // unknown / null roles default to the safe "everything visible" path so
  // legacy attendee+organizer flows continue to work.
  const role = myRole ?? "owner";
  const isViewer = role === "viewer";
  const isOwnerOrAdmin = role === "owner" || role === "admin";

  const visiblePromoteItems = isViewer ? [] : promoteItems;
  const visibleAccountItems = accountItems.filter((item) => {
    if (item.title === "Billing") return isOwnerOrAdmin;
    return true;
  });

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

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          isActive={isActive(item.url)}
          tooltip={item.title}
          className="group/nav h-auto gap-2.5 rounded-xl px-2 py-1.5 text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground data-[active=true]:bg-secondary data-[active=true]:text-foreground"
        >
          <NavLink to={item.url} end={item.url === "/dashboard"}>
            {collapsed ? (
              <item.icon className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-background transition-colors group-data-[active=true]/nav:border-accent/45 group-data-[active=true]/nav:bg-accent/10 group-data-[active=true]/nav:text-accent">
                  <item.icon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{item.title}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">{item.hint}</p>
                </div>
              </>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  const renderGroup = (label: string, items: NavItem[]) =>
    items.length > 0 && (
      <SidebarGroup className="py-0">
        {!collapsed && (
          <SidebarGroupLabel className="eyebrow mb-0.5 mt-3 h-6 px-3 !text-[10px] text-muted-foreground/70">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5 px-1">{renderItems(items)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );

  return (
    <Sidebar collapsible="icon" className="app-chrome border-r border-border/60 bg-sidebar">
      <SidebarContent className="pt-3 pb-2 flex flex-col">
        {/* Workspace switcher */}
        {!collapsed && org && (
          <div className="mx-3 mb-1 rounded-xl border border-border bg-background p-1">
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

        {renderGroup("Plan", planItems)}
        {renderGroup("People", peopleItems)}
        {renderGroup("Promote", visiblePromoteItems)}
        {renderGroup("Measure", measureItems)}

        <div className="mt-auto" />

        <SidebarSeparator className="mx-3 mt-3" />

        <div className="pb-1">{renderGroup("Account", visibleAccountItems)}</div>
      </SidebarContent>
    </Sidebar>
  );
}