import { motion } from "framer-motion";
import { useState } from "react";
import {
  Calendar, Clock, MapPin, ArrowRight, Plus, Search,
  CheckCircle2, Ticket, LayoutDashboard, Users2,
  Settings, BarChart2, Mic2, Building2, Bell,
} from "lucide-react";

/**
 * `<DashboardMockup>` — a pixel-faithful dummy of the illuxus organizer
 * dashboard. Mirrors the real EventsPage layout (sidebar, top-bar, tab filter,
 * event cards with cover + status badge + action row) but every interaction
 * is local state only — nothing touches the backend.
 *
 * Two floating notification popovers drift around it via framer-motion.
 */

const DUMMY_EVENTS = [
  {
    id: "1",
    title: "Founder Summit 2026",
    venue: "Taj Lands End",
    location: "Mumbai",
    date: "2026-08-14T09:00:00",
    status: "published",
    capacity: 1200,
    tickets_sold: 1048,
    price: 149,
    cover: "from-indigo-500/30 to-purple-600/20",
    tab: "upcoming",
  },
  {
    id: "2",
    title: "Helios Robotics Demo Day",
    venue: "NSRCEL, IIM Bangalore",
    location: "Bengaluru",
    date: "2026-09-22T10:00:00",
    status: "published",
    capacity: 400,
    tickets_sold: 312,
    price: 0,
    cover: "from-emerald-500/30 to-cyan-600/20",
    tab: "upcoming",
  },
  {
    id: "3",
    title: "Brooklyn Climate Salon",
    venue: "Industry City",
    location: "New York",
    date: "2026-07-05T18:00:00",
    status: "draft",
    capacity: 150,
    tickets_sold: 0,
    price: 25,
    cover: "from-amber-500/30 to-orange-600/20",
    tab: "pending",
  },
  {
    id: "4",
    title: "CFO Connect — 13th Edition",
    venue: "The Leela",
    location: "Delhi",
    date: "2026-06-25T09:00:00",
    status: "completed",
    capacity: 600,
    tickets_sold: 588,
    price: 299,
    cover: "from-pink-500/30 to-rose-600/20",
    tab: "past",
  },
];

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  draft:     "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/50",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const NAV = [
  { icon: LayoutDashboard, label: "Events",     active: true  },
  { icon: Ticket,          label: "Tickets",    active: false },
  { icon: Users2,          label: "Attendees",  active: false },
  { icon: Mic2,            label: "Speakers",   active: false },
  { icon: Building2,       label: "Sponsors",   active: false },
  { icon: BarChart2,       label: "Reports",    active: false },
  { icon: Settings,        label: "Settings",   active: false },
];

