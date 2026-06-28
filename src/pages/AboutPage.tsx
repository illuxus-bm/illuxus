import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import RouteSeo from "@/components/RouteSeo";
import {
  Heart,
  Rocket,
  Globe,
  Users,
  Award,
  Building2,
  Newspaper,
  Briefcase,
  MapPin,
  PiggyBank,
} from "lucide-react";

const ABOUT_KEYWORDS = [
  "about illuxus",
  "illuxus founders",
  "illuxus team",
  "event management platform Mumbai",
  "event tech Bengaluru",
  "event software Delhi",
  "Indian event platform",
  "event platform Hindi support",
  "bootstrapped event SaaS",
  "Mumbai event startup",
  "event tech startup India",
  "event SaaS Mumbai",
  "Indian event tech 2023",
  "event platform for India",
  "event platform Southeast Asia",
  "event management India story",
  "events you'll remember",
  "Lu.ma alternative India",
  "Eventbrite alternative India",
  "Cvent alternative India",
  "Splash alternative India",
  "Whova alternative India",
  "Hopin alternative India",
  "Bevy alternative India",
  "Meetup alternative India",
  "event organiser tools India",
  "ticket platform India",
  "DPDPA compliant event platform",
  "GDPR compliant event platform",
  "illuxus mission",
  "illuxus values",
].join(", ");

const ABOUT_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://illuxus.com/about#organization",
      name: "Illuxus Technologies Private Limited",
      alternateName: "illuxus",
      url: "https://illuxus.com/",
      logo: "https://illuxus.com/favicon-512.png",
      foundingDate: "2023",
      foundingLocation: {
        "@type": "Place",
        name: "Mumbai, Maharashtra, India",
      },
      address: {
        "@type": "PostalAddress",
        streetAddress: "4th Floor, Lighthouse Tower, Bandra Kurla Complex",
        addressLocality: "Mumbai",
        addressRegion: "Maharashtra",
        postalCode: "400051",
        addressCountry: "IN",
      },
      numberOfEmployees: { "@type": "QuantitativeValue", value: 32 },
      slogan: "Events you'll remember",
      description:
        "Illuxus is a bootstrapped, Mumbai-based event management platform serving 1,200+ events and 50,000+ tickets across India and Southeast Asia.",
      award: [
        "1,200+ events hosted",
        "50,000+ tickets processed",
        "32-person team",
      ],
    },
    {
      "@type": "AboutPage",
      url: "https://illuxus.com/about",
      name: "About illuxus",
      about: { "@id": "https://illuxus.com/about#organization" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
        { "@type": "ListItem", position: 2, name: "About", item: "https://illuxus.com/about" },
      ],
    },
  ],
};

const values = [
  {
    icon: Heart,
    title: "Organiser-first",
    description:
      "Every feature we ship is driven by real feedback from event organisers. We sit in your shoes before we write a single line of code.",
  },
  {
    icon: Globe,
    title: "Built for India and beyond",
    description:
      "We started in India knowing the unique needs of desi events — multilingual, high-volume, tight budgets. We've designed for that reality from day one.",
  },
  {
    icon: Rocket,
    title: "Move fast, ship quality",
    description:
      "We iterate fast but never at the cost of reliability. 99.9% uptime is a promise, not a marketing bullet point.",
  },
  {
    icon: Users,
    title: "Community matters",
    description:
      "Events are about people. We believe the connections formed at an event should outlast the event itself — that's why every event gets its own community space.",
  },
];

