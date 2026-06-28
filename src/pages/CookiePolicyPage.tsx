import SiteHeader from "@/components/SiteHeader";

/**
 * Cookie Policy — Illuxus Technologies.
 *
 * Drafted to satisfy:
 *  - IT Act 2000 Section 43A (reasonable security practices for SPDI)
 *  - SPDI Rules 2011 (consent for collection of SPDI)
 *  - DPDPA 2023 Sections 4–8 (consent + notice for non-essential processing)
 *  - GDPR Article 7 + ePrivacy principles for EU/UK users
 *
 * Cookie table is rendered as a real <table> so screen readers can navigate it.
 * Light/dark mode is driven by semantic Tailwind tokens (bg-card, border-border).
 */

type CookieRow = {
  name: string;
  purpose: string;
  type: "Essential" | "Functional" | "Analytics" | "Marketing";
  party: "First-party" | "Third-party";
  duration: string;
};

const cookieTable: CookieRow[] = [
  {
    name: "sb-access-token",
    purpose: "Supabase authentication — keeps you signed in. Without it you cannot log in.",
    type: "Essential",
    party: "First-party",
    duration: "Session (cleared on browser close)",
  },
  {
    name: "sb-refresh-token",
    purpose: "Supabase authentication — silently refreshes your access token so you stay logged in.",
    type: "Essential",
    party: "First-party",
    duration: "7 days",
  },
  {
    name: "illuxus:cookie-consent",
    purpose: "Stores your cookie consent choices so we don't ask again on every page load.",
    type: "Essential",
    party: "First-party",
    duration: "12 months",
  },
  {
    name: "illuxus:theme",
    purpose: "Remembers your light/dark theme preference.",
    type: "Functional",
    party: "First-party",
    duration: "12 months",
  },
  {
    name: "illuxus:org-id",
    purpose: "Remembers the active workspace/organisation you switched to.",
    type: "Functional",
    party: "First-party",
    duration: "Session",
  },
  {
    name: "illuxus:currency",
    purpose: "Stores the currency you've chosen for browsing tickets.",
    type: "Functional",
    party: "First-party",
    duration: "12 months",
  },
  {
    name: "vp_ratelimit",
    purpose: "Protects login and payment endpoints from brute force and bot traffic.",
    type: "Essential",
    party: "First-party",
    duration: "24 hours",
  },
  {
    name: "__stripe_mid",
    purpose: "Stripe fraud-prevention — uniquely identifies the device for risk scoring.",
    type: "Essential",
    party: "Third-party",
    duration: "12 months",
  },
  {
    name: "__stripe_sid",
    purpose: "Stripe session-scoped fraud-prevention identifier.",
    type: "Essential",
    party: "Third-party",
    duration: "30 minutes",
  },
  {
    name: "rzp_*",
    purpose: "Razorpay payment flow — preserves checkout state between redirects.",
    type: "Essential",
    party: "Third-party",
    duration: "Session",
  },
  {
    name: "_GRECAPTCHA",
    purpose: "Google reCAPTCHA Enterprise — bot defence on sign-up and contact forms.",
    type: "Essential",
    party: "Third-party",
    duration: "6 months",
  },
  {
    name: "_ga, _ga_*",
    purpose: "Google Analytics 4 — anonymous usage analytics (IP truncated). Set only after Analytics consent.",
    type: "Analytics",
    party: "Third-party",
    duration: "24 months",
  },
  {
    name: "sentry-replay",
    purpose: "Sentry session-replay sampling token (only when sampled). IPs are anonymised.",
    type: "Analytics",
    party: "Third-party",
    duration: "Session",
  },
  {
    name: "lk_session",
    purpose: "LiveKit webinar session — established only when you join a live event.",
    type: "Essential",
    party: "Third-party",
    duration: "Session",
  },
];

