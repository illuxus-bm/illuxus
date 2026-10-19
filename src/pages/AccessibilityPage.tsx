import { Link } from "react-router-dom";

import PublicPageShell from "@/components/layout/PublicPageShell";
import RouteSeo from "@/components/RouteSeo";

/**
 * Accessibility statement. The "known limitations" list must stay honest —
 * update it whenever one is fixed or a new surface ships without full support.
 */

const sections = [
  {
    title: "1. Our commitment",
    body: `Illuxus wants everyone to be able to find, register for, attend and run events — including people who use screen readers, keyboard-only navigation, voice control, screen magnification or high-contrast settings.

We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. That is the standard referenced by the European Accessibility Act (Directive (EU) 2019/882) and EN 301 549, by the Rights of Persons with Disabilities Act, 2016 and the Guidelines for Indian Government Websites in India, and is the benchmark generally applied under the Americans with Disabilities Act and the UK Equality Act 2010.`,
  },
  {
    title: "2. Conformance status",
    body: `Partially conformant: most of the platform meets WCAG 2.2 AA, but some parts do not yet — they are listed in section 4.

This statement is based on a self-assessment carried out by the Illuxus team on 20 October 2026, using keyboard-only testing, browser accessibility tooling and screen-reader spot checks. It has not yet been verified by an independent auditor.`,
  },
  {
    title: "3. What we have in place",
    body: `• A "Skip to main content" link is the first stop when you press Tab on every page.
• Every interactive element shows a visible focus ring when reached from the keyboard.
• Pages use one main heading and a logical heading order, with landmarks for the header, main content and footer.
• Images carry text alternatives; decorative images are hidden from assistive technology.
• Form fields have labels, required fields are marked, and errors are announced in text, not by colour alone.
• Consent checkboxes are never pre-ticked and can be operated from the keyboard.
• The cookie banner can be answered from the keyboard, and reopened later from "Cookie settings" in the footer.
• Animations respect the "reduce motion" setting of your operating system.
• Light and dark themes both use colour tokens chosen for readable contrast.
• Public pages and the organiser dashboard are laid out to work on screens down to 375 pixels wide, and support browser zoom.`,
  },
  {
    title: "4. Known limitations",
    body: `We are working on the following. If one of them stops you from doing something, contact us (section 5) and we will help you another way.

• Creative studio, brochure editor, certificate designer and badge designer — these are visual, canvas-based editors. Moving and resizing elements needs a pointer, and the canvas content is not exposed to screen readers. The exported files can be produced from templates without using the canvas.
• Generated PDFs — tickets, badges, brochures and certificates are not yet tagged PDFs, so screen readers may read them out of order.
• Live webinars — captions are not generated automatically. Organisers can share transcripts or recordings after the session.
• QR check-in — scanning needs a camera. Staff can always check a guest in by searching their name in the registrations list.
• Content added by organisers — event pages, images and documents uploaded by organisers may not meet these standards. We check the contrast of event-page themes, but cannot guarantee what organisers upload.`,
  },
  {
    title: "5. Feedback and requests for an accessible format",
    body: `If you find a barrier, or need information from the platform in a different format, tell us:

• Email: support@illuxus.com with "Accessibility" in the subject line.
• The contact form at /contact.

Tell us the page address and what went wrong. We aim to reply within 5 business days, and to fix or work around the barrier as quickly as we can.`,
  },
  {
    title: "6. If you are not satisfied with our response",
    body: `You can escalate to our Grievance Officer at grievance@illuxus.com.

You may also contact the authority responsible where you live — for example, in India, the Chief Commissioner for Persons with Disabilities; in the EU, the market-surveillance authority of your Member State under the European Accessibility Act; in the UK, the Equality Advisory and Support Service.`,
  },
];

export default function AccessibilityPage() {
  return (
    <PublicPageShell>
      <RouteSeo
        title="Accessibility Statement — WCAG 2.2 AA | illuxus"
        description="How illuxus supports keyboard, screen-reader and low-vision users, what does not yet meet WCAG 2.2 AA, and how to report an accessibility barrier."
        canonical="https://illuxus.com/accessibility"
        keywords="illuxus accessibility, WCAG 2.2 AA, European Accessibility Act, RPwD Act 2016, accessible event platform"
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              url: "https://illuxus.com/accessibility",
              name: "Accessibility Statement",
              inLanguage: "en-IN",
              dateModified: "2026-10-20",
              publisher: { "@id": "https://illuxus.com/#organization" },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
                { "@type": "ListItem", position: 2, name: "Accessibility", item: "https://illuxus.com/accessibility" },
              ],
            },
          ],
        }}
      />

      <main>
        <section className="pt-24 pb-10 text-center px-4">
          <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Legal</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Accessibility Statement</h1>
          <p className="text-muted-foreground text-[14px]">Last reviewed: 20 October 2026 · Version 1.0</p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24 space-y-10">
          <div className="text-[14px] text-muted-foreground leading-relaxed border border-border bg-card rounded-xl p-5 space-y-3">
            <p>
              In short: we build to WCAG 2.2 AA, most of the platform meets it, and the visual design editors and
              generated PDFs do not yet. If anything gets in your way, email{" "}
              <a href="mailto:support@illuxus.com?subject=Accessibility" className="text-primary hover:underline">
                support@illuxus.com
              </a>{" "}
              and we will help.
            </p>
            <p>
              Related: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>,{" "}
              <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> and{" "}
              <Link to="/contact" className="text-primary hover:underline">Contact</Link>.
            </p>
          </div>
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-semibold mb-3">{s.title}</h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
            </div>
          ))}
        </section>
      </main>
    </PublicPageShell>
  );
}
