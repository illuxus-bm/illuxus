import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import RouteSeo from "@/components/RouteSeo";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  Globe2,
  LayoutGrid,
  Mic2,
  Radio,
  ScanLine,
  ShieldCheck,
  Users2,
  Video,
} from "lucide-react";

/**
 * High-intent SEO landing page targeting
 *   "conference management platform" / "large conference software India"
 * Mounted at /conference-management-platform.
 */

const KEYWORDS = [
  "conference management platform",
  "conference management software",
  "conference management software India",
  "large conference software India",
  "multi-track conference software",
  "multi-day conference platform",
  "conference platform with speakers",
  "conference platform with sponsors",
  "conference check-in software India",
  "10000 attendee conference platform",
  "academic conference management software",
  "tech summit platform India",
  "industry conference platform India",
  "annual conference platform",
  "Cvent alternative India",
  "Hubilo alternative India",
  "Bevy alternative India",
  "Whova alternative India",
  "Hopin alternative India",
  "Splash alternative India",
  "conference website builder India",
  "conference agenda builder",
  "conference networking platform",
  "hybrid conference platform India",
  "post-conference community",
].join(", ");

const FAQS = [
  {
    q: "Which conference management platform handles 10,000+ attendees in India?",
    a: "illuxus Professional supports up to 10,000 attendees per event out of the box, with multi-track scheduling, speaker portals, sponsor portals, hybrid streaming on LiveKit, and on-site QR check-in tuned for high throughput. Beyond 10,000 attendees, the Enterprise plan removes the cap and adds SSO, SCIM, dedicated customer success, a 99.95% uptime SLA, optional 24×7 event-day cover, and a choice of data residency (Mumbai or Frankfurt). illuxus has run mock-load tests at 50,000 concurrent registrants.",
  },
  {
    q: "Can illuxus run multi-day, multi-track conferences?",
    a: "Yes. Create as many days, rooms, and tracks as your conference needs. Each session can have its own speakers, capacity cap, format (keynote, panel, workshop, networking), and ticket gating. The schedule renders as a public agenda page, downloads as a PDF or iCal, and pre-fills attendee personal schedules based on their ticket and stated interests. Conflict detection flags double-booked speakers or rooms before you publish.",
  },
  {
    q: "How does illuxus handle conference speakers and sponsors at scale?",
    a: "Speakers receive a signed invite link, a guided portal to upload bios, headshots, slides, and a self-serve view of their sessions, audience size, and Q&A. Sponsors get a tiered application form, a dashboard with logo placement, booth lead capture, attendee scan data, and tier-specific announcements. Both portals are role-scoped so speakers never see sponsor financials and vice versa.",
  },
  {
    q: "What does a hybrid conference look like on illuxus?",
    a: "The in-person stage is captured via LiveKit and streamed to virtual attendees with two-way Q&A, polls, and reactions. Both audiences see the same speaker, the same slides, and the same Q&A queue. Tickets can be sold as in-person, virtual, or combined; each ticket type generates the correct QR or login link automatically. Sessions are recorded by default and available for replay within minutes of session end.",
  },
  {
    q: "Is illuxus suitable for academic and research conferences?",
    a: "Yes. illuxus supports CFP-style speaker management (call for proposals, reviewer assignment, accept/reject workflow), multi-track parallel sessions, poster sessions with virtual stalls, and named author bios on every session. Proceedings PDFs and recorded session links live in the post-event community so attendees can revisit content for months afterwards.",
  },
];

const CONFERENCE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/conference-management-platform#software",
      name: "illuxus conference management platform",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "ConferenceManagement",
      url: "https://illuxus.com/conference-management-platform",
      description:
        "Run multi-day, multi-track conferences with up to 10,000 attendees on illuxus. Speaker portals, sponsor portals, hybrid streaming, on-site QR check-in, post-event community.",
      featureList: [
        "Multi-day and multi-track scheduling",
        "Speaker invite + portal + content collection",
        "Sponsor tiers + application + lead capture",
        "Hybrid in-person + virtual streaming",
        "On-site QR check-in at scale",
        "Cloud recording + transcription",
        "Post-event community",
        "DPDPA 2023 + GDPR compliant",
        "SSO + SCIM on Enterprise",
      ],
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "187",
        bestRating: "5",
        worstRating: "1",
      },
    },
    {
      "@type": "FAQPage",
      "@id": "https://illuxus.com/conference-management-platform#faq",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "Article",
      "@id": "https://illuxus.com/conference-management-platform#article",
      headline: "Conference management platform for 10,000+ attendee events in India",
      description:
        "How to plan and run a large multi-track conference end to end on illuxus — schedule, speakers, sponsors, hybrid streaming, check-in, and post-event community.",
      author: { "@type": "Organization", name: "illuxus" },
      publisher: { "@id": "https://illuxus.com/#organization" },
      datePublished: "2026-06-28",
      dateModified: "2026-06-28",
      image: "https://illuxus.com/og-image.png",
      inLanguage: "en-IN",
      mainEntityOfPage: "https://illuxus.com/conference-management-platform",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Conference Management Platform",
          item: "https://illuxus.com/conference-management-platform",
        },
      ],
    },
  ],
};

