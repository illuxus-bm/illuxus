import { useState } from "react";
import SponsorQuickViewDialog from "@/components/event/page-form/sections/SponsorQuickViewDialog";
import SpeakerQuickViewDialog from "@/components/event/page-form/sections/SpeakerQuickViewDialog";
import type { RendererSponsor, RendererSpeaker } from "@/components/event/page-form/PublicEventRenderer";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Dev-only side-by-side preview for the two quick-view dialogs. Lets designers
 * and visual regression tests confirm that `SponsorQuickViewDialog` and
 * `SpeakerQuickViewDialog` stay aligned across light/dark and breakpoints.
 *
 * Routed at `/__preview/quick-views` only when `import.meta.env.DEV` is true.
 */

const SPONSOR: RendererSponsor = {
  id: "demo-sp",
  name: "Northwind Cloud Platform",
  tier: "platinum",
  tier_label: null,
  logo_url: null,
  website: "https://example.com",
  description:
    "Northwind is the operating system for modern infrastructure teams. We partner with conference organizers to bring practitioners hands-on demos and deep technical workshops.",
};

const SPEAKER: RendererSpeaker = {
  id: "demo-spk",
  name: "Ananya Iyer",
  title: "Keynote",
  designation: "Head of Product",
  company: "Notion",
  bio:
    "Ananya leads product at Notion, where she's spent the last six years shipping collaborative editing primitives. She speaks regularly on building durable async-first teams and is an advisor at several seed-stage productivity startups.",
  photo_url: null,
};

const WIDTHS = [375, 768, 1366] as const;

export default function QuickViewsPreviewPage() {
  const { theme, setTheme } = useTheme();
  const [width, setWidth] = useState<number>(1366);

  return (
    <div className="min-h-dvh bg-background text-foreground p-6">
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Quick View — design preview</h1>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Theme</span>
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 py-1 rounded-full text-sm border ${
                theme === t ? "bg-foreground text-background" : "border-border"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Width</span>
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              className={`px-3 py-1 rounded-full text-sm border ${
                width === w ? "bg-foreground text-background" : "border-border"
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <PreviewFrame label="Sponsor" width={width}>
          <SponsorQuickViewDialog sponsor={SPONSOR} open onOpenChange={() => {}} />
        </PreviewFrame>
        <PreviewFrame label="Speaker" width={width}>
          <SpeakerQuickViewDialog speaker={SPEAKER} open onOpenChange={() => {}} />
        </PreviewFrame>
      </div>
    </div>
  );
}

function PreviewFrame({ label, width, children }: { label: string; width: number; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-xl p-4 bg-card overflow-hidden">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        {label} · {width}px
      </div>
      <div className="mx-auto border border-dashed border-border rounded-lg overflow-hidden" style={{ width }}>
        <div className="relative min-h-[600px]">{children}</div>
      </div>
    </section>
  );
}