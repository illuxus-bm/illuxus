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
  CheckCircle2,
  Cloud,
  MessageSquare,
  Mic2,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Users2,
  Video,
} from "lucide-react";

/**
 * High-intent SEO landing page targeting
 *   "webinar platform India" / "virtual event platform India"
 * Mounted at /webinar-platform-india.
 */

const KEYWORDS = [
  "webinar platform India",
  "best webinar platform India",
  "online webinar platform India",
  "virtual event platform India",
  "online event platform India",
  "host webinars India",
  "HD webinar platform India",
  "LiveKit webinar platform",
  "webinar without Zoom",
  "Zoom webinar alternative India",
  "GoToWebinar alternative India",
  "Demio alternative India",
  "BigMarker alternative India",
  "Livestorm alternative India",
  "webinar platform with Q&A and polls",
  "webinar cloud recording",
  "branded webinar platform",
  "high-quality webinar streaming",
  "webinar platform Razorpay",
  "webinar platform with ticketing",
  "webinar platform DPDPA compliant",
  "lead generation webinar platform",
  "10000 attendee webinar India",
  "marketing webinar software India",
  "training webinar software India",
].join(", ");

const FAQS = [
  {
    q: "What is the best webinar platform in India in 2026?",
    a: "If your top priorities are HD video quality, branded experience, Indian payment support, and DPDPA compliance, illuxus is purpose-built for the brief. It runs on LiveKit (a CNCF-graduated real-time media stack) for sub-second HD streaming, layers in Q&A + polls + reactions + cloud recording, supports INR ticketing via Razorpay + UPI for paid webinars, and renders inside your own custom domain. Zoom and GoToWebinar are mature alternatives but charge per-host seat and add a buyer-side service fee on paid webinar tickets.",
  },
  {
    q: "Do attendees need to install Zoom or any other app?",
    a: "No. illuxus webinars run in the browser — Chrome, Edge, Safari, Firefox — on desktop, tablet, or phone, including iOS Safari. There is no plugin, no app download, no calendar conflict with Zoom. The host gets a full studio interface (camera + screen share + Q&A queue + polls) directly in the browser. Mobile attendees get a touch-optimized viewer with the same chat, Q&A, and reactions.",
  },
  {
    q: "How many concurrent viewers can a single webinar handle?",
    a: "Tested to 10,000 concurrent viewers per session on Professional. Beyond that, the Enterprise plan removes the cap and adds dedicated streaming infrastructure with a 99.95% uptime SLA and optional 24×7 event-day cover. illuxus uses LiveKit's simulcast and adaptive bitrate so a viewer on a 4 Mbps mobile connection gets a smooth low-res stream while a viewer on fibre gets full 1080p — automatically.",
  },
  {
    q: "Are webinars recorded, and where do the recordings live?",
    a: "Yes. Every session is recorded by default, encoded to MP4, transcribed (English + Hindi), and made available inside the event's dashboard usually within minutes of session end. Recordings can be made public (anyone with the link), restricted to ticketholders, or kept private to your team. The transcript is searchable so attendees can find a moment without scrubbing through the video.",
  },
  {
    q: "Can I sell tickets for a paid webinar and run it on illuxus?",
    a: "Yes. Paid webinars are a first-class flow. Set a price in INR (or any of 25+ currencies), accept payments via Razorpay (UPI, cards, NetBanking, EMI) or Stripe (international), auto-issue a GST-compliant tax invoice on purchase, and email the attendee a unique webinar join link. The 2% platform fee applies on paid webinar tickets; free webinars stay free forever.",
  },
];

const WEBINAR_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/webinar-platform-india#software",
      name: "illuxus webinar platform",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "WebinarPlatform",
      url: "https://illuxus.com/webinar-platform-india",
      description:
        "Host HD webinars in India on illuxus — LiveKit-powered streaming, Q&A, polls, reactions, cloud recording, INR ticketing via Razorpay + UPI, branded stage, DPDPA compliant.",
      featureList: [
        "HD 1080p streaming on LiveKit",
        "Q&A queue, polls, emoji reactions",
        "Cloud recording with transcription",
        "Branded stage overlays",
        "INR ticketing via Razorpay + UPI",
        "Tested at 10,000 concurrent viewers",
        "No Zoom or third-party app required",
        "Lead capture forms on registration",
        "Post-webinar drip emails",
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
      "@type": "VideoObject",
      "@id": "https://illuxus.com/webinar-platform-india#video",
      name: "illuxus webinar studio overview",
      description:
        "Two-minute walkthrough of running an HD webinar on illuxus — host studio, audience Q&A, polls, reactions, and cloud recording.",
      thumbnailUrl: "https://illuxus.com/og-image.png",
      uploadDate: "2026-06-28",
      contentUrl: "https://illuxus.com/og-image.png",
      embedUrl: "https://illuxus.com/webinar-platform-india",
      publisher: { "@id": "https://illuxus.com/#organization" },
    },
    {
      "@type": "FAQPage",
      "@id": "https://illuxus.com/webinar-platform-india#faq",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Webinar Platform India",
          item: "https://illuxus.com/webinar-platform-india",
        },
      ],
    },
  ],
};

