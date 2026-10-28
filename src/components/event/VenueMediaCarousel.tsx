import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, ExternalLink } from "lucide-react";
import { EffectCoverflow, Keyboard, Pagination, A11y } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/pagination";
import "./venue-media-carousel.css";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VenueMedia } from "@/hooks/useVenueDetail";
import { cn } from "@/lib/utils";

const kindLabel = (kind: string) => kind.replace(/_/g, " ");
const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);

/** Below this many slides a loop would show the same photo on both sides. */
const LOOP_MIN = 5;

/**
 * A venue's photos and videos as a coverflow carousel (Swiper). Tapping the
 * photo in front opens it full size; tapping one at the side brings it to
 * the front. Files that are not pictures, such as a PDF floor plan, are
 * listed as links underneath.
 */
export function VenueMediaCarousel({ media, className }: { media: VenueMedia[]; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  // Without a loop the arrows stop at the first and last photo.
  const [edge, setEdge] = useState({ start: true, end: false });
  const trackEdge = (s: SwiperInstance) => setEdge({ start: s.isBeginning, end: s.isEnd });

  // The cover first, then the order the venue chose.
  const ordered = [...media].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const slides = ordered.filter((m) => m.media_kind === "video" || isImageUrl(m.url));
  const files = ordered.filter((m) => !slides.includes(m));
  if (slides.length === 0 && files.length === 0) return null;

  const loop = slides.length >= LOOP_MIN;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("space-y-3", className)}
    >
      {slides.length > 0 && (
        <div className="relative">
          <Swiper
            onSwiper={(s) => { setSwiper(s); trackEdge(s); }}
            onSlideChange={trackEdge}
            effect="coverflow"
            grabCursor
            centeredSlides
            slidesPerView="auto"
            loop={loop}
            speed={reduceMotion ? 0 : 450}
            keyboard={{ enabled: true }}
            coverflowEffect={{ rotate: 40, stretch: 0, depth: 100, modifier: 1, slideShadows: true }}
            pagination={{ clickable: true }}
            a11y={{ prevSlideMessage: "Previous photo", nextSlideMessage: "Next photo" }}
            modules={[EffectCoverflow, Pagination, Keyboard, A11y]}
            className="venue-carousel"
          >
            {slides.map((m) => (
              <SwiperSlide key={m.id}>
                {({ isActive }) => (
                  <div className="relative h-full w-full">
                    {m.media_kind === "video" ? (
                      // Its own controls take the drag, so the video can be scrubbed.
                      <video
                        src={m.url}
                        controls={isActive}
                        muted
                        playsInline
                        preload="metadata"
                        className={cn("h-full w-full bg-black object-cover", isActive && "swiper-no-swiping")}
                      />
                    ) : (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        tabIndex={isActive ? 0 : -1}
                        aria-label={isActive ? `Open ${m.caption || kindLabel(m.media_kind)} full size` : undefined}
                        onClick={(e) => {
                          if (isActive) return;
                          e.preventDefault();
                          if (loop) swiper?.slideToLoop(slides.indexOf(m));
                          else swiper?.slideTo(slides.indexOf(m));
                        }}
                        className="block h-full w-full"
                      >
                        <img
                          src={m.url}
                          alt={m.caption ?? `Venue ${kindLabel(m.media_kind)}`}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-2.5 pt-8">
                      <span className="min-w-0 truncate text-[12px] font-medium text-white">{m.caption}</span>
                      <Badge variant="secondary" className="shrink-0 bg-background/85 text-[10px] capitalize backdrop-blur">
                        {kindLabel(m.media_kind)}
                      </Badge>
                    </div>
                  </div>
                )}
              </SwiperSlide>
            ))}
          </Swiper>

          {slides.length > 1 && (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Previous photo"
                disabled={!loop && edge.start}
                onClick={() => swiper?.slidePrev()}
                className="absolute left-1 top-[calc(50%-1.125rem)] z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-sm backdrop-blur sm:left-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Next photo"
                disabled={!loop && edge.end}
                onClick={() => swiper?.slideNext()}
                className="absolute right-1 top-[calc(50%-1.125rem)] z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-border bg-background/90 shadow-sm backdrop-blur sm:right-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((m) => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium capitalize transition-colors hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              {m.caption || kindLabel(m.media_kind)}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
}
