/**
 * Super Admin → Organizations → Create organization.
 *
 * Three steps: the form (organization, then its first user), a review, and
 * the result. Creating calls the `team-invitation` edge function
 * (`admin_create_org`), which checks Super Admin on the server, creates the
 * organization with its plan, limits and subscription, and emails the first
 * user an invitation; they become the owner when they accept. Super Admin
 * never sets or sees a password.
 *
 * The request is the same if sent twice (double click, retry after a
 * timeout); the server then returns the organization it already created.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Mail, RefreshCw, TriangleAlert, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCodePicker } from "@/components/people/CountryCodePicker";
import { PLAN_DETAILS } from "@/contexts/OrgContext";
import { callTeamInvitation, replyError } from "@/lib/team-invitation";
import { cn } from "@/lib/utils";

type Form = {
  name: string;
  subdomain: string;
  contact_email: string;
  plan: string;
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
  mobile_country_code: string;
  mobile_number: string;
};

type Result = {
  org_id: string;
  org_name: string;
  subdomain: string;
  invitation_id: string;
  email: string;
  email_sent: boolean | null;
  account_exists: boolean;
  already_created: boolean;
};

const EMPTY: Form = {
  name: "", subdomain: "", contact_email: "", plan: "free",
  first_name: "", last_name: "", email: "", designation: "", mobile_country_code: "", mobile_number: "",
};

const toSubdomain = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Same checks as the server, for immediate feedback; the server decides. */
function check(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length < 2) e["org.name"] = "Enter the organization name.";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(f.subdomain)) e["org.subdomain"] = "Use 3–63 lowercase letters, numbers or hyphens.";
  if (f.contact_email.trim() && !EMAIL_RE.test(f.contact_email.trim())) e["org.contact_email"] = "Enter a valid email address.";
  if (!f.first_name.trim()) e["user.first_name"] = "Enter the first name.";
  if (!f.last_name.trim()) e["user.last_name"] = "Enter the last name.";
  if (!EMAIL_RE.test(f.email.trim())) e["user.email"] = "Enter a valid email address.";
  if (f.mobile_number.trim() && !/^\d{6,15}$/.test(f.mobile_number.replace(/[\s()-]/g, ""))) e["user.mobile_number"] = "Enter a valid mobile number.";
  if (f.mobile_number.trim() && !/^\+\d{1,4}$/.test(f.mobile_country_code)) e["user.mobile_country_code"] = "Choose a country code.";
  return e;
}

