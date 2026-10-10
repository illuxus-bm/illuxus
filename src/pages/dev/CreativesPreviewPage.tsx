/**
 * DEV-only contact sheet of every creative studio template in every format,
 * at `/__preview/creatives`.
 *
 * The only way to judge a poster layout is to look at it, and the studio
 * needs an event with speakers and sponsors before it shows anything. This
 * page feeds the same templates sample data so all of them can be checked at
 * once. Each canvas goes through `renderScene` — the path the PNG export
 * uses — so this is the real output, not a mock-up.
 *
 * `?photos=0` drops the sample photos and logos, to check the fallbacks.
 */
import SceneCanvas from "@/components/event/creatives/SceneCanvas";
import {
  STUDIO_FORMATS,
  STUDIO_TEMPLATES,
  type BuildInput,
  type StudioContent,
  type StudioSpeaker,
} from "@/lib/creatives/studio/templates";

const CONTENT: StudioContent = {
  organizerName: "World Business Academy",
  organizerTagline: "Taking responsibility for the whole",
  kicker: "announces the upcoming visit of",
  eventTitle: "World Business Conference 2026",
  subtitle: "Women in Business",
  dateLine: "27–28 March 2026",
  timeLine: "10:00 AM – 5:00 PM",
  venueName: "The Arlington Theatre",
  venueAddress: "2020 Alameda Padre Serra, Suite 135, Santa Barbara, CA 93103",
  infoLabel: "For tickets and information:",
  website: "worldbusiness.org/conference",
  phone: "805.892.4600",
  ctaLabel: "Register now",
  description: "Join us for an inspiring and practical session designed exclusively for leaders in business.",
  bullets: "Turning passion into profit\nBuilding a personal brand that sells\nNetworking secrets\nConfidence coaching",
  badge: "Live",
  formatLabel: "Webinar",
  speakersLabel: "Guest speakers",
  sponsorLabel: "Sponsor",
  linkLabel: "Register online",
  sideLabel: "Speaker #1",
  scriptLine: "A Session",
};

const NAMES: Array<[string, string]> = [
  ["Maela Agatha", "CEO, Salford & Co."],
  ["John Levis", "Founder, Northwind"],
  ["Dave Light", "CTO, Borcelle"],
  ["Mary Ann", "Partner, Larana Inc."],
  ["Heart Joy", "Director, Fauget"],
];

export default function CreativesPreviewPage() {
  const withPhotos = new URLSearchParams(window.location.search).get("photos") !== "0";
  const speakers: StudioSpeaker[] = NAMES.map(([name, role], i) => ({
    id: `speaker-${i}`,
    name,
    role,
    bio: "Maela has spent fifteen years building and leading product teams, and now advises founders on turning early traction into durable businesses.",
    photoUrl: withPhotos ? `https://picsum.photos/id/${[1027, 1005, 177, 64, 823][i]}/800/1000` : null,
  }));

  return (
    <div className="min-h-screen bg-neutral-200 p-8">
      {STUDIO_TEMPLATES.map((template) => (
        <section key={template.id} className="mb-12" data-template={template.id}>
          <h2 className="mb-4 text-lg font-semibold text-neutral-800">{template.name}</h2>
          <div className="flex flex-wrap items-start gap-6">
            {STUDIO_FORMATS.filter((f) => !template.formats || template.formats.includes(f.id)).map((format) => {
              const input: BuildInput = {
                format,
                content: CONTENT,
                speakers: speakers.slice(0, template.maxSpeakers),
                sponsors: [{ id: "sponsor-1", name: "Men's Wearhouse", logoUrl: null }],
                organizerLogoUrl: null,
                coverImageUrl: null,
                year: "2026",
                palette: template.palette,
              };
              return (
                <div key={format.id} style={{ width: format.width / 2 }} data-format={format.id}>
                  <p className="mb-2 text-xs text-neutral-600">
                    {format.label} · {format.width} × {format.height}
                  </p>
                  <SceneCanvas scene={template.build(input)} pixelWidth={format.width / 2} className="shadow-lg" />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
