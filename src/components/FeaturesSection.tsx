import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  Mail,
  Megaphone,
  QrCode,
  Smartphone,
  Sparkles,
  Ticket,
  UserCheck,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { BentoCard } from "@/components/landing/BentoCard";
import { SyncLines } from "@/components/landing/SyncLines";
import {
  AnimatedStack,
  AnimatedItem,
} from "@/components/landing/AnimatedHeading";

/* ─── Bento card visuals ────────────────────────────────────────────────── */

/**
 * Workflow node graph used inside the large bento card. RSVP → Check-in →
 * Follow-up nodes connected by the animated dashed sync lines.
 */
function WorkflowGraph() {
  const nodes = [
    { icon: Ticket, label: "RSVP", tint: "from-indigo-400/30 to-indigo-600/15", ring: "ring-indigo-400/30", color: "text-indigo-600 dark:text-indigo-300" },
    { icon: UserCheck, label: "Check-in", tint: "from-purple-400/30 to-purple-600/15", ring: "ring-purple-400/30", color: "text-purple-600 dark:text-purple-300" },
    { icon: Mail, label: "Follow-up", tint: "from-amber-400/30 to-amber-600/15", ring: "ring-amber-400/30", color: "text-amber-600 dark:text-amber-300" },
  ];

  return (
    <div className="relative h-[220px] w-full">
      <SyncLines idSuffix="workflow" color="rgba(165, 180, 252, 0.7)" />
      <div className="relative z-10 flex h-full items-center justify-between gap-3 px-2 sm:px-6">
        {nodes.map((node, i) => {
          const Icon = node.icon;
          return (
            <div
              key={node.label}
              className="flex flex-col items-center gap-2"
              style={{ transform: i === 1 ? "translateY(-8px)" : "translateY(8px)" }}
            >
              <div
                className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${node.tint} ring-1 ring-inset ${node.ring} backdrop-blur-md`}
              >
                <Icon className={`h-5 w-5 ${node.color}`} strokeWidth={2.25} />
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-white/70">{node.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Split mobile/desktop check-in visual: scanner on the mobile half, attendee
 * row updates instantly on the desktop half.
 */
function CheckinSyncVisual() {
  return (
    <div className="relative grid h-[220px] grid-cols-5 gap-3 sm:gap-4">
      {/* Phone */}
      <div className="col-span-2 self-end">
        <div className="relative mx-auto w-[120px] rounded-[28px] border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111114] p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
          <div className="overflow-hidden rounded-[22px] bg-gray-50 dark:bg-[#0E0E12]">
            <div className="flex h-[42px] items-center justify-between px-3 text-[8px] text-gray-400 dark:text-white/40">
              <span>9:41</span>
              <span className="flex items-center gap-1">●●●</span>
            </div>
            <div className="px-3 pb-3">
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] p-2.5">
                <div className="text-[8px] uppercase tracking-widest text-gray-400 dark:text-white/40">Scanning</div>
                <div className="mt-1 flex aspect-square items-center justify-center rounded-lg bg-gray-200 dark:bg-black/40">
                  <QrCode className="h-10 w-10 text-indigo-500 dark:text-indigo-300" strokeWidth={1.5} />
                </div>
                <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-1.5 py-1">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-300" />
                  <span className="text-[8px] font-medium text-emerald-300">Checked in</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animated arrow */}
      <div className="col-span-1 hidden self-center sm:flex justify-center">
        <motion.div
          animate={{ x: [-4, 4, -4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="motion-reduce:!translate-x-0"
        >
          <ArrowRight className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />
        </motion.div>
      </div>

      {/* Desktop attendee row */}
      <div className="col-span-3 self-center sm:col-span-2">
        <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-600 dark:text-white/70">Live attendees</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-live-pulse" />
              syncing
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "Maya Patel", time: "19:04", isNew: true },
              { name: "Marcus Rivera", time: "19:02" },
              { name: "Anja Müller", time: "19:01" },
            ].map((row) => (
              <motion.div
                key={row.name}
                initial={row.isNew ? { backgroundColor: "rgba(99,102,241,0.15)" } : false}
                animate={row.isNew ? { backgroundColor: "rgba(255,255,255,0.0)" } : false}
                transition={{ duration: 1.8 }}
                className="flex items-center justify-between rounded-md px-1.5 py-1"
              >
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-indigo-400/40 to-purple-500/30 ring-1 ring-gray-200 dark:ring-white/10" />
                  <span className="text-[10px] text-gray-700 dark:text-white/80">{row.name}</span>
                </div>
                <span className="text-[9px] text-gray-400 dark:text-white/40">{row.time}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AI-generated profile bio visual for the "Instant Bios" card. A skeletal
 * profile fills in line by line.
 */
function InstantBiosVisual() {
  return (
    <div className="relative h-[220px] w-full">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full max-w-[280px] rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-pink-400/40 to-purple-500/30 ring-1 ring-gray-200 dark:ring-white/10">
              <Bot className="absolute inset-0 m-auto h-4 w-4 text-pink-600 dark:text-white/80" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-900 dark:text-white">Maya Patel</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-400/15 px-1.5 py-0.5 text-[8px] font-medium text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
                  <Sparkles className="h-2 w-2" />
                  AI bio
                </span>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-white/50">Founder · Helios Labs</div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {[100, 92, 84, 64].map((width, i) => (
              <motion.div
                key={i}
                initial={{ scaleX: 0, opacity: 0 }}
                whileInView={{ scaleX: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.15, ease: "easeOut" }}
                className="h-1.5 origin-left rounded-full bg-gradient-to-r from-gray-200 dark:from-white/15 to-gray-100/50 dark:to-white/[0.04]"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-1.5">
            {["Robotics", "GTM", "Hardware"].map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-gray-100 dark:bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-gray-500 dark:text-white/65 ring-1 ring-inset ring-gray-200 dark:ring-white/[0.06]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Deep-dive row visuals ─────────────────────────────────────────────── */

/**
 * Pre-event automations preview: ticket tiers + marketing automation lane.
 */
function PreEventVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0E0E12] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-white/40">
          Ticket tiers
        </span>
        <span className="text-[10px] text-gray-400 dark:text-white/40">Auto-sequence on</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { name: "Early bird", price: "$89", sold: "240/250", percent: 96, tint: "from-emerald-400/30 to-emerald-600/10" },
          { name: "General", price: "$149", sold: "612/1000", percent: 61, tint: "from-indigo-400/30 to-indigo-600/10" },
          { name: "VIP", price: "$349", sold: "82/100", percent: 82, tint: "from-amber-400/30 to-amber-600/10" },
        ].map((tier) => (
          <div
            key={tier.name}
            className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.03] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-600 dark:text-white/70">{tier.name}</span>
              <span className="text-[10px] font-semibold text-gray-900 dark:text-white">{tier.price}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${tier.percent}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full rounded-full bg-gradient-to-r ${tier.tint}`}
              />
            </div>
            <div className="mt-1 text-[9px] text-gray-400 dark:text-white/40">{tier.sold}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.03] p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pink-400/25 to-purple-500/20 ring-1 ring-inset ring-pink-400/25">
          <Megaphone className="h-3.5 w-3.5 text-pink-600 dark:text-pink-200" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-gray-800 dark:text-white/85">
            Reminder email queued
          </div>
          <div className="text-[10px] text-gray-400 dark:text-white/45">
            Sends to 1,248 RSVPs · 24h before doors
          </div>
        </div>
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300">Scheduled</span>
      </div>
    </div>
  );
}

/**
 * Day-of-event preview: check-in counter + push notification log.
 */
function DayOfVisual() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0E0E12] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400 dark:text-white/40">
            Door 2 · Founder Summit
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tracking-tight text-gray-900 dark:text-white">
              892
            </span>
            <span className="text-[11px] text-gray-400 dark:text-white/50">of 1,200 in</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
          live
        </span>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "74%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="h-full rounded-full bg-gradient-to-r from-emerald-400/70 to-emerald-500/70"
        />
      </div>

      <div className="space-y-2">
        {[
          { icon: Bell, msg: "Push sent · Workshop B starts in 10 min", time: "2m ago", color: "text-purple-600 dark:text-purple-300", tint: "from-purple-400/25 to-purple-600/10" },
          { icon: UserCheck, msg: "Marcus Rivera checked in", time: "3m ago", color: "text-indigo-600 dark:text-indigo-300", tint: "from-indigo-400/25 to-indigo-600/10" },
          { icon: Smartphone, msg: "Stage A capacity 88% — usher alerted", time: "5m ago", color: "text-amber-600 dark:text-amber-300", tint: "from-amber-400/25 to-amber-600/10" },
        ].map((row, i) => {
          const Icon = row.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.12 }}
              className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-white/[0.06] bg-gray-100/50 dark:bg-white/[0.03] px-3 py-2"
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${row.tint} ring-1 ring-inset ring-gray-200 dark:ring-white/10`}
              >
                <Icon className={`h-3.5 w-3.5 ${row.color}`} />
              </div>
              <span className="flex-1 truncate text-[11px] text-gray-700 dark:text-white/80">{row.msg}</span>
              <span className="text-[10px] text-gray-400 dark:text-white/40">{row.time}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Deep-dive row layout ──────────────────────────────────────────────── */

interface DeepDiveRowProps {
  reverse?: boolean;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta?: { label: string; href: string };
  visual: React.ReactNode;
}

function DeepDiveRow({
  reverse = false,
  eyebrow,
  title,
  body,
  bullets,
  cta,
  visual,
}: DeepDiveRowProps) {
  return (
    <div
      className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16 ${
        reverse ? "md:[&>div:first-child]:order-2" : ""
      }`}
    >
      <AnimatedStack>
        <AnimatedItem>
          <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-indigo-500 dark:text-indigo-300">
            {eyebrow}
          </span>
        </AnimatedItem>
        <AnimatedItem>
          <h3
            className="mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-gray-900 dark:text-white sm:text-4xl md:text-[40px]"
            style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
          >
            {title}
          </h3>
        </AnimatedItem>
        <AnimatedItem>
          <p className="mt-5 text-[15px] leading-relaxed text-gray-500 dark:text-white/60 md:text-base">
            {body}
          </p>
        </AnimatedItem>
        <AnimatedItem>
          <ul className="mt-6 space-y-2.5">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-[14px] text-gray-600 dark:text-white/75">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
                  strokeWidth={2.25}
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </AnimatedItem>
        {cta && (
          <AnimatedItem>
            <Link
              to={cta.href}
              className="mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 dark:text-white/90 transition-colors hover:text-indigo-700 dark:hover:text-white"
            >
              {cta.label}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </AnimatedItem>
        )}
      </AnimatedStack>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="relative"
      >
        {/* Halo behind the visual */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-6 rounded-3xl opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div className="relative">{visual}</div>
      </motion.div>
    </div>
  );
}

