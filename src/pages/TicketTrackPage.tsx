import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Search,
  Clock,
  AlertCircle,
  Download,
  RefreshCcw,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  Hourglass,
  PauseCircle,
} from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { supabaseRpc, logger } from "@/lib/observability";

/**
 * Public ticket tracking page at `/support/ticket/:ticketNumber`.
 *
 * Anyone can land here — the only auth check is matching the ticket number
 * with the email used to submit. Both come either from the URL (the link in
 * the confirmation email already carries `?email=…`) or an inline form on
 * the page.
 *
 * Data flow:
 *   1. User hits the page → if `?email=…` is set, we call `get_my_ticket`
 *      immediately. Otherwise we show a small form.
 *   2. Successful lookup → render the ticket card + thread.
 *   3. Failed lookup → show "not found", keep the form available so they
 *      can try again with the right email.
 *
 * Both RPCs (`get_my_ticket`, `get_my_ticket_messages`) are SECURITY DEFINER
 * functions defined in 005_support_tickets.sql; they accept anon JWT and
 * silently return 0 rows when the (number, email) pair doesn't match.
 */

interface TicketRow {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
}

interface MessageRow {
  id: string;
  author_type: "user" | "staff" | "system";
  author_name: string;
  body: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general:         "General enquiry",
  sales:           "Sales & Enterprise",
  support:         "Technical support",
  billing:         "Billing",
  privacy:         "Privacy & DPO",
  grievance:       "Grievance officer",
  press:           "Press & media",
  legal:           "Legal",
  feature_request: "Feature request",
  bug_report:      "Bug report",
  other:           "Other",
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  open:           { label: "Open",            cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",   icon: Mail },
  pending:        { label: "In progress",     cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: Hourglass },
  awaiting_user:  { label: "Awaiting you",    cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30", icon: PauseCircle },
  resolved:       { label: "Resolved",        cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  closed:         { label: "Closed",          cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  low:    { label: "Low",    cls: "bg-muted text-muted-foreground" },
  normal: { label: "Normal", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  high:   { label: "High",   cls: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  urgent: { label: "Urgent", cls: "bg-destructive/10 text-destructive" },
};

export default function TicketTrackPage() {
  const { ticketNumber: ticketNumberParam } = useParams<{ ticketNumber: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketNumber = (ticketNumberParam || "").trim();
  const initialEmail = (searchParams.get("email") || "").trim();

  const [emailInput, setEmailInput] = useState(initialEmail);
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const fetchTicket = useCallback(async (email: string) => {
    if (!ticketNumber || !email) return;
    setLoading(true);
    setLookupError(null);
    try {
      const { data, error } = await supabaseRpc<TicketRow[]>("get_my_ticket", {
        p_ticket_number: ticketNumber,
        p_email: email,
      });

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : (data as unknown as TicketRow | null);
      if (!row) {
        setTicket(null);
        setMessages([]);
        setLookupError(
          "We couldn't find a ticket with that number and email combination. Double-check both values and try again.",
        );
        return;
      }
      setTicket(row);

      const { data: msgData, error: msgError } = await supabaseRpc<MessageRow[]>(
        "get_my_ticket_messages",
        { p_ticket_number: ticketNumber, p_email: email },
      );
      if (msgError) {
        logger.warn("ticket_messages_load_failed", { error_message: msgError.message });
        setMessages([]);
      } else {
        setMessages(Array.isArray(msgData) ? msgData : []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("ticket_lookup_failed", { error_message: msg });
      setLookupError("Could not load this ticket right now. Please try again in a moment.");
      setTicket(null);
      setMessages([]);
    } finally {
      setLoading(false);
      setAttempted(true);
    }
  }, [ticketNumber]);

  // Auto-load when the URL came pre-populated (typical for the link in the
  // confirmation email).
  useEffect(() => {
    if (initialEmail) {
      fetchTicket(initialEmail);
    }
  }, [initialEmail, fetchTicket]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    // Reflect the email in the URL so the page is bookmarkable / shareable.
    setSearchParams({ email }, { replace: true });
    await fetchTicket(email);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <SiteHeader />
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-20 print:pt-0">
        <div className="mb-6 print:hidden">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link to="/contact">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to contact
            </Link>
          </Button>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 print:border-0 print:p-0 print:rounded-none print:bg-transparent">
          <header className="mb-5">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
              Track your ticket
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {ticketNumber || "—"}
            </h1>
          </header>

          {!ticket && (
            <EmailGate
              email={emailInput}
              loading={loading}
              error={attempted ? lookupError : null}
              onChange={setEmailInput}
              onSubmit={handleLookup}
            />
          )}

          {ticket && (
            <TicketView
              ticket={ticket}
              messages={messages}
              loading={loading}
              onRefresh={() => fetchTicket(emailInput || initialEmail)}
            />
          )}
        </div>

        {ticket && (
          <p className="text-[11px] text-muted-foreground text-center mt-6 print:hidden">
            Need to add more details? Email{" "}
            <a href="mailto:support@illuxus.com" className="text-primary hover:underline">
              support@illuxus.com
            </a>{" "}
            and include the ticket number above.
          </p>
        )}
      </main>

      <style>{`
        @media print {
          body { background: white !important; }
          @page { margin: 16mm; }
        }
      `}</style>
    </div>
  );
}

function EmailGate({
  email,
  loading,
  error,
  onChange,
  onSubmit,
}: {
  email: string;
  loading: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-[13px] text-muted-foreground leading-relaxed">
        Enter the email address you used when you submitted this ticket. We'll then show you the
        full status and conversation thread.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="track-email" className="text-[12px]">Email used to submit *</Label>
        <Input
          id="track-email"
          type="email"
          value={email}
          onChange={(e) => onChange(e.target.value)}
          placeholder="raj@example.com"
          autoComplete="email"
          required
        />
      </div>
      <Button type="submit" disabled={loading || !email.trim()} className="w-full">
        <Search className="h-3.5 w-3.5 mr-1.5" />
        {loading ? "Looking up…" : "Find my ticket"}
      </Button>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}

function TicketView({
  ticket,
  messages,
  loading,
  onRefresh,
}: {
  ticket: TicketRow;
  messages: MessageRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const status = STATUS_META[ticket.status] ?? STATUS_META.open;
  const StatusIcon = status.icon;
  const priority = PRIORITY_META[ticket.priority] ?? PRIORITY_META.normal;
  const categoryLabel = CATEGORY_LABELS[ticket.category] ?? ticket.category;

  // Combine the original message with subsequent replies so the timeline
  // reads top-down chronologically. The original ticket isn't stored in
  // support_ticket_messages — it lives on the ticket row — so we synthesise
  // a virtual "user" entry for it here.
  const timeline = useMemo<MessageRow[]>(() => {
    const seed: MessageRow = {
      id: `seed-${ticket.id}`,
      author_type: "user",
      author_name: ticket.name,
      body: ticket.message,
      created_at: ticket.created_at,
    };
    return [seed, ...messages];
  }, [ticket, messages]);

  const createdLabel = useMemo(() => {
    try {
      return `${format(new Date(ticket.created_at), "PPP 'at' p")} · ${formatDistanceToNowStrict(new Date(ticket.created_at), { addSuffix: true })}`;
    } catch {
      return ticket.created_at;
    }
  }, [ticket.created_at]);

  const updatedLabel = useMemo(() => {
    try {
      return formatDistanceToNowStrict(new Date(ticket.updated_at), { addSuffix: true });
    } catch {
      return ticket.updated_at;
    }
  }, [ticket.updated_at]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${status.cls}`}>
          <StatusIcon className="h-3 w-3" /> {status.label}
        </Badge>
        <Badge variant="secondary" className={`text-[11px] font-semibold uppercase ${priority.cls}`}>
          {priority.label} priority
        </Badge>
        <Badge variant="outline" className="text-[11px]">{categoryLabel}</Badge>
      </div>

      <h2 className="text-lg sm:text-xl font-semibold leading-tight">{ticket.subject}</h2>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Submitted</dt>
          <dd>{createdLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">Last updated</dt>
          <dd>{updatedLabel}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">From</dt>
          <dd>{ticket.name} · {ticket.email}</dd>
        </div>
        {ticket.first_response_at && (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">First response</dt>
            <dd>{format(new Date(ticket.first_response_at), "PPP 'at' p")}</dd>
          </div>
        )}
      </dl>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] uppercase tracking-widest text-muted-foreground">Conversation</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] print:hidden"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCcw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <ol className="space-y-3">
          {timeline.map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl border p-4 ${
                m.author_type === "staff"
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[12px] font-semibold tracking-tight">
                  {m.author_type === "staff" ? "Illuxus Support" : m.author_name || "You"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {(() => {
                    try {
                      return format(new Date(m.created_at), "PP 'at' p");
                    } catch {
                      return m.created_at;
                    }
                  })()}
                </p>
              </div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                {m.body}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground print:hidden">
        <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
          <MessageSquare className="h-3.5 w-3.5" /> Need to add a reply?
        </p>
        <p>
          Replies are coming soon to this page. For now, please email{" "}
          <a href="mailto:support@illuxus.com" className="text-primary hover:underline">
            support@illuxus.com
          </a>{" "}
          with <span className="font-mono">{ticket.ticket_number}</span> in the subject line and we'll add your message to this ticket.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Download as PDF
        </Button>
      </div>
    </div>
  );
}
