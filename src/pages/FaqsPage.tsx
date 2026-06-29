import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import RouteSeo from "@/components/RouteSeo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Rocket,
  CreditCard,
  CalendarDays,
  UserCheck,
  Radio,
  Mic2,
  MessageSquare,
  BarChart3,
  Users2,
  Code2,
  Globe2,
  ShieldCheck,
  Smartphone,
  Plug,
  LifeBuoy,
  Search,
  ArrowRight,
} from "lucide-react";

const FAQ_KEYWORDS = [
  "illuxus FAQ",
  "event platform FAQ",
  "event ticketing questions",
  "event management help",
  "how to upgrade plan",
  "GST invoicing event platform",
  "refund event tickets",
  "QR check-in help",
  "self check-in kiosk help",
  "webinar streaming FAQ",
  "speaker portal FAQ",
  "sponsor portal FAQ",
  "email deliverability event platform",
  "WhatsApp template approval",
  "UTM analytics FAQ",
  "embed event widget FAQ",
  "custom domain event platform",
  "white-label event SaaS",
  "GDPR event data",
  "2FA event platform",
  "API webhooks event platform",
  "Stripe Razorpay event",
  "PWA event platform",
  "troubleshooting login",
].join(", ");

interface Faq {
  q: string;
  a: string;
}

interface FaqCategory {
  id: string;
  title: string;
  icon: typeof Rocket;
  faqs: Faq[];
}

