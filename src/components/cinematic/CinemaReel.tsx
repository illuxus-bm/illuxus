import { useEffect, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import { SiteContainer } from "@/components/layout/SiteContainer";
import { PosterTitle, Reveal, SectionChip } from "@/components/landing/primitives";
import { ease, span, useNearViewport, usePrefersReducedMotion, useViewportProgress } from "@/components/landing/motion";

const REEL_SRC = "/illuxus-cinema/illuxus-cinematic.mp4";

/** Scenes in the reel, with the second each one starts at. */
const BEATS = [
  { label: "Doors", at: 0 },
  { label: "On stage", at: 3.3 },
  { label: "Networking", at: 6.6 },
];

/**
 * The event reel. The frame starts tipped back and small, then swings flat
 * and grows to full width as it scrolls to the middle of the screen. The
 * video only loads and plays while it is near the viewport; if the file is
 * missing the whole section steps aside.
 */
export function CinemaReel() {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [beat, setBeat] = useState(0);
  const near = useNearViewport(section);
  const reduced = usePrefersReducedMotion();

  useViewportProgress(
    section,
    (progress) => {
      if (!frame.current) return;
      const t = ease(span(progress, 0.12, 0.5));
      frame.current.style.transform = `perspective(1400px) rotateX(${((1 - t) * 18).toFixed(2)}deg) scale(${(0.84 + 0.16 * t).toFixed(4)})`;
    },
    !reduced,
  );

  useEffect(() => {
    const el = video.current;
    if (!el || reduced) return;
    if (near) el.play().catch(() => undefined);
    else el.pause();
  }, [near, reduced]);

  if (failed) return null;

  return (
    <section ref={section} className="relative border-t border-border py-24 md:py-32">
      <SiteContainer>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Reveal>
              <SectionChip icon={Clapperboard} label="The reel" />
            </Reveal>
            <PosterTitle text="Events you'll remember" className="mt-5 text-[clamp(44px,7vw,96px)]" />
          </div>
          <ol className="flex gap-6 md:pb-3">
            {BEATS.map((item, i) => (
              <li key={item.label} className="flex items-baseline gap-2">
                <span className={`poster text-[18px] transition-colors ${i === beat ? "text-accent" : "text-foreground/25"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`eyebrow whitespace-nowrap transition-colors ${i === beat ? "text-foreground" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12" style={{ perspective: "1400px" }}>
          <div
            ref={frame}
            className="relative origin-bottom overflow-hidden rounded-[22px] border border-border bg-card will-change-transform"
          >
            <video
              ref={video}
              src={near ? REEL_SRC : undefined}
              className="block aspect-[2.39/1] w-full object-cover"
              muted
              loop
              playsInline
              preload="none"
              controls={reduced}
              aria-label="A short film of an event: guests arriving, a keynote, and networking afterwards"
              onError={() => setFailed(true)}
              onTimeUpdate={(event) => {
                const time = event.currentTarget.currentTime;
                let current = 0;
                BEATS.forEach((item, i) => {
                  if (time >= item.at) current = i;
                });
                setBeat((previous) => (previous === current ? previous : current));
              }}
            />
            {/* Brand tint + a hairline frame so the film sits in the page. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#071D33]/25 mix-blend-multiply" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-[14px] border border-white/15" />
          </div>
        </div>
      </SiteContainer>
    </section>
  );
}

export default CinemaReel;
