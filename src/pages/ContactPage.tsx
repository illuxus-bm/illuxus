import { useState } from "react";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import RouteSeo from "@/components/RouteSeo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
  Copy as CopyIcon,
  Download,
  ExternalLink,
  Shield,
  Scale,
  Newspaper,
  HeadphonesIcon,
  Building2,
  MapPin,
  ShieldAlert,
  Linkedin,
  Twitter,
  Instagram,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";

// Categories mirror the support_ticket_category enum in
// supabase/migrations/005_support_tickets.sql. Keep this list in sync when
// the enum changes — the edge function also clamps unknown values to "general".
const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "general",         label: "General enquiry" },
  { value: "sales",           label: "Sales & Enterprise" },
  { value: "support",         label: "Technical support" },
  { value: "billing",         label: "Billing" },
  { value: "privacy",         label: "Privacy & DPO" },
  { value: "grievance",       label: "Grievance officer" },
  { value: "press",           label: "Press & media" },
  { value: "legal",           label: "Legal" },
  { value: "feature_request", label: "Feature request" },
  { value: "bug_report",      label: "Bug report" },
  { value: "other",           label: "Other" },
];

type ContactOption = {
  icon: typeof Mail;
  title: string;
  description: string;
  contact: string;
  href: string;
  /** When the user clicks this card, pre-fill the form's category. */
  category: string;
};

const contactOptions: ContactOption[] = [
  {
    icon: Mail,
    title: "General enquiries",
    description: "Questions about the platform, pricing, or anything else.",
    contact: "hello@illuxus.com",
    href: "mailto:hello@illuxus.com",
    category: "general",
  },
  {
    icon: MessageSquare,
    title: "Sales & Enterprise",
    description: "Large events, custom contracts, white-label solutions.",
    contact: "sales@illuxus.com",
    href: "mailto:sales@illuxus.com",
    category: "sales",
  },
  {
    icon: HeadphonesIcon,
    title: "Support",
    description: "Technical help, billing issues, or account problems.",
    contact: "support@illuxus.com",
    href: "mailto:support@illuxus.com",
    category: "support",
  },
  {
    icon: Shield,
    title: "Privacy & DPO",
    description: "Data subject requests, privacy questions, DPDPA / GDPR matters.",
    contact: "privacy@illuxus.com",
    href: "mailto:privacy@illuxus.com",
    category: "privacy",
  },
  {
    icon: ShieldAlert,
    title: "Grievance Officer",
    description: "Content takedowns, privacy grievances, IT Rules 2021 complaints.",
    contact: "grievance@illuxus.com",
    href: "mailto:grievance@illuxus.com",
    category: "grievance",
  },
  {
    icon: Newspaper,
    title: "Press & media",
    description: "Interviews, quotes, brand assets, partnership announcements.",
    contact: "press@illuxus.com",
    href: "mailto:press@illuxus.com",
    category: "press",
  },
  {
    icon: Scale,
    title: "Legal",
    description: "Contracts, notices, dispute resolution, subpoenas.",
    contact: "legal@illuxus.com",
    href: "mailto:legal@illuxus.com",
    category: "legal",
  },
];

const socials = [
  { icon: Linkedin, label: "LinkedIn", href: "https://www.linkedin.com/company/illuxus", handle: "/illuxus" },
  { icon: Twitter,  label: "X (Twitter)", href: "https://x.com/illuxus_in", handle: "@illuxus_in" },
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/illuxus.in", handle: "@illuxus.in" },
];

interface FormState {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  subject: "",
  category: "general",
  message: "",
};

