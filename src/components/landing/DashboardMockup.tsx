import { motion } from "framer-motion";
import { CheckCircle2, Ticket, Users, TrendingUp } from "lucide-react";

/**
 * `<DashboardMockup>` — a SVG/CSS composition of the illuxus event dashboard
 * meant to sit dead-center in the hero. Two floating popover cards (ticket
 * sale + check-in confirmation) drift gently around it via framer-motion to
 * suggest a product that's alive.
 *
 * The mockup is deliberately *not* a PNG screenshot — it stays crisp on every
 * DPR, never blocks first paint, and weighs almost nothing in the bundle.
 *
 * Reduced-motion users get the static composition with no oscillation.
 */
export function DashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[920px]">
      {/* Floating popover — left, ticket sale */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -left-2 top-12 z-20 hidden sm:block"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="motion-reduce:!transform-none"
        >
          <div className="relative w-[260px] rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111114]/95 p-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/30 to-emerald-600/20 ring-1 ring-emerald-400/30">
                <Ticket className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">
                  New ticket sold
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-white/55">
                  VIP · Maya Patel · $189
                </div>
              </div>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
                live
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating popover — right, check-in card */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ duration: 0.8, delay: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="absolute -right-4 bottom-10 z-20 hidden sm:block"
      >
        <motion.div
          animate={{ y: [0, -14, 0] }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.6,
          }}
          className="motion-reduce:!transform-none"
        >
          <div className="relative w-[240px] rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111114]/95 p-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400/30 to-indigo-600/20 ring-1 ring-indigo-400/30">
                <CheckCircle2 className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-900 dark:text-white">
                  Marcus checked in
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-white/55">
                  Door 2 · 19:04 local
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-200 dark:bg-white/[0.04] px-2.5 py-1.5">
              <span className="text-[10px] text-gray-500 dark:text-white/50">Capacity</span>
              <span className="text-[10px] font-medium text-gray-700 dark:text-white/75">
                238 / 300
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Main dashboard window */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative z-10 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0E0E12] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.75)]"
      >
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.02] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15" />
          </div>
          <div className="hidden items-center gap-1.5 rounded-md bg-gray-200 dark:bg-white/[0.04] px-2.5 py-1 text-[10px] text-gray-400 dark:text-white/45 sm:flex">
            illuxus.com/dashboard/events
          </div>
          <span className="text-[10px] text-gray-300 dark:text-white/30">⌘K</span>
        </div>

        <div className="grid grid-cols-12 gap-0">
          {/* Sidebar */}
          <aside className="col-span-3 hidden border-r border-gray-200 dark:border-white/[0.06] p-4 md:block">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400 to-purple-500" />
              <span className="text-[11px] font-semibold text-gray-800 dark:text-white/85">
                illuxus
              </span>
            </div>
            <nav className="space-y-1">
              {[
                { label: "Events", active: true },
                { label: "Tickets", active: false },
                { label: "Attendees", active: false },
                { label: "Reports", active: false },
                { label: "Settings", active: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center rounded-lg px-2.5 py-1.5 text-[11px] ${
                    item.active
                      ? "bg-gray-200 dark:bg-white/[0.06] text-gray-900 dark:text-white"
                      : "text-gray-400 dark:text-white/50"
                  }`}
                >
                  <span className="mr-2 h-1 w-1 rounded-full bg-gray-300 dark:bg-white/30" />
                  {item.label}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main canvas */}
          <main className="col-span-12 p-5 md:col-span-9 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400 dark:text-white/40">
                  Live overview
                </div>
                <div className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white">
                  Founder Summit · Berlin
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
                live now
              </span>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  icon: Ticket,
                  label: "Tickets sold",
                  value: "1,248",
                  delta: "+12%",
                  tint: "from-indigo-400/20 to-indigo-600/10",
                  iconColor: "text-indigo-300",
                },
                {
                  icon: Users,
                  label: "Checked-in",
                  value: "892",
                  delta: "+38",
                  tint: "from-purple-400/20 to-purple-600/10",
                  iconColor: "text-purple-300",
                },
                {
                  icon: TrendingUp,
                  label: "Revenue",
                  value: "$148k",
                  delta: "+$4.2k",
                  tint: "from-amber-400/20 to-amber-600/10",
                  iconColor: "text-amber-300",
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.02] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${stat.tint} ring-1 ring-gray-200 dark:ring-white/10`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${stat.iconColor}`} />
                      </div>
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                        {stat.delta}
                      </span>
                    </div>
                    <div className="mt-2 text-[18px] font-semibold tracking-tight text-gray-900 dark:text-white">
                      {stat.value}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-white/45">{stat.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Chart placeholder */}
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-600 dark:text-white/75">
                  Check-in velocity
                </span>
                <span className="text-[10px] text-gray-400 dark:text-white/40">Last 4 hours</span>
              </div>
              <svg
                viewBox="0 0 400 100"
                className="h-20 w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="velocity-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(129, 140, 248, 0.45)" />
                    <stop offset="100%" stopColor="rgba(129, 140, 248, 0)" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 80 L40 70 L80 60 L120 65 L160 45 L200 50 L240 30 L280 35 L320 20 L360 28 L400 18 L400 100 L0 100 Z"
                  fill="url(#velocity-fill)"
                />
                <path
                  d="M0 80 L40 70 L80 60 L120 65 L160 45 L200 50 L240 30 L280 35 L320 20 L360 28 L400 18"
                  fill="none"
                  stroke="rgba(129, 140, 248, 0.85)"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
}

export default DashboardMockup;
