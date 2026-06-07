import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Building2, Users, Calendar, Crown, Shield, UserCheck, Trash2, Layers, ArrowRight, ShieldCheck, ShieldOff, ScrollText } from "lucide-react";
import { Pencil, X as XIcon, Check as CheckIcon, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { sanitizeHandleInput, validateHandle } from "@/lib/workspace-handle";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
  billing_email: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  created_at: string;
  member_count: number;
  event_count: number;
}

interface UserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  org_name: string | null;
  org_plan: string | null;
  is_platform_admin: boolean;
}

const PLANS = ["free", "starter", "pro", "business"];

const planColor: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/10 text-blue-600",
  pro: "bg-violet-500/10 text-violet-600",
  business: "bg-amber-500/10 text-amber-600",
};

function RoleToggleCell({
  row, isCurrentUser, adminCount, busy, onToggle,
}: {
  row: UserRow;
  isCurrentUser: boolean;
  adminCount: number;
  busy: boolean;
  onToggle: () => void;
}) {
  // Disable revoking your own super admin role to prevent self-lockout.
  // Also disable revoking the very last super admin (server enforces too).
  const isLastAdmin = row.is_platform_admin && adminCount <= 1;
  const blockSelfRevoke = isCurrentUser && row.is_platform_admin;
  const disabledReason = blockSelfRevoke
    ? "You can't revoke your own super admin role. Ask another super admin to do it."
    : isLastAdmin
    ? "This is the last super admin on the platform. Promote someone else first."
    : null;

  if (row.is_platform_admin) {
    const button = (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-[11px] gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        disabled={busy || !!disabledReason}
        onClick={onToggle}
      >
        <ShieldOff className="h-3 w-3" />
        {isCurrentUser ? "Revoke (you)" : "Revoke"}
      </Button>
    );
    if (disabledReason) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">{button}</span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[240px] text-[11px]">
            {disabledReason}
          </TooltipContent>
        </Tooltip>
      );
    }
    return button;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-[11px] gap-1.5"
      disabled={busy}
      onClick={onToggle}
    >
      <ShieldCheck className="h-3 w-3" /> Make super admin
    </Button>
  );
}

