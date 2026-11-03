import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ClipboardList, Download, Heart, LogOut, Moon, Settings, ShieldCheck, Ticket, Users2, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/contexts/ThemeContext";
import { collectMyData, downloadJson, exportFileName, type ExportClient } from "@/lib/data-export";

interface FollowedOrg {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  logo_url: string | null;
}

/** Lu.ma-style attendee profile + followed organizations. */
export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [followed, setFollowed] = useState<FollowedOrg[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username, headline, bio, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const { data: follows } = await supabase
        .from("org_followers")
        .select("org_id")
        .eq("user_id", user.id);
      if (cancel) return;
      let orgs: FollowedOrg[] = [];
      if (follows && follows.length > 0) {
        const ids = follows.map((f) => f.org_id);
        const { data: orgRows } = await supabase
          .from("organizations")
          .select("id, name, slug, subdomain, logo_url")
          .in("id", ids);
        orgs = (orgRows ?? []) as FollowedOrg[];
      }
      const p = profile as { display_name?: string; username?: string; headline?: string; bio?: string; avatar_url?: string } | null;
      setDisplayName(p?.display_name ?? "");
      setUsername(p?.username ?? "");
      setHeadline(p?.headline ?? "");
      setBio(p?.bio ?? "");
      setAvatarUrl(p?.avatar_url ?? "");
      setFollowed(orgs);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        username: username ? username.trim().toLowerCase() : null,
        headline: headline || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
      })
      .eq("user_id", user.id);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
    setSaving(false);
  };

  const downloadMyData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const now = new Date();
      const result = await collectMyData(supabase as unknown as ExportClient, user, now);
      downloadJson(exportFileName(now), result);
      const failed = Object.values(result.data).filter((r) => "error" in r).length;
      toast(
        failed
          ? { title: "Download ready", description: `${failed} section(s) could not be read and are marked in the file.` }
          : { title: "Download ready" },
      );
    } catch (err) {
      toast({ title: "Could not prepare your data", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // Same initials as the account menu's avatar: "Asha Rao" → "AR".
  const initials = (displayName || user?.email?.split("@")[0] || "A").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-4 pb-8 pt-3 sm:py-8">
        <h1 className="sr-only">Your profile</h1>

        {/* Who you are, at a glance. */}
        {loading ? (
          <Skeleton className="h-24 rounded-2xl mb-6" />
        ) : (
          <div className="flex flex-col items-center text-center gap-3 mb-6 sm:flex-row sm:text-left sm:gap-4">
            {avatarUrl ? (
              <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-card" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-semibold ring-4 ring-card">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[22px] font-semibold tracking-tight truncate">{displayName || user?.email?.split("@")[0] || "Your profile"}</p>
              {username && <p className="text-[13px] text-muted-foreground">@{username}</p>}
              {headline && <p className="text-[13px] text-muted-foreground mt-0.5">{headline}</p>}
            </div>
          </div>
        )}

        {/* Your pages, as a grouped list (phones and tablets; the account
            menu has them on wide screens). */}
        <nav aria-label="Your pages" className="app-chrome lg:hidden mb-8 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            <ListRow to="/u/me/events" icon={Ticket} label="My tickets" />
            <ListRow to="/u/me/applications" icon={ClipboardList} label="Applications" />
            <ListRow to="/u/me/communities" icon={Users2} label="Communities" />
            <ListRow to="/u/me/settings" icon={Settings} label="Settings" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            <label className="flex h-12 items-center gap-3 px-4 text-[15px]">
              <RowIcon icon={Moon} />
              <span className="flex-1">Dark appearance</span>
              <Switch checked={theme === "dark"} onCheckedChange={(on) => setTheme(on ? "dark" : "light")} />
            </label>
            <button
              type="button"
              onClick={async () => { await signOut(); navigate("/", { replace: true }); }}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] text-destructive active:bg-muted"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10"><LogOut className="h-4 w-4" /></span>
              Sign out
            </button>
          </div>
        </nav>

        <h2 className="text-base font-semibold mb-3">Edit profile</h2>
        {loading ? (
          <Skeleton className="h-72 rounded-2xl" />
        ) : (
          <form onSubmit={save} className="bg-card border border-border rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img loading="lazy" decoding="async" src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Label className="text-[12px]">Avatar URL</Label>
                <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="h-9 mt-1 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-9 mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-[12px]">Username</Label>
                <div className="flex items-center mt-1">
                  <span className="px-2 h-9 inline-flex items-center text-[12px] text-muted-foreground bg-muted border border-r-0 border-input rounded-l-md">@</span>
                  <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, ""))} className="h-9 text-sm rounded-l-none" placeholder="yourname" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Headline</Label>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Designer at …" className="h-9 mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-[12px]">Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="h-11 w-full rounded-full text-[14px] sm:h-9 sm:w-auto sm:rounded-md sm:text-[13px]">{saving ? "Saving…" : "Save profile"}</Button>
            </div>
          </form>
        )}

        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Following</h2>
            <span className="text-[12px] text-muted-foreground">· {followed.length}</span>
          </div>
          {followed.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">You're not following any organizations yet.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {followed.map((o) => {
                // Prefer the workspace handle (subdomain) for the public URL —
                // the PublicOrgPage resolves by subdomain first, then slug.
                const handle = o.subdomain || o.slug;
                return (
                  <li key={o.id}>
                    <Link
                      to={`/org/${handle}`}
                      className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-foreground/20 transition-colors"
                    >
                      {o.logo_url ? (
                        <img loading="lazy" decoding="async" src={o.logo_url} alt={o.name} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-semibold">
                          {o.name[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate">{o.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">/{handle}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10" aria-labelledby="your-data-title">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="your-data-title" className="text-base font-semibold">Your data</h2>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Download a copy of the personal data linked to your account — profile, registrations, applications,
              community and webinar activity — as a JSON file.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={downloadMyData} disabled={exporting} className="h-9 text-[13px]">
                <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {exporting ? "Preparing…" : "Download my data"}
              </Button>
              <Link to="/data-deletion" className="text-[13px] text-primary underline-offset-4 hover:underline">
                Request deletion of my data
              </Link>
              <Link to="/privacy" className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
                Privacy policy
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** A settings-style row: icon, label, chevron. */
function ListRow({ to, icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex h-12 items-center gap-3 px-4 text-[15px] transition-colors active:bg-muted hover:bg-muted/50">
      <RowIcon icon={icon} />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
}
