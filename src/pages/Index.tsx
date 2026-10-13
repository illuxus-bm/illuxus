import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import { CinemaReel } from "@/components/cinematic/CinemaReel";
import { useSmoothScroll } from "@/components/landing/useSmoothScroll";
import "@/components/landing/landing.css";
import RouteSeo from "@/components/RouteSeo";
import { Link } from "react-router-dom";

// Long-tail keyword set for the home / landing page. Each public route gets a
// distinct set so we surface a broad keyword footprint across the site.
const HOME_KEYWORDS = [
  "event management platform",
  "event management software",
  "event ticketing platform",
  "online event registration",
  "event registration software",
  "event marketing platform",
  "event marketing software",
  "event organizer tools",
  "event organiser tools India",
  "event planning software",
  "event hosting platform",
  "event app builder",
  "all-in-one event platform",
  "event management India",
  "event tech India",
  "event SaaS India",
  "ticketing platform India",
  "webinar platform India",
  "hybrid event platform",
  "conference platform India",
  "Eventbrite alternative",
  "Lu.ma alternative",
  "Cvent alternative",
  "Hopin alternative",
  "Meetup alternative",
  "QR code check-in",
  "event community platform",
  "online community platform",
  "branded event pages",
  "illuxus",
].join(", ");

const HOME_FAQS = [
  {
    question: "What is illuxus?",
    answer:
      "illuxus is an all-in-one event management platform for conferences, meetups, workshops, webinars, and hybrid events. Organizers can publish branded event pages, sell tickets, manage attendees, check guests in with QR codes, host live sessions, and grow event communities from one workspace.",
  },
  {
    question: "How much does illuxus cost?",
    answer:
      "illuxus has a free plan for events with up to 100 attendees. Paid plans start at ₹2,499 per month, with a 2% platform fee on paid tickets. Free events remain free, and there is no setup fee or per-attendee fee.",
  },
  {
    question: "Can I sell tickets in INR with UPI?",
    answer:
      "Yes. illuxus supports INR ticketing through Razorpay, including UPI, cards, net banking, wallets, and EMI. Stripe supports international cards and multiple currencies for global attendees.",
  },
  {
    question: "Does illuxus support QR code check-in?",
    answer:
      "Yes. Every ticket includes a QR code that staff can scan from a phone, tablet, laptop camera, or USB scanner. Organizers can also use self-service kiosk mode, offline scanning with later sync, and badge printing.",
  },
  {
    question: "Can I run webinars and hybrid events on illuxus?",
    answer:
      "Yes. illuxus includes browser-based HD webinars with Q&A, polls, reactions, cloud recording, and a branded stage. Organizers can stream in-person sessions to virtual attendees without requiring a separate Zoom link.",
  },
  {
    question: "Is illuxus suitable for event communities?",
    answer:
      "Yes. Each event can become a lasting community with a feed, announcements, calendar, member directory, resources, chat, moderation, and AI-powered matchmaking.",
  },
];

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://illuxus.com/#webpage",
      url: "https://illuxus.com/",
      name: "illuxus — All-in-one event management platform",
      isPartOf: { "@id": "https://illuxus.com/#website" },
      about: { "@id": "https://illuxus.com/#organization" },
      description:
        "Run unforgettable events with illuxus. Sell tickets, manage attendees, host live webinars, check in with QR codes, and build communities — all in one platform.",
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/#software-home",
      name: "illuxus",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "EventManagement",
      url: "https://illuxus.com/",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "0",
        highPrice: "16999",
        offerCount: "4",
      },
      featureList: [
        "Branded event pages",
        "Online ticketing with Stripe + Razorpay + UPI",
        "QR code check-in and badge printing",
        "Live webinar studio with LiveKit",
        "Speaker and sponsor management",
        "Event communities",
        "Real-time analytics",
        "Email + WhatsApp messaging",
        "AI matchmaking",
        "White-label and SSO",
      ],
    },
    {
      "@type": "Product",
      "@id": "https://illuxus.com/#product",
      name: "illuxus event management platform",
      description:
        "All-in-one event management platform for India and the world: ticketing, QR check-in, HD webinars, communities, and analytics.",
      brand: { "@type": "Brand", name: "illuxus" },
      image: "https://illuxus.com/og-image.png",
      url: "https://illuxus.com/",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "0",
        highPrice: "16999",
        offerCount: "4",
        availability: "https://schema.org/InStock",
        url: "https://illuxus.com/pricing",
      },
    },
    {
      "@type": "ItemList",
      "@id": "https://illuxus.com/#feature-list",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Smart ticketing & payments",
          description:
            "Sell tickets in INR + 25 currencies via Razorpay (UPI, cards, NetBanking, EMI) and Stripe. GST-compliant invoices auto-generated.",
          url: "https://illuxus.com/event-ticketing-platform",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "QR check-in & badge printing",
          description:
            "Real-time QR scanning, self-service kiosk mode, offline support, and one-click badge printing for on-site events.",
          url: "https://illuxus.com/features",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Built-in HD webinars",
          description:
            "LiveKit-powered HD streaming with Q&A, polls, reactions, cloud recording, and branded stage — no Zoom required.",
          url: "https://illuxus.com/webinar-platform-india",
        },
        {
          "@type": "ListItem",
          position: 4,
          name: "Speaker & sponsor management",
          description:
            "Speaker portals with bio/headshot collection; sponsor tiers, application flow, and booth lead capture.",
          url: "https://illuxus.com/features",
        },
        {
          "@type": "ListItem",
          position: 5,
          name: "Communities",
          description:
            "Post-event communities with feed, announcements, calendar, member directory, AI matchmaking, and moderation tooling.",
          url: "https://illuxus.com/community",
        },
        {
          "@type": "ListItem",
          position: 6,
          name: "Analytics & reporting",
          description:
            "Live revenue and registration dashboards, sponsor-tier ROI, speaker engagement, CSV/Excel/PDF exports, audit logs.",
          url: "https://illuxus.com/features",
        },
        {
          "@type": "ListItem",
          position: 7,
          name: "Conference management at scale",
          description:
            "Multi-day, multi-track conferences with up to 10,000+ attendees, hybrid streaming, and on-site QR check-in.",
          url: "https://illuxus.com/conference-management-platform",
        },
        {
          "@type": "ListItem",
          position: 8,
          name: "Event management for India",
          description:
            "INR-first pricing, Razorpay + UPI, GST invoicing, DPDPA 2023 compliant. Built for India, designed for the world.",
          url: "https://illuxus.com/event-management-software",
        },
      ],
    },
    {
      "@type": "HowTo",
      "@id": "https://illuxus.com/#howto-create-event",
      name: "How to create an event on illuxus",
      description:
        "A five-step process to publish your first event on illuxus — from sign-up to selling tickets and checking attendees in.",
      totalTime: "PT10M",
      estimatedCost: { "@type": "MonetaryAmount", currency: "INR", value: "0" },
      tool: [{ "@type": "HowToTool", name: "Free illuxus account" }],
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Sign up free",
          text: "Create a free illuxus account at https://illuxus.com/login — no credit card required.",
          url: "https://illuxus.com/login",
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Set up your organization",
          text: "Complete the onboarding wizard — name, logo, brand colours, and team members. Takes under two minutes.",
          url: "https://illuxus.com/onboarding",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Create your event",
          text: "Click 'Create event', add the name, date, location, and a banner image. illuxus auto-generates a beautiful event page.",
          url: "https://illuxus.com/dashboard/events/new",
        },
        {
          "@type": "HowToStep",
          position: 4,
          name: "Add ticket types and publish",
          text: "Set up free, paid, tiered, group, or early-bird tickets. Connect Razorpay + Stripe for payments and click Publish.",
          url: "https://illuxus.com/event-ticketing-platform",
        },
        {
          "@type": "HowToStep",
          position: 5,
          name: "Run the event and check attendees in",
          text: "On event day, use the QR check-in app on any device. Watch the live attendance dashboard update in real time.",
          url: "https://illuxus.com/features",
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://illuxus.com/#faq",
      mainEntity: HOME_FAQS.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://illuxus.com/#home-breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
      ],
    },
  ],
};