interface SubmissionResult {
  ticketNumber: string;
  trackingUrl: string;
  emailDelivered: boolean;
  emailUsed: string;
  nameUsed: string;
  subjectUsed: string;
  categoryUsed: string;
}

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const handleOptionClick = (e: React.MouseEvent, opt: ContactOption) => {
    // Card is a mailto by default; we hijack the click to also nudge the
    // form's category. Holding cmd / shift opens the mailto as the user
    // expects so power users still get the email-client shortcut.
    if (!e.metaKey && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      setForm((f) => ({ ...f, category: opt.category }));
      const target = document.getElementById("contact-form-card");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Name, email and message are required.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-support-ticket", {
        body: {
          name:     form.name.trim(),
          email:    form.email.trim(),
          subject:  form.subject.trim() || `${labelForCategory(form.category)} — from contact form`,
          category: form.category,
          message:  form.message.trim(),
          source:   "contact_form",
          page_url: typeof window !== "undefined" ? window.location.href : null,
        },
      });

      if (error || !data?.success) {
        throw new Error(
          (data && typeof data.error === "string" && data.error) ||
            error?.message ||
            "Could not send your message. Please email support@illuxus.com directly.",
        );
      }

      const ticketNumber = String(data.ticket_number);
      const trackingUrl =
        typeof data.tracking_url === "string"
          ? data.tracking_url
          : `${window.location.origin}/support/ticket/${ticketNumber}`;

      logger.info("support_ticket_submitted", {
        category: form.category,
        ticket_number: ticketNumber,
      });

      setResult({
        ticketNumber,
        trackingUrl,
        emailDelivered: !!data.email_delivered,
        emailUsed: form.email.trim(),
        nameUsed: form.name.trim(),
        subjectUsed: form.subject.trim() || `${labelForCategory(form.category)} — from contact form`,
        categoryUsed: form.category,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("support_ticket_submission_failed", { error_message: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="min-h-screen bg-background">
      <RouteSeo
        title="Contact illuxus — Sales, support, privacy, grievance officer"
        description="Get in touch with illuxus. Sales, support, privacy/DPO, grievance officer, press, legal — 7 dedicated channels. Mumbai HQ. Response within 1 business day."
        canonical="https://illuxus.com/contact"
        keywords={[
          "contact illuxus",
          "illuxus support",
          "illuxus sales",
          "illuxus grievance officer",
          "illuxus DPO",
          "illuxus privacy contact",
          "illuxus press contact",
          "illuxus legal contact",
          "event platform support",
          "event platform sales India",
          "event SaaS contact",
          "event management contact Mumbai",
          "event tech contact India",
          "contact event organiser platform",
          "Mumbai event platform contact",
          "Bengaluru event platform support",
          "Delhi event platform sales",
          "DPDPA grievance officer India",
          "GDPR contact event platform",
          "consumer protection contact event platform",
          "event refund support",
          "event ticketing help",
          "event check-in support",
          "webinar platform support",
          "speaker portal support",
          "sponsor portal support",
          "event community support",
          "event analytics support",
          "event API support",
          "illuxus enterprise sales",
        ].join(", ")}
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ContactPage",
              url: "https://illuxus.com/contact",
              name: "Contact illuxus",
              about: { "@id": "https://illuxus.com/#organization" },
            },
            {
              "@type": "Organization",
              "@id": "https://illuxus.com/#organization",
              name: "Illuxus Technologies Private Limited",
              url: "https://illuxus.com/",
              contactPoint: [
                {
                  "@type": "ContactPoint",
                  contactType: "sales",
                  email: "sales@illuxus.com",
                  areaServed: ["IN", "SG", "AE", "GB", "US"],
                  availableLanguage: ["English", "Hindi"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  email: "support@illuxus.com",
                  areaServed: "IN",
                  availableLanguage: ["English", "Hindi"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "technical support",
                  email: "tech@illuxus.com",
                  areaServed: "IN",
                  availableLanguage: ["English"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "privacy",
                  email: "privacy@illuxus.com",
                  areaServed: "Worldwide",
                  availableLanguage: ["English"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "grievance officer",
                  email: "grievance@illuxus.com",
                  areaServed: "IN",
                  availableLanguage: ["English", "Hindi"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "press",
                  email: "press@illuxus.com",
                  areaServed: "Worldwide",
                  availableLanguage: ["English"],
                },
                {
                  "@type": "ContactPoint",
                  contactType: "legal",
                  email: "legal@illuxus.com",
                  areaServed: "IN",
                  availableLanguage: ["English"],
                },
              ],
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://illuxus.com/" },
                { "@type": "ListItem", position: 2, name: "Contact", item: "https://illuxus.com/contact" },
              ],
            },
          ],
        }}
      />
      {/* Header is hidden in print mode so the PDF only shows the confirmation. */}
      <div className="print:hidden">
        <SiteHeader />
      </div>

      {/* Hero */}
      <section className="pt-24 pb-12 text-center px-4 print:hidden">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Contact</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Get in touch</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          We're a small, responsive team. Expect a reply within one business day — usually much
          sooner.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 print:max-w-none print:grid-cols-1 print:gap-0 print:pb-0">
        {/* Contact options */}
        <div className="space-y-6 print:hidden">
          <h2 className="text-xl font-semibold">How can we help?</h2>
          <div className="space-y-3">
            {contactOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <a
                  key={opt.title}
                  href={opt.href}
                  onClick={(e) => handleOptionClick(e, opt)}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {opt.title}
                    </h3>
                    <p className="text-[13px] text-muted-foreground mt-0.5">{opt.description}</p>
                    <p className="text-[13px] text-primary mt-1 font-medium truncate">{opt.contact}</p>
                  </div>
                </a>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Office hours</h3>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Monday – Friday: 9:00 – 19:00 IST<br />
              Saturday: 10:00 – 14:00 IST<br />
              Sunday: Closed (security and billing escalations are still monitored)
            </p>
          </div>
        </div>

        {/* Contact form OR success screen */}
        <div
          id="contact-form-card"
          className="bg-card border border-border rounded-2xl p-7 self-start print:border-0 print:rounded-none print:p-0 print:bg-transparent"
        >
          {result ? (
            <TicketSuccess result={result} onReset={resetForm} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold mb-2">Send us a message</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[12px]">Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Raj Sharma"
                    required
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px]">Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="raj@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((f) => ({ ...f, category: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Subject</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="How do I set up a webinar?"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Message *</Label>
                <Textarea
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Tell us what's on your mind…"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Send message"}
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                By submitting this form you agree to the processing of your personal data as
                described in our{" "}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. A
                copy of your message will be emailed to you with a ticket number for tracking.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* The rest of the page is hidden when the user prints the confirmation. */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        {/* Registered office */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Registered office</h2>
          </div>
          <div className="space-y-3 text-[13px] text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium">Illuxus Technologies Private Limited</p>
            <p>
              4th Floor, Lighthouse Tower<br />
              Bandra Kurla Complex<br />
              Mumbai – 400 051<br />
              Maharashtra, India
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-border text-[12px]">
              <span className="uppercase tracking-wider text-muted-foreground/70">CIN</span>
              <span className="font-mono">U72200MH2023PTC123456</span>
              <span className="uppercase tracking-wider text-muted-foreground/70">GSTIN</span>
              <span className="font-mono">27ABCDE1234F1Z5</span>
              <span className="uppercase tracking-wider text-muted-foreground/70">PAN</span>
              <span className="font-mono">AABCI1234F</span>
              <span className="uppercase tracking-wider text-muted-foreground/70">Phone</span>
              <span className="font-mono">+91 22 6000 0001</span>
            </div>
          </div>
        </div>

        {/* Grievance Officer */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Grievance Officer</h2>
          </div>
          <div className="space-y-2 text-[13px] text-muted-foreground leading-relaxed">
            <p>
              Appointed in accordance with Rule 3(2)(a) of the IT (Intermediary Guidelines and
              Digital Media Ethics Code) Rules 2021 and Section 8(9) of the DPDPA 2023.
            </p>
            <div className="pt-3 border-t border-border space-y-1">
              <p className="text-foreground font-medium">Rohan Mehta</p>
              <p>Grievance Officer (Privacy & Content)</p>
              <p>
                Email:{" "}
                <a href="mailto:grievance@illuxus.com" className="text-primary hover:underline">
                  grievance@illuxus.com
                </a>
              </p>
              <p>Phone: +91 22 6000 0001 (Mon–Fri, 10:00–18:00 IST)</p>
              <p>
                Post: Grievance Office, Illuxus Technologies Private Limited, 4th Floor, Lighthouse
                Tower, Bandra Kurla Complex, Mumbai – 400 051.
              </p>
            </div>
            <div className="pt-3 border-t border-border text-[12px] space-y-1">
              <p>
                <span className="font-medium text-foreground">Acknowledgement:</span> within 24
                hours of receipt (IT Rules 2021)
              </p>
              <p>
                <span className="font-medium text-foreground">Resolution:</span> within 15 days of
                receipt (DPDPA 2023 + IT Rules 2021)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Map placeholder + socials */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div className="md:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="aspect-[16/9] bg-gradient-to-br from-primary/10 via-muted/40 to-primary/5 flex flex-col items-center justify-center text-center p-8">
            <MapPin className="h-10 w-10 text-primary mb-3" />
            <h3 className="font-semibold mb-1">Find us in Mumbai</h3>
            <p className="text-[13px] text-muted-foreground max-w-sm">
              Bandra Kurla Complex, the financial and corporate hub of Mumbai. Easiest access via
              the Western Express Highway or BKC bus depot.
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold mb-4">Follow along</h3>
          <ul className="space-y-3">
            {socials.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 text-[13px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="text-[12px]">{s.handle}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
            We only post product updates and event recaps. No DMs about deals — those go to
            sales@illuxus.com.
          </p>
        </div>
      </section>

      {/* Print stylesheet: when the user clicks "Download confirmation" we call
          window.print(); the print:* utilities above + this rule ensure only the
          ticket card ends up on the PDF, scaled cleanly to fit the page. */}
      <style>{`
        @media print {
          body { background: white !important; }
          @page { margin: 16mm; }
        }
      `}</style>
    </div>
  );
}

function labelForCategory(value: string): string {
  const found = CATEGORIES.find((c) => c.value === value);
  return found?.label ?? "General enquiry";
}

/**
 * Success screen shown after a ticket is created. Renders the ticket number
 * prominently, links to the public tracking page, and offers a one-click
 * "Download confirmation" that prints the page (the print stylesheet on
 * ContactPage hides everything except this card).
 */
function TicketSuccess({
  result,
  onReset,
}: {
  result: SubmissionResult;
  onReset: () => void;
}) {
  const copyTicket = async () => {
    try {
      await navigator.clipboard.writeText(result.ticketNumber);
      toast.success("Ticket number copied");
    } catch {
      toast.error("Could not copy — long-press to copy manually");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center gap-2 pt-2">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">Ticket created</h3>
        <p className="text-[13px] text-muted-foreground max-w-sm">
          Save the ticket number below. We've also emailed a copy with a tracking link to{" "}
          <span className="font-medium text-foreground">{result.emailUsed}</span>.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Your ticket number
        </p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-2xl sm:text-3xl font-bold font-mono tracking-tight">
            {result.ticketNumber}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={copyTicket}
            aria-label="Copy ticket number"
            className="h-8 w-8 print:hidden"
          >
            <CopyIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-1.5 text-[13px]">
        <p className="text-muted-foreground">
          <span className="uppercase tracking-wider text-[11px] text-muted-foreground/70">Category</span>
          <br />
          <span className="text-foreground">{labelForCategory(result.categoryUsed)}</span>
        </p>
        <p className="text-muted-foreground pt-1">
          <span className="uppercase tracking-wider text-[11px] text-muted-foreground/70">Subject</span>
          <br />
          <span className="text-foreground">{result.subjectUsed}</span>
        </p>
        <p className="text-muted-foreground pt-1">
          <span className="uppercase tracking-wider text-[11px] text-muted-foreground/70">Submitted by</span>
          <br />
          <span className="text-foreground">
            {result.nameUsed} · {result.emailUsed}
          </span>
        </p>
      </div>

      {!result.emailDelivered && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300 print:hidden">
          Your ticket was saved, but the confirmation email is queued and may be delayed. You can
          still track it using the link below.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
        <Button asChild className="w-full">
          <Link to={`/support/ticket/${encodeURIComponent(result.ticketNumber)}?email=${encodeURIComponent(result.emailUsed)}`}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Track your ticket
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => window.print()}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Download confirmation
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center print:hidden">
        Reference this ticket in any follow-up emails so we can find your conversation quickly.
      </p>

      <div className="text-center print:hidden">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Send another message
        </Button>
      </div>
    </div>
  );
}
