/**
 * Top navigation for the signed-in shell. Nothing is joined into a bar: each
 * main destination is its own chip floating over the page (`shell-float`,
 * index.css), as is the workspace beside the logo. Also the row of pills
 * pages use for their own sections.
 */
import {
  Calendar, Settings, Ticket, Megaphone, FileText, HelpCircle, CreditCard,
  Building2, Users, MoreHorizontal, ChevronsUpDown, Check, type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavItem = { title: string; url: string; icon: LucideIcon };

const mainItems: NavItem[] = [
  { title: "Events",       url: "/dashboard/events",       icon: Calendar  },
  { title: "Tickets",      url: "/dashboard/tickets",      icon: Ticket    },
  { title: "Community",    url: "/community",              icon: Users     },
  { title: "Marketing",    url: "/dashboard/marketing",    icon: Megaphone },
  { title: "Reports",      url: "/dashboard/reports",      icon: FileText  },
  { title: "Organization", url: "/dashboard/organization", icon: Building2 },
];

const moreItems: NavItem[] = [
  { title: "Billing",  url: "/dashboard/billing",  icon: CreditCard },
  { title: "Settings", url: "/dashboard/settings", icon: Settings   },
  { title: "Help",     url: "/dashboard/help",     icon: HelpCircle },
];

// One destination. `data-active` turns it dark (index.css).
const CHIP =
  "shell-float inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-10 lg:min-w-10";
// With its name showing it is a pill; with only its icon, a circle the size
// of its height. Only the current one may give way when a phone runs short.
const CHIP_NAMED = "px-2.5 sm:px-3 2xl:px-3.5";
const CHIP_ICON = "shrink-0 xl:px-3 2xl:px-3.5";

/**
 * The organiser's main navigation: one floating chip per destination, the
 * current one dark. Labels show on wide screens; on narrower ones each
 * destination is its icon and only the current one keeps its name, which
 * shortens before the row would ever run off a phone.
 */
export function OrganiserNotch() {
  const { pathname } = useLocation();
  const { myRole } = useOrg();

  // Role-based nav scoping. Viewers can only read — hide the write-heavy
  // surfaces (marketing campaigns, billing) so the nav matches what they're
  // actually allowed to do. RLS migration 012 enforces the same on the
  // server. Owner / admin / member see everything; unknown / null roles
  // default to the safe "everything visible" path so legacy
  // attendee+organizer flows continue to work.
  const role = myRole ?? "owner";
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  // Viewers keep Organization: it is where they read the details and brand kit.
  const visibleMain = role === "viewer" ? mainItems.filter((item) => item.title !== "Marketing") : mainItems;
  const visibleMore = moreItems.filter((item) => item.title !== "Billing" || isOwnerOrAdmin);

  const isActive = (url: string) => {
    // Events lives at /dashboard/events but /dashboard is the home redirect;
    // it also stays lit inside an event's own pages.
    if (url === "/dashboard/events") return pathname === "/dashboard" || pathname.startsWith("/dashboard/events");
    return pathname.startsWith(url);
  };
  const moreActive = visibleMore.find((item) => isActive(item.url));

  return (
    <nav aria-label="Main" className="app-chrome flex min-w-0 max-w-full items-center gap-1 sm:gap-1.5 2xl:gap-2">
      {visibleMain.map((item) => {
        const active = isActive(item.url);
        return (
          <Link
            key={item.url}
            to={item.url}
            title={item.title}
            aria-current={active ? "page" : undefined}
            data-active={active}
            className={cn(CHIP, active ? CHIP_NAMED : CHIP_ICON)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className={active ? "min-w-0 truncate" : "hidden xl:inline"}>{item.title}</span>
          </Link>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" title="More" data-active={!!moreActive} className={cn(CHIP, moreActive ? CHIP_NAMED : CHIP_ICON)}>
            {moreActive ? <moreActive.icon className="h-4 w-4 shrink-0" /> : <MoreHorizontal className="h-4 w-4 shrink-0" />}
            <span className={moreActive ? "min-w-0 truncate" : "hidden xl:inline"}>{moreActive ? moreActive.title : "More"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {visibleMore.map((item) => (
            <DropdownMenuItem key={item.url} asChild>
              <Link to={item.url}>
                <item.icon className="mr-2 h-3.5 w-3.5" /> {item.title}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

/** The active workspace, beside the logo. A menu when there is more than one. */
export function WorkspaceChip() {
  const { org, memberships, setActiveOrg, myRole } = useOrg();
  if (!org) return null;
  const planName = PLAN_DETAILS[org.plan || "free"]?.name || "Free";
  const sub = `${planName}${myRole && myRole !== "owner" ? ` · ${myRole}` : ""}`;

  const face = (
    <>
      {org.logo_url ? (
        <img src={org.logo_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
          {org.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden min-w-0 text-left lg:block">
        <span className="block max-w-[9rem] truncate text-[12px] font-semibold leading-tight text-foreground">{org.name}</span>
        <span className="block truncate text-[10px] font-medium uppercase leading-tight tracking-wider text-muted-foreground">{sub}</span>
      </span>
    </>
  );
  const chip = "shell-float flex h-9 min-w-0 items-center gap-2 rounded-full pl-[5px] pr-[5px] lg:h-10 lg:pl-[7px] lg:pr-3.5";

  // Single workspace — a static label, no dropdown clutter.
  if (memberships.length <= 1) {
    return <div className={chip} title={`${org.name} · ${sub}`}>{face}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(chip, "transition-colors hover:bg-muted")} aria-label="Switch workspace">
          {face}
          <ChevronsUpDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Switch workspace
        </DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.org_id} onClick={() => setActiveOrg(m.org_id)} className="cursor-pointer gap-2">
            {m.org_logo_url ? (
              <img src={m.org_logo_url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold text-foreground">
                {m.org_name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">{m.org_name}</p>
              <p className="truncate text-[10px] capitalize text-muted-foreground">{m.role}</p>
            </div>
            {m.org_id === org.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-[12px]">
          <Link to="/dashboard/organization">Manage organization</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type SectionPill = { key: string; label: string; icon?: LucideIcon; to?: string };

/**
 * A page's own sections as a row of white pills; the current one is dark.
 * Items with `to` are links, the rest call `onSelect`.
 */
export function SectionPills({
  items,
  activeKey,
  onSelect,
  label,
  className,
}: {
  items: SectionPill[];
  activeKey: string;
  onSelect?: (key: string) => void;
  /** What the pills switch between, for screen readers. */
  label: string;
  className?: string;
}) {
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label={label} className={cn("app-chrome flex gap-2 overflow-x-auto md:flex-wrap md:overflow-visible", className)}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const content = (
          <>
            {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
            {item.label}
          </>
        );
        return item.to && !active ? (
          <Link key={item.key} to={item.to} className={pill(false)}>{content}</Link>
        ) : (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect?.(item.key)}
            className={pill(active)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
