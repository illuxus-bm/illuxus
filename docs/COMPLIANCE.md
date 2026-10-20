# illuxus — Global IT & data-protection compliance review

| | |
| --- | --- |
| **Date** | 20 October 2026 |
| **Scope** | The web app in this repository (`src/`, `api/`, `supabase/`, `vercel.json`), its public legal pages and its marketing copy |
| **Method** | Code and configuration review against each law's concrete obligations; every claim in the legal pages and the landing page checked against the code that should back it |
| **Status** | **Not yet compliant.** Most of the legal and technical groundwork is in place. Three critical problems and seven high-severity gaps remain, and most of them need a business or legal decision rather than more code. |

> This is an engineering self-assessment, not legal advice. Have Indian counsel review the legal
> pages and the critical items below before launch, and add EU, US or other counsel before you
> actively market to people in those regions.

---

## 1. Verdict at a glance

| Severity | Count | Theme |
| --- | --- | --- |
| Critical | 3 | Paid tickets are issued without payment; legal pages name people and facts that need verifying; feature claims with no code behind them |
| High | 7 | Unsubscribe links, WhatsApp opt-in, age checks, consent records, log retention, a content security policy, promises in the policy that the product doesn't keep |
| Medium | 6 | Google Fonts before consent, accessibility gaps, transfer paperwork, the EU representative reasoning, DSA basics, AI-content labelling |
| In place | 25+ | See section 4 |

**Fixed in this pass** (all in `main` with this change):

- Global Privacy Control is honoured: a GPC signal turns marketing cookies off and the banner says why (`src/hooks/useCookieConsent.ts`, `src/components/CookieConsent.tsx`).
- Self-serve **Download my data** on `/u/me`: a JSON copy of every table holding the user's rows, read under their own row-level security (`src/lib/data-export.ts`).
- **Accessibility statement** at `/accessibility`, honest about what doesn't conform yet; linked in the footer.
- The privacy policy now points to controls that exist (data export, `/data-deletion`, "Cookie settings", GPC) instead of a "Settings → Privacy" screen that doesn't.
- The footer "GDPR" link goes to `/gdpr` (it used to go to `/privacy`); the landing page no longer advertises SSO or AI matchmaking in its feature cards and structured data.

---

## 2. Critical — fix before taking money or marketing at scale

### C1. Paid events issue tickets without collecting payment

- **What happens:** for any event with `price > 0`, the RSVP card shows "Register · ₹X", and the
  `registrations_validate` trigger marks the registration **approved** because "payment IS the
  gate" (`supabase/migrations/000_full_schema.sql`). No payment gateway
  is integrated: Razorpay and Stripe appear only in copy, never in code.
