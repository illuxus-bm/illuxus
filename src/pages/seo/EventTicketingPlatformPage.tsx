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
  Banknote,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  IndianRupee,
  Lock,
  Percent,
  ReceiptText,
  Smartphone,
  Tag,
  Ticket,
} from "lucide-react";

/**
 * High-intent SEO landing page targeting
 *   "event ticketing platform India" / "sell event tickets online"
 * Mounted at /event-ticketing-platform.
 */

const KEYWORDS = [
  "event ticketing platform",
  "event ticketing platform India",
  "online event ticketing India",
  "sell event tickets online",
  "sell event tickets India",
  "event ticketing software",
  "conference ticketing software",
  "ticketing platform with UPI",
  "Razorpay event ticketing",
  "Stripe event ticketing India",
  "ticketing software with GST invoicing",
  "ticketing platform with promo codes",
  "early-bird ticketing software",
  "group ticketing software",
  "online RSVP platform India",
  "event registration platform India",
  "ticketing platform 2% fee",
  "low-fee event ticketing India",
  "best ticketing platform India 2026",
  "Townscript alternative",
  "Eventbrite alternative India",
  "Hubilo ticketing alternative",
  "Insider.in alternative organizer",
  "BookMyShow alternative organizer",
  "DPDPA compliant ticketing",
].join(", ");

const FAQS = [
  {
    q: "Which is the best event ticketing platform in India for 2026?",
    a: "For Indian organizers the answer comes down to four factors: UPI + Razorpay support, GST-compliant invoicing, the platform fee on paid tickets, and the buyer experience. illuxus scores well on all four — UPI is a first-class citizen, GSTIN + HSN codes are auto-applied on invoices, the platform fee is a flat 2% on paid tickets (free events are free forever), and there is no separate buyer service fee. Try the Free plan (up to 100 attendees per event, unlimited events, no credit card) to compare with your current tool.",
  },
  {
    q: "How much does illuxus charge per ticket sold?",
    a: "A flat 2% platform fee on paid tickets. There is no separate fee for free tickets — free events are free forever. Payment processor fees (Razorpay or Stripe) are charged at standard rates on top, the same as on any platform that uses the same processor. There is no buyer-side service fee added at checkout — the price you set is the price your attendee pays.",
  },
  {
    q: "Does illuxus support UPI, NetBanking, and EMI?",
    a: "Yes. Through the Razorpay integration, illuxus accepts UPI (PhonePe, Google Pay, Paytm, BHIM), credit and debit cards, NetBanking from 50+ Indian banks, wallets (Paytm, Mobikwik, Freecharge), and EMI on supported cards. International cards and PayPal are routed through Stripe. Enterprise customers can additionally enable bank transfer / NEFT for high-ticket items.",
  },
  {
    q: "Are illuxus invoices GST-compliant?",
    a: "Yes. Every paid ticket generates a GST-compliant tax invoice with your organization's GSTIN, the buyer's GSTIN (if entered at checkout), the correct HSN/SAC code per ticket type, the CGST + SGST or IGST breakdown depending on the buyer's state, and a unique invoice number. B2B reverse-charge handling is supported. Invoices are auto-emailed to the buyer and exportable as PDF or CSV for your accountant.",
  },
  {
    q: "Can I issue refunds, and how fast do they reach the buyer?",
    a: "Yes. Refunds (full or partial) are one click from the ticket detail page. Refunds are processed via the original payment method — UPI refunds typically reflect in 1–2 business days, card refunds in 5–7 business days, NetBanking in 3–5 business days. The illuxus 2% platform fee is automatically refunded on full refunds. Refund webhooks let your accounting tool stay in sync.",
  },
];

const TICKETING_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://illuxus.com/event-ticketing-platform#software",
      name: "illuxus event ticketing platform",
      operatingSystem: "Web, iOS, Android",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Ticketing",
      url: "https://illuxus.com/event-ticketing-platform",
      description:
        "Sell event tickets online in India with illuxus — UPI + Razorpay + Stripe, GST-compliant invoicing, 2% platform fee, no setup cost, free for free events.",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "0",
        highPrice: "16999",
        offerCount: "4",
      },
      featureList: [
        "Free, paid, tiered, group, early-bird, promo-code tickets",
        "Razorpay (UPI, cards, NetBanking, wallets, EMI)",
        "Stripe (international cards)",
        "GST-compliant invoicing with GSTIN + HSN",
        "PDF + Apple Wallet + Google Wallet tickets",
        "Refund automation",
        "Same-day to T+2 payouts",
        "Tax export to Tally + Zoho Books",
      ],
    },
    {
      "@type": "Product",
      "@id": "https://illuxus.com/event-ticketing-platform#product",
      name: "illuxus ticketing",
      description:
        "Online event ticketing platform for India: UPI + Razorpay + Stripe, GST-compliant invoicing, 2% platform fee, no setup cost, no buyer service fee.",
      brand: { "@type": "Brand", name: "illuxus" },
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: "0",
        priceValidUntil: "2027-12-31",
        availability: "https://schema.org/InStock",
        url: "https://illuxus.com/event-ticketing-platform",
      },
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
      "@id": "https://illuxus.com/event-ticketing-platform#faq",
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
          name: "Event Ticketing Platform",
          item: "https://illuxus.com/event-ticketing-platform",
        },
      ],
    },
  ],
};

