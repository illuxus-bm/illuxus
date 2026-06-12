import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  BookOpen, MessageCircle, HelpCircle, ExternalLink,
  ChevronRight, Mail, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { uuid } from "@/lib/uuid";

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How do I create my first event?",
    a: "Go to Events in the sidebar and click the '+ New Event' button. Fill in the event title, format (physical / virtual / hybrid), date/time, and location. You can also set a ticket price, capacity limit, and whether registrations require approval.",
  },
  {
    q: "How do I publish an event so attendees can register?",
    a: "Open the event from your dashboard and click the 'Publish' button in the top-right header. Once published, a public landing page is live at your org URL. You can unpublish at any time from the same button.",
  },
  {
    q: "How do I check attendees in and out at the event?",
    a: "Open the event → Registrations tab and click QR Scanner. The scanner has two tabs at the top — Check-In and Check-Out — and the same QR per participant works for both. Staff at the entrance keep the Check-In tab active; staff at the exit switch to the Check-Out tab. Bulk Check-In and the toggle on each attendee row still work as before for manual updates. Self-check-in at /checkin/:eventId is check-in only — attendees can mark themselves as arrived but not as departed.",
  },
  {
    q: "How do I invite team members to my organization?",
    a: "Go to Settings → Team tab. Click 'Invite', enter the teammate's email and choose a role (Admin / Member / Viewer). They will receive an invitation they can accept.",
  },
  {
    q: "Can I customise my event's landing page?",
    a: "Yes. Open an event → Design tab. You can change the theme colours, fonts, section order, banner images, and cover photo. Changes are saved and the live page updates when you click 'Update'.",
  },
  {
    q: "How does the webinar/livestream feature work?",
    a: "Open an event → Webinar (sidebar). Create a webinar room, then click 'Go live'. Up to 10 speakers can publish video. Attendees join via the public event URL. You can record sessions, send announcements, manage Q&A, and run polls — all from the webinar studio.",
  },
  {
    q: "How do I add sponsors to my event?",
    a: "Open an event → Sponsors tab. Click 'Add Sponsor', fill in the sponsor name, logo, website, and tier. You can also invite sponsor team members who get a read-only sponsor portal view of registrant and attendance data.",
  },
  {
    q: "How do I export attendee data?",
    a: "Go to Reports in the sidebar. Use the Filters to scope to a specific event, then click 'Export CSV' on the All Registrations table. You can also export per-event data from the event's Reports tab.",
  },
  {
    q: "What happens if I downgrade my plan?",
    a: "Your existing events and data are never deleted. Features beyond your new plan's limits (e.g., additional events, team members) become read-only until you upgrade again.",
  },
  {
    q: "How do I set a custom domain for my organization page?",
    a: "Go to Domains in the sidebar. Set a workspace handle (used as the public URL path) and optionally configure a custom domain by pointing a CNAME record to our servers. The Domains page shows the exact DNS records you need.",
  },
];

// ─── Docs links ───────────────────────────────────────────────────────────────

const DOC_LINKS = [
  { label: "Getting Started Guide",          href: "https://docs.illuxus.com/getting-started" },
  { label: "Event Setup & Configuration",    href: "https://docs.illuxus.com/events"          },
  { label: "Registrations & Check-in",       href: "https://docs.illuxus.com/registrations"  },
  { label: "Webinar & Livestream",           href: "https://docs.illuxus.com/webinar"         },
  { label: "Sponsors & Exhibitors",          href: "https://docs.illuxus.com/sponsors"        },
  { label: "Marketing & Email Campaigns",    href: "https://docs.illuxus.com/marketing"       },
  { label: "Badge Design & Printing",        href: "https://docs.illuxus.com/badges"          },
  { label: "Team & Role Management",         href: "https://docs.illuxus.com/team"            },
  { label: "Custom Domains",                 href: "https://docs.illuxus.com/domains"         },
  { label: "API & Embed Widget",             href: "https://docs.illuxus.com/api"             },
];

// ─── Component ────────────────────────────────────────────────────────────────