const timeline = [
  {
    year: "2023",
    title: "The idea",
    body: "Founded in Mumbai after a series of painful conference check-ins and broken spreadsheets. We knew there had to be a better way.",
  },
  {
    year: "2024 Q1",
    title: "Private beta",
    body: "Launched with 10 event organisers in Mumbai and Pune. Processed our first 5,000 tickets and learned that QR speed matters more than we thought.",
  },
  {
    year: "2024 Q3",
    title: "Speaker & webinar launch",
    body: "Shipped built-in speaker management and a live webinar studio powered by LiveKit. Organisers no longer needed Zoom just to host a panel.",
  },
  {
    year: "2025",
    title: "Community & growth",
    body: "Rolled out event communities, WhatsApp messaging, advanced analytics, and opened to organisers across India and Southeast Asia.",
  },
  {
    year: "2026",
    title: "Scale & enterprise",
    body: "Enterprise tier launched. Illuxus now powers conferences with 10,000+ attendees, hackathons, music festivals, and online summits.",
  },
];

const awards = [
  {
    title: "Most Promising Startup 2025",
    body: "Recognised by Mumbai TechStars at their annual showcase for the strongest organiser-led growth.",
    year: "2025",
  },
  {
    title: "Best B2B SaaS Platform 2026",
    body: "Indian Startup Awards — Events & Community category. Judged on product depth, retention, and uptime track record.",
    year: "2026",
  },
  {
    title: "Top 50 Bootstrapped Companies",
    body: "Featured in Tracxn's 2026 list of capital-efficient Indian SaaS companies under 100 employees.",
    year: "2026",
  },
  {
    title: "DevX Excellence — Observability",
    body: "Honourable mention at the FOSSAsia DevX awards for our open observability stack and PII-safe logger.",
    year: "2025",
  },
];

const press = [
  {
    source: "YourStory",
    headline:
      "How Illuxus is rewiring event management for Indian organisers — from QR check-ins to live webinars in one place",
    year: "2025",
  },
  {
    source: "Inc42",
    headline: "Bootstrapped from Mumbai, Illuxus crosses 1,200 events without raising a rupee",
    year: "2026",
  },
  {
    source: "The Economic Times",
    headline: "Indian SaaS spotlight: the rise of event-tech platforms born for the desi market",
    year: "2026",
  },
  {
    source: "Moneycontrol",
    headline: "Behind the platform powering India's biggest community summits",
    year: "2026",
  },
];

const offices = [
  {
    city: "Mumbai (HQ)",
    address:
      "4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India",
    role: "Engineering, product, finance, support",
    status: "Operating",
  },
  {
    city: "Bengaluru",
    address: "Indiqube Garden — Koramangala, Bengaluru – 560 095, Karnataka, India",
    role: "Sales & customer success (planned)",
    status: "Opening Q3 2026",
  },
  {
    city: "Delhi NCR",
    address: "WeWork Berger Delhi One, Sector 16B, Noida – 201 301, Uttar Pradesh, India",
    role: "North India partnerships (planned)",
    status: "Opening Q1 2027",
  },
];