- **Copy that says otherwise:** the home-page FAQ and structured data (`src/pages/Index.tsx`: "Can
  I sell tickets in INR with UPI? Yes…", "GST-compliant invoices auto-generated"), Terms §10–12
  (settlements, GST e-invoicing, TDS under s.194-O), Privacy §20 (Stripe, Razorpay, PCI-DSS),
  Refund Policy, Pricing, FAQs, Docs and the SEO landing pages.
- **Why it matters:** this is a misleading representation under the Consumer Protection Act 2019,
  the CCPA's 2022 guidelines on misleading advertisements, and the Consumer Protection
  (E-Commerce) Rules 2020. In the US it falls under FTC Act §5, and in the EU under the Unfair
  Commercial Practices Directive. Organisers also lose revenue silently.
- **Decide one of:**
  (a) integrate a gateway (Razorpay for INR/UPI, Stripe for cards) and move approval to the payment
  webhook. That brings in RBI payment-aggregator rules, card tokenisation, PCI-DSS SAQ-A, GST
  invoicing and TDS. Or
  (b) until then, block paid registrations, or label them "pay at venue / organiser collects
  payment", and remove the payment claims from all copy.

### C2. Legal pages name people, places and certifications that must be real

The IT Rules 2021 (Rule 3(2)) require a **real** Grievance Officer name and contact. DPDPA s.8(9)
requires a reachable contact. Verify each of these, or replace it:

| Claim | Where |
| --- | --- |
| Privacy Lead "Ananya Iyer", dpo@illuxus.com | Privacy §25 |
| Grievance Officer "Rohan Mehta", +91 22 6000 0001 | Privacy §26, Terms §23 |
| Registered office "4th Floor, Lighthouse Tower, BKC, Mumbai 400051", geo-coordinates | Privacy, Terms, `index.html` and `SiteHead.tsx` organisation schema |
| Primary data centre "AWS ap-south-1 (Mumbai)" | Privacy §12. Check the Supabase project's actual region |
| "Aligned to ISO/IEC 27001:2022", "annual third-party penetration test", "quarterly tabletop exercises" | Privacy §9, §13 |
| Mailboxes privacy@, dpo@, grievance@, security@, legal@, sales@, support@, tech@ | All legal pages. Each must exist and be monitored |

If any of these is a placeholder, the published policy is itself non-compliant: replace it with
real details or remove it.

### C3. Features advertised that do not exist

| Claim | Where | Reality |
| --- | --- | --- |
| SSO / "White-label and SSO" | Features page, pricing plans, SEO pages | No SSO or SAML code |
| AI matchmaking | Home FAQ, Features page, conference SEO page, Privacy | No matchmaking code (AI is used only for creative copy and backgrounds) |
| Offline scanning with later sync | Home FAQ | Not built (still on the roadmap) |
| Promo codes, group packages | Features page, earlier defaults | Not built |
| "Trusted by 1,200+ organizers across India and Southeast Asia" | Home meta description | Needs evidence, or remove it |
| Booth lead capture | Home structured data | Not built |

Same laws as C1. Either build the feature or remove the claim. This pass removed SSO and AI
matchmaking from the landing feature cards and the landing feature list; the rest is still live.

---

## 3. High

| # | Gap | Law | Fix |
| --- | --- | --- | --- |
| H1 | **No unsubscribe link or postal address in broadcast emails.** `send-communication-email` sends the organiser's text as-is. Privacy §17 says every marketing message has one. | CAN-SPAM (US), CASL (Canada — also requires express consent), PECR / ePrivacy Art. 13 (UK/EU), GDPR Art. 21, DPDPA s.6(4) (withdrawal as easy as consent) | Suppression table plus a signed unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers; footer with the organiser's name and postal address; separate transactional messages from promotional ones. |
| H2 | **No WhatsApp opt-in is recorded** before business-initiated messages. | Meta WhatsApp Business policy, TRAI TCCCPR 2018, GDPR / DPDPA consent | Opt-in checkbox at registration, stored per number with a timestamp; only send templates to numbers that opted in; honour STOP. |
| H3 | **No age check at sign-up**, but Privacy §10 promises under-13 blocking and verifiable guardian consent for ages 13–17. | DPDPA s.9 and DPDP Rules 2025 (verifiable parental consent under 18), COPPA (under 13), GDPR Art. 8 (13–16) | Ask for date of birth or an "I am 18 or older" confirmation at sign-up and registration; build a guardian-consent flow, or state plainly that the service is for people 18 and over. |
| H4 | **Consent is not provable.** Only `terms_accepted_at` is stored. Cookie choices live in the browser only. Privacy §8 promises purpose, timestamp, IP and notice version. | GDPR Art. 7(1), DPDPA s.6(10) (the fiduciary must prove notice and consent) | A `consent_records` table (user or email, purpose, notice version, timestamp, source) written at sign-up, registration, form consents and cookie choices. |
| H5 | **Log retention is shorter than CERT-In requires.** Supabase keeps API logs for days, not 180, and Vercel even less. | CERT-In Directions, 28 April 2022 (180 days, kept in India) | Log drain from Supabase and Vercel to storage in an Indian region with 180-day retention; document the NTP source. |
| H6 | **No Content-Security-Policy header.** HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set. | IT Act s.43A "reasonable security practices", GDPR Art. 32 | Ship a CSP as `Content-Security-Policy-Report-Only` first (allow Supabase, Agora, LiveKit, Google Fonts, GA, Clarity), then enforce. |
| H7 | **The policy promises things the product doesn't do:** a personalisation opt-out, `/privacy/archive`, notices in regional languages, a DPDPA Consent Manager integration, guardian OCR checks. | DPDPA s.5 (accurate notice), GDPR Art. 12–13, consumer law | Build each one or reword it; keep previous policy versions at `/privacy/archive` (DPDPA notice history). |

---

## 4. In place

**Legal pages:** Privacy (DPDPA, IT Act, SPDI Rules, IT Rules 2021, CERT-In), Terms
(intermediary safe harbour under s.79, takedown timelines, ODR), Cookie Policy, Refund Policy, GDPR
Notice, Accessibility Statement (new), Data Deletion request form, and Grievance Officer contact
with 24-hour acknowledgement and 15-day resolution timelines.

**Consent:**
- The cookie banner sets nothing non-essential by default, has a "Reject non-essential" button as easy to use as "Accept all", and can be reopened from "Cookie settings" in the footer.
- GA4 and Clarity load only after consent and are removed on withdrawal.
- Global Privacy Control is honoured (new).
- Form consent checkboxes are never pre-ticked (`ConsentCheckbox`), and Terms acceptance is timestamped at sign-up.

**Data subject rights:** self-serve data export (new), deletion and marketing opt-out requests
filed as tracked privacy tickets, profile editing, and community content reporting.

**Security:**
- Row-level security on every table, and `SECURITY DEFINER` functions with a pinned `search_path`.
- Origin allowlist on edge functions, rate limits on public edge functions (guest registration, team invitations, email, AI generation), and HMAC verification on the WhatsApp webhook.
- PII redaction in logs, and an open-relay / account-takeover fix (9 Oct 2026).
- HSTS with preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and a `Permissions-Policy` limited to camera and microphone.
- Two-factor sign-in, and an emailed code at sign-up.

**Accessibility:** a skip link, visible focus rings, reduced-motion support, alt text and lazy
loading on images, labelled form fields, and a keyboard-operable cookie banner.

**Search and transparency:** a unique title, description and canonical URL on every public page,
a sitemap and robots.txt, `noindex` on private pages, and an organisation schema.

---

## 5. Medium

| # | Gap | Law | Fix |
| --- | --- | --- | --- |
| M1 | Google Fonts are fetched from Google's CDN on first load, before consent, which sends the visitor's IP to Google. | GDPR (LG München I, 3 O 17493/20) | Self-host the font files. |
| M2 | Canvas editors (creative studio, brochure, certificate and badge designers), untagged PDFs and webinars without captions. These are listed in the accessibility statement. | European Accessibility Act (since 28 June 2025), ADA Title III, RPwD Act 2016 s.40 | Keyboard alternatives for moving and resizing; tagged PDFs; caption support for webinars. |
| M3 | Transfer paperwork for sub-processors: Supabase, Vercel, Agora, LiveKit, Google (Gemini, GA4, Fonts), Gmail or Resend SMTP, Meta (WhatsApp), Microsoft (Clarity), Sentry. | GDPR Chapter V, DPDPA s.16, UK IDTA | A signed DPA and SCCs on file for each; check that the list in Privacy §5 matches who you actually use. |
| M4 | The GDPR notice says no Article 27 representative is needed "because of scale". The exemption is for **occasional** processing, not small scale. | GDPR Art. 27(2) | Appoint an EU (and UK) representative before actively targeting EU or UK users, or narrow the reasoning in the notice. |
| M5 | EU Digital Services Act basics for a hosting service: a single point of contact, notice-and-action for illegal content, and a statement of reasons when content is removed. | DSA Art. 11, 12, 16, 17 | Add a DSA contact and reporting route to the Terms; send a statement of reasons from community moderation. |
| M6 | AI-generated creative copy and backgrounds aren't labelled as AI-generated. | EU AI Act Art. 50 (transparency, applies from 2 August 2026); Privacy §23 promises clear labelling | Label AI output in the studio, and keep the label in exported metadata where practical. |

---

## 6. Law-by-law matrix

"Applies" reflects the platform's current footprint: an Indian company that is open to users
worldwide.

| Region | Law | Applies | Status | Open items |
| --- | --- | --- | --- | --- |
| India | IT Act 2000 (s.43A, 72A, 79) | Yes | Partly compliant | H6, C2 |
| India | SPDI Rules 2011 | Yes | Partly compliant | H4 |
| India | IT (Intermediary Guidelines) Rules 2021 | Yes | Partly compliant | C2 (real Grievance Officer) |
| India | CERT-In Directions 2022 | Yes | **Gap** | H5 |
| India | DPDP Act 2023 + DPDP Rules 2025 (phased in) | Yes | Partly compliant | H3, H4, H7, C2 |
| India | Consumer Protection Act 2019 + E-Commerce Rules 2020 | Yes | **Gap** | C1, C3 |
| India | RPwD Act 2016 | Yes | Partly compliant | M2 |
| India | TRAI TCCCPR 2018 | When SMS or WhatsApp is used | **Gap** | H2 |
| India | RBI payment-aggregator rules, GST, TDS s.194-O | Only once payments exist | Not applicable yet | C1 |
| EU / EEA | GDPR | Yes, when offering to EU residents | Partly compliant | H1, H4, M1, M3, M4 |
| EU / EEA | ePrivacy Directive | Yes | Compliant for cookies; email gap | H1 |
| EU / EEA | European Accessibility Act | Yes, for consumer e-commerce | Partly compliant | M2 |
| EU / EEA | Digital Services Act | Yes, as a hosting service | **Gap** | M5 |
| EU / EEA | AI Act Art. 50 | Yes, for AI-generated output | **Gap** | M6 |
| UK | UK GDPR, DPA 2018, PECR, Equality Act | Yes | As for the EU | H1, M4 |
| US | FTC Act §5 | Yes | **Gap** | C1, C3 |
| US | CAN-SPAM | Yes | **Gap** | H1 |
| US | CCPA / CPRA and other state laws | Above revenue or volume thresholds | GPC honoured | Add a US-residents notice once thresholds are near |
| US | COPPA | If under-13s can register | **Gap** | H3 |
| US | ADA Title III | Likely | Partly compliant | M2 |
| Canada | PIPEDA, CASL | When marketing to Canadians | **Gap** (CASL needs express consent) | H1, H4 |
| Brazil | LGPD | When offering to Brazilians | Mostly covered by GDPR-level controls | H4, M3 |
| Singapore | PDPA (and the Do Not Call registry) | When marketing in SG | Partly compliant | H1 |
| Australia | Privacy Act 1988, Spam Act 2003 | When marketing in AU | Partly compliant | H1 |
| UAE / KSA | UAE PDPL (Decree-Law 45/2021), KSA PDPL | When offering there | Partly compliant | M3 |
| Global | PCI DSS | Only once payments exist | Not applicable yet | Keep card data inside gateway SDKs (SAQ-A) |

---

## 7. Action plan

| Order | Item | Owner | Effort |
| --- | --- | --- | --- |
| 1 | C1: decide on payments; until then block or relabel paid registrations and remove the payment claims | Founders + engineering | Days (relabel); 2–3 weeks (Razorpay) |
| 2 | C2: confirm or replace the named officers, address, region and certifications | Founders + legal | Days |
| 3 | C3: remove or build each advertised feature | Marketing + engineering | 1 day to remove |
| 4 | H1 + H2: unsubscribe and WhatsApp opt-in | Engineering | 1 week |
| 5 | H3 + H4: age confirmation and a consent-records table | Engineering + legal | 1 week |
| 6 | H5 + H6: log drain and CSP | Engineering | 2–3 days |
| 7 | H7 and the Medium items | Legal + engineering | Ongoing |

Review this document whenever a legal page changes, a sub-processor is added, or the product
starts selling in a new country.
