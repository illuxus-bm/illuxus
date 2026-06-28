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
  Building2,
  Globe2,
  IndianRupee,
  LineChart,
  Shield,
  Sparkles,
  Ticket,
  Users2,
  Zap,
} from "lucide-react";

/**
 * High-intent SEO landing page for the search query
 *   "event management software India"
 * and its long-tail variants. Mounted at /event-management-software.
 *
 * Content is intentionally substantial (≈2,000 words of body copy plus
 * comparison table and FAQ) so the page ranks on its own merit rather than
 * relying purely on metadata. Internal links lead back to the canonical
 * marketing pages (/features, /pricing, /contact) to consolidate link equity.
 */

const KEYWORDS = [
  "event management software",
  "event management software India",
  "event management platform",
  "event management platform India",
  "event registration software India",
  "online event management software",
  "free event management software",
  "best event management software 2026",
  "event planning software India",
  "conference management software India",
  "event organiser software India",
  "event organizer platform",
  "event management SaaS India",
  "Eventbrite alternative India",
  "Townscript alternative",
  "Hubilo alternative",
  "Cvent alternative India",
  "event ticketing and management software",
  "GST compliant event software",
  "DPDPA compliant event platform",
  "Razorpay event ticketing",
  "UPI event ticketing software",
  "event check-in software India",
  "white label event platform India",
  "event management tool with webinar",
  "all-in-one event platform India",
].join(", ");

const FAQS = [
  {
    q: "What is the best event management software in India in 2026?",
    a: "illuxus is purpose-built for the Indian market: INR-first pricing with no hidden FX margin, Razorpay + UPI + Stripe support, GST-compliant invoicing with GSTIN capture and HSN/SAC codes, a named Data Protection Officer and Grievance Officer in Mumbai, and DPDPA 2023 compliance baked in from day one. International generalists like Eventbrite and Cvent are powerful but charge higher per-ticket fees and have weaker India tax handling. The free tier (up to 100 attendees per event, unlimited events) is the easiest way to evaluate fit without a credit card.",
  },
  {
    q: "How much does event management software typically cost in India?",
    a: "Indian event management software ranges from free up to about ₹50,000/month for enterprise plans. illuxus stays on the lower end: free forever for events under 100 attendees, ₹2,499/month for Starter (up to 1,000 attendees), ₹6,999/month for Professional (up to 10,000 attendees), and ₹16,999+/month for Enterprise. On top of the plan, illuxus charges a flat 2% platform fee on paid tickets — free events are free forever with no per-ticket fee. There is no setup cost and no minimum commitment on monthly billing.",
  },
  {
    q: "Does illuxus replace Eventbrite, Zoom, Slack, and Mailchimp?",
    a: "Yes. illuxus is intentionally an all-in-one platform that bundles ticketing, branded event pages, QR check-in and badge printing, built-in HD webinars on LiveKit (no Zoom required), post-event communities (no Slack required), and bulk email + WhatsApp messaging (no Mailchimp required). One workspace, one invoice, one team training curve. For organizers running 5–50 events a year, consolidating saves both money and the hidden cost of moving data between tools.",
  },
  {
    q: "Is illuxus suitable for large conferences with 10,000+ attendees?",
    a: "Yes. The Professional plan supports up to 10,000 attendees per event out of the box, with multi-track scheduling, speaker portals, sponsor portals, hybrid streaming, and on-site QR check-in at scale. For events beyond 10,000 attendees, the Enterprise plan removes the cap and adds SSO, SCIM, dedicated customer success, optional 24×7 event-day cover, and a choice of data residency (Mumbai or Frankfurt).",
  },
  {
    q: "Can I migrate from another event platform without losing my data?",
    a: "Yes. CSV import covers past attendee lists, event archives, and registration history. Professional and Enterprise plans include concierge migration where our team rebuilds your existing event pages, ticket types, and emails inside illuxus so your team can switch over in days, not months. We have run successful migrations from Eventbrite, Townscript, Hubilo, Lu.ma, and Bevy.",
  },
];

const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/event-management-software#software",
      name: "illuxus event management software",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "EventManagement",
      url: "https://illuxus.com/event-management-software",
      description:
        "All-in-one event management software for India: branded event pages, INR ticketing with Razorpay + UPI, QR check-in, HD webinars, sponsor portals, communities, GST invoicing, DPDPA compliant.",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "0",
        highPrice: "16999",
        offerCount: "4",
      },
      featureList: [
        "Branded event pages with drag-and-drop builder",
        "Razorpay, Stripe, UPI ticketing in INR",
        "GST-compliant invoicing",
        "QR check-in and badge printing",
        "Built-in HD webinars (LiveKit)",
        "Sponsor portals and lead capture",
        "Post-event communities",
        "Email + WhatsApp messaging",
        "Real-time analytics and exports",
        "DPDPA 2023 and GDPR compliant",
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
      "@id": "https://illuxus.com/event-management-software#faq",
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
          name: "Event Management Software",
          item: "https://illuxus.com/event-management-software",
        },
      ],
    },
  ],
};

