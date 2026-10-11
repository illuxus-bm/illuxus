import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PillLink, PosterTitle, Reveal } from "@/components/landing/primitives";
import { CheckinCard, DoorCard, PaperTicket, SourcesCard, TiersCard } from "@/components/landing/StoryCards";
import { clamp01, ease, onScrollFrame, prefersReducedMotion, span, useNearViewport, windowed } from "@/components/landing/motion";
import { CHECKED_IN_SHARE, STAGE_WINDOWS, stage } from "@/components/three/stage-state";

// three.js is heavy, so the WebGL stage ships in its own chunk and only loads
// for visitors whose device can run it.
const StageCanvas = lazy(() => import("@/components/three/StageCanvas"));

/** What the product does, floated around the hero ticket. */
const HERO_TAGS = [
  { label: "Ticketing", className: "left-[52%] top-[14%]", delay: "0s" },
  { label: "QR check-in", className: "right-[4%] top-[24%]", delay: "-2s" },
  { label: "Live webinars", className: "left-[47%] bottom-[30%]", delay: "-4s" },
  { label: "Communities", className: "right-[7%] bottom-[20%]", delay: "-1s" },
  { label: "UPI & cards", className: "left-[66%] bottom-[10%]", delay: "-3s" },
];

const CHAPTERS = [
  {
    id: "sell",
    label: "Sell",
    eyebrow: "Pre-event",
    title: "Sell tickets and warm up the room — automatically.",
    body: "Spin up branded ticket tiers, promo codes, and waitlists in minutes. Marketing automations drip into inboxes the moment a milestone is hit, so you're never the one chasing a launch.",
    bullets: [
      "Tiered + group pricing, instant Stripe payouts",
      "Drip campaigns triggered by RSVP, applications, or refunds",
      "Custom landing pages that look like your brand, not ours",
    ],
    cta: { label: "Explore ticketing", href: "/features" },
    Card: TiersCard,
  },
  {
    id: "checkin",
    label: "Check in",
    eyebrow: "Realtime",
    title: "Live check-in sync",
    body: "QR scans on the door instantly update the desktop attendee list, capacity counters, and waiting rooms across every device.",
    bullets: ["QR check-in/out with offline buffer", "Audit trail of every door event with timestamps and user agents"],
    cta: null,
    Card: CheckinCard,
  },
  {
    id: "floor",
    label: "Run the floor",
    eyebrow: "Day of",
    title: "Run the floor without leaving the building.",
    body: "Door staff scan with their phones; everyone else watches the room update live. Send a push, alert an usher, or shut a session down in a single tap.",
    bullets: ["Targeted push notifications to attendees by tier or session", "Capacity alerts when a stage gets hot"],
    cta: { label: "See day-of ops", href: "/features" },
    Card: DoorCard,
  },
  {
    id: "attribution",
    label: "Attribute",
    eyebrow: "Attribution",
    title: "Know which campaign brought the seat",
    body: "Generate UTM links per channel and they lock the moment data lands. See top sources convert in real time, edit live campaigns without losing history, and trace every signup back to where it came from.",
    bullets: ["UTM-aware analytics so you know what sold the seats"],
    cta: null,
    Card: SourcesCard,
  },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** If the 3D chunk fails to load, carry on with the CSS floor alone. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function HeroCopy({ immediate }: { immediate?: boolean }) {
  const { content } = useSiteContent();
  const h = content.hero;
  return (
    <div className="max-w-[600px]">
      {h.badge && (
        <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-1.5">
          <span className="h-2 w-2 rounded-full bg-accent ring-4 ring-accent/20" />
          <span className="eyebrow text-foreground">{h.badge}</span>
        </span>
      )}
      <PosterTitle as="h1" text={h.title} immediate={immediate} className="mt-5 text-[clamp(50px,7vw,104px)]" />
      <div className="rule-draw mt-5 h-px w-full max-w-[520px] bg-accent/70" />
      <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-muted-foreground sm:text-[18px] [text-wrap:pretty]">
        {h.subtitle}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {h.primaryCtaLabel && (
          <PillLink href={h.primaryCtaHref} arrow>
            {h.primaryCtaLabel}
          </PillLink>
        )}
        {h.secondaryCtaLabel && (
          <PillLink href={h.secondaryCtaHref} variant="outline">
            {h.secondaryCtaLabel}
          </PillLink>
        )}
      </div>
    </div>
  );
}

function ChapterCopy({ chapter, index }: { chapter: (typeof CHAPTERS)[number]; index: number }) {
  return (
    <div className="max-w-[520px]">
      <div className="flex items-center gap-3">
        <span className="poster text-[22px] text-accent">{String(index + 1).padStart(2, "0")}</span>
        <span className="h-px w-8 bg-accent/60" />
        <span className="eyebrow text-accent">{chapter.eyebrow}</span>
      </div>
      <h2 className="poster mt-4 text-[clamp(38px,5.2vw,72px)] text-foreground">{chapter.title}</h2>
      <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">{chapter.body}</p>
      <ul className="mt-5 hidden space-y-2.5 sm:block">
        {chapter.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3 text-[14px] text-foreground/85">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      {chapter.cta && (
        <Link
          to={chapter.cta.href}
          className="group mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-[6px]"
        >
          {chapter.cta.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * Hero and product story as plain stacked sections. Used when the visitor
 * asks for reduced motion or the device has no WebGL.
 */
function StaticStory() {
  return (
    <>
      <section className="relative overflow-hidden pb-20 pt-14 sm:pt-20">
        <SiteContainer className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <HeroCopy immediate />
          <PaperTicket className="mx-auto max-w-[520px] -rotate-2 shadow-[0_40px_80px_-40px_rgba(3,14,26,0.6)]" />
        </SiteContainer>
      </section>
      <section className="border-t border-border py-20 md:py-28">
        <SiteContainer className="space-y-20 md:space-y-28">
          {CHAPTERS.map((chapter, index) => (
            <div key={chapter.id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <ChapterCopy chapter={chapter} index={index} />
              </Reveal>
              <Reveal index={1} className={index % 2 ? "lg:order-first" : undefined}>
                <chapter.Card className="mx-auto max-w-[420px]" />
              </Reveal>
            </div>
          ))}
        </SiteContainer>
      </section>
    </>
  );
}

/**
 * Hero plus the scroll-driven product story. The section is a tall track
 * with a sticky stage inside it: scrolling the track moves a single 0–1
 * timeline that the 3D scene and the copy both follow.
 */
function PinnedStory() {
  const { theme } = useTheme();
  const track = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const copies = useRef<Partial<Record<ChapterId, HTMLDivElement | null>>>({});
  const cards = useRef<Partial<Record<ChapterId, HTMLDivElement | null>>>({});
  const fills = useRef<Partial<Record<ChapterId, HTMLSpanElement | null>>>({});
  const [sceneReady, setSceneReady] = useState(false);
  const active = useNearViewport(track, "10% 0px 10% 0px");

  useEffect(() => {
    const show = (el: HTMLElement | null | undefined, opacity: number, shift: number) => {
      if (!el) return;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
      el.style.visibility = opacity < 0.01 ? "hidden" : "visible";
      el.style.pointerEvents = opacity > 0.6 ? "auto" : "none";
    };

    return onScrollFrame(() => {
      const trackEl = track.current;
      const stickyEl = sticky.current;
      if (!trackEl || !stickyEl) return;
      const top = parseFloat(getComputedStyle(stickyEl).top) || 0;
      const distance = trackEl.offsetHeight - stickyEl.offsetHeight;
      const p = distance > 0 ? clamp01((top - trackEl.getBoundingClientRect().top) / distance) : 0;
      stage.progress = p;

      const heroOut = ease(span(p, 0.02, STAGE_WINDOWS.hero[1]));
      show(hero.current, 1 - heroOut, -48 * heroOut);
      if (tags.current) {
        tags.current.style.opacity = (1 - ease(span(p, 0.01, 0.08))).toFixed(3);
        tags.current.style.transform = `translate3d(0, ${(-70 * span(p, 0, 0.12)).toFixed(1)}px, 0)`;
      }
      if (rail.current) rail.current.style.opacity = ease(span(p, 0.1, 0.15)).toFixed(3);

      for (const chapter of CHAPTERS) {
        const [from, to] = STAGE_WINDOWS[chapter.id];
        const { opacity, fadeIn, fadeOut } = windowed(p, from, to);
        const shift = (1 - ease(fadeIn)) * 44 - ease(fadeOut) * 44;
        show(copies.current[chapter.id], opacity, shift);
        const card = cards.current[chapter.id];
        show(card, opacity, shift * 1.6);
        const local = span(p, from, to);
        const fill = fills.current[chapter.id];
        if (fill) fill.style.transform = `scaleX(${local.toFixed(3)})`;
        if (card) {
          card.style.setProperty("--t", ease(span(local, 0.15, 0.75)).toFixed(3));
          if (chapter.id === "floor") {
            // Count in step with the seats filling in the 3D hall.
            const seated = Math.round(1200 * CHECKED_IN_SHARE * span(p, 0.63, 0.8));
            const counter = card.querySelector("[data-counter]");
            if (counter) counter.textContent = String(seated);
            card.style.setProperty("--t", span(p, 0.63, 0.8).toFixed(3));
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      stage.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      stage.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <section ref={track} className="relative h-[460svh]" aria-label="How illuxus runs an event">
      <div
        ref={sticky}
        className="sticky top-[var(--app-header-h)] h-[calc(100svh-var(--app-header-h))] overflow-hidden"
      >
        {/* Floor: CSS stand-in first, WebGL once it has drawn a frame. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: sceneReady ? 0 : 1 }}
        >
          <div className="floor-plane" />
        </div>
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: sceneReady ? 1 : 0 }}
        >
          <StageBoundary>
            <Suspense fallback={null}>
              <StageCanvas theme={theme} active={active} onReady={() => setSceneReady(true)} />
            </Suspense>
          </StageBoundary>
        </div>

        {/* Keeps the copy readable where the scene passes behind it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[62%] bg-gradient-to-r from-background from-[28%] via-background/80 via-[62%] to-transparent lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[58%] bg-gradient-to-b from-background via-background/85 to-transparent lg:hidden"
        />

        {/* Hero */}
        <div ref={tags} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
          {HERO_TAGS.map((tag) => (
            <span
              key={tag.label}
              className={`chip-bob absolute inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold text-foreground shadow-[0_14px_30px_-18px_rgba(3,14,26,0.6)] ${tag.className}`}
              style={{ animationDelay: tag.delay }}
            >
              <CheckCircle2 className="h-5 w-5 text-accent" />
              {tag.label}
            </span>
          ))}
        </div>
        <div ref={hero} className="absolute inset-0 flex items-start pt-10 sm:pt-14 lg:items-center lg:pt-0">
          <SiteContainer>
            <HeroCopy immediate />
          </SiteContainer>
          <div className="absolute bottom-6 left-0 right-0 hidden [@media(min-height:820px)]:lg:block">
            <SiteContainer className="flex items-center gap-3 text-muted-foreground">
              <span className="relative h-10 w-px overflow-hidden bg-foreground/15">
                <span className="scroll-cue absolute inset-0 bg-accent" />
              </span>
              <span className="eyebrow">Scroll to follow one event</span>
            </SiteContainer>
          </div>
        </div>

        {/* Chapters */}
        {CHAPTERS.map((chapter, index) => (
          <div key={chapter.id} className="pointer-events-none absolute inset-0">
            <SiteContainer className="relative flex h-full items-start pt-8 sm:pt-12 lg:items-center lg:pt-0">
              <div
                ref={(node) => {
                  copies.current[chapter.id] = node;
                }}
                className="lg:w-[46%]"
                style={{ opacity: 0, visibility: "hidden" }}
              >
                <ChapterCopy chapter={chapter} index={index} />
              </div>
              <chapter.Card
                ref={(node: HTMLDivElement | null) => {
                  cards.current[chapter.id] = node;
                  if (node) {
                    node.style.opacity = "0";
                    node.style.visibility = "hidden";
                  }
                }}
                className="absolute bottom-24 right-4 hidden w-[330px] sm:right-6 xl:block"
              />
            </SiteContainer>
          </div>
        ))}

        {/* Chapter progress */}
        <div ref={rail} className="pointer-events-none absolute inset-x-0 bottom-6" style={{ opacity: 0 }}>
          <SiteContainer className="flex gap-3 sm:gap-5">
            {CHAPTERS.map((chapter, index) => (
              <div key={chapter.id} className="min-w-0 flex-1">
                <div className="h-[2px] overflow-hidden rounded-full bg-foreground/15">
                  <span
                    ref={(node) => {
                      fills.current[chapter.id] = node;
                    }}
                    className="block h-full origin-left bg-accent"
                    style={{ transform: "scaleX(0)" }}
                  />
                </div>
                <div className="mt-2 hidden items-baseline gap-2 text-muted-foreground sm:flex">
                  <span className="poster text-[15px]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="eyebrow truncate !text-[10px]">{chapter.label}</span>
                </div>
              </div>
            ))}
          </SiteContainer>
        </div>
      </div>
    </section>
  );
}

const HeroSection = () => {
  // Decided once: motion preferences and GPU support don't change mid-visit.
  const [pinned] = useState(() => !prefersReducedMotion() && supportsWebGL());
  return pinned ? <PinnedStory /> : <StaticStory />;
};

export default HeroSection;
