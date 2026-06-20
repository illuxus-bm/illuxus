import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSpeakerEventDetails } from "@/hooks/useSpeakerEvents";
import { FullPageLoader } from "@/components/FullPageLoader";
import SiteHeader from "@/components/SiteHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Calendar, MapPin, Building2, Mic, Users, CheckCircle2,
  ExternalLink, Linkedin, Globe, Briefcase, Clock,
} from "lucide-react";

export default function SpeakerEventDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const { eventId } = useParams<{ eventId: string }>();
  const { data, isLoading, error } = useSpeakerEventDetails(eventId);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?redirect=/speaker/events/${eventId}`} replace />;

  // Access control: if RPC returns null, the user is not assigned as a speaker for this event
  if (!isLoading && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <Mic className="h-10 w-10 mx-auto text-destructive/60 mb-3" />
          <h1 className="text-base font-semibold">403 — Access Denied</h1>
          <p className="text-[13px] text-muted-foreground mt-2">
            You are not assigned as a speaker for this event, or it doesn't exist.
          </p>
          <Link
            to="/speaker"
            className="inline-block mt-4 text-[13px] text-primary hover:underline"
          >
            ← Back to your speaking events
          </Link>
        </div>
      </div>
    );
  }

  const event = data?.event;
  const speaker = data?.speaker;
  const sessions = data?.sessions ?? [];
  const analytics = data?.analytics;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <Link
            to="/speaker"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Speaking events
          </Link>
          {event?.slug && (
            <Link
              to={`/events/${event.slug}`}
              className="text-[12px] text-primary hover:underline flex items-center gap-1"
            >
              View public page <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4 text-[13px] text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isLoading ? (
          <>
            <Skeleton className="h-48 rounded-lg" />
            <div className="grid lg:grid-cols-3 gap-6">
              <Skeleton className="h-64 rounded-lg lg:col-span-2" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          </>
        ) : (
          <>
            {/* Event hero */}
            {event && (
              <section className="border border-border rounded-lg overflow-hidden bg-card">
                {(event.banner_landscape_url || event.image_url) && (
                  <div className="aspect-[3/1] bg-muted">
                    <img
                      src={event.banner_landscape_url || event.image_url || ""}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <h1 className="text-2xl font-bold">{event.title}</h1>
                  {event.description && (
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{event.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground pt-2">
                    {event.date && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(event.date).toLocaleString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                          year: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </span>
                    )}
                    {(event.venue || event.location) && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.venue || event.location}
                      </span>
                    )}
                    {event.organizer_name && (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {event.organizer_name}
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                        event.status === "published"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {event.status}
                    </span>
                  </div>
                </div>
              </section>
            )}

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left column — sessions + analytics */}
              <div className="lg:col-span-2 space-y-6">
                {/* Sessions */}
                <section className="border border-border rounded-lg bg-card">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <Mic className="h-4 w-4 text-primary" /> Your Sessions
                    </h2>
                    <span className="text-[12px] text-muted-foreground">{sessions.length} total</span>
                  </div>
                  {sessions.length === 0 ? (
                    <p className="p-8 text-center text-[13px] text-muted-foreground">
                      No sessions assigned to you yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {sessions.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        const isPast = end < new Date();
                        return (
                          <div key={s.id} className="p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-[14px]">{s.title}</p>
                                {s.description && (
                                  <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
                                    {s.description}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                  isPast
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-primary/15 text-primary"
                                }`}
                              >
                                {s.session_type}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground mt-2">
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3" />
                                {start.toLocaleString("en-US", {
                                  month: "short", day: "numeric",
                                  hour: "numeric", minute: "2-digit",
                                })}
                                {" - "}
                                {end.toLocaleTimeString("en-US", {
                                  hour: "numeric", minute: "2-digit",
                                })}
                              </span>
                              {s.location && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-3 w-3" />
                                  {s.location}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Audience analytics */}
                {analytics && (
                  <section className="border border-border rounded-lg bg-card">
                    <div className="p-4 border-b border-border">
                      <h2 className="text-sm font-semibold">Audience</h2>
                      <p className="text-[12px] text-muted-foreground">
                        Live registration and check-in stats for this event
                      </p>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <StatBlock
                        icon={Users}
                        label="Total registrations"
                        value={analytics.total_registrations}
                      />
                      <StatBlock
                        icon={CheckCircle2}
                        label="Checked in"
                        value={analytics.checked_in_count}
                        accent="text-emerald-600"
                      />
                    </div>
                  </section>
                )}
              </div>

              {/* Right column — speaker profile */}
              <aside>
                {speaker && (
                  <section className="border border-border rounded-lg bg-card sticky top-20">
                    <div className="p-5 text-center border-b border-border">
                      {speaker.photo_url ? (
                        <img
                          src={speaker.photo_url}
                          alt={speaker.name}
                          className="h-20 w-20 rounded-full object-cover mx-auto ring-2 ring-border"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto text-2xl font-semibold text-muted-foreground">
                          {speaker.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="font-semibold text-base mt-3">{speaker.name}</p>
                      {speaker.designation && (
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {speaker.designation}
                        </p>
                      )}
                      {speaker.company && (
                        <p className="text-[12px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                          <Briefcase className="h-3 w-3" />
                          {speaker.company}
                        </p>
                      )}
                    </div>

                    {speaker.bio && (
                      <div className="p-5 border-b border-border">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                          Bio
                        </p>
                        <p className="text-[13px] leading-relaxed">{speaker.bio}</p>
                      </div>
                    )}

                    {(speaker.linkedin_url || speaker.company_website) && (
                      <div className="p-5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
                          Links
                        </p>
                        <div className="space-y-2">
                          {speaker.linkedin_url && (
                            <a
                              href={speaker.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-[13px] hover:text-primary transition-colors"
                            >
                              <Linkedin className="h-3.5 w-3.5" />
                              LinkedIn
                              <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                            </a>
                          )}
                          {speaker.company_website && (
                            <a
                              href={speaker.company_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-[13px] hover:text-primary transition-colors"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              Website
                              <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatBlock({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={`h-3 w-3 ${accent ?? ""}`} />
        {label}
      </div>
      <p className={`text-xl font-semibold mt-0.5 ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