const ticketTypes = [
  {
    icon: Ticket,
    title: "Free tickets",
    body:
      "Unlimited free tickets on every plan, forever. No per-registration fee. RSVPs, waitlists, and capacity caps included.",
  },
  {
    icon: CreditCard,
    title: "Paid tickets",
    body:
      "Single tier or tiered (Bronze / Silver / Gold). Sell in INR or any of 25+ supported currencies. 2% flat platform fee.",
  },
  {
    icon: Tag,
    title: "Promo codes",
    body:
      "Single-use, multi-use, partner-exclusive, hidden, or auto-applied. Track redemption per code in real time.",
  },
  {
    icon: Percent,
    title: "Early-bird automation",
    body:
      "Set a deadline; illuxus flips to the next tier automatically. Optional countdown timer on the public event page.",
  },
  {
    icon: Banknote,
    title: "Group tickets",
    body:
      "Buy N, save X%. Distribute access codes to teammates. Per-attendee data capture without paying N times.",
  },
  {
    icon: Smartphone,
    title: "Wallet passes",
    body:
      "Every ticket gets a PDF + Apple Wallet + Google Wallet pass with QR. Buyers add to their phone in one tap.",
  },
];

const paymentMethods = [
  {
    title: "Razorpay (India)",
    points: [
      "UPI: PhonePe, Google Pay, Paytm, BHIM",
      "Cards: Visa, Mastercard, RuPay, Amex",
      "NetBanking from 50+ Indian banks",
      "Wallets: Paytm, Mobikwik, Freecharge, Olamoney",
      "EMI on cards and Bajaj Finserv",
      "Payouts T+0 to T+1",
    ],
  },
  {
    title: "Stripe (international)",
    points: [
      "Cards in 135+ currencies",
      "Apple Pay + Google Pay",
      "3DS / Strong Customer Authentication",
      "ACH + SEPA for Enterprise",
      "Stripe Tax for US sales tax",
      "Payouts T+2 to T+7 depending on region",
    ],
  },
];

const competitorTable = [
  {
    feature: "Platform fee on paid tickets (organizer)",
    illuxus: "2% flat",
    eventbrite: "Tiered + buyer service fee",
    townscript: "≈2.5% + tax",
    explara: "Custom",
    insiderIn: "Negotiated per event",
  },
  {
    feature: "Buyer service fee on top of price",
    illuxus: "None",
    eventbrite: "Yes",
    townscript: "Yes",
    explara: "Yes",
    insiderIn: "Yes",
  },
  {
    feature: "UPI checkout (first-class)",
    illuxus: "Yes",
    eventbrite: "Limited",
    townscript: "Yes",
    explara: "Yes",
    insiderIn: "Yes",
  },
  {
    feature: "GST invoice with GSTIN + HSN",
    illuxus: "Auto",
    eventbrite: "Limited",
    townscript: "Yes",
    explara: "Yes",
    insiderIn: "Yes",
  },
  {
    feature: "Apple + Google Wallet passes",
    illuxus: "Yes",
    eventbrite: "Yes",
    townscript: "Partial",
    explara: "Partial",
    insiderIn: "Yes",
  },
  {
    feature: "Refund automation + webhook",
    illuxus: "Yes",
    eventbrite: "Yes",
    townscript: "Manual",
    explara: "Manual",
    insiderIn: "Manual",
  },
  {
    feature: "Free events stay free",
    illuxus: "Forever",
    eventbrite: "Yes",
    townscript: "Yes",
    explara: "Yes",
    insiderIn: "No",
  },
];

