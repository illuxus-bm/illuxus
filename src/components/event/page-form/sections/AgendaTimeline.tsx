import { useState } from "react";
import { format } from "date-fns";
import type { ThemeConfig } from "../types";
import type { RendererSession, RendererSpeaker } from "../PublicEventRenderer";

/** Sessions shown before the "See all" button. */
const PREVIEW = 4;

// Times are stored as the organiser's wall-clock time; drop the offset so
// every visitor sees the programme's own times.
const startLabel = (session: RendererSession) =>
  format(new Date(session.start_time.split("+")[0].split("Z")[0]), "h:mm a");

/** Tag colours per session type; anything else gets the neutral tag. */
const TAG_TONES: Record<string, { bg: string; fg: string }> = {
  panel: { bg: "#E6EEFA", fg: "#1D4F91" },
  announcement: { bg: "#FFF1DD", fg: "#844700" },
  keynote: { bg: "#F1E8FD", fg: "#5B2A9E" },
  workshop: { bg: "#E3F5EC", fg: "#0A6B4A" },
};
const NEUTRAL_TAG = { bg: "#EEF1F0", fg: "#3B4541" };

const isBreak = (s: RendererSession) => /break|lunch|breakfast|registration|networking/i.test(s.session_type);

/**
 * One day's programme as a timeline: a rail with a dot per session, the time
 * in its own column from tablet up, and a card per session with its type tag
 * and the faces of the people on it. Breaks are drawn quieter. Long days open
 * on the first few sessions with a button for the rest.
 */
export function AgendaTimeline({
  sessions,
  theme,
  speakerById,
}: {
  sessions: RendererSession[];
  theme: ThemeConfig;
  speakerById: Record<string, RendererSpeaker>;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? sessions : sessions.slice(0, PREVIEW);
  const line = `${theme.textColor}1a`;
  const surface = `${theme.textColor}0a`;

  return (
    <div>
      <ol className="flex flex-col">
        {shown.map((session, i) => {
          const ids = session.speaker_ids?.length ? session.speaker_ids : session.speaker_id ? [session.speaker_id] : [];
          const people = ids.map((id) => speakerById[id]).filter(Boolean);
          const quiet = isBreak(session);
          const first = i === 0;
          const last = i === shown.length - 1;
          const tone = quiet ? NEUTRAL_TAG : TAG_TONES[session.session_type.toLowerCase()] ?? NEUTRAL_TAG;
          return (
            <li key={session.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3.5 md:grid-cols-[72px_12px_minmax(0,1fr)]">
              <span
                className="hidden pt-[15px] text-right text-[13.5px] font-semibold md:block"
                style={{ color: theme.primaryColor }}
              >
                {startLabel(session)}
              </span>
              {/* Rail and dot */}
              <span aria-hidden="true" className="relative">
                <span
                  className="absolute left-[5px] w-[2px]"
                  style={{ backgroundColor: line, top: first ? 24 : 0, bottom: last ? undefined : 0, height: last ? 24 : undefined }}
                />
                <span
                  className="absolute left-0 top-5 h-3 w-3 rounded-full border-[3px]"
                  style={{ borderColor: quiet ? `${theme.textColor}40` : theme.primaryColor, backgroundColor: theme.backgroundColor }}
                />
              </span>
              <div
                className="mb-3 flex flex-col gap-2 rounded-[18px] border px-4 py-3.5 md:flex-row md:items-center md:gap-4 md:px-[18px] md:py-4"
                style={quiet ? { backgroundColor: surface, borderColor: "transparent" } : { borderColor: line }}
              >
                <span className="text-[13px] font-semibold md:hidden" style={{ color: theme.primaryColor }}>
                  {startLabel(session)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-[15px] font-semibold leading-[1.45]" style={{ fontFamily: "var(--ev-title-font, Poppins)" }}>
                    {session.title}
                  </span>
                  {session.description && <span className="line-clamp-2 text-[13.5px] opacity-70">{session.description}</span>}
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] opacity-80">
                    <span className="rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-semibold capitalize" style={{ backgroundColor: tone.bg, color: tone.fg }}>
                      {session.session_type}
                    </span>
                    {people.length > 1 && <span className="opacity-75">{people.length} speakers</span>}
                    {session.location && <span className="opacity-75">{session.location}</span>}
                  </div>
                </div>
                {people.length > 0 && (
                  <span className="flex shrink-0 items-center">
                    {people.slice(0, 5).map((person, n) => (
                      <span
                        key={person.id}
                        title={person.name}
                        className="flex h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full border-2 text-[10px] font-bold text-white"
                        style={{ marginLeft: n ? -9 : 0, borderColor: theme.backgroundColor, backgroundColor: theme.primaryColor }}
                      >
                        {person.photo_url
                          ? <img loading="lazy" decoding="async" src={person.photo_url} alt={person.name} className="h-full w-full object-cover" />
                          : person.name.charAt(0).toUpperCase()}
                      </span>
                    ))}
                    {people.length > 5 && <span className="ml-1.5 text-[12px] opacity-60">+{people.length - 5}</span>}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {sessions.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 flex h-12 w-full items-center justify-center rounded-[14px] border text-[14.5px] font-semibold transition-colors hover:opacity-80"
          style={{ borderColor: `${theme.textColor}26`, color: theme.textColor }}
        >
          {expanded ? "Show fewer sessions" : `See all ${sessions.length} sessions`}
        </button>
      )}
    </div>
  );
}
