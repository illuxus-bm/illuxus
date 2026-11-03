import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import SiteHeader from "@/components/SiteHeader";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  User, Shield, Bell, Upload, X, Loader2
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import PersonFieldsForm, { type PersonFields, emptyPersonFields, displayName as buildDisplayName } from "@/components/people/PersonFieldsForm";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { ProfileSuggestions } from "@/components/intelligence/ProfileSuggestions";
import { friendlyError } from "@/lib/friendly-error";

type Profile = Tables<"profiles">;

const SettingsPage = () => {
  const { user, isAdmin, accountType } = useAuth();
  const { org } = useOrg();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [person, setPerson] = useState<PersonFields>(emptyPersonFields());
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [params] = useSearchParams();

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
    if (error) toast({ title: "Error", description: friendlyError(error), variant: "destructive" });
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


  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "account", label: "Account", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  const isAttendee = accountType === "attendee" && !isAdmin && !org;

  // The team moved to Organization → Team; keep old links working.
  if (params.get("tab") === "team" && org) return <Navigate to="/dashboard/organization?tab=team" replace />;

  const settingsContent = (
    <>
      <div className="max-w-[900px] space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted-foreground">
            Manage your profile and account
          </p>
        </div>

        <ProfileSuggestions />

        <div className="flex flex-col md:flex-row gap-5">
          <div className="md:w-48 shrink-0 -mx-4 md:mx-0 md:overflow-visible">
            <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible px-4 md:px-0 pb-1 md:pb-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors text-left whitespace-nowrap shrink-0 md:shrink ${
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
                    <img loading="lazy" decoding="async" src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover border border-border" />
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
                <TwoFactorSettings />
                <div className="border-t border-border pt-4">
                  <h3 className="text-[13px] font-semibold">Delete my data</h3>
                  <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
                    Ask us to permanently delete your account and personal data. Our privacy team confirms the request
                    and writes back to you; you can track it with the reference you are given.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3 h-8 text-[12px] text-destructive hover:text-destructive">
                    <Link to="/data-deletion">Request deletion of my data</Link>
                  </Button>
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
    if (error) toast({ title: "Error", description: friendlyError(error), variant: "destructive" });
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
