import { Link } from "react-router-dom";

import PublicPageShell from "@/components/layout/PublicPageShell";
import RouteSeo from "@/components/RouteSeo";

/**
 * Refund & Cancellation Policy — Illuxus Technologies.
 *
 * Restates, in one place, what the Terms of Service already commit to on
 * refunds (Terms §10 "Payments, settlements and platform fees" and §13
 * "Refunds and the right of withdrawal"), and adds the practical detail an
 * attendee or organiser needs: who decides, how to ask, and how long it
 * takes. Where the two documents differ, the Terms govern — keep them in
 * step when either changes.
 */

const sections = [
  {
    title: "1. Who this policy covers",
    body: `This policy explains when money paid through the Illuxus platform is refunded, and how to ask for a refund. It covers two kinds of payment:

• Tickets and registrations bought by attendees for an event listed on Illuxus.
• Fees paid to Illuxus by event organisers — subscription plans and platform fees.

It should be read with our Terms of Service. Nothing in this policy limits the rights a consumer has under the Consumer Protection Act, 2019 or the Consumer Protection (E-Commerce) Rules, 2020.`,
  },
  {
    title: "2. Event tickets — who decides",
    body: `Each event is run by its organiser, not by Illuxus. The organiser sets the refund terms for their event and publishes them on the event page; those terms apply to your ticket. Illuxus processes approved refunds back to the original payment method.

Whatever the organiser's own terms say, the following always apply:

• The organiser cancels the event — you receive a full refund of the ticket price.
• The event is materially changed (a new date, a different venue, or a change of headline speaker or performer) — you may choose a full refund or keep your ticket for the changed event.
• The event is not delivered as described — you may claim a refund for the defective or deficient service, as provided by the Consumer Protection (E-Commerce) Rules, 2020.

Free registrations involve no payment and so no refund; you can cancel a free registration at any time from My Tickets.`,
  },
  {
    title: "3. Event tickets — if you change your mind",
    body: `If you can no longer attend, whether you are refunded depends on the organiser's published refund terms for that event. Common arrangements include a full refund up to a cut-off date, a partial refund, a transfer of the ticket to another person, or no refund.

Please check the event page before you buy. If an event page states no refund terms, contact the organiser through the event page, or write to us at support@illuxus.com and we will pass your request to them.`,
  },
  {
    title: "4. Fees that may not be returned",
    body: `When a ticket is refunded, the ticket price is returned. Two charges are treated separately:

• Payment gateway charges are levied by the payment gateway, not by Illuxus, and the gateway may keep them.
• The Illuxus platform fee may be retained, in line with the organiser's published refund terms and the law.

Where an organiser cancels an event, the organiser is responsible for making attendees whole in line with their published terms and with consumer law.`,
  },
  {
    title: "5. How to ask for a ticket refund",
    body: `1. Open My Tickets, or the confirmation email for your booking, and note the event name and the email address you registered with.
2. Ask the organiser, using the contact details on the event page — most refunds are decided by them.
3. If you cannot reach the organiser, or the event was cancelled or materially changed and you have not been refunded, write to support@illuxus.com with your booking details.

We may ask you to confirm that you own the email address used for the booking before acting on a request.`,
  },
  {
    title: "6. How long a refund takes",
    body: `Once a refund is approved, it is initiated within 7 business days. It is then usually credited within 5–10 business days, depending on your bank or card issuer. Refunds are always sent to the original payment method; we cannot send a refund to a different account or card.`,
  },
  {
    title: "7. Organiser subscriptions and platform fees",
    body: `Subscription plans are billed in advance for each billing period. You can cancel at any time from your workspace settings; cancellation stops the next renewal and your plan remains active until the end of the period already paid for.

Fees for a billing period that has started are not refunded, except where:

• you were charged in error or charged twice;
• the paid features were unavailable for a substantial part of the period because of a fault on our side; or
• a refund is required by law.

Platform fees on ticket sales are charged per transaction. They are returned or retained with the underlying ticket as described in section 4.`,
  },
  {
    title: "8. Chargebacks and disputes",
    body: `If you believe a charge is wrong, please contact us before raising a dispute with your bank — it is usually faster. Where a chargeback is raised, we share the booking and attendance records with the payment gateway so the dispute can be decided on the facts. To cover refunds and chargebacks, we may hold back part of an organiser's settlement for a period after the event, as set out in the Terms of Service.`,
  },
  {
    title: "9. If you are not satisfied",
    body: `If a refund request has not been resolved to your satisfaction, you can escalate it to our Grievance Officer at grievance@illuxus.com. We acknowledge grievances within 48 hours and aim to resolve them within one month, as required by the Consumer Protection (E-Commerce) Rules, 2020.`,
  },
  {
    title: "10. Changes to this policy",
    body: `We may update this policy from time to time. The version in force when you made a payment applies to that payment. Material changes are announced on this page and, for organisers, by email.`,
  },
];

export default function RefundPolicyPage() {
  return (
    <PublicPageShell>
      <RouteSeo
        title="Refund & Cancellation Policy — illuxus event platform"
        description="When event tickets and organiser fees paid through illuxus are refunded, how to ask for a refund, and how long it takes."
        canonical="https://illuxus.com/refunds"
        keywords="illuxus refund policy, event ticket refund, event cancellation refund, refund timeline, organiser subscription refund"
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              url: "https://illuxus.com/refunds",
              name: "Refund & Cancellation Policy",
              inLanguage: "en-IN",
              publisher: { "@id": "https://illuxus.com/#organization" },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
                { "@type": "ListItem", position: 2, name: "Refund Policy", item: "https://illuxus.com/refunds" },
              ],
            },
          ],
        }}
      />

      <main>
        <section className="pt-24 pb-10 text-center px-4">
          <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Refund &amp; Cancellation Policy</h1>
          <p className="text-muted-foreground text-[14px]">Version 1.0</p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
          <div className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5 space-y-3">
            <p>
              In short: the organiser of each event sets its refund terms, but you are always refunded the ticket price
              if the event is cancelled, and you can always choose a refund if it is materially changed. Approved refunds
              are initiated within 7 business days.
            </p>
            <p>
              Companion documents:{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>,{" "}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and{" "}
              <Link to="/cookies" className="text-primary hover:underline">Cookie Policy</Link>.
            </p>
          </div>
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-semibold mb-3">{s.title}</h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
            </div>
          ))}
          <div className="border border-border bg-card rounded-xl p-5 text-[14px] text-muted-foreground leading-relaxed">
            <h2 className="text-lg font-semibold text-foreground mb-2">Contact</h2>
            <p>
              Refund requests: <a href="mailto:support@illuxus.com" className="text-primary hover:underline">support@illuxus.com</a>
              <br />
              Escalations: <a href="mailto:grievance@illuxus.com" className="text-primary hover:underline">grievance@illuxus.com</a>
              <br />
              Or use the <Link to="/contact" className="text-primary hover:underline">contact form</Link> and choose “Billing”.
            </p>
          </div>
        </section>
      </main>
    </PublicPageShell>
  );
}
