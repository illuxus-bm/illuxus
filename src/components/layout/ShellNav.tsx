/**
 * Navigation for the signed-in shell, in the header's centre slot
 * (AppHeaderBar). Nothing is joined into a bar: each main destination is its
 * own chip floating over the page (`float-chip`, index.css), as is the
 * workspace beside the logo. Also the row of pills pages use for their own
 * sections.
 */
import {
  Calendar, Settings, Ticket, Megaphone, FileText, HelpCircle, CreditCard,
  Building2, Users, MoreHorizontal, ChevronsUpDown, Check, Shield, BarChart3,
  Activity, DollarSign, Edit, ScrollText, Layers, Lock, Database, type LucideIcon,
} from "lucide-react";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { HeaderNavRoom } from "@/components/layout/header-nav-room";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HEADER_CHIP } from "@/components/layout/header-chip";
import { SoftScroll } from "@/components/event/creatives/studio/SoftScroll";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type NavItem = { title: string; url: string; icon: LucideIcon };

// One destination. `data-active` turns it dark (index.css).
const CHIP = cn(HEADER_CHIP, "min-w-9 lg:min-w-10");
// With its name showing it is a pill; with only its icon, a circle the size
// of its height. Only the current one may give way when a phone runs short.
const CHIP_NAMED = "px-2.5 max-lg:shrink-0 sm:px-3 2xl:px-3.5";
const CHIP_ICON = "shrink-0";
// Gaps between chips; the measuring rows below use the same.
const ROW_GAP = "gap-1 sm:gap-1.5 2xl:gap-2";
// A row too long for its space scrolls sideways, faded at the edges.
const ROW_SCROLL =
  "overflow-x-auto px-3 py-1 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * How the row is drawn:
 *   • `phone` — below `lg` the row has its own line: every name, scrolling.
 *   • `full` — every name fits beside the logo and the actions.
 *   • `compact` — only icons, the current destination keeping its name.
 *   • `scroll` — even that doesn't fit: icons, scrolling sideways.
 * From `lg` up it is chosen by measuring (HeaderNavRoom), not by breakpoint,
 * so it holds on 13" laptops, tablets in landscape, and with long names.
 */
type RowMode = "phone" | "full" | "compact" | "scroll";

/**
 * A surface's destinations: one floating chip each, the current one dark,
 * and the less-used ones behind a last "More" chip.
 */
