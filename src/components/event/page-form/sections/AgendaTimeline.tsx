import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
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
const isPanel = (s: RendererSession) => /panel/i.test(s.session_type);

/**
 * One day's programme as a timeline: a rail with a dot per session, the time
 * in its own column from tablet up, and a card per session with its type
 * tag. A session with people on it shows their faces and opens to list
 * them — the moderator first, on its own, then the panellists / speakers.
 * Breaks are drawn quieter. Long days open on the first few sessions with a
 * button for the rest.
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
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = expanded ? sessions : sessions.slice(0, PREVIEW);
  const line = `${theme.textColor}1a`;
  const surface = `${theme.textColor}0a`;

  return (
    <div>
      <ol className="flex flex-col">
        {shown.map((session, i) => {
          const moderator = session.moderator_id ? speakerById[session.moderator_id] : undefined;
          const ids = session.speaker_ids?.length ? session.speaker_ids : session.speaker_id ? [session.speaker_id] : [];
          const people = ids.filter((id) => id !== session.moderator_id).map((id) => speakerById[id]).filter(Boolean);
          const everyone = moderator ? [moderator, ...people] : people;
          const quiet = isBreak(session);
          const first = i === 0;
          const last = i === shown.length - 1;
          const tone = quiet ? NEUTRAL_TAG : TAG_TONES[session.session_type.toLowerCase()] ?? NEUTRAL_TAG;
          const memberLabel = isPanel(session) ? "Panellist" : "Speaker";
          const open = openId === session.id;
          const groupName = isPanel(session) ? "panel" : everyone.length === 1 ? "speaker" : "speakers";
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
                className="mb-3 flex min-w-0 flex-col gap-2 rounded-[18px] border px-4 py-3.5 md:px-[18px] md:py-4"
                style={quiet ? { backgroundColor: surface, borderColor: "transparent" } : { borderColor: line }}
              >
                <span className="text-[13px] font-semibold md:hidden" style={{ color: theme.primaryColor }}>
                  {startLabel(session)}
                </span>
                <span className="text-[15px] font-semibold leading-[1.45]" style={{ fontFamily: "var(--ev-title-font, Poppins)" }}>
                  {session.title}
                </span>
                {session.description && <span className="line-clamp-2 text-[13.5px] opacity-70">{session.description}</span>}
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] opacity-80">
                  <span className="rounded-[7px] px-[9px] py-[3px] text-[11.5px] font-semibold capitalize" style={{ backgroundColor: tone.bg, color: tone.fg }}>
                    {session.session_type}
                  </span>
                  {moderator && <span className="opacity-75">Moderated by {moderator.name}</span>}
                  {session.location && <span className="opacity-75">{session.location}</span>}
                </div>

                {everyone.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : session.id)}
                      aria-expanded={open}
                      aria-controls={`session-people-${session.id}`}
                      className="mt-1 flex w-full items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-4 text-left transition-colors hover:opacity-90"
                      style={{ borderColor: line, backgroundColor: surface }}
                    >
                      <span className="flex shrink-0 items-center">
                        {everyone.slice(0, 5).map((person, n) => (
                          <Face key={person.id} person={person} size={30} theme={theme} overlap={n > 0} />
                        ))}
                        {everyone.length > 5 && <span className="ml-1.5 text-[12px] opacity-60">+{everyone.length - 5}</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                        {open ? `Hide the ${groupName}` : `View the ${groupName}`}
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div id={`session-people-${session.id}`} className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                        {moderator && <PersonCard person={moderator} label="Moderator" theme={theme} wide />}
                        {people.map((person) => (
                          <PersonCard key={person.id} person={person} label={memberLabel} theme={theme} />
                        ))}
                      </div>
                    )}
                  </>
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

function Face({ person, size, theme, overlap = false }: {
  person: RendererSpeaker; size: number; theme: ThemeConfig; overlap?: boolean;
}) {
  return (
    <span
      title={person.name}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-[11px] font-bold text-white"
      style={{ width: size, height: size, marginLeft: overlap ? -9 : 0, borderColor: theme.backgroundColor, backgroundColor: theme.primaryColor }}
    >
      {person.photo_url
        ? <img loading="lazy" decoding="async" src={person.photo_url} alt="" className="h-full w-full object-cover" />
        : person.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** A moderator / panellist: photo, role label, name, then title and company. */
function PersonCard({ person, label, theme, wide = false }: { person: RendererSpeaker; label: string; theme: ThemeConfig; wide?: boolean }) {
  const role = [person.designation || person.title, person.company].filter(Boolean).join(", ");
  return (
    <div className={`flex min-w-0 items-center gap-3.5 rounded-2xl p-3 ${wide ? "sm:col-span-2" : ""}`} style={{ backgroundColor: `${theme.textColor}0a` }}>
      <Face person={person} size={52} theme={theme} />
      <div className="min-w-0 leading-[1.35]">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.primaryColor }}>{label}</span>
        <b className="block text-[15px] font-semibold leading-snug">{person.name}</b>
        {role && <span className="block text-[12.5px] leading-[1.45] opacity-70">{role}</span>}
      </div>
    </div>
  );
}
