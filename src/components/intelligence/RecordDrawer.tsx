import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COMPANY_FIELDS, PERSON_FIELDS, intel, type CompanyRow, type Detail, type Entity, type HistoryEntry } from "@/lib/intelligence/admin-api";

interface Props {
  entity: Entity;
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    {children}
  </section>
);

/**
 * One contact or company: every field editable, with its history (old
 * value, new value, source, when) and a revert for each change; identifiers
 * (emails, phones, LinkedIn — or aliases, domains, registry IDs); the
 * records it is linked to; and open correction suggestions.
 */
export function RecordDrawer({ entity, id, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ident, setIdent] = useState({ value: "", extra: "" });
  const fields = entity === "person" ? PERSON_FIELDS : COMPANY_FIELDS;
  const record = (detail ? (entity === "person" ? detail.person : detail.company) : null) as Record<string, unknown> | null;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = entity === "person" ? await intel.contact(id) : await intel.company(id);
      setDetail(d);
      const r = (entity === "person" ? d.person : d.company) as Record<string, unknown>;
      setForm(Object.fromEntries(fields.map(([f]) => [f, String(r[f] ?? "")])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [entity, id, fields]);

  useEffect(() => { setDetail(null); setReason(""); void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await load(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const save = () => {
    if (!record || !id) return;
    const changes: Record<string, string | null> = {};
    for (const [f] of fields) if ((form[f] ?? "") !== String(record[f] ?? "")) changes[f] = form[f] || null;
    if (Object.keys(changes).length === 0) { toast.message("Nothing changed"); return; }
    void run(() => entity === "person" ? intel.updateContact(id, changes, reason) : intel.updateCompany(id, changes, reason), "Saved — previous values kept in the history");
  };

  const identOp = (op: string, value: string, extra?: string) =>
    run(() => entity === "person" ? intel.contactIdentifier(id!, op, value, extra) : intel.companyIdentifier(id!, op, value, extra), "Updated");

  const list = (key: string) => (detail?.[key] as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{record ? String((entity === "person" ? record.display_name : record.name) ?? "Unnamed") : "Loading…"}</SheetTitle>
          <SheetDescription className="font-mono text-[11px]">{id}{record?.merged_into ? ` · merged into ${String(record.merged_into)}` : ""}</SheetDescription>
        </SheetHeader>

        {!detail || !record ? (
          <p className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="mt-5 space-y-6 pb-10">
            <Section title="Details">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map(([f, label]) => (
                  <label key={f} className="text-[12px] text-muted-foreground">
                    {label}
                    <Input value={form[f] ?? ""} onChange={(e) => setForm((x) => ({ ...x, [f]: e.target.value }))} className="mt-1 h-9 text-[13px] text-foreground" disabled={!!record.merged_into} />
                  </label>
                ))}
              </div>
              {entity === "person" ? (
                <CompanyPicker label="Current company" current={record.company_name as string | null} busy={busy || !!record.merged_into}
                               onPick={(companyId) => void run(() => intel.updateContact(id!, { current_company_id: companyId }, reason), "Company updated")} />
              ) : (
                <CompanyPicker label="Parent company" current={record.parent_name as string | null} busy={busy || !!record.merged_into} excludeId={id ?? undefined}
                               onPick={(companyId) => void run(() => intel.updateCompany(id!, { parent_company_id: companyId }, reason), "Parent company updated")} />
              )}
              <div className="flex gap-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (optional, kept in the history)" className="h-9 text-[13px]" />
                <Button onClick={save} disabled={busy || !!record.merged_into}>Save</Button>
              </div>
            </Section>

            {entity === "person" ? (
              <Section title="Emails, phones and LinkedIn">
                {list("emails").map((e) => (
                  <Row key={String(e.id)} label={String(e.email)} verified={!!e.verified_at} source={String(e.source)}
                       onVerify={() => void identOp(e.verified_at ? "unverify_email" : "verify_email", String(e.email))}
                       onRemove={() => void identOp("remove_email", String(e.email))} />
                ))}
                {list("phones").map((p) => (
                  <Row key={String(p.id)} label={String(p.phone_e164)} verified={!!p.verified_at} source={String(p.source)}
                       onVerify={() => void identOp(p.verified_at ? "unverify_phone" : "verify_phone", String(p.phone_e164))}
                       onRemove={() => void identOp("remove_phone", String(p.phone_e164))} />
                ))}
                {list("links").map((l) => (
                  <Row key={String(l.id)} label={String(l.url)} source="link" onRemove={() => void identOp("remove_linkedin", String(l.url))} />
                ))}
                <AddRow ident={ident} setIdent={setIdent} busy={busy} extraPlaceholder="+91 (phones only)"
                        actions={[["Add email", "add_email"], ["Add phone", "add_phone"], ["Add LinkedIn", "add_linkedin"]]}
                        onAdd={(op) => { void identOp(op, ident.value, ident.extra); setIdent({ value: "", extra: "" }); }} />
              </Section>
            ) : (
              <Section title="Aliases, domains and registry identifiers">
                {list("aliases").map((a) => <Row key={String(a.id)} label={`${String(a.alias)} (${String(a.kind)})`} source="alias" onRemove={() => void identOp("remove_alias", String(a.alias))} />)}
                {list("domains").map((d) => <Row key={String(d.id)} label={String(d.domain)} source={String(d.kind)} onRemove={() => void identOp("remove_domain", String(d.domain))} />)}
                {list("identifiers").map((i) => <Row key={String(i.id)} label={`${String(i.scheme)} ${String(i.value)}`} source="identifier" onRemove={() => void identOp("remove_identifier", String(i.value), String(i.scheme))} />)}
                <AddRow ident={ident} setIdent={setIdent} busy={busy} extraPlaceholder="CIN / GSTIN / LEI… (identifiers)"
                        actions={[["Add alias", "add_alias"], ["Add domain", "add_domain"], ["Add identifier", "add_identifier"]]}
                        onAdd={(op) => { void identOp(op, ident.value, ident.extra.toUpperCase()); setIdent({ value: "", extra: "" }); }} />
              </Section>
            )}

            {detail.suggestions.length > 0 && (
              <Section title="Suggested corrections">
                {detail.suggestions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-[13px]">
                    <div className="min-w-0">
                      <div><span className="text-muted-foreground">{s.field}:</span> {s.current_value || "—"} → <strong>{s.suggested_value || "(enter a value)"}</strong></div>
                      <div className="text-[11px] text-muted-foreground">{s.reason} · {s.confidence}%{s.evidence ? ` · ${s.evidence}` : ""}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {s.suggested_value && <Button size="sm" onClick={() => void run(() => intel.reviewCorrection(s.id, true), "Applied")}>Apply</Button>}
                      <Button size="sm" variant="outline" onClick={() => void run(() => intel.reviewCorrection(s.id, false), "Dismissed")}>Reject</Button>
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <Related entity={entity} detail={detail} />

            <Section title="History">
              {detail.history.length === 0 ? <p className="text-[13px] text-muted-foreground">No changes recorded.</p> : (
                <ol className="space-y-1.5">
                  {detail.history.map((h: HistoryEntry) => (
                    <li key={h.id} className="flex items-start justify-between gap-3 rounded-md border px-2.5 py-1.5 text-[12.5px]">
                      <div className="min-w-0">
                        <span className="font-medium">{h.field}</span>: <span className="text-muted-foreground line-through">{h.old_value ?? "—"}</span> → {h.new_value ?? "—"}
                        <div className="text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleString()} · {h.source}{h.reason ? ` · ${h.reason}` : ""}{h.reverted_at ? " · reverted" : ""}</div>
                      </div>
                      {!h.reverted_at && !["rollback", "merge", "inferred"].includes(h.source) && fields.some(([f]) => f === h.field) && (
                        <Button size="sm" variant="ghost" title="Revert this change" onClick={() => void run(() => intel.revertChange(h.id), "Reverted")}><RotateCcw className="h-3.5 w-3.5" /></Button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Finds a company record and sets it, or clears the current one. */
function CompanyPicker({ label, current, busy, excludeId, onPick }: {
  label: string; current: string | null; busy: boolean; excludeId?: string; onPick: (companyId: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CompanyRow[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; }
    let live = true;
    const t = window.setTimeout(() => {
      intel.searchCompanies(q).then((r) => { if (live) setRows(r.filter((c) => c.company_id !== excludeId).slice(0, 6)); }).catch(() => { if (live) setRows([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [q, excludeId]);
  return (
    <div className="rounded-md border p-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span><span className="text-muted-foreground">{label}: </span>{current || "—"}</span>
        {current && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onPick(null)}>Clear</Button>}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies to change it" aria-label={`Search for ${label}`} className="mt-2 h-8 text-[13px]" />
      {rows.length > 0 && (
        <ul className="mt-1 divide-y rounded-md border">
          {rows.map((c) => (
            <li key={c.company_id}>
              <button type="button" disabled={busy} className="w-full px-2.5 py-1.5 text-left hover:bg-muted"
                      onClick={() => { onPick(c.company_id); setQ(""); }}>
                {c.name} <span className="text-[11px] text-muted-foreground">{c.domains.join(", ")} · {c.verification_status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, verified, source, onVerify, onRemove }: { label: string; verified?: boolean; source?: string; onVerify?: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[13px]">
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {source}
        {onVerify && (
          <button type="button" onClick={onVerify} className={verified ? "text-emerald-600" : "hover:text-foreground"} title={verified ? "Verified — click to mark unverified" : "Mark verified"}>
            <BadgeCheck className="h-4 w-4" />
          </button>
        )}
        {onRemove && <button type="button" onClick={onRemove} className="hover:text-destructive" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>}
      </span>
    </div>
  );
}

function AddRow({ ident, setIdent, busy, actions, extraPlaceholder, onAdd }: {
  ident: { value: string; extra: string }; setIdent: (v: { value: string; extra: string }) => void; busy: boolean;
  actions: Array<[string, string]>; extraPlaceholder: string; onAdd: (op: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Input value={ident.value} onChange={(e) => setIdent({ ...ident, value: e.target.value })} placeholder="Value" className="h-8 min-w-[10rem] flex-1 text-[13px]" />
      <Input value={ident.extra} onChange={(e) => setIdent({ ...ident, extra: e.target.value })} placeholder={extraPlaceholder} className="h-8 w-44 text-[13px]" />
      {actions.map(([label, op]) => (
        <Button key={op} size="sm" variant="outline" disabled={busy || !ident.value.trim()} onClick={() => onAdd(op)}>{label}</Button>
      ))}
    </div>
  );
}

function Related({ entity, detail }: { entity: Entity; detail: Detail }) {
  const items = (key: string) => (detail[key] as Array<Record<string, unknown>> | undefined) ?? [];
  if (entity === "company") {
    return (
      <Section title="Linked records">
        <p className="text-[13px]">{items("contacts").length} contacts · {String(detail.registrations ?? 0)} registrations · {items("sponsors").length} sponsor records · {items("subsidiaries").length} subsidiaries</p>
        {items("merged_from").length > 0 && <p className="text-[12px] text-muted-foreground">Merged in: {items("merged_from").map((m) => String(m.name)).join(", ")}</p>}
        <ul className="max-h-48 space-y-1 overflow-y-auto text-[13px]">
          {items("contacts").map((c) => <li key={String(c.id)}>{String(c.name ?? "—")} <span className="text-muted-foreground">{String(c.designation ?? "")}</span></li>)}
        </ul>
      </Section>
    );
  }
  return (
    <Section title="Linked records">
      <div className="space-y-1 text-[13px]">
        {items("registrations").map((r) => (
          <div key={String(r.id)} className="rounded-md border px-2.5 py-1.5">
            <span className="font-medium">{String(r.event ?? "Event")}</span>
            <span className="text-muted-foreground"> · registered as {String(r.name)} ({String(r.email)}) · {String(r.company ?? "—")} · {String(r.approval_status)}{r.checked_in ? " · checked in" : ""}</span>
          </div>
        ))}
        {items("speakers").map((s) => <div key={String(s.id)} className="rounded-md border px-2.5 py-1.5">Speaker: {String(s.name)} · {(s.events as string[] | undefined)?.join(", ") || "no events"}</div>)}
        {items("sponsor_contacts").map((m) => <div key={String(m.id)} className="rounded-md border px-2.5 py-1.5">Sponsor team: {String(m.sponsor)} · {m.accepted_at ? "active" : "invited"}</div>)}
        {items("organisations").map((o, i) => <div key={i} className="rounded-md border px-2.5 py-1.5">Workspace: {String(o.org)} ({String(o.role)})</div>)}
        {items("affiliations").map((a) => <div key={String(a.id)} className="rounded-md border px-2.5 py-1.5">Affiliation: {String(a.company)} {a.designation ? `· ${String(a.designation)}` : ""} {a.is_current ? "(current)" : ""}</div>)}
        {items("registrations").length + items("speakers").length + items("sponsor_contacts").length === 0 && <p className="text-muted-foreground">No event records.</p>}
      </div>
    </Section>
  );
}

export default RecordDrawer;
