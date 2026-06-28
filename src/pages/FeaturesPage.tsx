import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import RouteSeo from "@/components/RouteSeo";
import {
  CalendarDays, Ticket, Mic2, Users, BarChart3, Globe,
  Shield, Sparkles, Mail, ScanLine, Zap, Crown, Rocket,
  CheckCircle2, ArrowRight,
} from "lucide-react";

const FEATURES_KEYWORDS = [
  "event ticketing software",
  "QR code event check-in",
  "event check-in app",
  "attendee check-in software",
  "self check-in kiosk",
  "badge printing event",
  "speaker management software",
  "event sponsor management",
  "sponsor portal",
  "sponsorship management software",
  "webinar platform",
  "live webinar tool",
  "LiveKit webinar",
  "webinar with chat",
  "webinar with Q&A",
  "webinar recording",
  "event analytics",
  "event reporting tool",
  "attendance analytics",
  "ticket sales analytics",
  "conversion tracking events",
  "event ROI dashboard",
  "event app builder",
  "branded event pages",
  "drag and drop event page builder",
  "AI matchmaking events",
  "white-label event platform",
  "SSO event platform",
  "event community platform",
  "post-event community",
].join(", ");

const FEATURES_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/features#software",
      name: "illuxus",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      url: "https://illuxus.com/features",
      featureList: [
        "Drag-and-drop event page builder",
        "Custom branding and themes",
        "Multi-day and recurring events",
        "Multiple ticket tiers and pricing",
        "Promo codes and early-bird discounts",
        "QR check-in and self check-in",
        "Badge printing",
        "Speaker invitations and content collection",
        "Sponsor portal and lead capture",
        "Live webinar studio (LiveKit)",
        "Webinar recording and playback",
        "Event communities and feeds",
        "Real-time analytics dashboards",
        "Email + WhatsApp messaging",
        "AI matchmaking for attendees",
        "White-label and custom domains",
        "SSO and advanced role management",
        "DPDPA + GDPR compliant data handling",
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
        { "@type": "ListItem", position: 2, name: "Features", item: "https://illuxus.com/features" },
      ],
    },
  ],
};