/* ─── Main section ──────────────────────────────────────────────────────── */

const FeaturesSection = () => {
  const { content } = useSiteContent();
  const f = content.features;

  return (
    <section
      id="features"
      className="relative isolate overflow-hidden py-24 md:py-32"
    >
      <SiteContainer>
        {/* Section header */}
        <AnimatedStack className="mx-auto mb-16 max-w-3xl text-center md:mb-20">
          {f.eyebrow && (
            <AnimatedItem>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-100/60 dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500 dark:text-indigo-300 backdrop-blur-xl">
                <Zap className="h-3 w-3" />
                {f.eyebrow}
              </span>
            </AnimatedItem>
          )}
          <AnimatedItem>
            <h2
              className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] text-gray-900 dark:text-white sm:text-4xl md:text-[52px] md:leading-[1.15]"
              style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
            >
              {f.title}
            </h2>
          </AnimatedItem>
          {f.subtitle && (
            <AnimatedItem>
              <p className="mt-5 text-[15px] leading-relaxed text-gray-500 dark:text-white/55 md:text-base [text-wrap:pretty]">
                {f.subtitle}
              </p>
            </AnimatedItem>
          )}
        </AnimatedStack>

        {/* Bento grid — 1 large + 2 medium */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* Card A — large */}
          <BentoCard
            className="lg:col-span-2"
            glowColor="rgba(99, 102, 241, 0.22)"
          >
            <div className="flex h-full flex-col p-7 sm:p-8">
              <div className="mb-6 flex items-center gap-2">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-indigo-400/10 px-2.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300 ring-1 ring-inset ring-indigo-400/20">
                  <Bot className="h-3 w-3" />
                  Always-on
                </span>
              </div>
              <h3
                className="text-balance text-[22px] font-semibold leading-tight tracking-[-0.025em] text-gray-900 dark:text-white sm:text-[28px]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
              >
                The intelligent system that never sleeps
              </h3>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-gray-500 dark:text-white/55">
                Workflows trigger themselves the moment an attendee RSVPs, checks
                in, or leaves. No scripts to babysit, no cron jobs to maintain.
              </p>
              <div className="mt-auto pt-8">
                <WorkflowGraph />
              </div>
            </div>
          </BentoCard>

          {/* Card B — medium */}
          <BentoCard glowColor="rgba(168, 85, 247, 0.22)">
            <div className="flex h-full flex-col p-7 sm:p-8">
              <div className="mb-6 flex items-center gap-2">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-purple-400/10 px-2.5 text-[10px] font-medium text-purple-600 dark:text-purple-300 ring-1 ring-inset ring-purple-400/20">
                  <Smartphone className="h-3 w-3" />
                  Realtime
                </span>
              </div>
              <h3
                className="text-balance text-[22px] font-semibold leading-tight tracking-[-0.025em] text-gray-900 dark:text-white sm:text-[24px]"
                style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
              >
                Live check-in sync
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-gray-500 dark:text-white/55">
                QR scans on the door instantly update the desktop attendee list,
                capacity counters, and waiting rooms across every device.
              </p>
              <div className="mt-auto pt-6">
                <CheckinSyncVisual />
              </div>
            </div>
          </BentoCard>

          {/* Card C — medium */}
          <BentoCard
            className="lg:col-span-3"
            glowColor="rgba(244, 114, 182, 0.18)"
          >
            <div className="flex h-full flex-col gap-6 p-7 sm:flex-row sm:items-center sm:p-8">
              <div className="flex-1">
                <div className="mb-5 flex items-center gap-2">
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-pink-400/10 px-2.5 text-[10px] font-medium text-pink-600 dark:text-pink-300 ring-1 ring-inset ring-pink-400/20">
                    <Sparkles className="h-3 w-3" />
                    AI assist
                  </span>
                </div>
                <h3
                  className="text-balance text-[22px] font-semibold leading-tight tracking-[-0.025em] text-gray-900 dark:text-white sm:text-[26px]"
                  style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
                >
                  Instant bios for every attendee
                </h3>
                <p className="mt-3 max-w-md text-[14px] leading-relaxed text-gray-500 dark:text-white/55">
                  Pull a clean, conference-ready profile in seconds. Pulls
                  signals from LinkedIn, talks, prior events, and the attendee's
                  own bio when available.
                </p>
              </div>
              <div className="flex-1 sm:max-w-[420px]">
                <InstantBiosVisual />
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Deep dive rows */}
        <div className="mt-24 space-y-24 md:mt-32 md:space-y-32">
          <DeepDiveRow
            eyebrow="Pre-event"
            title="Sell tickets and warm up the room — automatically."
            body="Spin up branded ticket tiers, promo codes, and waitlists in
            minutes. Marketing automations drip into inboxes the moment a
            milestone is hit, so you're never the one chasing a launch."
            bullets={[
              "Tiered + group pricing, instant Stripe payouts",
              "Drip campaigns triggered by RSVP, applications, or refunds",
              "UTM-aware analytics so you know what sold the seats",
              "Custom landing pages that look like your brand, not ours",
            ]}
            cta={{ label: "Explore ticketing", href: "/features" }}
            visual={<PreEventVisual />}
          />

          <DeepDiveRow
            reverse
            eyebrow="Day of"
            title="Run the floor without leaving the building."
            body="Door staff scan with their phones; everyone else watches the
            room update live. Send a push, alert an usher, or shut a session
            down in a single tap."
            bullets={[
              "QR check-in/out with offline buffer",
              "Targeted push notifications to attendees by tier or session",
              "Capacity alerts when a stage gets hot",
              "Audit trail of every door event with timestamps and user agents",
            ]}
            cta={{ label: "See day-of ops", href: "/features" }}
            visual={<DayOfVisual />}
          />
        </div>
      </SiteContainer>
    </section>
  );
};

export default FeaturesSection;