function NavChips({
  label,
  main,
  more,
  isActive,
}: {
  /** What this navigates, for screen readers. */
  label: string;
  main: NavItem[];
  more: NavItem[];
  isActive: (url: string) => boolean;
}) {
  const moreActive = more.find((item) => isActive(item.url));
  const navRef = useRef<HTMLElement>(null);
  const activeUrl = [...main, ...more].find((item) => isActive(item.url))?.url;

  // What each layout needs, from two hidden copies of the row.
  const room = useContext(HeaderNavRoom);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const [needs, setNeeds] = useState<{ full: number; compact: number } | null>(null);
  useLayoutEffect(() => {
    const full = fullRef.current;
    const compact = compactRef.current;
    if (!full || !compact) return;
    const measure = () => {
      const next = { full: Math.ceil(full.scrollWidth), compact: Math.ceil(compact.scrollWidth) };
      setNeeds((prev) => (prev && prev.full === next.full && prev.compact === next.compact ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // Sizes change with the breakpoint paddings and once the web font loads.
    const observer = new ResizeObserver(measure);
    observer.observe(full);
    observer.observe(compact);
    return () => observer.disconnect();
  }, [activeUrl]);

  // Until measured, icons only: a guess that never overlaps the logo.
  const mode: RowMode =
    room === null ? "phone"
    : !needs || needs.compact > room ? (needs ? "scroll" : "compact")
    : needs.full <= room ? "full"
    : "compact";
  // Phone: names below `lg` only, so a wide header that hasn't been measured
  // (no ResizeObserver, say) still shows icons rather than overflowing.
  const named = (active: boolean) => active || mode === "full";
  const chipClass = (active: boolean) =>
    cn(
      CHIP,
      named(active) ? CHIP_NAMED : mode === "phone" ? "shrink-0 max-lg:px-3" : CHIP_ICON,
      // A scrolling row scrolls; nothing in it is squeezed.
      mode === "scroll" && "shrink-0",
    );
  const name = (active: boolean, title: string) =>
    named(active) ? (
      <span className={nameClass(active)}>{title}</span>
    ) : mode === "phone" ? (
      <span className="hidden whitespace-nowrap max-lg:inline">{title}</span>
    ) : (
      <span className="sr-only">{title}</span>
    );

  // A scrolling row: keep the current chip in view.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="page"], [data-active="true"]');
    if (!nav || !chip || nav.scrollWidth <= nav.clientWidth) return;
    const left = chip.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + chip.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = Math.max(0, left - 16);
    }
  }, [activeUrl, mode]);

  const nameClass = (active: boolean) =>
    active ? "min-w-0 truncate max-lg:overflow-visible max-lg:whitespace-nowrap" : "whitespace-nowrap";
  const moreItem = moreActive ?? { title: "More", icon: MoreHorizontal };

  // The hidden copies: plain spans, so they are never links, focusable or read out.
  const measureRow = (allNamed: boolean, ref: Ref<HTMLDivElement>) => (
    <div ref={ref} className={cn("flex w-max items-center", ROW_GAP)}>
      {[...main, moreItem].map((item, i) => {
        const showName = allNamed || (i < main.length ? isActive((item as NavItem).url) : !!moreActive);
        return (
          <span key={i} className={cn(CHIP, showName ? CHIP_NAMED : CHIP_ICON)}>
            <item.icon className="h-4 w-4 shrink-0" />
            {showName && <span className="whitespace-nowrap">{item.title}</span>}
          </span>
        );
      })}
    </div>
  );

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 -z-10 h-0 w-0 overflow-hidden max-lg:hidden">
        {measureRow(true, fullRef)}
        {measureRow(false, compactRef)}
      </div>
      <nav
        ref={navRef}
        aria-label={label}
        data-mode={mode}
        className={cn(
          "app-chrome flex min-w-0 max-w-full items-center",
          ROW_GAP,
          mode === "phone" &&
            "max-lg:-mx-3 max-lg:w-[calc(100%+1.5rem)] max-lg:max-w-none max-lg:justify-start max-lg:gap-2 max-lg:overflow-x-auto max-lg:px-3 max-lg:py-1 max-lg:[mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] max-lg:[scrollbar-width:none] sm:max-lg:-mx-4 sm:max-lg:w-[calc(100%+2rem)] sm:max-lg:px-4 [&::-webkit-scrollbar]:hidden",
          mode === "scroll" && cn(ROW_SCROLL, "-my-1 justify-start"),
        )}
      >
        {main.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              title={item.title}
              aria-current={active ? "page" : undefined}
              data-active={active}
              className={chipClass(active)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {name(active, item.title)}
            </Link>
          );
        })}

        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="More"
                data-active={!!moreActive}
                className={chipClass(!!moreActive)}
              >
                <moreItem.icon className="h-4 w-4 shrink-0" />
                {name(!!moreActive, moreItem.title)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {more.map((item) => (
                <DropdownMenuItem key={item.url} asChild>
                  <Link to={item.url}>
                    <item.icon className="mr-2 h-3.5 w-3.5" /> {item.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </>
  );
}

const organiserMain: NavItem[] = [
  { title: "Events",       url: "/dashboard/events",       icon: Calendar  },
  { title: "Tickets",      url: "/dashboard/tickets",      icon: Ticket    },
  { title: "Community",    url: "/community",              icon: Users     },
  { title: "Marketing",    url: "/dashboard/marketing",    icon: Megaphone },
  { title: "Reports",      url: "/dashboard/reports",      icon: FileText  },
  { title: "Organization", url: "/dashboard/organization", icon: Building2 },
];

const organiserMore: NavItem[] = [
  { title: "Billing",  url: "/dashboard/billing",  icon: CreditCard },
  { title: "Settings", url: "/dashboard/settings", icon: Settings   },
  { title: "Help",     url: "/dashboard/help",     icon: HelpCircle },
];

/** The organiser's main navigation. */
export function OrganiserNav() {
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
  const main = role === "viewer" ? organiserMain.filter((item) => item.title !== "Marketing") : organiserMain;
  const more = organiserMore.filter((item) => item.title !== "Billing" || isOwnerOrAdmin);

  const isActive = (url: string) => {
    // Events lives at /dashboard/events but /dashboard is the home redirect;
    // it also stays lit inside an event's own pages.
    if (url === "/dashboard/events") return pathname === "/dashboard" || pathname.startsWith("/dashboard/events");
    return pathname.startsWith(url);
  };

  return <NavChips label="Main" main={main} more={more} isActive={isActive} />;
}

// The SaaS owner's daily workflow first (overview, then orgs, events and
// revenue); the two settings pages sit behind "More". Routes for pages that
// are not listed (support tickets, system health, users) stay registered in
// App.tsx, so a bookmarked URL still resolves.
const adminMain: NavItem[] = [
  { title: "Control Tower", url: "/dashboard/admin",               icon: Shield     },
  { title: "Analytics",     url: "/dashboard/admin/analytics",     icon: BarChart3  },
  { title: "Activity Feed", url: "/dashboard/admin/activity",      icon: Activity   },
  { title: "Organizations", url: "/dashboard/admin/organizations", icon: Building2  },
  { title: "Intelligence",  url: "/dashboard/admin/intelligence",  icon: Database   },
  { title: "Plans",         url: "/dashboard/admin/plans",         icon: Layers     },
  { title: "Events",        url: "/dashboard/admin/events",        icon: Calendar   },
  { title: "Revenue",       url: "/dashboard/admin/revenue",       icon: DollarSign },
];

const adminMore: NavItem[] = [
  { title: "Site Editor", url: "/dashboard/admin/site",  icon: Edit       },
  { title: "Audit Log",   url: "/dashboard/admin/audit", icon: ScrollText },
];

/** The super admin's navigation, on `/dashboard/admin/*`. */
export function AdminNav() {
  const { pathname } = useLocation();
  const isActive = (url: string) =>
    url === "/dashboard/admin" ? pathname === "/dashboard/admin" : pathname.startsWith(url);
  return <NavChips label="Super admin" main={adminMain} more={adminMore} isActive={isActive} />;
}

/** The active workspace, beside the account menu. A menu when there is more than one. */
export function WorkspaceChip() {
  const { org, memberships, setActiveOrg, myRole, entitlements } = useOrg();
  if (!org) return null;
  const planName = entitlements?.plan_name || PLAN_DETAILS[org.plan || "free"]?.name || "Free";
  const sub = `${planName}${myRole && myRole !== "owner" ? ` · ${myRole}` : ""}`;

  const face = (
    <>
      {org.logo_url ? (
        <img src={org.logo_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {org.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden min-w-0 text-left lg:block">
        <span className="block max-w-[9rem] truncate text-[12px] font-semibold leading-tight text-foreground">{org.name}</span>
        <span className="block truncate text-[10px] font-medium uppercase leading-tight tracking-wider text-muted-foreground">{sub}</span>
      </span>
    </>
  );
  const chip = "float-chip flex h-9 min-w-0 items-center gap-2 rounded-full pl-[5px] pr-[5px] lg:h-10 lg:pl-[7px] lg:pr-3.5";

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
      <DropdownMenuContent align="end" className="w-56">
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

/** `locked`: not on the plan — still selectable, shown with a lock. */
export type SectionPill = { key: string; label: string; icon?: LucideIcon; to?: string; locked?: boolean };

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
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );
  // One line at every width. The row scrolls sideways when it doesn't fit;
  // SoftScroll fades the cut-off edge, adds arrows for mouse users and keeps
  // the current pill in view.
  return (
    <nav aria-label={label} className={cn("app-chrome", className)}>
      <SoftScroll arrows activeKey={activeKey} className="flex gap-2 overflow-x-auto p-0.5">
      {items.map((item) => {
        const active = item.key === activeKey;
        const content = (
          <>
            {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
            {item.label}
            {item.locked && (
              <>
                <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                <span className="sr-only">(not on your plan)</span>
              </>
            )}
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
      </SoftScroll>
    </nav>
  );
}