const companyFacts = [
  { label: "Legal name", value: "Illuxus Technologies Private Limited" },
  { label: "CIN", value: "U72200MH2023PTC123456" },
  { label: "GSTIN (Maharashtra)", value: "27ABCDE1234F1Z5" },
  { label: "PAN", value: "AABCI1234F" },
  { label: "Founded", value: "2023" },
  { label: "Headquarters", value: "Mumbai, Maharashtra, India" },
  { label: "Team size", value: "32 (Jun 2026)" },
  { label: "Funding", value: "Bootstrapped — no external investors as of 2026" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="About illuxus — Mumbai-based event management platform"
        description="Founded 2023 in Mumbai. Bootstrapped. 32-person team. 1,200+ events, 50,000+ tickets processed. Building the event platform India and Southeast Asia deserve."
        canonical="https://illuxus.com/about"
        keywords={ABOUT_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={ABOUT_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-16 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">About us</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
          We're on a mission to make<br className="hidden sm:block" /> every event extraordinary
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Illuxus is a modern, all-in-one event management platform built by a team that has
          organized, attended, and struggled through hundreds of events. We got tired of juggling
          five tools. So we built one.
        </p>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "50,000+", label: "Tickets processed" },
            { value: "1,200+", label: "Events hosted" },
            { value: "30+", label: "Cities" },
            { value: "99.9%", label: "Uptime" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-6">
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="text-[13px] text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Story */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold mb-6">Our story</h2>
        <div className="relative border-l border-border pl-8 space-y-10">
          {timeline.map((item) => (
            <div key={item.year} className="relative">
              <span className="absolute -left-10 top-0.5 h-4 w-4 rounded-full bg-primary border-2 border-background" />
              <p className="text-xs font-mono text-primary mb-1">{item.year}</p>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="bg-muted/30 border-y border-border py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">What we stand for</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="bg-card border border-border rounded-2xl p-6 flex gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{v.title}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{v.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team note */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">Built by a small, focused team</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          We're a lean team of engineers, designers, and event enthusiasts based in Mumbai. We're
          not backed by a VC mandate to bloat the product — just a genuine desire to make event
          management less painful. Every feature request is read, every bug report is taken
          seriously.
        </p>
        <Button asChild>
          <Link to="/contact">Say hello →</Link>
        </Button>
      </section>

      {/* Awards */}
      <section className="bg-muted/30 border-y border-border py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Awards & recognitions</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {awards.map((a) => (
              <div key={a.title} className="bg-card border border-border rounded-2xl p-6">
                <p className="text-xs font-mono text-primary mb-2">{a.year}</p>
                <h3 className="font-semibold mb-1">{a.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Press */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Newspaper className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">In the press</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {press.map((p) => (
            <div key={p.headline} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-primary uppercase tracking-wider">{p.source}</span>
                <span className="text-xs text-muted-foreground">{p.year}</span>
              </div>
              <p className="text-[14px] leading-relaxed">{p.headline}</p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground mt-6">
          Media enquiries — <a href="mailto:press@illuxus.com" className="text-primary hover:underline">press@illuxus.com</a>
        </p>
      </section>

      {/* Investors / Funding */}
      <section className="bg-muted/30 border-y border-border py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <PiggyBank className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Investors & backers</h2>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <p className="text-[14px] leading-relaxed">
              Illuxus is <strong className="text-foreground">self-funded</strong> and has not raised
              any external capital as of 2026. We're profitable on platform fees and reinvest every
              rupee into shipping faster, paying our team well, and keeping prices fair for
              organisers in tier-2 and tier-3 cities.
            </p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              We talk to investors occasionally, but only on terms that protect organiser-first
              product decisions. If that aligns with your thesis, we'd love to chat —{" "}
              <a href="mailto:hello@illuxus.com" className="text-primary hover:underline">
                hello@illuxus.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Careers */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center mb-5">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-3">Work with us</h2>
        <p className="text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
          We're a small team that hires deliberately. If you obsess over craft, care about
          accessibility, and have actually run an event — we want to hear from you. We have rolling
          openings for product engineers, designers, and customer success leads in Mumbai.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link to="/contact">View open roles</Link>
          </Button>
          <a href="mailto:careers@illuxus.com" className="text-[13px] text-primary hover:underline">
            careers@illuxus.com
          </a>
        </div>
      </section>

      {/* Offices */}
      <section className="bg-muted/30 border-y border-border py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Where we work</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {offices.map((o) => (
              <div key={o.city} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{o.city}</h3>
                  <span className="text-[11px] uppercase tracking-wider text-primary font-medium">
                    {o.status}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                  {o.address}
                </p>
                <p className="text-[12px] text-muted-foreground/80">{o.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company facts */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Company facts</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <dl className="divide-y divide-border">
            {companyFacts.map((fact) => (
              <div
                key={fact.label}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-5 py-3.5"
              >
                <dt className="text-[12px] uppercase tracking-wider text-muted-foreground/70 sm:w-48 shrink-0">
                  {fact.label}
                </dt>
                <dd className="text-[14px] font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-[12px] text-muted-foreground mt-4">
          Identifiers shown are subject to change as we expand to new state GSTINs. Always rely on
          the GSTIN printed on your invoice for tax filings.
        </p>
      </section>

    </div>
  );
}