const sections = [
  {
    title: "1. What are cookies?",
    body: `A cookie is a small text file stored by your browser on your device when you visit a website. Cookies allow the site to recognise your browser on subsequent visits, remember preferences, keep you signed in, and measure how the site is used.

We use the word "cookie" loosely in this Policy to include similar client-side storage technologies — HTML5 local storage, session storage, IndexedDB entries, web beacons, and pixel tags — that perform comparable functions.

There are two ways cookies are classified:

• First-party vs third-party — First-party cookies are set by illuxus.com (and its subdomains). Third-party cookies are set by services we embed, such as Stripe, Razorpay, Google reCAPTCHA, LiveKit, and (only with your consent) Google Analytics.

• Session vs persistent — Session cookies are deleted when you close your browser. Persistent cookies remain for a defined duration (shown in the cookie table below).`,
  },
  {
    title: "2. Legal basis under Indian and EU law",
    body: `Indian law:
• Section 43A of the Information Technology Act, 2000 — Illuxus, as a body corporate handling Sensitive Personal Data or Information ("SPDI"), is required to maintain reasonable security practices. Cookies that handle authentication or financial information fall within this regime.
• SPDI Rules 2011 — Rule 5 requires consent for collection of SPDI; we therefore obtain consent before any cookie that processes SPDI is set, except where the cookie is strictly necessary to provide a service you have requested.
• DPDPA 2023 Sections 4 and 6 — Personal data may be processed only on a lawful basis, and where the basis is consent it must be free, specific, informed, unconditional, unambiguous, and capable of being withdrawn. Strictly necessary cookies for the service you request rely on the "performance of contract" and "legitimate use" bases under Sections 4 and 7.

EU/UK law (where applicable):
• GDPR Article 7 and the UK GDPR — explicit, opt-in consent for non-essential cookies; right to withdraw at any time.
• ePrivacy Directive (2002/58/EC) and PECR (UK) — equivalent treatment for cookies regardless of whether they constitute personal data.

In practice, this means only "Essential" cookies are set when you first visit Illuxus. Functional, Analytics, and Marketing cookies are set only after you affirmatively opt in via the in-app consent banner.`,
  },
  {
    title: "3. Categories of cookies we use",
    body: `We classify cookies into four categories:

(a) Essential — required for the Platform to function. Authentication, security, fraud prevention, payment processing, load balancing, and storage of your cookie consent itself. You cannot disable these and continue to use the service.

(b) Functional — remember preferences (theme, language, currency, active workspace) so the Platform behaves the way you set it. Disabling them does not break the Platform but means your preferences reset on every visit.

(c) Analytics — help us understand how the Platform is used in aggregate (which pages are popular, where errors occur, how long pages take to load). Identifiers are pseudonymised; IP addresses are truncated. Disabling them has no effect on your experience.

(d) Marketing — currently not used at the platform level. Some sponsor or organiser pages may embed third-party marketing tags after their own consent step; those are governed by the embedder's privacy notice.`,
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="pt-24 pb-10 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Cookie Policy</h1>
        <p className="text-muted-foreground text-[14px]">
          Last updated: 20 June 2026 · Effective: 20 June 2026 · Version 1.0
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
        <div className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5 space-y-3">
          <p>
            This Cookie Policy explains how Illuxus Technologies Private Limited and our trusted
            partners use cookies and similar technologies on illuxus.com and its subdomains. It
            should be read together with our{" "}
            <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>,{" "}
            <a href="/terms" className="text-primary hover:underline">Terms of Service</a>, and (if
            you are an EU/UK/Swiss resident) our{" "}
            <a href="/gdpr" className="text-primary hover:underline">GDPR Notice</a>.
          </p>
          <p>
            You can change your cookie choices at any time using the "Manage cookies" link in the
            footer, or by clearing cookies in your browser.
          </p>
        </div>

        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="text-lg font-semibold mb-3">{s.title}</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
          </div>
        ))}

        {/* Cookie table */}
        <div>
          <h2 className="text-lg font-semibold mb-3">4. Specific cookies we set</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
            The table below lists the cookies and similar technologies we (and our sub-processors)
            may set on your device. Names ending in a wildcard (<code>*</code>) indicate a family
            of identifiers used by the same vendor.
          </p>
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Name</th>
                    <th className="text-left font-medium px-4 py-3">Purpose</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Type</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Party</th>
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {cookieTable.map((c, i) => (
                    <tr key={c.name} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                      <td className="px-4 py-3 font-mono text-[12px] text-foreground whitespace-nowrap align-top">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top">{c.purpose}</td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span
                          className={
                            c.type === "Essential"
                              ? "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary"
                              : c.type === "Functional"
                              ? "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : c.type === "Analytics"
                              ? "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          }
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top whitespace-nowrap">
                        {c.party}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top whitespace-nowrap">
                        {c.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">5. Third-party cookies and embedded services</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`When you interact with certain features, the following third parties may set their own cookies on your device. Their cookie practices are governed by their respective policies.

• Stripe — fraud prevention and risk scoring during payment. https://stripe.com/cookies-policy
• Razorpay — checkout state and fraud prevention. https://razorpay.com/privacy/
• Google reCAPTCHA Enterprise — bot defence on sign-up, login, password reset, and contact forms. https://policies.google.com/privacy
• Google Analytics 4 — set only after you opt in to Analytics cookies. IP-anonymisation is enabled. https://policies.google.com/privacy
• Sentry (functional software) — error monitoring and (when sampled) session replay; IPs are anonymised. https://sentry.io/privacy/
• LiveKit Cloud — established only when you join a webinar; provides real-time audio/video transport. https://livekit.io/privacy
• Twilio SendGrid — open/click tracking pixels in transactional and broadcast emails. https://www.twilio.com/legal/privacy
• Cloudflare — DDoS mitigation, bot management, and edge caching. https://www.cloudflare.com/privacypolicy/

We do not use cross-site advertising trackers (such as Facebook Pixel or LinkedIn Insight Tag) at the platform level. Individual organiser landing pages may embed such trackers; in that case the landing page must disclose them and obtain its own consent.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">6. How we use analytics cookies</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`We use analytics cookies, only with your prior opt-in, to:

• Measure traffic to the Platform — page views, sessions, bounce rates.
• Identify performance issues — slow-loading pages, error hotspots.
• Understand which features are used and which are not, so we can prioritise.

Analytics processors:
• Google Analytics 4 — configured with IP-anonymisation, Google Signals disabled, ad personalisation disabled, data retention set to 14 months. Demographic and interest reports are disabled.
• Sentry — error tracking and (sampled) session replay. Form inputs, text content, and images are masked by default; only DOM structure and HTTP errors are captured. IPs are truncated server-side.

You can opt out of analytics cookies at any time using the cookie consent banner.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">7. How to manage cookies</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`There are three ways to manage cookies:

(a) In-app — click "Manage cookies" in the footer (or use the link at the bottom of this page) to open the consent banner and change your choices. You can opt in or out of Functional, Analytics, and Marketing categories independently.

(b) Account-level — Settings → Privacy → Cookie preferences (after you sign in). Your choices sync across devices logged into the same account.

(c) Browser-level — every major browser lets you block or delete cookies. Note that blocking essential cookies will break login and payment.

• Chrome: chrome://settings/cookies
• Firefox: about:preferences#privacy → Cookies and Site Data
• Safari (macOS): Settings → Privacy → Manage Website Data
• Safari (iOS): Settings → Safari → Block All Cookies
• Edge: edge://settings/content/cookies
• Brave: brave://settings/cookies

For mobile apps, you can clear cookies and storage from the OS-level app settings.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">8. Effect of disabling cookies</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`• Disabling Essential cookies — login, payment, and security will not work. We cannot deliver the Platform to you.
• Disabling Functional cookies — preferences (theme, currency, workspace) will reset on every visit; otherwise no impact.
• Disabling Analytics cookies — no impact on your experience. We will receive less data to improve the Platform.
• Disabling Marketing cookies — no impact on your experience.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">9. Do Not Track signals</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`When your browser sends a "Do Not Track" (DNT) signal, we treat it as if you have not opted in to Analytics or Marketing cookies. We respect DNT regardless of whether the underlying user is in a jurisdiction that legally mandates it.

We also honour the Global Privacy Control (GPC) signal in the same manner.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">10. Consent record retention</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`We retain a record of your cookie consent (categories chosen, timestamp, version of the banner shown) for 12 months from the date of consent or withdrawal, whichever is later. The record is stored under the cookie illuxus:cookie-consent and in our consent audit log.

After 12 months, we will re-ask for consent so that your choices are kept current.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">11. Withdrawing consent</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`You can withdraw consent at any time, free of charge, by:

• Clicking "Manage cookies" in the footer and toggling categories off.
• Clearing cookies in your browser (this also clears your consent record, after which only Essential cookies will be set until you re-consent).
• Writing to privacy@illuxus.com.

Withdrawal takes effect immediately. Cookies already on your device are not retroactively erased by withdrawal alone — clear your browser storage to remove them, or rely on their natural expiry.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">12. Children and cookies</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`We do not knowingly set Analytics or Marketing cookies for users who have identified themselves as under 18, in line with DPDPA Section 9 (no behavioural monitoring of children) and our Privacy Policy. Only Essential cookies are set, and only to the extent necessary for the service.

If you believe a child's device has been profiled by us, contact privacy@illuxus.com and we will purge the associated identifiers.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">13. Cross-border cookie data</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`Some of our third-party cookies set by sub-processors result in data being processed outside India — primarily in the United States and the European Economic Area. The same safeguards described in Section 12 of our Privacy Policy apply (Standard Contractual Clauses, ISO 27001 / SOC 2 sub-processor certification, encryption, minimisation).

Under DPDPA Section 16, the Central Government may notify a list of countries to which transfer of personal data is restricted. If such a notification affects any sub-processor we use, we will reconfigure or remove the affected cookie.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">14. Updates to this Cookie Policy</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`We may update this Cookie Policy from time to time. When we materially change the categories of cookies we use or the third parties involved, we will:

• Update the "Last updated" date at the top of this Policy.
• Show the cookie consent banner again, asking you to re-confirm your choices.
• Notify you by email at least 14 days in advance for material changes.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">15. Grievance redressal</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`If you have a complaint about how we use cookies, contact our Grievance Officer:

Name: Rohan Mehta
Designation: Grievance Officer (Privacy & Content)
Email: grievance@illuxus.com
Postal address: Grievance Office, Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.
Phone: +91 22 6000 0001 (Mon–Fri, 10:00–18:00 IST)

The Grievance Officer will acknowledge your complaint within 24 hours and resolve it within 15 days. If you are unsatisfied with the response, escalation paths are described in the Privacy Policy.`}
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">16. Contact us</h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
{`General privacy enquiries: privacy@illuxus.com
Grievance Officer: grievance@illuxus.com
Post: Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.`}
          </p>
        </div>

      </section>

    </div>
  );
}
