import SiteHeader from "@/components/SiteHeader";
import RouteSeo from "@/components/RouteSeo";

/**
 * Terms of Service — Illuxus Technologies.
 *
 * Aligned to:
 *  - Indian Contract Act 1872 + Information Technology Act 2000 Section 10A
 *    (electronic contract validity)
 *  - Consumer Protection Act 2019 + Consumer Protection (E-Commerce) Rules 2020
 *  - IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021
 *  - GST law (CGST/SGST/IGST Acts 2017 + e-invoicing rules)
 *  - Income Tax Act 1961 (TDS Sections 194-O, 194-H), Finance Act 2020
 *    (Equalisation Levy)
 *  - Arbitration & Conciliation Act 1996 (post-2019 amendments)
 *  - Prevention of Money Laundering Act 2002 (FIU-IND reporting)
 */

const sections = [
  {
    title: "1. Acceptance of Terms and electronic contract formation",
    body: `By accessing, browsing, or using the Illuxus platform ("Platform"), creating an account, or purchasing or selling tickets through it, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Platform.

These Terms constitute a legally binding electronic contract between you and Illuxus Technologies Private Limited ("Illuxus", "we", "our", "us") under Section 10A of the Information Technology Act, 2000. Acceptance can be expressed by clicking "I agree", ticking a checkbox, signing electronically, or by continued use of the Platform after these Terms have been published. Under Section 5 of the IT Act, electronic signatures and electronic records are afforded the same legal status as their physical counterparts.

These Terms apply to all users — event organisers, attendees, speakers, sponsors, vendors, and visitors. Where different terms apply to a specific role, they are noted clearly in the relevant section.`,
  },
  {
    title: "2. Eligibility and account creation",
    body: `You must be at least 18 years old to enter a binding contract under Section 11 of the Indian Contract Act, 1872, and therefore to create an organiser, sponsor, or speaker account on the Platform. You represent and warrant that you are an Indian citizen or otherwise lawfully entitled to enter into this contract.

Attendees aged 13–17 may create an attendee-only account with verifiable parental or lawful guardian consent. A guardian who consents on a minor's behalf is jointly and severally liable for the minor's compliance with these Terms. Attendees under 13 may not create accounts; a parent may book tickets on the minor's behalf using the parent's own account.

You agree to provide accurate, current, and complete information at the time of registration and to keep it updated. You are responsible for maintaining the confidentiality of your credentials, enabling two-factor authentication where available, and for all activity that occurs under your account. Notify support@illuxus.com immediately if you suspect unauthorised access.

We may suspend or terminate accounts that provide false information, violate these Terms, or are dormant for more than 24 months (with 30 days' notice before dormancy closure).`,
  },
  {
    title: "3. Description of the Platform",
    body: `Illuxus is an event management and ticketing platform that enables:

• Organisers to create, publish, and manage events; sell tickets; manage speakers and sponsors; check attendees in/out; host live webinars; broadcast communications; and view analytics.
• Attendees to discover and register for events, receive electronic tickets, attend in person or online, and join post-event communities.
• Speakers and sponsors to apply for, accept, and participate in events.

Illuxus is a technology platform and acts as an "intermediary" within the meaning of Section 2(w) of the IT Act, 2000. Illuxus does not own, operate, organise, promote, or produce any event listed on the Platform. The contractual relationship for delivery of the event is solely between the organiser and the attendee.

We reserve the right to modify, suspend, or discontinue any part of the Platform with reasonable notice, save for emergency security measures which may be applied immediately.`,
  },
  {
    title: "4. Intermediary status and safe-harbour under Section 79 IT Act",
    body: `Illuxus claims the safe-harbour protection available to intermediaries under Section 79 of the IT Act, 2000 and the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 ("IT Rules 2021"). In particular:

• Illuxus does not initiate the transmission of user content, select the receiver, or select or modify the information contained in the transmission, save for technical processes such as automatic resizing of images or transcoding of recordings.
• Illuxus observes due diligence under Rule 3(1) of the IT Rules 2021, including publishing these Terms and the Privacy Policy, informing users of the prohibited categories of content (Section 8 below), retaining records, and providing the grievance redressal mechanism described in Section 23.
• Illuxus expeditiously removes or disables access to information on receipt of actual knowledge or a notification from a competent authority, in accordance with the takedown timelines in Section 9.

If Illuxus fails to comply with the due-diligence obligations or with a lawful order to remove content, the safe-harbour protection may not apply.`,
  },
  {
    title: "5. Organiser responsibilities",
    body: `As an event organiser you are solely responsible for, and warrant that you will comply with:

(a) The accuracy of all event information (date, time, venue, line-up, pricing, terms, refund policy) published on the Platform.

(b) Obtaining all necessary permits, licences, and authorisations for your event — including but not limited to police permission (where applicable), fire safety NOC, FSSAI registration (for food vendors), entertainment-tax registration (Maharashtra, Karnataka, etc., where applicable), liquor licences, copyright licences from IPRS / PPL / Novex for music, public-performance licences, and trade licences.

(c) Complying with applicable laws — including consumer protection (Consumer Protection Act 2019 and the E-Commerce Rules 2020), data protection (DPDPA 2023), the Disabilities Act 2016 (venue accessibility), the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act 2013 (POSH Act, where the event constitutes a workplace), and any state-specific entertainment laws.

(d) Issuing tax-compliant invoices and complying with GST law (Section 11 below).

(e) Verifying the identity of attendees where the event involves age-restricted activities, regulated content, or where required by law (e.g., crypto-asset events under PMLA).

(f) Fulfilling your obligations to attendees — delivering the event as advertised, providing health and safety arrangements, and issuing refunds where required by the published refund policy or by law.

(g) The conduct and welfare of attendees, performers, speakers, sponsors, and other persons present at your event. Illuxus is not the operator of any event venue.

You agree to indemnify Illuxus against any losses arising from breach of the above (Section 28).`,
  },
  {
    title: "6. Attendee responsibilities",
    body: `As an attendee you agree to:

• Provide accurate information when registering and not impersonate any other person.
• Pay the ticket price and any applicable taxes, convenience fees, and platform fees.
• Comply with the event's terms (dress code, age limits, prohibited items, photography rules, COVID-19 protocols where applicable).
• Comply with the organiser's reasonable instructions and the venue's safety rules.
• Not resell, transfer, or attempt to resell a ticket above its face value (anti-touting — see Section 14).
• Not reproduce, scan, or share QR codes from your ticket; tickets are valid only for the named attendee.
• Take responsibility for personal safety and belongings at in-person events.`,
  },
  {
    title: "7. Speaker and sponsor responsibilities",
    body: `Speakers and sponsors warrant that:

• Materials they upload (slides, logos, videos, demo software) are owned by them or properly licensed.
• Their participation does not infringe any third-party intellectual property, defamation, or privacy right.
• They will comply with the organiser's code of conduct, the event's branding guidelines, and the anti-harassment policy.
• Sponsorship payments will be made on time as per the sponsorship agreement; failure to pay may result in the sponsor's logo and listing being removed from the event page.`,
  },
  {
    title: "8. Prohibited content and conduct (IT Rules 2021, Rule 3(1)(b))",
    body: `In line with Rule 3(1)(b) of the IT Rules 2021, you must not host, display, upload, modify, publish, transmit, store, update, or share any content that:

(a) belongs to another person and to which you do not have any right;
(b) is defamatory, obscene, paedophilic, invasive of another's privacy including bodily privacy, insulting or harassing on the basis of gender, libellous, racially or ethnically objectionable, relating to or encouraging money laundering or gambling, or otherwise inconsistent with or contrary to the laws in force;
(c) is harmful to children;
(d) infringes any patent, trademark, copyright, or other proprietary rights;
(e) violates any law in force;
(f) deceives or misleads the addressee about the origin of the message or knowingly and intentionally communicates information that is patently false or misleading in nature but may reasonably be perceived as a fact;
(g) impersonates another person;
(h) threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with foreign states, or public order, or causes incitement to the commission of any cognisable offence, or prevents investigation of any offence, or is insulting another nation;
(i) contains software viruses or any other computer code, files or programs designed to interrupt, destroy or limit the functionality of any computer resource;
(j) is patently false and untrue, and is written or published in any form, with the intent to mislead or harass a person, entity or agency for financial gain or to cause any injury to any person.

You must not use the Platform to:

• Create fraudulent, misleading, or illegal events.
• Sell counterfeit tickets, scalp, or tout tickets above face value (Section 14).
• Operate a Ponzi scheme, pyramid scheme, multi-level marketing scheme, gambling operation, or any unregistered investment offering.
• Collect personal data beyond what is necessary for event management or use it for purposes not disclosed to the data subject.
• Attempt to access, interfere with, or scrape accounts, systems, or data that are not yours.
• Reverse-engineer the Platform or extract data from it without written permission.
• Circumvent security measures, rate limits, or anti-bot systems.
• Use the Platform for any purpose that violates Indian law.

Violation of these prohibitions may result in immediate content removal, account suspension or termination, forfeiture of pending payouts to the extent permitted by law, and referral to law enforcement.`,
  },
  {
    title: "9. Content takedown timelines (IT Rules 2021, Rule 3(2)(b) & 3(1)(d))",
    body: `We respond to lawful notices and takedown requests within the following timelines:

• Within 24 hours of receipt of a complaint or own detection — for content in the nature of any material exposing the private area of an individual; showing such individual in full or partial nudity; in any sexual act or conduct; or which is in the nature of impersonation in an electronic form including artificially morphed images.
• Within 36 hours of receipt of a court order or notification from the appropriate government or its agency — for content covered by Section 79(3)(b) of the IT Act and Rule 3(1)(d) of the IT Rules 2021.
• Within 72 hours of receipt of a complaint about content alleged to be in violation of Rule 3(1)(b) — for resolution by the Grievance Officer.
• Within 15 days of receipt of a complaint — for general grievance resolution under DPDPA 2023 and IT Rules 2021.
• Without delay (target: within 6 hours) — for child sexual abuse material (CSAM); we additionally report all such content to the National Cyber Crime Reporting Portal and to NCMEC where applicable.

To report content, write to grievance@illuxus.com with a description of the content, the URL, the violation, and your contact details. For copyright takedowns, additionally include a statement of good-faith belief, an electronic signature, and your address.`,
  },
  {
    title: "10. Payments, settlements and platform fees",
    body: `Payments for paid events are processed by Stripe, Razorpay, or another regulated payment service provider whose terms additionally apply. By initiating a payment you consent to share necessary details with the payment service provider.

Illuxus's fees:

• Starter plan — 2% platform fee on paid ticket gross revenue (exclusive of GST).
• Professional plan — 2% platform fee on paid ticket gross revenue (exclusive of GST).
• Enterprise plan — flat or revenue-share fee as set out in the customer order form.
• Payment gateway charges of approximately 1.9–2.5% + ₹2–3 per successful transaction are charged separately by the gateway and are not part of the Illuxus platform fee.

Settlement to organisers:

• Standard settlement: T+2 business days from successful capture, subject to the gateway's settlement cycle and any reserve holdback.
• Reserve holdback: up to 10% of gross revenue for up to 30 days post-event, to cover chargebacks, refunds, and disputes. Reserve is released after the dispute window closes.
• Chargeback liability: where an attendee initiates a chargeback through their card issuer, the disputed amount plus any chargeback fee charged by the gateway is debited from the organiser's balance, subject to the organiser's right to contest the chargeback with evidence.
• Failure to deliver an event: if an event does not take place as scheduled, Illuxus may withhold settlement and direct funds to attendee refunds.

Currency: all amounts are denominated in Indian Rupees unless explicitly displayed otherwise. International cards are charged in INR; the customer's card issuer may add a forex conversion fee.`,
  },
  {
    title: "11. GST, e-invoicing and tax compliance",
    body: `Illuxus is registered for GST in Maharashtra (GSTIN: 27ABCDE1234F1Z5) and issues GST-compliant invoices for its platform fees.

For paid events:

• Organisers are responsible for collecting and remitting GST on ticket sales at the rate applicable to the supply (typically 18% for events, with possible variations for cultural events, sports events, exhibitions, and registered charitable trusts).
• Where the organiser is registered for GST, ticket invoices must contain the particulars required under Rule 46 of the CGST Rules 2017: invoice number, date, supplier and recipient details, HSN/SAC code (typically 9996 for event admission services), description, quantity, taxable value, tax rate, tax amount, and place of supply.
• Where the organiser's aggregate turnover in any preceding financial year from 2017–18 onwards exceeds ₹5 crore, the organiser must comply with the e-invoicing requirement under Notification 17/2022 — Central Tax effective 1 August 2023 (and subsequent amendments).
• The platform provides tools to generate compliant invoices; the legal responsibility for invoice accuracy and timely filing of GSTR-1 / GSTR-3B rests with the organiser.

Reverse-charge mechanism (RCM) — where the organiser is unregistered and the attendee is a registered business buying tickets that constitute an input supply, the attendee may be liable to pay tax under RCM as per Section 9(4) CGST Act. Illuxus does not advise on the application of RCM; consult your tax advisor.`,
  },
  {
    title: "12. TDS under Section 194-O and Equalisation Levy",
    body: `Tax deduction at source ("TDS") — Illuxus is an "e-commerce operator" within the meaning of Section 194-O of the Income Tax Act, 1961. We deduct 1% TDS on the gross amount of sales or services facilitated through the Platform where the aggregate amount paid or credited to a resident organiser ("e-commerce participant") during a financial year exceeds ₹5 lakh and the organiser has furnished their PAN/Aadhaar. Where PAN/Aadhaar is not furnished, TDS is deducted at the higher rate prescribed under Section 206AA (currently 5% or as amended). The TDS is reflected in the organiser's Form 26AS / AIS.

TDS on commissions / discounts under Section 194-H may apply to certain transactions; Illuxus will deduct and remit such TDS where statutorily required.

Equalisation Levy — non-resident organisers using the Platform should note that Illuxus is an Indian resident e-commerce operator and the Equalisation Levy under Section 165A of the Finance Act 2016 does not apply to Illuxus on transactions where it is the operator. Where a non-resident organiser sells tickets to Indian consumers via Illuxus, the non-resident may have direct Indian tax obligations; consult your tax advisor.`,
  },
  {
    title: "13. Refunds and the right of withdrawal (Consumer Protection Act 2019)",
    body: `Refund policy is set by the event organiser and published on the event page. Illuxus facilitates refunds through the original payment method.

Under the Consumer Protection (E-Commerce) Rules, 2020, e-commerce entities must accept return of goods or withdrawal of services where the goods or services are defective, deficient, spurious, or do not conform to the description. Illuxus and the organiser comply as follows:

• Cancellation by organiser — full refund of ticket price (gateway fees may be retained by the gateway and the platform fee may be retained, in line with the organiser's published refund policy and the law).
• Material change to the event (date, venue, headline performer) — attendee may elect a full refund or to retain the ticket.
• Cancellation by attendee — as per the organiser's published refund policy. For digital-only events where access has not yet been delivered, attendees retain the rights under the E-Commerce Rules to claim refunds for defective or deficient services.
• Refund timeline — once approved, refunds are initiated within 7 business days and typically credited within 5–10 business days depending on the issuing bank.

Nothing in these Terms limits a consumer's statutory rights under the Consumer Protection Act, 2019.`,
  },
  {
    title: "14. Anti-touting and ticket transfer",
    body: `Tickets may not be resold or transferred above their original face value (inclusive of taxes and fees). Resale at or below face value is permitted only through the Platform's official "Transfer ticket" feature; off-platform resale voids the ticket.

Several Indian states regulate touting under their entertainment-tax or police acts (for example, Maharashtra Entertainments Duty Act 1923 as amended; Karnataka Entertainments Tax Act 1958). Selling tickets above face value or operating an unauthorised secondary market is a punishable offence in those jurisdictions; Illuxus will cooperate with law enforcement on touting matters and may forfeit revenue derived from touted sales.`,
  },
  {
    title: "15. Anti-money-laundering and high-value transactions",
    body: `For events involving aggregate ticket sales above ₹50 lakh, or where suspicious transaction patterns are detected, Illuxus may:

• Require additional KYC documents from organisers (PAN, GSTIN, beneficial-owner declaration, source-of-funds declaration).
• Hold settlement until enhanced due diligence is complete.
• Report suspicious transactions to the Financial Intelligence Unit – India (FIU-IND) as required by the Prevention of Money Laundering Act, 2002 and the PML (Maintenance of Records) Rules, 2005, where Illuxus is, or becomes, a reporting entity.

You must not use the Platform to launder proceeds of crime, finance terrorism, or evade tax. We may refuse or reverse transactions on AML grounds without further explanation where lawfully permitted.`,
  },
  {
    title: "16. Intellectual property",
    body: `Illuxus and its licensors own all intellectual property rights in the Platform — including the source code, designs, logos, "Illuxus" word mark, documentation, and the look-and-feel of the application. Nothing in these Terms grants you any right or licence to use Illuxus's trademarks or branding without prior written permission.

You retain ownership of the content you upload to the Platform (event descriptions, images, session schedules, sponsor logos for which you have rights, speaker bios, recordings to which you own the rights). By uploading content you grant Illuxus a worldwide, non-exclusive, royalty-free, sub-licensable licence to host, copy, transmit, display, reformat, and modify (only to the extent necessary for display, performance, and delivery) that content to operate, promote, and improve the Platform. The licence terminates when you remove the content, except to the extent necessary to retain it in backups for the periods set out in the Privacy Policy or to fulfil legal obligations.

If you believe content on the Platform infringes your copyright or trademark, send a takedown notice to legal@illuxus.com following the procedure in Section 9.`,
  },
  {
    title: "17. Data protection and privacy",
    body: `Your use of the Platform is governed by our Privacy Policy at /privacy, our Cookie Policy at /cookies, and (for EU/UK/Swiss users) our GDPR Notice at /gdpr. These documents are incorporated into these Terms by reference. By using the Platform you acknowledge the data practices described therein.

Where organisers process attendee data on Illuxus, the Data Processing Addendum at /privacy applies. Organisers act as Data Fiduciaries under DPDPA in respect of attendee data they collect; Illuxus acts as the Data Processor under the organiser's instructions.`,
  },
  {
    title: "18. Disclaimers and limitation of liability",
    body: `THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE PLATFORM WILL BE UNINTERRUPTED OR ERROR-FREE.

ILLUXUS DOES NOT WARRANT THE QUALITY, SAFETY, OR LEGALITY OF ANY EVENT LISTED ON THE PLATFORM. ATTENDEES TRANSACT WITH ORGANISERS AT THEIR OWN RISK.

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ILLUXUS'S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING UNDER OR IN CONNECTION WITH THESE TERMS — WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), BREACH OF STATUTORY DUTY, OR OTHERWISE — SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO ILLUXUS (AS PLATFORM FEES) IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) ₹10,000.

ILLUXUS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

Nothing in these Terms limits or excludes liability that cannot be limited or excluded by applicable law — including liability for fraud, fraudulent misrepresentation, death or personal injury caused by negligence, or liability under the Consumer Protection Act, 2019 for unfair trade practices.`,
  },
  {
    title: "19. Indemnification",
    body: `You agree to defend, indemnify, and hold harmless Illuxus and its officers, directors, employees, agents, advisors, sub-processors, and affiliates from and against any claims, demands, suits, proceedings, losses, damages, liabilities, costs and expenses (including reasonable legal fees) arising out of or related to:

• Your use of the Platform.
• Content you upload, post, transmit, or otherwise make available through the Platform.
• Your event, including any health and safety incident, regulatory breach, or attendee dispute.
• Your breach of these Terms or any representation or warranty herein.
• Your violation of any third-party right (intellectual property, privacy, publicity, contract).
• Your violation of any applicable law.

Illuxus shall promptly notify you of any claim and allow you to control the defence, with the right (but not the obligation) to participate at its own cost.`,
  },
  {
    title: "20. Force majeure",
    body: `Neither party shall be liable for any delay or failure to perform under these Terms (other than payment obligations) to the extent caused by events beyond its reasonable control, including: acts of God, natural disasters (earthquakes, floods, cyclones), epidemics or pandemics, acts of war, terrorism, riots, civil commotion, government action (including lockdowns, travel restrictions, internet shutdowns under Section 144 CrPC or the Telegraph Act), strikes affecting third-party infrastructure providers, failure of public utilities, failure of upstream payment-gateway or cloud-infrastructure providers, and major cybersecurity incidents.

The affected party must promptly notify the other party of the force-majeure event, mitigate its effects, and resume performance as soon as reasonably practicable. If a force-majeure event continues for more than 60 days, either party may terminate the affected obligations on notice.`,
  },
  {
    title: "21. Suspension, termination and effects",
    body: `You may close your account at any time via Settings → Account → Close account, or by writing to support@illuxus.com.

Illuxus may suspend or terminate your account or restrict your access immediately if:

• You materially breach these Terms or fail to remedy a non-material breach within 14 days of written notice.
• You engage in fraud, abuse, money laundering, or any illegal activity.
• A regulator, court, or law-enforcement authority requires us to do so.
• We discontinue the Platform (with at least 30 days' advance notice).

On termination:

• Your access to the Platform ceases.
• Your data is retained for the periods set out in the Privacy Policy and then deleted or anonymised.
• Accrued payment obligations, indemnities, IP licences strictly necessary for backups, and the dispute-resolution and limitation-of-liability clauses survive.

We may retain identifying information necessary to comply with legal obligations or to enforce these Terms.`,
  },
  {
    title: "22. Governing law and jurisdiction",
    body: `These Terms are governed by, and shall be construed in accordance with, the laws of India, without regard to conflict-of-laws principles.

Subject to Section 24 (Dispute resolution), the courts at Mumbai, Maharashtra, India shall have exclusive jurisdiction over any dispute arising out of or in connection with these Terms. Notwithstanding the foregoing, Illuxus may seek urgent injunctive or other equitable relief in any court of competent jurisdiction to protect its intellectual property or confidential information.

For consumers covered by the Consumer Protection Act, 2019, this jurisdiction clause does not derogate from your right to approach the District, State or National Consumer Disputes Redressal Commission having jurisdiction over your place of residence.`,
  },
  {
    title: "23. Grievance redressal mechanism (IT Rules 2021 + DPDPA Section 8(9))",
    body: `In compliance with Rule 3(2)(a) of the IT Rules 2021 and DPDPA Section 8(9), Illuxus has appointed:

Grievance Officer:
Name: Rohan Mehta
Designation: Grievance Officer (Privacy & Content)
Email: grievance@illuxus.com
Postal address: Grievance Office, Illuxus Technologies Private Limited, 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.
Phone: +91 22 6000 0001 (Mon–Fri, 10:00–18:00 IST)

Procedure:
• Submit your complaint in writing to the email or postal address above.
• Provide your name, contact details, account email, a description of the issue, copies of any relevant communications, and your preferred resolution.
• The Grievance Officer will acknowledge receipt within 24 hours and resolve the complaint within 15 days.

If you are unsatisfied with the resolution:
• Escalate to the Grievance Appellate Committee constituted under Rule 3A of the IT Rules 2021, via gac.gov.in, within 30 days of the Grievance Officer's decision.
• Approach the Data Protection Board of India under DPDPA Section 27 (once operational).
• Approach the District / State / National Consumer Disputes Redressal Commission under the Consumer Protection Act, 2019.

If Illuxus is notified as a Significant Social Media Intermediary, we will appoint a Chief Compliance Officer, a Nodal Contact Person, and a Resident Grievance Officer in line with Rule 4 of the IT Rules 2021. Their details will be published on this page.`,
  },
  {
    title: "24. Dispute resolution — mediation, ODR and arbitration",
    body: `Subject to a consumer's statutory rights under the Consumer Protection Act, 2019, the following dispute-resolution ladder applies:

(a) Direct negotiation — write to legal@illuxus.com describing the dispute and the relief sought. The parties shall negotiate in good faith for 30 days.

(b) Online Dispute Resolution (ODR) — if direct negotiation fails, either party may refer the dispute to ODR through a recognised online dispute resolution institution. Illuxus may publish the list of approved ODR providers on the Platform from time to time.

(c) Arbitration — if ODR is unsuccessful or unavailable, any unresolved dispute (other than disputes within the jurisdiction of consumer commissions where the consumer elects that route) shall be referred to and finally resolved by arbitration under the Arbitration & Conciliation Act, 1996. The arbitration shall be conducted by a sole arbitrator mutually appointed, or failing agreement, appointed by the Mumbai Centre for International Arbitration. The seat of arbitration shall be Mumbai. The arbitration shall be conducted in English. The arbitral award shall be final and binding on the parties.

Arbitration is NOT mandatory for consumers — a consumer may at any time elect to approach the District / State / National Consumer Disputes Redressal Commission having jurisdiction. Nothing in this clause constitutes a waiver of consumer rights, in line with the Supreme Court's decision in M/s Emaar MGF Land Limited v. Aftab Singh (2018).`,
  },
  {
    title: "25. Consumer rights notice",
    body: `If you are a "consumer" within the meaning of the Consumer Protection Act, 2019, you have rights including:

• Right to be informed about the quality, quantity, potency, purity, standard and price of services.
• Right to be heard and assured that consumer interests will receive due consideration.
• Right to seek redressal against unfair trade practices.
• Right to consumer education.

You may approach the District Consumer Disputes Redressal Commission where the cause of action arose or where you reside / work, free of fee for claims up to ₹5 lakh and at a nominal fee for higher value claims. You may also file complaints online via the National Consumer Helpline (1800-11-4000) or edaakhil.nic.in.

You may report unfair trade practices, misleading advertisements, or violations of these Terms to the Central Consumer Protection Authority (CCPA).`,
  },
  {
    title: "26. Compliance with sanctions and export controls",
    body: `You agree not to use the Platform if you are located in, ordinarily resident in, or organised under the laws of a country or territory subject to comprehensive sanctions imposed by the United Nations Security Council, the United States Department of the Treasury Office of Foreign Assets Control (OFAC), or the European Union. You agree not to use the Platform to facilitate transactions that violate Indian export control laws or any applicable international sanctions regime to which India is a party.`,
  },
  {
    title: "27. Notices and communications",
    body: `Any notice required under these Terms shall be in writing and delivered:

• To Illuxus — by email to legal@illuxus.com and by registered post to the address in Section 30, or via the Platform's in-product support channel.
• To you — by email to the address on your account, by SMS, by in-product notification, or by registered post to the address you have provided.

Notices are deemed delivered: by email, on the day of transmission (or the next business day if sent outside business hours); by SMS, on transmission; by post, on the third business day after dispatch; by in-product notification, when first displayed.`,
  },
  {
    title: "28. Changes to these Terms",
    body: `We may update these Terms from time to time. For material changes we will:

• Post the updated Terms with a new "Last updated" date.
• Notify users by email and prominent in-product banner at least 14 days before the new Terms take effect (or longer where required by law).
• For consumer-facing changes that materially restrict your rights or increase your obligations, we will require you to re-accept the Terms before continuing to use the Platform.

Continued use of the Platform after the effective date of the updated Terms constitutes acceptance of the updated Terms.`,
  },
  {
    title: "29. Miscellaneous",
    body: `Entire agreement — These Terms, together with the Privacy Policy, Cookie Policy, GDPR Notice, the Data Processing Addendum, any order form, and any policies referenced herein, constitute the entire agreement between you and Illuxus relating to the Platform.

Severability — If any provision is held unenforceable, the remaining provisions remain in full force and effect, and the unenforceable provision shall be replaced by an enforceable provision that comes closest to the parties' original intent.

No waiver — Failure or delay by Illuxus to enforce any provision is not a waiver of that or any other provision.

Assignment — You may not assign or transfer these Terms without our prior written consent. Illuxus may assign these Terms to an affiliate or in connection with a merger, acquisition, or sale of assets, on notice to you.

No agency — Nothing in these Terms creates a partnership, joint venture, agency, fiduciary, or employment relationship between you and Illuxus.

Language — These Terms are executed in English. Translations are provided for convenience; the English version controls.`,
  },
  {
    title: "30. Contact and registered office",
    body: `Illuxus Technologies Private Limited
CIN: U72200MH2023PTC123456
GSTIN: 27ABCDE1234F1Z5
PAN: AABCI1234F
Registered office: 4th Floor, Lighthouse Tower, Bandra Kurla Complex, Mumbai – 400 051, Maharashtra, India.

Legal department: legal@illuxus.com
Grievance Officer: grievance@illuxus.com
Privacy / DPO: privacy@illuxus.com / dpo@illuxus.com
Support: support@illuxus.com
Press: press@illuxus.com
Sales: sales@illuxus.com
General: hello@illuxus.com
Phone: +91 22 6000 0001`,
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Terms of Service — illuxus event platform"
        description="Legally binding electronic contract under IT Act Section 10A. Covers GST, TDS Section 194-O, refunds under Consumer Protection Act 2019, IT Rules 2021 intermediary status, grievance redressal."
        canonical="https://illuxus.com/terms"
        keywords={[
          "illuxus terms of service",
          "event platform terms India",
          "IT Act 10A electronic contract",
          "Indian Contract Act event SaaS",
          "Consumer Protection Act 2019 event refunds",
          "IT Rules 2021 intermediary status",
          "GST event ticketing",
          "TDS Section 194-O event platform",
          "TDS 194-H event commission",
          "Equalisation Levy event SaaS",
          "Arbitration Conciliation Act 1996",
          "PMLA event payouts KYC",
          "event platform liability",
          "event refund policy India",
          "event organiser obligations India",
          "event attendee rights India",
          "ticket terms India event",
          "e-commerce rules event tickets",
          "Indian event SaaS terms",
          "intermediary safe harbour event platform",
          "grievance redressal event platform",
          "DPDPA + Consumer Act event terms",
          "GST e-invoicing event platform",
          "FIU-IND event payouts",
          "event platform jurisdiction Mumbai",
          "arbitration seat Mumbai event SaaS",
          "force majeure event platform",
          "indemnification event organiser",
          "warranty event platform India",
          "limitation of liability event SaaS",
        ].join(", ")}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TermsOfService",
              url: "https://illuxus.com/terms",
              name: "Terms of Service",
              inLanguage: "en-IN",
              dateModified: "2026-06-20",
              publisher: { "@id": "https://illuxus.com/#organization" },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
                { "@type": "ListItem", position: 2, name: "Terms", item: "https://illuxus.com/terms" },
              ],
            },
          ],
        }}
      />

      <section className="pt-24 pb-10 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Terms of Service</h1>
        <p className="text-muted-foreground text-[14px]">
          Last updated: 20 June 2026 · Effective: 20 June 2026 · Version 3.0
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
        <div className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5 space-y-3">
          <p>
            Please read these Terms of Service carefully before using the Illuxus platform. These
            Terms form a legally binding electronic contract between you and Illuxus Technologies
            Private Limited under Section 10A of the Information Technology Act, 2000, and are
            governed by Indian law. Companion documents:{" "}
            <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>,{" "}
            <a href="/cookies" className="text-primary hover:underline">Cookie Policy</a>, and{" "}
            <a href="/gdpr" className="text-primary hover:underline">GDPR Notice</a>.
          </p>
          <p>
            If you are a consumer, nothing in these Terms limits your statutory rights under the
            Consumer Protection Act, 2019.
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