export function CreateOrganizationDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refresh the organization list. */
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [form, setForm] = useState<Form>(EMPTY);
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [resending, setResending] = useState(false);

  const reset = () => {
    setStep("form"); setForm(EMPTY); setSubdomainEdited(false); setErrors({}); setError(null); setResult(null);
  };
  const close = (v: boolean) => {
    if (busy) return;
    onOpenChange(v);
    if (!v) window.setTimeout(reset, 200);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "name" && !subdomainEdited) next.subdomain = toSubdomain(String(v));
      return next;
    });
    setErrors((e) => {
      const key = ["name", "subdomain", "contact_email", "plan"].includes(k) ? `org.${k}` : `user.${k}`;
      const rest = { ...e };
      delete rest[key];
      // The URL identifier follows the name until it's edited by hand.
      if (k === "name" && !subdomainEdited) delete rest["org.subdomain"];
      return rest;
    });
  };

  const toReview = () => {
    const e = check(form);
    setErrors(e);
    setError(null);
    if (!Object.keys(e).length) setStep("review");
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const reply = await callTeamInvitation({
      action: "admin_create_org",
      org: {
        name: form.name.trim(),
        subdomain: form.subdomain,
        contact_email: form.contact_email.trim() || null,
        plan: form.plan,
        plan_limits: PLAN_DETAILS[form.plan]?.limits ?? PLAN_DETAILS.free.limits,
      },
      user: {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        designation: form.designation.trim(),
        mobile_country_code: form.mobile_number.trim() ? form.mobile_country_code : "",
        mobile_number: form.mobile_number.trim(),
      },
    });
    setBusy(false);
    const b = reply.body;
    if (b.ok === true) {
      setResult({
        org_id: String(b.org_id), org_name: String(b.org_name ?? form.name), subdomain: String(b.subdomain ?? form.subdomain),
        invitation_id: String(b.invitation_id), email: form.email.trim().toLowerCase(),
        email_sent: b.email_sent === null ? null : b.email_sent === true,
        account_exists: b.account_exists === true, already_created: b.already_created === true,
      });
      setStep("done");
      onCreated();
      return;
    }
    if (b.errors && typeof b.errors === "object") {
      setErrors(b.errors as Record<string, string>);
      setStep("form");
    }
    setError(
      reply.status === 404 || b.code === "unreachable" || (b.code === "invalid" && b.error === "Unknown action.")
        ? "Organization creation isn't available yet: the team-invitation function needs redeploying (and migration 049 applying)."
        : replyError(reply, "We could not create the organization. Please try again."),
    );
  };

  const resend = async () => {
    if (!result) return;
    setResending(true);
    const reply = await callTeamInvitation({ action: "resend", invitation_id: result.invitation_id });
    setResending(false);
    if (reply.body.ok === true) setResult({ ...result, email_sent: reply.body.email_sent === true });
    else setError(replyError(reply, "We could not resend the invitation."));
  };

  const field = (key: string) => errors[key];
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>{step === "done" ? (result?.already_created ? "Organization already created" : "Organization created") : "Create organization"}</DialogTitle>
          <DialogDescription>
            {step === "form" && "Set up the organization and invite its first user, who becomes the owner."}
            {step === "review" && "Check everything before creating it."}
            {step === "done" && "The first user becomes the owner when they accept the invitation."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 px-6 py-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
            </div>
          )}

          {step === "form" && (
            <>
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold"><Building2 className="h-4 w-4 text-muted-foreground" /> Organization</h3>
                <F id="co-name" label="Organization name *" error={field("org.name")}>
                  <Input id="co-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} aria-invalid={!!field("org.name")} />
                </F>
                <F id="co-sub" label="URL identifier *" error={field("org.subdomain")} hint={form.subdomain ? `illuxus.com/org/${form.subdomain}` : "Used in the organization's public URL. Must be unique."}>
                  <Input
                    id="co-sub"
                    value={form.subdomain}
                    onChange={(e) => { setSubdomainEdited(true); set("subdomain", toSubdomain(e.target.value)); }}
                    maxLength={63}
                    aria-invalid={!!field("org.subdomain")}
                  />
                </F>
                <div className="grid gap-3 sm:grid-cols-2">
                  <F id="co-contact" label="Contact email" error={field("org.contact_email")}>
                    <Input id="co-contact" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} aria-invalid={!!field("org.contact_email")} />
                  </F>
                  <F id="co-plan" label="Plan" error={field("org.plan")}>
                    <Select value={form.plan} onValueChange={(v) => set("plan", v)}>
                      <SelectTrigger id="co-plan"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLAN_DETAILS).map(([id, p]) => <SelectItem key={id} value={id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </F>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold"><User className="h-4 w-4 text-muted-foreground" /> First user (owner)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <F id="co-first" label="First name *" error={field("user.first_name")}>
                    <Input id="co-first" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} maxLength={80} aria-invalid={!!field("user.first_name")} />
                  </F>
                  <F id="co-last" label="Last name *" error={field("user.last_name")}>
                    <Input id="co-last" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} maxLength={80} aria-invalid={!!field("user.last_name")} />
                  </F>
                </div>
                <F id="co-email" label="Email *" error={field("user.email")} hint="The invitation goes here. If this email already has an account, they sign in to accept.">
                  <Input id="co-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!field("user.email")} />
                </F>
                <div className="grid gap-3 sm:grid-cols-2">
                  <F id="co-desig" label="Designation">
                    <Input id="co-desig" value={form.designation} onChange={(e) => set("designation", e.target.value)} maxLength={120} />
                  </F>
                  <F id="co-mobile" label="Mobile number" error={field("user.mobile_number") || field("user.mobile_country_code")}>
                    <div className="flex gap-2">
                      <CountryCodePicker value={form.mobile_country_code} onChange={(dial) => set("mobile_country_code", dial)} className="h-10 w-[104px] shrink-0 text-[13px]" />
                      <Input id="co-mobile" inputMode="tel" value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} maxLength={20} aria-invalid={!!field("user.mobile_number")} />
                    </div>
                  </F>
                </div>
                <p className="text-[12px] text-muted-foreground">They choose their own password from the invitation. You never set or see it.</p>
              </section>
            </>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <Summary title="Organization" rows={[
                ["Name", form.name.trim()],
                ["URL", `illuxus.com/org/${form.subdomain}`],
                ["Contact email", form.contact_email.trim() || "—"],
                ["Plan", PLAN_DETAILS[form.plan]?.name ?? form.plan],
              ]} />
              <Summary title="First user" rows={[
                ["Name", fullName],
                ["Email", form.email.trim().toLowerCase()],
                ["Designation", form.designation.trim() || "—"],
                ["Mobile", form.mobile_number.trim() ? `${form.mobile_country_code} ${form.mobile_number.trim()}` : "—"],
                ["Role", "Owner (organization only)"],
              ]} />
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-[12.5px] text-muted-foreground">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span>An invitation is emailed to {form.email.trim().toLowerCase()}. It works once and expires in 14 days. They become the owner when they accept; until then you're shown as the owner so you can resend it.</span>
              </p>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-600"><CheckCircle2 className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{result.org_name}</p>
                  <p className="break-all text-[12.5px] text-muted-foreground">illuxus.com/org/{result.subdomain} · ID {result.org_id}</p>
                </div>
              </div>
              <Summary title="First user" rows={[
                ["Email", result.email],
                ["Account", result.account_exists ? "Already on Illuxus. They sign in to accept." : "New. They set up their account from the invitation."],
                ["Membership", "Pending: becomes owner on accepting"],
                ["Invitation email", result.email_sent === null ? "Sent earlier (this was a repeat of the same request)" : result.email_sent ? "Sent" : "Not sent"],
              ]} />
              {result.email_sent === false && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[13px]">
                  <span className="text-amber-700 dark:text-amber-300">The email couldn't be sent. The organization and invitation are saved.</span>
                  <Button size="sm" variant="outline" onClick={resend} disabled={resending}>
                    {resending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Resend invitation
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          {step === "form" && (
            <>
              <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={toReview}>Review</Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={busy}><ArrowLeft className="mr-1.5 h-4 w-4" /> Edit</Button>
              <Button onClick={create} disabled={busy}>
                {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…</> : "Create & send invitation"}
              </Button>
            </>
          )}
          {step === "done" && result && (
            <>
              <Button variant="outline" asChild><Link to={`/org/${result.subdomain}`} target="_blank">View public page</Link></Button>
              <Button onClick={() => close(false)}>Done</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-[12.5px]">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-[11.5px] text-destructive">{error}</p> : hint ? <p className="mt-1 text-[11.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-border">
      <p className="border-b border-border px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-2.5 text-[13px]">
            <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
            <dd className={cn("min-w-0 break-words font-medium")}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
