import { useEffect, useState } from "react";
import {
  Mail, Send, Users, Clock, CheckCircle, Plus, MessageSquare, Loader2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface EmailMessage {
  id: string;
  subject: string;
  recipients: string;
  status: "sent" | "draft" | "scheduled";
  sent_at: string | null;
  body: string;
  recipient_filter: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  sent: "bg-green-500/10 text-green-600 border-green-500/20",
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const RECIPIENT_LABELS: Record<string, string> = {
  all: "All Registrants",
  confirmed: "Confirmed Only",
  speakers: "Speakers",
  waitlist: "Waitlist",
};

export default function CommunicationSection({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newRecipients, setNewRecipients] = useState("all");

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("event_emails")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (error) {
      // Table may not exist yet in older schemas — show empty state gracefully
      if (error.code !== "42P01") {
        toast.error("Failed to load messages: " + error.message);
      }
      setMessages([]);
    } else {
      setMessages((data || []) as EmailMessage[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();
    // Real-time subscription so other org members see new messages immediately
    const channel = supabase
      .channel(`event-emails-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_emails", filter: `event_id=eq.${eventId}` },
        () => fetchMessages(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === "sent").length,
    scheduled: messages.filter((m) => m.status === "scheduled").length,
    drafts: messages.filter((m) => m.status === "draft").length,
  };

  const resetCompose = () => {
    setNewSubject("");
    setNewBody("");
    setNewRecipients("all");
  };

  /** Build the list of recipient emails based on the filter choice. */
  const fetchRecipientEmails = async (): Promise<string[]> => {
    let query = supabase.from("registrations").select("email").eq("event_id", eventId);

    if (newRecipients === "confirmed") {
      query = query.eq("approval_status", "approved");
    } else if (newRecipients === "waitlist") {
      query = query.eq("status", "waitlist");
    } else if (newRecipients === "speakers") {
      // Speakers are stored in the speakers table linked via event_speakers
      const { data: speakerRels } = await supabase
        .from("event_speakers")
        .select("speaker_id")
        .eq("event_id", eventId);
      const ids = (speakerRels || []).map((r) => r.speaker_id);
      if (!ids.length) return [];
      const { data: speakers } = await supabase
        .from("speakers")
        .select("email")
        .in("id", ids);
      return (speakers || []).map((s) => s.email).filter(Boolean) as string[];
    }

    const { data } = await query;
    return (data || []).map((r) => r.email).filter(Boolean);
  };

  const handleSend = async () => {
    if (!newSubject.trim()) { toast.error("Please enter a subject"); return; }
    if (!newBody.trim()) { toast.error("Please write a message body"); return; }
    setSending(true);
    try {
      const recipientEmails = await fetchRecipientEmails();
      if (!recipientEmails.length) {
        toast.error("No recipients found for the selected filter");
        setSending(false);
        return;
      }

      // Persist to DB first so it appears immediately even if the edge fn is slow
      const { data: record, error: insertErr } = await supabase
        .from("event_emails")
        .insert({
          event_id: eventId,
          subject: newSubject.trim(),
          body: newBody.trim(),
          recipient_filter: newRecipients,
          recipients: RECIPIENT_LABELS[newRecipients] || newRecipients,
          status: "sent",
          sent_at: new Date().toISOString(),
          created_by: user?.id,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Invoke the send-event-email edge function to actually dispatch emails.
      // If the function doesn't exist yet the message is still recorded as sent
      // so the UI stays consistent; the toast will note the partial state.
      const { error: fnErr } = await supabase.functions.invoke("send-event-email", {
        body: {
          event_id: eventId,
          email_id: record.id,
          subject: newSubject.trim(),
          body: newBody.trim(),
          recipient_emails: recipientEmails,
        },
      });

      if (fnErr) {
        // Non-fatal: record exists, but delivery failed — mark as draft so user knows
        await supabase.from("event_emails").update({ status: "draft" }).eq("id", record.id);
        toast.warning(
          "Message saved but delivery failed. Configure email settings or try again.",
        );
      } else {
        toast.success(`Email sent to ${recipientEmails.length} recipient${recipientEmails.length !== 1 ? "s" : ""}`);
      }

      setComposeOpen(false);
      resetCompose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const saveDraft = async () => {
    if (!newSubject.trim()) { toast.error("Please enter a subject"); return; }
    setSavingDraft(true);
    const { error } = await supabase.from("event_emails").insert({
      event_id: eventId,
      subject: newSubject.trim(),
      body: newBody.trim(),
      recipient_filter: newRecipients,
      recipients: RECIPIENT_LABELS[newRecipients] || newRecipients,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Communication</h2>
          <p className="text-[12px] text-muted-foreground">
            Send emails and announcements to attendees
          </p>
        </div>
        <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) resetCompose(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-[12px] gap-1.5">
              <Plus className="h-3 w-3" /> Compose
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">Compose Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-[12px]">Recipients</Label>
                <Select value={newRecipients} onValueChange={setNewRecipients}>
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
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="h-8 text-[13px] mt-1"
                  placeholder="Enter email subject…"
                />
              </div>
              <div>
                <Label className="text-[12px]">Message</Label>
                <Textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  className="text-[13px] mt-1 min-h-[120px]"
                  placeholder="Write your message…"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-[12px] gap-1"
                  onClick={handleSend}
                  disabled={sending || savingDraft}
                >
                  {sending ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</>
                  ) : (
                    <><Send className="h-3 w-3" /> Send Now</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px]"
                  onClick={saveDraft}
                  disabled={sending || savingDraft}
                >
                  {savingDraft ? "Saving…" : "Save Draft"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: MessageSquare, label: "Total", value: stats.total, color: "text-foreground" },
          { icon: CheckCircle, label: "Sent", value: stats.sent, color: "text-green-600" },
          { icon: Clock, label: "Scheduled", value: stats.scheduled, color: "text-blue-600" },
          { icon: Mail, label: "Drafts", value: stats.drafts, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Messages list */}
      {loading ? (
        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Mail className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No messages yet</p>
          <p className="text-[13px] text-muted-foreground">
            Compose your first email to connect with attendees.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <h3 className="text-[13px] font-semibold truncate">{msg.subject}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {msg.recipients}
                    </span>
                    {msg.sent_at && (
                      <>
                        <span>·</span>
                        <span>
                          {new Date(msg.sent_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  {msg.body && (
                    <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2">
                      {msg.body}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${statusColors[msg.status]}`}
                  >
                    {msg.status}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete message?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove "{msg.subject}" from the communication log.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(msg.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
