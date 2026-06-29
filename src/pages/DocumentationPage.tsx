import { useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import RouteSeo from "@/components/RouteSeo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  CalendarPlus,
  LayoutDashboard,
  UserCheck,
  ScanLine,
  Mic2,
  Radio,
  MessageSquare,
  BarChart3,
  Users2,
  FileBarChart2,
  Settings,
  ShieldCheck,
  ClipboardCheck,
  Search,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

const DOCS_KEYWORDS = [
  "illuxus documentation",
  "event platform docs",
  "event management user guide",
  "how to create an event",
  "event check-in guide",
  "QR code attendance docs",
  "webinar studio documentation",
  "speaker portal guide",
  "sponsor portal guide",
  "UTM tracking guide",
  "embed event widget",
  "event analytics documentation",
  "community feature docs",
  "WhatsApp broadcast guide",
  "email broadcast documentation",
  "event organizer onboarding",
  "workspace handle URL",
  "event landing page builder",
  "event theme editor",
  "bulk import attendees CSV",
  "event reports export",
  "two-factor authentication setup",
  "role permissions event platform",
  "illuxus quick start",
  "illuxus help center",
].join(", ");

interface DocSection {
  id: string;
  number: string;
  title: string;
  icon: typeof Rocket;
  intro: string;
  subsections: { heading: string; body: React.ReactNode }[];
}

const sections: DocSection[] = [
  {
    id: "getting-started",
    number: "1",
    title: "Getting Started",
    icon: Rocket,
    intro:
      "Set up your illuxus account, pick the right account type, and stand up your first organisation in under five minutes.",
    subsections: [
      {
        heading: "Creating your account",
        body: (
          <>
            <p>
              Head to <Link className="text-primary hover:underline" to="/login">/login</Link> and choose
              <em> Create an account</em>. You'll need a working email address and a password of at least 8 characters.
              After sign-up we send a verification email — click the link inside to activate the account. Your session
              will not have full write permissions until the email is verified.
            </p>
            <p>
              Once verified, you'll land on the profile-completion screen. Fill in your name, mobile, company, and
              city so registrations, badges, and check-in flows can render your information correctly.
            </p>
          </>
        ),
      },
      {
        heading: "Choosing your role",
        body: (
          <>
            <p>
              illuxus has two primary personas:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Organiser</strong> — runs events, owns a workspace, sells tickets, manages speakers and sponsors.</li>
              <li><strong className="text-foreground">Attendee</strong> — signs up for events, downloads tickets, gets reminders, joins communities.</li>
            </ul>
            <p>
              You can upgrade an attendee account into an organiser at any time from <em>Settings → Workspace</em>.
              Existing attendee tickets, applications, and community memberships are preserved.
            </p>
          </>
        ),
      },
      {
        heading: "Creating your first organisation / workspace",
        body: (
          <>
            <p>
              First-time organisers go through a short onboarding flow at <code>/onboarding</code> where you pick a
              workspace name, a public handle, and a default currency &amp; timezone. The handle is permanent in URLs,
              but the display name can be changed at any time.
            </p>
          </>
        ),
      },
      {
        heading: "Workspace handle (public /org/your-handle URL)",
        body: (
          <>
            <p>
              Every workspace is published at <code>/org/&lt;your-handle&gt;</code>. This page is your public face on
              illuxus — it lists upcoming events, past events, a follow button, and your social links. Share the URL
              anywhere you'd otherwise share a Linktree.
            </p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>https://illuxus.com/org/acme-events</code></pre>
          </>
        ),
      },
    ],
  },
  {
    id: "creating-events",
    number: "2",
    title: "Creating Events",
    icon: CalendarPlus,
    intro:
      "From quick-create to full builder. Set capacity, currency, approval rules, and timezone in one place.",
    subsections: [
      {
        heading: "Quick-create flow",
        body: (
          <>
            <p>
              Click <em>+ New event</em> in the organiser dashboard. The quick-create dialog asks for the bare
              minimum: title, start date &amp; time, venue, and a cover banner. The event is created as a draft —
              nothing is publicly visible until you publish.
            </p>
          </>
        ),
      },
      {
        heading: "Event types: Physical / Virtual / Hybrid",
        body: (
          <>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Physical</strong> — venue address surfaces on the landing page, maps embed, and check-in is in-person via QR.</li>
              <li><strong className="text-foreground">Virtual</strong> — no venue field; instead a Join button appears for ticket holders when the webinar goes live.</li>
              <li><strong className="text-foreground">Hybrid</strong> — both surfaces are enabled. Attendees pick a track during registration.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Cover banner specifications",
        body: (
          <>
            <p>Two banners can be uploaded per event:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Landscape</strong> — 1920 × 1080 (16:9). Used on the event landing page, OG image, and discover feed.</li>
              <li><strong className="text-foreground">Wide</strong> — 1128 × 191. Used on the org page row and dashboard cards.</li>
            </ul>
            <p className="text-sm text-muted-foreground">Accepted formats: JPG, PNG, WebP. Max file size 5MB.</p>
          </>
        ),
      },
      {
        heading: "Settings: capacity, currency, price, approval, timezone",
        body: (
          <>
            <p>
              Open <em>Event → Settings</em> to fine-tune behaviour:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Capacity</strong> — hard cap on registrations. Sold-out badge appears when reached.</li>
              <li><strong className="text-foreground">Currency</strong> — INR / USD / EUR / GBP / SGD / AUD. Used by Stripe + Razorpay at checkout.</li>
              <li><strong className="text-foreground">Price</strong> — set on each ticket tier; supports free + paid in the same event.</li>
              <li><strong className="text-foreground">Approval required</strong> — when on, registrations go to <em>pending</em> until you approve.</li>
              <li><strong className="text-foreground">Timezone</strong> — stored in UTC, rendered in this timezone on all public surfaces.</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    id: "page-builder",
    number: "3",
    title: "Event Page Builder",
    icon: LayoutDashboard,
    intro:
      "Drag-and-drop sections, six preset themes, and a typography editor. Everything is responsive and SEO-tagged out of the box.",
    subsections: [
      {
        heading: "Landing page sections",
        body: (
          <>
            <p>The builder ships with the following section types — add, reorder, or hide each one:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Hero</strong> — title, subtitle, CTA, background image.</li>
              <li><strong className="text-foreground">About</strong> — rich markdown description.</li>
              <li><strong className="text-foreground">Date &amp; Venue</strong> — map embed, directions link, timezone-aware time.</li>
              <li><strong className="text-foreground">Tickets</strong> — tier cards with price, perks, and quantity left.</li>
              <li><strong className="text-foreground">Agenda</strong> — multi-day, multi-track schedule with session detail drawers.</li>
              <li><strong className="text-foreground">Speakers</strong> — grid with bio, social links, sessions.</li>
              <li><strong className="text-foreground">Sponsors</strong> — tiered logo wall with click-through tracking.</li>
              <li><strong className="text-foreground">FAQ</strong> — accordion with markdown-supported answers.</li>
              <li><strong className="text-foreground">Custom HTML</strong> — sandboxed embed slot for video, forms, or third-party widgets.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Theme editor",
        body: (
          <>
            <p>
              The theme editor exposes the design tokens used by every section. Changes are previewed live in the
              builder and saved to the event record so the public page reflects them instantly.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Primary colour</strong> — buttons, links, highlights.</li>
              <li><strong className="text-foreground">Accent colour</strong> — secondary CTAs and decorative chips.</li>
              <li><strong className="text-foreground">Heading font / Body font</strong> — choose from 12 curated web-safe pairs.</li>
              <li><strong className="text-foreground">Title scale</strong> — 0.9× to 1.4× on a 32px base.</li>
              <li><strong className="text-foreground">Body scale</strong> — 0.9× to 1.2× on a 16px base.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Six preset themes",
        body: (
          <>
            <p>One-click presets that set sensible defaults for both light and dark surfaces:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]">
              {["Light", "Cream", "Mint", "Sky", "Rose", "Midnight"].map((t) => (
                <div key={t} className="rounded-md border border-border px-3 py-2 bg-card">{t}</div>
              ))}
            </div>
          </>
        ),
      },
      {
        heading: "Sharing the public URL + SEO meta tags",
        body: (
          <>
            <p>
              Every event has a canonical public URL of the form
              {" "}<code>/org/&lt;org-handle&gt;/events/&lt;event-slug&gt;</code>. Open Graph image, Twitter card,
              keywords, canonical, and JSON-LD <code>Event</code> schema are emitted automatically.
            </p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>{`<meta property="og:title" content="..." />
<meta property="og:image" content=".../og-image.png" />
<script type="application/ld+json">{ "@type": "Event", ... }</script>`}</code></pre>
          </>
        ),
      },
    ],
  },
  {
    id: "registrations",
    number: "4",
    title: "Managing Registrations",
    icon: UserCheck,
    intro:
      "Approve, decline, search, bulk-import. Every attendee gets a confirmation email and a QR-tagged ticket.",
    subsections: [
      {
        heading: "How attendees register",
        body: (
          <>
            <p>
              Public visitors click <em>Register</em> on the event page, fill in the form (name, email, mobile,
              optional custom fields), and complete payment if the tier is paid. A ticket and confirmation email are
              issued immediately, or — if approval is enabled — they're placed in <em>pending</em>.
            </p>
          </>
        ),
      },
      {
        heading: "Approval workflow",
        body: (
          <>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Auto-approve</strong> — default. Tickets issue instantly.</li>
              <li><strong className="text-foreground">Approval required</strong> — registrations enter <em>pending</em>. Approve or decline from the Guests tab.</li>
              <li><strong className="text-foreground">Decline</strong> — attendee gets a polite decline email; no ticket is created.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Adding participants manually",
        body: (
          <>
            <p>
              Use <em>Guests → Add</em> to pre-approve known attendees. They receive an invitation email with a
              one-click confirm link; no payment is required.
            </p>
          </>
        ),
      },
      {
        heading: "CSV bulk import",
        body: (
          <>
            <p>Required columns:</p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>name,email,mobile,ticket_type,company,role,send_invite</code></pre>
            <p>
              <code>send_invite=true</code> triggers an invitation email immediately. The importer dedupes by email,
              reports per-row errors, and rolls back partial failures.
            </p>
          </>
        ),
      },
      {
        heading: "Search, filter, role assignment",
        body: (
          <>
            <p>
              The Guests tab supports free-text search, status filters (pending / approved / declined / checked-in),
              ticket-tier filters, and bulk role assignment. Assigning a role (Speaker, Sponsor, VIP) unlocks the
              relevant portal automatically.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "checkin",
    number: "5",
    title: "Check-in / Check-out",
    icon: ScanLine,
    intro:
      "Camera-based QR scanner, bulk paste mode, and self check-in kiosks. The attendance state machine guarantees no double-counts.",
    subsections: [
      {
        heading: "QR code scanner",
        body: (
          <>
            <p>
              From <em>Event → Check-in</em>, click <em>Open scanner</em>. We request camera access in-browser — no
              app install needed. Each scan resolves the QR payload to a ticket id and applies the next state
              transition (Never → Inside or Outside → Inside).
            </p>
          </>
        ),
      },
      {
        heading: "Bulk check-in dialog",
        body: (
          <>
            <p>
              For desk volunteers without a camera, the <em>Bulk paste</em> dialog accepts a newline-separated list
              of ticket codes or ids. Each row reports success/failure inline. Useful for processing badges scanned
              by an external handheld scanner.
            </p>
          </>
        ),
      },
      {
        heading: "Self check-in kiosk URLs",
        body: (
          <>
            <p>Two routes are exposed per event:</p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>{`https://illuxus.com/checkin/<event-id>
https://illuxus.com/checkout/<event-id>`}</code></pre>
            <p>
              Open these on a tablet kiosk at the door. The page is full-screen, scans the next QR automatically,
              and clears state after every success — perfect for unattended entry/exit lanes.
            </p>
          </>
        ),
      },
      {
        heading: "Attendance state machine",
        body: (
          <>
            <p>
              Each registration carries an <code>attendance_state</code> with three values:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Never</strong> — has not checked in yet.</li>
              <li><strong className="text-foreground">Inside</strong> — currently in the venue.</li>
              <li><strong className="text-foreground">Outside</strong> — checked in then out; can re-enter.</li>
            </ul>
            <p>
              Transitions are recorded as immutable events (<code>in</code>, <code>out</code>, <code>auto_out</code>).
              The state machine is covered by 13 property-based tests so re-scanning a QR is always safe.
            </p>
          </>
        ),
      },
      {
        heading: "Live attendance counters",
        body: (
          <>
            <p>
              The Check-in tab shows live counts of Inside / Outside / Never plus a session-by-session attendance
              graph. Counters tick in real time via Supabase Realtime — no manual refresh needed.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "speakers-sponsors",
    number: "6",
    title: "Speakers & Sponsors",
    icon: Mic2,
    intro:
      "Invite directly, accept applications, or both. Dedicated portals at /speaker and /sponsor for self-service updates.",
    subsections: [
      {
        heading: "Inviting speakers",
        body: (
          <>
            <p>
              From <em>Event → Speakers → Invite</em>, paste a list of emails and pick a session. The invitee gets a
              one-click acceptance email; if they don't have an illuxus account, one is created on accept.
              Alternatively, publish a <em>Call for Speakers</em> form on the event landing page and approve from the
              applications tab.
            </p>
          </>
        ),
      },
      {
        heading: "Speaker portal at /speaker",
        body: (
          <>
            <p>
              Approved speakers can sign in at <Link className="text-primary hover:underline" to="/speaker">/speaker</Link>
              {" "}to update their bio, headshot, social links, and session slide decks. Organisers see the changes
              reflected on the public agenda within seconds.
            </p>
          </>
        ),
      },
      {
        heading: "Sponsor tiers",
        body: (
          <>
            <p>
              illuxus ships with <strong className="text-foreground">Gold</strong>, <strong className="text-foreground">Silver</strong>, and{" "}
              <strong className="text-foreground">Bronze</strong> tiers — and you can add custom tiers (Platinum,
              Diamond, Community Partner). Each tier defines logo size, placement priority, and the perks shown to
              prospects.
            </p>
          </>
        ),
      },
      {
        heading: "Sponsor portal at /sponsor",
        body: (
          <>
            <p>
              Sponsors log in at <Link className="text-primary hover:underline" to="/sponsor">/sponsor</Link>, manage
              their branding, upload collateral, schedule meetings, and download a CSV of leads captured by their
              booth-scanner. Lead capture is GDPR-compliant — attendees opt in by scanning the sponsor's booth QR.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "webinars",
    number: "7",
    title: "Live Webinars",
    icon: Radio,
    intro:
      "LiveKit-powered video stage with reactions, Q&A, polls, and per-attendee unique join links. Recording and transcripts included.",
    subsections: [
      {
        heading: "Going live",
        body: (
          <>
            <p>
              From <em>Event → Webinar studio</em>, click <em>Start</em>. illuxus provisions a LiveKit room
              (with an Agora fallback) and surfaces the stage to invited speakers. Attendees are admitted from the
              lobby when you press <em>Open doors</em>.
            </p>
          </>
        ),
      },
      {
        heading: "Speaker stage controls",
        body: (
          <>
            <p>
              The stage host can: mute / unmute individual speakers, promote attendees on stage, share a screen,
              pin the active speaker, swap layouts (Grid / Spotlight / Side-by-side), and run a chroma-keyed
              backdrop.
            </p>
          </>
        ),
      },
      {
        heading: "Reactions, Q&A, polls",
        body: (
          <>
            <p>
              Audience tools available out of the box:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Reactions</strong> — floating emoji feedback, throttled for performance.</li>
              <li><strong className="text-foreground">Q&amp;A</strong> — moderated queue; upvote, dismiss, mark as answered.</li>
              <li><strong className="text-foreground">Polls</strong> — single/multi-select with live result charts.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Recording, transcripts, replay",
        body: (
          <>
            <p>
              Toggle <em>Record</em> at any time. We capture the full mixed feed (MP4) plus a per-speaker raw track.
              After the session, a speech-to-text job produces a chaptered transcript and a replay link you can gate
              by ticket type.
            </p>
          </>
        ),
      },
      {
        heading: "Per-attendee unique join links with UTM",
        body: (
          <>
            <p>
              Every confirmation email includes a unique signed join URL. The URL carries a UTM stamp so you can
              measure how many people who clicked from email/WhatsApp/social actually showed up.
            </p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>https://illuxus.com/e/&lt;event-id&gt;/live?t=&lt;jwt&gt;&amp;utm_source=email&amp;utm_medium=reminder</code></pre>
          </>
        ),
      },
    ],
  },
  {
    id: "communications",
    number: "8",
    title: "Communications",
    icon: MessageSquare,
    intro:
      "Templated email and WhatsApp broadcasts, smart segments, and automated lifecycle reminders.",
    subsections: [
      {
        heading: "Email broadcasts",
        body: (
          <>
            <p>
              Compose in a rich editor or pick from prebuilt templates (Save the date, Reminder, Day-of, Thank
              you). Schedule for any future time, segment by ticket tier / attendance state / city, and preview the
              render in both desktop and mobile clients before sending.
            </p>
          </>
        ),
      },
      {
        heading: "WhatsApp broadcasts",
        body: (
          <>
            <p>
              WhatsApp messages use approved templates from your WhatsApp Business account. Upload the template
              names + variable mappings once, then trigger sends from the same broadcast composer. Delivery is
              metered against your WhatsApp BSP.
            </p>
          </>
        ),
      },
      {
        heading: "Pre-event / day-of / post-event reminders",
        body: (
          <>
            <p>Automated reminders run out of the box:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">7 days before</strong> — confirmation + add to calendar.</li>
              <li><strong className="text-foreground">24 hours before</strong> — schedule preview + venue / join link.</li>
              <li><strong className="text-foreground">2 hours before</strong> — final reminder.</li>
              <li><strong className="text-foreground">Same day after</strong> — thank-you + replay + post-event survey.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Ticket confirmation emails",
        body: (
          <>
            <p>
              Every successful registration triggers a transactional email containing the ticket QR, a calendar
              .ics attachment, venue map / join link, and a link to the attendee's tickets dashboard. Branded with
              your workspace logo and colours.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "marketing",
    number: "9",
    title: "Marketing & Analytics",
    icon: BarChart3,
    intro:
      "Branded org page, embeddable widgets, and a full UTM analytics dashboard with saved link rules.",
    subsections: [
      {
        heading: "Landing pages for your org",
        body: (
          <>
            <p>
              Your org page at <code>/org/&lt;handle&gt;</code> is generated automatically. Upload a banner,
              tagline, social links, and a sticky CTA — the page lists every published event and follows the same
              theme tokens you set on the workspace.
            </p>
          </>
        ),
      },
      {
        heading: "Embeddable event widget",
        body: (
          <>
            <p>
              Drop the illuxus widget into any website to surface live registration counts and an embedded RSVP
              flow. No iframe — the widget hydrates with the host site's fonts.
            </p>
            <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-[12px] overflow-x-auto"><code>{`<div id="illuxus-event" data-event="evt_abc123"></div>
<script src="https://illuxus.com/embed.js" async></script>`}</code></pre>
          </>
        ),
      },
      {
        heading: "UTM tracking",
        body: (
          <>
            <p>
              Append <code>utm_source</code>, <code>utm_medium</code>, and <code>utm_campaign</code> to any link
              into illuxus. We persist the first-touch attribution against each registration so you can see exactly
              which campaign drove the booking.
            </p>
          </>
        ),
      },
      {
        heading: "UTM analytics dashboard",
        body: (
          <>
            <p>The Marketing tab surfaces:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Clicks per source / medium / campaign</li>
              <li>Registrations attributed</li>
              <li>Conversion percentage</li>
              <li>Top performing campaigns over rolling 7 / 30 / 90 days</li>
            </ul>
          </>
        ),
      },
      {
        heading: "UTM link registry",
        body: (
          <>
            <p>
              Save canonical UTM links so the team uses consistent tags. Rules can be edited or deleted from the
              registry — historical clicks remain attributed to the rule even after it's removed.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "communities",
    number: "10",
    title: "Communities",
    icon: Users2,
    intro:
      "Every event spawns its own community space. Feed, chat, announcements, calendar, and resources, all behind RBAC.",
    subsections: [
      {
        heading: "Auto-created community per event",
        body: (
          <>
            <p>
              When you publish an event with <em>Create community</em> enabled, illuxus spins up a dedicated
              community at <code>/community/&lt;event-slug&gt;</code> and adds every approved attendee on
              check-in.
            </p>
          </>
        ),
      },
      {
        heading: "Feed, comments, members, announcements, calendar, resources, chat",
        body: (
          <>
            <p>The community ships with the following surfaces, all linkable from the community sidebar:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Feed</strong> — text/image/link posts with threaded comments.</li>
              <li><strong className="text-foreground">Members</strong> — searchable directory with role badges.</li>
              <li><strong className="text-foreground">Announcements</strong> — pinned, push-notified messages from organisers.</li>
              <li><strong className="text-foreground">Calendar</strong> — recurring events, side meetups, AMAs.</li>
              <li><strong className="text-foreground">Resources</strong> — slide decks, recordings, post-event swag.</li>
              <li><strong className="text-foreground">Chat</strong> — real-time rooms with @mentions and emoji reactions.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "Moderation, RBAC roles",
        body: (
          <>
            <p>
              Roles available inside a community: <strong className="text-foreground">Owner</strong>,{" "}
              <strong className="text-foreground">Admin</strong>, <strong className="text-foreground">Moderator</strong>,{" "}
              <strong className="text-foreground">Member</strong>. Moderation tools cover post removal, comment
              hiding, member suspension, and bans — every action is audit-logged.
            </p>
          </>
        ),
      },
      {
        heading: "Carrying members between events",
        body: (
          <>
            <p>
              When you create a new event, you can choose to <em>Carry members from</em> an existing community —
              everyone is auto-added to the new community on creation. Great for recurring series or annual
              conferences.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "reports",
    number: "11",
    title: "Reports & Exports",
    icon: FileBarChart2,
    intro:
      "KPIs at the workspace level, per-event reports, and unrestricted CSV exports with a column picker.",
    subsections: [
      {
        heading: "Built-in KPIs",
        body: (
          <>
            <p>
              The Reports dashboard tracks: registrations (gross, net, declined), revenue (gross, net of fees,
              refunds), attendance (checked-in count, no-show %, avg session attendance), conversion (page views
              → registrations).
            </p>
          </>
        ),
      },
      {
        heading: "CSV export with column picker",
        body: (
          <>
            <p>
              Every list view (Guests, Tickets, Speakers, Sponsors, Webinar attendees) has a <em>Export</em> button
              that opens a column picker. Pick the columns you want, optionally filter rows first, and download a
              CSV that opens cleanly in Excel and Google Sheets.
            </p>
          </>
        ),
      },
      {
        heading: "Revenue dashboard",
        body: (
          <>
            <p>
              Track gross revenue, refunds, Stripe / Razorpay fees, GST, and net payout per event and rolled up
              across the workspace. Date-range filters and currency-aware totals (with FX cached for 5 minutes).
            </p>
          </>
        ),
      },
      {
        heading: "Per-event reports tab",
        body: (
          <>
            <p>
              Each event has a Reports tab with the same KPI set scoped to that event, plus the attendance
              session-by-session chart and the UTM attribution funnel.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "workspace",
    number: "12",
    title: "Workspace Settings",
    icon: Settings,
    intro:
      "Invite teammates, promote co-owners, secure with 2FA, manage your plan from one place.",
    subsections: [
      {
        heading: "Team members and invitations",
        body: (
          <>
            <p>
              From <em>Settings → Team</em>, invite teammates by email and assign a role (Admin, Editor, Viewer).
              Invitations expire in 7 days. Members can be removed any time — their authored content is preserved
              and reassigned to the workspace.
            </p>
          </>
        ),
      },
      {
        heading: "Co-owner promotion",
        body: (
          <>
            <p>
              An Admin can be promoted to <em>Co-owner</em>, which grants billing and workspace-deletion rights.
              Every workspace must always have at least one owner; you can't demote the last one.
            </p>
          </>
        ),
      },
      {
        heading: "2FA setup",
        body: (
          <>
            <p>
              Enable TOTP-based 2FA from <em>Settings → Security</em>. Scan the QR with Authy, Google Authenticator,
              or 1Password. Recovery codes are issued at setup — store them somewhere safe; we can't recover them
              for you.
            </p>
          </>
        ),
      },
      {
        heading: "Billing & plan management",
        body: (
          <>
            <p>
              Upgrade, downgrade, or cancel from <em>Settings → Billing</em>. Plan changes apply at the next renewal;
              no proration surprises. Invoices include GST and are downloadable as PDF.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "roles",
    number: "13",
    title: "Roles & Permissions",
    icon: ShieldCheck,
    intro:
      "Four built-in roles cover every persona. RBAC is enforced both client-side and at the database row level.",
    subsections: [
      {
        heading: "Super Admin (platform owner)",
        body: (
          <>
            <p>
              Lives at <code>/dashboard/admin</code>. Manages users, orgs, events, revenue, support tickets, and
              platform settings across the entire SaaS. Reserved for illuxus staff.
            </p>
          </>
        ),
      },
      {
        heading: "Organiser / Admin",
        body: (
          <>
            <p>
              Owns one or more workspaces. Full CRUD on events, registrations, communications, communities, and
              workspace settings (within their own org).
            </p>
          </>
        ),
      },
      {
        heading: "Team Member",
        body: (
          <>
            <p>
              Invited collaborator inside an org. Role-scoped permissions (Admin / Editor / Viewer) govern what
              they can see and modify. Cannot delete the workspace or change billing.
            </p>
          </>
        ),
      },
      {
        heading: "Delegate / Attendee",
        body: (
          <>
            <p>
              The default account type. Can sign up for events, manage their own tickets, applications, and
              community memberships. Cannot access organiser dashboards unless invited to a workspace.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: "best-practices",
    number: "14",
    title: "Best Practices",
    icon: ClipboardCheck,
    intro:
      "A short checklist for the three moments that define a great event: the run-up, the day, and the follow-up.",
    subsections: [
      {
        heading: "Pre-event checklist",
        body: (
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Cover banners uploaded in both 1920×1080 and 1128×191.</li>
            <li>Tickets configured, currency &amp; capacity set, approval rules confirmed.</li>
            <li>Speakers invited, bios &amp; headshots filled in via /speaker portal.</li>
            <li>Sponsor tiers defined, logo wall populated.</li>
            <li>UTM links generated for every paid channel.</li>
            <li>Email reminder schedule reviewed in Communications.</li>
            <li>Self check-in kiosk URLs printed for door volunteers.</li>
          </ul>
        ),
      },
      {
        heading: "Day-of checklist",
        body: (
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Verify scanner camera permission on every device 30 min before doors.</li>
            <li>Open the Check-in tab on a wall monitor so the team can see live counts.</li>
            <li>For virtual: <em>Open doors</em> 10 min before the start; greet attendees in the lobby.</li>
            <li>Have one team member watching the Q&amp;A queue during live sessions.</li>
          </ul>
        ),
      },
      {
        heading: "Post-event follow-up",
        body: (
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>Send the thank-you broadcast within 24 hours; include replay link &amp; survey.</li>
            <li>Upload session recordings + transcripts to the community Resources tab.</li>
            <li>Export the Guests CSV and share with the relevant Slack channel.</li>
            <li>Review the UTM dashboard — which channels actually converted?</li>
            <li>Plan the next event &amp; carry community members across.</li>
          </ul>
        ),
      },
    ],
  },
];

export default function DocumentationPage() {
  const [query, setQuery] = useState("");

  const docsJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": "https://illuxus.com/docs#article",
        headline: "illuxus Documentation",
        description:
          "End-to-end documentation for the illuxus event management platform — account setup, event creation, check-in, webinars, communications, analytics, and communities.",
        author: { "@type": "Organization", name: "illuxus" },
        publisher: { "@type": "Organization", name: "illuxus" },
        inLanguage: "en",
        url: "https://illuxus.com/docs",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
          { "@type": "ListItem", position: 2, name: "Documentation", item: "https://illuxus.com/docs" },
        ],
      },
    ],
  };

  // Visual-only filter: when the query is non-empty we mark sections that
  // don't contain the term so the sidebar can dim them. Search is intentionally
  // lightweight (substring on title + intro) — it's a wayfinding hint, not a
  // full-text engine.
  const q = query.trim().toLowerCase();
  const matches = (s: DocSection) =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.intro.toLowerCase().includes(q) ||
    s.subsections.some((sub) => sub.heading.toLowerCase().includes(q));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RouteSeo
        title="Documentation — Complete guide to running events on illuxus"
        description="Step-by-step documentation for the illuxus event platform: account setup, event creation, page builder, registrations, check-in, webinars, communications, analytics, and communities."
        canonical="https://illuxus.com/docs"
        keywords={DOCS_KEYWORDS}
        ogImage="https://illuxus.com/og-image.png"
        ogType="article"
        jsonLd={docsJsonLd}
      />

      {/* Hero */}
      <section className="pt-24 pb-10 px-4 max-w-6xl mx-auto text-center">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Documentation</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Everything you need to run events on illuxus
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          A complete reference for organisers — from creating your first event to running multi-track conferences
          with live webinars, sponsor portals, and community follow-up.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs (e.g. check-in, UTM, sponsor portal)"
            className="pl-9 h-11"
            aria-label="Search documentation"
          />
        </div>
      </section>

      {/* Body — two-column layout */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
        {/* Sticky sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Documentation sections" className="lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto pr-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3 px-2">
              Contents
            </p>
            <ul className="space-y-0.5">
              {sections.map((s) => {
                const dim = !matches(s);
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-muted/60 transition-colors ${
                        dim ? "text-muted-foreground/40" : "text-foreground"
                      }`}
                    >
                      <span className="text-muted-foreground/60 tabular-nums w-5 text-right">{s.number}.</span>
                      <span className="flex-1 truncate">{s.title}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Main content */}
        <div className="space-y-16 min-w-0">
          {sections.map((s) => {
            const Icon = s.icon;
            const dim = !matches(s);
            return (
              <article
                key={s.id}
                id={s.id}
                className={`scroll-mt-24 transition-opacity ${dim ? "opacity-30" : "opacity-100"}`}
              >
                <header className="mb-5 pb-4 border-b border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Section {s.number}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{s.title}</h2>
                  <p className="text-muted-foreground mt-2 max-w-2xl">{s.intro}</p>
                </header>

                <div className="space-y-8">
                  {s.subsections.map((sub, i) => (
                    <section key={sub.heading}>
                      <h3 className="text-lg font-semibold mb-2">
                        <span className="text-muted-foreground/60 mr-2 tabular-nums">
                          {s.number}.{i + 1}
                        </span>
                        {sub.heading}
                      </h3>
                      <div className="text-[14px] leading-relaxed text-muted-foreground space-y-3 [&_p]:leading-relaxed [&_strong]:text-foreground [&_code]:bg-muted/60 [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12.5px] [&_code]:font-mono">
                        {sub.body}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 border-t border-border py-16 text-center px-4">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Need a hand getting set up?</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Our team is happy to walk you through your first event end-to-end. No sales pressure — just practical help.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/contact">
              Contact support <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/faqs">Read the FAQs</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
