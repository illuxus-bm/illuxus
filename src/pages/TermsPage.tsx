import SiteHeader from "@/components/SiteHeader";

const sections = [
  {
    title: "1. Acceptance of terms",
    body: `By accessing or using Illuxus ("the Platform", "we", "our", or "us") you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Platform.

These Terms apply to all users — event organisers, attendees, speakers, and sponsors. Where different terms apply to a specific role, they are noted clearly.`,
  },
  {
    title: "2. Description of service",
    body: `Illuxus is an all-in-one event management platform that allows:
• Organisers to create, publish, and manage events, sell tickets, manage speakers and sponsors, check in attendees, run live webinars, and view analytics.
• Attendees to discover and register for events, receive tickets, and join live sessions.
• Speakers and sponsors to apply for, accept, and participate in events.

We reserve the right to modify, suspend, or discontinue any part of the service with reasonable notice.`,
  },
  {
    title: "3. Accounts",
    body: `You must be at least 16 years old to create an account. By creating an account you represent that all information you provide is accurate and that you will keep it up to date.

You are responsible for maintaining the confidentiality of your login credentials. You are responsible for all activity that occurs under your account. Notify us immediately at support@illuxus.com if you suspect unauthorised access.

We may suspend or terminate accounts that violate these Terms.`,
  },
  {
    title: "4. Organiser responsibilities",
    body: `As an event organiser you are solely responsible for:
• The accuracy of all event information published on the Platform.
• Obtaining all necessary permits, licences, and authorisations for your event.
• Complying with applicable laws — including consumer protection, health and safety, data protection, and taxation laws.
• Fulfilling your promises to attendees (delivering the event as advertised, issuing refunds where required).
• The behaviour and welfare of attendees at your event.

Illuxus is a technology platform. We are not the organiser, promoter, or producer of any event listed on the Platform and accept no liability for the acts or omissions of organisers.`,
  },
  {
    title: "5. Payments and refunds",
    body: `For paid events, payments are processed by Stripe or Razorpay. By purchasing a ticket you agree to their respective terms of service.

Platform fees:
• Starter plan: 2% platform fee on paid ticket revenue.
• Professional plan: 2% platform fee on paid ticket revenue.
• Enterprise plan: flat fee as agreed in your contract.

Refund policy:
• Refund eligibility is set by the event organiser. Where an organiser offers refunds, we facilitate them through the original payment method.
• If an event is cancelled by the organiser, Illuxus will use reasonable efforts to facilitate a full refund.
• Platform fees are non-refundable in cases where the event took place as described.`,
  },
  {
    title: "6. Prohibited conduct",
    body: `You must not use the Platform to:
• Create fraudulent, misleading, or illegal events.
• Sell counterfeit tickets or engage in ticket touting beyond original face value.
• Collect personal data beyond what is necessary for event management.
• Upload content that is defamatory, obscene, hateful, discriminatory, or infringing on third-party rights.
• Attempt to access or interfere with accounts, systems, or data that are not yours.
• Reverse-engineer, scrape, or extract data from the Platform without written permission.
• Use the Platform for any purpose that violates applicable laws.

Violation of these prohibitions may result in immediate account termination and, where appropriate, referral to law enforcement.`,
  },
  {
    title: "7. Intellectual property",
    body: `Illuxus and its licensors own all intellectual property rights in the Platform, including the source code, design, logos, and documentation.

You retain ownership of the content you upload to the Platform (event descriptions, images, session schedules, etc.). By uploading content you grant Illuxus a non-exclusive, royalty-free licence to host, display, and reproduce that content as necessary to provide the service.

You may not use Illuxus's trademarks or branding without prior written permission.`,
  },
  {
    title: "8. Privacy",
    body: `Your use of the Platform is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the Platform you consent to the data practices described in the Privacy Policy.`,
  },
  {
    title: "9. Disclaimers and limitation of liability",
    body: `THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ILLUXUS'S TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO ILLUXUS IN THE 3 MONTHS PRECEDING THE CLAIM, OR (B) ₹5,000.

WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS OR DATA, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

Nothing in these Terms limits liability that cannot be excluded by law (such as liability for fraud or death/personal injury caused by negligence).`,
  },
  {
    title: "10. Indemnification",
    body: `You agree to indemnify and hold harmless Illuxus and its officers, directors, employees, and agents from any claims, damages, losses, and expenses (including reasonable legal fees) arising out of:
• Your use of the Platform.
• Content you upload or publish.
• Your violation of these Terms.
• Your violation of any third-party right.`,
  },
  {
    title: "11. Termination",
    body: `You may close your account at any time by contacting support@illuxus.com.

We may suspend or terminate your account at any time if we believe you have violated these Terms, engaged in fraudulent activity, or if required by law. We will provide advance notice where reasonably practicable.

Upon termination:
• Your access to the Platform ceases immediately.
• We will retain your data for the period required by law.
• Accrued rights and obligations survive termination (e.g., payments due, indemnities).`,
  },
  {
    title: "12. Governing law & disputes",
    body: `These Terms are governed by the laws of India. Any disputes shall first be referred to good-faith negotiation. If unresolved within 30 days, disputes shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra, India.

Nothing in this clause prevents either party from seeking urgent injunctive or other equitable relief in any court of competent jurisdiction.`,
  },
  {
    title: "13. Changes to these terms",
    body: `We may update these Terms at any time. When we make material changes we will notify you by email or a prominent platform notice at least 14 days before the new Terms take effect. Continued use of the Platform after the effective date constitutes acceptance of the updated Terms.`,
  },
  {
    title: "14. Contact",
    body: `Questions about these Terms?

Email: legal@illuxus.com
Post: Illuxus Technologies, Mumbai, Maharashtra, India`,
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="pt-24 pb-10 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Terms of Service</h1>
        <p className="text-muted-foreground text-[14px]">Last updated: 20 June 2026 · Effective: 20 June 2026</p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
        <p className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5">
          Please read these Terms of Service carefully before using the Illuxus platform. These Terms constitute a legally binding agreement between you and Illuxus Technologies.
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
