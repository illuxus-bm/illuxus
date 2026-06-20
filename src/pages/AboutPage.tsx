import { Link } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Heart, Rocket, Globe, Users } from "lucide-react";

const values = [
  {
    icon: Heart,
    title: "Organiser-first",
    description:
      "Every feature we ship is driven by real feedback from event organisers. We sit in your shoes before we write a single line of code.",
  },
  {
    icon: Globe,
    title: "Built for India and beyond",
    description:
      "We started in India knowing the unique needs of desi events — multilingual, high-volume, tight budgets. We've designed for that reality from day one.",
  },
  {
    icon: Rocket,
    title: "Move fast, ship quality",
    description:
      "We iterate fast but never at the cost of reliability. 99.9% uptime is a promise, not a marketing bullet point.",
  },
  {
    icon: Users,
    title: "Community matters",
    description:
      "Events are about people. We believe the connections formed at an event should outlast the event itself — that's why every event gets its own community space.",
  },
];

const timeline = [
  { year: "2023", title: "The idea", body: "Founded in Mumbai after a series of painful conference check-ins and broken spreadsheets. We knew there had to be a better way." },
  { year: "2024 Q1", title: "Private beta", body: "Launched with 10 event organisers in Mumbai and Pune. Processed our first 5,000 tickets and learned that QR speed matters more than we thought." },
  { year: "2024 Q3", title: "Speaker & webinar launch", body: "Shipped built-in speaker management and a live webinar studio powered by Agora. Organisers no longer needed Zoom just to host a panel." },
  { year: "2025", title: "Community & growth", body: "Rolled out event communities, WhatsApp messaging, advanced analytics, and opened to organisers across India and Southeast Asia." },
  { year: "2026", title: "Scale & enterprise", body: "Enterprise tier launched. Illuxus now powers conferences with 10,000+ attendees, hackathons, music festivals, and online summits." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="pt-24 pb-16 text-center px-4">
        <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">About us</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
          We're on a mission to make<br className="hidden sm:block" /> every event extraordinary
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Illuxus is a modern, all-in-one event management platform built by a team that has organized, attended, and struggled through hundreds of events. We got tired of juggling five tools. So we built one.
        </p>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "50,000+", label: "Tickets processed" },
            { value: "1,200+", label: "Events hosted" },
            { value: "30+", label: "Cities" },
            { value: "99.9%", label: "Uptime" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-6">
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="text-[13px] text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Story */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-2xl font-bold mb-6">Our story</h2>
        <div className="relative border-l border-border pl-8 space-y-10">
          {timeline.map((item) => (
            <div key={item.year} className="relative">
              <span className="absolute -left-10 top-0.5 h-4 w-4 rounded-full bg-primary border-2 border-background" />
              <p className="text-xs font-mono text-primary mb-1">{item.year}</p>
              <h3 className="font-semibold mb-1">{item.title}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="bg-muted/30 border-y border-border py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">What we stand for</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="bg-card border border-border rounded-2xl p-6 flex gap-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{v.title}</h3>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{v.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team note */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">Built by a small, focused team</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          We're a lean team of engineers, designers, and event enthusiasts based in Mumbai. We're not backed by a VC mandate to bloat the product — just a genuine desire to make event management less painful. Every feature request is read, every bug report is taken seriously.
        </p>
        <Button asChild>
          <Link to="/contact">Say hello →</Link>
        </Button>
      </section>

      <Footer />
    </div>
  );
}
