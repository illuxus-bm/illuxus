import SiteHeader from "@/components/SiteHeader";

const sections = [
  {
    title: "1. Who we are",
    body: `Illuxus is an event management platform operated by Illuxus Technologies (collectively "Illuxus", "we", "our", or "us"). Our registered office is in Mumbai, Maharashtra, India. We are the data controller for personal information collected through the Illuxus platform.

If you have any questions about this Privacy Policy or how we handle your data, please contact us at privacy@illuxus.com.`,
  },
  {
    title: "2. What data we collect",
    body: `We collect information you provide directly:
• Account information: name, email address, phone number, and password when you create an account.
• Profile data: profile picture, job title, company, bio, and social links that you add to your public profile.
• Event data: events you create or register for, ticket purchases, session attendance, and check-in records.
• Payment data: billing address and last-four card digits (full card details are processed by our payment partners Stripe and Razorpay — we never store full card numbers).
• Communications: messages you send through our platform, support tickets, and survey responses.

We also collect information automatically:
• Usage data: pages visited, features used, timestamps, session duration.
• Device & browser data: IP address, browser type, operating system, screen resolution.
• Cookies & similar technologies: described in Section 8.`,
  },
  {
    title: "3. How we use your data",
    body: `We use your personal data to:
• Create and manage your account and authenticate your identity.
• Process ticket purchases and issue refunds.
• Send transactional emails (booking confirmations, reminders, receipts).
• Allow event organisers to manage registrations, check-in, and communicate with attendees.
• Power personalised event recommendations and matchmaking features.
• Analyse platform usage to improve our product.
• Detect, prevent, and respond to fraud or security incidents.
• Comply with legal obligations (tax records, court orders).

We will only send you marketing emails if you have opted in. You can unsubscribe at any time.`,
  },
  {
    title: "4. How we share your data",
    body: `We never sell your personal data to third parties.

We may share your data with:
• Event organisers: when you register for an event, the organiser receives your name, email, and registration details so they can manage their event.
• Payment processors: Stripe and Razorpay receive billing data to process payments.
• Cloud infrastructure: we use Supabase (hosted on AWS) for our database and storage.
• Email delivery: we use trusted providers to send transactional emails.
• Analytics: anonymised usage data may be shared with analytics providers.
• Law enforcement: if we are required by law or a valid court order.

All sub-processors are bound by data processing agreements and appropriate safeguards.`,
  },
  {
    title: "5. Data retention",
    body: `We retain your personal data for as long as your account is active or as needed to provide our services. You may request deletion of your account and personal data at any time (see Section 6).

Some data may be retained for longer periods where required by law — for example, payment records must be kept for 7 years for tax purposes in India.

Anonymised or aggregated data (which cannot identify you) may be retained indefinitely for analytics purposes.`,
  },
  {
    title: "6. Your rights",
    body: `Depending on your location, you may have the following rights regarding your personal data:
• Access: request a copy of the data we hold about you.
• Correction: ask us to correct inaccurate or incomplete data.
• Deletion: request deletion of your personal data ("right to be forgotten").
• Portability: receive your data in a structured, machine-readable format.
• Restriction: ask us to limit processing of your data in certain circumstances.
• Objection: object to processing based on our legitimate interests.
• Withdraw consent: where processing is based on consent, withdraw it at any time.

To exercise any of these rights, email us at privacy@illuxus.com. We will respond within 30 days.`,
  },
  {
    title: "7. Security",
    body: `We take the security of your data seriously. We implement industry-standard measures including:
• TLS/HTTPS encryption for all data in transit.
• AES-256 encryption for data at rest.
• Row-level security on our database (each user can only access their own data).
• Regular security audits and penetration testing.
• Strict access controls — only authorised personnel can access production data.

No system is 100% secure. In the unlikely event of a data breach we will notify affected users and relevant authorities as required by law.`,
  },
  {
    title: "8. Cookies",
    body: `We use cookies and similar technologies to:
• Keep you logged in (session cookies).
• Remember your preferences (e.g., dark mode, display currency).
• Understand how you use the platform (analytics cookies).

You can control cookies through your browser settings. Disabling cookies may affect functionality such as keeping you logged in.

We do not use advertising or cross-site tracking cookies.`,
  },
  {
    title: "9. Children",
    body: `Illuxus is not directed at children under the age of 13. We do not knowingly collect personal data from children under 13. If we become aware that a child under 13 has provided us with personal data we will delete it promptly. If you believe a child has provided us data, please contact privacy@illuxus.com.`,
  },
  {
    title: "10. International transfers",
    body: `Illuxus is based in India. Your data may be stored and processed in countries outside your home country, including the United States (where our infrastructure partners operate). We ensure that any such transfers comply with applicable data protection laws and that adequate safeguards are in place.`,
  },
  {
    title: "11. Changes to this policy",
    body: `We may update this Privacy Policy from time to time. When we make material changes we will notify you by email or via a prominent notice on our platform at least 14 days before the changes take effect. The date at the top of this page always reflects the most recent version.`,
  },
  {
    title: "12. Contact us",
    body: `For any privacy-related questions, data subject requests, or concerns:

Email: privacy@illuxus.com
Post: Illuxus Technologies, Mumbai, Maharashtra, India

We aim to respond to all enquiries within 30 days.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="pt-24 pb-10 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-muted-foreground text-[14px]">Last updated: 20 June 2026</p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
        <p className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5">
          This Privacy Policy explains how Illuxus Technologies collects, uses, stores, and shares your personal data when you use the Illuxus event management platform. Please read it carefully.
        </p>
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="text-lg font-semibold mb-3">{s.title}</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
          </div>
        ))}
      </section>

    </div>
  );
}
