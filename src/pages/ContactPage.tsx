import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, Clock, CheckCircle2 } from "lucide-react";

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
    icon: Clock,
    title: "Support",
    description: "Technical help, billing issues, or account problems.",
    contact: "support@illuxus.com",
    href: "mailto:support@illuxus.com",
  },
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
          We're a small, responsive team. Expect a reply within one business day — usually much sooner.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Contact options */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">How can we help?</h2>
          {contactOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <a
                key={opt.title}
                href={opt.href}
                className="flex items-start gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors group"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">{opt.title}</h3>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{opt.description}</p>
                  <p className="text-[13px] text-primary mt-1 font-medium">{opt.contact}</p>
                </div>
              </a>
            );
          })}

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold mb-1">Office hours</h3>
            <p className="text-[13px] text-muted-foreground">
              Monday – Friday: 9 AM – 7 PM IST<br />
              Saturday: 10 AM – 2 PM IST<br />
              Sunday: Closed (but we check emails!)
            </p>
          </div>
        </div>

        {/* Contact form */}
        <div className="bg-card border border-border rounded-2xl p-7">
          {sent ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-12">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <h3 className="text-xl font-semibold">Message sent!</h3>
              <p className="text-muted-foreground text-[14px]">
                Thanks for reaching out. We'll get back to you within one business day.
              </p>
              <Button variant="outline" onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}>
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
            </form>
          )}
        </div>
      </section>

    </div>
  );
}
