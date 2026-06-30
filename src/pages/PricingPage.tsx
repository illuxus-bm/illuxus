import { Link } from "react-router-dom";
import PublicPageShell from "@/components/layout/PublicPageShell";
import { Button } from "@/components/ui/button";
import RouteSeo from "@/components/RouteSeo";
import { CheckCircle2, X, ArrowRight } from "lucide-react";

const PRICING_KEYWORDS = [
  "event ticketing pricing",
  "event management cost",
  "event platform pricing",
  "event SaaS pricing India",
  "transparent event pricing",
  "free event registration",
  "free event platform",
  "Stripe event payments",
  "Razorpay event tickets",
  "UPI event tickets",
  "GST-compliant event invoicing",
  "no setup cost event platform",
  "monthly event platform subscription",
  "annual event platform pricing",
  "enterprise event platform",
  "white-label event platform pricing",
  "event organiser pricing India",
  "small event platform free",
  "conference platform pricing",
  "hackathon platform pricing",
  "meetup platform pricing",
  "festival ticketing pricing",
  "wedding event tools pricing",
  "corporate event platform pricing",
  "Cvent pricing alternative",
  "Eventbrite pricing alternative",
  "Lu.ma pricing alternative",
  "Splash pricing alternative",
  "Hopin pricing alternative",
  "Bevy pricing alternative",
].join(", ");

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for meetups, workshops, and small community events.",
    cta: "Start free",
    ctaHref: "/login",
    highlight: false,
    features: [
      { text: "Up to 100 attendees per event", included: true },
      { text: "1 active event at a time", included: true },
      { text: "Basic event page builder", included: true },
      { text: "QR code check-in", included: true },
      { text: "Email support", included: true },
      { text: "Standard analytics", included: true },
      { text: "Custom branding", included: false },
      { text: "Speaker management", included: false },
      { text: "Webinar studio", included: false },
      { text: "WhatsApp messaging", included: false },
    ],
  },
  {
    name: "Professional",
    price: "₹3,499",
    period: "/mo",
    description: "For growing teams that run regular events and need full control.",
    cta: "Start 14-day trial",
    ctaHref: "/login",
    highlight: true,
    features: [
      { text: "Up to 5,000 attendees per event", included: true },
      { text: "Unlimited active events", included: true },
      { text: "Full page builder + custom branding", included: true },
      { text: "QR check-in + badge printing", included: true },
      { text: "Priority email & chat support", included: true },
      { text: "Advanced analytics & exports", included: true },
      { text: "Speaker & sponsor management", included: true },
      { text: "Webinar studio (up to 10 speakers)", included: true },
      { text: "WhatsApp messaging", included: true },
      { text: "Promo codes & early-bird pricing", included: true },
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Large-scale conferences, festivals, and multi-org deployments.",
    cta: "Talk to sales",
    ctaHref: "mailto:sales@illuxus.com",
    highlight: false,
    features: [
      { text: "Unlimited attendees", included: true },
      { text: "Unlimited events across multiple orgs", included: true },
      { text: "White-label & custom domain", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "24/7 SLA-backed support", included: true },
      { text: "Custom analytics & data warehouse export", included: true },
      { text: "SSO & advanced role management", included: true },
      { text: "Unlimited webinar capacity", included: true },
      { text: "Custom integrations & API access", included: true },
      { text: "GDPR data processing agreement", included: true },
    ],
  },
];

const faqs = [
  {
    q: "Is the Starter plan really free forever?",
    a: "Yes. The Starter plan is free with no time limit. You can run small events and explore the platform without entering a credit card.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit / debit cards via Stripe. Razorpay is available for Indian customers, supporting UPI, net banking, and wallets.",
  },
  {
    q: "Can I switch plans at any time?",
    a: "Absolutely. Upgrade or downgrade at the end of any billing cycle. Your events and data are never affected by a plan change.",
  },
  {
    q: "How does the 14-day trial work?",
    a: "When you start a Professional trial you get full access to all Pro features. No credit card is required upfront. If you choose not to subscribe after 14 days, your account reverts to the Starter tier — all your data stays intact.",
  },
  {
    q: "Do you offer non-profit or educational discounts?",
    a: "Yes. Registered non-profits and educational institutions can apply for a 50% discount on Professional plans. Contact us with your registration details.",
  },
  {
    q: "Is there a per-ticket transaction fee?",
    a: "Paid tickets carry a 2% platform fee on the Starter and Professional plans. Enterprise plans can negotiate a flat fee with zero per-ticket charges.",
  },
];

export default function PricingPage() {
  // Build the FAQPage + Product JSON-LD from the local pricing data so the
  // schema stays in lock-step with the rendered UI.
  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": "https://illuxus.com/pricing#product",
        name: "illuxus event management platform",
        description:
          "All-in-one event management platform with ticketing, check-in, webinars, communities, and analytics.",
        brand: { "@type": "Brand", name: "illuxus" },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: "0",
          highPrice: "16999",
          offerCount: plans.length.toString(),
          offers: plans.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: p.price === "Free" ? "0" : p.price === "Custom" ? "0" : p.price.replace(/[^0-9.]/g, ""),
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
            url: "https://illuxus.com/pricing",
          })),
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
          { "@type": "ListItem", position: 2, name: "Pricing", item: "https://illuxus.com/pricing" },
        ],
      },
    ],
  };

  return (
    <PublicPageShell>
      <RouteSeo
        title="Pricing — Transparent event management pricing | Free trial | illuxus"
        description="Start free. Scale on Professional at ₹3,499/mo or talk to sales for Enterprise. Only 2% platform fee on paid tickets. No setup cost. No hidden fees. Cancel anytime."
        canonical="https://illuxus.com/pricing"
        keywords={PRICING_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={pricingJsonLd}
      />

      {/* Hero */}
      <section className="pt-24 pb-12 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Pricing</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Plans that grow with you
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Start free. Scale when you're ready. No hidden fees, no lock-in.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-7 flex flex-col gap-6 ${
                plan.highlight
                  ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wide px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <div>
                <h2 className="text-lg font-bold">{plan.name}</h2>
                <p className="text-[13px] text-muted-foreground mt-1">{plan.description}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                )}
              </div>
              <Button
                asChild
                variant={plan.highlight ? "default" : "outline"}
                className="w-full"
              >
                <a href={plan.ctaHref}>
                  {plan.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2 text-[13px]">
                    {f.included ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                    )}
                    <span className={f.included ? "" : "text-muted-foreground/50"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-6">
          {faqs.map((faq) => (
            <div key={faq.q} className="border-b border-border pb-6">
              <h3 className="font-semibold mb-2">{faq.q}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 border-t border-border py-16 text-center px-4">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Still not sure?</h2>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          Talk to our team and we'll help you pick the right plan.
        </p>
        <Button size="lg" asChild>
          <Link to="/contact">Contact sales</Link>
        </Button>
      </section>

    </PublicPageShell>
  );
}