export default function EventTicketingPlatformPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Event Ticketing Platform India — 2% Fees, No Setup Cost | illuxus"
        description="Sell event tickets online with India's most organizer-friendly ticketing platform. UPI + Razorpay + Stripe, GST invoicing, promo codes, early-bird automation, refunds, Apple/Google Wallet passes. 2% flat platform fee. Free for free events."
        canonical="https://illuxus.com/event-ticketing-platform"
        keywords={KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={TICKETING_JSON_LD}
      />

      {/* Hero */}
      <section className="pt-24 pb-12 px-4 text-center">
        <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
          Event ticketing platform
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
          Sell event tickets online in India — at 2% fees, with UPI built in
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          The event ticketing platform Indian organizers run paid summits, workshops, and
          festivals on. Razorpay + UPI + Stripe, GST-compliant invoicing, promo codes,
          early-bird automation, and one-click refunds — all at a{" "}
          <span className="text-foreground font-medium">flat 2% platform fee</span> with{" "}
          <span className="text-foreground font-medium">no buyer service fee</span>.
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
          Free events are free forever · No setup cost · Same-day Razorpay payouts
        </p>
      </section>

      {/* Headline metrics */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: "2%", label: "Platform fee on paid tickets" },
            { value: "₹0", label: "Setup cost" },
            { value: "T+0", label: "Razorpay payouts" },
            { value: "25+", label: "Currencies supported" },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-2xl p-4 text-center"
            >
              <div className="text-2xl sm:text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Ticket types */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Every ticket type a serious event needs
        </h2>
        <p className="text-muted-foreground max-w-3xl mb-8">
          Mix and match as many ticket types as you want on a single event. There's no per-tier
          surcharge. Capacity, sales windows, and visibility rules are configurable per ticket.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {ticketTypes.map((t) => {
            const Icon = t.icon;
            return (
              <article
                key={t.title}
                className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Payments */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-3">
            Razorpay + UPI for India, Stripe for the world
          </h2>
          <p className="text-center text-muted-foreground max-w-3xl mx-auto mb-10">
            Toggle processors per event. INR buyers route to Razorpay; international buyers
            route to Stripe; you can disable either if you want a single payment flow.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {paymentMethods.map((p) => (
              <article key={p.title} className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-semibold text-lg mb-4">{p.title}</h3>
                <ul className="space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{pt}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Refund + invoicing */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <article className="bg-card border border-border rounded-2xl p-6">
            <ReceiptText className="h-6 w-6 text-primary mb-3" />
            <h2 className="text-xl font-bold mb-3">GST-compliant invoicing, automatic</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Every paid ticket triggers a GST tax invoice with your GSTIN, the buyer's
              GSTIN (when entered), the right HSN/SAC code per ticket type, and the CGST /
              SGST or IGST split based on the buyer's state. B2B reverse-charge is supported.
              Invoices auto-email to the buyer and export to CSV for your accountant.
            </p>
            <ul className="space-y-1.5 text-sm">
              {[
                "Unique invoice number per transaction",
                "CGST + SGST / IGST split correctly",
                "B2B reverse-charge handling",
                "Export to Tally, Zoho Books, ClearTax",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="bg-card border border-border rounded-2xl p-6">
            <FileSpreadsheet className="h-6 w-6 text-primary mb-3" />
            <h2 className="text-xl font-bold mb-3">One-click refunds, with audit trail</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Refund full or partial from the ticket detail page. Refunds go back via the
              original payment method, the platform fee is reversed automatically on full
              refunds, and a webhook fires so your accounting tool stays in sync. The audit
              log records who issued the refund and when — immutable, exportable.
            </p>
            <ul className="space-y-1.5 text-sm">
              {[
                "Full + partial refunds",
                "UPI refunds in 1–2 business days",
                "Card refunds in 5–7 business days",
                "Automatic platform fee reversal",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-1 shrink-0" />
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* Security */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10">
          <Lock className="h-6 w-6 text-primary mb-3" />
          <h2 className="text-2xl font-bold mb-3">Money + identity handled with care</h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">
            illuxus does not store raw card numbers. Card data goes directly to Razorpay /
            Stripe under PCI-DSS Level 1 controls and we hold only the tokenized reference.
            Personal data is encrypted at rest (AES-256) and in transit (TLS 1.3), with named
            DPO and Grievance Officer in Mumbai, and a published 28-section Privacy Policy
            covering DPDPA 2023, GDPR, and the IT Act 2000.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-muted/30 border-y border-border py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-3">
              Comparison
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              illuxus vs. other India ticketing platforms
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
              Public information only. Verify with each vendor before procurement.
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
                  <th className="p-3 font-semibold">Explara</th>
                  <th className="p-3 font-semibold">Insider.in</th>
                </tr>
              </thead>
              <tbody>
                {competitorTable.map((row) => (
                  <tr key={row.feature} className="border-t border-border">
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-primary font-medium">{row.illuxus}</td>
                    <td className="p-3 text-muted-foreground">{row.eventbrite}</td>
                    <td className="p-3 text-muted-foreground">{row.townscript}</td>
                    <td className="p-3 text-muted-foreground">{row.explara}</td>
                    <td className="p-3 text-muted-foreground">{row.insiderIn}</td>
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
              <Link to="/features">Compare features</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 text-center">
          Frequently asked questions
        </h2>
        <p className="text-center text-muted-foreground mb-8">
          Five quick answers to what most organizers ask before switching ticketing tools.
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
      </section>

      {/* CTA */}
      <section className="bg-primary/5 border-t border-border py-16 px-4 text-center">
        <IndianRupee className="h-6 w-6 text-primary mx-auto mb-3" />
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Sell your first ticket today — in INR, with UPI
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Set up your event, publish it, and start collecting payments in under fifteen minutes.
          No credit card required to start.
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