const capabilities = [
  {
    icon: Ticket,
    title: "Branded ticketing in INR + 25 currencies",
    body:
      "Sell free, paid, tiered, group, early-bird, and promo-code tickets through Razorpay (UPI, cards, NetBanking, wallets, EMI) and Stripe. GST-compliant invoices with GSTIN capture and HSN/SAC codes are generated automatically on every paid ticket.",
  },
  {
    icon: Users2,
    title: "Speakers, sponsors, attendees — one workspace",
    body:
      "Invite speakers with signed links, collect bios and headshots through a guided portal, run a sponsor application + tier flow, and message everyone from a single inbox. No spreadsheets, no chasing email threads.",
  },
  {
    icon: Zap,
    title: "QR check-in that scales to 50,000 tickets",
    body:
      "Every ticket has a QR on the PDF + Apple Wallet + Google Wallet pass. Scan from a laptop webcam, mobile phone, USB wand, or self-service kiosk. Offline mode keeps the line moving even when venue Wi-Fi dies.",
  },
  {
    icon: Globe2,
    title: "Built-in HD webinars (no Zoom required)",
    body:
      "Run virtual or hybrid sessions on LiveKit-powered HD streaming, with Q&A, polls, reactions, and one-click cloud recording. Tested to 10,000 concurrent viewers per session.",
  },
  {
    icon: LineChart,
    title: "Real-time analytics + exports",
    body:
      "Live registration dashboards, revenue and conversion charts, sponsor-tier ROI, speaker engagement, UTM attribution, and CSV / Excel / PDF exports on demand. Audit logs are immutable and exportable.",
  },
  {
    icon: Shield,
    title: "DPDPA 2023 + GDPR compliant by default",
    body:
      "Encryption at rest and in transit, named DPO and Grievance Officer in Mumbai, 28-section Privacy Policy, full data subject rights, SSO + SCIM on Enterprise, and a published incident response plan.",
  },
];

const useCases = [
  {
    title: "Conferences (500–10,000 attendees)",
    body:
      "Multi-day, multi-track schedules. Speaker and sponsor portals. Hybrid streaming. On-site QR check-in with badge printing. Post-event community thread that keeps the network active for months.",
  },
  {
    title: "Meetups (50–300 attendees)",
    body:
      "Free forever on the Free plan: branded event page, RSVPs, attendee list, QR check-in, automated reminders. No credit card required to start running events.",
  },
  {
    title: "Paid workshops & trainings",
    body:
      "Tiered tickets, promo codes, group discounts, GST receipts, optional cloud recording for replay access, and a private community for past cohorts.",
  },
  {
    title: "Corporate town halls & offsites",
    body:
      "SSO with your IdP, role-based access, audit logs, white-label rendering, data residency choice, and dedicated customer success. Optional 24×7 event-day cover on Enterprise.",
  },
];

const competitorTable = [
  {
    feature: "INR pricing with UPI support",
    illuxus: "Native",
    eventbrite: "Limited (via Stripe IN)",
    townscript: "Native",
    hubilo: "Native",
    cvent: "Limited",
  },
  {
    feature: "GST-compliant invoicing (GSTIN, HSN)",
    illuxus: "Included",
    eventbrite: "Limited",
    townscript: "Included",
    hubilo: "Included",
    cvent: "Add-on",
  },
  {
    feature: "Built-in HD webinars",
    illuxus: "Included",
    eventbrite: "Third-party only",
    townscript: "Not included",
    hubilo: "Included",
    cvent: "Add-on",
  },
  {
    feature: "Sponsor portal + lead capture",
    illuxus: "Included",
    eventbrite: "Not included",
    townscript: "Not included",
    hubilo: "Included",
    cvent: "Included",
  },
  {
    feature: "Post-event communities",
    illuxus: "Included",
    eventbrite: "Not included",
    townscript: "Not included",
    hubilo: "Limited",
    cvent: "Limited",
  },
  {
    feature: "Platform fee on paid tickets",
    illuxus: "2%",
    eventbrite: "Tiered + buyer service fee",
    townscript: "≈2.5% + tax",
    hubilo: "Custom quote",
    cvent: "Enterprise contract",
  },
  {
    feature: "Free tier with paid ticketing",
    illuxus: "Yes",
    eventbrite: "Yes",
    townscript: "Yes",
    hubilo: "No",
    cvent: "No",
  },
];

