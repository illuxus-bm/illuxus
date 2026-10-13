/**
 * OrganizationPage — everything about the workspace itself, in one place:
 * its details and plan, its brand kit, and its public landing page.
 *
 * The open tab is kept in the URL (`?tab=brand`) so each one can be linked to.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Layout, Loader2, Palette } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import BrandKitPanel from "@/components/organization/BrandKitPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg, PLAN_DETAILS } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const OrgPageForm = lazy(() => import("@/components/event/page-builder/OrgPageForm"));

const TABS = [
  { id: "details", label: "Details", icon: Building2 },
  { id: "brand", label: "Brand kit", icon: Palette },
  { id: "landing", label: "Landing page", icon: Layout },
] as const;
type TabId = (typeof TABS)[number]["id"];

const OrganizationPage = () => {
  const { user, isAdmin } = useAuth();
  const { org, myRole, memberCount, refreshOrg } = useOrg();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  // Owners and admins manage the workspace (mirrors `is_org_manager`).
  const canManage = !!org && (org.owner_id === user?.id || myRole === "owner" || myRole === "admin" || isAdmin);
  // Viewers are read-only, so the landing page editor isn't offered to them.
  const tabs = TABS.filter((t) => t.id !== "landing" || myRole !== "viewer");
  const requested = params.get("tab");
  const tab: TabId = tabs.some((t) => t.id === requested) ? (requested as TabId) : "details";

  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setBillingEmail(org.billing_email || "");
  }, [org]);

  const saveDetails = async () => {
    if (!org || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({ name: name.trim(), billing_email: billingEmail.trim() || null })
      .eq("id", org.id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Organization updated" });
    await refreshOrg();
  };

  if (!org) {
    return (
      <DashboardLayout>
        <p className="py-16 text-center text-[13px] text-muted-foreground">You aren't part of an organization yet.</p>
      </DashboardLayout>
    );
  }

  const detailsChanged = name.trim() !== org.name || (billingEmail.trim() || null) !== (org.billing_email || null);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {org.logo_url ? (
              <img loading="lazy" decoding="async" src={org.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-sm font-semibold">
                {org.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{org.name}</h1>
              <p className="text-[13px] text-muted-foreground">Organization details, brand kit and landing page</p>
            </div>
          </div>
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Organization">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setParams(t.id === "details" ? {} : { tab: t.id }, { replace: true })}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {tab === "details" && (
          <div className="grid max-w-[900px] gap-4">
            <div className="space-y-5 rounded-lg border border-border bg-card p-5">
              <div>
                <h2 className="text-sm font-semibold">Organization details</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {canManage ? "Manage your workspace information" : "Only owners and admins can change these."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label htmlFor="org-name" className="text-[13px]">Organization name</Label>
                  <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 text-sm" disabled={!canManage} maxLength={120} />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="org-billing-email" className="text-[13px]">Billing email</Label>
                  <Input id="org-billing-email" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="mt-1 h-9 text-sm" disabled={!canManage} placeholder="billing@example.com" />
                </div>
              </div>
              {canManage && (
                <Button onClick={() => void saveDetails()} disabled={saving || !detailsChanged || !name.trim()} size="sm" className="h-8 text-[13px]">
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Plan & usage</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Current plan", PLAN_DETAILS[org.plan || "free"]?.name || org.plan],
                  ["Your role", org.owner_id === user?.id ? "Owner" : myRole || "Member"],
                  ["Team members", String(memberCount)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "brand" && user && <BrandKitPanel orgId={org.id} userId={user.id} canEdit={canManage} />}

        {/* The editor is built to fill the dashboard edge to edge; this wrapper
            gives it that room below the page header. */}
        {tab === "landing" && (
          <div className="-mx-4 -mb-4 border-t border-border p-4 lg:-mx-6 lg:-mb-6 lg:p-6">
            <Suspense fallback={<div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the landing page editor…</div>}>
              <OrgPageForm />
            </Suspense>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default OrganizationPage;