export function DashboardMockup() {
  const [tab, setTab] = useState<"upcoming" | "pending" | "past">("upcoming");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const visible = DUMMY_EVENTS.filter((e) => e.tab === tab);

  return (
    <div className="relative mx-auto w-full max-w-[960px]">

      {/* ── Floating popover: ticket sold ── */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ duration: 0.8, delay: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -left-4 top-16 z-20 hidden lg:block"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="motion-reduce:!transform-none"
        >
          <div className="w-[248px] rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111114]/95 p-3.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-emerald-600/20 ring-1 ring-emerald-400/30">
                <Ticket className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">New ticket sold</div>
                <div className="text-[11px] text-gray-500 dark:text-white/55">VIP · Maya Patel · ₹12,500</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
                live
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Floating popover: check-in ── */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ duration: 0.8, delay: 0.55, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -right-4 bottom-16 z-20 hidden lg:block"
      >
        <motion.div
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="motion-reduce:!transform-none"
        >
          <div className="w-[232px] rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111114]/95 p-3.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400/30 to-indigo-600/20 ring-1 ring-indigo-400/30">
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">Marcus checked in</div>
                <div className="text-[11px] text-gray-500 dark:text-white/55">Door 2 · 19:04</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between rounded-lg bg-gray-100 dark:bg-white/[0.04] px-2.5 py-1.5">
              <span className="text-[10px] text-gray-500 dark:text-white/50">Capacity</span>
              <span className="text-[10px] font-semibold text-gray-700 dark:text-white/80">892 / 1,200</span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Main browser window ── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative z-10 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0E0E12] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.14)] dark:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.75)]"
      >
        {/* Browser chrome */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
          </div>
          <div className="hidden items-center gap-1.5 rounded-md bg-gray-200/60 dark:bg-white/[0.04] px-3 py-1 text-[10px] text-gray-400 dark:text-white/40 sm:flex">
            illuxus.com/dashboard/events
          </div>
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-gray-300 dark:text-white/25" />
            <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-[8px] font-bold text-white flex items-center justify-center">A</div>
          </div>
        </div>

        <div className="flex h-[420px] overflow-hidden">
          {/* ── Sidebar ── */}
          <aside className="hidden w-[188px] shrink-0 border-r border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.01] md:flex flex-col py-3 px-2">
            {/* Logo */}
            <div className="mb-4 flex items-center gap-2 px-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">IL</span>
              </div>
              <span className="text-[12px] font-semibold text-gray-800 dark:text-white/90">illuxus</span>
            </div>

            <nav className="space-y-0.5 flex-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors ${
                      item.active
                        ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
                        : "text-gray-500 dark:text-white/45 hover:bg-gray-100 dark:hover:bg-white/[0.04] hover:text-gray-800 dark:hover:text-white/70"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </div>
                );
              })}
            </nav>

            {/* Bottom org badge */}
            <div className="mt-auto px-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-2 py-1.5">
                <div className="h-5 w-5 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[7px] font-bold text-white">O</div>
                <span className="text-[10px] text-gray-600 dark:text-white/55 truncate">Org workspace</span>
              </div>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 overflow-hidden flex flex-col">
            {/* Page header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-4 py-3">
              <div>
                <h1 className="text-[14px] font-bold text-gray-900 dark:text-white">Events</h1>
                <p className="text-[10px] text-gray-400 dark:text-white/40">Manage all your events in one place</p>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Search */}
                <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] px-2.5 py-1 text-[10px] text-gray-400 dark:text-white/40">
                  <Search className="h-3 w-3" />
                  <span>Search events…</span>
                </div>
                {/* Create button */}
                <div className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white cursor-pointer hover:bg-indigo-700 transition-colors">
                  <Plus className="h-3 w-3" /> Create Event
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 px-4 pt-3 pb-2">
              <div className="flex bg-gray-100 dark:bg-white/[0.04] p-0.5 rounded-full gap-0.5">
                {(["upcoming", "pending", "past"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all capitalize cursor-pointer ${
                      tab === t
                        ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-white/45 hover:text-gray-700 dark:hover:text-white/65"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Event cards grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-white/30">
                  <Calendar className="h-8 w-8 opacity-40" />
                  <span className="text-[11px]">No events in this tab</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visible.map((event, i) => {
                    const isHovered = hoveredCard === event.id;
                    const d = new Date(event.date);
                    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        onMouseEnter={() => setHoveredCard(event.id)}
                        onMouseLeave={() => setHoveredCard(null)}
                        className={`rounded-xl border overflow-hidden cursor-pointer transition-all ${
                          isHovered
                            ? "border-indigo-300 dark:border-indigo-400/40 shadow-md"
                            : "border-gray-200 dark:border-white/[0.07]"
                        } bg-white dark:bg-white/[0.02]`}
                      >
                        {/* Cover */}
                        <div className={`relative h-[72px] bg-gradient-to-br ${event.cover} flex items-center justify-center overflow-hidden`}>
                          <Calendar className="h-6 w-6 text-white/30" />
                          {/* Hover overlay */}
                          <div className={`absolute inset-0 bg-black/0 flex items-center justify-center transition-all ${isHovered ? "bg-black/20 opacity-100" : "opacity-0"}`}>
                            <span className="bg-white/90 text-gray-900 text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <ArrowRight className="h-2.5 w-2.5" /> Manage
                            </span>
                          </div>
                        </div>

                        {/* Body */}
                        <div className="p-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-1">
                            <span className={`text-[11px] font-semibold leading-tight line-clamp-1 ${isHovered ? "text-indigo-600 dark:text-indigo-400" : "text-gray-900 dark:text-white"} transition-colors`}>
                              {event.title}
                            </span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-medium ${STATUS_COLORS[event.status]}`}>
                              {event.status}
                            </span>
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-white/40">
                              <Clock className="h-2.5 w-2.5 shrink-0" />{dateStr}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-white/40">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{event.venue}, {event.location}</span>
                            </div>
                          </div>

                          {/* Footer row */}
                          <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.05] pt-1.5 mt-1">
                            <span className="text-[9px] text-gray-400 dark:text-white/40">
                              {event.tickets_sold}/{event.capacity} tickets
                              {event.price > 0 ? ` · $${event.price}` : " · Free"}
                            </span>
                            <div className="flex items-center gap-1">
                              <div className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] font-medium cursor-pointer transition-colors ${
                                isHovered
                                  ? "border-indigo-300 dark:border-indigo-400/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                                  : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50"
                              }`}>
                                Manage <ArrowRight className="h-2.5 w-2.5" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
}

export default DashboardMockup;
