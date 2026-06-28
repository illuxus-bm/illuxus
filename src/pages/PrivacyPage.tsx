import SiteHeader from "@/components/SiteHeader";

/**
 * Privacy Policy — Illuxus Technologies.
 *
 * Drafted to align with the Indian privacy and IT regulatory regime:
 *  - Digital Personal Data Protection Act 2023 (DPDPA)
 *  - Information Technology Act 2000 (incl. Section 43A, Section 79)
 *  - SPDI Rules 2011 (Reasonable Security Practices)
 *  - IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021
 *  - CERT-In directive dated 28 April 2022 (cyber incident reporting + log retention)
 *  - Income Tax Act 1961 (record retention), CGST Act 2017, GST rules
 *
 * Where DPDPA terminology applies we use it (Data Fiduciary, Data Principal,
 * Consent Manager, Significant Data Fiduciary). Where GDPR-equivalent rights
 * are also available, they are surfaced through the separate /gdpr page.
 *
 * Names, addresses, CIN/GSTIN and officer details are placeholders pending
 * incorporation paperwork — see the company info card on /about.
 */

const sections = [
  {
    title: "1. Who we are and our role under DPDPA 2023",
    body: `Illuxus is an event management platform operated by Illuxus Technologies Private Limited (CIN: U72200MH2023PTC123456) ("Illuxus", "we", "our", or "us"). Our registered office is at 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.

For the purposes of the Digital Personal Data Protection Act, 2023 ("DPDPA"), Illuxus Technologies is the Data Fiduciary in respect of personal data collected through the Illuxus platform. Where event organisers determine the purposes for which attendee data they upload is processed, the organiser acts as the Data Fiduciary for that data and Illuxus acts as the Data Processor.

We may, in the future, be notified by the Central Government as a Significant Data Fiduciary under Section 10 of DPDPA depending on the volume and sensitivity of data we process. If and when that happens, we will appoint a Data Protection Officer and publish their contact details in this Privacy Policy.

This Privacy Policy is published in accordance with Rule 3(1) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and Section 5 of DPDPA, and is intended to read together with our Terms of Service, Cookie Policy and (for users with rights under the EU/UK GDPR) the GDPR Notice.`,
  },
  {
    title: "2. Categories of personal data we collect",
    body: `We collect the following categories of personal data:

(a) Identity data — full name, date of birth, gender (optional), profile picture, government-issued ID (for organisers undergoing KYC for payouts).

(b) Contact data — email address, mobile number, postal address, city, country.

(c) Account & authentication data — username, hashed password, multi-factor authentication secrets, recovery codes, OAuth tokens for connected accounts (Google, Apple, LinkedIn).

(d) Profile data — job title, company, bio, social links, dietary preferences (optional, for events serving food), accessibility requirements (optional).

(e) Event data — events you create or register for, ticket purchases, session attendance, check-in records, feedback and ratings.

(f) Financial data — billing address, GSTIN (for B2B invoicing), PAN (for organiser payouts and TDS reporting), last-four card digits, UPI handle (Razorpay reference), bank account fingerprint. We do not store full card numbers, CVV, or full bank account details — those are handled by PCI-DSS certified payment processors.

(g) Technical & usage data — IP address, device identifiers, browser type and version, operating system, time zone, screen resolution, pages visited, features used, click events, time spent.

(h) Location data — coarse geolocation derived from IP; precise geolocation only with explicit consent (used when an attendee opts to share their map pin at in-person events).

(i) Communications data — messages exchanged with organisers, support tickets, survey responses, broadcast emails you receive.

(j) Sensitive personal data or information ("SPDI") under the SPDI Rules 2011 — passwords (stored only as bcrypt hashes), financial information (limited to what Section 2(f) above describes), physical/physiological/mental-health information (only the optional accessibility/dietary fields), biometric information (NOT collected — face recognition for check-in is disabled by default).

We do not knowingly collect: sexual orientation, religious or political beliefs, caste, trade-union membership, genetic data, or criminal history.`,
  },
  {
    title: "3. Lawful basis for processing",
    body: `Under DPDPA Section 4, we process personal data only on one of the following lawful bases:

• Consent — for marketing emails, optional profile fields, precise location, third-party analytics cookies, and any processing of SPDI.

• Performance of a contract — to create your account, process your ticket purchase, deliver tickets, issue invoices, and provide customer support.

• Compliance with a legal obligation — tax records (Income Tax Act 1961, GST law), CERT-In log retention, court orders, anti-money-laundering reporting.

• Legitimate use under Section 7 of DPDPA — fraud prevention, network and information security, internal audit, exercise of legal rights, mergers/acquisitions due diligence.

• Vital interest — emergency contact disclosure to medical responders at an in-person event.

Where we rely on consent, you have the right to withdraw it at any time without affecting the lawfulness of processing carried out before withdrawal. See Section 11 (Consent withdrawal).`,
  },
  {
    title: "4. How we use your data",
    body: `We use your personal data to:

• Create, authenticate, and secure your account (including two-factor authentication, suspicious-login alerts, and bot defence).
• Publish your event listings and process ticket purchases.
• Issue tax invoices in compliance with Rule 46 of the CGST Rules 2017 (and e-invoices where the organiser's turnover exceeds ₹5 crore from August 2023).
• Send transactional communications — booking confirmations, reminders, schedule changes, refunds, receipts, password resets, security alerts.
• Allow organisers to manage attendees, broadcast updates, check attendees in/out, and run live sessions.
• Power personalised event recommendations, matchmaking, and discovery features.
• Generate aggregate analytics on platform usage, attendance, and revenue (no individual is identifiable in published statistics).
• Detect, investigate, and respond to fraud, abuse, ticket touting, and security incidents.
• Comply with our legal and regulatory obligations (tax filings, CERT-In reporting, court orders, statutory disclosures).
• Send marketing communications about Illuxus products and selected partner events — only where you have opted in. You may opt out at any time using the unsubscribe link in every marketing email.

We do not use your personal data for any automated decision-making that produces legal effects or similarly significant effects on you.`,
  },
  {
    title: "5. Sharing with third parties and sub-processors",
    body: `We never sell, rent, or otherwise commercially trade your personal data.

We share personal data with the following categories of recipients, each bound by a written data processing agreement that imposes confidentiality, security, and audit obligations equivalent to those in this Privacy Policy:

(a) Event organisers — when you register for an event, the organiser receives the data necessary to manage your registration (name, email, ticket type, custom-question answers, dietary/accessibility flags you provide, check-in status).

(b) Sub-processors — Illuxus's current list of material sub-processors is:
   • Stripe Payments India Private Limited (India) and Stripe Inc. (USA / Ireland) — international card payments.
   • Razorpay Software Private Limited (Bengaluru, India) — domestic UPI, cards, netbanking.
   • Supabase Inc. (USA — data hosted in AWS ap-south-1 Mumbai by default) — database, storage, authentication.
   • Amazon Web Services India Private Limited (Mumbai ap-south-1) — primary object storage for uploads.
   • Cloudflare Inc. (USA) — CDN, DDoS mitigation, bot management.
   • Sentry / Functional Software, Inc. (USA) — error reporting (IP truncated, PII redacted before transmission).
   • Twilio SendGrid (USA) — transactional and broadcast email delivery.
   • Twilio Inc. (USA) — SMS and WhatsApp Business API for OTP and reminders.
   • Google LLC (USA) — reCAPTCHA Enterprise for bot defence; Google Analytics 4 only where the organiser opts in.
   • LiveKit Cloud (USA) — real-time audio/video infrastructure for webinars (data residency configurable).

The current sub-processor list with addresses and data categories is available on request at privacy@illuxus.com. We update this Privacy Policy and notify enterprise customers at least 30 days before adding a new material sub-processor.

(c) Professional advisors — auditors, lawyers, and tax advisors, bound by professional confidentiality.

(d) Government, regulators and courts — where disclosure is required by law (Section 91 CrPC, Section 69/69A IT Act, court orders, FIU-IND requests, GST authorities, Income Tax authorities). We notify affected users where lawfully permitted.

(e) Successor entities — in connection with a merger, acquisition, financing, or sale of all or part of our business, with appropriate confidentiality safeguards.`,
  },
  {
    title: "6. Categories of personal data and statutory retention periods",
    body: `We retain personal data only for as long as necessary for the purposes for which it was collected, and in line with the following minimum statutory retention windows:

• Tax invoices, books of account, and supporting vouchers — 7 years from the end of the relevant financial year (Section 44AA of the Income Tax Act, 1961, read with Rule 6F).
• GST records, returns, e-invoices, and credit/debit notes — 72 months (6 years) from the due date of the annual return (Section 36, CGST Act 2017).
• KYC documents for organiser payouts — 5 years after the account is closed (PMLA, 2002 read with PML Rules).
• Logs of user activity, sign-ins, transactions, and webinar sessions — 180 days, in compliance with the CERT-In directive of 28 April 2022.
• Cyber incident response artefacts — 180 days from the incident, longer where required by CERT-In or a competent authority.
• Account profile and content uploaded by you — until you delete your account; once you initiate deletion we apply a 30-day "cool-off" reversal window followed by a 60-day grace window for organiser data hand-off, then erase or anonymise within 14 days.
• Marketing consent records — for as long as the consent is active and for 3 years after withdrawal (to evidence prior consent).
• Cookie consent records — 12 months from the date of consent or withdrawal, whichever is later.
• Support tickets, dispute records and grievance logs — 6 years (to defend legal claims).

Once the retention period expires, we securely erase, anonymise, or aggregate the data so that you can no longer be identified. Aggregated / anonymised data may be retained indefinitely.`,
  },
  {
    title: "7. Data Principal Rights under DPDPA 2023 (Chapter III)",
    body: `If you are a Data Principal (the individual to whom the personal data relates), DPDPA Sections 11–14 grant you the following rights, which we honour:

(a) Right to information about processing (Section 11) — you may request a summary of the personal data we process about you, the processing activities, the identities of Data Fiduciaries and Data Processors with whom data has been shared, and any other information prescribed by law.

(b) Right to correction, completion, updating, and erasure (Section 12) — you may ask us to correct inaccurate or misleading personal data, complete incomplete data, update outdated data, or erase personal data that is no longer necessary for the purpose for which it was collected, subject to legal retention obligations.

(c) Right of grievance redressal (Section 13) — you may raise a complaint with our Grievance Officer (Section 26 below). The Grievance Officer will acknowledge your complaint within 24 hours and resolve it within 15 days of receipt, in line with the IT Rules 2021 and DPDPA timelines. If you are unsatisfied, you may approach the Data Protection Board of India under Section 27 of DPDPA.

(d) Right to nominate (Section 14) — you may nominate another individual to exercise your DPDPA rights in the event of your death or incapacity. To register a nominee, write to privacy@illuxus.com with the nominee's name, relationship, and an attested ID.

To exercise any of these rights, write to privacy@illuxus.com from the email address associated with your account, or use the in-app "Privacy & data" controls under Settings → Privacy. We may verify your identity before responding. We will respond within 30 days; for complex requests we may extend by a further 30 days with notice to you.

There is no fee for exercising your rights. We may charge a reasonable administrative fee for manifestly unfounded or excessive requests (e.g., repetitive bulk requests) or for additional copies.`,
  },
  {
    title: "8. Consent and the Consent Manager mechanism",
    body: `Where we rely on consent under DPDPA Section 6, we obtain it via clear affirmative action — a tick-box, a button click, or a granular toggle in the in-app consent centre. We provide a plain-language notice of (i) the personal data being collected, (ii) the specific purpose, (iii) your rights, and (iv) the manner of withdrawal, in English and the regional languages we support.

Once the DPDPA Consent Manager framework (Section 6(7) and Section 6(8)) is operationalised, you will be able to register with a registered Consent Manager and manage consents given to Illuxus through that Consent Manager. Our systems will accept verifiable, withdrawable, and revocable consents from a registered Consent Manager. Until that framework is fully operational, you can manage consents directly with us via the in-app consent centre.

We maintain auditable records of every consent (purpose, timestamp, IP, version of the notice shown) and every withdrawal, in line with the SPDI Rules 2011 and DPDPA Section 6(2).`,
  },
  {
    title: "9. Sensitive personal data and SPDI Rules 2011",
    body: `Where we collect SPDI (passwords, financial information, physical/physiological/mental-health information), we comply with Rule 5 of the IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules 2011:

• We obtain prior written consent (electronic acceptance is treated as written under Section 10A of the IT Act).
• The purpose of collection is connected with a lawful function of Illuxus.
• Collection is for legitimate purposes and limited to what is necessary.
• You are informed at the time of collection of the recipients, the purpose, the name and address of the agency collecting the data, and the agency retaining the data.
• You may review the SPDI you have provided and modify it via the in-app Settings → Privacy controls.
• You may withdraw consent for SPDI collection, in which case we will not be able to provide the dependent feature.

In line with Section 43A of the IT Act, Illuxus maintains "reasonable security practices and procedures" — currently aligned to ISO/IEC 27001:2022 — to protect SPDI. We have appointed a Grievance Officer (Section 26 below) for SPDI-related complaints.`,
  },
  {
    title: "10. Children's personal data",
    body: `Under DPDPA Section 9, a "child" is an individual under 18 years of age. In addition to the general restrictions, we apply the following rules to children's personal data:

• We do not knowingly create accounts for children under 13 in any capacity.
• For users aged 13–17, account creation requires verifiable parental or lawful guardian consent. Verification is performed via guardian email confirmation plus, where the guardian uploads ID, an OCR check.
• We do not track, behaviourally profile, or serve targeted advertising to children.
• We do not undertake any processing that is likely to cause any detrimental effect on the well-being of a child.
• Where a feature is unsuitable for children, it is gated behind an age check and not offered to under-18 accounts.

Parents and guardians may at any time review, correct, or delete their child's account by writing to privacy@illuxus.com. If you believe we have inadvertently collected data from a child without verifiable parental consent, write to us and we will delete the data within 7 days.`,
  },
  {
    title: "11. Withdrawing consent",
    body: `You may withdraw consent at any time:

• In-app — Settings → Privacy → Manage consents. Toggle off any category.
• Marketing emails — click "Unsubscribe" at the bottom of any marketing email.
• Cookies — open the "Manage cookies" link in the footer or use your browser controls (see the Cookie Policy at /cookies).
• SMS/WhatsApp — reply STOP to any non-transactional message.
• In writing — email privacy@illuxus.com from your registered email.

Effect of withdrawal — processing that depended on that consent will stop. Features that required the withdrawn data may become unavailable (for example, withdrawing consent for SPDI collection will disable dietary-preference fields on tickets). Withdrawal does not affect the lawfulness of processing carried out before withdrawal, and does not affect processing that we are required to continue for a different lawful basis (such as tax records).`,
  },
  {
    title: "12. Cross-border transfers of personal data",
    body: `Illuxus's primary data centre is AWS ap-south-1 (Mumbai). Some sub-processors store or process data outside India — see the locations in Section 5(b). Under DPDPA Section 16, the Central Government may, by notification, restrict transfer of personal data to certain countries or territories. We monitor any such notifications and will reconfigure our sub-processor footprint to comply.

Cross-border transfers are protected by:

• Standard Contractual Clauses or their Indian equivalent in every sub-processor agreement.
• ISO/IEC 27001 or SOC 2 Type II certifications for each sub-processor.
• Pseudonymisation, encryption, and minimisation prior to transfer where feasible.

Users in the EU/EEA, UK, or Switzerland additionally benefit from the safeguards described in our /gdpr notice (Standard Contractual Clauses approved by the European Commission, UK IDTA, and Swiss adequacy where applicable).`,
  },
  {
    title: "13. Security measures (Section 43A IT Act + ISO 27001)",
    body: `We have implemented and maintain reasonable security practices and procedures appropriate to the nature of the personal data we process, as required by Section 43A of the IT Act and the SPDI Rules 2011. These include, without limitation:

• TLS 1.2+ for all data in transit; HSTS enabled platform-wide.
• AES-256 at rest for the database, object storage, and backups.
• Bcrypt + per-user salt for password hashing; passwords are never stored in clear or recoverable form.
• Row-level security in Postgres so each user can access only their own data.
• Mandatory two-factor authentication for all staff with production access.
• Principle-of-least-privilege role model for internal access; quarterly access reviews.
• Centralised audit logs for all administrative actions, retained for at least 180 days (CERT-In aligned) and up to 7 years for financial events.
• Continuous vulnerability scanning and an annual third-party penetration test.
• Quarterly tabletop exercises for the security incident response plan.
• Vendor risk reviews before onboarding any new sub-processor.

No security measure is perfect. In the event of a personal data breach we follow the procedure in Section 14 below.`,
  },
  {
    title: "14. Personal data breach notification",
    body: `We have a documented Cyber Crisis Management Plan aligned with the CERT-In directive of 28 April 2022 and DPDPA Section 8(6).

In the event of a personal data breach:

• We notify CERT-In within 6 hours of becoming aware of the incident, as required by the 28 April 2022 directive.
• We notify the Data Protection Board of India within 72 hours of becoming aware of the breach, as required by DPDPA Section 8(6).
• We notify affected Data Principals without undue delay (typically within 72 hours) using the most reliable channel (in-app banner, email, SMS) describing the nature of the breach, the data affected, the likely consequences, and the mitigation steps you can take.
• We maintain a register of all breaches whether or not notification is required.

If you suspect a breach involving your account or data, contact security@illuxus.com immediately.`,
  },
  {
    title: "15. CERT-In compliance (28 April 2022 directive)",
    body: `In compliance with the CERT-In Directions under Section 70B(6) of the IT Act:

• We retain ICT logs for a minimum of 180 days from creation, within India.
• We synchronise our systems to the NPL (National Physical Laboratory) or NIC NTP servers.
• We report qualifying cyber-security incidents to CERT-In within 6 hours of awareness, in the prescribed format.
• For services such as Virtual Asset Service Providers, Virtual Asset Exchange Providers, and custodian wallet providers, additional KYC records are retained for at least 5 years (we do not currently offer such services).
• Data centre, VPS, cloud service providers, and Virtual Private Network (VPN) service providers maintain customer registration details and validated information for at least 5 years (we do not currently provide such services to external customers, but we apply the same retention internally for our own use).

A nominated point of contact is registered with CERT-In; their identity is provided to relevant authorities on request.`,
  },
  {
    title: "16. Automated processing and profiling",
    body: `We use limited automated processing for:

• Fraud and abuse detection (rule-based scoring; high-risk transactions are routed to human review).
• Spam filtering on community posts and broadcast emails.
• Event discovery ranking (personalised based on your past activity, with the option to switch to a chronological "Latest" view).

We do not use automated decision-making that produces legal effects or similarly significant effects on you (such as credit decisions, employment decisions, or denial of service). You may opt out of personalised ranking via Settings → Privacy → Personalisation.`,
  },
  {
    title: "17. Marketing communications",
    body: `We send three categories of email/SMS/WhatsApp:

• Transactional — booking confirmations, reminders, refunds, security alerts. You cannot opt out of these while you have an active account or ticket because they are necessary for the contract.
• Service updates — material changes to Terms, Privacy Policy, security advisories. You cannot opt out, but they are sent sparingly.
• Marketing — product newsletters, new feature announcements, partner event promotions. Sent only with your prior opt-in. Every message includes an unsubscribe link, and unsubscribes are honoured within 10 business days as required under TRAI's TCCCPR 2018 (for SMS) and good email practice.

We never share your email address with third-party advertisers.`,
  },
  {
    title: "18. Cookies and similar technologies",
    body: `We use cookies and similar technologies — local storage, session storage, IndexedDB, and pixel tags — for authentication, security, preferences, and (with consent) analytics. The full list of cookies, their purpose, duration, type, and instructions for managing them are set out in our Cookie Policy at /cookies. By default, only Essential cookies are set; you must opt in to Analytics or Marketing cookies via the in-app consent banner.`,
  },
  {
    title: "19. Organiser data and our role as processor",
    body: `When an event organiser uploads attendee data (for example, importing a guest list) or when an attendee registers via Illuxus for that organiser's event, the organiser acts as the Data Fiduciary for that data and Illuxus acts as the Data Processor. Our processing is governed by the organiser's instructions and by our standard Data Processing Addendum, which forms part of the Terms of Service.

Attendees seeking to exercise rights in respect of data held by an organiser should contact the organiser directly using the contact details on the event page. If we receive a request, we will forward it to the organiser within 7 days and, where appropriate, support the organiser in responding.`,
  },
  {
    title: "20. Payments, KYC and PCI-DSS",
    body: `Payments are processed by PCI-DSS Level 1 certified payment service providers (Stripe, Razorpay). Full card numbers and CVV are never transmitted to or stored on Illuxus servers; they flow directly from your browser/app to the payment gateway via the gateway's SDK.

For organiser payouts above the thresholds set by the Reserve Bank of India and our payout partners, organisers complete KYC including PAN, GSTIN (where applicable), and bank verification. Section 194-O of the Income Tax Act, 1961 requires us to deduct 1% TDS on net payouts to organisers above ₹5 lakh in a financial year; the TDS is reported in Form 26AS in the organiser's name. See the Terms of Service for tax and payout details.`,
  },
  {
    title: "21. Third-party links",
    body: `The Illuxus platform may contain links to third-party websites and services (sponsor pages, social media, embedded video players). We are not responsible for the privacy practices of those third parties. We encourage you to read their privacy policies before sharing any personal data with them.`,
  },
  {
    title: "22. Public information and search-engine indexing",
    body: `Information you publish on a public event listing, organiser profile, or community post is publicly accessible and may be indexed by search engines and crawled by AI training systems. We provide a "noindex" toggle for organisers who wish to keep their event listings unindexed and a robots.txt directive for the platform-level discovery feed. You can edit or remove your public content at any time, but cached copies may persist with search engines for a period outside our control.`,
  },
  {
    title: "23. AI and large language models",
    body: `Illuxus uses lightweight machine-learning models for limited purposes such as event-tag suggestion and spam classification. We do not, as of the date at the top of this Policy, train any foundational model on Illuxus user data, and we do not feed personal data into third-party AI services without an explicit data-processing arrangement. Where AI features are offered (for example, AI-assisted event description drafting), they are opt-in and clearly labelled, and the data sent to the model is the minimum necessary.`,
  },
  {
    title: "24. Changes to this Privacy Policy",
    body: `We may update this Privacy Policy from time to time. When we make material changes we will:

• Post the updated Policy on this page with a new "Last updated" date.
• Notify you by email and, where appropriate, a prominent in-app banner, at least 14 days before the new Policy takes effect.
• For changes that materially expand the categories of personal data we collect or the purposes for which we process it, we will obtain fresh consent where the original lawful basis was consent.

The previous version of the Privacy Policy remains accessible at /privacy/archive for reference.`,
  },
  {
    title: "25. Data Protection Officer (DPO)",
    body: `As of the date at the top of this Policy, Illuxus has not been notified as a Significant Data Fiduciary under DPDPA Section 10 and is therefore not legally required to appoint a Data Protection Officer. However, we have voluntarily designated a Privacy Lead to handle DPO-equivalent responsibilities:

Privacy Lead: Ananya Iyer
Email: dpo@illuxus.com
Postal address: Privacy Office, Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.

If and when Illuxus is notified as a Significant Data Fiduciary, the Privacy Lead's appointment will be formalised as DPO under Section 10(2)(a) and they will be a person resident in India directly reporting to the Board of Directors.`,
  },
  {
    title: "26. Grievance Officer (IT Rules 2021 + DPDPA Section 8(9))",
    body: `In accordance with Rule 3(2)(a) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 and DPDPA Section 8(9), we have appointed a Grievance Officer to receive complaints relating to:

• Violations of this Privacy Policy or the Terms of Service.
• Unlawful or objectionable content on the platform.
• Exercise of Data Principal rights under DPDPA.

Grievance Officer details:

Name: Rohan Mehta
Designation: Grievance Officer (Privacy & Content)
Email: grievance@illuxus.com
Postal address: Grievance Office, Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.
Phone: +91 22 6000 0001 (Mon–Fri, 10:00–18:00 IST)

Response timeline:
• Acknowledgement within 24 hours of receipt.
• Resolution within 15 days of receipt.
• If your grievance involves removal of personal information you have provided, we will resolve it within 15 days of receipt of the request.

If you are unsatisfied with the Grievance Officer's response, you may approach:
• The Data Protection Board of India (under DPDPA Section 27, once operational).
• The Grievance Appellate Committee constituted under the IT Rules 2021 (gac.gov.in).
• A court of competent jurisdiction in Mumbai, Maharashtra, India.`,
  },
  {
    title: "27. Contact us",
    body: `For any privacy-related questions, data subject requests, or concerns:

General privacy enquiries: privacy@illuxus.com
Data Protection Officer / Privacy Lead: dpo@illuxus.com
Grievance Officer: grievance@illuxus.com
Security incidents: security@illuxus.com
Legal department: legal@illuxus.com

Post: Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.

We aim to respond to all enquiries within 30 days. Most are resolved within 5 business days.`,
  },
  {
    title: "28. Effective dates and version history",
    body: `Effective date of this version: 20 June 2026.
Date last reviewed: 20 June 2026.
Next scheduled review: 20 June 2027 (annual review cycle).

Version history:
• v3.0 — 20 June 2026 — Comprehensive rewrite for DPDPA 2023, CERT-In 2022 directive, GDPR cross-references, sub-processor disclosures.
• v2.0 — 14 March 2025 — Added cookie consent flow, expanded retention table.
• v1.0 — 01 February 2024 — Initial publication.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="pt-24 pb-10 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-muted-foreground text-[14px]">
          Last updated: 20 June 2026 · Effective: 20 June 2026 · Version 3.0
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
        <div className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5 space-y-3">
          <p>
            This Privacy Policy explains how Illuxus Technologies Private Limited collects, uses,
            stores, shares, and protects your personal data when you use the Illuxus event
            management platform. It is published in accordance with the Digital Personal Data
            Protection Act, 2023 ("DPDPA"), the Information Technology Act, 2000, the IT
            (Reasonable Security Practices and Procedures and Sensitive Personal Data or
            Information) Rules, 2011, the IT (Intermediary Guidelines and Digital Media Ethics
            Code) Rules, 2021, and the CERT-In directive dated 28 April 2022.
          </p>
          <p>
            Companion notices: <a href="/terms" className="text-primary hover:underline">Terms of Service</a>,{" "}
            <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a>, and{" "}
            <a href="/gdpr" className="text-primary hover:underline">GDPR Notice</a> for users in the EU/EEA, UK, and Switzerland.
          </p>
        </div>
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