const HelpPage = () => {
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSupportSubmit = async () => {
    if (!supportSubject.trim()) { toast.error("Please enter a subject"); return; }
    if (!supportBody.trim())    { toast.error("Please describe your issue"); return; }

    setSubmitting(true);
    try {
      // Log to audit_logs so the admin panel can see it,
      // and attempt to send via the email edge function if available.
      await supabase.from("audit_logs").insert({
        action:      "support_request",
        actor_id:    user?.id   ?? null,
        actor_email: user?.email ?? null,
        details: {
          subject: supportSubject.trim(),
          body:    supportBody.trim(),
        },
      });

      // Best-effort: invoke edge function for actual email delivery.
      await supabase.functions.invoke("send-event-email", {
        body: {
          event_id:        "support",
          email_id:        uuid(),
          subject:         `[Support] ${supportSubject.trim()}`,
          body:            `From: ${user?.email ?? "unknown"}\n\n${supportBody.trim()}`,
          recipient_emails: ["support@illuxus.com"],
        },
      }).catch(() => { /* non-fatal if function not deployed */ });

      toast.success("Support request submitted. We'll get back to you within 24 hours.");
      setSupportOpen(false);
      setSupportSubject("");
      setSupportBody("");
    } catch {
      toast.error("Could not submit request. Please email support@illuxus.com directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[860px]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Help & Support</h1>
          <p className="text-[13px] text-muted-foreground">
            Browse guides, find answers, or contact the team
          </p>
        </div>

        {/* ── Three action cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Documentation */}
          <a
            href="https://docs.illuxus.com"
            target="_blank"
            rel="noreferrer"
            className="bg-card border border-border rounded-lg p-5 hover:border-primary/40 hover:bg-muted/30 transition-colors group"
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
              <BookOpen className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
              Documentation
              <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Browse full guides, API reference, and tutorials
            </p>
          </a>

          {/* Contact Support */}
          <button
            onClick={() => setSupportOpen(true)}
            className="bg-card border border-border rounded-lg p-5 hover:border-primary/40 hover:bg-muted/30 transition-colors text-left group w-full"
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
              <MessageCircle className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
              Contact Support
              <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Send a message and we'll reply within 24 hours
            </p>
          </button>

          {/* FAQ — scrolls down */}
          <button
            onClick={() => document.getElementById("faq-section")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-card border border-border rounded-lg p-5 hover:border-primary/40 hover:bg-muted/30 transition-colors text-left group w-full"
          >
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
              <HelpCircle className="h-4.5 w-4.5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
              FAQ
              <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Answers to the most common questions
            </p>
          </button>
        </div>

        {/* ── Quick doc links ── */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Quick Links
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {DOC_LINKS.map((d) => (
              <a
                key={d.label}
                href={d.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-2 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors group"
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                {d.label}
                <ExternalLink className="h-3 w-3 ml-auto shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
            ))}
          </div>
        </div>

        {/* ── FAQ accordion ── */}
        <div id="faq-section" className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" /> Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="space-y-1">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border rounded-lg px-4 data-[state=open]:bg-muted/30 transition-colors"
              >
                <AccordionTrigger className="text-[13px] font-medium py-3 hover:no-underline text-left">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-[13px] text-muted-foreground leading-relaxed pb-3">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* ── Still stuck ── */}
        <div className="rounded-lg border border-border bg-muted/30 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Still need help?</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Our support team is available Monday – Friday, 9 am – 6 pm IST.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[13px] gap-1.5"
              asChild
            >
              <a href="mailto:support@illuxus.com">
                <Mail className="h-3.5 w-3.5" /> Email us
              </a>
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px] gap-1.5"
              onClick={() => setSupportOpen(true)}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Open a ticket
            </Button>
          </div>
        </div>
      </div>

      {/* ── Contact Support Dialog ── */}
      <Dialog open={supportOpen} onOpenChange={(o) => { setSupportOpen(o); if (!o) { setSupportSubject(""); setSupportBody(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Contact Support</DialogTitle>
            <DialogDescription className="text-[13px]">
              Describe your issue and we'll get back to you within 24 hours.
              {user?.email && (
                <span className="block mt-1 font-medium text-foreground">Reply will go to {user.email}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-[12px]">Subject</Label>
              <Input
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                className="h-8 text-[13px] mt-1"
                placeholder="Briefly describe your issue…"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-[12px]">Details</Label>
              <Textarea
                value={supportBody}
                onChange={(e) => setSupportBody(e.target.value)}
                className="text-[13px] mt-1 min-h-[130px] resize-none"
                placeholder="Tell us what happened, what you expected, and any error messages you saw…"
              />
            </div>
            <div className="flex gap-2 pt-1 justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[13px]"
                onClick={() => setSupportOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-[13px] gap-1.5"
                onClick={handleSupportSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</>
                  : <><Mail className="h-3.5 w-3.5" /> Send Request</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default HelpPage;