export default function EventManagementSoftwarePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Event Management Software India — Free Trial | illuxus"
        description="The all-in-one event management software India teams choose: INR ticketing on Razorpay + UPI, GST invoicing, QR check-in, built-in HD webinars, sponsor portals, communities. Free forever for events under 100 attendees. No setup cost. 2% platform fee."
        canonical="https://illuxus.com/event-management-software"
        keywords={KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={SOFTWARE_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 text-center">
        <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
          Event management software
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
          The event management software India organizers actually love
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Run branded event pages, sell tickets in INR with Razorpay + UPI, check
          attendees in via QR, host built-in HD webinars, and grow communities — all
          in one platform. <span className="text-foreground font-medium">2% platform fee</span> on paid tickets.{" "}
          <span className="text-foreground font-medium">Free forever</span> for events under 100 attendees.
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
          No credit card required · DPDPA 2023 + GDPR compliant · Hosted in Mumbai (ap-south-1)
        </p>
      </section>

      {/* Who it's for */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Built for every kind of Indian event organizer
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          Whether you run a 50-attendee city meetup or a 10,000-attendee multi-track summit,
          illuxus scales with you — same workspace, same data model, same pricing principle.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {useCases.map((u) => (
            <article
              key={u.title}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors"
            >
              <h3 className="font-semibold mb-2">{u.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{u.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Top capabilities */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Everything an event management platform should include
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          We stopped charging per feature long ago. Every capability below is on every plan;
          plans differ on scale, branding, and support — not on what your event can do.
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

      {/* Pricing comparison */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
              Comparison
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              illuxus vs. other event management platforms
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
              Public information only. Verify with each vendor before procurement — fees and
              features vary by region and contract.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="p-3 font-semibold">Capability</th>
                  <th className="p-3 font-semibold text-primary">illuxus</th>
                  <th className="p-3 font-semibold">Eventbrite</th>
                  <th className="p-3 font-semibold">Townscript</th>
                  <th className="p-3 font-semibold">Hubilo</th>
                  <th className="p-3 font-semibold">Cvent</th>
                </tr>
              </thead>
              <tbody>
                {competitorTable.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-primary font-medium">{row.illuxus}</td>
                    <td className="p-3 text-muted-foreground">{row.eventbrite}</td>
                    <td className="p-3 text-muted-foreground">{row.townscript}</td>
                    <td className="p-3 text-muted-foreground">{row.hubilo}</td>
                    <td className="p-3 text-muted-foreground">{row.cvent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
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
      </section>

      {/* Why India organizers pick illuxus */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Why event organizers in India choose illuxus
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          Most event management software is built for the US first and bolted on for India.
          illuxus is engineered from day one for the way Indian audiences pay, the way Indian
          tax law works, and the way Indian organizers actually operate.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <article className="bg-card border border-border rounded-2xl p-5">
            <IndianRupee className="h-5 w-5 text-primary mb-3" />
            <h3 className="font-semibold mb-2">INR-first, GST-ready</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Prices in rupees, invoices with GSTIN and HSN/SAC codes, reverse-charge handling
              for B2B, and payouts in T+0 to T+1 via Razorpay. No FX surprise.
            </p>
          </article>
          <article className="bg-card border border-border rounded-2xl p-5">
            <Building2 className="h-5 w-5 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Hosted in Mumbai</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Primary infrastructure runs in AWS ap-south-1 (Mumbai) with multi-AZ replication.
              Data residency is part of the Enterprise contract.
            </p>
          </article>
          <article className="bg-card border border-border rounded-2xl p-5">
            <Sparkles className="h-5 w-5 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Local support, fast</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sales and support teams in IST business hours. Enterprise customers get a
              dedicated CSM and optional 24×7 event-day cover.
            </p>
          </article>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
          <article className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-2">UPI is a first-class citizen</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Most ticket buyers under ₹5,000 prefer UPI over entering card details. illuxus
              surfaces UPI as the top payment method on the Indian checkout, with PhonePe,
              Google Pay, Paytm, and BHIM deep links pre-wired.
            </p>
          </article>
          <article className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-2">No buyer-side service fee</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Many platforms quietly add a 5–10% service fee on top of your ticket price,
              shown only on the final checkout screen. illuxus does not. The price you set is
              the price the buyer sees.
            </p>
          </article>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-center">
            Frequently asked questions
          </h2>
          <p className="text-center text-muted-foreground mb-8">
            Quick answers to what most evaluation teams ask before signing up.
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
          <p className="mt-6 text-center text-xs text-muted-foreground">
            More questions? <Link to="/contact" className="text-primary hover:underline">Talk to our team</Link> or read the{" "}
            <Link to="/features" className="text-primary hover:underline">full feature overview</Link>.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Try the event management software India organizers rate 4.9 / 5
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Sign up free, publish your first event in under five minutes, and switch later only
          if you outgrow the free tier.
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
        <p className="mt-6 text-[12px] text-muted-foreground">
          Trusted by 1,200+ organizers across India, Singapore, UAE, the UK and the US.
        </p>
      </section>
    </div>
  );
}