const capabilities = [
  {
    icon: Video,
    title: "HD 1080p streaming on LiveKit",
    body:
      "Adaptive bitrate, simulcast, and sub-second latency. Mobile attendees on 4G see a smooth low-res stream; fibre viewers get full 1080p — automatic, no host tuning required.",
  },
  {
    icon: MessageSquare,
    title: "Q&A, polls, and emoji reactions",
    body:
      "Audience asks via a queued Q&A panel; the host surfaces selected questions on stage. Polls run inline with live results. Emoji reactions float across the stage for that conference-energy feel.",
  },
  {
    icon: Cloud,
    title: "Cloud recording + transcripts",
    body:
      "Every session is recorded by default, encoded to MP4, and transcribed (English + Hindi) so the replay is searchable. Restrict access to ticket holders, your team, or make it public.",
  },
  {
    icon: Tv,
    title: "Branded stage with your visual identity",
    body:
      "Custom backgrounds, lower thirds, speaker name cards, and tier logos. Match your event landing page; render inside your own custom domain on Starter and above.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first attendee experience",
    body:
      "Touch-optimized viewer, no app to install. Works on iOS Safari (yes, including AirPlay to a TV), Android Chrome, desktop browsers — same Q&A, chat, and reactions everywhere.",
  },
  {
    icon: Users2,
    title: "Lead capture + post-webinar follow-up",
    body:
      "Registration forms with custom fields (job title, company, intent). Post-webinar drip emails segmented by attendance status. CRM webhooks for HubSpot, Salesforce, Zoho out of the box.",
  },
];

const hybrid = [
  {
    title: "Run virtual-only webinars",
    body:
      "Marketing webinars, product launches, training sessions. Free for free webinars, 2% on paid webinar tickets. Up to 10,000 concurrent attendees per session.",
  },
  {
    title: "Stream your in-person event live",
    body:
      "Capture the on-stage feed and stream to virtual attendees with two-way Q&A and polls. Both audiences see the same speaker, the same slides, the same engagement.",
  },
  {
    title: "Hybrid ticketing in one workspace",
    body:
      "Sell in-person + virtual tickets from the same event page. illuxus generates the right QR or webinar join link per ticket type, automatically.",
  },
];

const competitorTable = [
  {
    feature: "HD 1080p streaming",
    illuxus: "Included",
    zoom: "Included",
    gotowebinar: "Included",
    livestorm: "Included",
    demio: "Included",
  },
  {
    feature: "No app install required",
    illuxus: "Yes (browser)",
    zoom: "App required",
    gotowebinar: "App or browser",
    livestorm: "Yes (browser)",
    demio: "Yes (browser)",
  },
  {
    feature: "INR + Razorpay + UPI native",
    illuxus: "Yes",
    zoom: "No",
    gotowebinar: "No",
    livestorm: "No",
    demio: "No",
  },
  {
    feature: "Built-in ticketing for paid webinars",
    illuxus: "Yes",
    zoom: "Limited",
    gotowebinar: "Limited",
    livestorm: "Limited",
    demio: "Limited",
  },
  {
    feature: "Branded custom domain",
    illuxus: "Starter+",
    zoom: "Enterprise",
    gotowebinar: "Enterprise",
    livestorm: "Paid plans",
    demio: "Paid plans",
  },
  {
    feature: "Cloud recording + transcripts",
    illuxus: "Included",
    zoom: "Included",
    gotowebinar: "Included",
    livestorm: "Included",
    demio: "Included",
  },
  {
    feature: "Up to 10,000 concurrent (Professional)",
    illuxus: "Yes",
    zoom: "Enterprise",
    gotowebinar: "Enterprise",
    livestorm: "Enterprise",
    demio: "Enterprise",
  },
  {
    feature: "DPDPA compliant (India data)",
    illuxus: "Yes",
    zoom: "Limited",
    gotowebinar: "Limited",
    livestorm: "Limited",
    demio: "Limited",
  },
];

export default function WebinarPlatformIndiaPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Webinar Platform India — Built-in HD Video, No Zoom Required | illuxus"
        description="Host HD webinars India trusts: LiveKit-powered streaming, Q&A + polls + reactions, cloud recording, branded stage, INR ticketing via Razorpay + UPI. No Zoom, no app install. 10,000 concurrent viewers tested. DPDPA compliant."
        canonical="https://illuxus.com/webinar-platform-india"
        keywords={KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={WEBINAR_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 text-center">
        <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
          Webinar platform India
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
          The webinar platform India teams run when Zoom isn't enough
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          HD streaming on LiveKit, Q&A + polls + reactions, cloud recording with transcripts,
          a branded stage, and INR ticketing via Razorpay + UPI — all inside your own
          workspace, with <span className="text-foreground font-medium">no Zoom link to manage</span>{" "}
          and <span className="text-foreground font-medium">no app for attendees to install</span>.
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
          DPDPA 2023 compliant · Tested to 10,000 concurrent viewers · Free webinars stay free forever
        </p>
      </section>

      {/* Capabilities */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Everything a webinar platform should include
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          We built illuxus webinars because organizers told us that Zoom Webinars feels like a
          separate product bolted onto Zoom Meetings. The platform below is the result —
          designed-from-scratch for branded, ticketed, lead-generating webinars in India.
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

      {/* Hybrid */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <Radio className="h-6 w-6 text-primary mb-3 mx-auto" />
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3">
            Virtual, hybrid, or fully on-site — same workspace
          </h2>
          <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-10">
            Most platforms force a choice: webinar tool or events tool. illuxus is one
            workspace where a webinar can grow into a hybrid event, then into a multi-day
            conference, without rebuilding your audience list or moving data.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {hybrid.map((h) => (
              <article
                key={h.title}
                className="bg-card border border-border rounded-2xl p-5"
              >
                <h3 className="font-semibold mb-2">{h.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{h.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing snippet */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div>
            <Sparkles className="h-6 w-6 text-primary mb-3" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Honest webinar pricing
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              No per-host seat licence. No per-attendee surcharge. Webinars are bundled into
              the same plan as your events, ticketing, and community — pay for the platform,
              run as many webinars as you want.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Free webinars stay free — forever",
                "Paid webinar tickets: 2% platform fee, GST invoiced",
                "Cloud recording + transcripts included",
                "Branded stage on Starter and above",
                "Custom domain on Starter and above",
                "10,000 concurrent attendees on Professional",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3 flex-wrap">
              <Button asChild>
                <Link to="/pricing">
                  See full pricing <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/features">Explore features</Link>
              </Button>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <Mic2 className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-semibold text-lg mb-3">What a live webinar looks like on illuxus</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">01.</span>
                <span className="text-muted-foreground">
                  Host opens the studio in their browser, enables camera + screen share, and
                  goes live in two clicks.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">02.</span>
                <span className="text-muted-foreground">
                  Attendees land on a branded webinar room — no install, no waiting room
                  email link to find.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">03.</span>
                <span className="text-muted-foreground">
                  Q&A queues up below the stream; host or moderator promotes a question to the
                  on-screen lower third.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">04.</span>
                <span className="text-muted-foreground">
                  Mid-session polls and reactions keep engagement high, and the AI summary
                  starts writing itself.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-semibold">05.</span>
                <span className="text-muted-foreground">
                  When the host ends the session, the recording, transcript, and AI recap are
                  available within minutes and flowed into post-webinar drip emails.
                </span>
              </li>
            </ul>
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
              illuxus vs. other webinar platforms
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
              Public information only. Verify with each vendor before procurement; per-region
              features and pricing vary.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="p-3 font-semibold">Capability</th>
                  <th className="p-3 font-semibold text-primary">illuxus</th>
                  <th className="p-3 font-semibold">Zoom Webinars</th>
                  <th className="p-3 font-semibold">GoToWebinar</th>
                  <th className="p-3 font-semibold">Livestorm</th>
                  <th className="p-3 font-semibold">Demio</th>
                </tr>
              </thead>
              <tbody>
                {competitorTable.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-primary font-medium">{row.illuxus}</td>
                    <td className="p-3 text-muted-foreground">{row.zoom}</td>
                    <td className="p-3 text-muted-foreground">{row.gotowebinar}</td>
                    <td className="p-3 text-muted-foreground">{row.livestorm}</td>
                    <td className="p-3 text-muted-foreground">{row.demio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10">
          <ShieldCheck className="h-6 w-6 text-primary mb-3" />
          <h2 className="text-2xl font-bold mb-3">DPDPA + GDPR compliant by design</h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">
            Webinar registrations involve PII — name, email, sometimes job title, company,
            phone. illuxus handles all of it under DPDPA 2023, GDPR, and IT Act 2000 +
            SPDI Rules 2011: encrypted at rest (AES-256) and in transit (TLS 1.3), named DPO
            and Grievance Officer in Mumbai, retention timelines per data category, and
            data export / deletion in one click from your Settings page.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-center">
            Frequently asked questions
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            What organizers ask in their first sales call about illuxus webinars.
          </p>
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
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <Tv className="h-6 w-6 text-primary mx-auto mb-3" />
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Run your next webinar without sending a single Zoom link
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Free webinars are free forever. Paid webinars get GST-compliant ticketing built in.
          Launch your first one in under thirty minutes.
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
