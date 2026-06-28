import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
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

const contactOptions = [
  {
    icon: Mail,
    title: "General enquiries",
    description: "Questions about the platform, pricing, or anything else.",
    contact: "hello@illuxus.com",
    href: "mailto:hello@illuxus.com",
  },
  {
    icon: MessageSquare,
    title: "Sales & Enterprise",
    description: "Large events, custom contracts, white-label solutions.",
    contact: "sales@illuxus.com",
    href: "mailto:sales@illuxus.com",
  },
  {
    icon: HeadphonesIcon,
    title: "Support",
    description: "Technical help, billing issues, or account problems.",
    contact: "support@illuxus.com",
    href: "mailto:support@illuxus.com",
  },
  {
    icon: Shield,
    title: "Privacy & DPO",
    description: "Data subject requests, privacy questions, DPDPA / GDPR matters.",
    contact: "privacy@illuxus.com",
    href: "mailto:privacy@illuxus.com",
  },
  {
    icon: ShieldAlert,
    title: "Grievance Officer",
    description: "Content takedowns, privacy grievances, IT Rules 2021 complaints.",
    contact: "grievance@illuxus.com",
    href: "mailto:grievance@illuxus.com",
  },
  {
    icon: Newspaper,
    title: "Press & media",
    description: "Interviews, quotes, brand assets, partnership announcements.",
    contact: "press@illuxus.com",
    href: "mailto:press@illuxus.com",
  },
  {
    icon: Scale,
    title: "Legal",
    description: "Contracts, notices, dispute resolution, subpoenas.",
    contact: "legal@illuxus.com",
    href: "mailto:legal@illuxus.com",
  },
];

const socials = [
  { icon: Linkedin, label: "LinkedIn", href: "https://www.linkedin.com/company/illuxus", handle: "/illuxus" },
  { icon: Twitter, label: "X (Twitter)", href: "https://x.com/illuxus_in", handle: "@illuxus_in" },
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/illuxus.in", handle: "@illuxus.in" },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSending(true);
    // In production this would POST to an edge function / email provider.
    // For now we simulate a short delay and show a success message.
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="pt-24 pb-12 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Contact</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Get in touch</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          We're a small, responsive team. Expect a reply within one business day — usually much
          sooner.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Contact options */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">How can we help?</h2>
          <div className="space-y-3">
            {contactOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <a
                  key={opt.title}
                  href={opt.href}
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

        {/* Contact form */}
        <div className="bg-card border border-border rounded-2xl p-7 self-start">
          {sent ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <h3 className="text-xl font-semibold">Message sent!</h3>
              <p className="text-muted-foreground text-[14px]">
                Thanks for reaching out. We'll get back to you within one business day.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSent(false);
                  setForm({ name: "", email: "", subject: "", message: "" });
                }}
              >
                Send another message
              </Button>
            </div>
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
                  />
                </div>
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
                <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Registered office + Grievance Officer */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 grid grid-cols-1 md:grid-cols-2 gap-6">
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
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
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

    </div>
  );
}