/**
 * Landing page. Colours come from the app theme tokens, so the header's
 * theme toggle switches the whole canvas between ink-navy and paper.
 *
 * The wrapper clips horizontal overflow with `overflow-x-clip` rather than
 * `hidden`: `hidden` would turn it into a scroll container and break the
 * sticky header and the pinned story stage.
 */
const Index = () => {
  useSmoothScroll();
  return (
    <div data-landing="true" className="landing-home relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Drafting grid, fixed so the page glides over it. */}
      <div aria-hidden="true" className="blueprint-grid pointer-events-none fixed inset-0 z-0" />
      {/* Soft violet wash behind the page, dark theme only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 hidden dark:block"
        style={{
          backgroundImage:
            "radial-gradient(80% 50% at 50% 0%, rgba(139, 92, 246, 0.18), transparent 70%)," +
            "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.12), transparent 70%)",
        }}
      />
      <SiteHeader landingMode />
      <RouteSeo
        title="illuxus — All-in-one event management platform | Ticketing, Webinars, Communities"
        description="Run unforgettable events with illuxus. Sell tickets, manage attendees, host live webinars, check in with QR codes, and build communities — all in one platform. Trusted by 1,200+ organizers across India and Southeast Asia."
        canonical="https://illuxus.com/"
        keywords={HOME_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={HOME_JSON_LD}
      />
      <main className="relative z-10">
        <HeroSection />
        <TestimonialsSection />
        <FeaturesSection />
        <CinemaReel />
        <PricingSection />
        <section
          aria-labelledby="homepage-faq-title"
          className="mx-auto w-full max-w-5xl px-6 py-24 sm:px-10"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Answers for organizers
            </p>
            <h2 id="homepage-faq-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-muted-foreground">
              Clear answers about event ticketing, webinars, check-in, pricing, and communities.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card px-6">
            {HOME_FAQS.map(({ question, answer }) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-left font-semibold marker:hidden">
                  <span className="group-open:text-primary">{question}</span>
                </summary>
                <p className="pt-3 text-left text-sm leading-7 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Need more detail?{" "}
            <Link to="/faqs" className="font-medium text-primary underline-offset-4 hover:underline">
              Browse all illuxus FAQs
            </Link>
            .
          </p>
        </section>
        <CTASection />
      </main>
    </div>
  );
};

export default Index;
