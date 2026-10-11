import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ThemeConfig } from "../types";
import type { RendererSession, RendererSpeaker } from "../PublicEventRenderer";

/** Days with this many sessions or fewer are short enough to show in full. */
const PLAIN_LIST_MAX = 3;
/** Height of the route window; the list moves inside it. */
const WINDOW_HEIGHT = "min(62svh, 560px)";
/** Where the route pins while the page scrolls past it (clears the site header). */
const PIN_TOP = "6rem";
/** Page scroll spent per pixel the list has to travel, so a long day stays short. */
const TRAVEL_RATIO = 0.6;
const MIN_TRAVEL = 240;

/**
 * Sticky positioning only works when nothing between the element and the
 * scrolling ancestor clips overflow. Returns that ancestor (null for the
 * page itself), or false when an ancestor would trap the sticky element.
 */
function findScrollParent(el: HTMLElement): HTMLElement | null | false {
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "visible" || overflowY === "clip") continue;
    return overflowY !== "hidden" && node.scrollHeight > node.clientHeight + 1 ? node : false;
  }
  return null;
}

const startLabel = (session: RendererSession) =>
  format(new Date(session.start_time.split("+")[0].split("Z")[0]), "h:mm a");

/**
 * One day's agenda drawn as a route. Sessions are stops along a line shown
 * through a fixed-height window, so a long programme no longer stretches the
 * page. The window pins while the page scrolls past and the page scroll
 * moves the list, so mouse wheel, touchpad, touch and keyboard all drive it
 * the same way. A marker travels down the line in step, the line fills
 * behind it, and stops tip back and recede as they get further from it.
 *
 * Where the surrounding layout would trap a pinned element, the window
 * scrolls on its own instead.
 *
 * Short days (three sessions or fewer) skip the window and render in full.
 */
