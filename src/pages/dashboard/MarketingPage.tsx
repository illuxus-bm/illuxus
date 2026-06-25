import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Mail, Share2, Globe, Plus, Send, Loader2, Copy, Check,
  Twitter, Linkedin, Facebook, Link2, ExternalLink, Megaphone,
  Users, Clock, CheckCircle, MessageSquare, Trash2, BarChart3,
  ArrowRight, Layout,
} from "lucide-react";
import { publicUrl } from "@/lib/publicUrl";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventOption {
  id: string;
  title: string;
  slug: string;
  org_id: string | null;
  status: string;
}

interface EmailMessage {
  id: string;
  subject: string;
  recipients: string;
  recipient_filter: string;
  status: "sent" | "draft";
  sent_at: string | null;
  body: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RECIPIENT_LABELS: Record<string, string> = {
  all: "All Registrants",
  confirmed: "Confirmed Only",
  speakers: "Speakers",
  waitlist: "Waitlist",
};

const statusStyle: Record<string, string> = {
  sent: "bg-green-500/10 text-green-600 border-green-500/20",
  draft: "bg-muted text-muted-foreground border-border",
};

function buildShareText(event: EventOption, orgSlug: string | null) {
  const path = orgSlug
    ? `/org/${orgSlug}/events/${event.slug}`
    : `/events/${event.slug}`;
  return {
    url: publicUrl(path),
    twitter: `Check out "${event.title}" — join me! ${publicUrl(path)}`,
    linkedin: `I'm attending "${event.title}". Secure your spot here: ${publicUrl(path)}`,
    facebook: publicUrl(path),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Stat card used in Email Campaigns header */
function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

// ─── Email Campaigns Tab ──────────────────────────────────────────────────────

function EmailCampaignsTab() {
  const { user } = useAuth();
  const { org } = useOrg();

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Load org events
  useEffect(() => {
    if (!org) return;
    supabase
      .from("events")
      .select("id, title, slug, org_id, status")
      .eq("org_id", org.id)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as EventOption[]) || []);
        if (data && data.length > 0) setSelectedEventId(data[0].id);
      });
  }, [org]);

  // Load messages for selected event
  useEffect(() => {
    if (!selectedEventId) return;
    setLoadingMsgs(true);
    supabase
      .from("event_emails")
      .select("*")
      .eq("event_id", selectedEventId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setMessages((data || []) as EmailMessage[]);
        setLoadingMsgs(false);
      });

    const ch = supabase
      .channel(`mkt-emails-${selectedEventId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "event_emails",
        filter: `event_id=eq.${selectedEventId}`,
      }, () => {
        supabase
          .from("event_emails")
          .select("*")
          .eq("event_id", selectedEventId)
          .order("created_at", { ascending: false })
          .then(({ data }) => setMessages((data || []) as EmailMessage[]));
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [selectedEventId]);

  const resetCompose = () => { setSubject(""); setBody(""); setRecipientFilter("all"); };

  const getRecipientEmails = async (filterParam: string = recipientFilter): Promise<string[]> => {
    if (filterParam === "speakers") {
      const { data: rels } = await supabase
        .from("event_speakers").select("speaker_id").eq("event_id", selectedEventId);
      const ids = (rels || []).map((r) => r.speaker_id);
      if (!ids.length) return [];
      const { data: spks } = await supabase
        .from("speakers").select("email").in("id", ids);
      return (spks || []).map((s) => s.email).filter(Boolean) as string[];
    }
    let q = supabase.from("registrations").select("email").eq("event_id", selectedEventId);
    if (filterParam === "confirmed") q = q.eq("approval_status", "approved");
    if (filterParam === "waitlist") q = q.eq("status", "waitlist");
    const { data } = await q;
    return (data || []).map((r) => r.email).filter(Boolean);
  };

  // Send a previously-saved draft
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const sendDraft = async (msg: EmailMessage) => {
    if (sendingDraftId) return;
    if (!msg.body?.trim()) {
      toast.error("Draft has no body — edit it first");
      return;
    }
    setSendingDraftId(msg.id);
    try {
      const emails = await getRecipientEmails(msg.recipient_filter);
      if (!emails.length) {
        toast.error("No recipients found for this draft");
        return;
      }

      const { error: fnErr } = await supabase.functions.invoke("send-event-email", {
        body: {
          event_id: selectedEventId,
          email_id: msg.id,
          subject: msg.subject,
          body: msg.body,
          recipient_emails: emails,
        },
      });

      if (fnErr) {
        toast.warning("Email recorded but not delivered — no email provider is configured.");
        return;
      }

      await supabase
        .from("event_emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      toast.success(`Sent to ${emails.length} recipient${emails.length !== 1 ? "s" : ""}`);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: "sent", sent_at: new Date().toISOString() } : m))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send draft");
    } finally {
      setSendingDraftId(null);
    }
  };

  const handleSend = async () => {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!body.trim()) { toast.error("Message body is required"); return; }
    if (!selectedEventId) { toast.error("Select an event first"); return; }
    setSending(true);
    try {
      const emails = await getRecipientEmails();
      if (!emails.length) { toast.error("No recipients match the selected filter"); setSending(false); return; }

      const { data: record, error: insertErr } = await supabase
        .from("event_emails")
        .insert({
          event_id: selectedEventId,
          subject: subject.trim(),
          body: body.trim(),
          recipient_filter: recipientFilter,
          recipients: RECIPIENT_LABELS[recipientFilter] || recipientFilter,
          status: "sent",
          sent_at: new Date().toISOString(),
          created_by: user?.id,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      const { error: fnErr } = await supabase.functions.invoke("send-event-email", {
        body: {
          event_id: selectedEventId,
          email_id: record.id,
          subject: subject.trim(),
          body: body.trim(),
          recipient_emails: emails,
        },
      });

      if (fnErr) {
        await supabase.from("event_emails").update({ status: "draft" }).eq("id", record.id);
        toast.warning("Saved but email delivery failed. Check your email settings.");
      } else {
        toast.success(`Sent to ${emails.length} recipient${emails.length !== 1 ? "s" : ""}`);
      }
      setComposeOpen(false);
      resetCompose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!selectedEventId) { toast.error("Select an event first"); return; }
    setSavingDraft(true);
    const { error } = await supabase.from("event_emails").insert({
      event_id: selectedEventId,
      subject: subject.trim(),
      body: body.trim(),
      recipient_filter: recipientFilter,
      recipients: RECIPIENT_LABELS[recipientFilter] || recipientFilter,
      status: "draft",
      sent_at: null,
      created_by: user?.id,
    });
    setSavingDraft(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Draft saved");
    setComposeOpen(false);
    resetCompose();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("event_emails").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Message deleted");
  };

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === "sent").length,
    drafts: messages.filter((m) => m.status === "draft").length,
  };

  return (
    <div className="space-y-5">
      {/* Intro + Compose */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Email Campaigns</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Send targeted emails to your event registrants, confirmed attendees, speakers, or waitlist.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-[13px]"
          onClick={() => setComposeOpen(true)}
          disabled={!selectedEventId}
        >
          <Plus className="h-3.5 w-3.5" /> Compose
        </Button>
      </div>

      {/* Event selector */}
      {events.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-muted-foreground shrink-0">Event:</Label>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="h-8 text-[13px] w-full sm:w-[260px]">
              <SelectValue placeholder="Select event…" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-[13px]">
                  {e.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No events yet</p>
          <p className="text-[13px] text-muted-foreground mb-4">Create an event first to send email campaigns.</p>
          <Button size="sm" asChild variant="outline">
            <Link to="/dashboard/events/new"><Plus className="h-3.5 w-3.5 mr-1.5" /> Create Event</Link>
          </Button>
        </div>
      )}

      {events.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={MessageSquare} label="Total" value={stats.total} />
            <StatCard icon={CheckCircle} label="Sent" value={stats.sent} color="text-green-600" />
            <StatCard icon={Clock} label="Drafts" value={stats.drafts} color="text-muted-foreground" />
          </div>

          {/* Messages */}
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <Mail className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No campaigns yet</p>
              <p className="text-[13px] text-muted-foreground">
                Click "Compose" to send your first email to attendees.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="bg-card border border-border rounded-lg p-4 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[13px] font-semibold truncate">{msg.subject}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {msg.recipients}
                        </span>
                        {msg.sent_at && (
                          <span>
                            {new Date(msg.sent_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      {msg.body && (
                        <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-1">{msg.body}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${statusStyle[msg.status] ?? ""}`}>
                        {msg.status}
                      </span>
                      {msg.status === "draft" && (
                        <Button
                          size="sm"
                          className="h-7 text-[12px] gap-1"
                          onClick={() => sendDraft(msg)}
                          disabled={sendingDraftId === msg.id || !msg.body?.trim()}
                        >
                          {sendingDraftId === msg.id ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</>
                          ) : (
                            <><Send className="h-3 w-3" /> Send</>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(msg.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) resetCompose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Compose Email</DialogTitle>
            <DialogDescription className="text-[13px]">
              Send an email to attendees of{" "}
              <span className="font-medium text-foreground">
                {events.find((e) => e.id === selectedEventId)?.title || "your event"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-[12px]">Recipients</Label>
              <Select value={recipientFilter} onValueChange={setRecipientFilter}>
                <SelectTrigger className="h-8 text-[13px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Registrants</SelectItem>
                  <SelectItem value="confirmed">Confirmed Only</SelectItem>
                  <SelectItem value="waitlist">Waitlist</SelectItem>
                  <SelectItem value="speakers">Speakers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-8 text-[13px] mt-1"
                placeholder="Enter email subject…"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-[12px]">Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="text-[13px] mt-1 min-h-[140px] resize-none"
                placeholder="Write your message to attendees…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-[13px] gap-1.5"
                onClick={handleSend}
                disabled={sending || savingDraft}
              >
                {sending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  : <><Send className="h-3.5 w-3.5" /> Send Now</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[13px]"
                onClick={handleSaveDraft}
                disabled={sending || savingDraft}
              >
                {savingDraft ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[13px] ml-auto"
                onClick={() => { setComposeOpen(false); resetCompose(); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Social Sharing Tab ───────────────────────────────────────────────────────

function SocialSharingTab() {
  const { org } = useOrg();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    supabase
      .from("events")
      .select("id, title, slug, org_id, status")
      .eq("org_id", org.id)
      .eq("status", "published")
      .order("date", { ascending: false })
      .then(({ data }) => {
        const evs = (data as EventOption[]) || [];
        setEvents(evs);
        if (evs.length > 0) setSelectedEventId(evs[0].id);
      });
  }, [org]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const orgSlug = (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
  const share = selectedEvent ? buildShareText(selectedEvent, orgSlug) : null;

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={() => copyText(text, id)}
      title="Copy"
    >
      {copied === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Social Sharing</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Generate shareable links and ready-to-post captions for your events.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Share2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No published events</p>
          <p className="text-[13px] text-muted-foreground mb-4">
            Publish an event to generate shareable links.
          </p>
          <Button size="sm" asChild variant="outline">
            <Link to="/dashboard"><ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Go to Events</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Event picker */}
          {events.length > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-[12px] text-muted-foreground shrink-0">Event:</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="h-8 text-[13px] w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-[13px]">{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {share && (
            <div className="space-y-3">
              {/* Direct link */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <Link2 className="h-4 w-4 text-primary" /> Direct Link
                </div>
                <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2">
                  <span className="text-[12px] font-mono text-muted-foreground flex-1 truncate">{share.url}</span>
                  <CopyBtn text={share.url} id="direct" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" asChild title="Open">
                    <a href={share.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Social captions */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    id: "twitter",
                    icon: Twitter,
                    label: "X / Twitter",
                    text: share.twitter,
                    color: "text-sky-500",
                    href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(share.twitter)}`,
                  },
                  {
                    id: "linkedin",
                    icon: Linkedin,
                    label: "LinkedIn",
                    text: share.linkedin,
                    color: "text-blue-600",
                    href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.url)}`,
                  },
                  {
                    id: "facebook",
                    icon: Facebook,
                    label: "Facebook",
                    text: share.facebook,
                    color: "text-blue-500",
                    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`,
                  },
                ].map((s) => (
                  <div key={s.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
                    <div className={`flex items-center gap-2 text-[13px] font-medium ${s.color}`}>
                      <s.icon className="h-4 w-4" /> {s.label}
                    </div>
                    <div className="bg-muted/40 rounded-md px-3 py-2 text-[12px] text-muted-foreground leading-relaxed">
                      {s.text}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px] gap-1.5"
                        onClick={() => copyText(s.text, s.id)}
                      >
                        {copied === s.id
                          ? <><Check className="h-3 w-3 text-green-500" /> Copied</>
                          : <><Copy className="h-3 w-3" /> Copy caption</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[12px] gap-1.5"
                        asChild
                      >
                        <a href={s.href} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" /> Post to {s.label}
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Landing Pages Tab ────────────────────────────────────────────────────────

function LandingPagesTab() {
  const { org } = useOrg();
  const orgSlug = (org as { subdomain?: string | null } | null)?.subdomain || org?.slug || null;
  const landingPublished = (org as { landing_published?: boolean } | null)?.landing_published ?? false;

  const orgUrl = orgSlug ? publicUrl(`/org/${orgSlug}`) : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Landing Pages</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Manage your public organization page — the central hub where attendees discover all your events.
        </p>
      </div>

      {/* Status card */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
              <Globe className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">Organization Page</p>
              <p className="text-[12px] text-muted-foreground">
                {orgUrl ? (
                  <a href={orgUrl} target="_blank" rel="noreferrer" className="hover:underline font-mono">
                    {orgUrl}
                  </a>
                ) : "Set a workspace handle to get your public URL"}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={landingPublished
              ? "bg-green-500/10 text-green-600 border-green-500/20"
              : "bg-muted text-muted-foreground border-border"}
          >
            {landingPublished ? "Published" : "Draft"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: Layout,
              label: "Edit Landing Page",
              desc: "Customize colors, layout, and content",
              to: "/dashboard/landing-builder",
              variant: "default" as const,
            },
            {
              icon: BarChart3,
              label: "View Analytics",
              desc: "See traffic and engagement stats",
              to: "/dashboard/analytics",
              variant: "outline" as const,
            },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className={`flex flex-col gap-1.5 p-4 rounded-lg border transition-colors hover:border-primary/40 ${
                action.variant === "default"
                  ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                  : "bg-card border-border hover:bg-muted/50"
              }`}
            >
              <action.icon className={`h-4 w-4 ${action.variant === "default" ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-[13px] font-semibold">{action.label}</p>
              <p className="text-[11px] text-muted-foreground">{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Per-event pages info */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-[13px] font-semibold">Event Landing Pages</h3>
        <p className="text-[13px] text-muted-foreground">
          Every event you publish automatically gets a dedicated public landing page. Design it from within each event's <strong>Design</strong> tab.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-[13px] gap-1.5" asChild>
            <Link to="/dashboard">
              <ArrowRight className="h-3.5 w-3.5" /> Go to Events
            </Link>
          </Button>
          {orgUrl && (
            <Button size="sm" variant="outline" className="h-8 text-[13px] gap-1.5" asChild>
              <a href={orgUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> View Public Page
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const MarketingPage = () => (
  <DashboardLayout>
    <div className="space-y-5 w-full">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Marketing</h1>
        <p className="text-[13px] text-muted-foreground">
          Promote your events and reach your audience
        </p>
      </div>

      <Tabs defaultValue="email" className="space-y-5">
        <TabsList className="h-9">
          <TabsTrigger value="email" className="text-[13px] gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email Campaigns
          </TabsTrigger>
          <TabsTrigger value="social" className="text-[13px] gap-1.5">
            <Share2 className="h-3.5 w-3.5" /> Social Sharing
          </TabsTrigger>
          <TabsTrigger value="landing" className="text-[13px] gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Landing Pages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          <EmailCampaignsTab />
        </TabsContent>

        <TabsContent value="social">
          <SocialSharingTab />
        </TabsContent>

        <TabsContent value="landing">
          <LandingPagesTab />
        </TabsContent>
      </Tabs>
    </div>
  </DashboardLayout>
);

export default MarketingPage;
