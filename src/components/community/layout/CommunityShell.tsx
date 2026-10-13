import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppBack } from "@/lib/app-back";
import {
  LayoutDashboard, Settings, Radio, ClipboardList, Users, Award,
  CalendarCheck, Palette, Mail, Users2, BarChart3, FileText, ImagePlus,
  ArrowLeft,
} from "lucide-react";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { SectionPills } from "@/components/layout/ShellNotch";

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

/**
 * Standalone shell for the Community area. When the community is event-
 * scoped and the viewer can manage it, renders the same section pills as the
 * manage-event surface so navigation feels continuous. Either way the main
 * navigation is the row of chips floating at the top.
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
  const goBack = useAppBack(eventId ? `/dashboard/events/${eventId}` : "/community");

  return (
    <div className="app-shell shell-notch min-h-screen flex flex-col w-full">
      <DashboardTopBar notch />

      <div className="app-shell-panel flex-1 flex flex-col">
        {/* Event-context header: back arrow + event name — mirrors EventDetailPage header */}
        {eventId && (
          <>
            <header className="border-b border-border px-3 sm:px-5 py-3 flex items-center gap-2.5 min-w-0">
              <button onClick={goBack} className="shell-icon-btn shrink-0" aria-label="Back to event">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">Event</p>
                <p className="text-[17px] font-semibold tracking-tight truncate leading-tight">{eventTitle || "Event"}</p>
              </div>
            </header>
            {/* Community is the current section; the others deep-link back to
                the event manage page on the matching tab. */}
            <SectionPills
              label="Event sections"
              items={EVENT_NAV.map((item) => ({
                key: item.key,
                label: item.label,
                icon: item.icon,
                to: `/dashboard/events/${eventId}?tab=${item.key}`,
              }))}
              activeKey="community"
              className="border-b border-border px-3 sm:px-5 py-3"
            />
          </>
        )}

        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