const categories: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    faqs: [
      {
        q: "How do I create an illuxus account?",
        a: "Visit /login and click 'Create an account'. Enter an email and password, verify the address via the link we send you, then complete your profile. The whole flow takes about two minutes.",
      },
      {
        q: "Do I need to verify my email before I can do anything?",
        a: "You can browse public events without verifying, but to register, organise, or use any dashboard feature you must verify your email first. The verification link is valid for 24 hours; request a fresh one any time from the banner at the top of the screen.",
      },
      {
        q: "Should I sign up as an organiser or an attendee?",
        a: "Pick attendee if you only want to register for events. Pick organiser if you want to run events. You can upgrade an attendee account into an organiser from Settings → Workspace at any time without losing existing tickets or data.",
      },
      {
        q: "How long does it take to create my first event?",
        a: "Most teams have their first event live in under 10 minutes. The quick-create dialog only asks for title, date, venue, and a banner — everything else can be refined later in the page builder.",
      },
      {
        q: "Which plan should I start on?",
        a: "Start on the free Starter plan. You can run real events for up to 100 attendees with QR check-in, a basic landing page, and email support. Upgrade to Professional only when you actually need higher capacity or advanced features.",
      },
    ],
  },
  {
    id: "account-billing",
    title: "Account & Billing",
    icon: CreditCard,
    faqs: [
      {
        q: "Which plans do you offer?",
        a: "Three plans: Starter (free, up to 100 attendees), Professional (₹3,499/mo, up to 5,000 attendees and full features), and Enterprise (custom, unlimited everything plus white-label and SSO). See the pricing page for the full feature matrix.",
      },
      {
        q: "Can I upgrade or downgrade at any time?",
        a: "Yes. Plan changes take effect at your next renewal date. No proration surprises and no penalty for downgrading. Your events, attendees, and data are never touched by a plan change.",
      },
      {
        q: "What payment methods do you accept?",
        a: "Stripe handles credit and debit cards worldwide. Razorpay is available for Indian customers, supporting UPI, net banking, and major wallets. Enterprise plans can also pay by invoice.",
      },
      {
        q: "Do you issue refunds?",
        a: "Yes — within 14 days of purchase, no questions asked. After that we handle refunds case-by-case (e.g. service outage). Email billing@illuxus.com with your invoice number to start a refund.",
      },
      {
        q: "Can I download GST-compliant invoices?",
        a: "Yes. Add your GSTIN under Settings → Billing and every invoice from then on will include it. You can download invoices as PDF from the same page. We charge GST on Indian customers as required by law.",
      },
      {
        q: "How do I cancel my subscription?",
        a: "Go to Settings → Billing → Cancel plan. Cancellation takes effect at the end of the current billing cycle so you don't lose features mid-period. Your data stays accessible on the Starter tier even after cancelling Professional.",
      },
    ],
  },
  {
    id: "events-tickets",
    title: "Events & Tickets",
    icon: CalendarDays,
    faqs: [
      {
        q: "How do I create a new event?",
        a: "From the organiser dashboard, click '+ New event'. Fill in title, date, venue, and upload a banner. The event is created as a draft — refine it in the page builder and publish when ready.",
      },
      {
        q: "Can I edit an event after publishing?",
        a: "Yes. All event fields remain editable after publishing. Attendees who have already registered are notified by email of material changes (date, venue, cancellation).",
      },
      {
        q: "How do I delete an event?",
        a: "Open the event detail page, then Settings → Danger zone → Delete event. Deletion is reversible for 30 days (we soft-delete) and permanent after that. Events with paid tickets cannot be deleted without first refunding attendees.",
      },
      {
        q: "Can I sell both paid and free tickets in the same event?",
        a: "Absolutely. Add as many ticket tiers as you need under Event → Tickets. Each tier has its own price, capacity, and sale window. Tiers can be free, paid, or invitation-only.",
      },
      {
        q: "How do I set capacity?",
        a: "Capacity is set per ticket tier and optionally an overall event cap. When a tier sells out, it shows a 'Sold out' badge and is hidden from checkout (or kept visible if you toggle 'Show when sold out').",
      },
      {
        q: "Which currencies can I sell in?",
        a: "INR, USD, EUR, GBP, SGD, AUD. Each event has one currency, but a single workspace can run events in different currencies. Revenue is rolled up using cached FX rates (refreshed every 5 minutes).",
      },
      {
        q: "What happens when a tier sells out?",
        a: "The tier is marked sold out on the landing page and removed from checkout. You can add a waitlist tier so people can sign up to be notified if capacity opens — or release a new tier with a different price.",
      },
    ],
  },
  {
    id: "registrations-checkin",
    title: "Registrations & Check-in",
    icon: UserCheck,
    faqs: [
      {
        q: "How does the approval flow work?",
        a: "Turn on 'Approval required' in event settings. New registrations enter pending state — approve or decline from the Guests tab. Approved attendees get a confirmation email with their ticket; declined attendees get a polite decline note.",
      },
      {
        q: "Can I bulk-import attendees from a CSV?",
        a: "Yes. From Guests → Import, upload a CSV with columns: name, email, mobile, ticket_type, company, role, send_invite. The importer dedupes by email and reports row-level errors. Tip: set send_invite=true to fire invitation emails immediately.",
      },
      {
        q: "How does the QR scanner work?",
        a: "From Event → Check-in, click 'Open scanner' to request camera access in-browser. Point the camera at any illuxus ticket QR — the state machine transitions Never → Inside (or Outside → Inside). No app install needed.",
      },
      {
        q: "Can attendees check themselves in at a kiosk?",
        a: "Yes. Each event exposes /checkin/<event-id> and /checkout/<event-id> kiosk URLs. Open them on a tablet at the door — the page auto-scans the next QR and clears state after each success.",
      },
      {
        q: "Can I print name badges?",
        a: "Yes. From the Guests tab, select attendees → 'Print badges'. We generate a PDF in either Avery 5395 (3×4 inches) or A6 format that includes name, role, company, and the attendee's QR for re-scan during sessions.",
      },
      {
        q: "What if someone re-scans the same QR by mistake?",
        a: "The attendance state machine is idempotent. Re-scanning an 'Inside' attendee shows a friendly 'Already checked in' message — it never double-counts or corrupts state. We've covered this behaviour with 13 property-based tests.",
      },
    ],
  },
  {
    id: "webinars",
    title: "Webinars & Live Streaming",
    icon: Radio,
    faqs: [
      {
        q: "Which streaming engine do you use?",
        a: "LiveKit is the primary, Agora is the fallback. We auto-route based on region and load. Both deliver sub-500ms latency for active speakers and scale to thousands of viewers per room.",
      },
      {
        q: "What's the maximum number of concurrent viewers?",
        a: "Professional plans support up to 1,000 concurrent viewers per room. Enterprise plans are uncapped — we've successfully run sessions with 25,000+ live viewers.",
      },
      {
        q: "Are sessions recorded?",
        a: "Recording is opt-in per session. Toggle 'Record' before going live; we capture a mixed MP4 plus per-speaker raw tracks. After the session, a speech-to-text job produces a chaptered transcript and a replay link you can gate by ticket type.",
      },
      {
        q: "What's the recommended network for organisers?",
        a: "Speakers need at least 5 Mbps upload and a stable wired connection if possible. Viewers can join on 1.5 Mbps adaptive streaming. We auto-degrade quality on poor connections rather than dropping the call.",
      },
      {
        q: "Which browsers are supported?",
        a: "Chrome, Edge, Brave, Arc, Safari 16+, Firefox 110+. Mobile Safari and Chrome on Android are supported for viewers. Speakers should prefer desktop Chrome for the broadest device-API support.",
      },
    ],
  },
  {
    id: "speakers-sponsors",
    title: "Speakers & Sponsors",
    icon: Mic2,
    faqs: [
      {
        q: "How do I invite speakers?",
        a: "From Event → Speakers → Invite, paste emails and pick a session. Invitees get a one-click acceptance link. If they don't have an illuxus account, one is created for them on accept.",
      },
      {
        q: "Can I run a public Call for Speakers?",
        a: "Yes. Publish a Call for Speakers form on the event landing page. Applications land in Event → Applications where you can review, approve, or decline. Approved applicants get speaker portal access automatically.",
      },
      {
        q: "How do I manage sponsor tiers?",
        a: "From Event → Sponsors → Tiers, define the tier name, logo size, and perks. Built-in tiers (Gold, Silver, Bronze) are pre-populated; add custom tiers like Platinum or Community Partner as you need.",
      },
      {
        q: "How does sponsor lead capture work?",
        a: "Each sponsor gets a unique booth QR. Attendees scan it to opt in to share contact details. Sponsors download the resulting leads CSV from /sponsor. The flow is GDPR-compliant — no leads are captured without explicit opt-in.",
      },
      {
        q: "Do you handle sponsor payouts?",
        a: "Sponsor payments are handled outside illuxus today (typically invoice + bank transfer). We're working on a sponsor-payments feature for Professional and Enterprise plans — get in touch via /contact if you want early access.",
      },
    ],
  },
  {
    id: "email-whatsapp",
    title: "Email & WhatsApp",
    icon: MessageSquare,
    faqs: [
      {
        q: "How is email deliverability handled?",
        a: "We send from authenticated domains with SPF, DKIM, and DMARC pre-configured. Bounce and complaint feedback is processed automatically. For Professional and Enterprise plans you can add your own sender domain for stronger brand presence.",
      },
      {
        q: "Can I use my own sender domain?",
        a: "Yes — on Professional and Enterprise plans. Add a DNS record we generate (CNAME + TXT for SPF / DKIM) and we'll send transactional and broadcast emails from your domain.",
      },
      {
        q: "Do attendees have an opt-out option?",
        a: "Every broadcast email includes a one-click unsubscribe footer. Transactional emails (ticket confirmation, reminders for their own registration) cannot be opted out of as they're operationally necessary.",
      },
      {
        q: "How do WhatsApp template approvals work?",
        a: "WhatsApp Business templates must be approved by Meta before they can be used. Upload your approved template names and variable mappings under Communications → WhatsApp; we'll validate them on first send.",
      },
      {
        q: "What about WhatsApp deliverability and rate limits?",
        a: "Sends are metered against your WhatsApp Business Solution Provider account. We respect their rate limits and automatically back off when needed. Expected throughput is 80–250 messages/sec depending on your BSP tier.",
      },
    ],
  },
  {
    id: "utm-analytics",
    title: "UTM & Analytics",
    icon: BarChart3,
    faqs: [
      {
        q: "How does UTM tracking work?",
        a: "Append utm_source, utm_medium, utm_campaign (and optionally utm_term, utm_content) to any link into illuxus. We persist the first-touch attribution against each registration so you can see exactly which campaign drove the booking.",
      },
      {
        q: "Where do I see the analytics?",
        a: "Dashboard → Marketing → UTM analytics. Clicks, registrations, conversion percentage, and the top campaigns over rolling 7 / 30 / 90 days. Drill into any campaign for the attendee list it brought in.",
      },
      {
        q: "Can I save canonical UTM links?",
        a: "Yes. Under Marketing → UTM links you can save link rules with descriptive names and copy-friendly URLs. Great for keeping the team on consistent UTM conventions.",
      },
      {
        q: "What happens to clicks attributed to a deleted UTM rule?",
        a: "Historical clicks remain attributed to the rule even after it's deleted — we never rewrite history. Deleted rules just stop being available for new copy operations.",
      },
    ],
  },
  {
    id: "communities",
    title: "Communities",
    icon: Users2,
    faqs: [
      {
        q: "Are communities created automatically?",
        a: "Yes — when you publish an event with 'Create community' enabled, we spin up a dedicated community space at /community/<event-slug>. Approved attendees are added on check-in.",
      },
      {
        q: "Can people join a community without attending the event?",
        a: "Optional. Open the community settings and set Visibility → Public to allow anyone to join. By default communities are gated to event attendees only.",
      },
      {
        q: "Who moderates the community?",
        a: "Owners and Admins by default. You can promote any member to Moderator to delegate post-removal, comment-hiding, and member-suspension powers. Every moderation action is audit-logged.",
      },
      {
        q: "How do I delete a community?",
        a: "Settings → Danger zone → Delete community. Soft-deleted for 30 days (recoverable from support) and permanently removed after that.",
      },
    ],
  },
  {
    id: "widget",
    title: "Embeddable Widget",
    icon: Code2,
    faqs: [
      {
        q: "How do I install the widget?",
        a: "Drop the snippet (a placeholder div + our script tag) into any HTML page. The widget hydrates with the host site's fonts and renders an inline RSVP flow. No iframe.",
      },
      {
        q: "Can I customise the widget appearance?",
        a: "Yes. Pass data-theme=\"light\" or data-theme=\"dark\" on the placeholder div, plus data-accent=\"#hex\" to override the accent colour. Layout (Compact / Card / Full) is also a data attribute.",
      },
      {
        q: "Does it work on WordPress / Webflow / Framer?",
        a: "Yes. Paste the snippet into a custom HTML block on any of those platforms. We've also published shortcode helpers for WordPress — see Docs → Embeddable widget for the latest snippet.",
      },
      {
        q: "Widget isn't showing — what should I check?",
        a: "Confirm the data-event attribute matches a valid event id, that the script tag is allowed by your Content Security Policy, and that JavaScript isn't blocked. Open the browser console — we log clear diagnostic errors to help debug.",
      },
    ],
  },
  {
    id: "domains-branding",
    title: "Domains & Branding",
    icon: Globe2,
    faqs: [
      {
        q: "Can I use a custom domain?",
        a: "Professional and Enterprise plans support a single custom domain (e.g. events.your-brand.com). Add a CNAME record we generate and we'll provision an SSL certificate within minutes.",
      },
      {
        q: "Can I use a subdomain instead?",
        a: "Yes. Subdomains are the most common setup (events.your-brand.com, conf.your-brand.com). They share SSL setup with the apex.",
      },
      {
        q: "Do you support full white-label?",
        a: "Enterprise plans include white-label — your domain, your branding, and the option to remove the 'powered by illuxus' footer mark. Co-branding (your logo alongside ours) is available on Professional.",
      },
      {
        q: "How is SSL handled?",
        a: "Automatically. We issue and renew Let's Encrypt certificates for every connected domain. No certificate files to manage on your end.",
      },
    ],
  },
  {
    id: "security-privacy",
    title: "Security & Privacy",
    icon: ShieldCheck,
    faqs: [
      {
        q: "Who owns the data?",
        a: "You do. Attendee data, registrations, communications, and analytics belong to your organisation. We process them on your behalf under a Data Processing Agreement (available on Enterprise).",
      },
      {
        q: "Is data encrypted?",
        a: "Yes — TLS 1.2+ in transit and AES-256 at rest. Backups are encrypted with separate keys. Sensitive fields (mobile, tax IDs) are additionally column-encrypted at the database level.",
      },
      {
        q: "Are you GDPR-compliant?",
        a: "Yes. We support data export, right-to-erasure, consent capture, and processor disclosure out of the box. A Data Processing Agreement is available — request one via /contact.",
      },
      {
        q: "Is two-factor authentication available?",
        a: "Yes. Enable TOTP-based 2FA from Settings → Security. Works with Authy, Google Authenticator, 1Password, and any other TOTP app. Recovery codes are issued at setup — store them safely.",
      },
      {
        q: "How do I delete my account permanently?",
        a: "Settings → Security → Delete account. Soft-deleted for 30 days so we can help if you change your mind, then hard-deleted. Workspaces with active paid subscriptions must be cancelled first.",
      },
    ],
  },
  {
    id: "mobile-pwa",
    title: "Mobile & PWA",
    icon: Smartphone,
    faqs: [
      {
        q: "Is there a mobile app?",
        a: "illuxus is a Progressive Web App (PWA). Open the site on iOS or Android, tap Share → Add to Home Screen, and it installs like a native app — own icon, full-screen, with push notifications.",
      },
      {
        q: "Does it work offline?",
        a: "Critical screens (your tickets, the QR scanner for check-in volunteers, downloaded ticket PDFs) work offline. Other pages will queue actions and sync when the connection returns.",
      },
      {
        q: "Can I receive push notifications?",
        a: "Yes — opt in on first visit. We send pushes for event reminders, community announcements, and registration approvals. You can manage preferences from Settings → Notifications.",
      },
      {
        q: "Why isn't the PWA install prompt showing?",
        a: "iOS Safari hides the install prompt behind the Share menu. On Android Chrome the prompt appears after two qualifying visits. You can force-install from the address bar's menu on any Chromium browser.",
      },
    ],
  },
  {
    id: "api-integrations",
    title: "API & Integrations",
    icon: Plug,
    faqs: [
      {
        q: "Do you have a public API?",
        a: "Yes — a REST API for events, registrations, attendees, and webhooks. Available on Professional plans (rate-limited) and Enterprise plans (uncapped). Generate an API token from Settings → Integrations.",
      },
      {
        q: "What webhooks do you support?",
        a: "registration.created, registration.approved, registration.declined, attendee.checked_in, attendee.checked_out, payment.succeeded, payment.refunded, event.published. Each event has a configurable retry policy with HMAC-signed payloads.",
      },
      {
        q: "How do I connect Stripe?",
        a: "Settings → Payments → Stripe → Connect. We use Stripe Connect so funds flow into your Stripe account directly. No funds touch our balance.",
      },
      {
        q: "How do I connect Razorpay?",
        a: "Settings → Payments → Razorpay → Connect. Generate API key + secret in your Razorpay dashboard, paste them in, and we verify the connection instantly. Indian customers get UPI, net banking, and wallets in addition to cards.",
      },
      {
        q: "Do you integrate with WhatsApp Business?",
        a: "Yes. Bring your own WhatsApp Business Solution Provider (we work with most major BSPs). Add your sender ID and template names under Communications → WhatsApp and you're live.",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: LifeBuoy,
    faqs: [
      {
        q: "I can't log in — what should I check?",
        a: "Confirm your email is verified, try a password reset, and check that your browser allows cookies for illuxus.com. If you use a corporate VPN, temporarily disable it. Still stuck? Email support@illuxus.com.",
      },
      {
        q: "Emails aren't arriving",
        a: "Check spam / promotions folders first. Add hello@illuxus.com to your contacts. If you're on a corporate domain, ask IT to allowlist mail from illuxus.com. We retry undelivered transactional emails 3 times over 24 hours before giving up.",
      },
      {
        q: "The QR scanner won't open the camera",
        a: "Camera access requires HTTPS and explicit permission. Check the browser's site settings to confirm permission is allowed. On iOS Safari, the prompt appears only on first use — if you dismissed it, you'll need to re-enable in Settings → Safari → Camera.",
      },
      {
        q: "I'm getting a dashboard error",
        a: "Hard refresh first (Cmd/Ctrl + Shift + R). If the error persists, take a screenshot and email support@illuxus.com with the URL — every page tags its request with a correlation id we can use to look up logs.",
      },
      {
        q: "Payment failed but card was charged",
        a: "This usually means the bank authorised the charge but our callback was delayed. Wait 10 minutes — if the ticket doesn't appear, contact support@illuxus.com with the transaction id. If we can't reconcile, the bank auto-reverses the hold within 7 days.",
      },
    ],
  },
];

export default function FaqsPage() {
  const [query, setQuery] = useState("");

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: categories.flatMap((c) =>
          c.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        ),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
          { "@type": "ListItem", position: 2, name: "FAQs", item: "https://illuxus.com/faqs" },
        ],
      },
    ],
  };

  // Substring filter on the whole FAQ corpus. Empty query → show everything.
  // Categories with no matching FAQs are hidden entirely from the right pane
  // and dimmed in the sidebar.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return categories.map((c) => ({ ...c, matched: c.faqs }));
    return categories.map((c) => ({
      ...c,
      matched: c.faqs.filter((f) =>
        (f.q + " " + f.a).toLowerCase().includes(q),
      ),
    }));
  }, [q]);

  const hasAnyMatches = filtered.some((c) => c.matched.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="FAQs — Answers to common questions about illuxus | illuxus"
        description="Find answers to common questions about illuxus: account setup, billing, events, check-in, webinars, sponsors, email, WhatsApp, UTM analytics, communities, custom domains, security, mobile, API, and troubleshooting."
        canonical="https://illuxus.com/faqs"
        keywords={FAQ_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={faqJsonLd}
      />

      {/* Hero + search */}
      <section className="pt-24 pb-10 px-4 max-w-6xl mx-auto text-center">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">FAQs</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Frequently asked questions
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Quick answers to what most organisers and attendees ask before getting started, while running events, and
          after the event wraps. Can't find what you need? <Link className="text-primary hover:underline" to="/contact">Reach out to support</Link>.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the FAQs (e.g. refund, kiosk, UTM, GDPR)"
            className="pl-9 h-11"
            aria-label="Search FAQs"
          />
        </div>
      </section>

      {/* Body */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
        {/* Sticky sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="FAQ categories" className="lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto pr-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 px-2">
              Categories
            </p>
            <ul className="space-y-0.5">
              {filtered.map((c) => {
                const Icon = c.icon;
                const dim = c.matched.length === 0;
                return (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-muted/60 transition-colors ${
                        dim ? "text-muted-foreground/40" : "text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{c.title}</span>
                      <span className="text-[11px] text-muted-foreground/60 tabular-nums">{c.matched.length}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Main content */}
        <div className="space-y-14 min-w-0">
          {!hasAnyMatches && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <h2 className="text-lg font-semibold mb-2">No results for &ldquo;{query}&rdquo;</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Try a shorter or different search term, or browse the categories on the left.
              </p>
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          )}

          {filtered.map((c) => {
            if (c.matched.length === 0) return null;
            const Icon = c.icon;
            return (
              <article key={c.id} id={c.id} className="scroll-mt-24">
                <header className="mb-5 pb-4 border-b border-border flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight">{c.title}</h2>
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                    {c.matched.length} question{c.matched.length === 1 ? "" : "s"}
                  </span>
                </header>

                <Accordion type="single" collapsible className="bg-card border border-border rounded-2xl px-4">
                  {c.matched.map((f, i) => (
                    <AccordionItem
                      key={`${c.id}-${i}`}
                      value={`${c.id}-${i}`}
                      className="border-b last:border-b-0"
                    >
                      <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                        {f.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </article>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 border-t border-border py-16 text-center px-4">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Still have questions?</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          The support team replies within a few hours during business days. Tell us what you're trying to do and
          we'll point you to the right answer.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/contact">
              Contact support <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
