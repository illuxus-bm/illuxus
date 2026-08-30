/**
 * DEV-only side-by-side preview of the reference-matched Event_Promo
 * templates, at `/__preview/creatives`.
 *
 * Exists because the only way to judge whether a creative matches a reference
 * design is to look at it, and the generator dialog renders previews at 360px
 * inside a side pane — too small to assess typography, and reachable only
 * after picking an event, a type, an entity and a format.
 *
 * Every canvas here goes through `CreativePreviewCanvas`, i.e. the same
 * `buildEventPlan` → `decoratePlanWithCustomization` → `drawPlan` path the
 * real PNG export uses (Property 49, Preview_Parity). So what renders on this
 * page is what downloads — this is not a mock-up.
 *
 * Mirrors `QuickViewsPreviewPage`'s conventions: DEV-gated in `App.tsx`, no
 * auth or org gate, no data fetching.
 */
import CreativePreviewCanvas from "@/components/event/creatives/CreativePreviewCanvas";
import type { EventPromoLike } from "@/lib/creatives/creative-renderer";
import {
  EVENT_TEMPLATES,
  PLATFORM_FORMATS,
  type CreativeTemplate,
  type EventTheme,
  type PlatformFormat,
} from "@/lib/creatives/creative-templates";

/** Copy taken verbatim from the supplied reference designs, so the rendered
 *  output can be compared against them line for line. */
const SUMMER_EDITION: EventPromoLike = {
  id: "preview-summer",
  editionLabel: "Summer Edition",
  tagline: "You\u2019re Invited",
  titleLead: "India\u2019s Largest",
  title: "Virtual HR Summit",
  dateLabel: "23rd July, 2026",
  ctaLabel: "Register for FREE",
  wordmarkUrl: null,
  stats: [
    { value: "6000+", label: "Attendees" },
    { value: "30+", label: "Speakers" },
    { value: "10+", label: "Sessions" },
    { value: "10+", label: "Partners" },
  ],
};

const MIDDLE_EAST_EDITION: EventPromoLike = {
  id: "preview-me",
  editionLabel: "Middle East Edition",
  tagline: "You\u2019re Invited",
  titleLead: "Middle East\u2019s Largest",
  title: "Virtual HR Summit",
  dateLabel: "21st July, 2026",
  ctaLabel: "Register for FREE",
  wordmarkUrl: null,
  stats: [
    { value: "2000+", label: "Attendees" },
    { value: "20+", label: "Speakers" },
    { value: "10", label: "Sessions" },
    { value: "10", label: "Partners" },
  ],
};

/** A promo with the optional fields absent, to confirm slots collapse rather
 *  than leaving holes — the failure mode the plan builders guard against. */
const SPARSE: EventPromoLike = {
  id: "preview-sparse",
  title: "Annual Product Summit",
  wordmarkUrl: null,
};

const NO_THEME: EventTheme = {};

function formatById(id: string): PlatformFormat {
  const found = PLATFORM_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown preview format id: ${id}`);
  return found;
}

function templateById(id: string): CreativeTemplate {
  const found = EVENT_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown preview template id: ${id}`);
  return found;
}

interface PreviewCellProps {
  label: string;
  templateId: string;
  formatId: string;
  promo: EventPromoLike;
  maxWidthPx?: number;
}

function PreviewCell({ label, templateId, formatId, promo, maxWidthPx }: PreviewCellProps) {
  const template = templateById(templateId);
  const format = formatById(formatId);

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="mx-1.5">·</span>
        {template.name}
        <span className="mx-1.5">·</span>
        {format.label} ({format.width}×{format.height})
      </figcaption>
      <CreativePreviewCanvas
        mode="event"
        template={template}
        format={format}
        theme={NO_THEME}
        eventPromo={promo}
        maxWidthPx={maxWidthPx ?? 560}
      />
    </figure>
  );
}

export default function CreativesPreviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Event creative previews</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Rendered through the same plan-and-draw path as the PNG export, so
          these are the actual outputs rather than approximations. Each template
          is shown at a format from its <code>preferredFormatIds</code>.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Reference layouts</h2>
        <div className="grid gap-8 lg:grid-cols-2">
          <PreviewCell
            label="Square invite"
            templateId="event-invite-envelope-ref"
            formatId="instagram-post"
            promo={SUMMER_EDITION}
          />
          <PreviewCell
            label="Square invite"
            templateId="event-invite-envelope-ref"
            formatId="instagram-post"
            promo={MIDDLE_EAST_EDITION}
          />
          <PreviewCell
            label="Wide banner"
            templateId="event-stats-hero-ref"
            formatId="linkedin-post"
            promo={SUMMER_EDITION}
          />
          <PreviewCell
            label="Wide banner"
            templateId="event-stats-hero-ref"
            formatId="linkedin-post"
            promo={MIDDLE_EAST_EDITION}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Sparse promo</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Only <code>title</code> is set. Absent optional fields should drop
          their slot entirely — no empty pills, no gaps where a lead-in line
          would have gone, no literal &quot;undefined&quot;.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <PreviewCell
            label="Square invite"
            templateId="event-invite-envelope-ref"
            formatId="instagram-post"
            promo={SPARSE}
          />
          <PreviewCell
            label="Wide banner"
            templateId="event-stats-hero-ref"
            formatId="linkedin-post"
            promo={SPARSE}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Off-format reflow</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The same compositions on formats outside their{" "}
          <code>preferredFormatIds</code>. Reflow guarantees every box stays
          inside the canvas, but a square envelope was never designed for a
          600×200 banner — which is exactly why templates declare the shapes
          they are meant for.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <PreviewCell
            label="Square invite on a story"
            templateId="event-invite-envelope-ref"
            formatId="instagram-story"
            promo={SUMMER_EDITION}
            maxWidthPx={320}
          />
          <PreviewCell
            label="Wide banner on an email strip"
            templateId="event-stats-hero-ref"
            formatId="email-banner"
            promo={SUMMER_EDITION}
          />
        </div>
      </section>
    </main>
  );
}
