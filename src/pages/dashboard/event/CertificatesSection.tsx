/**
 * CertificatesSection — the event's Certificates tab.
 *
 *   Templates  your saved templates and the built-in gallery
 *   Issue      choose a published template and who receives one (all
 *              registered attendees or only checked-in ones), preview, issue,
 *              download and email
 *   Issued     every certificate, with download, email, verification link
 *              and revocation
 *
 * Permissions are enforced by the database (migration 047); the checks here
 * only decide which buttons to show.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, FileCheck2, LayoutTemplate, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { cn } from "@/lib/utils";
import { isPreviewable, loadBrandKit, type BrandKit } from "@/lib/brand-kit";
import { buildTemplate, type TemplateSpec } from "@/lib/certificates/certificate-templates";
import { checkDesign, hasErrors, refreshPartners, type PartnerLogoRef } from "@/lib/certificates/certificate-design";
import {
  createTemplate, duplicateTemplate, explainError, loadCertificates, loadEventPartners, loadRegistrants, loadTemplates, publishTemplate,
  saveTemplate, setArchived,
  type CertificateRow, type EventContext, type Registrant, type TemplateRow,
} from "@/lib/certificates/certificate-api";
import TemplatesTab from "@/components/event/certificates/TemplatesTab";
import IssueTab from "@/components/event/certificates/IssueTab";
import IssuedTab from "@/components/event/certificates/IssuedTab";
import CertificateEditor from "@/components/event/certificates/CertificateEditor";
import type { SidebarTab } from "@/components/event/certificates/CertificateEditorSidebar";

type Tab = "templates" | "issue" | "issued";

export default function CertificatesSection({ eventId }: { eventId: string }) {
  const { user, isAdmin } = useAuth();
  const { memberships } = useOrg();
  const [event, setEvent] = useState<(EventContext & { user_id: string }) | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [partners, setPartners] = useState<PartnerLogoRef[]>([]);
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandKitError, setBrandKitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("templates");
  const [issueTemplateId, setIssueTemplateId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: TemplateRow; tab?: SidebarTab } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: ev, error } = await supabase.from("events").select("id, title, org_id, date, end_date, timezone, venue, location, user_id").eq("id", eventId).single();
      if (error || !ev) throw new Error(error?.message ?? "Event not found");
      let orgName = "";
      if (ev.org_id) {
        const { data: org } = await supabase.from("organizations").select("name").eq("id", ev.org_id).maybeSingle();
        orgName = org?.name ?? "";
      }
      const ctx = { id: ev.id, title: ev.title, org_id: ev.org_id, org_name: orgName, date: ev.date, end_date: ev.end_date, timezone: ev.timezone, venue: ev.venue, location: ev.location, user_id: ev.user_id };
      setEvent(ctx);
      if (!ev.org_id) { setLoading(false); return; }
      const [tpls, prt, regs, certs] = await Promise.all([loadTemplates(ev.org_id), loadEventPartners(ev.id), loadRegistrants(ev.id), loadCertificates(ev.id)]);
      setTemplates(tpls);
      setPartners(prt);
      setRegistrants(regs);
      setCertificates(certs);
      loadBrandKit(ev.org_id).then((k) => setBrandKit(k.kit)).catch((e: Error) => setBrandKitError(e.message));
    } catch (err) {
      setLoadError(explainError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const canEdit = useMemo(() => {
    if (!event || !user) return false;
    if (isAdmin || event.user_id === user.id) return true;
    const m = memberships.find((x) => x.org_id === event.org_id);
    return !!m && m.role !== "viewer";
  }, [event, user, isAdmin, memberships]);

  const brandLogo = useMemo(() => {
    if (!brandKit) return null;
    const a = [brandKit.logos.cmyk, brandKit.logos.black, brandKit.logos.white, brandKit.logos.icon].find((x) => isPreviewable(x));
    return a?.url ?? null;
  }, [brandKit]);

  const upsertRow = (row: TemplateRow) => setTemplates((list) => [row, ...list.filter((t) => t.id !== row.id)]);
  const run = async <T,>(id: string, fn: () => Promise<T>, fail: string): Promise<T | null> => {
    setBusyId(id);
    try { return await fn(); }
    catch (err) { toast.error(fail, { description: err instanceof Error ? err.message : String(err) }); return null; }
    finally { setBusyId(null); }
  };

  const openEditor = (row: TemplateRow, initialTab?: SidebarTab) =>
    setEditing({ row: { ...row, design: refreshPartners(row.design, partners) }, tab: initialTab });

  const fromBuiltIn = async (spec: TemplateSpec) => {
    if (!event?.org_id) return null;
    return createTemplate({ orgId: event.org_id, eventId: event.id, name: spec.name, category: spec.category, source: spec.id, design: buildTemplate(spec, { logoUrl: brandLogo }) });
  };

  /** Publishes (if needed) and goes to Issue — or opens the editor on what still needs doing. */
  const startIssuing = async (row: TemplateRow) => {
    const issues = checkDesign(row.design);
    if (hasErrors(issues)) {
      toast.info("Almost there", { description: issues.filter((i) => i.level === "error").map((i) => i.message).join(" ") + " Then publish." });
      openEditor(row, issues.some((i) => /Signature/.test(i.message)) ? "signatures" : "fields");
      return;
    }
    const changed = row.status !== "published" || (row.published_at && new Date(row.updated_at).getTime() - new Date(row.published_at).getTime() > 2000);
    if (changed) {
      const v = await run(row.id, () => publishTemplate(row.id), "Could not publish");
      if (!v) return;
      upsertRow({ ...row, status: "published", current_version: v.version, published_version_id: v.versionId, published_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      toast.success(`Published “${row.name}” (v${v.version})`);
    }
    setIssueTemplateId(row.id);
    setTab("issue");
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading certificates…</div>;
  }
  if (loadError) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-[13px] text-destructive">{loadError}</div>;
  }
  if (!event) return null;
  if (!event.org_id) {
    return <div className="rounded-xl border border-border p-6 text-[13px] text-muted-foreground">Certificates are available for events that belong to a workspace.</div>;
  }

  const published = templates.filter((t) => t.status === "published" && (t.event_id === null || t.event_id === event.id)).length;
  const tabs: { id: Tab; label: string; icon: typeof Award; count?: number }[] = [
    { id: "templates", label: "Templates", icon: LayoutTemplate },
    { id: "issue", label: "Issue", icon: Send, count: published || undefined },
    { id: "issued", label: "Issued", icon: FileCheck2, count: certificates.length || undefined },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Award className="h-5 w-5" />Certificates</h1>
          <p className="text-[13px] text-muted-foreground">Design certificates, issue them to attendees, and let anyone verify them by QR code.</p>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors", tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
              {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-[10.5px]", tab === t.id ? "bg-background/20" : "bg-muted")}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">You have view-only access to this workspace, so you can look at templates but not change or issue them.</p>
      )}

      {tab === "templates" && (
        <TemplatesTab
          event={event}
          templates={templates}
          registrants={registrants}
          canEdit={canEdit}
          busyId={busyId}
          logoUrl={brandLogo}
          onCustomizeBuiltIn={async (spec) => { const row = await run(spec.id, () => fromBuiltIn(spec), "Could not create the template"); if (row) { upsertRow(row); openEditor(row, "layouts"); } }}
          onUseBuiltIn={async (spec) => { const row = await run(spec.id, () => fromBuiltIn(spec), "Could not create the template"); if (row) { upsertRow(row); void startIssuing(row); } }}
          onEdit={(row) => openEditor(row)}
          onUse={(row) => void startIssuing(row)}
          onDuplicate={async (row) => { const copy = await run(row.id, () => duplicateTemplate(row, event.id), "Could not duplicate"); if (copy) { upsertRow(copy); toast.success("Duplicated"); } }}
          onRename={async (row, name) => { const r = await run(row.id, () => saveTemplate(row.id, { name }), "Could not rename"); if (r) upsertRow(r); }}
          onArchive={async (row, archived) => { const r = await run(row.id, () => setArchived(row.id, archived), archived ? "Could not archive" : "Could not restore"); if (r) { upsertRow(r); toast.success(archived ? "Archived" : "Restored"); } }}
          onShare={async (row, allEvents) => { const r = await run(row.id, () => saveTemplate(row.id, { eventId: allEvents ? null : event.id }), "Could not update"); if (r) { upsertRow(r); toast.success(allEvents ? "Available to all your events" : "Limited to this event"); } }}
        />
      )}

      {tab === "issue" && (
        <IssueTab
          event={event}
          templates={templates}
          registrants={registrants}
          certificates={certificates}
          canEdit={canEdit}
          userId={user?.id ?? null}
          templateId={issueTemplateId}
          onTemplateId={setIssueTemplateId}
          onIssued={setCertificates}
          onGoToTemplates={() => setTab("templates")}
          onGoToIssued={() => setTab("issued")}
        />
      )}

      {tab === "issued" && (
        <IssuedTab event={event} certificates={certificates} canEdit={canEdit} userId={user?.id ?? null} onChanged={setCertificates} />
      )}

      {editing && (
        <CertificateEditor
          key={editing.row.id}
          template={editing.row}
          event={event}
          brandKit={brandKit}
          brandKitError={brandKitError}
          partners={partners}
          registrants={registrants}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={upsertRow}
          onSavedAsNew={(row) => { upsertRow(row); setEditing({ row }); }}
        />
      )}
    </div>
  );
}