export function AgendaRoadmap({
  sessions,
  theme,
  speakerById,
}: {
  sessions: RendererSession[];
  theme: ThemeConfig;
  speakerById: Record<string, RendererSpeaker>;
}) {
  const track = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const scrollParent = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const traveller = useRef<HTMLSpanElement>(null);
  const stops = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const windowed = sessions.length > PLAIN_LIST_MAX;
  const [canPin, setCanPin] = useState(true);
  const pinned = windowed && canPin;

  useLayoutEffect(() => {
    if (!windowed || !track.current) return;
    const parent = findScrollParent(track.current);
    scrollParent.current = parent || null;
    setCanPin(parent !== false);
  }, [windowed]);

  /** How far the page has carried the pinned window through its track, 0 to 1. */
  const pinProgress = () => {
    const outer = track.current?.getBoundingClientRect();
    const inner = pin.current?.getBoundingClientRect();
    if (!outer || !inner) return { progress: 0, travel: 0 };
    const travel = outer.height - inner.height;
    return { progress: travel > 1 ? Math.min(Math.max((inner.top - outer.top) / travel, 0), 1) : 0, travel };
  };

  const centreOf = (el: HTMLElement) => (list.current?.offsetTop ?? 0) + el.offsetTop + el.offsetHeight / 2;

  const update = useCallback(() => {
    const box = scroller.current;
    const ol = list.current;
    if (!box || !ol) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reach = box.clientHeight * 0.6;
    const present = stops.current.filter((el): el is HTMLLIElement => !!el);
    if (!present.length) return;
    const first = centreOf(present[0]);
    const last = centreOf(present[present.length - 1]);
    // The traveller rides the line from the first stop to the last as the
    // window scrolls from top to bottom, so no blank lead-in is needed.
    const maxScroll = Math.max(box.scrollHeight - box.clientHeight, 1);
    if (pinned && track.current && pin.current) {
      track.current.style.height = `${pin.current.offsetHeight + Math.max(maxScroll * TRAVEL_RATIO, MIN_TRAVEL)}px`;
      box.scrollTop = pinProgress().progress * maxScroll;
    } else if (track.current) {
      track.current.style.height = "";
    }
    const marker = first + (last - first) * Math.min(box.scrollTop / maxScroll, 1);
    if (traveller.current) traveller.current.style.top = `${(marker - box.scrollTop).toFixed(1)}px`;
    let nearest = 0;
    let nearestDistance = Infinity;

    stops.current.forEach((el, i) => {
      if (!el) return;
      const centre = centreOf(el);
      const offset = (centre - marker) / reach;
      const away = Math.min(Math.abs(offset), 1);
      if (windowed && !still) {
        el.style.transform = `rotateX(${(-offset * 24).toFixed(1)}deg) translateZ(${(-away * 70).toFixed(0)}px)`;
        el.style.opacity = (1 - away * 0.62).toFixed(2);
      } else {
        el.style.transform = "";
        el.style.opacity = "";
      }
      const dot = el.firstElementChild as HTMLElement | null;
      if (dot) dot.style.backgroundColor = !windowed || centre <= marker + 1 ? theme.primaryColor : theme.backgroundColor;
      if (Math.abs(centre - marker) < nearestDistance) {
        nearestDistance = Math.abs(centre - marker);
        nearest = i;
      }
    });

    // Tilt around the marker, not around the middle of the whole list.
    ol.style.perspectiveOrigin = `50% ${(marker - ol.offsetTop).toFixed(0)}px`;
    const top = first - ol.offsetTop;
    const length = Math.max(last - first, 0);
    if (line.current) {
      line.current.style.top = `${top}px`;
      line.current.style.height = `${length}px`;
    }
    if (fill.current) {
      fill.current.style.top = `${top}px`;
      fill.current.style.height = `${windowed ? Math.min(Math.max(marker - first, 0), length) : length}px`;
    }
    if (windowed) setActive(nearest);
  }, [windowed, pinned, theme.primaryColor, theme.backgroundColor]);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    schedule();
    // Capture phase, so it hears the page and any scrolling panel around it.
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    if (list.current) observer.observe(list.current);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [update, sessions]);

  // A new day starts back at its first stop. When pinned, the page position decides.
  useEffect(() => {
    if (!pinned) scroller.current?.scrollTo({ top: 0 });
  }, [sessions, pinned]);

  const goTo = (index: number) => {
    const box = scroller.current;
    const present = stops.current.filter((el): el is HTMLLIElement => !!el);
    const el = stops.current[Math.max(0, Math.min(sessions.length - 1, index))];
    if (!box || !el || present.length < 2) return;
    const first = centreOf(present[0]);
    const last = centreOf(present[present.length - 1]);
    const target = (centreOf(el) - first) / Math.max(last - first, 1);
    if (pinned) {
      const { progress, travel } = pinProgress();
      (scrollParent.current ?? window).scrollBy({ top: (target - progress) * travel, behavior: "smooth" });
    } else {
      box.scrollTo({ top: target * (box.scrollHeight - box.clientHeight), behavior: "smooth" });
    }
  };

  const hairline = `${theme.textColor}22`;
  const fade = "linear-gradient(to bottom, transparent, #000 6%, #000 94%, transparent)";

  return (
    <div ref={track}>
      <div ref={pin} className={pinned ? "sticky" : undefined} style={pinned ? { top: PIN_TOP } : undefined}>
        {windowed && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold opacity-70" aria-live="polite">
              Stop {active + 1} of {sessions.length}
              <span className="opacity-60"> · {startLabel(sessions[active] ?? sessions[0])}</span>
            </p>
            <div className="flex gap-1.5">
              {[
                { label: "Previous session", Icon: ChevronUp, step: -1, disabled: active === 0 },
                { label: "Next session", Icon: ChevronDown, step: 1, disabled: active === sessions.length - 1 },
              ].map(({ label, Icon, step, disabled }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  disabled={disabled}
                  onClick={() => goTo(active + step)}
                  className="grid h-8 w-8 place-items-center rounded-full border transition-opacity disabled:opacity-30"
                  style={{ borderColor: hairline, color: theme.textColor }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          {/* The traveller: moves down the line in step with the scroll. */}
          {windowed && (
            <span
              ref={traveller}
              aria-hidden="true"
              className="pointer-events-none absolute left-[5px] top-0 z-10 h-[14px] w-[14px] -translate-y-1/2 rounded-full"
              style={{ backgroundColor: theme.primaryColor, boxShadow: `0 0 0 5px ${theme.primaryColor}33, 0 0 18px ${theme.primaryColor}` }}
            />
          )}
          <div
            ref={scroller}
            tabIndex={windowed && !pinned ? 0 : undefined}
            role={windowed && !pinned ? "group" : undefined}
            aria-label={windowed && !pinned ? "Agenda, scroll to move through the day" : undefined}
            className={
              pinned
                ? "relative overflow-hidden"
                : windowed
                  ? "relative overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none"
                  : "relative"
            }
            style={windowed ? { height: WINDOW_HEIGHT, maskImage: fade, WebkitMaskImage: fade } : undefined}
          >
            <ol
              ref={list}
              className="relative space-y-3"
              style={windowed ? { paddingBlock: "28px", perspective: "900px" } : undefined}
            >
              <span ref={line} aria-hidden="true" className="absolute left-[11px] w-[2px] rounded-full" style={{ backgroundColor: hairline }} />
              <span ref={fill} aria-hidden="true" className="absolute left-[11px] w-[2px] rounded-full" style={{ backgroundColor: theme.primaryColor }} />
              {sessions.map((session, i) => {
                const ids = session.speaker_ids?.length ? session.speaker_ids : session.speaker_id ? [session.speaker_id] : [];
                const people = ids.map((id) => speakerById[id]).filter(Boolean);
                const here = windowed && i === active;
                return (
                  <li
                    key={session.id}
                    ref={(node) => {
                      stops.current[i] = node;
                    }}
                    className="relative pl-9 will-change-transform"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-[6px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 transition-colors"
                      style={{ borderColor: theme.primaryColor, backgroundColor: theme.backgroundColor }}
                    />
                    <div
                      className="flex flex-col gap-1 rounded-xl border p-4 transition-colors duration-300 sm:flex-row sm:gap-4"
                      style={{
                        borderColor: here ? theme.primaryColor : `${theme.primaryColor}1f`,
                        backgroundColor: here ? `${theme.primaryColor}14` : "transparent",
                      }}
                    >
                      <div className="text-sm font-semibold sm:w-24 sm:whitespace-nowrap" style={{ color: theme.primaryColor }}>
                        {startLabel(session)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold" style={{ fontFamily: "var(--ev-title-font, Poppins)" }}>
                          {session.title}
                        </p>
                        {session.description && <p className="mt-1 line-clamp-2 text-sm opacity-70">{session.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-60">
                          <span className="capitalize">{session.session_type}</span>
                          {session.location && (
                            <>
                              <span>·</span>
                              <span>{session.location}</span>
                            </>
                          )}
                        </div>
                        {people.length > 0 && (
                          <TooltipProvider delayDuration={150}>
                            <div className="mt-2.5 flex items-center gap-1.5">
                              {people.map((person) => (
                                <UITooltip key={person.id}>
                                  <TooltipTrigger asChild>
                                    <span
                                      title={person.name}
                                      aria-label={person.name}
                                      className="flex aspect-square h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold ring-1"
                                      style={{ backgroundColor: theme.primaryColor, color: "#fff", boxShadow: `0 0 0 1px ${theme.textColor}22 inset` }}
                                    >
                                      {person.photo_url ? (
                                        <img src={person.photo_url} alt={person.name} className="h-full w-full object-cover" />
                                      ) : (
                                        person.name.charAt(0).toUpperCase()
                                      )}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {person.name}
                                  </TooltipContent>
                                </UITooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgendaRoadmap;
