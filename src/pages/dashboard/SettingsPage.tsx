import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  User, Shield, Bell, Building2, Users, Mail, Trash2, UserPlus, Crown, ShieldCheck, Eye, UserCog, Upload, X, Loader2
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";
import PersonFieldsForm, { type PersonFields, emptyPersonFields, displayName as buildDisplayName } from "@/components/people/PersonFieldsForm";
import { uuid } from "@/lib/uuid";

type Profile = Tables<"profiles">;

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner", icon: Crown, description: "Full control" },
  { value: "admin", label: "Admin", icon: ShieldCheck, description: "Manage settings & members" },
  { value: "member", label: "Member", icon: UserCog, description: "Create & manage events" },
  { value: "viewer", label: "Viewer", icon: Eye, description: "View only" },
];

const roleBadgeColor = (role: string) => {
  switch (role) {
    case "owner": return "bg-amber-500/15 text-amber-600 border-amber-500/20";
    case "admin": return "bg-blue-500/15 text-blue-600 border-blue-500/20";
    case "member": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/20";
    case "viewer": return "bg-muted text-muted-foreground border-border";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

const SettingsPage = () => {
  const { user, isAdmin, accountType } = useAuth();
  const { org, refreshOrg } = useOrg();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [person, setPerson] = useState<PersonFields>(emptyPersonFields());
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  // Org details
  const [orgName, setOrgName] = useState("");
  const [orgBillingEmail, setOrgBillingEmail] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // Team
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .rpc("get_my_profile")
      .then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          const p = data as unknown as Record<string, string | null>;
          setBio((p.bio as string) || "");
          setAvatarUrl((p.avatar_url as string) || "");
          setPerson({
            title: (p.title as PersonFields["title"]) || "",
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            designation: p.designation || "",
            company: p.company || "",
            email: user.email || "",
            mobile_country_code: p.mobile_country_code || "",
            mobile_number: p.mobile_number || "",
            linkedin_url: p.linkedin_url || "",
            company_website: p.company_website || "",
            company_employee_count: p.company_employee_count || "",
            industry: p.industry || "",
          });
        }
      });
  }, [user]);

  useEffect(() => {
    if (org) {
      setOrgName(org.name);
      setOrgBillingEmail(org.billing_email || "");
    }
  }, [org]);

  useEffect(() => {
    if (activeTab === "team" && org) fetchTeam();
  }, [activeTab, org]);

  const fetchTeam = async () => {
    if (!org) return;
    setLoadingTeam(true);
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from("org_members")
        .select("id, user_id, role, joined_at")
        .eq("org_id", org.id),
      supabase
        .from("org_invitations")
        .select("*")
        .eq("org_id", org.id)
        .eq("status", "pending"),
    ]);

    if (membersRes.data) {
      // Fetch profiles for members
      const userIds = membersRes.data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      setMembers(
        membersRes.data.map((m) => ({
          ...m,
          profile: profileMap.get(m.user_id),
        }))
      );
    }
    setInvitations(invitesRes.data || []);
    setLoadingTeam(false);
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    setSaving(true);
    const fullName = buildDisplayName(person);
    const updatePayload = {
      display_name: fullName || null,
      bio,
      avatar_url: avatarUrl || null,
      title: person.title || null,
      first_name: person.first_name || null,
      last_name: person.last_name || null,
      designation: person.designation || null,
      company: person.company || null,
      mobile_country_code: person.mobile_country_code || null,
      mobile_number: person.mobile_number || null,
      linkedin_url: person.linkedin_url || null,
      company_website: person.company_website || null,
      company_employee_count: person.company_employee_count || null,
      industry: person.industry || null,
    };
    const { error } = await supabase
      .from("profiles")
      .update(updatePayload as never)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 5 MB.", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingAvatar(false);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    setAvatarUrl(url);
    await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    setUploadingAvatar(false);
    toast({ title: "Photo updated" });
  };

  const handleAvatarRemove = async () => {
    if (!user) return;
    setAvatarUrl("");
    await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    toast({ title: "Photo removed" });
  };

  const handleSaveOrg = async () => {
    if (!org) return;
    setSavingOrg(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: orgName.trim(),
        billing_email: orgBillingEmail || null,
      })
      .eq("id", org.id);
    setSavingOrg(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Organization updated" });
      await refreshOrg();
    }
  };

  const handleInvite = async () => {
    if (!org || !user || !inviteEmail.trim()) return;
    setInviting(true);
    const { data: invitation, error } = await supabase.from("org_invitations").insert({
      org_id: org.id,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: user.id,
    }).select("token").single();
    setInviting(false);
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "This email has already been invited" : error.message, variant: "destructive" });
    } else {
      // Send invite email via edge function (best-effort — invite is saved even if email fails)
      const inviteUrl = `${window.location.origin}/login?invite=${invitation?.token || ""}`;
      supabase.functions.invoke("send-event-email", {
        body: {
          event_id: "invite",
          email_id: invitation?.token || uuid(),
          subject: `You're invited to join ${org.name} on Illuxus`,
          body: `Hi!\n\n${user.email} has invited you to join "${org.name}" as a ${inviteRole}.\n\nClick the link below to accept:\n${inviteUrl}\n\nIf you don't have an account yet, you'll be able to create one when you click the link.\n\nBest,\nThe Illuxus Team`,
          recipient_emails: [inviteEmail.trim().toLowerCase()],
        },
      }).catch(() => { /* non-fatal if edge function not deployed */ });

      toast({ title: "Invitation sent", description: `Invited ${inviteEmail} as ${inviteRole}` });
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteDialog(false);
      fetchTeam();
    }
  };

  const handleCancelInvite = async (id: string) => {
    await supabase.from("org_invitations").delete().eq("id", id);
    toast({ title: "Invitation cancelled" });
    fetchTeam();
  };

  const handleUpdateMemberRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from("org_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Role updated" });
      fetchTeam();
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user?.id) {
      toast({ title: "Error", description: "You cannot remove yourself", variant: "destructive" });
      return;
    }
    await supabase.from("org_members").delete().eq("id", memberId);
    toast({ title: "Member removed" });
    fetchTeam();
  };

  const isOwner = org?.owner_id === user?.id;

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    ...(org ? [
      { id: "organization", label: "Organization", icon: Building2 },
      { id: "team", label: "Team", icon: Users },
    ] : []),
    { id: "account", label: "Account", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  const isAttendee = accountType === "attendee" && !isAdmin && !org;

  const settingsContent = (
    <>
      <div className="max-w-[900px] space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted-foreground">
            {isAttendee ? "Manage your profile and account" : "Manage your account, organization, and team"}
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-5">
          <div className="md:w-48 shrink-0">
            <nav className="flex md:flex-col gap-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors text-left ${
                    activeTab === tab.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-w-0">
            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="bg-card border border-border rounded-lg p-5 space-y-5">
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-foreground/10 flex items-center justify-center text-lg font-semibold shrink-0">
                      {(person.first_name || user?.email || "U")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{buildDisplayName(person) || "Set your name"}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{user?.email}</p>
                    {isAdmin && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent/15 text-accent">Admin</span>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-border text-[12px] cursor-pointer hover:bg-muted/50">
                        <Upload className="h-3 w-3" />
                        {uploadingAvatar ? "Uploading…" : "Upload photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingAvatar}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleAvatarUpload(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={handleAvatarRemove}
                          className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[12px] text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <PersonFieldsForm value={person} onChange={setPerson} hideEmail />
                <div>
                  <Label className="text-[13px]">Bio</Label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Tell us about yourself..."
                  />
                </div>
                <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="h-8 text-[13px]">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}

            {/* Organization Tab */}
            {activeTab === "organization" && org && (
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-lg p-5 space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold">Organization Details</h2>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Manage your workspace information</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-[13px]">Organization Name</Label>
                      <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1 h-8 text-sm" disabled={!isOwner} />
                    </div>
                    <div>
                      <Label className="text-[13px]">Billing Email</Label>
                      <Input value={orgBillingEmail} onChange={(e) => setOrgBillingEmail(e.target.value)} className="mt-1 h-8 text-sm" disabled={!isOwner} placeholder="billing@example.com" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="text-[13px] font-medium">Webinar branding overlays (default)</p>
                      <p className="text-[12px] text-muted-foreground">Show logo, lower-thirds and banners on stage. Each event can override.</p>
                    </div>
                    <Switch
                      checked={org.webinar_branding_enabled ?? true}
                      disabled={!isOwner}
                      onCheckedChange={async (v) => {
                        await supabase.from("organizations").update({ webinar_branding_enabled: v }).eq("id", org.id);
                        await refreshOrg();
                      }}
                    />
                  </div>
                  {isOwner && (
                    <Button onClick={handleSaveOrg} disabled={savingOrg} size="sm" className="h-8 text-[13px]">
                      {savingOrg ? "Saving..." : "Save Changes"}
                    </Button>
                  )}
                </div>

                <div className="bg-card border border-border rounded-lg p-5 space-y-3">
                  <h2 className="text-sm font-semibold">Plan & Usage</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-md bg-muted/30 border border-border">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Current Plan</p>
                      <p className="text-sm font-semibold mt-0.5 capitalize">{org.plan}</p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/30 border border-border">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Owner</p>
                      <p className="text-sm font-semibold mt-0.5 truncate">{user?.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Team Tab */}
            {activeTab === "team" && org && (
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold">Team Members</h2>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
                    </div>
                    {isOwner && (
                      <Button size="sm" className="h-8 text-[13px] gap-1.5" onClick={() => setShowInviteDialog(true)}>
                        <UserPlus className="h-3.5 w-3.5" />
                        Invite
                      </Button>
                    )}
                  </div>

                  {loadingTeam ? (
                    <p className="text-[13px] text-muted-foreground py-4 text-center">Loading...</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-semibold shrink-0">
                            {(m.profile?.display_name || "U")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate">{m.profile?.display_name || "Unknown"}</p>
                            <p className="text-[11px] text-muted-foreground">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOwner && m.user_id !== org.owner_id ? (
                              <Select value={m.role} onValueChange={(v) => handleUpdateMemberRole(m.id, v)}>
                                <SelectTrigger className="h-7 text-[12px] w-[100px] border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((r) => (
                                    <SelectItem key={r.value} value={r.value} className="text-[12px]">
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className={`text-[11px] font-medium capitalize ${roleBadgeColor(m.role)}`}>
                                {m.role}
                              </Badge>
                            )}
                            {isOwner && m.user_id !== org.owner_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveMember(m.id, m.user_id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending Invitations */}
                {invitations.length > 0 && (
                  <div className="bg-card border border-border rounded-lg p-5">
                    <h2 className="text-sm font-semibold mb-3">Pending Invitations</h2>
                    <div className="divide-y divide-border">
                      {invitations.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate">{inv.email}</p>
                            <p className="text-[11px] text-muted-foreground">Invited {new Date(inv.created_at).toLocaleDateString()}</p>
                          </div>
                          <Badge variant="outline" className={`text-[11px] font-medium capitalize ${roleBadgeColor(inv.role)}`}>
                            {inv.role}
                          </Badge>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleCancelInvite(inv.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Role Legend */}
                <div className="bg-card border border-border rounded-lg p-5">
                  <h2 className="text-sm font-semibold mb-3">Role Permissions</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((r) => (
                      <div key={r.value} className="flex items-center gap-2.5 p-2.5 rounded-md bg-muted/30">
                        <r.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[13px] font-medium">{r.label}</p>
                          <p className="text-[11px] text-muted-foreground">{r.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Account Tab */}
            {activeTab === "account" && (
              <div className="bg-card border border-border rounded-lg p-5 space-y-4">
                <h2 className="text-sm font-semibold">Account</h2>
                <div className="space-y-3">
                  <div>
                    <Label className="text-[13px]">Email</Label>
                    <Input value={user?.email || ""} disabled className="mt-1 h-8 text-sm bg-muted/30" />
                  </div>
                  <div>
                    <Label className="text-[13px]">Role</Label>
                    <Input value={isAdmin ? "Admin" : "User"} disabled className="mt-1 h-8 text-sm bg-muted/30" />
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === "notifications" && (
              <NotificationsTab userId={user?.id} />
            )}
          </div>
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Invite Team Member</DialogTitle>
            <DialogDescription className="text-[13px]">
              Send an invitation to join your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[13px]">Email Address</Label>
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                type="email"
                className="mt-1.5 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[13px]">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1.5 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.filter((r) => r.value !== "owner").map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div className="flex items-center gap-2">
                        <r.icon className="h-3.5 w-3.5" />
                        <span>{r.label}</span>
                        <span className="text-muted-foreground ml-1">— {r.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowInviteDialog(false)} className="h-8 text-[13px]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="h-8 text-[13px] gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (isAttendee) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="max-w-[900px] mx-auto px-4 py-8">
          {settingsContent}
        </main>
      </div>
    );
  }

  return (
    <DashboardLayout>
      {settingsContent}
    </DashboardLayout>
  );
};

export default SettingsPage;

// ─── Notifications Tab ────────────────────────────────────────────────────────
// Preferences are stored in profiles.video_fx_prefs (a jsonb column that
// already exists in the schema) under the key "notification_prefs" so we
// don't need a new DB table or column.

const NOTIF_OPTIONS = [
  { key: "new_attendee_email",    label: "Email notifications for new attendees",     desc: "Receive an email each time someone registers for your event." },
  { key: "event_reminder_email",  label: "Event reminder emails",                     desc: "Get a reminder email 24 hours before each event starts."      },
  { key: "weekly_digest_email",   label: "Weekly analytics digest",                   desc: "A weekly summary of registrations, revenue, and check-ins."   },
] as const;

type NotifKey = (typeof NOTIF_OPTIONS)[number]["key"];
type NotifPrefs = Record<NotifKey, boolean>;

const DEFAULT_PREFS: NotifPrefs = {
  new_attendee_email:   true,
  event_reminder_email: true,
  weekly_digest_email:  true,
};

function NotificationsTab({ userId }: { userId: string | undefined }) {
  const { toast } = useToast();
  const [prefs, setPrefs]     = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("video_fx_prefs")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.video_fx_prefs) {
          const stored = (data.video_fx_prefs as Record<string, unknown>)["notification_prefs"];
          if (stored && typeof stored === "object") {
            setPrefs({ ...DEFAULT_PREFS, ...(stored as Partial<NotifPrefs>) });
          }
        }
        setLoading(false);
      });
  }, [userId]);

  const toggle = (key: NotifKey) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    // Read current video_fx_prefs so we only patch the notification_prefs key
    const { data: current } = await supabase
      .from("profiles")
      .select("video_fx_prefs")
      .eq("user_id", userId)
      .maybeSingle();

    const merged = {
      ...((current?.video_fx_prefs as Record<string, unknown>) ?? {}),
      notification_prefs: prefs,
    };

    const { error } = await supabase
      .from("profiles")
      .update({ video_fx_prefs: merged })
      .eq("user_id", userId);

    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else       toast({ title: "Notification preferences saved" });
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Choose which emails you want to receive. Changes are saved to your profile.
        </p>
      </div>

      <div className="space-y-3">
        {NOTIF_OPTIONS.map((opt) => (
          <div
            key={opt.key}
            className="flex items-center justify-between gap-4 p-3 rounded-md border border-border hover:bg-muted/30 transition-colors"
          >
            <div>
              <p className="text-[13px] font-medium">{opt.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
            </div>
            <Switch
              checked={prefs[opt.key]}
              onCheckedChange={() => toggle(opt.key)}
              aria-label={opt.label}
            />
          </div>
        ))}
      </div>

      <Button
        size="sm"
        className="h-8 text-[13px] gap-1.5"
        onClick={save}
        disabled={saving}
      >
        {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save Preferences"}
      </Button>
    </div>
  );
}
