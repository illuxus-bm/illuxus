import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseRpc } from "@/lib/observability";
import { toast } from "sonner";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, X, Mail, Phone, Linkedin, Globe, Building2, CheckCircle, Trash2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatMoney } from "@/lib/currency";
import { REGISTRATION_STATUSES } from "@/lib/ticket-categories";

type RowKind = "attendee" | "speaker" | "sponsor";

export type QuickViewRow = {
  id: string;
  kind: RowKind;
  refId: string;
  name: string;
  email: string;
  ticket_type: string;
  status: string;
  checked_in: boolean;
  checked_in_at: string | null;
};

const TABLES: Record<RowKind, "registrations" | "speakers" | "sponsor_members"> = {
  attendee: "registrations",
  speaker: "speakers",
  sponsor: "sponsor_members",
};

const TITLES = ["Mr.", "Ms.", "Mrs.", "Prefer Not to Say"];
const EMPLOYEE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

type FullRecord = Record<string, any>;

const optionalUrl = z.string().trim().url("Must be a valid URL").max(500).optional().or(z.literal(""));
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const editSchema = z.object({
  first_name: optionalText(80),
  last_name: optionalText(80),
  email: z.string().trim().email("Invalid email").max(255),
  designation: optionalText(120),
  company: optionalText(160),
  mobile_country_code: z.string().trim().regex(/^(\+\d{1,4})?$/, "Use format like +1").optional().or(z.literal("")),
  mobile_number: z.string().trim().regex(/^([\d\s-]{6,20})?$/, "6–20 digits").optional().or(z.literal("")),
  linkedin_url: optionalUrl,
  company_website: optionalUrl,
});

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function RegistrantQuickView({
  open, onOpenChange, row, onSaved, eventOwnerId, currency = "INR",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: QuickViewRow | null;
  onSaved?: () => void;
  eventOwnerId?: string | null;
  currency?: string;
}) {
  const { user, isAdmin } = useAuth();
  const canEdit = isAdmin || (!!user && !!eventOwnerId && user.id === eventOwnerId);

  const [record, setRecord] = useState<FullRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<FullRecord>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!open || !row) return;
    setEditing(false);
    setErrors({});
    setLoading(true);
    supabase
      .from(TABLES[row.kind])
      .select("*")
      .eq("id", row.refId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast.error("Could not load details");
          setRecord(null);
        } else {
          setRecord(data || {});
          setDraft(data || {});
        }
        setLoading(false);
      });
  }, [open, row]);

  // Live updates for attendees: refresh record/check-in on row updates.
  useEffect(() => {
    if (!open || !row || row.kind !== "attendee") return;
    const channel = supabase
      .channel(`registration-${row.refId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "registrations", filter: `id=eq.${row.refId}` },
        (payload) => {
          const next = payload.new as Record<string, any>;
          setRecord((prev) => (prev ? { ...prev, ...next } : next));
          if (!editing) setDraft((prev) => ({ ...prev, ...next }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, row, editing]);

  // Tick the relative time every 30s while open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => forceTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, [open]);

  if (!row) return null;

  const isAttendee = row.kind === "attendee";

  const fullName = [draft.title, draft.first_name, draft.last_name].filter(Boolean).join(" ").trim()
    || draft.display_name || draft.name || row.name;

  const update = (patch: Partial<FullRecord>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // Clear errors for fields being edited
    const keys = Object.keys(patch);
    setErrors((e) => {
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  };

  const validate = (): boolean => {
    const result = editSchema.safeParse({
      first_name: draft.first_name ?? "",
      last_name: draft.last_name ?? "",
      email: draft.email ?? "",
      designation: draft.designation ?? "",
      company: draft.company ?? "",
      mobile_country_code: draft.mobile_country_code ?? "",
      mobile_number: draft.mobile_number ?? "",
      linkedin_url: draft.linkedin_url ?? "",
      company_website: draft.company_website ?? "",
    });
    if (result.success) { setErrors({}); return true; }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path[0] as string;
      if (!next[path]) next[path] = issue.message;
    }
    setErrors(next);
    return false;
  };

  const save = async () => {
    if (!record) return;
    if (!canEdit) return;
    if (!validate()) {
      toast.error("Fix the highlighted fields");
      return;
    }
    setSaving(true);
    // Build payload of editable fields only
    const editable = [
      "title", "first_name", "last_name", "designation", "company",
      "mobile_country_code", "mobile_number", "linkedin_url",
      "company_website", "company_employee_count", "industry",
      "email",
    ];
    const payload: FullRecord = {};
    for (const k of editable) {
      if (draft[k] !== undefined) payload[k] = draft[k] === "" ? null : draft[k];
    }
    // Keep legacy name column in sync where it exists
    const composed = [draft.first_name, draft.last_name].filter(Boolean).join(" ").trim();
    if (composed) {
      if (row.kind === "attendee" || row.kind === "speaker") payload.name = composed;
      if (row.kind === "sponsor") payload.display_name = composed;
    }
    // Attendee-only fields
    if (row.kind === "attendee") {
      if (draft.status !== undefined) payload.status = draft.status;
      if (draft.ticket_type !== undefined) payload.ticket_type = draft.ticket_type;
      if (draft.amount_paid !== undefined) payload.amount_paid = Number(draft.amount_paid) || 0;
    }
    const { data: updated, error } = await (supabase.from(TABLES[row.kind]) as any)
      .update(payload)
      .eq("id", row.refId)
      .select();
    setSaving(false);
    if (error) {
      toast.error("Failed to save", { description: error.message });
      return;
    }
    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
      toast.error("Failed to save", {
        description: "You don't have permission to edit this record, or it no longer exists.",
      });
      return;
    }
    const fresh = Array.isArray(updated) ? updated[0] : updated;
    toast.success("Saved");
    setRecord({ ...record, ...payload, ...fresh });
    setDraft({ ...record, ...payload, ...fresh });
    setEditing(false);
    onSaved?.();
  };

  const restoreSnapshot = async (snap: FullRecord) => {
    const { id, qr_code, join_token, created_at, updated_at, ...rest } = snap;
    const { data, error } = await supabase
      .from("registrations")
      .insert(rest as any)
      .select()
      .single();
    if (error) {
      toast.error("Could not restore", { description: error.message });
      return;
    }
    await supabaseRpc("log_registrant_action" as never, {
      _action: "restore",
      _registration_id: data.id,
      _details: { event_id: rest.event_id, restored_from: id, name: rest.name, email: rest.email },
    } as never);
    toast.success("Registrant restored");
    onSaved?.();
  };

  const handleDelete = async () => {
    if (!record || !canEdit || row.kind !== "attendee") return;
    setDeleting(true);
    const snapshot = { ...record };
    const { error } = await supabase.from("registrations").delete().eq("id", row.refId);
    if (error) {
      setDeleting(false);
      toast.error("Failed to delete", { description: error.message });
      return;
    }
    await supabaseRpc("log_registrant_action" as never, {
      _action: "delete",
      _registration_id: row.refId,
      _details: { event_id: snapshot.event_id, name: snapshot.name, email: snapshot.email },
    } as never);
    setDeleting(false);
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved?.();
    toast.success("Registrant deleted", {
      duration: 10_000,
      action: { label: "Undo", onClick: () => { void restoreSnapshot(snapshot); } },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background border-b px-5 sm:px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            {fullName}
            <Badge variant="outline" className="capitalize text-[10px]">{row.kind}</Badge>
            {(record?.checked_in ?? row.checked_in) ? (
              <Badge className="bg-green-600 hover:bg-green-600 text-[10px] gap-1">
                <CheckCircle className="h-3 w-3" />
                Checked in
                {record?.checked_in_at && (
                  <span className="ml-1 opacity-90">· {relTime(record.checked_in_at)}</span>
                )}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Not checked in</Badge>
            )}
            {!canEdit && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Lock className="h-3 w-3" /> View only
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !record ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No data available.</div>
        ) : !editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <Field label="Email" icon={<Mail className="h-3 w-3" />} value={record.email} />
            <Field
              label="Mobile"
              icon={<Phone className="h-3 w-3" />}
              value={[record.mobile_country_code, record.mobile_number].filter(Boolean).join(" ")}
            />
            <Field label="Designation" value={record.designation} />
            <Field label="Company" icon={<Building2 className="h-3 w-3" />} value={record.company} />
            <Field label="Industry" value={record.industry} />
            <Field label="Company size" value={record.company_employee_count} />
            <Field
              label="LinkedIn"
              icon={<Linkedin className="h-3 w-3" />}
              value={record.linkedin_url}
              isLink
            />
            <Field
              label="Website"
              icon={<Globe className="h-3 w-3" />}
              value={record.company_website}
              isLink
            />
            {isAttendee && (
              <>
                <Field label="Status" value={record.status} />
                <Field label="Amount paid" value={record.amount_paid != null ? formatMoney(Number(record.amount_paid), currency) : null} />
                <Field label="Registered" value={record.created_at ? new Date(record.created_at).toLocaleString() : null} />
                {record.checked_in_at && (
                  <Field label="Last check-in" value={`${new Date(record.checked_in_at).toLocaleString()} (${relTime(record.checked_in_at)})`} />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div className="col-span-1">
              <Label className="text-[11px]">Title</Label>
              <Select value={draft.title || ""} onValueChange={(v) => update({ title: v })}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div />
            <EditField label="First name" value={draft.first_name} onChange={(v) => update({ first_name: v })} error={errors.first_name} />
            <EditField label="Last name" value={draft.last_name} onChange={(v) => update({ last_name: v })} error={errors.last_name} />
            <EditField label="Email" value={draft.email} onChange={(v) => update({ email: v })} type="email" error={errors.email} />
            <EditField label="Designation" value={draft.designation} onChange={(v) => update({ designation: v })} error={errors.designation} />
            <EditField label="Company" value={draft.company} onChange={(v) => update({ company: v })} error={errors.company} />
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <div>
                <Label className="text-[11px]">Code</Label>
                <Input
                  className="h-8 text-[13px]"
                  value={draft.mobile_country_code || ""}
                  onChange={(e) => update({ mobile_country_code: e.target.value })}
                  placeholder="+1"
                />
                {errors.mobile_country_code && <p className="text-[11px] text-destructive mt-0.5">{errors.mobile_country_code}</p>}
              </div>
              <EditField label="Mobile number" value={draft.mobile_number} onChange={(v) => update({ mobile_number: v })} error={errors.mobile_number} />
            </div>
            <EditField label="LinkedIn URL" value={draft.linkedin_url} onChange={(v) => update({ linkedin_url: v })} error={errors.linkedin_url} />
            <EditField label="Company website" value={draft.company_website} onChange={(v) => update({ company_website: v })} error={errors.company_website} />
            <div>
              <Label className="text-[11px]">Employee count</Label>
              <Select value={draft.company_employee_count || ""} onValueChange={(v) => update({ company_employee_count: v })}>
                <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_BUCKETS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <EditField label="Industry" value={draft.industry} onChange={(v) => update({ industry: v })} />
            {isAttendee && (
              <>
                <div>
                  <Label className="text-[11px]">Status</Label>
                  <Select value={draft.status || "confirmed"} onValueChange={(v) => update({ status: v })}>
                    <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGISTRATION_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <EditField label="Amount paid" value={draft.amount_paid} onChange={(v) => update({ amount_paid: v })} type="number" />
              </>
            )}
          </div>
        )}
        </div>

        <DialogFooter className="sticky bottom-0 bg-background border-t px-5 sm:px-6 py-3 gap-2 sm:justify-between">
          <div>
            {canEdit && isAttendee && !editing && record && (
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this registrant?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {fullName} will be removed from the registration list. You'll have 10 seconds to undo.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); void handleDelete(); }}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              {canEdit && (
                <Button size="sm" className="gap-1.5" onClick={() => setEditing(true)} disabled={loading || !record}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setDraft(record || {}); setEditing(false); }} disabled={saving}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving || Object.keys(errors).length > 0}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, icon, isLink }: { label: string; value: any; icon?: React.ReactNode; isLink?: boolean }) {
  const display = value == null || value === "" ? "—" : String(value);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
        {icon} <span>{label}</span>
      </div>
      {isLink && display !== "—" ? (
        <a href={display.startsWith("http") ? display : `https://${display}`} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate block">
          {display}
        </a>
      ) : (
        <p className="truncate capitalize-first">{display}</p>
      )}
    </div>
  );
}

function EditField({
  label, value, onChange, type = "text", error,
}: { label: string; value: any; onChange: (v: string) => void; type?: string; error?: string }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input
        type={type}
        className={`h-8 text-[13px] ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-[11px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}