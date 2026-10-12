import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { ConsentCheckbox, LegalLink } from "@/components/ConsentCheckbox";
import PublicPageShell from "@/components/layout/PublicPageShell";
import RouteSeo from "@/components/RouteSeo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { buildDeletionTicket, DELETION_SCOPES, validateDeletionRequest, type DeletionScope } from "@/lib/data-deletion";
import { logger } from "@/lib/observability";

/**
 * Data deletion request — a form anyone can use, signed in or not, to ask for
 * their personal data to be erased. Filed with the privacy team as a tracked
 * support ticket (see `@/lib/data-deletion`).
 */
export default function DataDeletionPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<DeletionScope>("account");
  const [details, setDetails] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  // A signed-in requester's email is the one their data is held under.
  useEffect(() => {
    if (!user) return;
    setEmail((current) => current || user.email || "");
    const fullName = (user.user_metadata?.full_name ?? user.user_metadata?.name) as string | undefined;
    setName((current) => current || fullName || "");
  }, [user]);

  const signedIn = Boolean(user?.email && user.email.toLowerCase() === email.trim().toLowerCase());

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (sending) return;
    const request = { name, email, scope, details, signedIn };
    const problem = validateDeletionRequest(request, confirmed);
    setError(problem);
    if (problem) return;

    setSending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("submit-support-ticket", {
        body: {
          name: name.trim(),
          email: email.trim(),
          ...buildDeletionTicket(request),
          page_url: window.location.href,
        },
      });
      if (invokeError || !data?.success) {
        throw new Error((data && typeof data.error === "string" && data.error) || invokeError?.message || "Request could not be sent.");
      }
      logger.info("data_deletion_request_submitted", { scope, signed_in: signedIn });
      setTicketNumber(String(data.ticket_number));
    } catch (err) {
      logger.warn("data_deletion_request_failed", { error_message: err instanceof Error ? err.message : String(err) });
      setError("We couldn't send your request. Please try again, or email privacy@illuxus.com directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicPageShell>
      <RouteSeo
        title="Request deletion of your data — illuxus"
        description="Ask illuxus to delete your account, your event registrations or your marketing data. Requests are tracked and answered by our privacy team."
        canonical="https://illuxus.com/data-deletion"
        ogImage="https://illuxus.com/og-image.png"
        ogType="website"
      />

      <main>
        <section className="pt-24 pb-8 text-center px-4">
          <p className="text-sm font-medium text-primary mb-3 uppercase tracking-widest">Your data</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Request deletion of your data</h1>
          <p className="mx-auto max-w-xl text-muted-foreground text-[14px] leading-relaxed">
            You can ask us to erase the personal data we hold about you. Tell us what to delete and our privacy team will
            confirm your identity, carry it out, and write back to you.
          </p>
        </section>

        <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-24">
          {ticketNumber ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center" role="status">
              <CheckCircle2 className="mx-auto h-9 w-9 text-green-600" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">Request received</h2>
              <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed">
                Your reference is <span className="font-mono font-semibold text-foreground">{ticketNumber}</span>. We've
                emailed a copy to <span className="font-medium text-foreground">{email.trim()}</span>. If we need to confirm
                that the email address is yours, we'll reply there first.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/support/ticket/${encodeURIComponent(ticketNumber)}?email=${encodeURIComponent(email.trim())}`}>Track this request</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="deletion-name" className="text-[13px]">Your name</Label>
                  <Input id="deletion-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 h-9 text-sm" />
                </div>
                <div>
                  <Label htmlFor="deletion-email" className="text-[13px]">Email your data is held under</Label>
                  <Input id="deletion-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5 h-9 text-sm" />
                </div>
              </div>

              <fieldset>
                <legend className="text-[13px] font-medium">What would you like deleted?</legend>
                <div className="mt-2 space-y-2">
                  {DELETION_SCOPES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        scope === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="deletion-scope"
                        value={option.value}
                        checked={scope === option.value}
                        onChange={() => setScope(option.value)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                        <span className="block text-[12px] text-muted-foreground">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <Label htmlFor="deletion-details" className="text-[13px]">
                  {scope === "registrations" ? "Which events?" : "Anything we should know"}
                  {scope !== "registrations" && scope !== "other" && <span className="font-normal text-muted-foreground"> (optional)</span>}
                </Label>
                <Textarea
                  id="deletion-details"
                  rows={4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={scope === "registrations" ? "Event names and dates" : "Other email addresses you have used, workspaces you belong to, and so on"}
                  className="mt-1.5 text-sm"
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-[12px] leading-relaxed text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> What happens next
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>We confirm the request really comes from you before deleting anything.</li>
                  <li>Deletion is permanent. Tickets and registrations for upcoming events are cancelled with it.</li>
                  <li>Records we are required by law to keep, such as tax invoices, are retained for the legal period and then deleted.</li>
                  <li>If you registered for an event, its organiser holds your details too; we pass your request on to them.</li>
                </ul>
              </div>

              <ConsentCheckbox
                checked={confirmed}
                onCheckedChange={(value) => {
                  setConfirmed(value);
                  // Don't leave "please confirm" on screen once they have.
                  if (value) setError(null);
                }}
              >
                I understand that deletion is permanent and cannot be undone, and I agree to my details being used to handle
                this request as described in the <LegalLink to="/privacy">Privacy Policy</LegalLink>.
              </ConsentCheckbox>

              {error && (
                <p role="alert" className="text-[13px] text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={sending} className="w-full">
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {sending ? "Sending…" : "Send deletion request"}
              </Button>
              <p className="text-center text-[12px] text-muted-foreground">
                Prefer email? Write to <a href="mailto:privacy@illuxus.com" className="text-primary hover:underline">privacy@illuxus.com</a>.
              </p>
            </form>
          )}
        </section>
      </main>
    </PublicPageShell>
  );
}