export default function AdminPanelPage() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; subdomain: string; billing_email: string }>({
    name: "", subdomain: "", billing_email: "",
  });
  const [savingOrg, setSavingOrg] = useState(false);

  const fetchData = async () => {
    const [orgRes, userRes] = await Promise.all([
      supabase.rpc("admin_list_orgs"),
      supabase.rpc("admin_list_users"),
    ]);
    if (orgRes.data) setOrgs(orgRes.data as OrgRow[]);
    if (userRes.data) setUsers(userRes.data as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);

  const handlePlanChange = async (orgId: string, newPlan: string) => {
    const { error } = await supabase.rpc("admin_update_org_plan", {
      _org_id: orgId,
      _new_plan: newPlan,
    });
    if (error) {
      toast.error("Failed to update plan");
      return;
    }
    toast.success("Plan updated");
    setOrgs((prev) => prev.map((o) => (o.id === orgId ? { ...o, plan: newPlan } : o)));
  };

  const startEditOrg = (org: OrgRow) => {
    setEditingOrgId(org.id);
    setEditForm({
      name: org.name,
      subdomain: org.subdomain || "",
      billing_email: org.billing_email || "",
    });
  };

  const saveOrgEdit = async () => {
    if (!editingOrgId) return;
    setSavingOrg(true);
    const { error } = await (supabase.rpc as any)("admin_update_org", {
      _org_id: editingOrgId,
      _name: editForm.name,
      _subdomain: editForm.subdomain,
      _billing_email: editForm.billing_email,
    });
    setSavingOrg(false);
    if (error) {
      toast.error(error.message || "Failed to update organization");
      return;
    }
    toast.success("Organization updated");
    setOrgs((prev) =>
      prev.map((o) =>
        o.id === editingOrgId
          ? {
              ...o,
              name: editForm.name || o.name,
              subdomain: editForm.subdomain ? editForm.subdomain.toLowerCase() : null,
              billing_email: editForm.billing_email || null,
            }
          : o
      )
    );
    setEditingOrgId(null);
  };

  const handleDeleteOrg = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.rpc("admin_delete_org", { _org_id: deleteTarget.id });
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete organization");
      return;
    }
    toast.success(`"${deleteTarget.name}" deleted`);
    setDeleteTarget(null);
    setOrgs((prev) => prev.filter((o) => o.id !== deleteTarget.id));
  };

  const togglePlatformAdmin = async (target: UserRow) => {
    setTogglingRole(target.user_id);
    const grant = !target.is_platform_admin;
    const { error } = await supabase.rpc("admin_set_user_role", {
      _target_user_id: target.user_id,
      _role: "admin",
      _grant: grant,
    });
    setTogglingRole(null);
    if (error) {
      toast.error(error.message || "Failed to update role");
      return;
    }
    toast.success(grant ? "Granted super admin" : "Revoked super admin");
    setUsers((prev) =>
      prev.map((u) => (u.user_id === target.user_id ? { ...u, is_platform_admin: grant } : u))
    );
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const stats = [
    { label: "Organizations", value: orgs.length, icon: Building2 },
    { label: "Users", value: users.length, icon: Users },
    { label: "Total Events", value: orgs.reduce((s, o) => s + o.event_count, 0), icon: Calendar },
    { label: "Paid Plans", value: orgs.filter((o) => o.plan !== "free").length, icon: Crown },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Manage all organizations and users across the platform</p>
          </div>
          <div className="ml-auto">
            <Button variant="outline" size="sm" asChild className="h-8 text-[12px] mr-2">
              <Link to="/dashboard/admin/audit">
                <ScrollText className="h-3.5 w-3.5 mr-1.5" /> Audit log
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 text-[12px]">
              <Link to="/dashboard/admin/site">
                <Layers className="h-3.5 w-3.5 mr-1.5" /> Edit landing page
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="border border-border rounded-xl p-4 bg-card">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{loading ? "—" : s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="orgs" className="space-y-4">
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="orgs" className="text-[13px] h-7 gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Organizations
            </TabsTrigger>
            <TabsTrigger value="users" className="text-[13px] h-7 gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orgs">
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Organization</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Plan</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Members</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Events</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Created</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
                  ) : orgs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No organizations yet</td></tr>
                  ) : (
                    orgs.map((org) => {
                      const isEditing = editingOrgId === org.id;
                      return (
                        <Fragment key={org.id}>
                          <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium">{org.name}</p>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                  <span className="opacity-60">{org.slug}</span>
                                  {org.subdomain && (
                                    <span className="inline-flex items-center gap-0.5 text-foreground/70">
                                      · <Globe className="h-2.5 w-2.5" /> /{org.subdomain}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={org.plan}
                                onValueChange={(val) => handlePlanChange(org.id, val)}
                              >
                                <SelectTrigger className="h-7 w-[110px] text-[11px] font-semibold uppercase">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PLANS.map((p) => (
                                    <SelectItem key={p} value={p} className="text-[12px] uppercase font-medium">
                                      {p}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">{org.member_count}</td>
                            <td className="px-4 py-3 hidden md:table-cell">{org.event_count}</td>
                            <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                              {format(new Date(org.created_at), "MMM d, yyyy")}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => (isEditing ? setEditingOrgId(null) : startEditOrg(org))}
                                  aria-label={isEditing ? "Close editor" : "Edit organization"}
                                >
                                  {isEditing ? <XIcon className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteTarget(org)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isEditing && (
                            <tr className="bg-muted/20 border-b border-border/50">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
                                  <div>
                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</Label>
                                    <Input
                                      value={editForm.name}
                                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                      className="h-8 mt-1 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Workspace handle</Label>
                                    <Input
                                      value={editForm.subdomain}
                                      onChange={(e) =>
                                        setEditForm((f) => ({
                                          ...f,
                                          subdomain: sanitizeHandleInput(e.target.value),
                                        }))
                                      }
                                      placeholder="acme"
                                      className="h-8 mt-1 text-sm font-mono"
                                    />
                                    {editForm.subdomain && !validateHandle(editForm.subdomain).ok && (
                                      <p className="text-[11px] text-destructive mt-1">
                                        {validateHandle(editForm.subdomain).message}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Billing email</Label>
                                    <Input
                                      type="email"
                                      value={editForm.billing_email}
                                      onChange={(e) => setEditForm((f) => ({ ...f, billing_email: e.target.value }))}
                                      placeholder="billing@acme.com"
                                      className="h-8 mt-1 text-sm"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-3">
                                  <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => setEditingOrgId(null)}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" className="h-7 text-[12px] gap-1" onClick={saveOrgEdit} disabled={savingOrg}>
                                    <CheckIcon className="h-3 w-3" /> {savingOrg ? "Saving…" : "Save"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">User</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Organization</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Plan</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Status</th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden lg:table-cell">Joined</th>
                    <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Platform role</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No users yet</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-semibold shrink-0">
                              {(u.display_name || "?").slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{u.display_name || "Unknown"}</p>
                              {u.is_platform_admin && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-semibold uppercase tracking-wider mt-0.5">
                                  <Shield className="h-2.5 w-2.5" /> Super admin
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.org_name || "—"}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {u.org_plan ? (
                            <Badge variant="secondary" className={`text-[10px] font-semibold uppercase ${planColor[u.org_plan] || ""}`}>
                              {u.org_plan}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {u.onboarding_completed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
                              <UserCheck className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                          {format(new Date(u.created_at), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RoleToggleCell
                            row={u}
                            isCurrentUser={u.user_id === user?.id}
                            adminCount={users.filter((x) => x.is_platform_admin).length}
                            busy={togglingRole === u.user_id}
                            onToggle={() => togglePlatformAdmin(u)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> along with all its members, events, and subscription. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteOrg} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