const features = [
  {
    icon: CalendarDays,
    title: "Event Creation & Management",
    description:
      "Build stunning event pages in minutes. Customize banners, colours, and copy with a drag-and-drop editor. Schedule single-day, multi-day, or recurring events with ease.",
    bullets: [
      "Drag-and-drop page builder",
      "Custom branding & themes",
      "Multi-day & recurring events",
      "Draft, publish, and unpublish on demand",
    ],
  },
  {
    icon: Ticket,
    title: "Smart Ticketing & Payments",
    description:
      "Sell tickets with flexible pricing — free, paid, or donation-based. Create tiers, promo codes, early-bird discounts, and group packages with automatic seat tracking.",
    bullets: [
      "Multiple ticket tiers & pricing",
      "Promo codes & discounts",
      "Early-bird automation",
      "Stripe & Razorpay supported",
    ],
  },
  {
    icon: Mic2,
    title: "Speaker Management",
    description:
      "Invite speakers, collect bios and headshots, build the agenda, and publish a polished schedule page that attendees can filter and add to their calendars.",
    bullets: [
      "Speaker invite links",
      "Bio & headshot collection",
      "Session scheduling & agenda",
      "iCal / Google Calendar export",
    ],
  },
  {
    icon: ScanLine,
    title: "Check-In & Badge Printing",
    description:
      "Check attendees in at the door with QR codes on any device. Print badges on the spot, track real-time attendance, and view who is currently inside the venue.",
    bullets: [
      "QR code scanning (camera or wand)",
      "Real-time attendance dashboard",
      "Self-service kiosk mode",
      "One-click badge printing",
    ],
  },
  {
    icon: Globe,
    title: "Virtual & Hybrid Webinars",
    description:
      "Run live webinars directly inside Illuxus — no third-party tools needed. Hosts get a full broadcast studio with Q&A, polls, reactions, and cloud recording.",
    bullets: [
      "Built-in Agora / LiveKit video",
      "Q&A, polls & emoji reactions",
      "Cloud recording",
      "Branded stage overlays",
    ],
  },
  {
    icon: Users,
    title: "Community & Networking",
    description:
      "Every event can grow into a lasting community. Attendees, speakers, and sponsors connect through discussion feeds, announcements, and direct messaging.",
    bullets: [
      "Community feed & comments",
      "Event-linked communities",
      "Role-based moderation",
      "Member directories",
    ],
  },
  {
    icon: BarChart3,
    title: "Analytics & Reporting",
    description:
      "Understand your audience at a glance. Revenue charts, registration trends, ticket breakdowns, check-in rates — all exportable as PDF or Excel in one click.",
    bullets: [
      "Live registration dashboards",
      "Revenue & conversion reports",
      "Export to PDF / Excel / CSV",
      "Per-event and org-wide views",
    ],
  },
  {
    icon: Mail,
    title: "Communication Tools",
    description:
      "Send targeted emails and WhatsApp messages to your registrants. Use templates, schedule sends, and track open and delivery rates from a single inbox.",
    bullets: [
      "Bulk email to registrants",
      "WhatsApp integration",
      "Scheduled sends",
      "Delivery & open tracking",
    ],
  },
  {
    icon: Shield,
    title: "Security & Compliance",
    description:
      "Enterprise-grade security built in from day one. GDPR-ready data exports, role-based access controls, structured audit logs, and secure HTTPS everywhere.",
    bullets: [
      "GDPR-ready data handling",
      "Role-based access (organiser, admin, attendee)",
      "Audit logs",
      "Single Sign-On (SSO) ready",
    ],
  },
  {
    icon: Sparkles,
    title: "AI-Powered Recommendations",
    description:
      "Match attendees to sessions and people they'll actually want to meet, based on their interests and registration history.",
    bullets: [
      "Smart attendee matching",
      "Personalised session suggestions",
      "Automated follow-up nudges",
      "Interest-based discovery",
    ],
  },
  {
    icon: Zap,
    title: "Sponsor Management",
    description:
      "Publish sponsor applications, collect tier selections, and showcase partners on your event page — all without a spreadsheet in sight.",
    bullets: [
      "Sponsor application forms",
      "Tier management (Gold, Silver, etc.)",
      "Logo & link display on event page",
      "Sponsor-portal self-service",
    ],
  },
  {
    icon: Crown,
    title: "White-Label & Embeds",
    description:
      "Use your own domain, custom colours, and logo. Embed an event widget on any external website with a single script tag — no iframes, no slowdown.",
    bullets: [
      "Custom domain support",
      "Embed widget for external sites",
      "Remove Illuxus branding (Enterprise)",
      "API access for custom integrations",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Features — Event ticketing, check-in, webinars & community tools | illuxus"
        description="Complete feature suite for event organizers: branded event pages, smart ticketing, speaker management, QR check-in, live webinars, sponsor portals, communities, analytics, AI matchmaking, white-label, and enterprise-grade security."
        canonical="https://illuxus.com/features"
        keywords={FEATURES_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={FEATURES_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-16 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Platform</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Everything you need to run<br className="hidden sm:block" /> extraordinary events
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          From the first ticket sold to the final check-out, Illuxus covers every step of the event lifecycle in one unified platform.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/login">Start for free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/#pricing">View pricing</Link>
          </Button>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-1">{f.title}</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
                <ul className="space-y-1.5 mt-auto">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[13px]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-primary/5 border-t border-border py-16 text-center px-4">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to see it in action?</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Set up your first event in under five minutes — no credit card required.
        </p>
        <Button size="lg" asChild>
          <Link to="/login">Get started free <Rocket className="ml-2 h-4 w-4" /></Link>
        </Button>
      </section>

    </div>
  );
}