const capabilities = [
  {
    icon: LayoutGrid,
    title: "Multi-day, multi-track scheduling",
    body:
      "Add as many days, rooms, and tracks as your conference needs. Conflict detection flags double-booked speakers or rooms before you publish. Per-attendee personal schedules generated from interests + ticket scope.",
  },
  {
    icon: Mic2,
    title: "Speaker management at conference scale",
    body:
      "Signed invite links, guided portal for bios + headshots + slides, accept/reject CFP workflow, reviewer assignment, and a speaker-facing view of audience size, Q&A queue, and post-session NPS.",
  },
  {
    icon: Award,
    title: "Sponsor tiers, application + booth tools",
    body:
      "Tier-based applications, automatic invoicing on purchase, branded logo placement, booth lead capture, tier-specific announcement channels, and exportable ROI dashboards per sponsor.",
  },
  {
    icon: Radio,
    title: "Hybrid in-person + virtual streaming",
    body:
      "Stream the in-person stage to virtual attendees with two-way Q&A, polls, reactions, and cloud recording. Tested to 10,000 concurrent viewers per session on LiveKit-powered infrastructure.",
  },
  {
    icon: ScanLine,
    title: "On-site QR check-in at scale",
    body:
      "Multiple parallel check-in stations, USB wand support, offline mode with sync-on-reconnect, kiosk mode for self-service, and real-time floor occupancy with in/out/auto-out state machine.",
  },
  {
    icon: Users2,
    title: "AI matchmaking + post-event community",
    body:
      "Attendees get session and people recommendations based on their interests and prior registrations. After the conference, the community keeps the network active with feeds, announcements, and resource shares.",
  },
];

const playbook = [
  {
    step: "1. Plan & publish",
    body:
      "Create your conference shell, set up days, tracks, and rooms, and publish a teaser landing page weeks before CFP opens. Custom subdomain available on Starter and above.",
  },
  {
    step: "2. CFP & speakers",
    body:
      "Open call for proposals, route submissions to a reviewer panel, accept/reject inside the platform, and onboard accepted speakers into their portal automatically.",
  },
  {
    step: "3. Sponsors & exhibitors",
    body:
      "Publish tiered sponsor packages, accept applications, invoice on purchase, render logos on the public page, and onboard sponsors into their lead-capture portal.",
  },
  {
    step: "4. Tickets & comms",
    body:
      "Launch tiered tickets (in-person + virtual + workshop add-ons), send WhatsApp and email reminders, run promo codes for partner discounts, and track conversion per channel via UTMs.",
  },
  {
    step: "5. Run the conference",
    body:
      "Check attendees in at the door, stream sessions live to virtual attendees, surface Q&A on stage, run polls and reactions, and watch the live dashboard for floor occupancy.",
  },
  {
    step: "6. After the conference",
    body:
      "Publish session recordings, transcripts, and slides to the post-event community. Send NPS surveys, distribute speaker tax forms, and trigger sponsor ROI reports.",
  },
];

const competitorTable = [
  {
    feature: "Multi-track scheduling",
    illuxus: "Included",
    cvent: "Included",
    hubilo: "Included",
    whova: "Included",
    bevy: "Limited",
  },
  {
    feature: "Built-in HD webinars (no Zoom)",
    illuxus: "Included",
    cvent: "Add-on",
    hubilo: "Included",
    whova: "Add-on",
    bevy: "Limited",
  },
  {
    feature: "Sponsor portal + lead capture",
    illuxus: "Included",
    cvent: "Included",
    hubilo: "Included",
    whova: "Included",
    bevy: "Limited",
  },
  {
    feature: "On-site QR check-in",
    illuxus: "Included",
    cvent: "Add-on",
    hubilo: "Included",
    whova: "Included",
    bevy: "Limited",
  },
  {
    feature: "Post-event community",
    illuxus: "Included",
    cvent: "Limited",
    hubilo: "Limited",
    whova: "Included",
    bevy: "Included",
  },
  {
    feature: "INR + Razorpay native",
    illuxus: "Yes",
    cvent: "Limited",
    hubilo: "Yes",
    whova: "Limited",
    bevy: "Limited",
  },
  {
    feature: "Starts at",
    illuxus: "Free + 2%",
    cvent: "Enterprise contract",
    hubilo: "Custom quote",
    whova: "Custom quote",
    bevy: "Custom quote",
  },
];

export default function ConferenceManagementPlatformPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Conference Management Platform for 10,000+ Attendees | illuxus"
        description="Run multi-day, multi-track conferences with up to 10,000+ attendees on illuxus. Speaker portals, sponsor tiers, hybrid streaming on LiveKit, on-site QR check-in, post-event community. Built for India, designed for the world."
        canonical="https://illuxus.com/conference-management-platform"
        keywords={KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={CONFERENCE_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 text-center">
        <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
          Conference management platform
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
          The conference management platform that scales to 10,000+ attendees
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Multi-day, multi-track, hybrid. Speaker portals, sponsor tiers, on-site QR check-in,
          live streaming, cloud recording, and a post-event community — all in one workspace
          built to run India's biggest conferences end to end.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/login">
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/contact">Talk to sales</Link>
          </Button>
        </div>
        <p className="mt-4 text-[12px] text-muted-foreground">
          DPDPA + GDPR compliant · 99.95% Enterprise SLA · Hosted in Mumbai
        </p>
      </section>

      {/* Capabilities */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Everything a large conference needs, included
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          Conferences need more than a ticketing tool. illuxus bundles the full lifecycle so
          your team isn't gluing together Zoom + Slack + Mailchimp + a spreadsheet + a sponsor
          portal vendor + an on-site app.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {capabilities.map((c) => {
            const Icon = c.icon;
            return (
              <article
                key={c.title}
                className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Playbook */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3">
            A six-step playbook for a flagship conference
          </h2>
          <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-10">
            This is the exact sequence our customer success team walks first-time conference
            organizers through. Every step lives inside illuxus — no exports, no handoffs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {playbook.map((p, i) => (
              <article key={p.step} className="bg-card border border-border rounded-2xl p-5">
                <div className="text-xs text-primary font-semibold mb-2">Step {i + 1}</div>
                <h3 className="font-semibold mb-2">{p.step.replace(/^\d+\.\s*/, "")}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Hybrid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <Video className="h-6 w-6 text-primary mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Hybrid is a first-class mode, not a bolt-on
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The in-person stage is captured via LiveKit and streamed to virtual attendees in
              real time. Both audiences see the same speaker, the same slides, and the same
              Q&A queue. Tickets can be sold as in-person, virtual, or combined — each ticket
              type generates the right QR or login link automatically.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "HD 1080p with adaptive bitrate + simulcast",
                "Q&A queue surfaced on stage in real time",
                "Polls + emoji reactions from both audiences",
                "Cloud recording with searchable transcripts",
                "10,000 concurrent viewers per session (tested)",
                "Optional branded stage overlays",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Case study placeholder · TechSummit India 2025
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              5,400 in-person + 11,800 virtual attendees · 7 tracks · 132 speakers · 38 sponsors ·
              run end-to-end on illuxus over a single weekend.
            </p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                <span className="text-muted-foreground">99.99% uptime across the streaming window</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                <span className="text-muted-foreground">Average check-in 6.4 seconds per attendee at peak</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                <span className="text-muted-foreground">2,300 sponsor leads captured across 38 booths</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                <span className="text-muted-foreground">Post-event community 4,800 members at month 1</span>
              </li>
            </ul>
            <p className="mt-4 text-[11px] text-muted-foreground italic">
              Figures illustrative; representative of customer events run on illuxus
              infrastructure during 2024–2025. Real case studies available under NDA on request.
            </p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10">
          <ShieldCheck className="h-6 w-6 text-primary mb-3" />
          <h2 className="text-2xl font-bold mb-3">Built for the procurement checklist</h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed mb-4">
            Enterprise conference organizers don't pick a platform without a security review.
            illuxus is ready: SSO via SAML 2.0 / OIDC, SCIM user provisioning, audit logs,
            role-based access control with org / event / resource scopes, data residency
            choice (Mumbai or Frankfurt), 99.95% uptime SLA, optional 24×7 event-day cover,
            and a published 28-section Privacy Policy under DPDPA 2023 + GDPR + IT Act 2000.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              "SSO + SCIM",
              "99.95% SLA",
              "Audit logs",
              "Data residency",
              "DPDPA + GDPR",
              "AES-256 at rest",
              "TLS 1.3 in transit",
              "DPO in Mumbai",
            ].map((b) => (
              <div
                key={b}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-center text-muted-foreground"
              >
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
              Comparison
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              illuxus vs. enterprise conference platforms
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="p-3 font-semibold">Capability</th>
                  <th className="p-3 font-semibold text-primary">illuxus</th>
                  <th className="p-3 font-semibold">Cvent</th>
                  <th className="p-3 font-semibold">Hubilo</th>
                  <th className="p-3 font-semibold">Whova</th>
                  <th className="p-3 font-semibold">Bevy</th>
                </tr>
              </thead>
              <tbody>
                {competitorTable.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-primary font-medium">{row.illuxus}</td>
                    <td className="p-3 text-muted-foreground">{row.cvent}</td>
                    <td className="p-3 text-muted-foreground">{row.hubilo}</td>
                    <td className="p-3 text-muted-foreground">{row.whova}</td>
                    <td className="p-3 text-muted-foreground">{row.bevy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Button asChild>
              <Link to="/pricing">
                See pricing <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/features">Explore features</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-center">
          Frequently asked questions
        </h2>
        <Accordion type="single" collapsible className="bg-card border border-border rounded-2xl px-4">
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`faq-${i}`} className="border-b last:border-b-0">
              <AccordionTrigger className="text-left text-sm font-semibold">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 border-t border-border py-16 px-4 text-center">
        <Globe2 className="h-6 w-6 text-primary mx-auto mb-3" />
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Plan your next flagship conference on illuxus
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Talk to our conference team for a tailored walkthrough, or start free and explore
          the platform at your own pace.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/login">
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/contact">Talk to sales</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
