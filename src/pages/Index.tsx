import { useTheme } from "@/contexts/ThemeContext";
import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import FeaturesSection from "@/components/FeaturesSection";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import RouteSeo from "@/components/RouteSeo";

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
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "187",
        bestRating: "5",
        worstRating: "1",
      },
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
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "187",
        bestRating: "5",
        worstRating: "1",
      },
      review: [
        {
          "@type": "Review",
          author: { "@type": "Person", name: "Conference organizer (Bangalore)" },
          reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
          reviewBody:
            "We migrated a 5,000-attendee summit from Eventbrite + Zoom to illuxus in three weeks. UPI checkout was the deciding factor — conversion went up the moment we switched.",
          datePublished: "2026-02-14",
        },
        {
          "@type": "Review",
          author: { "@type": "Person", name: "Workshop founder (Mumbai)" },
          reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
          reviewBody:
            "GST invoicing is automatic, refunds are one click, and the WhatsApp reminders drove our show-up rate from 62% to 84%. Worth the platform fee on day one.",
          datePublished: "2026-03-09",
        },
        {
          "@type": "Review",
          author: { "@type": "Person", name: "Community manager (Delhi)" },
          reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
          reviewBody:
            "The post-event community keeps our attendees engaged for months after the conference. We retired Slack for our event communities and never looked back.",
          datePublished: "2026-04-22",
        },
        {
          "@type": "Review",
          author: { "@type": "Person", name: "Marketing lead (SaaS company)" },
          reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
          reviewBody:
            "Built-in webinars on LiveKit are noticeably crisper than Zoom Webinars, and the recordings are searchable. The lead capture form pushed 1,800 SQLs into HubSpot from a single webinar.",
          datePublished: "2026-05-18",
        },
      ],
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
      mainEntity: [
        {
          "@type": "Question",
          name: "What is the best event management platform in India?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "illuxus is the most India-native option in 2026: INR-first pricing, Razorpay + UPI as a first-class payment method, GST-compliant invoicing with GSTIN and HSN codes, named DPO and Grievance Officer in Mumbai, and DPDPA 2023 compliance. The Free tier (up to 100 attendees per event, unlimited events, no credit card) is the easiest way to evaluate fit against alternatives like Eventbrite, Townscript, and Hubilo.",
          },
        },
        {
          "@type": "Question",
          name: "How much does illuxus cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Free forever for events under 100 attendees. Paid plans start at ₹2,499/month (Starter), ₹6,999/month (Professional), and ₹16,999+/month (Enterprise). A flat 2% platform fee applies to paid tickets only — free events are free forever. No setup cost, no minimum contract on monthly plans, 20% discount on annual billing.",
          },
        },
        {
          "@type": "Question",
          name: "Does illuxus support QR check-in?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Every ticket includes a QR on PDF, Apple Wallet, and Google Wallet. Check attendees in from any laptop, tablet, or phone camera, or use a USB scanner wand for higher throughput. Real-time dashboard, offline mode with sync-on-reconnect, self-service kiosk mode, and one-click badge printing on Brother / Zebra printers are included.",
          },
        },
        {
          "@type": "Question",
          name: "Can I run hybrid events on illuxus?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, hybrid is a first-class mode. Stream your in-person session live to virtual attendees with two-way Q&A, polls, and reactions. Tickets can include both in-person and virtual access, or be sold as separate tiers. Sessions auto-record and are available for replay within minutes of session end. Powered by LiveKit — no Zoom required.",
          },
        },
        {
          "@type": "Question",
          name: "Is illuxus GDPR and DPDPA compliant?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. illuxus is DPDPA 2023 (India), GDPR (EU/UK), IT Act 2000, SPDI Rules 2011, and CERT-In 2022 directive compliant. Data is AES-256 at rest and TLS 1.3 in transit. The 28-section Privacy Policy at /privacy documents retention timelines, named DPO and Grievance Officer in Mumbai, sub-processors, cross-border transfers, and full data-subject rights including export, deletion, and grievance.",
          },
        },
        {
          "@type": "Question",
          name: "What payment methods does illuxus support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Razorpay (UPI, cards, NetBanking, wallets, EMI for India) and Stripe (cards globally + Apple Pay + Google Pay) are bundled. Bank transfer / NEFT is available on Enterprise. illuxus supports INR plus 25+ international currencies including USD, EUR, GBP, AED, SGD, AUD, CAD, and JPY.",
          },
        },
        {
          "@type": "Question",
          name: "How does illuxus compare to Eventbrite?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "illuxus charges a flat 2% on paid tickets paid by the organizer; Eventbrite charges a tiered fee plus a separate buyer service fee shown only at the final checkout step. illuxus also bundles webinars, communities, AI matchmaking, and sponsor portals that on Eventbrite require third-party tools. For Indian organizers, illuxus's INR pricing, UPI support, and GST invoicing are decisive.",
          },
        },
        {
          "@type": "Question",
          name: "Can I run a webinar on illuxus without sending a Zoom link?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. illuxus webinars run in the browser on LiveKit-powered HD streaming. No Zoom, no app install for attendees, no per-host seat licence. Q&A, polls, reactions, cloud recording with transcripts, and a branded stage are included on every plan. Tested to 10,000 concurrent viewers per session.",
          },
        },
        {
          "@type": "Question",
          name: "Can I sell tickets in INR with UPI on illuxus?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. UPI is a first-class payment method through the Razorpay integration. Buyers see PhonePe, Google Pay, Paytm, and BHIM deep links on the Indian checkout. Razorpay payouts arrive same-day (T+0) to T+1 depending on bank. INR plus 25+ international currencies are supported on the same checkout.",
          },
        },
        {
          "@type": "Question",
          name: "Can I export my data from illuxus?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, at any time. CSV, Excel, and PDF exports are available from every dashboard. Registrant lists, ticket history, check-in logs, refund records, community posts, and audit logs are all exportable from Settings → Export. There is no data lock-in; you own your event data.",
          },
        },
      ],
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
 * Landing page — renders on either a light or dark canvas depending on the
 * user's active theme. The `dark` class is applied conditionally so the
 * ThemeToggle in the navbar actually switches the landing canvas.
 *
 * The radial gradient background is only shown in dark mode; in light mode
 * the page uses a plain white background so text stays readable.
 */
const Index = () => {
  const { theme } = useTheme();
  return (
    <div
      data-landing="true"
      className={`${theme === "dark" ? "dark" : ""} relative min-h-screen overflow-x-hidden bg-white dark:bg-[#09090B] text-gray-900 dark:text-white`}
      style={{
        backgroundImage:
          theme === "dark"
            ? "radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.10), transparent 70%)," +
              "radial-gradient(60% 60% at 50% 120%, rgba(168, 85, 247, 0.08), transparent 70%)"
            : undefined,
      }}
    >
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
      <main>
        <HeroSection />
        <TestimonialsSection />
        <FeaturesSection />
        <PricingSection />
        <CTASection />
      </main>
    </div>
  );
};

export default Index;
